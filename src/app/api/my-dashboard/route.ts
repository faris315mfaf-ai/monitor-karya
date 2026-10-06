import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds, type SessionUser } from '@/lib/auth'
import { dailyCountdown, dailyLockAt, isoWeekOf, isoWeekStart as isoWeekStartOf, startOfWibDay, weeklyDeadlines } from '@/lib/lock'
import { monthKeyNow } from '@/lib/wib'
import { deriveProjectStatus } from '@/lib/project-status'
import { countDailyIntake } from '@/lib/daily-intake'

/**
 * The dashboard each role actually needs.
 *
 * A PIC wants to know which of their projects still owe a report today; a head
 * of division wants this week's items; an Admin PT wants what is waiting to be
 * forwarded. Oversight roles keep the aggregate dashboard and get a panel of
 * the decisions that are theirs to make.
 */

const LAST_7_DAYS = 7

async function picDashboard(user: SessionUser) {
  const today = startOfWibDay(new Date())
  const since = new Date(today.getTime() - LAST_7_DAYS * 86400000)

  const projects = await db.project.findMany({
    where: { picUserId: user.id, lifecycle: 'AKTIF' },
    select: {
      id: true, code: true, name: true, phase: true, lifecycle: true, startDate: true, targetEndDate: true,
      entity: { select: { name: true } },
      dailyReports: {
        orderBy: { reportDate: 'desc' },
        take: 10,
        select: {
          reportDate: true, status: true, progressPct: true, obstacle: true, followUp: true, achievementToday: true,
          needsEscalation: true, submittedAt: true, forwardedAt: true, isLate: true,
        },
      },
    },
    orderBy: { code: 'asc' },
  })
  const ids = projects.map((p) => p.id)

  const [todayReports, recent] = await Promise.all([
    db.dailyProjectReport.findMany({ where: { projectId: { in: ids }, reportDate: today } }),
    db.dailyProjectReport.findMany({
      where: { projectId: { in: ids }, reportDate: { gte: since } },
      select: { reportDate: true, submittedAt: true, isLate: true, status: true },
    }),
  ])

  const byProject = new Map(todayReports.map((r) => [r.projectId, r]))
  const submitted = todayReports.filter((r) => r.submittedAt).length
  const blocked = todayReports.filter((r) => r.needsEscalation).length

  // On-time rate across the last working week.
  const onTime = recent.filter((r) => r.submittedAt && !r.isLate).length
  const onTimePct = recent.length ? (onTime / recent.length) * 100 : 0

  return {
    kind: 'PIC' as const,
    countdown: dailyCountdown(),
    lockAt: dailyLockAt(new Date()).toISOString(),
    summary: {
      projects: projects.length,
      submitted,
      outstanding: projects.length - submitted,
      blocked,
      onTimePct,
    },
    projects: projects.map((p) => {
      const r = byProject.get(p.id)
      const last = p.dailyReports[0] ?? null
      const derived = deriveProjectStatus(p, last, new Date())
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        phase: p.phase,
        startDate: p.startDate,
        targetEndDate: p.targetEndDate,
        derivedStatus: derived.status,
        reason: derived.reason,
        latestProgress: derived.progress,
        latest: last
          ? { reportDate: last.reportDate, achievementToday: last.achievementToday, obstacle: last.obstacle, followUp: last.followUp }
          : null,
        history: p.dailyReports
          .slice()
          .reverse()
          .map((h) => ({
            reportDate: h.reportDate,
            status: h.status,
            progressPct: h.progressPct,
            submitted: Boolean(h.submittedAt),
            forwarded: Boolean(h.forwardedAt),
            isLate: h.isLate,
          })),
        entityName: p.entity.name,
        status: r?.status ?? null,
        progressPct: r?.progressPct ?? null,
        evidenceCount: r?.evidenceCount ?? 0,
        submitted: Boolean(r?.submittedAt),
        forwarded: Boolean(r?.forwardedAt),
        needsEscalation: Boolean(r?.needsEscalation),
      }
    }),
  }
}

