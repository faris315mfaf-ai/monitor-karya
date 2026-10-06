import { describe, expect, it } from 'vitest'
import { csvCell, csvRow, pctOf, projectDivisionId, tallyDay, weeklyState } from '@/lib/admin-compliance'

/* [F2-ADMIN] Aturan kepatuhan per orang/divisi dan CSV aman untuk "Unduh log". */

const divisions = [
  { id: 'd-tek', entityId: 'pt-a', headUserId: 'u-head' },
  { id: 'd-keu', entityId: 'pt-a', headUserId: null },
  { id: 'd-lain', entityId: 'pt-b', headUserId: 'u-headb' },
]

describe('projectDivisionId', () => {
  it('memakai Project.divisionId lebih dulu', () => {
    expect(projectDivisionId({ id: 'p', entityId: 'pt-a', divisionId: 'd-keu', picUserId: 'u1', picDivisionId: 'd-tek' }, divisions)).toBe('d-keu')
  })
  it('jatuh ke divisi PIC di PT yang sama', () => {
    expect(projectDivisionId({ id: 'p', entityId: 'pt-a', divisionId: null, picUserId: 'u1', picDivisionId: 'd-tek' }, divisions)).toBe('d-tek')
  })
  it('tidak memakai divisi PIC di PT lain', () => {
    expect(projectDivisionId({ id: 'p', entityId: 'pt-a', divisionId: null, picUserId: 'u1', picDivisionId: 'd-lain' }, divisions)).toBeNull()
  })
  it('PIC tanpa divisi yang memimpin divisi → divisi yang dipimpin', () => {
    expect(projectDivisionId({ id: 'p', entityId: 'pt-a', divisionId: null, picUserId: 'u-head', picDivisionId: null }, divisions)).toBe('d-tek')
  })
  it('divisi proyek yang tidak aktif/di luar cakupan → null', () => {
    expect(projectDivisionId({ id: 'p', entityId: 'pt-a', divisionId: 'd-hilang', picUserId: 'u1', picDivisionId: 'd-tek' }, divisions)).toBeNull()
  })
})

describe('tallyDay', () => {
  const projectsOf = new Map([
    ['u1', ['p1', 'p2']],
    ['u2', ['p3']],
    ['u3', ['p4']],
    ['u4', [] as string[]],
  ])
  it('sudah lapor hanya bila semua proyeknya terkirim; cuti keluar dari penyebut', () => {
    const t = tallyDay(['u1', 'u2', 'u3', 'u4', 'u5'], { projectsOf, submitted: new Set(['p1', 'p3']), onLeave: new Set(['u3']) })
    expect(t).toEqual({ expected: 2, reported: 1, onLeave: 1, missing: ['u1'] })
  })
  it('tanpa proyek tidak dihitung', () => {
    expect(tallyDay(['u4'], { projectsOf, submitted: new Set(), onLeave: new Set() }).expected).toBe(0)
  })
  it('pctOf aman untuk penyebut nol', () => {
    expect(pctOf(3, 0)).toBe(0)
    expect(pctOf(46, 50)).toBe(92)
  })
})

describe('weeklyState', () => {
  const handover = new Date('2026-10-08T17:00:00+07:00')
  it('Masuk tepat pada tenggat Kamis 17.00', () => {
    expect(weeklyState(new Date('2026-10-08T17:00:00+07:00'), handover)).toBe('MASUK')
  })
  it('Terlambat bila diserahkan setelah Kamis 17.00', () => {
    expect(weeklyState('2026-10-09T09:00:00+07:00', handover)).toBe('TERLAMBAT')
  })
  it('Belum masuk tanpa waktu serah', () => {
    expect(weeklyState(null, handover)).toBe('BELUM')
  })
})

describe('csvCell (CSV injection)', () => {
  it('memberi awalan petik pada sel yang diawali = + - @', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+62 812')).toBe(`"'+62 812"`)
    expect(csvCell('-1')).toBe(`"'-1"`)
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`)
    expect(csvCell('\tx')).toBe(`"'\tx"`)
  })
  it('menggandakan tanda kutip dan meratakan baris baru', () => {
    expect(csvCell('a "b"\nc')).toBe('"a ""b"" c"')
  })
  it('null/undefined jadi kosong; baris dipisah koma', () => {
    expect(csvRow([null, undefined, 3, 'x'])).toBe('"","","3","x"')
  })
})
