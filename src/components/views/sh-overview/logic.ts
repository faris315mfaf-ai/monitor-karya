/**
 * Logika murni dashboard Superuser & Manajemen (papan 6, kontrak subholding
 * 16 Okt 2026): tanggal WIB, pengelompokan laporan per PT, ringkasan kartu,
 * dan navigasi lightbox bukti. Tanpa React supaya bisa diuji di Node.
 */

/** Bukti laporan. `kind` dari API: 'file' (berkas di penyimpanan) atau 'link' (tautan lama). */
export type OverviewEvidence = { id: string; fileName: string; mime: string | null; kind?: 'file' | 'link' }

export type OverviewReport = {
  id: string
  kegiatan: string
  deskripsi: string
  /** Nama pelapor (GET /api/sh/overview). */
  reporterName?: string
  /** Label jabatan jadi, mis. "Manajer Proyek". */
  reporterTitle?: string
  /** Waktu disetujui (ISO) atau null. */
  decidedAt?: string | null
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
    // Semua field laporan diteruskan (pelapor, jabatan, waktu setuju); hanya ptId/ptName yang dilepas.
    const { ptId: _ptId, ptName: _ptName, ...report } = r
    pt.reports.push({ ...report, evidence: r.evidence ?? [] })
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

/** Huruf inisial kartu subholding: kata pertama setelah "PT"/"Subholding". */
export function initialOf(name: string): string {
  const words = name.replace(/^(PT\.?|Sub-?holding)\s+/i, '').trim().split(/\s+/)
  return (words[0]?.[0] ?? 'S').toUpperCase()
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

/** Teks di atas foto besar pop-up rincian, mis. "Foto 1 dari 3" (kosong bila tanpa foto). */
export function heroLabel(index: number, length: number): string {
  if (length <= 0) return ''
  return `Foto ${positionLabel(index, length)}`
}

/**
 * Foto = bukti bergambar yang berupa berkas. Tautan lama (`kind: 'link'`)
 * tidak pernah dianggap foto walau mime-nya gambar: alamatnya dari luar dan
 * tidak lewat URL bertanda tangan, jadi ditampilkan sebagai dokumen.
 */
function isPhoto(e: OverviewEvidence): boolean {
  return e.kind !== 'link' && isImageMime(e.mime)
}

/** Bukti bergambar saja (urutan dipertahankan) — isi lightbox & tumpukan foto. */
export function photosOf(evidence: OverviewEvidence[] | null | undefined): OverviewEvidence[] {
  return (evidence ?? []).filter(isPhoto)
}

/** Bukti bukan gambar (PDF, dokumen, tautan) — ditampilkan sebagai baris dokumen. */
export function docsOf(evidence: OverviewEvidence[] | null | undefined): OverviewEvidence[] {
  return (evidence ?? []).filter((e) => !isPhoto(e))
}

/** Tumpukan miniatur di baris laporan: maksimal `max` foto, sisanya jadi "+n". */
export function thumbStack(
  evidence: OverviewEvidence[] | null | undefined,
  max = 3,
): { shown: OverviewEvidence[]; more: number } {
  const photos = photosOf(evidence)
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0
  const shown = photos.slice(0, limit)
  return { shown, more: photos.length - shown.length }
}

/* ---------- Kartu subholding ---------- */

export type Tone = 1 | 2 | 3 | 4 | 5 | 6

/**
 * Nada warna stabil dari id (FNV-1a 32-bit atas unit UTF-16) → 1..6.
 * Id yang sama selalu bernada sama di setiap muat ulang dan perangkat.
 */
export function toneOf(id: string): Tone {
  let h = 0x811c9dc5
  const s = id ?? ''
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (((h >>> 0) % 6) + 1) as Tone
}

/** Variabel warna nada: teks/ikon `fg` dan latar lembut `bg` dari token `--data-n`. */
export function toneVars(tone: Tone): { fg: string; bg: string } {
  const n = tone >= 1 && tone <= 6 ? Math.floor(tone) : 1
  return {
    fg: `var(--data-${n})`,
    bg: `color-mix(in srgb, var(--data-${n}) 18%, transparent)`,
  }
}

/** Singkatan bentuk badan usaha dengan ejaan baku. */
const ACRONYMS: Record<string, string> = {
  PT: 'PT',
  CV: 'CV',
  UD: 'UD',
  TBK: 'Tbk',
  PERSERO: 'Persero',
  BUMN: 'BUMN',
  BUMD: 'BUMD',
}

const ROMAN = /^(?=[IVX])X{0,3}(IX|IV|V?I{0,3})$/

function caseWord(word: string): string {
  const upper = word.toUpperCase()
  if (ACRONYMS[upper]) return ACRONYMS[upper]
  if (/\p{N}/u.test(word)) return word // mengandung angka: biarkan
  if (ROMAN.test(upper)) return upper // II, III, IV, XI
  const letters = Array.from(word)
  if (letters.length <= 3 && !/[AEIOU]/i.test(word)) return upper // BPR, KSP
  const [first, ...rest] = letters
  return first.toUpperCase() + rest.join('').toLowerCase()
}

/**
 * Nama tampilan: nama yang seluruh hurufnya kapital ("PT ANUGERAH JAYA TBK")
 * dijadikan title case ("PT Anugerah Jaya Tbk"); singkatan badan usaha,
 * angka romawi, dan singkatan ≤3 huruf tanpa vokal tetap kapital. Nama yang
 * sudah campuran dibiarkan. Spasi dirapikan.
 */
export function displayName(name: string): string {
  const s = (name ?? '').trim().replace(/\s+/g, ' ')
  if (!/\p{Lu}/u.test(s) || /\p{Ll}/u.test(s)) return s
  // Setiap rangkaian huruf/angka dikapitalisasi sendiri, jadi tanda hubung,
  // garis miring, titik, dan kurung menjadi batas kata. Apostrof tetap di dalam kata.
  return s.replace(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu, caseWord)
}

/** Label kartu: nama tampilan tanpa awalan "Subholding " (tetap utuh bila sisanya kosong). */
export function subholdingLabel(name: string): string {
  const full = displayName(name)
  const short = full.replace(/^sub-?holding\s+/i, '').trim()
  return short || full
}

function reportTotal(pts: OverviewPt[]): number {
  return pts.reduce((n, p) => n + p.reports.length, 0)
}

/**
 * Keterangan kartu: "3 laporan · 2 PT". Jumlah laporan memakai isi PT bila
 * hitungan API tertinggal; PT = PT yang punya laporan (hitungan API dipakai
 * bila rincian PT belum dimuat).
 */
export function cardMeta(sh: Pick<OverviewSubholding, 'count' | 'ptCount' | 'pts'>): string {
  const pts = normalizePts(sh.pts ?? [])
  const count = Math.max(sh.count ?? 0, reportTotal(pts))
  if (count <= 0) return 'Belum ada laporan disetujui'
  const ptCount = pts.length > 0 ? pts.length : Math.max(sh.ptCount ?? 0, 0)
  return ptCount > 0 ? `${count} laporan · ${ptCount} PT` : `${count} laporan`
}

/** Pisahkan subholding berisi dan kosong; urutan masuk dipertahankan di keduanya. */
export function splitSubholdings(list: OverviewSubholding[] | null | undefined): {
  filled: OverviewSubholding[]
  empty: OverviewSubholding[]
} {
  const filled: OverviewSubholding[] = []
  const empty: OverviewSubholding[] = []
  for (const sh of list ?? []) {
    const has = (sh.count ?? 0) > 0 || reportTotal(sh.pts ?? []) > 0
    ;(has ? filled : empty).push(sh)
  }
  return { filled, empty }
}

/** Id jangkar DOM kartu subholding (untuk lompat dari ringkasan). */
export function anchorId(id: string): string {
  return `sh-${id}`
}
