import { describe, expect, it } from 'vitest'

/**
 * Dashboard Superuser & Manajemen (kontrak subholding 16 Okt 2026, papan 6):
 * pengelompokan laporan per PT, ringkasan kartu "n laporan · m PT", tanggal
 * WIB Hari ini/Kemarin, dan navigasi lightbox (putaran, posisi, tombol panah).
 */

import {
  anchorId, cardMeta, displayName, docsOf, groupByPt, heroLabel, initialOf, isImageMime, keyDelta, normalizePts, photosOf,
  positionLabel, splitSubholdings, stepIndex, subholdingLabel, thumbStack, toneOf, toneVars, wibDateKey,
  type FlatReport, type OverviewEvidence, type OverviewSubholding,
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

  it('"n laporan · m PT" dari hitungan API bila rincian PT belum ada', () => {
    expect(cardMeta(sh(3, 2))).toBe('3 laporan · 2 PT')
  })
  it('subholding tanpa laporan: kalimat tenang', () => {
    expect(cardMeta(sh(0, 0))).toBe('Belum ada laporan disetujui')
    expect(cardMeta(sh(0, 0, [{ id: 'z', name: 'PT Z', reports: [] }]))).toBe('Belum ada laporan disetujui')
  })
  it('jumlah dari isi PT dipakai bila hitungan API tertinggal', () => {
    expect(cardMeta(sh(0, 0, [{ id: 'a', name: 'PT A', reports: [r('1', 'a', 'PT A'), r('2', 'a', 'PT A')] }]))).toBe('2 laporan · 1 PT')
  })
  it('PT dihitung dari PT yang punya laporan, PT ganda digabung', () => {
    const pts = [
      { id: 'a', name: 'PT A', reports: [r('1', 'a', 'PT A')] },
      { id: 'b', name: 'PT B', reports: [] },
      { id: 'a', name: 'PT A', reports: [r('2', 'a', 'PT A')] },
      { id: 'c', name: 'PT C', reports: [r('3', 'c', 'PT C')] },
    ]
    expect(cardMeta(sh(3, 5, pts))).toBe('3 laporan · 2 PT')
  })
  it('hitungan API lebih besar dari isi tetap dipakai', () => {
    expect(cardMeta(sh(5, 1, [{ id: 'a', name: 'PT A', reports: [r('1', 'a', 'PT A')] }]))).toBe('5 laporan · 1 PT')
  })
  it('tanpa jumlah PT sama sekali hanya menyebut laporan', () => {
    expect(cardMeta(sh(2, 0))).toBe('2 laporan')
  })
  it('inisial kartu melewati awalan PT/Subholding', () => {
    expect(initialOf('Subholding Energi')).toBe('E')
    expect(initialOf('PT Agro Lestari')).toBe('A')
  })
  it('splitSubholdings memisahkan berisi dan kosong, urutan masuk dipertahankan', () => {
    const list = [
      { ...sh(0, 0), id: 'k1' },
      { ...sh(2, 1), id: 'f1' },
      { ...sh(0, 0, [{ id: 'a', name: 'PT A', reports: [r('1', 'a', 'PT A')] }]), id: 'f2' },
      { ...sh(0, 0, [{ id: 'b', name: 'PT B', reports: [] }]), id: 'k2' },
      { ...sh(1, 1), id: 'f3' },
    ]
    const { filled, empty } = splitSubholdings(list)
    expect(filled.map((s) => s.id)).toEqual(['f1', 'f2', 'f3'])
    expect(empty.map((s) => s.id)).toEqual(['k1', 'k2'])
  })
  it('splitSubholdings aman untuk daftar kosong/null', () => {
    expect(splitSubholdings([])).toEqual({ filled: [], empty: [] })
    expect(splitSubholdings(null)).toEqual({ filled: [], empty: [] })
  })
  it('anchorId berawalan "sh-"', () => {
    expect(anchorId('abc123')).toBe('sh-abc123')
    expect(anchorId('')).toBe('sh-')
  })
})