async function kadivDashboard(user: SessionUser) {
  const now = new Date()
  const { isoYear, isoWeek } = isoWeekOf(now)
  const deadlines = weeklyDeadlines(now)

  const divisions = await db.division.findMany({
    where: { headUserId: user.id, isActive: true },
    select: { id: true, name: true },
  })
  const ids = divisions.map((d) => d.id)

  const reports = await db.weeklyDivisionReport.findMany({
    where: { divisionId: { in: ids }, isoYear, isoWeek },
    include: {
      items: {
        select: {
          id: true, workItem: true, picName: true, targetDate: true, progressPct: true,
          status: true, evidenceCount: true, needsEscalation: true, priorityId: true,
          priority: { select: { code: true } },
        },
        orderBy: { position: 'asc' },
      },
    },
  })

  // Riwayat 8 minggu: item selesai dibanding seluruh item per minggu.
  const histFrom = new Date(isoWeekStartOf(now).getTime() - 7 * 7 * 86400000)
  const history = await db.weeklyDivisionReport.findMany({
    where: { divisionId: { in: ids }, periodStart: { gte: histFrom } },
    select: { isoWeek: true, periodStart: true, items: { select: { status: true } } },
    orderBy: { periodStart: 'asc' },
  })
  const histByWeek = new Map<number, { done: number; total: number }>()
  for (const h of history) {
    const cur = histByWeek.get(h.isoWeek) ?? { done: 0, total: 0 }
    cur.total += h.items.filter((i) => i.status !== 'NA').length
    cur.done += h.items.filter((i) => i.status === 'SELESAI').length
    histByWeek.set(h.isoWeek, cur)
  }

  const items = reports.flatMap((r) => r.items)
    const byStatus = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1
    return acc
  }, {})
  const missingEvidence = items.filter(
    (i) => i.evidenceCount === 0 && !['BELUM_MULAI', 'NA'].includes(i.status)
  ).length

  const msLeft = deadlines.handoverBy.getTime() - now.getTime()

  return {
    kind: 'KADIV' as const,
    week: { isoYear, isoWeek, handoverBy: deadlines.handoverBy.toISOString(), lockAt: deadlines.lockAt.toISOString() },
    handoverHoursLeft: msLeft > 0 ? Math.floor(msLeft / 3600000) : 0,
    handoverPassed: msLeft <= 0,
    summary: {
      divisions: divisions.length,
      items: items.length,
      done: byStatus.SELESAI ?? 0,
      blocked: byStatus.TERKENDALA ?? 0,
      missingEvidence,
      needsEscalation: items.filter((i) => i.needsEscalation).length,
    },
    byStatus,
    history: Array.from({ length: 8 }, (_, i) => {
      const wk = isoWeekOf(new Date(histFrom.getTime() + i * 7 * 86400000)).isoWeek
      const h = histByWeek.get(wk) ?? { done: 0, total: 0 }
      return { label: 'M' + wk, done: h.done, total: h.total }
    }),
    items: items
      .map((i) => ({
        id: i.id,
        workItem: i.workItem,
        picName: i.picName,
        targetDate: i.targetDate,
        progressPct: i.progressPct,
        status: i.status,
        priority: i.priority?.code ?? null,
        needsEscalation: i.needsEscalation,
        evidenceCount: i.evidenceCount,
      }))
      .slice(0, 40),
    divisions: divisions.map((d) => {
      const r = reports.find((x) => x.divisionId === d.id)
      return {
        id: d.id,
        name: d.name,
        statusHeader: r?.statusHeader ?? 'DRAFT',
        itemCount: r?.items.length ?? 0,
        submitted: Boolean(r?.submittedAt),
        approved: Boolean(r?.approvedAt),
        forwarded: Boolean(r?.forwardedAt),
      }
    }),
  }
}

