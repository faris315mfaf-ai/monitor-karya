/**
 * Logika murni layar tablet & desktop dashboard Manajemen/Superuser
 * (KONTRAK-MANAJEMEN-MOBILE.md bagian D4). Tanpa React supaya bisa diuji di
 * Node: tata letak panel menurut lebar kontainer, baris panel subholding dan
 * PT, isi konten (sorotan, kartu ringkas, blok per PT), dan tabel 7 hari.
 */

import type { DetailReport } from '../report-detail'
import { timeLabel } from '../detail-logic'
import { displayName, subholdingLabel, toneOf, type Tone } from '../logic'
import {
  dayLabel, highlightFirst, isWeekend, matchesQuery, ptBuckets, silentStreak, weekNote,
  type Filter, type FlatV2, type StatusSummary, type V2Data, type V2Subholding, type WeekData,
} from '../model'
import type { OverviewRange } from '../screen-types'

/* ---------- Tata letak ---------- */

/** Lebar kontainer minimum untuk tiga panel (subholding · PT · konten). */
export const THREE_PANE_MIN = 1000

export type PaneMode = 'three' | 'two'

/**
 * Lebar panel menurut lebar kontainer (bukan viewport: shell punya sidebar).
 * Tiga panel: subholding 300 saat "Semua" (panel PT disembunyikan), 250 saat
 * subholding dipilih, PT 290. Dua panel: panel kiri 268/300, menyempit di
 * kontainer < 760 supaya konten tetap lega.
 */
export function paneLayout(width: number, hasSub: boolean): { mode: PaneMode; sideW: number; ptW: number } {
  const w = Number.isFinite(width) ? width : 0
  if (w >= THREE_PANE_MIN) return { mode: 'three', sideW: hasSub ? 250 : 300, ptW: 290 }
  const narrow = w < 760
  return { mode: 'two', sideW: hasSub ? (narrow ? 264 : 300) : narrow ? 248 : 268, ptW: 0 }
}

/** Tinggi area panel: sisa layar di bawah posisi atas kontainer dikurangi padding bawah konten shell. */
export function fillHeight(viewport: number, top: number, padBottom: number, min = 480): number {
  const h = Math.round(viewport - Math.max(0, top) - Math.max(0, padBottom))
  return Number.isFinite(h) ? Math.max(min, h) : min
}

/** Kunci isi panel konten: berganti → transisi crossfade. */
export function contentKey(range: OverviewRange, f: Filter): string {
  return `${range}|${f.sub ?? 'semua'}|${f.pt ?? ''}`
}

/* ---------- Tanggal ---------- */

const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function parts(key: string): { y: number; m: number; d: number; wd: number } | null {
  const [y, m, d] = (key ?? '').split('-').map(Number)
  if (!y || !m || !d) return null
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { y, m: m - 1, d, wd }
}

/** "Kamis, 15 Oktober". */
export function dayHeading(key: string): string {
  const p = parts(key)
  return p ? `${HARI_PANJANG[p.wd]}, ${p.d} ${BULAN[p.m]}` : ''
}

/** "Kam 15 Okt" — kolom tanggal sorotan 7 hari. */
export function shortDay(key: string): string {
  const p = parts(key)
  return p ? `${dayLabel(key).short} ${BULAN_PENDEK[p.m]}` : ''
}

/** "9–15 Oktober 2026"; beda bulan "28 September – 4 Oktober 2026"; beda tahun lengkap di kedua sisi. */
export function weekRangeLabel(days: string[] | null | undefined): string {
  const a = parts(days?.[0] ?? '')
  const b = parts(days?.[days.length - 1] ?? '')
  if (!a || !b) return ''
  if (a.y !== b.y) return `${a.d} ${BULAN[a.m]} ${a.y} – ${b.d} ${BULAN[b.m]} ${b.y}`
  if (a.m !== b.m) return `${a.d} ${BULAN[a.m]} – ${b.d} ${BULAN[b.m]} ${b.y}`
  return `${a.d}–${b.d} ${BULAN[b.m]} ${b.y}`
}

