import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopePathPrefix, isGlobalRole } from '@/lib/auth'
import { monthKeyNow } from '@/lib/wib'

// GET /api/entities - full entity tree (HOLDING -> SUB_HOLDING -> SECTOR -> REGION -> PT).
// For type='PT', include the current month's KPI snapshot summary.
export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const periodKey = monthKeyNow()

    // A scoped role only sees its own entity and everything under it; the tree
    // is then rooted at that entity instead of at the holding.
    const scoped = !isGlobalRole(user.role) && user.scopeEntityId ? user.scopeEntityId : null
    const prefix = scoped ? await scopePathPrefix(scoped) : null

    const [entities, kpis] = await Promise.all([
      db.entity.findMany({
        where: {
          isActive: true,
          type: { in: ['HOLDING', 'SUB_HOLDING', 'SECTOR', 'REGION', 'PT'] },
          ...(prefix ? { path: { startsWith: prefix } } : {}),
        },
        select: { id: true, name: true, code: true, type: true, region: true, parentId: true },
        orderBy: { code: 'asc' },
      }),
      db.kpiSnapshot.findMany({
        where: {
          periodType: 'BULANAN',
          periodKey,
          ...(prefix ? { entity: { path: { startsWith: prefix } } } : {}),
        },
        select: {
          entityId: true,
          complianceScore: true,
          onTimeDailyPct: true,
          weeklyCompletenessPct: true,
          lateToday: true,
          pendingReports: true,
        },
      }),
    ])

    const kpiByEntity = new Map(kpis.map((k) => [k.entityId, k]))

    // Ids present in the result set — used to find the roots of a scoped tree.
    const present = new Set(entities.map((e) => e.id))

    const buildTree = (parentId: string | null) => {
      const children = entities
        .filter((e) =>
          parentId === null ? e.parentId === null || !present.has(e.parentId) : e.parentId === parentId
        )
        .sort((a, b) => a.code.localeCompare(b.code))
      return children.map((e) => {
        const base: Record<string, unknown> = {
          id: e.id,
          name: e.name,
          code: e.code,
          type: e.type,
          region: e.region,
        }
        if (e.type === 'PT') {
          const k = kpiByEntity.get(e.id)
          base.kpi = k
            ? {
                complianceScore: k.complianceScore,
                onTimeDailyPct: k.onTimeDailyPct,
                weeklyCompletenessPct: k.weeklyCompletenessPct,
                lateToday: k.lateToday,
                pendingReports: k.pendingReports,
              }
            : null
        }
        base.children = buildTree(e.id)
        return base
      })
    }

    const tree = buildTree(null)

    return NextResponse.json({ tree, periodKey })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
