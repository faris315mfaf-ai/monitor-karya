import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { dateParam, requireShUser, unprocessable } from '@/lib/subholding/http'
import { hydrateShReports, SH_REPORT_SELECT, statusCounts } from '@/lib/subholding/report'
import { isShStatus } from '@/lib/subholding/rules'
import { activeSubholdings, refuseWithoutCap } from '@/lib/subholding/scope'
import { startOfTodayWIB } from '@/lib/wib'

const MAX_ITEMS = 200

/**
 * GET /api/sh/review?status=MENUNGGU|PERLU_PERBAIKAN|DISETUJUI&subholdingId&date=YYYY-MM-DD
 * (`shreport:review`: Supervisor, Super Admin). Bawaan status MENUNGGU; tanpa
 * `date` = semua tanggal. MENUNGGU diurut terlama dulu (antrean), status lain
 * diurut keputusan terbaru. Maksimal 200 butir.
 * → { items: ShReport[], counts: { MENUNGGU, PERLU_PERBAIKAN, DISETUJUI },
 *     subholdings: [{ id, name, waiting, oldestAt }],
 *     today: { approved, highlighted, revised } }
 * `counts` memakai saringan subholding + tanggal yang sama; `waiting` per
 * subholding memakai saringan tanggal yang sama, `oldestAt` = kiriman
 * menunggu terlama (ISO) atau null. `today` = keputusan peninjau INI sejak
 * 00.00 WIB (rekap saat antrean habis). Tiap item membawa
 * `highlight`, `highlightNote`, `highlightedAt` (sorotan untuk manajemen,
 * 0035) — kolom ini hanya untuk pemegang `shreport:review`, lihat
 * `seesHighlight` di src/lib/subholding/report.ts.
 */
export async function GET(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutCap(user, 'shreport:review')
  if (refused) return refused

  const sp = req.nextUrl.searchParams
  const statusRaw = sp.get('status')?.trim() || 'MENUNGGU'
  if (!isShStatus(statusRaw)) return unprocessable('Status tidak dikenal')
  const date = dateParam(sp.get('date'), null)
  if (date === 'invalid') return unprocessable('Tanggal harus berformat YYYY-MM-DD')
  const subholdingId = sp.get('subholdingId')?.trim().slice(0, 64) || ''

  const dateWhere: Prisma.SubholdingReportWhereInput = date ? { reportDate: date } : {}
  const base: Prisma.SubholdingReportWhereInput = { ...dateWhere, ...(subholdingId ? { subholdingId } : {}) }

  try {
    const [rows, counts, subs, waiting, decided] = await Promise.all([
      db.subholdingReport.findMany({
        where: { ...base, status: statusRaw },
        select: SH_REPORT_SELECT,
        orderBy: statusRaw === 'MENUNGGU' ? [{ submittedAt: 'asc' }] : [{ decidedAt: 'desc' }, { submittedAt: 'desc' }],
        take: MAX_ITEMS,
      }),
      statusCounts(base),
      activeSubholdings(),
      // Antrean menunggu hanya puluhan baris: cukup ambil kolom kecil lalu hitung di sini.
      db.subholdingReport.findMany({
        where: { ...dateWhere, status: 'MENUNGGU' },
        select: { subholdingId: true, submittedAt: true },
        take: 5000,
      }),
      db.subholdingReport.findMany({
        where: { decidedById: user.id, decidedAt: { gte: startOfTodayWIB() } },
        select: { status: true, highlight: true },
        take: 5000,
      }),
    ])
    const waitingBy = new Map<string, { n: number; oldest: Date | null }>()
    for (const w of waiting) {
      const cur = waitingBy.get(w.subholdingId) ?? { n: 0, oldest: null }
      cur.n += 1
      if (w.submittedAt && (!cur.oldest || w.submittedAt < cur.oldest)) cur.oldest = w.submittedAt
      waitingBy.set(w.subholdingId, cur)
    }
    const today = {
      approved: decided.filter((d) => d.status === 'DISETUJUI').length,
      highlighted: decided.filter((d) => d.status === 'DISETUJUI' && d.highlight).length,
      revised: decided.filter((d) => d.status === 'PERLU_PERBAIKAN').length,
    }
    const items = await hydrateShReports(rows, user)
    return NextResponse.json({
      items,
      counts,
      subholdings: subs.map((s) => {
        const w = waitingBy.get(s.id)
        return { id: s.id, name: s.name, waiting: w?.n ?? 0, oldestAt: w?.oldest ? w.oldest.toISOString() : null }
      }),
      today,
    })
  } catch (err) {
    return serverError(err, 'Antrean persetujuan belum termuat. Coba lagi.', 'sh/review GET')
  }
}