describe('displayName', () => {
  it('nama kapital semua → title case, PT dan Tbk dipertahankan', () => {
    expect(displayName('PT ANUGERAH JAYA TBK')).toBe('PT Anugerah Jaya Tbk')
    expect(displayName('CV MAJU BERSAMA')).toBe('CV Maju Bersama')
  })
  it('Persero dengan dan tanpa kurung', () => {
    expect(displayName('PT BANK RAKYAT INDONESIA (PERSERO) TBK')).toBe('PT Bank Rakyat Indonesia (Persero) Tbk')
    expect(displayName('PERSERO BATAM')).toBe('Persero Batam')
  })
  it('singkatan ≤3 huruf tanpa vokal tetap kapital', () => {
    expect(displayName('PT BPR SEJAHTERA')).toBe('PT BPR Sejahtera')
    expect(displayName('KSP MANDIRI')).toBe('KSP Mandiri')
    expect(displayName('RS SEHAT')).toBe('RS Sehat')
  })
  it('kata pendek bervokal tetap di-title-case', () => {
    expect(displayName('PT ABU DAN API')).toBe('PT Abu Dan Api')
  })
  it('angka dan romawi tetap', () => {
    expect(displayName('PT PELABUHAN INDONESIA II')).toBe('PT Pelabuhan Indonesia II')
    expect(displayName('PT PERKEBUNAN NUSANTARA III')).toBe('PT Perkebunan Nusantara III')
    expect(displayName('SEKTOR IV DAN XI')).toBe('Sektor IV Dan XI')
    expect(displayName('PT MEDIA 24 JAM')).toBe('PT Media 24 Jam')
    expect(displayName('PT 3D VISI')).toBe('PT 3D Visi')
  })
  it('batas kata setelah tanda hubung, garis miring, dan titik', () => {
    expect(displayName('PT SUMBER-ALAM/RAYA')).toBe('PT Sumber-Alam/Raya')
    expect(displayName('PT. KARYA.UTAMA')).toBe('PT. Karya.Utama')
  })
  it('apostrof tetap di dalam kata', () => {
    expect(displayName("PT JUM'AT BERKAH")).toBe("PT Jum'at Berkah")
  })
  it('unicode kapital diubah dengan benar', () => {
    expect(displayName('PT ÉLAN ÖSTERREICH')).toBe('PT Élan Österreich')
  })
  it('nama campuran dibiarkan (hanya spasi dirapikan)', () => {
    expect(displayName('PT Lintas Indonesia')).toBe('PT Lintas Indonesia')
    expect(displayName('  PT   Lintas   INDONESIA ')).toBe('PT Lintas INDONESIA')
    expect(displayName('pt huruf kecil')).toBe('pt huruf kecil')
  })
  it('spasi dirapikan pada nama kapital', () => {
    expect(displayName('  SUBHOLDING    ENERGI  ')).toBe('Subholding Energi')
    expect(displayName('PT\tAGRO\nLESTARI')).toBe('PT Agro Lestari')
  })
  it('string kosong, spasi, dan tanpa huruf aman', () => {
    expect(displayName('')).toBe('')
    expect(displayName('   ')).toBe('')
    expect(displayName(' 123 - 45 ')).toBe('123 - 45')
  })
})

describe('subholdingLabel', () => {
  it('membuang awalan "Subholding " tak peka huruf', () => {
    expect(subholdingLabel('Subholding Energi')).toBe('Energi')
    expect(subholdingLabel('SUBHOLDING ENERGI DAN TAMBANG')).toBe('Energi Dan Tambang')
    expect(subholdingLabel('subholding Agro')).toBe('Agro')
    expect(subholdingLabel('Sub-holding Media')).toBe('Media')
  })
  it('tanpa awalan dibiarkan, hanya diberi displayName', () => {
    expect(subholdingLabel('PT LINTAS INDONESIA')).toBe('PT Lintas Indonesia')
    expect(subholdingLabel('Holding Properti')).toBe('Holding Properti')
  })
  it('hasil kosong kembali ke displayName', () => {
    expect(subholdingLabel('SUBHOLDING')).toBe('Subholding')
    expect(subholdingLabel('Subholding   ')).toBe('Subholding')
    expect(subholdingLabel('')).toBe('')
  })
})

