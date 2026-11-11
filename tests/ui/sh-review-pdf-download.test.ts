import { describe, expect, it } from 'vitest'
import {
  fileNameFromDisposition, isPicked, selectionFile, selectionHeadline, selectionOf, subReports, toggleSubPick,
  type BundleSummary,
} from '@/components/views/sh-review/pdf-download-logic'

/** Lembar "Unduh laporan PDF" Supervisor — logika pilihan & ringkasan. */

const SUMMARY: BundleSummary = {
  from: '2026-11-09',
  to: '2026-11-09',
  canDrafts: true,
  subholdings: [
    { id: 'e', name: 'Karya Energi', approved: 5, pending: 1, photosApproved: 8, photosPending: 2 },
    { id: 'l', name: 'Karya Logistik', approved: 4, pending: 0, photosApproved: 3, photosPending: 0 },
    { id: 'p', name: 'Karya Properti', approved: 0, pending: 1, photosApproved: 0, photosPending: 4 },
  ],
}
const IDS = ['e', 'l', 'p']

describe('pilihan subholding', () => {
  it('null = semua; melepas satu menjadi daftar; mencentang semua kembali null', () => {
    expect(isPicked(null, 'x')).toBe(true)
    const a = toggleSubPick(null, 'l', IDS)
    expect(a).toEqual(['e', 'p'])
    expect(isPicked(a, 'l')).toBe(false)
    expect(toggleSubPick(a, 'l', IDS)).toBeNull()
    expect(toggleSubPick([], 'p', IDS)).toEqual(['p'])
    expect(toggleSubPick(['p'], 'p', IDS)).toEqual([])
    // Urutan mengikuti daftar subholding, bukan urutan klik.
    expect(toggleSubPick(['p'], 'e', IDS)).toEqual(['e', 'p'])
  })

  it('subReports ikut pilihan DRAF', () => {
    expect(subReports(SUMMARY.subholdings[0], false)).toBe(5)
    expect(subReports(SUMMARY.subholdings[0], true)).toBe(6)
  })
})

describe('ringkasan bawah', () => {
  it('jumlah laporan, foto, dan berkas zip', () => {
    expect(selectionOf(SUMMARY, null, false)).toEqual({ subs: 3, reports: 9, photos: 11, files: 2 })
    expect(selectionOf(SUMMARY, null, true)).toEqual({ subs: 3, reports: 11, photos: 17, files: 3 })
    expect(selectionOf(SUMMARY, ['p'], false)).toEqual({ subs: 1, reports: 0, photos: 0, files: 0 })
  })

  it('kalimat: kosong, tanpa laporan, jumlah + ukuran', () => {
    expect(selectionHeadline(selectionOf(SUMMARY, [], false), true)).toBe('Pilih minimal satu subholding')
    expect(selectionHeadline(selectionOf(SUMMARY, ['p'], false), true)).toBe('Tidak ada laporan pada periode ini')
    expect(selectionHeadline(selectionOf(SUMMARY, null, false), true)).toBe('9 laporan · 3 subholding · ±2 MB')
    expect(selectionHeadline(selectionOf(SUMMARY, null, false), false)).toBe('9 laporan · 3 subholding · <1 MB')
  })

  it('nama berkas: gabungan, satu subholding, zip', () => {
    const sel = selectionOf(SUMMARY, null, false)
    const day = { from: '2026-11-09', to: '2026-11-09' }
    expect(selectionFile(sel, { ...day, format: 'pdf' }, null)).toBe('Laporan-Subholding-2026-11-09.pdf')
    expect(selectionFile(sel, { ...day, format: 'pdf' }, 'Karya Energi')).toBe('Laporan-Karya-Energi-2026-11-09.pdf')
    expect(selectionFile(sel, { ...day, format: 'zip' }, null)).toBe('Laporan-Subholding-2026-11-09.zip · 2 PDF')
    expect(selectionFile(selectionOf(SUMMARY, [], false), { ...day, format: 'pdf' }, null)).toBe('')
  })
})

describe('fileNameFromDisposition', () => {
  it('utamakan filename* UTF-8, lalu filename', () => {
    expect(fileNameFromDisposition(`attachment; filename="a.pdf"; filename*=UTF-8''L%C3%A9-b.pdf`)).toBe('Lé-b.pdf')
    expect(fileNameFromDisposition('attachment; filename="Laporan.zip"')).toBe('Laporan.zip')
    expect(fileNameFromDisposition('attachment; filename=Laporan.pdf')).toBe('Laporan.pdf')
    expect(fileNameFromDisposition(null)).toBeNull()
    expect(fileNameFromDisposition('attachment')).toBeNull()
  })
})
