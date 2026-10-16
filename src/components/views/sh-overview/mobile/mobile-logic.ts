/**
 * Logika murni layar ponsel dashboard Manajemen & Superuser
 * (KONTRAK-MANAJEMEN-MOBILE.md D3, 16 Okt 2026): label tanggal WIB,
 * pengelompokan daftar laporan, isi lembar pemilih, baris pola 7 hari,
 * serta fisika gestur (proyeksi momentum, ambang tutup). Tanpa React
 * supaya bisa diuji di Node.
 */

import {
  highlightFirst, isWeekend, matchesQuery, ptBuckets, scoped,
  type Filter, type FlatV2, type V2Data, type V2Subholding, type WeekData,
} from '../model'
import { displayName, subholdingLabel, toneOf, type Tone } from '../logic'
import { timeLabel } from '../detail-logic'
import type { OverviewRange } from '../screen-types'

/* ---------- Fisika gestur (Designing Fluid Interfaces, WWDC 2018) ---------- */

/** Laju perlambatan gulir normal. */
export const DECELERATION = 0.998

/**
 * Jarak tempuh lanjutan dari kecepatan lepas (px/s) bila benda dibiarkan
 * melambat seperti gulir: `(v/1000)·d/(1−d)`.
 */
export function project(velocity: number, rate = DECELERATION): number {
  if (!Number.isFinite(velocity)) return 0
  return ((velocity / 1000) * rate) / (1 - rate)
}

/** Kecepatan (px/s) ke arah sebaliknya yang dianggap "membatalkan" gestur. */
export const REVERSE_SPEED = 100

/** Porsi ukuran yang harus dilewati titik proyeksi agar lembar/layar ditutup. */
export const DISMISS_RATIO = 0.5

/**
 * Keputusan saat jari dilepas: tutup bila titik proyeksi (posisi + momentum)
 * melewati `ratio` ukuran. Bila jari sedang bergerak balik dengan jelas,
 * arah kecepatan yang menang — gestur dibatalkan walau posisinya sudah jauh.
 */
export function shouldDismiss(offset: number, velocity: number, size: number, ratio = DISMISS_RATIO): boolean {
  if (!Number.isFinite(size) || size <= 0) return false
  const v = Number.isFinite(velocity) ? velocity : 0
  if (v < -REVERSE_SPEED) return false
  const pos = Number.isFinite(offset) ? offset : 0
  return pos + project(v) > size * ratio
}

/** Lebar zona tepi kiri (px) tempat geser-kembali dimulai. */
export const EDGE_WIDTH = 20

/** Pegas navigasi: kritis (tanpa pantul), respons ±0,35 detik. */
export const NAV_SPRING = { type: 'spring', bounce: 0, duration: 0.35 } as const
/** Pengganti gerak untuk pengguna yang meminta gerak dikurangi: pudar singkat. */
export const FADE = { type: 'tween', ease: 'easeOut', duration: 0.2 } as const

/* ---------- Tanggal (kunci 'YYYY-MM-DD', kalender tanpa zona) ---------- */

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const
const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'] as const
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const

function parts(key: string): { y: number; m: number; d: number; wd: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '')
  if (!mm) return null
  const date = new Date(Date.UTC(Number(mm[1]), Number(mm[2]) - 1, Number(mm[3])))
  if (Number.isNaN(date.getTime())) return null
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate(), wd: date.getUTCDay() }
}

/** Geser kunci tanggal sebanyak `days` hari (boleh negatif). */
export function addDays(key: string, days: number): string {
  const p = parts(key)
  if (!p) return key
  return new Date(Date.UTC(p.y, p.m, p.d + days)).toISOString().slice(0, 10)
}

/** "Kamis, 15 Oktober". */
export function dayHeading(key: string): string {
  const p = parts(key)
  return p ? `${HARI[p.wd]}, ${p.d} ${BULAN[p.m]}` : ''
}

/** "Kam 15 Okt" untuk daftar sorotan 7 hari. */
export function shortDay(key: string): string {
  const p = parts(key)
  return p ? `${HARI_PENDEK[p.wd]} ${p.d} ${BULAN_PENDEK[p.m]}` : ''
}

