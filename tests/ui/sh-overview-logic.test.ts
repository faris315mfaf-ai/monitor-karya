import { describe, expect, it } from 'vitest'

/**
 * Dashboard Ketua Umum & Manajemen (kontrak subholding 16 Okt 2026, papan 6):
 * pengelompokan laporan per PT, ringkasan kartu "n laporan · m PT", tanggal
 * WIB Hari ini/Kemarin, dan navigasi lightbox (putaran, posisi, tombol panah).
 */

import {
  defaultOpen, groupByPt, initialOf, isImageMime, keyDelta, normalizePts, positionLabel, stepIndex, summaryLabel, wibDateKey,
  type FlatReport, type OverviewSubholding,
} from '@/components/views/sh-overview/logic'

const r = (id: string, ptId: string, ptName: string, evidence = 0): FlatReport => ({
  id,
  ptId,
  ptName,
  kegiatan: `Kegiatan ${id}`,
  deskripsi: `Deskripsi ${id}`,
  evidence: Array.from({ length: evidence }, (_, i) => ({ id: `${id}-e${i}`, fileName: `foto-${i}.jpg`, mime: 'image/jpeg' })),
})

describe('groupByPt', () => {
  it('mengelompokkan per PT, urut nama PT, urutan laporan dipertahankan', () => {
    const out = groupByPt([r('1', 'b', 'PT Beta'), r('2', 'a', 'PT Alfa'), r('3', 'b', 'PT Beta'), r('4', 'a', 'PT Alfa', 2)])
    expect(out.map((p) => p.name)).toEqual(['PT Alfa', 'PT Beta'])
    expect(out[0].reports.map((x) => x.id)).toEqual(['2', '4'])
    expect(out[1].reports.map((x) => x.id)).toEqual(['1', '3'])
    expect(out[0].reports[1].evidence).toHaveLength(2)
  })

  it('daftar kosong menghasilkan tanpa PT', () => {
    expect(groupByPt([])).toEqual([])
  })

  it('normalizePts menggabungkan PT ganda dari API dan membuang PT kosong', () => {
    const out = normalizePts([
      { id: 'a', name: 'PT Alfa', reports: [r('1', 'a', 'PT Alfa')] },
      { id: 'z', name: 'PT Zeta', reports: [] },
      { id: 'a', name: 'PT Alfa', reports: [r('2', 'a', 'PT Alfa')] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].reports.map((x) => x.id)).toEqual(['1', '2'])
  })
})

describe('ringkasan kartu subholding', () => {
  const sh = (count: number, ptCount: number, pts: OverviewSubholding['pts'] = []): OverviewSubholding => ({ id: 's', name: 'Subholding Energi', count, ptCount, pts })

  it('"n laporan · m PT" tanpa angka KPI lain', () => {
    expect(summaryLabel(sh(3, 2))).toBe('3 laporan · 2 PT')
  })
  it('subholding tanpa laporan tetap tampil dengan kalimat tenang', () => {
    expect(summaryLabel(sh(0, 0))).toBe('Belum ada laporan')
  })
  it('jumlah dari isi PT dipakai bila hitungan API tertinggal', () => {
    expect(summaryLabel(sh(0, 0, [{ id: 'a', name: 'PT A', reports: [r('1', 'a', 'PT A'), r('2', 'a', 'PT A')] }]))).toBe('2 laporan · 1 PT')
  })
  it('inisial kartu melewati awalan PT/Subholding', () => {
    expect(initialOf('Subholding Energi')).toBe('E')
    expect(initialOf('PT Agro Lestari')).toBe('A')
  })
  it('kartu terbuka bawaan: pilihan sebelumnya bila masih ada, selain itu yang pertama berisi', () => {
    const list = [{ ...sh(0, 0), id: 'x' }, { ...sh(2, 1), id: 'y' }]
    expect(defaultOpen(list, null)).toBe('y')
    expect(defaultOpen(list, 'x')).toBe('x')
    expect(defaultOpen(list, 'hilang')).toBe('y')
    expect(defaultOpen([{ ...sh(0, 0), id: 'x' }], null)).toBeNull()
  })
})

describe('tanggal WIB', () => {
  it('hari ini dan kemarin mengikuti WIB, bukan UTC', () => {
    // 15 Okt 2026 18.30 UTC = 16 Okt 01.30 WIB
    const now = new Date('2026-10-15T18:30:00Z')
    expect(wibDateKey(now)).toBe('2026-10-16')
    expect(wibDateKey(now, 1)).toBe('2026-10-15')
  })
  it('melewati batas bulan', () => {
    expect(wibDateKey(new Date('2026-11-01T03:00:00Z'), 1)).toBe('2026-10-31')
  })
})

describe('navigasi lightbox', () => {
  it('berikutnya dari foto terakhir kembali ke pertama, sebelumnya dari pertama ke terakhir', () => {
    expect(stepIndex(2, 1, 3)).toBe(0)
    expect(stepIndex(0, -1, 3)).toBe(2)
    expect(stepIndex(1, 1, 3)).toBe(2)
  })
  it('daftar kosong aman', () => {
    expect(stepIndex(0, 1, 0)).toBe(0)
    expect(positionLabel(0, 0)).toBe('')
  })
  it('label posisi "2 dari 5"', () => {
    expect(positionLabel(1, 5)).toBe('2 dari 5')
    expect(positionLabel(7, 5)).toBe('3 dari 5')
  })
  it('panah kiri/kanan berpindah, tombol lain diabaikan', () => {
    expect(keyDelta('ArrowLeft')).toBe(-1)
    expect(keyDelta('ArrowRight')).toBe(1)
    expect(keyDelta('Escape')).toBe(0)
    expect(keyDelta('Enter')).toBe(0)
  })
  it('hanya gambar yang ditampilkan sebagai foto; lainnya ikon dokumen', () => {
    expect(isImageMime('image/jpeg')).toBe(true)
    expect(isImageMime('IMAGE/PNG')).toBe(true)
    expect(isImageMime('application/pdf')).toBe(false)
    expect(isImageMime(null)).toBe(false)
  })
})
