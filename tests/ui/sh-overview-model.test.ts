import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NO_FILTER, coverageCounts, dayLabel, flatten, groupBySub, highlightFirst, isWeekend, lastReportLabel, loadFilter,
  matchesQuery, ptBuckets, ptCoverage, saveFilter, scoped, silentDays, silentLabel, silentStreak, statusSummary,
  validFilter, weekNote, type V2Data,
} from '@/components/views/sh-overview/model'

const rep = (id: string, highlight = false) => ({ id, kegiatan: `K ${id}`, deskripsi: '', highlight, evidence: [] })

const data: V2Data = {
  date: '2026-10-15',
  subholdings: [
    {
      id: 'sentra', name: 'Sentra', count: 3, ptCount: 2,
      pts: [
        { id: 'pt-b', name: 'PT Beton', reports: [rep('b1'), rep('b2', true)] },
        { id: 'pt-j', name: 'PT Jembatan', reports: [rep('j1')] },
      ],
      allPts: [
        { id: 'pt-a', name: 'PT Aspal' }, { id: 'pt-b', name: 'PT Beton' },
        { id: 'pt-j', name: 'PT Jembatan' }, { id: 'pt-z', name: 'PT Zona' },
      ],
    },
    { id: 'fahreza', name: 'Fahreza', count: 0, ptCount: 0, pts: [], allPts: [{ id: 'pt-f', name: 'PT Fahreza' }] },
  ],
}

describe('model dashboard manajemen', () => {
  it('flatten membawa letak subholding & PT', () => {
    const f = flatten(data)
    expect(f).toHaveLength(3)
    expect(f[1]).toMatchObject({ id: 'b2', subId: 'sentra', ptId: 'pt-b', ptName: 'PT Beton' })
    expect(flatten(null)).toEqual([])
  })

  it('validFilter membuang subholding/PT yang tidak dikenal', () => {
    expect(validFilter(data, { sub: 'hilang', pt: null })).toEqual(NO_FILTER)
    expect(validFilter(data, { sub: 'sentra', pt: 'pt-x' })).toEqual({ sub: 'sentra', pt: null })
    expect(validFilter(data, { sub: 'sentra', pt: 'pt-z' })).toEqual({ sub: 'sentra', pt: 'pt-z' })
    expect(validFilter(null, { sub: 'sentra', pt: null })).toEqual(NO_FILTER)
  })

  it('scoped menyaring per subholding dan PT', () => {
    expect(scoped(data, NO_FILTER)).toHaveLength(3)
    expect(scoped(data, { sub: 'sentra', pt: 'pt-j' }).map((r) => r.id)).toEqual(['j1'])
  })

  it('highlightFirst stabil dan sorotan di atas', () => {
    expect(highlightFirst([rep('1'), rep('2', true), rep('3'), rep('4', true)]).map((r) => r.id)).toEqual(['2', '4', '1', '3'])
  })

  it('statusSummary tiga tingkat', () => {
    expect(statusSummary(data, NO_FILTER)).toEqual({ level: 'sub', done: 1, total: 2, reports: 3, missing: ['Fahreza'] })
    expect(statusSummary(data, { sub: 'sentra', pt: null })).toEqual({ level: 'pt', done: 2, total: 4, reports: 3, missing: ['PT Aspal', 'PT Zona'] })
    expect(statusSummary(data, { sub: 'sentra', pt: 'pt-z' })).toEqual({ level: 'one', done: 0, total: 1, reports: 0, missing: ['PT Zona'] })
    expect(statusSummary(data, { sub: 'sentra', pt: 'pt-b' })).toMatchObject({ level: 'one', done: 1, reports: 2 })
  })

  it('ptBuckets: melapor urut jumlah, belum melapor urut nama', () => {
    const b = ptBuckets(data.subholdings[0])
    expect(b.reporting.map((p) => [p.id, p.count, p.highlights])).toEqual([['pt-b', 2, 1], ['pt-j', 1, 0]])
    expect(b.silent.map((p) => p.id)).toEqual(['pt-a', 'pt-z'])
    expect(ptBuckets(null)).toEqual({ reporting: [], silent: [] })
  })

  it('matchesQuery mengabaikan huruf besar dan awalan PT', () => {
    expect(matchesQuery('PT Karya Jembatan Utama', 'jembatan')).toBe(true)
    expect(matchesQuery('PT. Karya Jembatan', 'karya j')).toBe(true)
    expect(matchesQuery('PT Beton', 'aspal')).toBe(false)
    expect(matchesQuery('PT Beton', '  ')).toBe(true)
  })

  it('hari & akhir pekan dari kunci tanggal', () => {
    expect(isWeekend('2026-10-17')).toBe(true) // Sabtu
    expect(isWeekend('2026-10-18')).toBe(true) // Minggu
    expect(isWeekend('2026-10-15')).toBe(false)
    expect(dayLabel('2026-10-15')).toEqual({ short: 'Kam 15', letter: 'K' })
  })

  it('silentStreak melewati akhir pekan; weekNote memilih nada', () => {
    const days = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']
    expect(silentStreak(days, [2, 0, 0, 1, 0, 0, 0])).toBe(3)
    // Jumat 9 ada laporan; Sabtu–Minggu dilewati; Senin–Kamis kosong = 4.
    expect(silentStreak(days, [2, 0, 0, 0, 0, 0, 0])).toBe(4)
    expect(silentStreak(days, [0, 0, 0, 0, 0, 0, 0])).toBe(5)
    expect(weekNote(days, [2, 0, 0, 1, 0, 0, 0])).toEqual({ text: '3 hari kerja berturut-turut belum melapor', tone: 'strong-warn' })
    expect(weekNote(days, [1, 0, 0, 1, 1, 1, 0])).toEqual({ text: 'Belum melapor hari ini', tone: 'warn' })
    expect(weekNote(days, [1, 0, 0, 1, 1, 1, 2])).toEqual({ text: '6 laporan dalam 7 hari', tone: 'muted' })
  })
})

