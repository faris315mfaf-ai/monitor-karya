/**
 * Logika murni dashboard Ketua Umum & Manajemen (papan 6, kontrak subholding
 * 16 Okt 2026): tanggal WIB, pengelompokan laporan per PT, ringkasan kartu,
 * dan navigasi lightbox bukti. Tanpa React supaya bisa diuji di Node.
 */

export type OverviewEvidence = { id: string; fileName: string; mime: string | null }

export type OverviewReport = {
  id: string
  kegiatan: string
  deskripsi: string
  evidence: OverviewEvidence[]
}

export type OverviewPt = { id: string; name: string; reports: OverviewReport[] }

export type OverviewSubholding = {
  id: string
  name: string
  count: number
  ptCount: number
  pts: OverviewPt[]
}

export type OverviewData = { date: string; subholdings: OverviewSubholding[] }

/** Baris datar (mis. dari ShReport) yang bisa dikelompokkan per PT. */
export type FlatReport = OverviewReport & { ptId: string; ptName: string }

const WIB_OFFSET_MS = 7 * 3600_000

/** Kunci tanggal WIB 'YYYY-MM-DD', mundur `daysBack` hari dari `now`. */
export function wibDateKey(now: Date = new Date(), daysBack = 0): string {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS - daysBack * 86_400_000)
  return shifted.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → Date pada tengah hari WIB (aman untuk pemformat tanggal WIB). */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T05:00:00.000Z`)
}

/**
 * Kelompokkan laporan per PT: urutan PT mengikuti nama (id-ID), laporan di
 * dalam PT mengikuti urutan masuk, PT tanpa laporan dibuang.
 */
export function groupByPt(reports: FlatReport[]): OverviewPt[] {
  const map = new Map<string, OverviewPt>()
  for (const r of reports) {
    const key = r.ptId || r.ptName
    let pt = map.get(key)
    if (!pt) {
      pt = { id: r.ptId, name: r.ptName, reports: [] }
      map.set(key, pt)
    }
    pt.reports.push({ id: r.id, kegiatan: r.kegiatan, deskripsi: r.deskripsi, evidence: r.evidence ?? [] })
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'id-ID'))
}

/**
 * Rapikan kelompok PT dari API: gabungkan PT ganda (id sama), buang yang
 * kosong, urutkan nama. API sudah mengelompokkan; ini penjaga tampilan.
 */
export function normalizePts(pts: OverviewPt[]): OverviewPt[] {
  return groupByPt(pts.flatMap((p) => p.reports.map((r) => ({ ...r, ptId: p.id, ptName: p.name }))))
}

/** Kalimat ringkasan kartu: "3 laporan · 2 PT" atau "Belum ada laporan". */
export function summaryLabel(sh: Pick<OverviewSubholding, 'count' | 'ptCount' | 'pts'>): string {
  const pts = normalizePts(sh.pts ?? [])
  const count = Math.max(sh.count ?? 0, pts.reduce((n, p) => n + p.reports.length, 0))
  const ptCount = Math.max(sh.ptCount ?? 0, pts.length)
  if (count === 0) return 'Belum ada laporan'
  return `${count} laporan · ${ptCount} PT`
}

/** Huruf inisial kartu subholding: kata pertama setelah "PT"/"Subholding". */
export function initialOf(name: string): string {
  const words = name.replace(/^(PT\.?|Sub-?holding)\s+/i, '').trim().split(/\s+/)
  return (words[0]?.[0] ?? 'S').toUpperCase()
}

/** Kartu yang terbuka bawaan: tetap pilihan sebelumnya bila masih ada, selain itu subholding pertama yang berisi. */
export function defaultOpen(list: OverviewSubholding[], previous: string | null): string | null {
  if (previous && list.some((s) => s.id === previous)) return previous
  return list.find((s) => (s.count ?? 0) > 0)?.id ?? null
}

/* ---------- Bukti & lightbox ---------- */

export function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.toLowerCase().startsWith('image/'))
}

/** Indeks berikutnya/sebelumnya dengan putaran (terakhir → pertama). */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0
  return (((index + delta) % length) + length) % length
}

/** Teks posisi lightbox, mis. "2 dari 5". */
export function positionLabel(index: number, length: number): string {
  if (length <= 0) return ''
  return `${stepIndex(index, 0, length) + 1} dari ${length}`
}

/** Tombol keyboard di dalam lightbox → arah navigasi (0 = abaikan). */
export function keyDelta(key: string): -1 | 0 | 1 {
  if (key === 'ArrowLeft' || key === 'PageUp') return -1
  if (key === 'ArrowRight' || key === 'PageDown') return 1
  return 0
}
