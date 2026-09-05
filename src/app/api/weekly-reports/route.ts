import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { Prisma } from '@prisma/client'

// GET /api/weekly-reports - paginated weekly division reports
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '20', 10)))
    const entityId = sp.get('entityId') || undefined
    const statusHeader = sp.get('statusHeader') || undefined
    const isoYearStr = sp.get('isoYear')
    const isoWeekStr = sp.get('isoWeek')

    const isoYear = isoYearStr ? parseInt(isoYearStr, 10) : undefined
    const isoWeek = isoWeekStr ? parseInt(isoWeekStr, 10) : undefined

    // null for roles that may read the whole group.
    const scopeIds = await scopeEntityIds(user)

    const where: Prisma.WeeklyDivisionReportWhereInput = {
      ...(entityId ? { entityId } : {}),
      ...(statusHeader ? { statusHeader } : {}),
      ...(isoYear ? { isoYear } : {}),
      ...(isoWeek ? { isoWeek } : {}),
      ...(scopeIds ? { AND: [{ entityId: { in: scopeIds } }] } : {}),
    }

    const [items, total] = await Promise.all([
      db.weeklyDivisionReport.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ isoYear: 'desc' }, { isoWeek: 'desc' }, { updatedAt: 'desc' }],
        include: {
          division: { select: { id: true, name: true } },
          entity: { select: { id: true, name: true, code: true, region: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              aspectCategory: { select: { id: true, name: true, code: true } },
              priority: { select: { id: true, code: true, name: true, weight: true } },
            },
          },
        },
      }),
      db.weeklyDivisionReport.count({ where }),
    ])

    return NextResponse.json({ items, total, page, pageSize })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
