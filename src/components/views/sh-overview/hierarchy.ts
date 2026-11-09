/**
 * Dashboard Ketua Umum & Manajemen, opsi 2 "tinggal gulir" (canvas "Opsi
 * dashboard Ketum", 9 Nov 2026): subholding → PT → laporan, semuanya terbuka,
 * terbaru di atas. Logika murni tanpa React, dipakai layar ponsel dan tablet.
 *
 * Urutan: laporan menurut waktu disetujui menurun; PT dan subholding menurut
 * laporan terbarunya. Subholding/PT tanpa laporan di bawah, urut nama. PT yang
 * belum melapor ikut di subholdingnya (urutan ptCoverage: paling lama diam dulu).
 */

import { timeLabel } from './detail-logic'
import { wibDateKey } from './logic'
import { NO_FILTER, flatten, ptCoverage, type CoverageSilent, type FlatV2, type V2Data } from './model'

export type HierPt = {
  id: string
  name: string
  /** Laporan disetujui PT ini, terbaru dulu. */
  reports: FlatV2[]
  /** Jumlah laporan yang disorot supervisor. */
  highlights: number
  /** Waktu disetujui laporan terbaru (ISO) atau null. */
  lastAt: string | null
}

export type HierSub = {
  id: string
  name: string
  /** Jumlah laporan disetujui seluruh PT. */
  count: number
  lastAt: string | null
  /** PT yang melapor, terbaru dulu. */
  pts: HierPt[]
  /** PT aktif tanpa laporan pada tanggal itu. */
  silent: CoverageSilent[]
}

export type ReportingStatus = {
  /** PT yang punya laporan disetujui. */
  done: number
  /** Seluruh PT aktif. */
  total: number
  /** Jumlah laporan disetujui. */
  reports: number
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : -Infinity
}

/** Waktu menurun; seri (atau keduanya kosong) → `tie`. */
function byTimeDesc(a: string | null, b: string | null, tie: number): number {
  const ta = ms(a)
  const tb = ms(b)
  if (ta === tb) return tie
  return tb > ta ? 1 : -1
}

/**
 * Laporan terbaru dulu. API mengirim urutan naik (waktu setuju lalu waktu
 * ajuan), jadi pada waktu yang sama urutan masuk dibalik.
 */
export function newestFirst<T extends { decidedAt?: string | null }>(list: readonly T[]): T[] {
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => byTimeDesc(a.r.decidedAt ?? null, b.r.decidedAt ?? null, b.i - a.i))
    .map((x) => x.r)
}

const byLatest = (a: { lastAt: string | null; name: string }, b: { lastAt: string | null; name: string }) =>
  byTimeDesc(a.lastAt, b.lastAt, a.name.localeCompare(b.name, 'id'))

export function buildHierarchy(data: V2Data | null | undefined): HierSub[] {
  const silent = ptCoverage(data, NO_FILTER).silent
  const subs = (data?.subholdings ?? []).map((s): HierSub => {
    const pts = (s.pts ?? [])
      .filter((p) => p.reports?.length)
      .map((p): HierPt => {
        const reports = newestFirst(
          p.reports.map((r) => ({ ...r, subId: s.id, subName: s.name, ptId: p.id, ptName: p.name }))
        )
        return {
          id: p.id,
          name: p.name,
          reports,
          highlights: reports.filter((r) => r.highlight).length,
          lastAt: reports[0]?.decidedAt ?? null,
        }
      })
      .sort(byLatest)
    return {
      id: s.id,
      name: s.name,
      count: pts.reduce((n, p) => n + p.reports.length, 0),
      lastAt: pts[0]?.lastAt ?? null,
      pts,
      silent: silent.filter((p) => p.subId === s.id),
    }
  })
  return subs.sort(byLatest)
}

/** Kartu status: PT sudah melapor dari seluruh PT aktif + jumlah laporan. */
export function reportingStatus(data: V2Data | null | undefined): ReportingStatus {
  const c = ptCoverage(data, NO_FILTER)
  return { done: c.reporting.length, total: c.total, reports: flatten(data).length }
}

/** Bagian terisi (0–100) untuk bilah kemajuan. */
export function donePct(s: ReportingStatus): number {
  return s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 1000) / 10) : 0
}

const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/**
 * Waktu disetujui untuk laporan bertanggal `dateKey`: "16.02", atau
 * "16 Okt 12.44" bila disetujui di hari lain (laporan disetujui belakangan).
 */
export function approvedAt(iso: string | null | undefined, dateKey: string): string {
  const jam = timeLabel(iso)
  if (!jam || !iso) return ''
  const key = wibDateKey(new Date(iso))
  if (key === dateKey) return jam
  const [, m, d] = key.split('-').map(Number)
  return `${d} ${BULAN_PENDEK[m - 1]} ${jam}`
}

/**
 * Keterangan kepala subholding: "4 laporan · 3 dari 5 PT melapor · terakhir 10.42";
 * tanpa laporan: "Belum ada laporan disetujui · 4 PT".
 */
export function sectionMeta(s: HierSub, dateKey: string): string {
  const total = s.pts.length + s.silent.length
  if (!s.pts.length) return total ? `Belum ada laporan disetujui · ${total} PT` : 'Belum ada laporan disetujui'
  const when = approvedAt(s.lastAt, dateKey)
  return [`${s.count} laporan`, `${s.pts.length} dari ${total} PT melapor`, when && `terakhir ${when}`].filter(Boolean).join(' · ')
}

/** "2 laporan · terakhir 16.02". */
export function ptMeta(p: HierPt, dateKey: string): string {
  const when = approvedAt(p.lastAt, dateKey)
  return when ? `${p.reports.length} laporan · terakhir ${when}` : `${p.reports.length} laporan`
}
