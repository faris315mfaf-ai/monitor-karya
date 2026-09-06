import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import {
  dailyCountdown,
  dailyLockAt,
  isDailyLocked,
  isoWeekOf,
  startOfWibDay,
  weeklyDeadlines,
} from '@/lib/lock'

/**
 * Admin PT's receiving desk: what came in from the PICs and the heads of
 * division, and what still has to be passed upward before the cutoff.
 *
 *   GET  — both streams for the current day / week, with their hand-off state.
 *   POST — forward one daily report or one weekly bundle to the holding.
 */

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'daily:forward') && !can(user.role, 'weekly:forward')) {
    return NextResponse.json({ error: 'Peran Anda tidak menerima penerusan' }, { status: 403 })
  }
  // Admin PT is pinned to one PT. TI, the master account, has no entity and
  // sees every PT's queue at once.
  if (!user.scopeEntityId && user.role !== 'TI') {
    return NextResponse.json({ error: 'Peran ini tidak terikat pada satu entitas' }, { status: 400 })
  }

  const entityWhere = user.scopeEntityId ? { entityId: user.scopeEntityId } : {}
  const today = startOfWibDay(new Date())
  const { isoYear, isoWeek } = isoWeekOf(new Date())
  const deadlines = weeklyDeadlines(new Date())

  const [projects, reports, divisions, weekly] = await Promise.all([
    db.project.findMany({
      where: { ...entityWhere, lifecycle: 'AKTIF' },
      select: { id: true, code: true, name: true, picUser: { select: { name: true } } },
      orderBy: { code: 'asc' },
    }),
    db.dailyProjectReport.findMany({
      where: { ...entityWhere, reportDate: today },
      include: { submittedBy: { select: { name: true } } },
    }),
    db.division.findMany({
      where: { ...entityWhere, isActive: true },
      select: { id: true, name: true, headUser: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    db.weeklyDivisionReport.findMany({
      where: { ...entityWhere, isoYear, isoWeek },
      include: { items: { select: { id: true, status: true } } },
    }),
  ])

  const reportByProject = new Map(reports.map((r) => [r.projectId, r]))
  const weeklyByDivision = new Map(weekly.map((w) => [w.divisionId, w]))

  return NextResponse.json({
    reportDate: today.toISOString(),
    dailyLockAt: dailyLockAt(today).toISOString(),
    dailyCountdown: dailyCountdown(),
    dailyLocked: isDailyLocked(today),
    week: { isoYear, isoWeek, handoverBy: deadlines.handoverBy.toISOString(), lockAt: deadlines.lockAt.toISOString() },
    daily: projects.map((p) => {
      const r = reportByProject.get(p.id)
      return {
        projectId: p.id,
        code: p.code,
        name: p.name,
        picName: p.picUser?.name ?? null,
        reportId: r?.id ?? null,
        status: r?.status ?? null,
        progressPct: r?.progressPct ?? null,
        evidenceCount: r?.evidenceCount ?? 0,
        submittedAt: r?.submittedAt ?? null,
        submittedBy: r?.submittedBy?.name ?? null,
        forwardedAt: r?.forwardedAt ?? null,
        // Ready to pass on once the PIC has actually submitted it.
        readyToForward: Boolean(r?.submittedAt) && !r?.forwardedAt,
      }
    }),
    weekly: divisions.map((d) => {
      const w = weeklyByDivision.get(d.id)
      return {
        divisionId: d.id,
        name: d.name,
        headName: d.headUser?.name ?? null,
        reportId: w?.id ?? null,
        statusHeader: w?.statusHeader ?? null,
        itemCount: w?.items.length ?? 0,
        submittedAt: w?.submittedAt ?? null,
        approvedAt: w?.approvedAt ?? null,
        forwardedAt: w?.forwardedAt ?? null,
        readyToForward: w?.statusHeader === 'DISETUJUI' && !w?.forwardedAt,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const kind = body.kind === 'weekly' ? 'weekly' : 'daily'
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'Id laporan wajib diisi' }, { status: 400 })

  if (kind === 'daily') {
    if (!can(user.role, 'daily:forward')) {
      return NextResponse.json({ error: 'Peran Anda tidak meneruskan laporan harian' }, { status: 403 })
    }
    const report = await db.dailyProjectReport.findUnique({ where: { id } })
    if (!report) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
    if (user.scopeEntityId && report.entityId !== user.scopeEntityId) {
      return NextResponse.json({ error: 'Laporan ini di luar entitas Anda' }, { status: 403 })
    }
    if (!report.submittedAt) {
      return NextResponse.json({ error: 'PIC belum mengirimkan laporan ini' }, { status: 422 })
    }
    if (report.forwardedAt) {
      return NextResponse.json({ error: 'Laporan ini sudah diteruskan' }, { status: 409 })
    }

    await db.dailyProjectReport.update({
      where: { id },
      data: { forwardedById: user.id, forwardedAt: new Date() },
    })
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'FORWARD_DAILY_REPORT',
        targetType: 'DAILY_REPORT',
        targetId: id,
        afterData: JSON.stringify({ forwardedAt: new Date().toISOString() }),
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      },
    })
    return NextResponse.json({ ok: true })
  }

  if (!can(user.role, 'weekly:forward')) {
    return NextResponse.json({ error: 'Peran Anda tidak meneruskan laporan mingguan' }, { status: 403 })
  }
  const report = await db.weeklyDivisionReport.findUnique({ where: { id } })
  if (!report) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
  if (user.scopeEntityId && report.entityId !== user.scopeEntityId) {
    return NextResponse.json({ error: 'Laporan ini di luar entitas Anda' }, { status: 403 })
  }
  if (report.statusHeader !== 'DISETUJUI') {
    return NextResponse.json(
      { error: 'Kepala divisi belum menyetujui laporan ini' },
      { status: 422 }
    )
  }
  if (report.forwardedAt) {
    return NextResponse.json({ error: 'Laporan ini sudah diteruskan' }, { status: 409 })
  }

  await db.weeklyDivisionReport.update({
    where: { id },
    data: { forwardedById: user.id, forwardedAt: new Date() },
  })
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'FORWARD_WEEKLY_REPORT',
      targetType: 'WEEKLY_REPORT',
      targetId: id,
      afterData: JSON.stringify({ forwardedAt: new Date().toISOString() }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })
  return NextResponse.json({ ok: true })
}
