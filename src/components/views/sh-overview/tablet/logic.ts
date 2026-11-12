/**
 * Logika murni layar tablet & desktop dashboard laporan disetujui
 * (KONTRAK-MANAJEMEN-MOBILE.md bagian D4). Tanpa React supaya bisa diuji di
 * Node: tata letak daftar + rincian tampilan Ringkas, label tanggal, baris
 * pemilih subholding, dan rincian laporan.
 */

import type { DetailReport } from '../report-detail'
import { displayName, subholdingLabel, toneOf, type Tone } from '../logic'
import type { FlatV2 } from '../model'

/* ---------- Tata letak ---------- */

/** Lebar kontainer minimum untuk daftar + rincian berdampingan (tampilan Ringkas). */
export const DAY_SPLIT_MIN = 760

/**
 * Tata letak tampilan Ringkas: ≥ DAY_SPLIT_MIN dua panel — daftar ±42%
 * (340–460px), sisanya rincian. Lebih sempit satu kolom; rincian di pop-up.
 */
export function dayLayout(width: number): { split: boolean; listW: number } {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0
  if (w < DAY_SPLIT_MIN) return { split: false, listW: w }
  return { split: true, listW: Math.min(460, Math.max(340, Math.round(w * 0.42))) }
}

/** Tinggi area panel: sisa layar di bawah posisi atas kontainer dikurangi padding bawah konten shell. */
export function fillHeight(viewport: number, top: number, padBottom: number, min = 480): number {
  const h = Math.round(viewport - Math.max(0, top) - Math.max(0, padBottom))
  return Number.isFinite(h) ? Math.max(min, h) : min
}

/* ---------- Tanggal ---------- */

const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

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

/** Keterangan waktu untuk kalimat: "hari ini", atau "pada Selasa, 10 November" untuk tanggal lain. */
export function dayWord(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'hari ini'
  const day = dayHeading(dateKey)
  return day ? `pada ${day}` : 'pada tanggal ini'
}

/* ---------- Pemilih subholding ---------- */

export type SubRow = {
  id: string
  name: string
  tone: Tone
  reports: number
  highlights: number
  /** Keterangan di bawah nama, mis. "3 menunggu". */
  line: string
  warn: boolean
}

/* ---------- Rincian ---------- */

/** Laporan datar → isi rincian (pop-up atau panel; termasuk catatan sorotan). */
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
