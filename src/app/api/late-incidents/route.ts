import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { intParam, MAX_PAGE } from '@/app/api/_paging'
import { refusePerformer } from '@/lib/pic-access'
import { Prisma } from '@prisma/client'
import { serverError } from '@/lib/api-error' // [F3-D]

// GET /api/late-incidents - list late incidents
// Note: LateIncident has no `entity` relation in the schema; we fetch and join
// the entity info manually to provide { name, code, region } as required.
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    // [T10-FIX2, T-1] Insiden keterlambatan berulang adalah data kepatuhan
    // tingkat PT — bukan muatan peran pelaksana.
    const forbidden = refusePerformer(user)
    if (forbidden) return forbidden
    const sp = req.nextUrl.searchParams
    const page = intParam(sp.get('page'), 1, 1, MAX_PAGE)
    const pageSize = intParam(sp.get('pageSize'), 50, 1, 200)
    const entityId = sp.get('entityId') || undefined
    const cycle = sp.get('cycle') || undefined
    const minOccurrence = intParam(sp.get('minOccurrence'), 1, 1, 1000)

    // null for roles that may read the whole group.
    const scopeIds = await scopeEntityIds(user)

    const where: Prisma.LateIncidentWhereInput = {
      ...(entityId ? { entityId } : {}),
      ...(cycle ? { cycle } : {}),
      occurrenceInMonth: { gte: minOccurrence },
      ...(scopeIds ? { AND: [{ entityId: { in: scopeIds } }] } : {}),
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
    // [F3-D] Pesan umum ke klien; detail galat hanya ke log server.
    return serverError(err, 'Data keterlambatan belum termuat. Coba lagi.', 'late-incidents GET')
  }
}
