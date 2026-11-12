/**
 * Logika murni layar ponsel dashboard laporan disetujui
 * (KONTRAK-MANAJEMEN-MOBILE.md D3, 16 Okt 2026): label tanggal WIB, nama
 * pendek subholding, bentuk isi lembar pemilih, serta fisika gestur
 * (proyeksi momentum, ambang tutup). Tanpa React supaya bisa diuji di Node.
 */

import type { Filter } from '../model'
import { subholdingLabel, type Tone } from '../logic'

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
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'] as const

function parts(key: string): { y: number; m: number; d: number; wd: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '')
  if (!mm) return null
  const date = new Date(Date.UTC(Number(mm[1]), Number(mm[2]) - 1, Number(mm[3])))
  if (Number.isNaN(date.getTime())) return null
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate(), wd: date.getUTCDay() }
}

/** "Kamis, 15 Oktober". */
export function dayHeading(key: string): string {
  const p = parts(key)
  return p ? `${HARI[p.wd]}, ${p.d} ${BULAN[p.m]}` : ''
}

/* ---------- Nama ---------- */

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

/** Label tombol kembali rincian: judul layar asal bila cukup pendek. */
export function backLabel(heading: string, max = 18): string {
  const h = (heading ?? '').trim()
  return h && h.length <= max ? h : 'Kembali'
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