/** Kata hari untuk teks: "hari ini" / "kemarin" (7 hari memakai data hari ini). */
export function dayWord(range: OverviewRange): string {
  return range === 'yesterday' ? 'kemarin' : 'hari ini'
}

/* ---------- Nama ---------- */

/** Nama PT ringkas tanpa awalan "PT" (daftar PT, kartu sorotan). */
export function ptShort(name: string): string {
  const full = displayName(name)
  return full.replace(/^PT\.?\s+/i, '').trim() || full
}

/** Gabung nama: maks `max` nama, sisanya "dan n lainnya". */
export function joinNames(names: string[], max = 3): string {
  const list = names.filter(Boolean)
  if (list.length <= max) return list.join(', ')
  return `${list.slice(0, max).join(', ')} dan ${list.length - max} lainnya`
}

/* ---------- Panel subholding ---------- */

export type SubRow = {
  id: string
  name: string
  tone: Tone
  reports: number
  highlights: number
  /** "9/25 PT · 12 laporan", "25 PT · belum melapor", atau ringkasan 7 hari. */
  line: string
  warn: boolean
}

function ptTotal(s: V2Subholding): number {
  return s.allPts?.length ?? Math.max(s.ptCount ?? 0, s.pts?.length ?? 0)
}

function reportsOf(s: V2Subholding): number {
  return (s.pts ?? []).reduce((n, p) => n + (p.reports?.length ?? 0), 0)
}

/** Baris navigasi subholding. Rentang 7 hari: jumlah 7 hari + peringatan bila hari kerja terakhir kosong. */
export function subRows(data: V2Data | null | undefined, week: WeekData | null | undefined, range: OverviewRange): SubRow[] {
  const base: { id: string; name: string }[] = data?.subholdings ?? week?.subholdings ?? []
  return base.map((b) => {
    const s = data?.subholdings.find((x) => x.id === b.id)
    const name = subholdingLabel(b.name)
    const tone = toneOf(b.id)
    if (range === 'week') {
      const w = week?.subholdings.find((x) => x.id === b.id)
      const counts = w?.counts ?? []
      const total = counts.reduce((a, c) => a + c, 0)
      const streak = week ? silentStreak(week.days, counts) : 0
      return {
        id: b.id, name, tone, reports: total, highlights: 0,
        line: !week ? 'Pola 7 hari' : streak > 0 ? `${streak} hari kerja belum melapor` : `${total} laporan · 7 hari`,
        warn: streak > 0,
      }
    }
    const reports = s ? reportsOf(s) : 0
    const done = (s?.pts ?? []).filter((p) => p.reports.length > 0).length
    const total = s ? ptTotal(s) : 0
    const highlights = (s?.pts ?? []).reduce((n, p) => n + p.reports.filter((r) => r.highlight).length, 0)
    const line = reports > 0
      ? `${done}/${total || done} PT · ${reports} laporan`
      : total > 0 ? `${total} PT · belum melapor` : 'Belum melapor'
    return { id: b.id, name, tone, reports, highlights, line, warn: reports === 0 }
  })
}

/** Keterangan baris "Semua subholding". */
export function allLine(data: V2Data | null | undefined, week: WeekData | null | undefined, range: OverviewRange): string {
  if (range === 'week') return weekRangeLabel(week?.days) || 'Pola 7 hari'
  const n = (data?.subholdings ?? []).reduce((a, s) => a + reportsOf(s), 0)
  return `${n} laporan`
}

/** Kartu status di panel subholding: "3 dari 5 melapor" + siapa yang belum. */
export function statusCard(sum: StatusSummary): { line: string; sub: string; tone: 'ok' | 'warn' } {
  const line = `${sum.done} dari ${sum.total} melapor`
  if (sum.missing.length === 0) {
    return { line, sub: sum.level === 'sub' ? 'Semua subholding sudah melapor' : 'Semua PT sudah melapor', tone: 'ok' }
  }
  const names = sum.level === 'sub' ? sum.missing.map(subholdingLabel) : sum.missing.map(ptShort)
  return { line, sub: `${joinNames(names)} belum melapor`, tone: 'warn' }
}

