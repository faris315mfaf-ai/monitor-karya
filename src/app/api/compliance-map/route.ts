import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refuseUnscoped, requireApiUser, resolveScopeEntityId } from '@/lib/auth'
import { monthKeyNow } from '@/lib/wib'

// GET /api/compliance-map - hierarchical treemap data for compliance heatmap
// Groups: subHoldings > sectors > regions > PTs.
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const unscoped = refuseUnscoped(user)
    if (unscoped) return unscoped
    // A scoped role is pinned to its own subtree; the query parameter can only
    // narrow a global role's view, never widen a scoped one's.
    const scopeEntityId = resolveScopeEntityId(user, req.nextUrl.searchParams.get('scopeEntityId'))

    // Build path prefix filter for subtree scoping
    let pathPrefix = ''
    if (scopeEntityId) {
      const scopeEntity = await db.entity.findUnique({ where: { id: scopeEntityId } })
      if (scopeEntity) pathPrefix = scopeEntity.path
    }

    const periodKey = monthKeyNow()

    // Fetch all entities of relevant types under the path prefix
    const entities = await db.entity.findMany({
      where: {
        type: { in: ['SUB_HOLDING', 'SECTOR', 'REGION', 'PT'] },
        isActive: true,
        ...(pathPrefix ? { path: { startsWith: pathPrefix } } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        path: true,
        parentId: true,
        region: true,
      },
      orderBy: { code: 'asc' },
    })

    const entityIds = entities.map((e) => e.id)
    const kpis = entityIds.length
      ? await db.kpiSnapshot.findMany({
          where: {
            periodType: 'BULANAN',
            periodKey,
            entityId: { in: entityIds },
          },
        })
      : []

    const kpiByEntity = new Map(kpis.map((k) => [k.entityId, k]))

    const computeAvg = (list: { entityId: string }[]) => {
      const ks = list.map((x) => kpiByEntity.get(x.entityId)).filter(Boolean) as Array<{
        complianceScore: number
      }>
      return ks.length
        ? Math.round(ks.reduce((s, k) => s + (k.complianceScore || 0), 0) / ks.length * 100) / 100
        : 0
    }

    // Helper: recursively build children of a given type for a parent
    // Types are layered: SUB_HOLDING -> SECTOR -> REGION -> PT
    const typeOrder: Record<string, string> = {
      SUB_HOLDING: 'SECTOR',
      SECTOR: 'REGION',
      REGION: 'PT',
    }

    // Anak langsung dari sebuah induk, apa pun tipenya — struktur datar
    // (holding -> PT) maupun berjenjang (sub-holding -> sektor -> wilayah -> PT)
    // sama-sama terbaca.
    const buildNode = (parentId: string | null, _type: string) => {
      const children = entities.filter((e) =>
        parentId === null ? e.parentId === null : e.parentId === parentId,
      )
      return children.map((e) => {
        const kpi = kpiByEntity.get(e.id)
        const childNodes = e.type === 'PT' ? [] : buildNode(e.id, typeOrder[e.type] ?? 'PT')
        // collect all PTs beneath (or self if PT)
        const ptIds = e.type === 'PT' ? [e.id] : collectPTs(e.id)
        const entityCount = ptIds.length
        const ptEntitiesForAvg = ptIds.map((id) => ({ entityId: id }))
        const avgComplianceScore = computeAvg(ptEntitiesForAvg)
        return {
          id: e.id,
          name: e.name,
          code: e.code,
          region: e.region,
          complianceScore: kpi?.complianceScore ?? 0,
          entityCount,
          avgComplianceScore,
          children: childNodes,
        }
      })
    }

    // Map of entity -> descendant PTs (by traversing path)
    const ptByAncestor = new Map<string, string[]>()
    const collectPTs = (ancestorId: string): string[] => {
      const cached = ptByAncestor.get(ancestorId)
      if (cached) return cached
      const anc = entities.find((e) => e.id === ancestorId)
      if (!anc) return []
      const prefix = anc.path
      const result = entities
        .filter((e) => e.type === 'PT' && e.path.startsWith(prefix))
        .map((e) => e.id)
      ptByAncestor.set(ancestorId, result)
      return result
    }

    // Top-level: find the root HOLDING entity and use its children as the
    // top level. If scoped, use the scope entity itself.
    let topLevelParentId: string | null = null
    let topLevelType = 'SUB_HOLDING'
    if (scopeEntityId) {
      topLevelParentId = scopeEntityId
      const scopeEntity = entities.find((e) => e.id === scopeEntityId) ||
        (pathPrefix ? await db.entity.findUnique({ where: { id: scopeEntityId } }) : null)
      if (scopeEntity) {
        topLevelType = scopeEntity.type === 'PT' ? 'PT' : typeOrder[scopeEntity.type] || 'SUB_HOLDING'
      }
    } else {
      // Find the root holding
      const holding = await db.entity.findFirst({ where: { type: 'HOLDING', isActive: true } })
      topLevelParentId = holding?.id || null
      topLevelType = 'SUB_HOLDING'
    }

    const subHoldings = buildNode(topLevelParentId, topLevelType)

    return NextResponse.json({
      tree: subHoldings,
      subHoldings,
      periodKey,
      topLevelType,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
