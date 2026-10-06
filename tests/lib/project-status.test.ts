import { describe, expect, it } from 'vitest'
import { STATUS_ORDER, deriveProjectStatus, type LatestReport } from '@/lib/project-status'

const NOW = new Date('2026-10-06T05:00:00Z')
const DAY = 86400000

const aktif = (targetEndDate: Date | null = null) => ({ lifecycle: 'AKTIF', targetEndDate })
const report = (over: Partial<NonNullable<LatestReport>> = {}): LatestReport => ({
  status: 'ON_PROGRESS',
  progressPct: 40,
  obstacle: null,
  needsEscalation: false,
  reportDate: new Date('2026-10-05T17:00:00Z'),
  ...over,
})

describe('deriveProjectStatus', () => {
  describe('done — Selesai', () => {
    it('proyek DITUTUP selalu selesai, walau lewat tenggat', () => {
      const r = deriveProjectStatus(
        { lifecycle: 'DITUTUP', targetEndDate: new Date(NOW.getTime() - 30 * DAY) },
        report({ progressPct: 70 }),
        NOW
      )
      expect(r).toEqual({ status: 'done', reason: null, progress: 70 })
    })

    it('DITUTUP tanpa laporan dianggap 100%', () => {
      expect(deriveProjectStatus({ lifecycle: 'DITUTUP', targetEndDate: null }, null, NOW)).toEqual({
        status: 'done',
        reason: null,
        progress: 100,
      })
    })

    it('laporan terakhir berstatus SELESAI', () => {
      expect(deriveProjectStatus(aktif(), report({ status: 'SELESAI', progressPct: 90 }), NOW).status).toBe('done')
    })

    it('progres 100% (atau lebih, dipotong ke 100)', () => {
      expect(deriveProjectStatus(aktif(), report({ progressPct: 100 }), NOW)).toMatchObject({
        status: 'done',
        progress: 100,
      })
      expect(deriveProjectStatus(aktif(), report({ progressPct: 140 }), NOW)).toMatchObject({
        status: 'done',
        progress: 100,
      })
    })
  })

  describe('late — Terlambat', () => {
    it('lewat tenggat dihitung dalam hari penuh', () => {
      const r = deriveProjectStatus(aktif(new Date(NOW.getTime() - 3.5 * DAY)), report(), NOW)
      expect(r).toEqual({ status: 'late', reason: 'Lewat tenggat 3 hari', progress: 40 })
    })

    it('lewat kurang dari sehari tetap ditulis 1 hari', () => {
      const r = deriveProjectStatus(aktif(new Date(NOW.getTime() - 60_000)), report(), NOW)
      expect(r.reason).toBe('Lewat tenggat 1 hari')
    })

    it('terlambat mengalahkan kendala dan "belum ada laporan"', () => {
      const past = new Date(NOW.getTime() - 2 * DAY)
      expect(deriveProjectStatus(aktif(past), report({ status: 'TERKENDALA', obstacle: 'X' }), NOW).status).toBe('late')
      expect(deriveProjectStatus(aktif(past), null, NOW).status).toBe('late')
    })

    it('tepat di tenggat belum terlambat', () => {
      expect(deriveProjectStatus(aktif(new Date(NOW)), report(), NOW).status).toBe('on')
    })
  })

  describe('neutral — Belum mulai', () => {
    it('belum ada laporan harian', () => {
      expect(deriveProjectStatus(aktif(new Date(NOW.getTime() + 10 * DAY)), null, NOW)).toEqual({
        status: 'neutral',
        reason: 'Belum ada laporan harian',
        progress: 0,
      })
    })
  })

  describe('risk — Perlu perhatian', () => {
    it('TERKENDALA memakai kalimat pertama kendala', () => {
      const r = deriveProjectStatus(
        aktif(),
        report({ status: 'TERKENDALA', obstacle: '  Material   terlambat datang.  Vendor sedang dihubungi. ' }),
        NOW
      )
      expect(r).toEqual({ status: 'risk', reason: 'Material terlambat datang.', progress: 40 })
    })

    it('TERKENDALA tanpa kendala tertulis', () => {
      expect(deriveProjectStatus(aktif(), report({ status: 'TERKENDALA', obstacle: '  ' }), NOW).reason).toBe(
        'Ada kendala di laporan terakhir'
      )
    })

    it('MENUNGGU_KEPUTUSAN tanpa kendala tertulis', () => {
      expect(deriveProjectStatus(aktif(), report({ status: 'MENUNGGU_KEPUTUSAN' }), NOW)).toMatchObject({
        status: 'risk',
        reason: 'Menunggu keputusan',
      })
    })

    it('laporan berjalan yang ditandai perlu eskalasi', () => {
      expect(deriveProjectStatus(aktif(), report({ needsEscalation: true }), NOW)).toMatchObject({
        status: 'risk',
        reason: 'Ada kendala di laporan terakhir',
      })
    })

    it('alasan panjang dipotong menjadi 88 karakter + elipsis', () => {
      const long = 'a'.repeat(120)
      const r = deriveProjectStatus(aktif(), report({ status: 'TERKENDALA', obstacle: long }), NOW)
      expect(r.reason).toBe('a'.repeat(88) + '…')
    })
  })

  describe('on — Sesuai jadwal', () => {
    it('laporan berjalan tanpa kendala, tenggat masih jauh', () => {
      expect(deriveProjectStatus(aktif(new Date(NOW.getTime() + 5 * DAY)), report(), NOW)).toEqual({
        status: 'on',
        reason: null,
        progress: 40,
      })
    })

    it('progres negatif dipotong ke 0', () => {
      expect(deriveProjectStatus(aktif(), report({ progressPct: -5 }), NOW).progress).toBe(0)
    })

    it('TIDAK_ADA_PERUBAHAN tetap sesuai jadwal', () => {
      expect(deriveProjectStatus(aktif(), report({ status: 'TIDAK_ADA_PERUBAHAN' }), NOW).status).toBe('on')
    })
  })
})

describe('STATUS_ORDER', () => {
  it('mengurutkan yang paling butuh perhatian lebih dulu', () => {
    const sorted = (['done', 'on', 'neutral', 'late', 'risk'] as const)
      .slice()
      .sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b])
    expect(sorted).toEqual(['late', 'risk', 'on', 'neutral', 'done'])
  })
})