async function adminDashboard(user: SessionUser) {
  const entityId = user.scopeEntityId!
  const today = startOfWibDay(new Date())
  const { isoYear, isoWeek } = isoWeekOf(new Date())

  const heatFrom = new Date(today.getTime() - 20 * 86400000)
  const [entity, projectList, dailyToday, divisionList, weekly, kpi, lateThisMonth, openEscalations, recentDaily] =
    await Promise.all([
      db.entity.findUnique({ where: { id: entityId }, select: { name: true, code: true, region: true } }),
      db.project.findMany({
        where: { entityId, lifecycle: 'AKTIF' },
        select: { id: true, name: true, picName: true, picUser: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      db.dailyProjectReport.findMany({ where: { entityId, reportDate: today } }),
      db.division.findMany({
        where: { entityId, isActive: true },
        select: { id: true, name: true, headUser: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      db.weeklyDivisionReport.findMany({ where: { entityId, isoYear, isoWeek } }),
      db.kpiSnapshot.findFirst({
        where: { entityId, periodType: 'BULANAN', periodKey: monthKeyNow() },
      }),
      db.lateIncident.count({ where: { entityId, period: { startsWith: monthKeyNow() } } }),
      db.escalation.count({ where: { entityId, status: { in: ['DIAJUKAN', 'DITINJAU'] } } }),
      db.dailyProjectReport.findMany({
        where: { entityId, reportDate: { gte: heatFrom } },
        select: { reportDate: true, submittedAt: true, isLate: true },
      }),
    ])
  const projects = projectList.length
  const divisions = divisionList.length
  // Sumber yang sama dengan Meja kerja & Penerimaan: hanya proyek aktif.
  const intake = countDailyIntake(projectList.map((p) => p.id), dailyToday)
  const submittedIds = intake.receivedIds

  // 10 hari kerja terakhir: berapa laporan masuk dibanding proyek aktif.
  const days: { date: string; submitted: number; onTime: number }[] = []
  for (let t = today.getTime(); days.length < 10 && t >= heatFrom.getTime(); t -= 86400000) {
    const d = new Date(t)
    const dow = new Date(t + 7 * 3600000).getUTCDay()
    if (dow === 0 || dow === 6) continue
    const mine = recentDaily.filter((r) => r.reportDate.getTime() === t)
    days.unshift({
      date: d.toISOString(),
      submitted: mine.filter((r) => r.submittedAt).length,
      onTime: mine.filter((r) => r.submittedAt && !r.isLate).length,
    })
  }

  return {
    kind: 'ADMIN' as const,
    entity,
    countdown: dailyCountdown(),
    summary: {
      projects,
      divisions,
      dailyReceived: intake.received,
      dailyAwaitingForward: intake.awaitingForward,
      dailyMissing: intake.missing,
      weeklyApproved: weekly.filter((w) => w.statusHeader === 'DISETUJUI').length,
      weeklyAwaitingForward: weekly.filter((w) => w.statusHeader === 'DISETUJUI' && !w.forwardedAt).length,
      weeklyDraft: weekly.filter((w) => w.statusHeader === 'DRAFT').length,
      lateThisMonth,
      openEscalations,
      complianceScore: kpi?.complianceScore ?? 0,
      onTimeDailyPct: kpi?.onTimeDailyPct ?? 0,
    },
    missing: projectList
      .filter((p) => !submittedIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, pic: p.picUser?.name ?? p.picName ?? null })),
    divisionsWeekly: divisionList.map((d) => {
      const w = weekly.find((x) => x.divisionId === d.id)
      return {
        id: d.id,
        name: d.name,
        head: d.headUser?.name ?? null,
        statusHeader: w?.statusHeader ?? null,
        submittedAt: w?.submittedAt ?? null,
        forwardedAt: w?.forwardedAt ?? null,
      }
    }),
    days,
  }
}

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  try {
    if (user.role === 'PIC_PROYEK') {
      return NextResponse.json(await picDashboard(user))
    }
    if (user.role === 'KEPALA_DIVISI') {
      return NextResponse.json(await kadivDashboard(user))
    }
    if (user.role === 'ADMIN_PT' && user.scopeEntityId) {
      return NextResponse.json(await adminDashboard(user))
    }
    // Peran pemantau memakai /api/ringkasan.
    return NextResponse.json({ kind: 'OVERSIGHT' as const })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal menyusun dashboard'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
