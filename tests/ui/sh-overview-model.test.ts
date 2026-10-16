import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NO_FILTER, dayLabel, flatten, highlightFirst, isWeekend, loadFilter, matchesQuery, ptBuckets, saveFilter,
  scoped, silentStreak, statusSummary, validFilter, weekNote, type V2Data,
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
