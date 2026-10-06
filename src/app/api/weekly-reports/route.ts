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
    const search = sp.get('search')?.trim()
    const isoYearStr = sp.get('isoYear')
    const isoWeekStr = sp.get('isoWeek')

    const isoYear = isoYearStr ? parseInt(isoYearStr, 10) : undefined
    const isoWeek = isoWeekStr ? parseInt(isoWeekStr, 10) : undefined

    // null for roles that may read the whole group.
    const scopeIds = await scopeEntityIds(user)

    const where: Prisma.WeeklyDivisionReportWhereInput = {
      ...(entityId ? { entityId } : {}),
      ...(statusHeader ? { statusHeader } : {}),
      ...(search ? { OR: [
        { division: { name: { contains: search, mode: 'insensitive' as const } } },
        { entity: { name: { contains: search, mode: 'insensitive' as const } } },
        { entity: { region: { contains: search, mode: 'insensitive' as const } } },
      ] } : {}),
      ...(isoYear ? { isoYear } : {}),
      ...(isoWeek ? { isoWeek } : {}),
      ...(scopeIds ? { AND: [{ entityId: { in: scopeIds } }] } : {}),
    }

    const [items, total, waiting, late] = await Promise.all([
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
      db.weeklyDivisionReport.count({ where: { AND: [where, { statusHeader: 'MENUNGGU_PERSETUJUAN' }] } }),
      db.weeklyDivisionReport.count({ where: { AND: [where, { isLate: true }] } }),
    ])

    return NextResponse.json({ items, total, page, pageSize, summary: { waiting, late } })
  } catch (err) {
    // Pesan galat mentah (Prisma, koneksi) tidak dikirim ke klien.
    console.error('[weekly-reports] gagal memuat', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Arsip laporan mingguan belum termuat. Coba lagi.' }, { status: 500 })
  }
}
