import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { serverError } from '@/lib/api-error' // [F3-D]
import { intParam, MAX_PAGE } from '@/app/api/_paging'
import { performerProjectScope } from '@/lib/pic-access'
import { parseWibDateKey } from '@/lib/lock'

// GET /api/daily-reports - paginated daily reports with filters
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams
    const page = intParam(sp.get('page'), 1, 1, MAX_PAGE)
    const pageSize = intParam(sp.get('pageSize'), 20, 1, 200)
    const entityId = sp.get('entityId')?.slice(0, 64) || undefined
    // [T11, R-4] Parameter teks dipangkas agar tidak jadi beban kueri.
    const status = sp.get('status')?.slice(0, 32) || undefined
    const dateFrom = sp.get('dateFrom')
    const dateTo = sp.get('dateTo')
    const search = sp.get('search')?.slice(0, 128) || undefined
    // [T3-A1] Drill-down laporan per proyek (dashboard manajemen per perusahaan).
    const projectId = sp.get('projectId') || undefined

    const reportDate: Prisma.DateTimeFilter = {}
    for (const [raw, key] of [[dateFrom, 'gte'], [dateTo, 'lte']] as const) {
      if (!raw) continue
      // [T12] "YYYY-MM-DD" adalah hari WIB: reportDate tersimpan sebagai tengah
      // malam WIB, jadi `new Date('2026-10-10')` (00.00 UTC = 07.00 WIB) membuat
      // dateFrom=hari itu justru melewatkan laporan hari itu. Bentuk ISO lengkap
      // tetap dipakai apa adanya.
      const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseWibDateKey(raw) : new Date(raw)
      if (!d || Number.isNaN(d.getTime())) {
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
    // [T10-FIX2, T-1] Peran pelaksana (PIC/kepala divisi) diiris ke proyek
    // masing-masing: isi laporan harian rekan satu PT di luar cakupannya
    // (capaian, kendala, tindak lanjut, nama pengirim) tidak ikut terbaca.
    const projectScope = await performerProjectScope(user)

    const where: Prisma.DailyProjectReportWhereInput = {
      ...(entityId ? { entityId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(Object.keys(reportDate).length ? { reportDate } : {}),
      ...(search
        ? { project: { name: { contains: search, mode: 'insensitive' as const } } }
        : {}),
      ...(scopeIds || projectScope
        ? {
            AND: [
              ...(scopeIds ? [{ entityId: { in: scopeIds } }] : []),
              ...(projectScope ? [{ project: projectScope }] : []),
            ],
          }
        : {}),
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
