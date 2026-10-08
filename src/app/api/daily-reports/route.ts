import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { serverError } from '@/lib/api-error' // [F3-D]

// GET /api/daily-reports - paginated daily reports with filters
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '20', 10)))
    const entityId = sp.get('entityId') || undefined
    const status = sp.get('status') || undefined
    const dateFrom = sp.get('dateFrom')
    const dateTo = sp.get('dateTo')
    const search = sp.get('search') || undefined
    // [T3-A1] Drill-down laporan per proyek (dashboard manajemen per perusahaan).
    const projectId = sp.get('projectId') || undefined

    const reportDate: Prisma.DateTimeFilter = {}
    for (const [raw, key] of [[dateFrom, 'gte'], [dateTo, 'lte']] as const) {
      if (!raw) continue
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 })
      }
      reportDate[key] = d
    }

    // [T3-A1] projectId adalah exact match; divalidasi string pendek (≤ 64
    // karakter) agar tidak menjadi beban kueri. Cakupan entitas tetap
    // diberlakukan lewat scopeIds di bawah — tidak bisa dipakai lintas PT.
    if (projectId !== undefined && projectId.length > 64) {
      return NextResponse.json({ error: 'Parameter projectId tidak valid' }, { status: 400 })
    }

    // null for roles that may read the whole group.
    const scopeIds = await scopeEntityIds(user)

    const where: Prisma.DailyProjectReportWhereInput = {
      ...(entityId ? { entityId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(Object.keys(reportDate).length ? { reportDate } : {}),
      ...(search
        ? { project: { name: { contains: search } } }
        : {}),
      ...(scopeIds ? { AND: [{ entityId: { in: scopeIds } }] } : {}),
    }

    const [items, total] = await Promise.all([
      db.dailyProjectReport.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          project: { select: { id: true, name: true, code: true } },
          entity: { select: { id: true, name: true, code: true, region: true } },
          submittedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      db.dailyProjectReport.count({ where }),
    ])

    return NextResponse.json({ items, total, page, pageSize })
  } catch (err) {
    // [F3-D] Pesan umum ke klien; detail galat hanya ke log server.
    return serverError(err, 'Laporan harian belum termuat. Coba lagi.', 'daily-reports GET')
  }
}
