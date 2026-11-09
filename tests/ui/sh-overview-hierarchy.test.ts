import { describe, expect, it } from 'vitest'

/**
 * Dashboard Ketua Umum & Manajemen opsi B (hierarchy.ts): hierarki
 * subholding → PT → laporan terbaru di atas, kartu status, status akordeon,
 * dan laporan yang tampil di panel rincian tablet.
 */

import {
  approvedAt, buildHierarchy, defaultOpen, donePct, findReport, newestFirst, openState, ptMeta, reportingStatus, selectedReport,
  subMeta, togglePt, toggleSub,
} from '@/components/views/sh-overview/hierarchy'
import { NO_FILTER, type V2Data, type V2Report } from '@/components/views/sh-overview/model'

// Jam WIB = UTC + 7.
const at = (wib: string) => `2026-11-09T${String(Number(wib.slice(0, 2)) - 7).padStart(2, '0')}:${wib.slice(3)}:00.000Z`
const rep = (id: string, wib: string | null, extra: Partial<V2Report> = {}): V2Report => ({
  id, kegiatan: `Kegiatan ${id}`, deskripsi: '', evidence: [], decidedAt: wib ? at(wib) : null, ...extra,
})

// Urutan API: subholding & PT menurut nama, laporan menurut waktu setuju naik.
const DATA: V2Data = {
  date: '2026-11-09',
  subholdings: [
    {
      id: 'energi', name: 'Subholding Energi', count: 3, ptCount: 2,
      pts: [
        { id: 'mitra', name: 'PT Mitra Gas', reports: [rep('m1', '10:30')] },
        { id: 'nusa', name: 'PT Nusa Energi', reports: [rep('n1', '09:40'), rep('n2', '15:42', { highlight: true, highlightNote: 'Komponen tertunda' })] },
      ],
      allPts: [
        { id: 'bahari', name: 'PT Bahari Listrik', lastReportDate: '2026-11-06' },
        { id: 'mitra', name: 'PT Mitra Gas' },
        { id: 'nusa', name: 'PT Nusa Energi' },
      ],
    },
    {
      id: 'logistik', name: 'Subholding Logistik', count: 3, ptCount: 2,
      pts: [
        { id: 'armada', name: 'PT Armada Nusantara', reports: [rep('a1', '09:20'), rep('a2', '16:02')] },
        { id: 'jalur', name: 'PT Jalur Cepat', reports: [rep('j1', '11:45')] },
      ],
      allPts: [
        { id: 'agung', name: 'PT Agung Logistik', lastReportDate: null },
        { id: 'armada', name: 'PT Armada Nusantara' },
        { id: 'jalur', name: 'PT Jalur Cepat' },
        { id: 'sejahtera', name: 'PT Sejahtera Angkut', lastReportDate: '2026-11-05' },
      ],
    },
    { id: 'agro', name: 'Subholding Agro', count: 0, ptCount: 0, pts: [], allPts: [{ id: 'sawit', name: 'PT Sawit', lastReportDate: '2026-11-02' }] },
    { id: 'teknologi', name: 'Subholding Teknologi', count: 0, ptCount: 0, pts: [], allPts: [] },
  ],
}

