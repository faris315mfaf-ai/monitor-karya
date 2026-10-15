import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { startOfWibDay, wibDateKey } from '@/lib/lock'
import { dateParam, requireShUser, unprocessable } from '@/lib/subholding/http'
import { SH_EVIDENCE_TARGET } from '@/lib/subholding/rules'
import { activeSubholdings, refuseWithoutCap } from '@/lib/subholding/scope'

/**
 * GET /api/sh/overview?date=YYYY-MM-DD (`shreport:view-approved`: Ketua Umum,
 * Manajemen, Supervisor, Super Admin). Bawaan hari ini (WIB).
 *
 * HANYA laporan DISETUJUI pada `reportDate` itu. Semua subholding aktif tampil
 * walau 0 laporan. `ptCount` = jumlah PT aktif di subholding; `pts` hanya PT
 * yang punya laporan disetujui pada tanggal itu (urut nama).
 * → { date, subholdings: [{ id, name, count, ptCount,
 *       pts: [{ id, name, reports: [{ id, kegiatan, deskripsi, evidence: [{ id, fileName, mime }] }] }] }] }
 * Berkas bukti dibuka lewat GET /api/evidence/:id (URL bertanda tangan).
 */
export async function GET(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutCap(user, 'shreport:view-approved')
  if (refused) return refused

  const date = dateParam(req.nextUrl.searchParams.get('date'), startOfWibDay())
  if (date === 'invalid' || !date) return unprocessable('Tanggal harus berformat YYYY-MM-DD')

  try {
    const [subs, pts, reports] = await Promise.all([
      activeSubholdings(),
      db.entity.findMany({ where: { type: 'PT', isActive: true }, select: { id: true, path: true } }),
      db.subholdingReport.findMany({
        where: { status: 'DISETUJUI', reportDate: date },
        select: { id: true, subholdingId: true, ptId: true, kegiatan: true, deskripsi: true },
        orderBy: [{ decidedAt: 'asc' }, { submittedAt: 'asc' }],
      }),
    ])
    const reportIds = reports.map((r) => r.id)
    const ptIds = Array.from(new Set(reports.map((r) => r.ptId)))
    const [evidence, ptNames] = await Promise.all([
      db.evidence.findMany({
        where: { targetType: SH_EVIDENCE_TARGET, targetId: { in: reportIds } },
        select: { id: true, targetId: true, fileName: true, mime: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.entity.findMany({ where: { id: { in: ptIds } }, select: { id: true, name: true } }),
    ])

    const evidenceBy = new Map<string, { id: string; fileName: string; mime: string }[]>()
    for (const e of evidence) {
      const list = evidenceBy.get(e.targetId) ?? []
      list.push({ id: e.id, fileName: e.fileName, mime: e.mime })
      evidenceBy.set(e.targetId, list)
    }
    const ptName = new Map(ptNames.map((p) => [p.id, p.name]))

    const subholdings = subs.map((s) => {
      const mine = reports.filter((r) => r.subholdingId === s.id)
      const byPt = new Map<string, typeof mine>()
      for (const r of mine) byPt.set(r.ptId, [...(byPt.get(r.ptId) ?? []), r])
      const ptList = Array.from(byPt.entries())
        .map(([ptId, list]) => ({
          id: ptId,
          name: ptName.get(ptId) ?? '',
          reports: list.map((r) => ({
            id: r.id,
            kegiatan: r.kegiatan,
            deskripsi: r.deskripsi,
            evidence: evidenceBy.get(r.id) ?? [],
          })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
      return {
        id: s.id,
        name: s.name,
        count: mine.length,
        ptCount: pts.filter((p) => p.id !== s.id && p.path?.startsWith(s.path)).length,
        pts: ptList,
      }
    })
    return NextResponse.json({ date: wibDateKey(date), subholdings })
  } catch (err) {
    return serverError(err, 'Dashboard belum termuat. Coba lagi.', 'sh/overview GET')
  }
}