/** Rentang panjang: "9–15 Oktober 2026", "28 September – 4 Oktober 2026", lintas tahun lengkap. */
export function weekRangeLabel(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  if (!a || !b) return ''
  if (a.y !== b.y) return `${a.d} ${BULAN[a.m]} ${a.y} – ${b.d} ${BULAN[b.m]} ${b.y}`
  if (a.m !== b.m) return `${a.d} ${BULAN[a.m]} – ${b.d} ${BULAN[b.m]} ${b.y}`
  return `${a.d}–${b.d} ${BULAN[b.m]} ${b.y}`
}

/** Rentang ringkas: "9–15 Okt" atau "28 Sep – 4 Okt". */
export function shortRange(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  if (!a || !b) return ''
  if (a.m !== b.m || a.y !== b.y) return `${a.d} ${BULAN_PENDEK[a.m]} – ${b.d} ${BULAN_PENDEK[b.m]}`
  return `${a.d}–${b.d} ${BULAN_PENDEK[b.m]}`
}

/** Kata hari untuk kalimat status: "hari ini" atau "kemarin". */
export function dayWord(range: OverviewRange): string {
  return range === 'yesterday' ? 'kemarin' : 'hari ini'
}

/* ---------- Nama ---------- */

/** Nama PT tanpa awalan "PT", mis. "Sentra Beton Perkasa". */
export function ptShort(name: string): string {
  const full = displayName(name)
  return full.replace(/^PT\.?\s+/i, '').trim() || full
}

/** Kata pertama label subholding, mis. "Sentra" — untuk lingkaran status dan tombol. */
export function subShort(name: string): string {
  return subholdingLabel(name).split(/\s+/)[0] || subholdingLabel(name)
}

/**
 * Label pendek yang saling berbeda untuk sederet subholding: kata pertama,
 * ditambah kata berikutnya hanya bila ada yang kembar ("Karya Agro" dan
 * "Karya Energi", bukan dua kali "Karya").
 */
export function subShorts(names: string[]): string[] {
  const words = names.map((n) => subholdingLabel(n).split(/\s+/).filter(Boolean))
  const take = names.map(() => 1)
  for (let round = 0; round < 6; round++) {
    const labels = words.map((w, i) => w.slice(0, take[i]).join(' '))
    let changed = false
    labels.forEach((l, i) => {
      if (labels.filter((x) => x === l).length > 1 && take[i] < words[i].length) {
        take[i]++
        changed = true
      }
    })
    if (!changed) return labels.map((l, i) => l || subholdingLabel(names[i]))
  }
  return words.map((w, i) => w.slice(0, take[i]).join(' ') || subholdingLabel(names[i]))
}

/** Huruf inisial lingkaran (huruf pertama label subholding). */
export function monoOf(name: string): string {
  return (subholdingLabel(name).charAt(0) || 'S').toUpperCase()
}

/** Gabung nama gaya Indonesia: "A", "A dan B", "A, B, dan C". */
export function joinNames(names: string[]): string {
  const list = names.filter(Boolean)
  if (list.length <= 1) return list[0] ?? ''
  if (list.length === 2) return `${list[0]} dan ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, dan ${list[list.length - 1]}`
}

/** Kalimat peringatan kartu status; lebih dari tiga nama diringkas "n lainnya". */
export function missingSentence(names: string[], range: OverviewRange): string {
  const list = names.filter(Boolean)
  if (list.length === 0) return ''
  if (list.length === 1) return `${list[0]} belum melapor ${dayWord(range)}`
  if (list.length <= 3) return `${joinNames(list)} belum melapor`
  return `${list.slice(0, 2).join(', ')}, dan ${list.length - 2} lainnya belum melapor`
}

/** Persentase batang progres (0–100, bulat). */
export function progressPct(done: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.round(Math.min(Math.max(done / total, 0), 1) * 100)
}

/** Label tombol kembali rincian: judul layar asal bila cukup pendek. */
export function backLabel(heading: string, max = 18): string {
  const h = (heading ?? '').trim()
  return h && h.length <= max ? h : 'Kembali'
}

