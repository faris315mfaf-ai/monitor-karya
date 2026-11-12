/**
 * Dashboard Ketua Umum & Manajemen (canvas "Opsi dashboard Ketum", 9 Nov 2026):
 * subholding → PT → laporan, terbaru di atas. Dua tampilan memakai susunan
 * yang sama — "Semua terbuka" (opsi 2, tinggal gulir) dan "Ringkas" (opsi 1,
 * akordeon). Logika murni tanpa React, dipakai layar ponsel dan tablet.
 *
 * Urutan: laporan menurut waktu disetujui menurun; PT dan subholding menurut
 * laporan terbarunya. Subholding/PT tanpa laporan di bawah, urut nama. PT yang
 * belum melapor ikut di subholdingnya (urutan ptCoverage: paling lama diam dulu).
 *
 * Tampilan Ringkas: akordeon yang terbuka = Filter dashboard (tersimpan per
 * perangkat).
 */

import { timeLabel } from './detail-logic'
import { wibDateKey } from './logic'
import { NO_FILTER, flatten, ptCoverage, type CoverageSilent, type Filter, type FlatV2, type V2Data } from './model'

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

/** Akordeon awal sebelum pengguna memilih: subholding terbaru dengan PT terbarunya. */
export function defaultOpen(subs: readonly HierSub[]): Filter {
  const s = subs.find((x) => x.pts.length > 0)
  return s ? { sub: s.id, pt: s.pts[0].id } : NO_FILTER
}

/**
 * Akordeon yang terbuka. Filter tersimpan menang; tanpa filter, subholding
 * terbaru dibuka sampai pengguna menutupnya sendiri (`touched`).
 */
export function openState(subs: readonly HierSub[], filter: Filter, touched: boolean): Filter {
  if (filter.sub) return filter
  return touched ? NO_FILTER : defaultOpen(subs)
}

/** Ketuk kepala subholding: tutup bila terbuka, selain itu buka dengan PT terbarunya. */
export function toggleSub(sub: HierSub, open: Filter): Filter {
  if (open.sub === sub.id) return NO_FILTER
  return { sub: sub.id, pt: sub.pts[0]?.id ?? null }
}

/** Ketuk baris PT: tutup bila terbuka, selain itu buka (subholding tetap). */
export function togglePt(subId: string, ptId: string, open: Filter): Filter {
  return open.sub === subId && open.pt === ptId ? { sub: subId, pt: null } : { sub: subId, pt: ptId }
}

export function findReport(subs: readonly HierSub[], id: string | null | undefined): FlatV2 | null {
  if (!id) return null
  for (const s of subs) for (const p of s.pts) for (const r of p.reports) if (r.id === id) return r
  return null
}

/**
 * Laporan yang tampil di panel rincian tablet: pilihan pengguna bila masih
 * ada, selain itu laporan terbaru di PT terbuka → subholding terbuka → semua.
 */
export function selectedReport(subs: readonly HierSub[], open: Filter, picked: string | null): FlatV2 | null {
  const hit = findReport(subs, picked)
  if (hit) return hit
  const sub = open.sub ? subs.find((s) => s.id === open.sub) : undefined
  const pt = sub && open.pt ? sub.pts.find((p) => p.id === open.pt) : undefined
  return pt?.reports[0] ?? sub?.pts[0]?.reports[0] ?? subs.find((s) => s.pts.length)?.pts[0]?.reports[0] ?? null
}

/** "3 PT melapor · 2 belum" / "Belum ada laporan disetujui · 4 PT". */
export function subMeta(s: HierSub): string {
  if (!s.pts.length) return s.silent.length ? `Belum ada laporan disetujui · ${s.silent.length} PT` : 'Belum ada laporan disetujui'
  return s.silent.length ? `${s.pts.length} PT melapor · ${s.silent.length} belum` : `${s.pts.length} PT melapor`
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
