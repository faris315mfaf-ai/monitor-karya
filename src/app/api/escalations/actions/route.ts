import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { can } from '@/lib/rbac'

/**
 * Acting on escalations, as opposed to listing them.
 *
 *   POST { action: 'raise'  }  — a PIC or head of division escalates a blocked
 *                                task or item upward.
 *   POST { action: 'review' }  — the entity's director acknowledges and starts
 *                                following it up (DIAJUKAN -> DITINJAU).
 *   POST { action: 'decide' }  — Management records the decision.
 *   POST { action: 'close'  }  — the raiser or a director closes a decided one.
 *
 * Every transition is written to the audit trail with its actor.
 */

const NEEDED = new Set(['KEPUTUSAN', 'ANGGARAN', 'DUKUNGAN_LINTAS_FUNGSI'])

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action : ''
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')

  // ---------------------------------------------------------------- raise
  if (action === 'raise') {
    if (!can(user.role, 'escalation:raise')) {
      return NextResponse.json({ error: 'Peran Anda tidak mengajukan eskalasi' }, { status: 403 })
    }

    const sourceType = str('sourceType') // TASK | DAILY_REPORT | WEEKLY_ITEM
    const sourceId = str('sourceId')
    const summary = str('summary')
    const needed = str('needed')

    if (!['TASK', 'DAILY_REPORT', 'WEEKLY_ITEM'].includes(sourceType) || !sourceId) {
      return NextResponse.json({ error: 'Sumber eskalasi tidak valid' }, { status: 400 })
    }
    if (summary.length < 10) {
      return NextResponse.json(
        { error: 'Ringkasan eskalasi minimal 10 karakter agar dapat ditindaklanjuti' },
        { status: 422 }
      )
    }
    if (!NEEDED.has(needed)) {
      return NextResponse.json({ error: 'Jenis kebutuhan wajib dipilih' }, { status: 422 })
    }

    // Resolve the entity from the source, and refuse to raise the same task twice.
    let entityId: string | null = null
    if (sourceType === 'TASK') {
      const task = await db.task.findUnique({
        where: { id: sourceId },
        select: { entityId: true, escalationId: true, project: { select: { picUserId: true } } },
      })
      if (!task) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 })
      if (task.escalationId) {
        return NextResponse.json({ error: 'Task ini sudah dieskalasi' }, { status: 409 })
      }
      entityId = task.entityId
    } else if (sourceType === 'DAILY_REPORT') {
      const r = await db.dailyProjectReport.findUnique({
        where: { id: sourceId },
        select: { entityId: true },
      })
      if (!r) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
      entityId = r.entityId
    } else {
      const item = await db.weeklyReportItem.findUnique({
        where: { id: sourceId },
        select: { weeklyReport: { select: { entityId: true } } },
      })
      if (!item) return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })
      entityId = item.weeklyReport.entityId
    }

    const allowed = await scopeEntityIds(user)
    if (allowed && entityId && !allowed.includes(entityId)) {
      return NextResponse.json({ error: 'Sumber ini di luar cakupan Anda' }, { status: 403 })
    }

    const escalation = await db.escalation.create({
      data: {
        sourceType,
        sourceId,
        entityId: entityId!,
        raisedById: user.id,
        summary,
        needed,
        status: 'DIAJUKAN',
        slaDays: 7,
      },
    })

    if (sourceType === 'TASK') {
      await db.task.update({ where: { id: sourceId }, data: { escalationId: escalation.id } })
    }

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CREATE_ESCALATION',
        targetType: 'ESCALATION',
        targetId: escalation.id,
        afterData: JSON.stringify({ sourceType, sourceId, needed, summary }),
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      },
    })

    return NextResponse.json({ ok: true, escalation })
  }

  // ------------------------------------------------- review / decide / close
  const id = str('id')
  if (!id) return NextResponse.json({ error: 'Id eskalasi wajib diisi' }, { status: 400 })

  const escalation = await db.escalation.findUnique({ where: { id } })
  if (!escalation) return NextResponse.json({ error: 'Eskalasi tidak ditemukan' }, { status: 404 })

  const allowed = await scopeEntityIds(user)
  if (allowed && !allowed.includes(escalation.entityId)) {
    return NextResponse.json({ error: 'Eskalasi ini di luar cakupan Anda' }, { status: 403 })
  }

  if (action === 'review') {
    if (!can(user.role, 'escalation:followup')) {
      return NextResponse.json({ error: 'Peran Anda tidak meninjau eskalasi' }, { status: 403 })
    }
    if (escalation.status !== 'DIAJUKAN') {
      return NextResponse.json({ error: 'Eskalasi ini sudah melewati tahap peninjauan' }, { status: 409 })
    }

    const updated = await db.escalation.update({ where: { id }, data: { status: 'DITINJAU' } })
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'REVIEW_ESCALATION',
        targetType: 'ESCALATION',
        targetId: id,
        beforeData: JSON.stringify({ status: escalation.status }),
        afterData: JSON.stringify({ status: updated.status }),
      },
    })
    return NextResponse.json({ ok: true, escalation: updated })
  }

  if (action === 'decide') {
    if (!can(user.role, 'escalation:decide')) {
      return NextResponse.json(
        { error: 'Hanya Manajemen yang memutuskan eskalasi' },
        { status: 403 }
      )
    }
    if (escalation.status === 'DITUTUP') {
      return NextResponse.json({ error: 'Eskalasi ini sudah ditutup' }, { status: 409 })
    }

    const decisionText = str('decisionText')
    if (decisionText.length < 10) {
      return NextResponse.json(
        { error: 'Isi keputusan minimal 10 karakter agar jelas bagi pelaksana' },
        { status: 422 }
      )
    }

    const updated = await db.escalation.update({
      where: { id },
      data: { status: 'DIPUTUSKAN', decidedById: user.id, decidedAt: new Date(), decisionText },
    })
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'DECIDE_ESCALATION',
        targetType: 'ESCALATION',
        targetId: id,
        beforeData: JSON.stringify({ status: escalation.status }),
        afterData: JSON.stringify({ status: updated.status, decisionText }),
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      },
    })
    return NextResponse.json({ ok: true, escalation: updated })
  }

  if (action === 'close') {
    const mayClose =
      can(user.role, 'escalation:decide') ||
      can(user.role, 'escalation:followup') ||
      escalation.raisedById === user.id
    if (!mayClose) {
      return NextResponse.json({ error: 'Peran Anda tidak menutup eskalasi' }, { status: 403 })
    }
    if (escalation.status !== 'DIPUTUSKAN') {
      return NextResponse.json(
        { error: 'Eskalasi hanya dapat ditutup setelah ada keputusan' },
        { status: 409 }
      )
    }

    const updated = await db.escalation.update({ where: { id }, data: { status: 'DITUTUP' } })
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CLOSE_ESCALATION',
        targetType: 'ESCALATION',
        targetId: id,
        beforeData: JSON.stringify({ status: escalation.status }),
        afterData: JSON.stringify({ status: updated.status }),
      },
    })
    return NextResponse.json({ ok: true, escalation: updated })
  }

  return NextResponse.json({ error: 'Aksi tidak dikenali' }, { status: 400 })
}
