import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

// GET /api/late-incidents - list late incidents
// Note: LateIncident has no `entity` relation in the schema; we fetch and join
// the entity info manually to provide { name, code, region } as required.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '50', 10)))
    const entityId = sp.get('entityId') || undefined
    const cycle = sp.get('cycle') || undefined
    const minOccurrence = Math.max(1, parseInt(sp.get('minOccurrence') || '1', 10))

    const where: Prisma.LateIncidentWhereInput = {
      ...(entityId ? { entityId } : {}),
      ...(cycle ? { cycle } : {}),
      occurrenceInMonth: { gte: minOccurrence },
    }

    const [rows, total] = await Promise.all([
      db.lateIncident.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      db.lateIncident.count({ where }),
    ])

    const entityIds = Array.from(new Set(rows.map((r) => r.entityId).filter(Boolean)))
    const entities = entityIds.length
      ? await db.entity.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, name: true, code: true, region: true },
        })
      : []
    const entityById = new Map(entities.map((e) => [e.id, e]))

    const items = rows.map((r) => ({
      ...r,
      entity: entityById.get(r.entityId) ?? null,
    }))

    return NextResponse.json({ items, total, page, pageSize })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