/* ---------- Judul & penyaring ---------- */

export function findSub(data: V2Data | null | undefined, id: string | null): V2Subholding | null {
  if (!id) return null
  return data?.subholdings.find((s) => s.id === id) ?? null
}

/** Nama PT terpilih (dari daftar semua PT, cadangan PT yang melapor). */
export function ptNameOf(sub: V2Subholding | null, ptId: string | null): string | null {
  if (!sub || !ptId) return null
  const hit = (sub.allPts ?? []).find((p) => p.id === ptId) ?? sub.pts.find((p) => p.id === ptId)
  return hit ? displayName(hit.name) : null
}

/** Jumlah PT subholding (semua PT aktif bila tersedia). */
export function ptTotal(sub: V2Subholding | null): number {
  if (!sub) return 0
  return sub.allPts?.length ?? sub.pts.length
}

/** Judul besar: nama PT, nama subholding, atau "Ringkasan". */
export function screenHeading(data: V2Data | null | undefined, f: Filter): string {
  const sub = findSub(data, f.sub)
  if (!sub) return 'Ringkasan'
  return ptNameOf(sub, f.pt) ?? displayName(sub.name)
}

/* ---------- Daftar laporan ---------- */

/** Meta baris: "10.15 · Sentra Beton Perkasa" (tanpa penyaring) atau "10.15 · Hendra Wijaya". */
export function rowMeta(r: FlatV2, level: 'sub' | 'pt' | 'one'): string {
  const who = level === 'sub' ? ptShort(r.ptName) : r.reporterName?.trim()
  return [timeLabel(r.decidedAt ?? null), who].filter(Boolean).join(' · ')
}

export type ListGroup = {
  key: string
  name: string
  tone: Tone
  /** Teks kanan kepala kelompok, mis. "3 laporan" atau "Belum melapor". */
  countLabel: string
  rows: FlatV2[]
  /** Jumlah laporan yang tidak ditampilkan (batas per kelompok). */
  more: number
  moreLabel: string
  /** Penyaring yang dipasang saat kepala kelompok/“Lihat semua” diketuk; null = tidak bisa ditelusuri. */
  drill: Filter | null
}

/** Batas baris per subholding di tampilan "Semua". */
export const GROUP_LIMIT = 3

const reportsLabel = (n: number) => `${n} laporan`

/**
 * Kelompok daftar "Semua laporan" sesuai tingkat penyaring:
 * - tanpa penyaring: per subholding, maks `limit` baris (sorotan dulu) + "Lihat semua…",
 *   subholding tanpa laporan di akhir;
 * - subholding: per PT yang melapor (terbanyak dulu), semua baris;
 * - satu PT: satu kelompok tanpa telusur.
 */
export function buildGroups(
  data: V2Data | null | undefined,
  f: Filter,
  range: OverviewRange,
  limit = GROUP_LIMIT,
): { title: string; level: 'sub' | 'pt' | 'one'; groups: ListGroup[] } {
  const subs = data?.subholdings ?? []
  const sub = findSub(data, f.sub)
  if (!sub) {
    const all = scoped(data, { sub: null, pt: null })
    const groups = subs.map<ListGroup>((s) => {
      const rows = highlightFirst(all.filter((r) => r.subId === s.id))
      const cap = Math.max(0, Math.floor(limit))
      return {
        key: s.id,
        name: displayName(s.name),
        tone: toneOf(s.id),
        countLabel: rows.length ? reportsLabel(rows.length) : '',
        rows: rows.slice(0, cap),
        more: Math.max(0, rows.length - cap),
        moreLabel: `Lihat semua ${rows.length} laporan ${subShort(s.name)}`,
        drill: { sub: s.id, pt: null },
      }
    })
    const filled = groups.filter((g) => g.rows.length > 0)
    const empty = groups.filter((g) => g.rows.length === 0)
    return { title: 'Semua laporan', level: 'sub', groups: [...filled, ...empty] }
  }
  const tone = toneOf(sub.id)
  const inSub = scoped(data, { sub: sub.id, pt: null })
  if (!f.pt) {
    const groups = ptBuckets(sub).reporting.map<ListGroup>((p) => {
      const rows = highlightFirst(inSub.filter((r) => r.ptId === p.id))
      return {
        key: p.id, name: displayName(p.name), tone, countLabel: reportsLabel(rows.length),
        rows, more: 0, moreLabel: '', drill: { sub: sub.id, pt: p.id },
      }
    })
    return { title: 'Laporan per PT', level: 'pt', groups }
  }
  const rows = highlightFirst(inSub.filter((r) => r.ptId === f.pt))
  return {
    title: `Laporan ${dayWord(range)}`,
    level: 'one',
    groups: [{ key: f.pt, name: displayName(sub.name), tone, countLabel: '', rows, more: 0, moreLabel: '', drill: null }],
  }
}

