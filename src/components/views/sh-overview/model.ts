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
  allPts?: { id: string; name: string }[]
}

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

/** Sorotan lebih dulu, lalu urutan asal (API: waktu setuju). Stabil. */
export function highlightFirst<T extends { highlight?: boolean }>(list: T[]): T[] {
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => Number(!!b.x.highlight) - Number(!!a.x.highlight) || a.i - b.i)
    .map((e) => e.x)
}

export type StatusSummary = {
  /** 'sub' = tingkat subholding, 'pt' = tingkat PT di subholding terpilih, 'one' = satu PT. */
  level: 'sub' | 'pt' | 'one'
  done: number
  total: number
  reports: number
  /** Nama yang belum melapor (subholding atau PT, sesuai tingkat). */
  missing: string[]
}

export function statusSummary(data: V2Data | null | undefined, f: Filter): StatusSummary {
  const subs = data?.subholdings ?? []
  if (!f.sub) {
    const done = subs.filter((s) => (s.pts ?? []).some((p) => p.reports.length > 0))
    return {
      level: 'sub', done: done.length, total: subs.length,
      reports: flatten(data).length,
      missing: subs.filter((s) => !done.includes(s)).map((s) => s.name),
    }
  }
  const sub = subs.find((s) => s.id === f.sub)
  if (!sub) return { level: 'sub', done: 0, total: 0, reports: 0, missing: [] }
  const withIds = new Set(sub.pts.filter((p) => p.reports.length > 0).map((p) => p.id))
  const all = sub.allPts ?? sub.pts.map((p) => ({ id: p.id, name: p.name }))
  if (!f.pt) {
    return {
      level: 'pt', done: withIds.size, total: all.length,
      reports: sub.pts.reduce((n, p) => n + p.reports.length, 0),
      missing: all.filter((p) => !withIds.has(p.id)).map((p) => p.name),
    }
  }
  const pt = sub.pts.find((p) => p.id === f.pt)
  const n = pt?.reports.length ?? 0
  return { level: 'one', done: n > 0 ? 1 : 0, total: 1, reports: n, missing: n > 0 ? [] : [all.find((p) => p.id === f.pt)?.name ?? ''] }
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

/* ---------- Penyaring tersimpan per perangkat ---------- */

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
