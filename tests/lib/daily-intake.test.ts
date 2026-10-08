import { describe, expect, it } from 'vitest'
import { countDailyIntake } from '@/lib/daily-intake'

const at = new Date('2026-10-06T03:00:00Z')

describe('countDailyIntake — satu definisi "laporan masuk"', () => {
  it('hanya menghitung laporan terkirim milik proyek aktif', () => {
    const r = countDailyIntake(
      ['p1', 'p2', 'p3'],
      [
        { projectId: 'p1', submittedAt: at, forwardedAt: null },
        { projectId: 'p2', submittedAt: at, forwardedAt: at },
        { projectId: 'p3', submittedAt: null }, // draf
        { projectId: 'tutup', submittedAt: at }, // proyek sudah tidak aktif
      ]
    )
    expect(r).toMatchObject({ projects: 3, received: 2, awaitingForward: 1, missing: 1 })
    expect([...r.receivedIds].sort()).toEqual(['p1', 'p2'])
  })

  it('"belum lapor" tidak pernah negatif walau ada laporan proyek nonaktif', () => {
    const r = countDailyIntake(['p1'], [
      { projectId: 'p1', submittedAt: at },
      { projectId: 'x', submittedAt: at },
      { projectId: 'y', submittedAt: at },
    ])
    expect(r.received).toBe(1)
    expect(r.missing).toBe(0)
  })

  it('tanpa proyek aktif semuanya nol', () => {
    expect(countDailyIntake([], [{ projectId: 'x', submittedAt: at }])).toMatchObject({ projects: 0, received: 0, awaitingForward: 0, missing: 0 })
  })
})
