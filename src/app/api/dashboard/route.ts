import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, resolveScopeEntityId } from '@/lib/auth'
import { startOfTodayWIB, endOfTodayWIB, monthKeyNow, ageDays } from '@/lib/wib'

// GET /api/dashboard - aggregated root dashboard for management/holding view
export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  // A scoped role is pinned to its own subtree; the query parameter can only
  // narrow a global role's view, never widen a scoped one's.
  const scopeEntityId = resolveScopeEntityId(user, req.nextUrl.searchParams.get('scopeEntityId'))

  // Build path prefix filter for subtree scoping
  let pathPrefix = ''
  if (scopeEntityId) {
    const scopeEntity = await db.entity.findUnique({ where: { id: scopeEntityId } })
    if (scopeEntity) pathPrefix = scopeEntity.path
  }

  const entityWhere = {
    type: 'PT' as const,
    isActive: true,
    ...(pathPrefix ? { path: { startsWith: pathPrefix } } : {}),
  }
  const reportEntityWhere = pathPrefix ? { entity: { path: { startsWith: pathPrefix } } } : {}
  const escalationEntityWhere = pathPrefix ? { entity: { path: { startsWith: pathPrefix } } } : {}

  const [entities, todayReports, lateToday, pendingEscalations, unlockPending, kpiThisMonth, weeklyPending] =
    await Promise.all([
      db.entity.findMany({
        where: entityWhere,
        select: { id: true, name: true, path: true, region: true, code: true },
      }),
      db.dailyProjectReport.count({
        where: {
          reportDate: { gte: startOfTodayWIB(), lt: endOfTodayWIB() },
          ...reportEntityWhere,
        },
      }),
      db.dailyProjectReport.count({
        where: {
          reportDate: { gte: startOfTodayWIB(), lt: endOfTodayWIB() },
          isLate: true,
          ...reportEntityWhere,
        },
      }),
      db.escalation.findMany({
        where: {
          status: { in: ['DIAJUKAN', 'DITINJAU'] },
          ...escalationEntityWhere,
        },
        include: { entity: { select: { name: true, code: true, region: true } } },
        orderBy: { raisedAt: 'asc' },
        take: 50,
      }),
      db.unlockRequest.count({ where: { status: { in: ['DIAJUKAN', 'DISETUJUI'] } } }),
      db.kpiSnapshot.findMany({
        where: {
          periodType: 'BULANAN',
          periodKey: monthKeyNow(),
          ...(pathPrefix ? { entity: { path: { startsWith: pathPrefix } } } : {}),
        },
      }),
      db.weeklyDivisionReport.count({
        where: {
          statusHeader: { in: ['DRAFT', 'MENUNGGU_PERSETUJUAN'] },
          ...reportEntityWhere,
        },
      }),
    ])

  const lateIncidents = await db.lateIncident.findMany({
    where: {
      occurrenceInMonth: { gte: 3 },
      ...(pathPrefix ? { entityId: { in: entities.map((e) => e.id) } } : {}),
    },
    take: 30,
  })

  const totalEntities = entities.length
  const totalProjects = kpiThisMonth.reduce((s, k) => s + (k.totalProjects || 0), 0)
  const activeProjects = kpiThisMonth.reduce((s, k) => s + (k.activeProjects || 0), 0)
  const reportsToday = kpiThisMonth.reduce((s, k) => s + (k.reportsToday || 0), 0)
  const avgCompliance = kpiThisMonth.length
    ? kpiThisMonth.reduce((s, k) => s + (k.complianceScore || 0), 0) / kpiThisMonth.length
    : 0
  const avgOnTime = kpiThisMonth.length
    ? kpiThisMonth.reduce((s, k) => s + (k.onTimeDailyPct || 0), 0) / kpiThisMonth.length
    : 0
  const avgWeeklyCompleteness = kpiThisMonth.length
    ? kpiThisMonth.reduce((s, k) => s + (k.weeklyCompletenessPct || 0), 0) / kpiThisMonth.length
    : 0
  const avgEvidenceCompleteness = kpiThisMonth.length
    ? kpiThisMonth.reduce((s, k) => s + (k.evidenceCompletenessPct || 0), 0) / kpiThisMonth.length
    : 0
  const avgHighPriorityCompletion = kpiThisMonth.length
    ? kpiThisMonth.reduce((s, k) => s + (k.highPriorityCompletionPct || 0), 0) / kpiThisMonth.length
    : 0

  const attentionEntities = kpiThisMonth
    .filter((k) => (k.complianceScore || 0) < 75)
    .sort((a, b) => (a.complianceScore || 0) - (b.complianceScore || 0))
    .slice(0, 10)
    .map((k) => {
      const e = entities.find((en) => en.id === k.entityId)
      return {
        entityId: k.entityId,
        entityName: e?.name || 'N/A',
        entityCode: e?.code || '',
        region: e?.region || '',
        complianceScore: k.complianceScore,
        onTimeDailyPct: k.onTimeDailyPct,
        weeklyCompletenessPct: k.weeklyCompletenessPct,
        lateToday: k.lateToday,
        pendingReports: k.pendingReports,
      }
    })

  const topPerformers = kpiThisMonth
    .slice()
    .sort((a, b) => (b.complianceScore || 0) - (a.complianceScore || 0))
    .slice(0, 5)
    .map((k) => {
      const e = entities.find((en) => en.id === k.entityId)
      return {
        entityId: k.entityId,
        entityName: e?.name || 'N/A',
        entityCode: e?.code || '',
        region: e?.region || '',
        complianceScore: k.complianceScore,
      }
    })

  const escalationsWithAge = pendingEscalations.map((esc) => ({
    id: esc.id,
    summary: esc.summary,
    status: esc.status,
    needed: esc.needed,
    raisedAt: esc.raisedAt,
    ageDays: ageDays(esc.raisedAt),
    slaDays: esc.slaDays,
    isOverdue: ageDays(esc.raisedAt) > esc.slaDays,
    entityName: esc.entity.name,
    entityCode: esc.entity.code,
    region: esc.entity.region,
  }))

  return NextResponse.json({
    summary: {
      totalEntities,
      totalProjects,
      activeProjects,
      reportsToday,
      lateToday,
      weeklyPending,
      pendingEscalations: pendingEscalations.length,
      pendingUnlocks: unlockPending,
      avgCompliance,
      avgOnTime,
      avgWeeklyCompleteness,
      avgEvidenceCompleteness,
      avgHighPriorityCompletion,
    },
    attentionEntities,
    topPerformers,
    pendingEscalations: escalationsWithAge,
    lateEntitiesThisMonth: lateIncidents.map((li) => {
      const e = entities.find((en) => en.id === li.entityId)
      return {
        id: li.id,
        entityId: li.entityId,
        entityName: e?.name || 'N/A',
        entityCode: e?.code || '',
        region: e?.region || '',
        cycle: li.cycle,
        occurrenceInMonth: li.occurrenceInMonth,
        actionTaken: li.actionTaken,
      }
    }),
  })
}
