import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds, type SessionUser } from '@/lib/auth'
import { dailyCountdown, dailyLockAt, isoWeekOf, startOfWibDay, weeklyDeadlines } from '@/lib/lock'
import { monthKeyNow } from '@/lib/wib'

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
    select: { id: true, code: true, name: true, phase: true, targetEndDate: true, entity: { select: { name: true } } },
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
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        phase: p.phase,
        targetEndDate: p.targetEndDate,
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
    include: { items: { select: { status: true, evidenceCount: true, needsEscalation: true, priorityId: true } } },
  })

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

  const [entity, projects, dailyToday, divisions, weekly, kpi, lateThisMonth, openEscalations] =
    await Promise.all([
      db.entity.findUnique({ where: { id: entityId }, select: { name: true, code: true, region: true } }),
      db.project.count({ where: { entityId, lifecycle: 'AKTIF' } }),
      db.dailyProjectReport.findMany({ where: { entityId, reportDate: today } }),
      db.division.count({ where: { entityId, isActive: true } }),
      db.weeklyDivisionReport.findMany({ where: { entityId, isoYear, isoWeek } }),
      db.kpiSnapshot.findFirst({
        where: { entityId, periodType: 'BULANAN', periodKey: monthKeyNow() },
      }),
      db.lateIncident.count({ where: { entityId, period: { startsWith: monthKeyNow() } } }),
      db.escalation.count({ where: { entityId, status: { in: ['DIAJUKAN', 'DITINJAU'] } } }),
    ])

  return {
    kind: 'ADMIN' as const,
    entity,
    countdown: dailyCountdown(),
    summary: {
      projects,
      divisions,
      dailyReceived: dailyToday.filter((r) => r.submittedAt).length,
      dailyAwaitingForward: dailyToday.filter((r) => r.submittedAt && !r.forwardedAt).length,
      dailyMissing: projects - dailyToday.filter((r) => r.submittedAt).length,
      weeklyApproved: weekly.filter((w) => w.statusHeader === 'DISETUJUI').length,
      weeklyAwaitingForward: weekly.filter((w) => w.statusHeader === 'DISETUJUI' && !w.forwardedAt).length,
      weeklyDraft: weekly.filter((w) => w.statusHeader === 'DRAFT').length,
      lateThisMonth,
      openEscalations,
      complianceScore: kpi?.complianceScore ?? 0,
      onTimeDailyPct: kpi?.onTimeDailyPct ?? 0,
    },
  }
}

/** Extra panel for the roles that oversee rather than input. */
async function oversightPanel(user: SessionUser) {
  const scopeIds = await scopeEntityIds(user)
  const entityFilter = scopeIds ? { entityId: { in: scopeIds } } : {}

  const [blockedDaily, blockedWeekly, awaitingDecision, staleEscalations] = await Promise.all([
    db.dailyProjectReport.count({
      where: { ...entityFilter, needsEscalation: true, reportDate: { gte: startOfWibDay(new Date()) } },
    }),
    db.weeklyReportItem.count({
      where: {
        needsEscalation: true,
        ...(scopeIds ? { weeklyReport: { entityId: { in: scopeIds } } } : {}),
      },
    }),
    db.escalation.findMany({
      where: { ...entityFilter, status: { in: ['DIAJUKAN', 'DITINJAU'] } },
      include: { entity: { select: { name: true, code: true } } },
      orderBy: { raisedAt: 'asc' },
      take: 6,
    }),
    db.escalation.count({
      where: { ...entityFilter, status: 'DIAJUKAN', raisedAt: { lt: new Date(Date.now() - 7 * 86400000) } },
    }),
  ])

  return {
    blockedDaily,
    blockedWeekly,
    staleEscalations,
    awaitingDecision: awaitingDecision.map((e) => ({
      id: e.id,
      summary: e.summary,
      needed: e.needed,
      status: e.status,
      raisedAt: e.raisedAt,
      ageDays: Math.floor((Date.now() - e.raisedAt.getTime()) / 86400000),
      slaDays: e.slaDays,
      entityName: e.entity.name,
      entityCode: e.entity.code,
    })),
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
    return NextResponse.json({ kind: 'OVERSIGHT' as const, panel: await oversightPanel(user) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal menyusun dashboard'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
