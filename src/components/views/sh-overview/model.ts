/**
 * Model bersama dashboard Manajemen & Superuser versi tablet/ponsel
 * (KONTRAK-MANAJEMEN-MOBILE.md, 16 Okt 2026). Logika murni tanpa React:
 * penyaring subholding → PT, status melapor, sorotan, pengelompokan, dan
 * pola 7 hari. Layar ponsel (mobile/) dan tablet (tablet/) memakai modul ini.
 */

import type { OverviewEvidence } from './logic'

export type V2Report = {
  id: string
  kegiatan: string
  deskripsi: string
  reporterName?: string
  reporterTitle?: string
  decidedAt?: string | null
  /** Ditandai supervisor untuk manajemen. */
  highlight?: boolean
  highlightNote?: string | null
  evidence: OverviewEvidence[]
}

export type V2Pt = { id: string; name: string; reports: V2Report[] }

export type V2Subholding = {
  id: string
  name: string
  count: number
  ptCount: number
  /** PT yang punya laporan disetujui pada tanggal itu. */
  pts: V2Pt[]
  /** Semua PT aktif di bawah subholding (untuk penyaring dan "belum melapor"). */
  allPts?: V2AllPt[]
}

/** PT aktif di bawah subholding; `lastReportDate` = laporan disetujui terakhir sebelum tanggal terpilih (90 hari, null bila tak ada). */
export type V2AllPt = { id: string; name: string; lastReportDate?: string | null }

export type V2Data = { date: string; subholdings: V2Subholding[] }

export type WeekData = {
  start: string
  end: string
  /** Tujuh kunci tanggal WIB 'YYYY-MM-DD', urut naik; terakhir = `end`. */
  days: string[]
  subholdings: { id: string; name: string; counts: number[]; pts?: { id: string; name: string; counts: number[] }[] }[]
  highlights: { id: string; date: string; kegiatan: string; subholdingId: string; subholdingName: string; ptName: string; highlightNote: string | null }[]
}

export type Filter = { sub: string | null; pt: string | null }
export const NO_FILTER: Filter = { sub: null, pt: null }

/** Laporan datar beserta letaknya. */
export type FlatV2 = V2Report & { subId: string; subName: string; ptId: string; ptName: string }

export function flatten(data: V2Data | null | undefined): FlatV2[] {
  const out: FlatV2[] = []
  for (const s of data?.subholdings ?? []) {
    for (const p of s.pts ?? []) {
      for (const r of p.reports ?? []) out.push({ ...r, subId: s.id, subName: s.name, ptId: p.id, ptName: p.name })
    }
  }
  return out
}

/** Penyaring yang masih sah terhadap data (subholding/PT bisa hilang atau dinonaktifkan). */
export function validFilter(data: V2Data | null | undefined, f: Filter): Filter {
  if (!data || !f.sub) return NO_FILTER
  const sub = data.subholdings.find((s) => s.id === f.sub)
  if (!sub) return NO_FILTER
  if (!f.pt) return { sub: sub.id, pt: null }
  const known = (sub.allPts ?? sub.pts).some((p) => p.id === f.pt)
  return { sub: sub.id, pt: known ? f.pt : null }
}

/** Laporan dalam cakupan penyaring. */
export function scoped(data: V2Data | null | undefined, f: Filter): FlatV2[] {
  return flatten(data).filter((r) => (!f.sub || r.subId === f.sub) && (!f.pt || r.ptId === f.pt))
}

/** PT subholding dibagi: melapor (urut jumlah laporan menurun, lalu nama) dan belum. */
export function ptBuckets(sub: V2Subholding | null | undefined): {
  reporting: { id: string; name: string; count: number; highlights: number }[]
  silent: { id: string; name: string }[]
} {
  if (!sub) return { reporting: [], silent: [] }
  const reporting = sub.pts
    .filter((p) => p.reports.length > 0)
    .map((p) => ({ id: p.id, name: p.name, count: p.reports.length, highlights: p.reports.filter((r) => r.highlight).length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'id'))
  const ids = new Set(reporting.map((p) => p.id))
  const silent = (sub.allPts ?? []).filter((p) => !ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'id'))
  return { reporting, silent }
}