describe('newestFirst', () => {
  it('waktu disetujui menurun; tanpa waktu di akhir', () => {
    const list = [rep('a', '09:00'), rep('b', null), rep('c', '16:00'), rep('d', '12:00')]
    expect(newestFirst(list).map((r) => r.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('waktu sama: urutan API dibalik (yang belakangan lebih baru); masukan tidak diubah', () => {
    const list = [rep('a', '10:00'), rep('b', '10:00'), rep('c', null), rep('d', null)]
    expect(newestFirst(list).map((r) => r.id)).toEqual(['b', 'a', 'd', 'c'])
    expect(list.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('buildHierarchy', () => {
  const subs = buildHierarchy(DATA)

  it('subholding urut laporan terbaru; tanpa laporan di bawah urut nama', () => {
    expect(subs.map((s) => s.id)).toEqual(['logistik', 'energi', 'agro', 'teknologi'])
    expect(subs.map((s) => [s.count, s.lastAt])).toEqual([
      [3, at('16:02')], [3, at('15:42')], [0, null], [0, null],
    ])
  })

  it('PT urut laporan terbaru, laporan terbaru di atas, membawa letak subholding & PT', () => {
    const [logistik, energi] = subs
    expect(logistik.pts.map((p) => p.id)).toEqual(['armada', 'jalur'])
    expect(energi.pts.map((p) => p.id)).toEqual(['nusa', 'mitra'])
    expect(logistik.pts[0].reports.map((r) => r.id)).toEqual(['a2', 'a1'])
    expect(energi.pts[0]).toMatchObject({ highlights: 1, lastAt: at('15:42') })
    expect(energi.pts[0].reports[0]).toMatchObject({ subId: 'energi', subName: 'Subholding Energi', ptId: 'nusa', ptName: 'PT Nusa Energi' })
  })

  it('PT belum melapor di subholdingnya: tak pernah melapor dulu, lalu paling lama diam', () => {
    expect(subs[0].silent.map((p) => p.id)).toEqual(['agung', 'sejahtera'])
    expect(subs[1].silent.map((p) => p.id)).toEqual(['bahari'])
    expect(subs[2].silent.map((p) => p.id)).toEqual(['sawit'])
    expect(subs[3].silent).toEqual([])
  })

  it('tanpa data → kosong', () => {
    expect(buildHierarchy(null)).toEqual([])
    expect(buildHierarchy({ date: '2026-11-09', subholdings: [] })).toEqual([])
  })
})

describe('kartu status', () => {
  it('PT sudah melapor dari seluruh PT aktif + jumlah laporan', () => {
    const s = reportingStatus(DATA)
    expect(s).toEqual({ done: 4, total: 8, reports: 6 })
    expect(donePct(s)).toBe(50)
    expect(donePct({ done: 1, total: 3, reports: 1 })).toBe(33.3)
  })

  it('persentase dijepit dan aman untuk total 0', () => {
    expect(donePct({ done: 0, total: 0, reports: 0 })).toBe(0)
    expect(donePct({ done: 3, total: 3, reports: 5 })).toBe(100)
    expect(reportingStatus(null)).toEqual({ done: 0, total: 0, reports: 0 })
  })
})

describe('akordeon', () => {
  const subs = buildHierarchy(DATA)

  it('awal: subholding terbaru dengan PT terbarunya; tanpa laporan → tertutup', () => {
    expect(defaultOpen(subs)).toEqual({ sub: 'logistik', pt: 'armada' })
    expect(defaultOpen(buildHierarchy({ date: '2026-11-09', subholdings: [DATA.subholdings[3]] }))).toEqual(NO_FILTER)
  })

  it('filter tersimpan menang; tanpa filter terbuka bawaan sampai pengguna menutupnya', () => {
    expect(openState(subs, { sub: 'energi', pt: null }, false)).toEqual({ sub: 'energi', pt: null })
    expect(openState(subs, NO_FILTER, false)).toEqual({ sub: 'logistik', pt: 'armada' })
    expect(openState(subs, NO_FILTER, true)).toEqual(NO_FILTER)
  })

  it('ketuk subholding: buka dengan PT terbaru, ketuk lagi menutup', () => {
    const energi = subs[1]
    expect(toggleSub(energi, { sub: 'logistik', pt: 'armada' })).toEqual({ sub: 'energi', pt: 'nusa' })
    expect(toggleSub(energi, { sub: 'energi', pt: 'mitra' })).toEqual(NO_FILTER)
    expect(toggleSub(subs[2], NO_FILTER)).toEqual({ sub: 'agro', pt: null })
  })

  it('ketuk PT: buka, ketuk lagi menutup PT (subholding tetap terbuka)', () => {
    expect(togglePt('energi', 'mitra', { sub: 'energi', pt: 'nusa' })).toEqual({ sub: 'energi', pt: 'mitra' })
    expect(togglePt('energi', 'mitra', { sub: 'energi', pt: 'mitra' })).toEqual({ sub: 'energi', pt: null })
  })
})

describe('panel rincian', () => {
  const subs = buildHierarchy(DATA)

  it('pilihan pengguna dipakai bila masih ada di data', () => {
    expect(selectedReport(subs, { sub: 'logistik', pt: 'armada' }, 'm1')?.id).toBe('m1')
    expect(findReport(subs, 'n1')?.ptName).toBe('PT Nusa Energi')
    expect(findReport(subs, 'tidak-ada')).toBeNull()
    expect(findReport(subs, null)).toBeNull()
  })

  it('tanpa pilihan: terbaru di PT terbuka → subholding terbuka → semua', () => {
    expect(selectedReport(subs, { sub: 'energi', pt: 'mitra' }, null)?.id).toBe('m1')
    expect(selectedReport(subs, { sub: 'energi', pt: null }, 'hilang')?.id).toBe('n2')
    expect(selectedReport(subs, { sub: 'agro', pt: null }, null)?.id).toBe('a2')
    expect(selectedReport(subs, NO_FILTER, null)?.id).toBe('a2')
    expect(selectedReport([], NO_FILTER, null)).toBeNull()
  })
})

describe('teks', () => {
  const subs = buildHierarchy(DATA)

  it('keterangan subholding', () => {
    expect(subMeta(subs[0])).toBe('2 PT melapor · 2 belum')
    expect(subMeta({ ...subs[0], silent: [] })).toBe('2 PT melapor')
    expect(subMeta(subs[2])).toBe('Belum ada laporan disetujui · 1 PT')
    expect(subMeta(subs[3])).toBe('Belum ada laporan disetujui')
  })

  it('keterangan PT: jumlah laporan dan jam terakhir (WIB)', () => {
    expect(ptMeta(subs[0].pts[0], '2026-11-09')).toBe('2 laporan · terakhir 16.02')
    expect(ptMeta({ ...subs[0].pts[0], lastAt: null }, '2026-11-09')).toBe('2 laporan')
  })

  it('waktu disetujui: jam saja di tanggal laporan, tanggal + jam bila disetujui di hari lain', () => {
    expect(approvedAt(at('12:44'), '2026-11-09')).toBe('12.44')
    expect(approvedAt(at('12:44'), '2026-11-06')).toBe('9 Nov 12.44')
    // Batas hari memakai WIB: 16.30 UTC = 23.30 WIB (masih tanggal 9), 17.30 UTC = 00.30 WIB tanggal 10.
    expect(approvedAt('2026-11-09T16:30:00.000Z', '2026-11-09')).toBe('23.30')
    expect(approvedAt('2026-11-09T17:30:00.000Z', '2026-11-09')).toBe('10 Nov 00.30')
    expect(approvedAt(null, '2026-11-09')).toBe('')
    expect(approvedAt('bukan-tanggal', '2026-11-09')).toBe('')
  })
})
