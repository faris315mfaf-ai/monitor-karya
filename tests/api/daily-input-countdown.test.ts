import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { asUser, db, resetWorld, wib } from './pic-world'

/*
 * [B2] GET /api/daily-input: `countdown` wajib konsisten dengan `lockAt` aturan PT
 * (jam kustom, pengisian ditutup) — dulu memakai jam env 17.00 sehingga PT berjam
 * 15.00 melihat "1 jam lagi" pada 16.00. Mode 24/7 tetap `countdown: null`.
 * Berjalan di atas fixture tests/api/pic-world.ts (pic-1 → p-1 di pt-a).
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => (await import('./pic-world')).auth)
vi.mock('@/lib/storage', () => ({ removeEvidence: vi.fn(), storageConfigured: () => false }))

import { GET as dailyInputGet } from '@/app/api/daily-input/route'

type Aturan = { dailyCutoffHour: number | null; workingDays: number[]; dailyOpen: boolean; weeklyCutoffHour: number | null; weeklyOpen: boolean }
const SEMUA_HARI: Aturan = { dailyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyCutoffHour: null, weeklyOpen: true }
const SENIN_JUMAT: Aturan = { dailyCutoffHour: 17, workingDays: [1, 2, 3, 4, 5], dailyOpen: true, weeklyCutoffHour: 17, weeklyOpen: true }

function aturanPtA(aturan: Aturan) {
  db.reportSettings.findUnique.mockImplementation(async ({ where }: { where: { entityId: string } }) =>
    where.entityId === 'pt-a' ? aturan : null,
  )
}

async function panggil(): Promise<{ lockAt: string; locked: boolean; countdown: null | { hours: number; minutes: number; totalMs: number; passed: boolean } }> {
  asUser('pic-1')
  db.dailyProjectReport.findMany.mockResolvedValue([])
  db.task.groupBy.mockResolvedValue([])
  db.evidence.findMany.mockResolvedValue([])
  db.unlockRequest.findMany.mockResolvedValue([])
  const res = await dailyInputGet(new NextRequest('http://localhost/api/daily-input'))
  expect(res.status).toBe(200)
  return res.json()
}

beforeEach(() => {
  vi.useFakeTimers()
  resetWorld()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('/api/daily-input countdown mengikuti lockAt aturan PT', () => {
  it('jam batas 15.00 pukul 10.00: sisa 5 jam menuju 15.00 (bukan 7 jam menuju 17.00)', async () => {
    const kini = wib('2026-10-06T10:00:00')
    vi.setSystemTime(kini)
    aturanPtA({ ...SENIN_JUMAT, dailyCutoffHour: 15 })
    const body = await panggil()
    expect(body.lockAt).toBe(wib('2026-10-06T15:00:00').toISOString())
    expect(body.countdown).toEqual({ hours: 5, minutes: 0, totalMs: 5 * 3600000, passed: false })
  })

  it('jam batas 15.00 pukul 16.00: sudah lewat walau jam env 17.00 belum', async () => {
    vi.setSystemTime(wib('2026-10-06T16:00:00'))
    aturanPtA({ ...SENIN_JUMAT, dailyCutoffHour: 15 })
    const body = await panggil()
    expect(body.locked).toBe(true)
    expect(body.countdown).toEqual({ hours: 0, minutes: 0, totalMs: 0, passed: true })
  })

  it('jam batas 20.00 pukul 18.30: masih 1 jam 30 menit (jam env 17.00 sudah lewat)', async () => {
    vi.setSystemTime(wib('2026-10-06T18:30:00'))
    aturanPtA({ ...SENIN_JUMAT, dailyCutoffHour: 20 })
    const body = await panggil()
    expect(body.locked).toBe(false)
    expect(body.countdown).toMatchObject({ hours: 1, minutes: 30, passed: false })
  })

  it('jam env DAILY_CUTOFF_HOUR tidak lagi memengaruhi countdown', async () => {
    vi.stubEnv('DAILY_CUTOFF_HOUR', '9')
    vi.setSystemTime(wib('2026-10-06T12:00:00'))
    aturanPtA({ ...SENIN_JUMAT, dailyCutoffHour: 15 })
    const body = await panggil()
    expect(body.countdown).toMatchObject({ hours: 3, minutes: 0, passed: false })
  })

  it('pengisian ditutup: countdown sudah lewat, sama dengan locked', async () => {
    vi.setSystemTime(wib('2026-10-06T10:00:00'))
    aturanPtA({ ...SENIN_JUMAT, dailyOpen: false })
    const body = await panggil()
    expect(body.locked).toBe(true)
    expect(body.countdown?.passed).toBe(true)
  })

  it('24/7: countdown null (klien menampilkan "kirim kapan saja")', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    aturanPtA(SEMUA_HARI)
    const body = await panggil()
    expect(body.countdown).toBeNull()
    expect(body.lockAt).toBe(wib('2026-10-07T00:00:00').toISOString())
  })

  it('invarian: totalMs = lockAt − sekarang pada jam bukan bulat', async () => {
    const kini = wib('2026-10-06T13:17:42')
    vi.setSystemTime(kini)
    aturanPtA({ ...SENIN_JUMAT, dailyCutoffHour: 16 })
    const body = await panggil()
    expect(body.countdown?.totalMs).toBe(Date.parse(body.lockAt) - kini.getTime())
    expect(body.countdown).toMatchObject({ hours: 2, minutes: 42, passed: false })
  })
})