/* ---------- Panel PT ---------- */

export type PtItem = { id: string; name: string; count: number; highlights: number }

export type PtPanel = {
  /** "9 dari 25 melapor". */
  status: string
  reportingTitle: string
  silentTitle: string
  /** Baris "Semua PT" tampil (cocok dengan pencarian). */
  showAll: boolean
  total: number
  reporting: PtItem[]
  silent: PtItem[]
}

/** Daftar PT subholding: dibagi Melapor / Belum melapor, disaring pencarian; judul memakai jumlah penuh. */
export function ptPanel(sub: V2Subholding | null | undefined, q: string, range: OverviewRange): PtPanel {
  const { reporting, silent } = ptBuckets(sub)
  const all = sub ? ptTotal(sub) : 0
  const hit = (name: string) => matchesQuery(displayName(name), q)
  return {
    status: `${reporting.length} dari ${Math.max(all, reporting.length)} melapor`,
    reportingTitle: `Melapor ${dayWord(range)} · ${reporting.length}`,
    silentTitle: `Belum melapor · ${silent.length}`,
    showAll: matchesQuery('Semua PT', q),
    total: reporting.reduce((n, p) => n + p.count, 0),
    reporting: reporting.filter((p) => hit(p.name)),
    silent: silent.filter((p) => hit(p.name)).map((p) => ({ ...p, count: 0, highlights: 0 })),
  }
}

/** Nama PT dari id (PT melapor atau semua PT aktif). */
export function ptNameOf(sub: V2Subholding | null | undefined, ptId: string | null): string {
  if (!sub || !ptId) return ''
  return (sub.pts.find((p) => p.id === ptId) ?? sub.allPts?.find((p) => p.id === ptId))?.name ?? ''
}

/* ---------- Konten ---------- */

export type SubCard = { id: string; name: string; tone: Tone; count: number; top: FlatV2[]; empty: boolean }

/** Kartu ringkas per subholding (konten "Semua"): 3 laporan teratas (sorotan dulu); yang kosong di akhir. */
export function subCards(data: V2Data | null | undefined, list: FlatV2[], top = 3): SubCard[] {
  const cards = (data?.subholdings ?? []).map((s) => {
    const mine = list.filter((r) => r.subId === s.id)
    return { id: s.id, name: subholdingLabel(s.name), tone: toneOf(s.id), count: mine.length, top: highlightFirst(mine).slice(0, top), empty: mine.length === 0 }
  })
  return [...cards.filter((c) => !c.empty), ...cards.filter((c) => c.empty)]
}

export type PtBlock = { ptId: string; ptName: string; reports: FlatV2[] }

/** Laporan per PT: PT dengan laporan terbanyak dulu (lalu nama), laporan sorotan dulu di dalamnya. */
export function ptBlocks(list: FlatV2[]): PtBlock[] {
  const map = new Map<string, PtBlock>()
  for (const r of list) {
    const key = r.ptId || r.ptName
    let b = map.get(key)
    if (!b) {
      b = { ptId: r.ptId, ptName: r.ptName, reports: [] }
      map.set(key, b)
    }
    b.reports.push(r)
  }
  return [...map.values()]
    .sort((a, b) => b.reports.length - a.reports.length || a.ptName.localeCompare(b.ptName, 'id'))
    .map((b) => ({ ...b, reports: highlightFirst(b.reports) }))
}

/** Keterangan kepala konten subholding/PT. */
export function scopeMeta(opts: { reports: number; highlights: number; ptDone?: number; ptTotal?: number; range: OverviewRange }): string {
  const { reports, highlights, ptDone, ptTotal: total, range } = opts
  const hi = highlights > 0 ? ` · ${highlights} sorotan` : ''
  if (total === undefined) return reports > 0 ? `${reports} laporan ${dayWord(range)}${hi}` : `Belum melapor ${dayWord(range)}`
  if (reports === 0) return total > 0 ? `${total} PT · belum melapor ${dayWord(range)}` : `Belum melapor ${dayWord(range)}`
  return `${reports} laporan · ${ptDone ?? 0} dari ${total} PT melapor${hi}`
}