/** Kartu sorotan dalam cakupan penyaring; `where` = asal laporan yang belum tersirat dari penyaring. */
export function highlightCards(data: V2Data | null | undefined, f: Filter): (FlatV2 & { where: string })[] {
  return scoped(data, f)
    .filter((r) => r.highlight)
    .map((r) => ({ ...r, where: f.sub ? displayName(r.ptName) : `${subholdingLabel(r.subName)} · ${ptShort(r.ptName)}` }))
}

/* ---------- Lembar pemilih ---------- */

export type PickItem = {
  key: string
  filter: Filter
  name: string
  detail: string
  /** Teks detail berwarna peringatan (belum melapor). */
  warn: boolean
  selected: boolean
  /** Lingkaran inisial (hanya subholding). */
  mono: { letter: string; tone: Tone } | null
}

export type PickSection = { key: string; title: string; warn: boolean; items: PickItem[] }

/** Isi lembar "Pilih subholding" (dengan "Semua subholding" di atas), disaring kata cari. */
export function subSections(data: V2Data | null | undefined, f: Filter, q: string): PickSection[] {
  const subs = data?.subholdings ?? []
  const total = scoped(data, { sub: null, pt: null }).length
  const items: PickItem[] = [
    {
      key: 'semua', filter: { sub: null, pt: null }, name: 'Semua subholding', detail: reportsLabel(total),
      warn: false, selected: !f.sub, mono: null,
    },
    ...subs.map<PickItem>((s) => {
      const n = s.pts.reduce((a, p) => a + p.reports.length, 0)
      return {
        key: s.id, filter: { sub: s.id, pt: null }, name: displayName(s.name),
        detail: `${ptTotal(s)} PT · ${n ? reportsLabel(n) : 'belum melapor'}`,
        warn: n === 0, selected: f.sub === s.id, mono: { letter: monoOf(s.name), tone: toneOf(s.id) },
      }
    }),
  ].filter((it) => matchesQuery(it.name, q))
  return [{ key: 'sub', title: 'Subholding', warn: false, items }]
}

/** Isi lembar "Pilih PT": bagian Melapor (dengan "Semua PT") dan Belum melapor. */
export function ptSections(sub: V2Subholding | null, f: Filter, q: string, range: OverviewRange): PickSection[] {
  if (!sub) return []
  const { reporting, silent } = ptBuckets(sub)
  const word = dayWord(range)
  const all: PickItem[] = matchesQuery('Semua PT', q)
    ? [{ key: 'semua', filter: { sub: sub.id, pt: null }, name: 'Semua PT', detail: `${ptTotal(sub)} PT`, warn: false, selected: !f.pt, mono: null }]
    : []
  const rep = reporting.filter((p) => matchesQuery(p.name, q)).map<PickItem>((p) => ({
    key: p.id, filter: { sub: sub.id, pt: p.id }, name: displayName(p.name),
    detail: `${reportsLabel(p.count)} ${word}`, warn: false, selected: f.pt === p.id, mono: null,
  }))
  const sil = silent.filter((p) => matchesQuery(p.name, q)).map<PickItem>((p) => ({
    key: p.id, filter: { sub: sub.id, pt: p.id }, name: displayName(p.name),
    detail: 'Belum ada laporan', warn: true, selected: f.pt === p.id, mono: null,
  }))
  return [
    { key: 'lapor', title: `Melapor ${word} · ${rep.length}`, warn: false, items: [...all, ...rep] },
    { key: 'diam', title: `Belum melapor · ${sil.length}`, warn: true, items: sil },
  ]
}

