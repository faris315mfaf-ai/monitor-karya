/**
 * Logika murni lembar "Unduh laporan PDF" Supervisor (pdf-download.tsx):
 * pilihan subholding, hitungan, ringkasan bawah, dan nama berkas dari header.
 */

import {
  bundleFileName, estimateBytes, sizeLabel, type BundleFormat, type BundleQuery,
} from '@/lib/subholding/pdf-bundle'

/** Satu baris GET /api/sh/pdf/ringkasan. */
export type SummarySub = {
  id: string
  name: string
  approved: number
  pending: number
  photosApproved: number
  photosPending: number
}

export type BundleSummary = { from: string; to: string; canDrafts: boolean; subholdings: SummarySub[] }

/** Pilihan subholding: null = semua (termasuk subholding baru), selain itu daftar id. */
export type SubPick = string[] | null

export function isPicked(pick: SubPick, id: string): boolean {
  return pick === null || pick.includes(id)
}

/** Centang/lepas satu subholding; semua tercentang kembali menjadi null. */
export function toggleSubPick(pick: SubPick, id: string, allIds: string[]): SubPick {
  const cur = pick ?? allIds
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  return allIds.every((x) => next.includes(x)) ? null : allIds.filter((x) => next.includes(x))
}

/** Laporan subholding ini yang ikut, menurut pilihan DRAF. */
export function subReports(s: SummarySub, drafts: boolean): number {
  return s.approved + (drafts ? s.pending : 0)
}

export type Selection = {
  subs: number
  reports: number
  photos: number
  /** Subholding terpilih yang punya laporan = jumlah PDF di .zip. */
  files: number
}

export function selectionOf(summary: BundleSummary, pick: SubPick, drafts: boolean): Selection {
  const chosen = summary.subholdings.filter((s) => isPicked(pick, s.id))
  let reports = 0
  let photos = 0
  let files = 0
  for (const s of chosen) {
    const n = subReports(s, drafts)
    reports += n
    photos += s.photosApproved + (drafts ? s.photosPending : 0)
    if (n) files += 1
  }
  return { subs: chosen.length, reports, photos, files }
}

/** Baris tebal ringkasan bawah. */
export function selectionHeadline(sel: Selection, photos: boolean): string {
  if (!sel.subs) return 'Pilih minimal satu subholding'
  if (!sel.reports) return 'Tidak ada laporan pada periode ini'
  const size = sizeLabel(estimateBytes(sel.reports, photos ? sel.photos : 0))
  return `${sel.reports} laporan · ${sel.subs} subholding · ${size}`
}

/** Baris kecil di bawahnya: nama berkas yang akan diterima. */
export function selectionFile(
  sel: Selection,
  q: Pick<BundleQuery, 'from' | 'to'> & { format: BundleFormat },
  onlySub: string | null
): string {
  if (!sel.subs || !sel.reports) return ''
  if (q.format === 'zip') return `${bundleFileName(q)} · ${sel.files} PDF`
  return bundleFileName(q, onlySub ?? 'Subholding')
}

/** Nama berkas dari Content-Disposition (filename* UTF-8 lebih dulu). */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* jatuh ke filename biasa */
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"/i.exec(header) ?? /filename\s*=\s*([^;]+)/i.exec(header)
  return plain ? plain[1].trim() : null
}
