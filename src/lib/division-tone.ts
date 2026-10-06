/**
 * Warna divisi tetap (docs/design/02-warna.md "Seri data"): satu divisi = satu
 * warna di semua layar, semua peran, semua grafik. Dipetakan dari NAMA divisi,
 * bukan dari urutan tampil, supaya Divisi Keuangan tetap hijau walau daftarnya
 * disaring atau diurutkan ulang.
 *
 *   data-1 Teknologi · data-2 Keuangan · data-3 Media · data-4 SDM ·
 *   data-5 Operasional · data-6 Hukum
 *
 * Nama di luar enam keluarga itu mendapat seri dari hash namanya — stabil
 * antarlayar, walau bisa berbagi warna dengan divisi lain.
 */

export type DivisionTone = 'data-1' | 'data-2' | 'data-3' | 'data-4' | 'data-5' | 'data-6'

const SERIES: DivisionTone[] = ['data-1', 'data-2', 'data-3', 'data-4', 'data-5', 'data-6']

const RULES: [RegExp, DivisionTone][] = [
  [/teknolog|\bti\b|\bit\b|digital|sistem informasi/i, 'data-1'],
  [/keuangan|finans|finance|akuntansi|anggaran|perbendaharaan/i, 'data-2'],
  [/media|komunikasi|humas|pemasaran|marketing|kreatif|publikasi/i, 'data-3'],
  [/\bsdm\b|sumber daya manusia|\bhr\b|personalia|\bga\b|umum/i, 'data-4'],
  [/operasi|produksi|gudang|logistik/i, 'data-5'],
  [/hukum|legal|kepatuhan/i, 'data-6'],
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Seri warna untuk sebuah divisi berdasarkan namanya. */
export function divisionTone(name: string | null | undefined): DivisionTone {
  const n = (name ?? '').trim()
  if (!n) return 'data-1'
  for (const [re, tone] of RULES) if (re.test(n)) return tone
  return SERIES[hash(n.toLowerCase()) % SERIES.length]
}