/** Meta baris laporan: "10.15 · Hendra Wijaya, Manajer Proyek"; bagian kosong dibuang. */
export function reportMeta(r: { decidedAt?: string | null; reporterName?: string; reporterTitle?: string }): string {
  const who = [r.reporterName?.trim(), r.reporterTitle?.trim()].filter(Boolean).join(', ')
  return [timeLabel(r.decidedAt ?? null), who].filter(Boolean).join(' · ')
}

/** Laporan datar → isi pop-up rincian (termasuk catatan sorotan). */
export function toDetail(r: FlatV2): DetailReport {
  return {
    id: r.id,
    kegiatan: r.kegiatan,
    deskripsi: r.deskripsi ?? '',
    ptName: displayName(r.ptName),
    subholdingName: subholdingLabel(r.subName),
    tone: toneOf(r.subId),
    evidence: r.evidence ?? [],
    reporterName: r.reporterName,
    reporterTitle: r.reporterTitle,
    decidedAt: r.decidedAt,
    highlight: Boolean(r.highlight),
    highlightNote: r.highlightNote ?? null,
  }
}

/* ---------- 7 hari ---------- */

export type HeatCell = { key: string; count: number; kind: 'filled' | 'gap' | 'weekend'; pct: number; aria: string }

/** Intensitas isian sel (persen campuran warna nada): naik per laporan, maks 60 supaya teks tinta tetap terbaca. */
export function heatPct(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.min(18 + Math.floor(count) * 12, 60)
}

export function heatCells(days: string[], counts: number[]): HeatCell[] {
  return days.map((key, i) => {
    const count = Math.max(0, Math.floor(counts[i] ?? 0))
    const kind: HeatCell['kind'] = count > 0 ? 'filled' : isWeekend(key) ? 'weekend' : 'gap'
    return { key, count, kind, pct: heatPct(count), aria: `${dayLabel(key).short}: ${count > 0 ? `${count} laporan` : 'tidak ada laporan'}` }
  })
}

export type WeekRow = { id: string; name: string; counts: number[]; note: ReturnType<typeof weekNote> }

/**
 * Baris tabel 7 hari: tiap subholding, atau tiap PT bila subholding dipilih
 * (bila API belum menyertakan PT, baris subholding itu saja). PT terpilih →
 * hanya baris PT itu.
 */
export function weekRows(week: WeekData | null | undefined, f: Filter): { level: 'sub' | 'pt'; rows: WeekRow[] } {
  if (!week) return { level: f.sub ? 'pt' : 'sub', rows: [] }
  const row = (id: string, name: string, counts: number[]): WeekRow => ({ id, name, counts, note: weekNote(week.days, counts) })
  if (!f.sub) return { level: 'sub', rows: week.subholdings.map((s) => row(s.id, subholdingLabel(s.name), s.counts)) }
  const sub = week.subholdings.find((s) => s.id === f.sub)
  if (!sub) return { level: 'pt', rows: [] }
  if (!sub.pts) return { level: 'sub', rows: [row(sub.id, subholdingLabel(sub.name), sub.counts)] }
  const pts = f.pt ? sub.pts.filter((p) => p.id === f.pt) : sub.pts
  return { level: 'pt', rows: pts.map((p) => row(p.id, ptShort(p.name), p.counts)) }
}

export type WeekHighlight = WeekData['highlights'][number] & { day: string; subShort: string }

/** Sorotan 7 hari dalam cakupan penyaring (PT dicocokkan lewat nama karena data sorotan tidak membawa id PT). */
export function weekHighlights(week: WeekData | null | undefined, f: Filter, ptName = ''): WeekHighlight[] {
  return (week?.highlights ?? [])
    .filter((h) => (!f.sub || h.subholdingId === f.sub) && (!f.pt || !ptName || h.ptName === ptName))
    .map((h) => ({ ...h, day: shortDay(h.date), subShort: subholdingLabel(h.subholdingName) }))
}
