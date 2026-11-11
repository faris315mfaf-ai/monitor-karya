/**
 * Unduh PDF laporan subholding untuk Supervisor (9 Nov 2026, canvas "Unduh
 * PDF Supervisor"). Bagian murni yang dipakai bersama dialog klien dan rute
 * GET /api/sh/pdf/ringkasan + GET /api/sh/pdf/berkas: periode, parameter
 * kueri, perkiraan ukuran, dan nama berkas. Tidak menyentuh server.
 */

export type BundlePeriod = 'hari' | 'kemarin' | 'rentang'
export type BundleFormat = 'pdf' | 'zip'
export type QuickRange = '7hari' | 'minggu' | 'bulan'

export type BundleQuery = {
  /** 'YYYY-MM-DD' (WIB), inklusif. */
  from: string
  to: string
  /** Id subholding terpilih; null = semua subholding aktif. */
  subs: string[] | null
  /** Sertakan laporan MENUNGGU (berkas bertanda air DRAF). */
  drafts: boolean
  /** pdf = satu PDF gabungan; zip = satu PDF per subholding. */
  format: BundleFormat
  photos: boolean
  highlights: boolean
  comments: boolean
}

/** Rentang terpanjang dalam satu unduhan (hari, inklusif). */
export const MAX_RANGE_DAYS = 31
/** Laporan terbanyak dalam satu unduhan. */
export const MAX_BUNDLE_REPORTS = 300
/** Foto terbanyak yang disisipkan dalam satu unduhan; sisanya dicantumkan namanya. */
export const MAX_BUNDLE_PHOTOS = 120
/** Subholding terbanyak yang boleh disebut di parameter `subs`. */
export const MAX_BUNDLE_SUBS = 50

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function keyParts(key: string): [number, number, number] | null {
  if (!KEY_RE.test(key)) return null
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  // "2026-02-31" ditolak: Date menggesernya ke Maret.
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return [y, m, d]
}

export function isDateKey(key: unknown): key is string {
  return typeof key === 'string' && keyParts(key) !== null
}

function keyOf(t: Date): string {
  return t.toISOString().slice(0, 10)
}

/** Geser tanggal kalender `days` hari. */
export function shiftDateKey(key: string, days: number): string {
  const p = keyParts(key)
  if (!p) return key
  return keyOf(new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)))
}

/** Jumlah hari inklusif dari `from` sampai `to` (0 bila terbalik/tidak sah). */
export function daySpan(from: string, to: string): number {
  const a = keyParts(from)
  const b = keyParts(to)
  if (!a || !b) return 0
  const n = (Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000 + 1
  return n > 0 ? n : 0
}

/** Rentang periode Hari ini / Kemarin; Rentang tanggal memakai `custom`. */
export function periodRange(period: BundlePeriod, todayKey: string, custom: { from: string; to: string }): { from: string; to: string } {
  if (period === 'hari') return { from: todayKey, to: todayKey }
  if (period === 'kemarin') {
    const k = shiftDateKey(todayKey, -1)
    return { from: k, to: k }
  }
  return custom
}

/** Pintasan rentang: 7 hari terakhir, minggu ini (Senin–hari ini), bulan ini. */
export function quickRange(kind: QuickRange, todayKey: string): { from: string; to: string } {
  const p = keyParts(todayKey)
  if (!p) return { from: todayKey, to: todayKey }
  if (kind === '7hari') return { from: shiftDateKey(todayKey, -6), to: todayKey }
  if (kind === 'minggu') {
    const wd = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()
    return { from: shiftDateKey(todayKey, -((wd + 6) % 7)), to: todayKey }
  }
  return { from: `${todayKey.slice(0, 8)}01`, to: todayKey }
}

/** Galat rentang untuk pengguna, atau null bila sah. */
export function rangeError(from: string, to: string): string | null {
  if (!isDateKey(from) || !isDateKey(to)) return 'Tanggal harus berformat YYYY-MM-DD'
  if (from > to) return 'Tanggal awal harus sebelum tanggal akhir'
  if (daySpan(from, to) > MAX_RANGE_DAYS) return `Rentang paling lama ${MAX_RANGE_DAYS} hari`
  return null
}

const flag = (on: boolean) => (on ? '1' : '0')

/** Parameter kueri GET /api/sh/pdf/berkas. */
export function bundleSearch(q: BundleQuery): string {
  const sp = new URLSearchParams({ from: q.from, to: q.to })
  if (q.subs) sp.set('subs', q.subs.join(','))
  sp.set('drafts', flag(q.drafts))
  sp.set('format', q.format)
  sp.set('photos', flag(q.photos))
  sp.set('highlights', flag(q.highlights))
  sp.set('comments', flag(q.comments))
  return sp.toString()
}

/**
 * Kebalikan `bundleSearch`. `from` kosong = `todayKey`, `to` kosong = `from`.
 * Bendera yang tidak dikirim: foto/sorotan/komentar ya, DRAF tidak.
 */
export function parseBundleQuery(sp: URLSearchParams, todayKey: string): BundleQuery | { error: string } {
  const from = sp.get('from')?.trim() || todayKey
  const to = sp.get('to')?.trim() || from
  const bad = rangeError(from, to)
  if (bad) return { error: bad }

  const rawSubs = sp.get('subs')
  let subs: string[] | null = null
  if (rawSubs !== null && rawSubs.trim() !== '') {
    subs = [...new Set(rawSubs.split(',').map((s) => s.trim()).filter(Boolean))]
    if (!subs.length || subs.length > MAX_BUNDLE_SUBS || subs.some((s) => s.length > 64)) return { error: 'Pilihan subholding tidak valid' }
  }

  const format = sp.get('format') ?? 'pdf'
  if (format !== 'pdf' && format !== 'zip') return { error: 'Susunan berkas harus pdf atau zip' }

  const bool = (name: string, fallback: boolean): boolean | null => {
    const v = sp.get(name)
    if (v === null || v === '') return fallback
    return v === '1' ? true : v === '0' ? false : null
  }
  const drafts = bool('drafts', false)
  const photos = bool('photos', true)
  const highlights = bool('highlights', true)
  const comments = bool('comments', true)
  if (drafts === null || photos === null || highlights === null || comments === null) return { error: 'Pilihan isi tidak valid' }
  return { from, to, subs, drafts, format, photos, highlights, comments }
}

/**
 * Perkiraan ukuran berkas (bita): kerangka + teks per laporan + foto JPEG
 * 1200px (≈180 KB) sampai batas MAX_BUNDLE_PHOTOS.
 */
export function estimateBytes(reports: number, photos: number): number {
  if (reports <= 0) return 0
  return 40_000 + reports * 25_000 + Math.min(Math.max(photos, 0), MAX_BUNDLE_PHOTOS) * 180_000
}

/** "±18 MB" / "<1 MB". */
export function sizeLabel(bytes: number): string {
  const mb = bytes / 1_000_000
  return mb < 1 ? '<1 MB' : `±${Math.round(mb)} MB`
}

/** Bagian nama berkas yang aman: huruf, angka, tanda hubung. */
export function fileSlug(text: string, max = 60): string {
  return text
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, max)
}

/** Laporan-Subholding-2026-11-09.pdf · Laporan-Subholding-2026-11-02_sd_2026-11-09.zip. */
export function bundleFileName(q: Pick<BundleQuery, 'from' | 'to' | 'format'>, scope = 'Subholding'): string {
  const period = q.from === q.to ? q.from : `${q.from}_sd_${q.to}`
  return `Laporan-${fileSlug(scope) || 'Subholding'}-${period}.${q.format}`
}