/* ---------- Pola 7 hari ---------- */

export type WeekCell = { kind: 'filled' | 'rest' | 'gap'; count: number; alpha: number; strong: boolean }

/** Intensitas isian kotak (0,2 + 0,15 per laporan, maks 0,85). */
export function cellAlpha(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.round(Math.min(0.2 + count * 0.15, 0.85) * 100) / 100
}

/** Kotak hari: terisi (intensitas), akhir pekan kosong (pudar), hari kerja kosong (garis peringatan). */
export function weekCell(count: number, dayKey: string): WeekCell {
  const n = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
  if (n > 0) return { kind: 'filled', count: n, alpha: cellAlpha(n), strong: n >= 3 }
  return { kind: isWeekend(dayKey) ? 'rest' : 'gap', count: 0, alpha: 0, strong: false }
}

export type WeekRow = { id: string; name: string; tone: Tone; counts: number[] }

/**
 * Baris pola 7 hari: tiap subholding, atau tiap PT bila subholding dipilih
 * (API mengirim `pts` saat dipanggil dengan subholdingId). PT terpilih →
 * hanya baris PT itu. Tanpa rincian PT → satu baris subholding.
 */
export function weekRows(week: WeekData | null | undefined, f: Filter): WeekRow[] {
  const subs = week?.subholdings ?? []
  const len = week?.days.length ?? 7
  const norm = (c: number[]) => Array.from({ length: len }, (_, i) => (Number.isFinite(c?.[i]) ? Math.max(0, c[i]) : 0))
  if (!f.sub) return subs.map((s) => ({ id: s.id, name: displayName(s.name), tone: toneOf(s.id), counts: norm(s.counts) }))
  const s = subs.find((x) => x.id === f.sub)
  if (!s) return []
  const tone = toneOf(s.id)
  if (!s.pts?.length) return [{ id: s.id, name: displayName(s.name), tone, counts: norm(s.counts) }]
  const pts = f.pt ? s.pts.filter((p) => p.id === f.pt) : s.pts
  // Awalan "PT" dibuang: baris sudah di bawah satu subholding dan lebarnya sempit.
  return pts.map((p) => ({ id: p.id, name: displayName(p.name).replace(/^PT\.?\s+/i, ''), tone, counts: norm(p.counts) }))
}

/** Label pembaca layar baris pola: "Sigma: 15 laporan dalam 7 hari. Kam 15 Okt 3, …". */
export function weekAria(name: string, days: string[], counts: number[]): string {
  const total = counts.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
  const perDay = days.map((d, i) => `${shortDay(d)} ${counts[i] ?? 0}`).join(', ')
  return `${name}: ${total} laporan dalam 7 hari. ${perDay}`
}

/** Sorotan 7 hari dalam cakupan penyaring (PT dicocokkan lewat nama, karena API hanya mengirim nama). */
export function weekHighlights(week: WeekData | null | undefined, f: Filter, ptName: string | null): WeekData['highlights'] {
  const list = week?.highlights ?? []
  const want = ptName ? displayName(ptName).toLowerCase() : null
  return list.filter((h) => (!f.sub || h.subholdingId === f.sub) && (!want || displayName(h.ptName).toLowerCase() === want))
}

/* ---------- Galeri ---------- */

/** Indeks slide galeri dari posisi gulir. */
export function slideIndex(scrollLeft: number, width: number, count: number): number {
  if (!Number.isFinite(width) || width <= 0 || count <= 0) return 0
  const i = Math.round((Number.isFinite(scrollLeft) ? scrollLeft : 0) / width)
  return Math.min(Math.max(i, 0), count - 1)
}

/** Penanda foto "2 / 5". */
export function counterLabel(index: number, count: number): string {
  if (count <= 0) return ''
  return `${Math.min(Math.max(index, 0), count - 1) + 1} / ${count}`
}
