import { describe, expect, it } from 'vitest'
import { flatten, type V2Data } from '@/components/views/sh-overview/model'
import { DAY_SPLIT_MIN, dayHeading, dayLayout, dayWord, fillHeight, toDetail } from '@/components/views/sh-overview/tablet/logic'

const rep = (id: string, extra: Partial<{ highlight: boolean; highlightNote: string; decidedAt: string; reporterName: string; reporterTitle: string }> = {}) => ({
  id, kegiatan: `K ${id}`, deskripsi: `D ${id}`, evidence: [], ...extra,
})

const data: V2Data = {
  date: '2026-10-15',
  subholdings: [
    {
      id: 'sentra', name: 'Subholding Sentra Multikarya', count: 4, ptCount: 2,
      pts: [
        { id: 'pt-b', name: 'PT BETON PERKASA', reports: [rep('b1'), rep('b2', { highlight: true, highlightNote: 'Perlu keputusan' })] },
        { id: 'pt-j', name: 'PT Jembatan', reports: [rep('j1')] },
        { id: 'pt-k', name: 'PT Kawat', reports: [rep('k1'), rep('k2'), rep('k3')] },
      ],
      allPts: [
        { id: 'pt-a', name: 'PT Aspal' }, { id: 'pt-b', name: 'PT BETON PERKASA' }, { id: 'pt-j', name: 'PT Jembatan' },
        { id: 'pt-k', name: 'PT Kawat' }, { id: 'pt-z', name: 'PT Zona' },
      ],
    },
    { id: 'tunas', name: 'Tunas Baru', count: 0, ptCount: 0, pts: [], allPts: [{ id: 'pt-t', name: 'PT Tunas Agro' }] },
  ],
}

describe('dayLayout (tampilan Ringkas)', () => {
  it('dua panel mulai 760px kontainer: daftar ±42%, dijepit 340–460', () => {
    expect(DAY_SPLIT_MIN).toBe(760)
    expect(dayLayout(968)).toEqual({ split: true, listW: 407 })
    expect(dayLayout(760)).toEqual({ split: true, listW: 340 })
    expect(dayLayout(1400)).toEqual({ split: true, listW: 460 })
  })
  it('lebih sempit satu kolom; lebar tidak sah → 0', () => {
    expect(dayLayout(759)).toEqual({ split: false, listW: 759 })
    expect(dayLayout(Number.NaN)).toEqual({ split: false, listW: 0 })
    expect(dayLayout(-5)).toEqual({ split: false, listW: 0 })
  })
})

describe('fillHeight', () => {
  it('sisa layar di bawah kontainer dikurangi padding bawah, tidak kurang dari batas', () => {
    expect(fillHeight(900, 92, 48)).toBe(760)
    expect(fillHeight(500, 92, 48)).toBe(480)
    expect(fillHeight(900, -40, 0, 300)).toBe(900)
  })
})

describe('tanggal', () => {
  it('kepala hari', () => {
    expect(dayHeading('2026-10-15')).toBe('Kamis, 15 Oktober')
    expect(dayHeading('')).toBe('')
  })
  it('keterangan waktu: hari ini, atau tanggal yang dipilih', () => {
    expect(dayWord('2026-10-15', '2026-10-15')).toBe('hari ini')
    expect(dayWord('2026-10-13', '2026-10-15')).toBe('pada Selasa, 13 Oktober')
    expect(dayWord('', '2026-10-15')).toBe('pada tanggal ini')
  })
})

describe('rincian', () => {
  it('laporan → rincian membawa catatan sorotan', () => {
    const r = flatten(data).find((x) => x.id === 'b2')!
    const d = toDetail(r)
    expect(d).toMatchObject({
      id: 'b2', ptName: 'PT Beton Perkasa', subholdingName: 'Sentra Multikarya', highlight: true, highlightNote: 'Perlu keputusan',
    })
    expect(d.tone).toBeGreaterThanOrEqual(1)
    expect(toDetail(flatten(data)[0])).toMatchObject({ highlight: false, highlightNote: null })
  })
})