describe('nada warna kartu', () => {
  const ids = ['cmg1a2b3c0001', 'cmg1a2b3c0002', 'sh-energi', 'sh-agro', 'sh-media', 'x', '']
  it('toneOf stabil dan dalam rentang 1..6', () => {
    for (const id of ids) {
      const t = toneOf(id)
      expect(t).toBe(toneOf(id))
      expect(Number.isInteger(t)).toBe(true)
      expect(t).toBeGreaterThanOrEqual(1)
      expect(t).toBeLessThanOrEqual(6)
    }
  })
  it('lima id contoh tidak semuanya bernada sama', () => {
    const tones = new Set(['energi', 'agro', 'media', 'properti', 'logistik'].map(toneOf))
    expect(tones.size).toBeGreaterThan(1)
  })
  it('tersebar ke keenam nada untuk banyak id', () => {
    const tones = new Set(Array.from({ length: 200 }, (_, i) => toneOf(`subholding-${i}`)))
    expect(tones.size).toBe(6)
  })
  it('id unicode aman', () => {
    const t = toneOf('Énergie 漢字')
    expect(t).toBeGreaterThanOrEqual(1)
    expect(t).toBeLessThanOrEqual(6)
  })
  it('toneVars memakai token --data-n', () => {
    expect(toneVars(3)).toEqual({ fg: 'var(--data-3)', bg: 'color-mix(in srgb, var(--data-3) 18%, transparent)' })
    expect(toneVars(toneOf('energi')).fg).toBe(`var(--data-${toneOf('energi')})`)
  })
})

describe('foto dan dokumen bukti', () => {
  const ev = (id: string, mime: string | null, kind?: 'file' | 'link'): OverviewEvidence => ({ id, fileName: `${id}.bin`, mime, ...(kind ? { kind } : {}) })
  const mixed = [
    ev('f1', 'image/jpeg', 'file'),
    ev('d1', 'application/pdf', 'file'),
    ev('f2', 'image/png'),
    ev('l1', null, 'link'),
    ev('l2', 'image/jpeg', 'link'),
    ev('f3', 'IMAGE/WEBP', 'file'),
    ev('f4', 'image/heic', 'file'),
    ev('f5', 'image/gif', 'file'),
  ]
  it('photosOf hanya berkas gambar, urutan dipertahankan; tautan bukan foto', () => {
    expect(photosOf(mixed).map((e) => e.id)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5'])
  })
  it('docsOf sisanya, termasuk tautan', () => {
    expect(docsOf(mixed).map((e) => e.id)).toEqual(['d1', 'l1', 'l2'])
  })
  it('photosOf + docsOf = seluruh bukti', () => {
    expect(photosOf(mixed).length + docsOf(mixed).length).toBe(mixed.length)
  })
  it('kosong/null aman', () => {
    expect(photosOf([])).toEqual([])
    expect(docsOf(undefined)).toEqual([])
  })
  it('thumbStack maksimal 3 gambar, sisanya "+n", dokumen tidak dihitung', () => {
    const out = thumbStack(mixed)
    expect(out.shown.map((e) => e.id)).toEqual(['f1', 'f2', 'f3'])
    expect(out.more).toBe(2)
  })
  it('thumbStack dengan max lain', () => {
    expect(thumbStack(mixed, 5)).toEqual({ shown: photosOf(mixed), more: 0 })
    expect(thumbStack(mixed, 10).more).toBe(0)
    expect(thumbStack(mixed, 1)).toEqual({ shown: [mixed[0]], more: 4 })
    expect(thumbStack(mixed, 0)).toEqual({ shown: [], more: 5 })
    expect(thumbStack(mixed, -2)).toEqual({ shown: [], more: 5 })
  })
  it('thumbStack hanya dokumen → kosong', () => {
    expect(thumbStack([ev('d', 'application/pdf'), ev('l', null, 'link')])).toEqual({ shown: [], more: 0 })
    expect(thumbStack(null)).toEqual({ shown: [], more: 0 })
  })
  it('heroLabel "Foto 1 dari 3"', () => {
    expect(heroLabel(0, 3)).toBe('Foto 1 dari 3')
    expect(heroLabel(2, 3)).toBe('Foto 3 dari 3')
    expect(heroLabel(3, 3)).toBe('Foto 1 dari 3')
    expect(heroLabel(0, 0)).toBe('')
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
