import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { wibDateKey } from '@/lib/lock'
import { serverError } from '@/lib/api-error'
import { can } from '@/lib/rbac'
import { hit, tooManyRequests } from '@/lib/security'
import { bundleStatuses, periodWhere, pickSubholdings } from '@/lib/subholding/bundle'
import { requireShUser, unprocessable } from '@/lib/subholding/http'
import { buildShBundlePdf, loadReportPhotos, type ShBundleSection } from '@/lib/subholding/pdf'
import { bundleFileName, MAX_BUNDLE_PHOTOS, MAX_BUNDLE_REPORTS, parseBundleQuery } from '@/lib/subholding/pdf-bundle'
import { hydrateShReports, SH_REPORT_SELECT } from '@/lib/subholding/report'
import { activePts, ptsUnder, refuseWithoutAnyCap } from '@/lib/subholding/scope'
import { buildZip } from '@/lib/zip'

export const runtime = 'nodejs'

const BUNDLE_LIMIT = { limit: 10, windowMs: 5 * 60_000 }

/**
 * GET /api/sh/pdf/berkas — unduh laporan subholding sekaligus (9 Nov 2026).
 *
 *  from, to       YYYY-MM-DD WIB, inklusif (`from` kosong = hari ini, `to`
 *                 kosong = `from`; maks. 31 hari)
 *  subs           id subholding dipisah koma; kosong = semua subholding aktif
 *  drafts=1       sertakan MENUNGGU (tanda air DRAF) — hanya `shreport:review`
 *  format         pdf (satu PDF gabungan) | zip (satu PDF per subholding)
 *  photos, highlights, comments   0/1, bawaan 1
 *
 * Akses: `shreport:review` (Supervisor, Super Admin) atau
 * `shreport:view-approved`. Komentar hanya untuk peninjau, sorotan hanya ada
 * di data peninjau. Maks. 300 laporan dan 120 foto per unduhan (foto
 * selebihnya dicantumkan namanya). Tidak ada laporan → 404. Berkas dikirim
 * sebagai lampiran (attachment).
 */
export async function GET(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutAnyCap(user, ['shreport:review', 'shreport:view-approved'])
  if (refused) return refused

  const q = parseBundleQuery(req.nextUrl.searchParams, wibDateKey())
  if ('error' in q) return unprocessable(q.error)
  const reviewer = can(user.role, 'shreport:review')
  if (q.drafts && !reviewer) {
    return NextResponse.json({ error: 'Hanya peninjau yang boleh mengunduh laporan yang belum disetujui' }, { status: 403 })
  }

  const rate = hit(`shpdfberkas:${user.id}`, BUNDLE_LIMIT.limit, BUNDLE_LIMIT.windowMs)
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec, 'Terlalu banyak unduhan. Coba lagi sebentar lagi.')

  try {
    const subs = await pickSubholdings(q.subs)
    if (!subs) return unprocessable('Subholding tidak ditemukan')
    if (!subs.length) return NextResponse.json({ error: 'Belum ada subholding aktif' }, { status: 404 })

    const rows = await db.subholdingReport.findMany({
      where: { ...periodWhere(q.from, q.to), status: { in: bundleStatuses(q.drafts) }, subholdingId: { in: subs.map((s) => s.id) } },
      select: SH_REPORT_SELECT,
      orderBy: [{ reportDate: 'desc' }, { decidedAt: 'asc' }, { submittedAt: 'asc' }],
      take: MAX_BUNDLE_REPORTS + 1,
    })
    if (!rows.length) return NextResponse.json({ error: 'Tidak ada laporan pada periode dan subholding ini' }, { status: 404 })
    if (rows.length > MAX_BUNDLE_REPORTS) {
      return unprocessable(`Laporan lebih dari ${MAX_BUNDLE_REPORTS}. Persempit periode atau pilih lebih sedikit subholding.`)
    }

    const [reports, pts] = await Promise.all([hydrateShReports(rows, user), activePts()])
    const sections: ShBundleSection[] = subs.map((s) => ({
      id: s.id,
      name: s.name,
      pts: ptsUnder(s, pts).map((p) => ({ id: p.id, name: p.name })),
      reports: reports.filter((r) => r.subholdingId === s.id),
    }))
    const print = {
      from: q.from,
      to: q.to,
      includeComments: q.comments && reviewer,
      includeHighlights: q.highlights && reviewer,
      generatedAt: new Date(),
      photos: q.photos ? await loadReportPhotos(reports, MAX_BUNDLE_PHOTOS) : new Map(),
    }

    let body: Buffer
    let name: string
    let type: string
    if (q.format === 'zip') {
      const used = new Set<string>()
      const entries = sections
        .filter((s) => s.reports.length)
        .map((s) => {
          const base = bundleFileName({ ...q, format: 'pdf' }, s.name).replace(/\.pdf$/, '')
          let file = `${base}.pdf`
          for (let i = 2; used.has(file); i++) file = `${base}-${i}.pdf`
          used.add(file)
          return { name: file, data: buildShBundlePdf({ ...print, sections: [s] }), modified: print.generatedAt }
        })
      body = buildZip(entries)
      name = bundleFileName(q)
      type = 'application/zip'
    } else {
      body = buildShBundlePdf({ ...print, sections })
      name = bundleFileName(q, subs.length === 1 ? subs[0].name : 'Subholding')
      type = 'application/pdf'
    }
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Content-Length': String(body.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    return serverError(err, 'Berkas belum bisa dibuat. Coba lagi.', 'sh/pdf/berkas GET')
  }
}