/** Cocok pencarian (tanpa beda huruf besar/kecil, mengabaikan awalan "PT "). */
export function matchesQuery(name: string, q: string): boolean {
  const n = q.trim().toLowerCase()
  if (!n) return true
  const s = name.toLowerCase()
  return s.includes(n) || s.replace(/^pt\.?\s+/, '').includes(n)
}

/** Hari Sabtu/Minggu untuk kunci 'YYYY-MM-DD' (kalender, tanpa zona). */
export function isWeekend(key: string): boolean {
  const [y, m, d] = key.split('-').map(Number)
  const day = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()
  return day === 0 || day === 6
}

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const HURUF = ['M', 'S', 'S', 'R', 'K', 'J', 'S']

/** Label kolom hari: { short: 'Kam 15', letter: 'K' }. */
export function dayLabel(key: string): { short: string; letter: string } {
  const [y, m, d] = key.split('-').map(Number)
  const day = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()
  return { short: `${HARI[day]} ${d}`, letter: HURUF[day] }
}

/** Hari kerja berturut-turut tanpa laporan, dihitung mundur dari hari terakhir (akhir pekan dilewati). */
export function silentStreak(days: string[], counts: number[]): number {
  let n = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (isWeekend(days[i])) continue
    if ((counts[i] ?? 0) > 0) break
    n++
  }
  return n
}

/** Catatan baris pola 7 hari. */
export function weekNote(days: string[], counts: number[]): { text: string; tone: 'warn' | 'strong-warn' | 'muted' } {
  const streak = silentStreak(days, counts)
  if (streak >= 2) return { text: `${streak} hari kerja berturut-turut belum melapor`, tone: 'strong-warn' }
  if (streak === 1) return { text: 'Belum melapor hari ini', tone: 'warn' }
  const total = counts.reduce((a, b) => a + b, 0)
  return { text: `${total} laporan dalam 7 hari`, tone: 'muted' }
}

/* ---------- Kategori PT: sudah / belum melapor (lintas subholding) ---------- */

const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Jendela pencarian "terakhir melapor" di server (hari). */
export const LAST_REPORT_WINDOW_DAYS = 90

export type CoverageReporting = {
  id: string
  name: string
  subId: string
  subName: string
  /** Jumlah laporan disetujui pada tanggal itu. */
  count: number
  /** Berapa di antaranya yang disorot supervisor. */
  highlights: number
  /** Waktu disetujui terakhir (ISO) atau null bila tak tercatat. */
  lastAt: string | null
}

export type CoverageSilent = {
  id: string
  name: string
  subId: string
  subName: string
  /** 'YYYY-MM-DD' laporan disetujui terakhir sebelum tanggal itu (90 hari); null = tidak ada. */
  lastReportDate: string | null
}

export type Coverage = { reporting: CoverageReporting[]; silent: CoverageSilent[]; total: number }

const byNameId = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'id')

function isoMs(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : -Infinity
}

function keyMs(key: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '')
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(t) ? null : t
}

/**
 * Hari kerja (Sen–Jum) dari hari SETELAH `lastReportDate` sampai `dateKey`
 * inklusif. null bila PT tidak pernah melapor dalam jendela (lastReportDate
 * null) atau kunci tanggal tidak sah; 0 bila hanya akhir pekan yang lewat.
 */
export function silentDays(dateKey: string, lastReportDate: string | null | undefined): number | null {
  if (!lastReportDate) return null
  const from = keyMs(lastReportDate)
  const to = keyMs(dateKey)
  if (from === null || to === null) return null
  let n = 0
  for (let t = from + 86_400_000, guard = 0; t <= to && guard < 800; t += 86_400_000, guard++) {
    const d = new Date(t).getUTCDay()
    if (d !== 0 && d !== 6) n++
  }
  return n
}

