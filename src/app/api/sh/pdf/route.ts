import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { can } from '@/lib/rbac'
import { startOfWibDay, wibDateKey } from '@/lib/lock'
import { hit, tooManyRequests } from '@/lib/security'
import { visibleShReport } from '@/lib/subholding/access'
import { dateParam, notFound, requireShUser, unprocessable } from '@/lib/subholding/http'
import { buildShReportsPdf, loadReportPhotos, pdfFileName } from '@/lib/subholding/pdf'
import { hydrateShReports, SH_REPORT_SELECT, type ShReport } from '@/lib/subholding/report'
import { refuseWithoutAnyCap } from '@/lib/subholding/scope'

export const runtime = 'nodejs'

const PDF_LIMIT = { limit: 20, windowMs: 5 * 60_000 }
/** Batas laporan per berkas; subholding yang lebih besar dipecah per PT. */
const MAX_REPORTS = 60

/**
 * GET /api/sh/pdf — berkas PDF laporan subholding (dibuka di tab baru).
 *
 *  ?id=<laporan>                satu laporan; status apa pun yang boleh dibaca
 *                               akun ini (belum disetujui → tanda air DRAF).
 *  ?pt=<PT>&date=YYYY-MM-DD     semua laporan DISETUJUI satu PT pada tanggal itu.
 *  ?sub=<subholding>&date=...   semua laporan DISETUJUI satu subholding hari itu.
 *
 * Mode PT/subholding hanya untuk `shreport:view-approved` / `shreport:review`
 * (Superuser, Manajemen, Supervisor, Super Admin). Mode `id` memakai aturan baca
 * yang sama dengan GET /api/sh/reports/:id (Admin subholding: laporan miliknya).
 * Komentar dan sorotan hanya dicetak untuk pemegang `shreport:review`.
 * Tanggal bawaan (mode PT/subholding) = hari ini WIB. Tidak ada laporan → 404.
 */
export async function GET(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutAnyCap(user, ['shreport:view-approved', 'shreport:review', 'shreport:write'])
  if (refused) return refused

  const rate = hit(`shpdf:${user.id}`, PDF_LIMIT.limit, PDF_LIMIT.windowMs)
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec, 'Terlalu banyak permintaan PDF. Coba lagi sebentar lagi.')

  const q = req.nextUrl.searchParams
  const id = q.get('id')?.trim() || ''
  const pt = q.get('pt')?.trim() || ''
  const sub = q.get('sub')?.trim() || ''
  if ([id, pt, sub].filter(Boolean).length !== 1) return unprocessable('Pilih satu: id, pt, atau sub')
  if ([id, pt, sub].some((v) => v.length > 64)) return unprocessable('Parameter tidak valid')

  try {
    let reports: ShReport[]
    let scopeTitle: string
    let dateKey: string | null = null

    if (id) {
      const row = await visibleShReport(user, id)
      if (!row) return notFound()
      reports = await hydrateShReports([row], user)
      scopeTitle = reports[0].ptName || reports[0].kegiatan
      dateKey = reports[0].reportDate
    } else {
      const refusedScope = refuseWithoutAnyCap(user, ['shreport:view-approved', 'shreport:review'])
      if (refusedScope) return refusedScope
      const date = dateParam(q.get('date'), startOfWibDay())
      if (date === 'invalid' || !date) return unprocessable('Tanggal harus berformat YYYY-MM-DD')
      const entity = await db.entity.findUnique({
        where: { id: pt || sub },
        select: { id: true, name: true, type: true, isActive: true },
      })
      if (!entity || !entity.isActive || entity.type !== (pt ? 'PT' : 'SUB_HOLDING')) {
        return NextResponse.json({ error: pt ? 'PT tidak ditemukan' : 'Subholding tidak ditemukan' }, { status: 404 })
      }
      const rows = await db.subholdingReport.findMany({
        where: { status: 'DISETUJUI', reportDate: date, ...(pt ? { ptId: pt } : { subholdingId: sub }) },
        select: SH_REPORT_SELECT,
        orderBy: [{ decidedAt: 'asc' }, { submittedAt: 'asc' }],
        take: MAX_REPORTS + 1,
      })
      if (!rows.length) {
        return NextResponse.json({ error: 'Belum ada laporan disetujui pada tanggal itu' }, { status: 404 })
      }
      if (rows.length > MAX_REPORTS) {
        return unprocessable(`Laporan terlalu banyak untuk satu berkas (maksimum ${MAX_REPORTS}). Pilih satu PT.`)
      }
      reports = await hydrateShReports(rows, user)
      scopeTitle = entity.name
      dateKey = wibDateKey(date)
    }

    const photos = await loadReportPhotos(reports)
    const pdf = buildShReportsPdf({
      reports,
      scopeTitle,
      dateKey,
      // Komentar: peninjau dan Admin subholding pemilik; sorotan hanya ada di data peninjau.
      includeReview: can(user.role, 'shreport:review') || can(user.role, 'shreport:write'),
      generatedAt: new Date(),
      photos,
    })
    const name = pdfFileName(scopeTitle, dateKey)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    return serverError(err, 'PDF belum bisa dibuat. Coba lagi.', 'sh/pdf GET')
  }
}
