import { clientIp } from '@/lib/security'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { escalationSnap, issueUndo, type UndoAction } from '@/lib/undo' // [F2-URUNGKAN]

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

/** [F2-URUNGKAN] Tiket urungkan untuk tinjau/putuskan/tutup: keadaan sebelum + sidik sesudah. */
type EscRow = { id: string; entityId: string; status: string; decidedById: string | null; decidedAt: Date | null; decisionText: string | null; updatedAt: Date }
function undoFor(action: UndoAction, actorId: string, before: EscRow, after: EscRow) {
  return issueUndo({
    action,
    targetType: 'ESCALATION',
    targetId: before.id,
    entityId: before.entityId,
    actorId,
    snapshot: escalationSnap(before),
    stamp: { status: after.status, updatedAt: after.updatedAt.toISOString() },
  })
}

/**
 * [T11-DB] Ubah status eskalasi + catat audit dalam satu transaksi. Pembaruan
 * bersyarat pada status yang tadi dibaca (`from`): bila aksi lain sudah mengubahnya
 * (tinjau vs putuskan bersamaan), P2025 → null → pemanggil membalas 409 dan tidak
 * ada keputusan yang tertimpa.
 */
async function ubahStatus(
  id: string,
  from: string,
  data: Record<string, unknown>,
  audit: (updated: EscRow) => { action: string; beforeData: string; afterData: string; ip?: string | null },
  actorId: string
): Promise<EscRow | null> {
  try {
    return await db.$transaction(async (tx) => {
      const updated = (await tx.escalation.update({ where: { id, status: from }, data })) as EscRow
      await tx.auditLog.create({
        data: { actorId, targetType: 'ESCALATION', targetId: id, ...audit(updated) },
      })
      return updated
    })
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 'P2025') return null
    throw err
  }
}
const SUDAH_BERUBAH = { error: 'Eskalasi ini baru saja diubah pihak lain. Muat ulang lalu coba lagi.' }

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
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, 4000) : '')

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

    // Resolve the entity and the responsible person from the source. A PIC may
    // only raise their own project's work and a head of division only their own
    // division's — being in the same PT is not enough.
    let entityId: string | null = null
    let ownerId: string | null = null
    if (sourceType === 'TASK') {
      const task = await db.task.findUnique({
        where: { id: sourceId },
        select: { entityId: true, escalationId: true, project: { select: { picUserId: true } } },
      })
      if (!task) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 })
      // [T12] Tautan balik hanya menghalangi selama eskalasinya belum DITUTUP. Dulu
      // `escalationId` yang tertinggal membuat task tak bisa dieskalasi lagi selamanya,
      // padahal laporan harian/butir mingguan boleh diajukan ulang sesudah ditutup.
      if (task.escalationId) {
        const linked = await db.escalation.findUnique({ where: { id: task.escalationId }, select: { status: true } })
        if (linked && linked.status !== 'DITUTUP') {
          return NextResponse.json({ error: 'Task ini sudah dieskalasi' }, { status: 409 })
        }
      }
      entityId = task.entityId
      ownerId = task.project.picUserId
    } else if (sourceType === 'DAILY_REPORT') {
      const r = await db.dailyProjectReport.findUnique({
        where: { id: sourceId },
        select: { entityId: true, project: { select: { picUserId: true } } },
      })
      if (!r) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
      entityId = r.entityId
      ownerId = r.project.picUserId
    } else {
      const item = await db.weeklyReportItem.findUnique({
        where: { id: sourceId },
        select: { weeklyReport: { select: { entityId: true, division: { select: { headUserId: true } } } } },
      })
      if (!item) return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })
      entityId = item.weeklyReport.entityId
      ownerId = item.weeklyReport.division.headUserId
    }

    if (
      (user.role === 'PIC_PROYEK' || user.role === 'KEPALA_DIVISI') &&
      ownerId !== user.id
    ) {
      return NextResponse.json({ error: 'Sumber ini bukan tanggung jawab Anda' }, { status: 403 })
    }

    const allowed = await scopeEntityIds(user)
    if (allowed && entityId && !allowed.includes(entityId)) {
      return NextResponse.json({ error: 'Sumber ini di luar cakupan Anda' }, { status: 403 })
    }

    // [T11-DB] Cek "belum ada eskalasi berjalan", pembuatan, back-link task, dan audit
    // satu transaksi. Baris sumber dikunci FOR UPDATE supaya dua pengajuan bersamaan
    // untuk sumber yang sama berurutan (yang kedua melihat eskalasi pertama → 409).
    const escalation = await db.$transaction(async (tx) => {
      if (sourceType === 'TASK') {
        await tx.$queryRaw`SELECT "id" FROM "Task" WHERE "id" = ${sourceId} FOR UPDATE`
      } else if (sourceType === 'DAILY_REPORT') {
        await tx.$queryRaw`SELECT "id" FROM "DailyProjectReport" WHERE "id" = ${sourceId} FOR UPDATE`
      } else {
        await tx.$queryRaw`SELECT "id" FROM "WeeklyReportItem" WHERE "id" = ${sourceId} FOR UPDATE`
      }
      // The task table carries its own escalationId; the other two sources are
      // checked here so a report cannot be escalated twice while one is open.
      const open = await tx.escalation.findFirst({
        where: { sourceType, sourceId, status: { in: ['DIAJUKAN', 'DITINJAU', 'DIPUTUSKAN'] } },
        select: { id: true },
      })
      if (open) return null

      const created = await tx.escalation.create({
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
        await tx.task.update({ where: { id: sourceId }, data: { escalationId: created.id } })
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CREATE_ESCALATION',
          targetType: 'ESCALATION',
          targetId: created.id,
          afterData: JSON.stringify({ sourceType, sourceId, needed, summary }),
          ip: clientIp(req),
        },
      })
      return created
    })
    if (!escalation) {
      return NextResponse.json({ error: 'Sumber ini sudah memiliki eskalasi yang masih berjalan' }, { status: 409 })
    }

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

    const updated = await ubahStatus(
      id,
      escalation.status,
      { status: 'DITINJAU' },
      (u) => ({
        action: 'REVIEW_ESCALATION',
        beforeData: JSON.stringify({ status: escalation.status }),
        afterData: JSON.stringify({ status: u.status }),
      }),
      user.id
    )
    if (!updated) return NextResponse.json(SUDAH_BERUBAH, { status: 409 })
    const undoToken = await undoFor('REVIEW_ESCALATION', user.id, escalation, updated)
    return NextResponse.json({ ok: true, escalation: updated, undoToken })
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
    // [T12] Keputusan hanya satu kali (DIAJUKAN/DITINJAU -> DIPUTUSKAN), sama dengan
    // layar eskalasi yang menyembunyikan tombolnya. Dulu panggilan langsung boleh
    // memutuskan ulang dan menimpa keputusan + pemutus sebelumnya, sementara audit
    // hanya mencatat status (isi keputusan lama hilang tanpa jejak).
    if (escalation.status === 'DIPUTUSKAN') {
      return NextResponse.json({ error: 'Eskalasi ini sudah diputuskan. Tutup eskalasi bila sudah selesai.' }, { status: 409 })
    }

    const decisionText = str('decisionText')
    if (decisionText.length < 10) {
      return NextResponse.json(
        { error: 'Isi keputusan minimal 10 karakter agar jelas bagi pelaksana' },
        { status: 422 }
      )
    }

    const updated = await ubahStatus(
      id,
      escalation.status,
      { status: 'DIPUTUSKAN', decidedById: user.id, decidedAt: new Date(), decisionText },
      (u) => ({
        action: 'DECIDE_ESCALATION',
        beforeData: JSON.stringify({ status: escalation.status }),
        afterData: JSON.stringify({ status: u.status, decisionText }),
        ip: clientIp(req),
      }),
      user.id
    )
    if (!updated) return NextResponse.json(SUDAH_BERUBAH, { status: 409 })
    const undoToken = await undoFor('DECIDE_ESCALATION', user.id, escalation, updated)
    return NextResponse.json({ ok: true, escalation: updated, undoToken })
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

    const updated = await ubahStatus(
      id,
      escalation.status,
      { status: 'DITUTUP' },
      (u) => ({
        action: 'CLOSE_ESCALATION',
        beforeData: JSON.stringify({ status: escalation.status }),
        afterData: JSON.stringify({ status: u.status }),
      }),
      user.id
    )
    if (!updated) return NextResponse.json(SUDAH_BERUBAH, { status: 409 })
    const undoToken = await undoFor('CLOSE_ESCALATION', user.id, escalation, updated)
    return NextResponse.json({ ok: true, escalation: updated, undoToken })
  }

  return NextResponse.json({ error: 'Aksi tidak dikenali' }, { status: 400 })
}