/** 'terakhir melapor Rab 22 Okt' atau 'belum ada laporan dalam 90 hari'. */
export function lastReportLabel(lastReportDate: string | null | undefined): string {
  if (!lastReportDate) return `belum ada laporan dalam ${LAST_REPORT_WINDOW_DAYS} hari`
  const t = keyMs(lastReportDate)
  if (t === null) return `belum ada laporan dalam ${LAST_REPORT_WINDOW_DAYS} hari`
  const d = new Date(t)
  return `terakhir melapor ${HARI[d.getUTCDay()]} ${d.getUTCDate()} ${BULAN_PENDEK[d.getUTCMonth()]}`
}

/**
 * Cakupan pelaporan PT lintas subholding menurut penyaring (subholding →
 * hanya itu; PT → hanya PT itu).
 *  - reporting: PT dengan laporan disetujui pada tanggal data; sorotan dulu,
 *    lalu jumlah laporan menurun, lalu nama.
 *  - silent: PT aktif tanpa laporan; yang tak pernah melapor dalam jendela di
 *    atas, lalu hari kerja diam menurun, lalu nama.
 */
export function ptCoverage(data: V2Data | null | undefined, f: Filter): Coverage {
  const reporting: CoverageReporting[] = []
  const silent: CoverageSilent[] = []
  for (const s of data?.subholdings ?? []) {
    if (f.sub && s.id !== f.sub) continue
    const done = new Set<string>()
    for (const p of s.pts ?? []) {
      if (f.pt && p.id !== f.pt) continue
      if (!p.reports?.length) continue
      done.add(p.id)
      let lastAt: string | null = null
      for (const r of p.reports) if (r.decidedAt && isoMs(r.decidedAt) > isoMs(lastAt)) lastAt = r.decidedAt
      reporting.push({
        id: p.id, name: p.name, subId: s.id, subName: s.name,
        count: p.reports.length, highlights: p.reports.filter((r) => r.highlight).length, lastAt,
      })
    }
    for (const p of s.allPts ?? []) {
      if (f.pt && p.id !== f.pt) continue
      if (done.has(p.id)) continue
      silent.push({ id: p.id, name: p.name, subId: s.id, subName: s.name, lastReportDate: p.lastReportDate ?? null })
    }
  }
  reporting.sort((a, b) => Number(b.highlights > 0) - Number(a.highlights > 0) || b.count - a.count || byNameId(a, b))
  const date = data?.date ?? ''
  const rank = (r: CoverageSilent) => (r.lastReportDate ? (silentDays(date, r.lastReportDate) ?? 0) : Infinity)
  silent.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    return ra === rb ? byNameId(a, b) : ra > rb ? -1 : 1
  })
  return { reporting, silent, total: reporting.length + silent.length }
}

/* ---------- Pilihan tersimpan per perangkat ---------- */

/** Tampilan rentang hari: 'gulir' = Semua terbuka (opsi 2, bawaan), 'ringkas' = akordeon (opsi 1). */
export type DayView = 'gulir' | 'ringkas'

const VIEW_KEY = 'mk:sh-overview:tampilan'

export function loadDayView(): DayView {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(VIEW_KEY) === 'ringkas' ? 'ringkas' : 'gulir'
  } catch {
    return 'gulir'
  }
}

export function saveDayView(v: DayView): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* penyimpanan diblokir: pilihan cukup berlaku selama sesi */
  }
}

const KEY = 'mk:sh-overview:filter'

export function loadFilter(): Filter {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null
    if (!raw) return NO_FILTER
    const j = JSON.parse(raw) as Partial<Filter>
    return { sub: typeof j.sub === 'string' ? j.sub : null, pt: typeof j.pt === 'string' ? j.pt : null }
  } catch {
    return NO_FILTER
  }
}

export function saveFilter(f: Filter): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    /* penyimpanan diblokir: pilihan cukup berlaku selama sesi */
  }
}