describe('penyaring tersimpan', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('simpan lalu muat; data rusak atau storage diblokir → tanpa penyaring', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } })
    saveFilter({ sub: 'sentra', pt: 'pt-b' })
    expect(loadFilter()).toEqual({ sub: 'sentra', pt: 'pt-b' })
    store.set('mk:sh-overview:filter', '{rusak')
    expect(loadFilter()).toEqual(NO_FILTER)
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } })
    expect(loadFilter()).toEqual(NO_FILTER)
    expect(() => saveFilter({ sub: null, pt: null })).not.toThrow()
  })
})

describe('kategori PT sudah / belum melapor', () => {
  // Kamis 15 Okt 2026. lastReportDate: Rab 14, Jum 9, Sen 12, tak ada.
  const cov: V2Data = {
    date: '2026-10-15',
    subholdings: [
      {
        id: 'energi', name: 'Energi', count: 4, ptCount: 2,
        pts: [
          { id: 'e1', name: 'PT Nusa Energi', reports: [{ ...rep('n1'), decidedAt: '2026-10-15T08:10:00Z' }, { ...rep('n2', true), decidedAt: '2026-10-15T08:42:00Z' }] },
          { id: 'e2', name: 'PT Surya Daya', reports: [{ ...rep('s1'), decidedAt: '2026-10-15T07:00:00Z' }, { ...rep('s2'), decidedAt: '2026-10-15T09:00:00Z' }] },
        ],
        allPts: [
          { id: 'e1', name: 'PT Nusa Energi' }, { id: 'e2', name: 'PT Surya Daya' },
          { id: 'e3', name: 'PT Tirta Energi', lastReportDate: '2026-10-09' },
          { id: 'e4', name: 'PT Bahari Listrik', lastReportDate: '2026-10-14' },
        ],
      },
      {
        id: 'logistik', name: 'Logistik', count: 1, ptCount: 1,
        pts: [{ id: 'l1', name: 'PT Jalur Cepat', reports: [rep('j1')] }],
        allPts: [
          { id: 'l1', name: 'PT Jalur Cepat' },
          { id: 'l2', name: 'PT Agung Logistik', lastReportDate: '2026-10-12' },
          { id: 'l3', name: 'PT Armada Baru', lastReportDate: null },
          { id: 'l4', name: 'PT Cakra Angkut', lastReportDate: '2026-10-12' },
        ],
      },
    ],
  }

  it('silentDays menghitung hari kerja setelah tanggal terakhir sampai tanggal data, akhir pekan dilewati', () => {
    expect(silentDays('2026-10-15', '2026-10-14')).toBe(1)
    expect(silentDays('2026-10-15', '2026-10-12')).toBe(3)
    expect(silentDays('2026-10-15', '2026-10-09')).toBe(4) // Sen, Sel, Rab, Kam (Sab–Min dilewati)
    expect(silentDays('2026-10-12', '2026-10-09')).toBe(1) // Senin setelah Jumat
    expect(silentDays('2026-10-11', '2026-10-09')).toBe(0) // Minggu
    expect(silentDays('2026-10-15', '2026-10-15')).toBe(0)
    expect(silentDays('2026-10-15', '2026-10-20')).toBe(0)
    expect(silentDays('2026-10-15', null)).toBeNull()
    expect(silentDays('rusak', '2026-10-09')).toBeNull()
  })

  it('silentLabel dan lastReportLabel', () => {
    expect(silentLabel(1, 'today')).toBe('Hari ini')
    expect(silentLabel(1, 'yesterday')).toBe('Kemarin')
    expect(silentLabel(4, 'today')).toBe('4 hari kerja')
    expect(silentLabel(null, 'today')).toBe('Lebih dari 90 hari')
    expect(silentLabel(0, 'today')).toBe('Akhir pekan')
    expect(lastReportLabel('2026-10-22')).toBe('terakhir melapor Kam 22 Okt')
    expect(lastReportLabel('2026-10-14')).toBe('terakhir melapor Rab 14 Okt')
    expect(lastReportLabel(null)).toBe('belum ada laporan dalam 90 hari')
    expect(lastReportLabel(undefined)).toBe('belum ada laporan dalam 90 hari')
  })

  it('ptCoverage: melapor urut sorotan, jumlah, nama; lastAt = decidedAt terbesar', () => {
    const c = ptCoverage(cov, NO_FILTER)
    expect(c.reporting.map((p) => [p.id, p.count, p.highlights])).toEqual([['e1', 2, 1], ['e2', 2, 0], ['l1', 1, 0]])
    expect(c.reporting[0]).toMatchObject({ subId: 'energi', subName: 'Energi', name: 'PT Nusa Energi', lastAt: '2026-10-15T08:42:00Z' })
    expect(c.reporting[1].lastAt).toBe('2026-10-15T09:00:00Z')
    expect(c.reporting[2].lastAt).toBeNull()
    expect(c.total).toBe(8)
  })

  it('ptCoverage: belum melapor lintas subholding, tak pernah melapor dulu, lalu paling lama diam, lalu nama', () => {
    const c = ptCoverage(cov, NO_FILTER)
    // l3 (null) → e3 (4 hari) → l2 & l4 (3 hari, urut nama) → e4 (1 hari)
    expect(c.silent.map((p) => p.id)).toEqual(['l3', 'e3', 'l2', 'l4', 'e4'])
    expect(c.silent[0]).toMatchObject({ lastReportDate: null, subId: 'logistik', subName: 'Logistik' })
    expect(c.silent.map((p) => p.subId)).toEqual(['logistik', 'energi', 'logistik', 'logistik', 'energi'])
    expect(c.silent.every((p) => !c.reporting.some((r) => r.id === p.id))).toBe(true)
  })

  it('ptCoverage menghormati penyaring subholding dan PT', () => {
    const energi = ptCoverage(cov, { sub: 'energi', pt: null })
    expect(energi.reporting.map((p) => p.id)).toEqual(['e1', 'e2'])
    expect(energi.silent.map((p) => p.id)).toEqual(['e3', 'e4'])
    expect(energi.total).toBe(4)
    const satu = ptCoverage(cov, { sub: 'energi', pt: 'e3' })
    expect(satu.reporting).toEqual([])
    expect(satu.silent.map((p) => p.id)).toEqual(['e3'])
    expect(satu.total).toBe(1)
    expect(ptCoverage(cov, { sub: 'energi', pt: 'e1' }).reporting.map((p) => p.id)).toEqual(['e1'])
    expect(ptCoverage(null, NO_FILTER)).toEqual({ reporting: [], silent: [], total: 0 })
  })

  it('PT tanpa allPts (API lama) tidak memunculkan belum melapor dan lastReportDate opsional', () => {
    const old: V2Data = { date: '2026-10-15', subholdings: [{ id: 'x', name: 'X', count: 1, ptCount: 1, pts: [{ id: 'p', name: 'PT P', reports: [rep('r')] }] }] }
    const c = ptCoverage(old, NO_FILTER)
    expect(c.silent).toEqual([])
    expect(c.reporting.map((p) => p.id)).toEqual(['p'])
  })

  it('coverageCounts dan groupBySub', () => {
    const c = ptCoverage(cov, NO_FILTER)
    expect(coverageCounts(c)).toEqual({ semua: 8, sudah: 3, belum: 5 })
    const g = groupBySub(c.reporting)
    expect(g.map((x) => [x.subId, x.rows.map((r) => r.id)])).toEqual([['energi', ['e1', 'e2']], ['logistik', ['l1']]])
  })
})
