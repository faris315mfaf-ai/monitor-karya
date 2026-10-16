import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { startOfWibDay, wibDateKey } from '@/lib/lock'
import { dateParam, requireShUser, unprocessable } from '@/lib/subholding/http'
import { activeSubholdings, ptsOfSubholding, refuseWithoutCap } from '@/lib/subholding/scope'

const DAYS = 7
const DAY_MS = 86_400_000
const MAX_HIGHLIGHTS = 50

/**
 * GET /api/sh/overview/week?end=YYYY-MM-DD[&subholdingId=]
 * (`shreport:view-approved`: Superuser, Manajemen, Supervisor, Super Admin).
 * Pola 7 hari dashboard Manajemen & Superuser (KONTRAK-MANAJEMEN-MOBILE.md D1).
 *
 * `days` = 7 kunci tanggal WIB berakhir di `end` (bawaan hari ini WIB), urut
 * naik. `counts[i]` = jumlah laporan DISETUJUI ber-`reportDate` = `days[i]`.
 * Tanpa `subholdingId`: semua subholding aktif (urut nama). Dengan
 * `subholdingId`: subholding itu saja + `pts` (SEMUA PT aktif di bawahnya,
 * urut nama, termasuk yang 0) beserta counts; subholding tak dikenal/nonaktif
 * → 404. `highlights` = laporan DISETUJUI yang disorot dalam 7 hari itu
 * (cakupan subholding yang sama), terbaru dulu, maks 50.
 * → { start, end, days: string[],
 *     subholdings: [{ id, name, counts: number[], pts?: [{ id, name, counts }] }],
 *     highlights: [{ id, date, kegiatan, subholdingId, subholdingName, ptName, highlightNote }] }
 */
export async function GET(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutCap(user, 'shreport:view-approved')
  if (refused) return refused

  const sp = req.nextUrl.searchParams
  const end = dateParam(sp.get('end'), startOfWibDay())
  if (end === 'invalid' || !end) return unprocessable('Tanggal harus berformat YYYY-MM-DD', 'end')
  const subholdingId = sp.get('subholdingId')?.trim().slice(0, 64) || ''

  // WIB tanpa musim panas: mundur kelipatan 24 jam tetap di 00.00 WIB.
  const dates = Array.from({ length: DAYS }, (_, i) => new Date(end.getTime() - (DAYS - 1 - i) * DAY_MS))
  const days = dates.map((d) => wibDateKey(d))
  const start = dates[0]
  const dayIndex = new Map(days.map((k, i) => [k, i]))

  try {
    const allSubs = await activeSubholdings()
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'id')
    const subs = (subholdingId ? allSubs.filter((s) => s.id === subholdingId) : [...allSubs]).sort(byName)
    if (subholdingId && !subs.length) {
      return NextResponse.json({ error: 'Subholding tidak ditemukan' }, { status: 404 })
    }

    const where: Prisma.SubholdingReportWhereInput = {
      status: 'DISETUJUI',
      reportDate: { gte: start, lte: end },
      ...(subholdingId ? { subholdingId } : {}),
    }
    const [groups, highlightRows, pts] = await Promise.all([
      db.subholdingReport.groupBy({
        by: ['subholdingId', 'ptId', 'reportDate'],
        where,
        _count: { _all: true },
      }),
      db.subholdingReport.findMany({
        where: { ...where, highlight: true },
        select: {
          id: true,
          reportDate: true,
          kegiatan: true,
          subholdingId: true,
          ptId: true,
          highlightNote: true,
        },
        orderBy: [{ reportDate: 'desc' }, { highlightedAt: 'desc' }, { decidedAt: 'desc' }],
        take: MAX_HIGHLIGHTS,
      }),
      subholdingId ? ptsOfSubholding(subs[0]) : Promise.resolve([]),
    ])

    const subCounts = new Map<string, number[]>()
    const ptCounts = new Map<string, number[]>()
    const add = (map: Map<string, number[]>, key: string, i: number, n: number) => {
      const list = map.get(key) ?? new Array<number>(DAYS).fill(0)
      list[i] += n
      map.set(key, list)
    }
    for (const g of groups) {
      const i = dayIndex.get(wibDateKey(new Date(g.reportDate)))
      if (i === undefined) continue
      add(subCounts, g.subholdingId, i, g._count._all)
      add(ptCounts, g.ptId, i, g._count._all)
    }
    const zeros = () => new Array<number>(DAYS).fill(0)

    const entityIds = Array.from(new Set(highlightRows.flatMap((r) => [r.subholdingId, r.ptId])))
    const names = entityIds.length
      ? await db.entity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } })
      : []
    const nameOf = new Map(names.map((e) => [e.id, e.name]))

    return NextResponse.json({
      start: days[0],
      end: days[DAYS - 1],
      days,
      subholdings: subs.map((s) => ({
        id: s.id,
        name: s.name,
        counts: subCounts.get(s.id) ?? zeros(),
        ...(subholdingId
          ? {
              pts: [...pts].sort(byName).map((p) => ({ id: p.id, name: p.name, counts: ptCounts.get(p.id) ?? zeros() })),
            }
          : {}),
      })),
      highlights: highlightRows.map((r) => ({
        id: r.id,
        date: wibDateKey(new Date(r.reportDate)),
        kegiatan: r.kegiatan,
        subholdingId: r.subholdingId,
        subholdingName: nameOf.get(r.subholdingId) ?? '',
        ptName: nameOf.get(r.ptId) ?? '',
        highlightNote: r.highlightNote ?? null,
      })),
    })
  } catch (err) {
    return serverError(err, 'Pola 7 hari belum termuat. Coba lagi.', 'sh/overview/week GET')
  }
}
