import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, resolveScopeEntityId } from '@/lib/auth'
import { lastNMonthKeys } from '@/lib/wib'

// Indonesian short month names
const SHORT_MONTHS_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

function labelFor(periodKey: string): string {
  const [y, m] = periodKey.split('-')
  const mi = parseInt(m, 10) - 1
  return `${SHORT_MONTHS_ID[mi] ?? m} ${y.slice(2)}`
}

// GET /api/kpi-trends - 6-month KPI trend for charts
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    // A scoped role is pinned to its own subtree; the query parameter can only
    // narrow a global role's view, never widen a scoped one's.
    const scopeEntityId = resolveScopeEntityId(user, req.nextUrl.searchParams.get('scopeEntityId'))

    let pathPrefix = ''
    if (scopeEntityId) {
      const scopeEntity = await db.entity.findUnique({ where: { id: scopeEntityId } })
      if (scopeEntity) pathPrefix = scopeEntity.path
    }

    const monthKeys = lastNMonthKeys(6)

    const where = {
      periodType: 'BULANAN' as const,
      periodKey: { in: monthKeys },
      ...(pathPrefix ? { entity: { path: { startsWith: pathPrefix } } } : {}),
    }

    const [snapshots, totals] = await Promise.all([
      db.kpiSnapshot.findMany({ where, select: { periodKey: true, complianceScore: true, onTimeDailyPct: true, weeklyCompletenessPct: true, evidenceCompletenessPct: true, highPriorityCompletionPct: true, entityId: true } }),
      db.kpiSnapshot.groupBy({
        by: ['periodKey'],
        where,
        _count: { entityId: true },
      }),
    ])

    const countByMonth = new Map(totals.map((t) => [t.periodKey, t._count.entityId]))

    const byMonth = new Map<string, typeof snapshots>()
    for (const s of snapshots) {
      const arr = byMonth.get(s.periodKey) ?? []
      arr.push(s)
      byMonth.set(s.periodKey, arr)
    }

    const avg = (arr: typeof snapshots, field: keyof (typeof snapshots)[number]) =>
      arr.length ? arr.reduce((s, k) => s + (Number(k[field]) || 0), 0) / arr.length : 0

    const months = monthKeys.map((periodKey) => {
      const arr = byMonth.get(periodKey) ?? []
      return {
        periodKey,
        label: labelFor(periodKey),
        avgCompliance: Math.round(avg(arr, 'complianceScore') * 100) / 100,
        avgOnTime: Math.round(avg(arr, 'onTimeDailyPct') * 100) / 100,
        avgWeeklyCompleteness: Math.round(avg(arr, 'weeklyCompletenessPct') * 100) / 100,
        avgEvidenceCompleteness: Math.round(avg(arr, 'evidenceCompletenessPct') * 100) / 100,
        avgHighPriorityCompletion: Math.round(avg(arr, 'highPriorityCompletionPct') * 100) / 100,
        totalEntities: countByMonth.get(periodKey) ?? arr.length,
      }
    })

    return NextResponse.json({ months })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
