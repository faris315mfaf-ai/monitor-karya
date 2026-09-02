import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

// GET /api/projects - paginated projects list with filters
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '20', 10)))
    const entityId = sp.get('entityId') || undefined
    const phase = sp.get('phase') || undefined
    const lifecycle = sp.get('lifecycle') || 'AKTIF'
    const search = sp.get('search') || undefined

    const where: Prisma.ProjectWhereInput = {
      ...(entityId ? { entityId } : {}),
      ...(phase ? { phase } : {}),
      lifecycle,
      ...(search
        ? { name: { contains: search } }
        : {}),
    }

    const [items, total] = await Promise.all([
      db.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ code: 'asc' }],
        include: {
          entity: { select: { id: true, name: true, code: true, region: true } },
          dailyReports: {
            select: {
              status: true,
              progressPct: true,
              reportDate: true,
              isLate: true,
            },
            orderBy: { reportDate: 'desc' },
            take: 1,
          },
        },
      }),
      db.project.count({ where }),
    ])

    const formatted = items.map((p) => {
      const r = p.dailyReports[0]
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        phase: p.phase,
        lifecycle: p.lifecycle,
        picName: p.picName,
        startDate: p.startDate,
        targetEndDate: p.targetEndDate,
        approvedByName: p.approvedByName,
        approvedAt: p.approvedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        entity: p.entity,
        latestReport: r
          ? {
              status: r.status,
              progressPct: r.progressPct,
              reportDate: r.reportDate,
              isLate: r.isLate,
            }
          : null,
      }
    })

    return NextResponse.json({ items: formatted, total, page, pageSize })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
