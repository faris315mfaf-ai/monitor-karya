import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth'

/*
 * [INTEGRASI] Kunci bukti mengikuti kunci laporannya: beku setelah diteruskan,
 * kunci 17.00 / Jumat 17.00, dan buka kunci yang sedang berlaku (activeUnlockFor)
 * membuka kembali penulisan bukti. @/lib/db di-mock; logika kunci asli berjalan.
 */

const mocks = vi.hoisted(() => ({
  unlockActive: { value: false },
  daily: { value: null as unknown },
  weekly: { value: null as unknown },
  task: { value: null as unknown },
}))

vi.mock('@/lib/db', () => ({
  db: {
    dailyProjectReport: {
      findUnique: vi.fn(async () => mocks.daily.value),
    },
    weeklyReportItem: { findUnique: vi.fn(async () => mocks.weekly.value) },
    task: { findUnique: vi.fn(async () => mocks.task.value) },
    unlockRequest: {
      findFirst: vi.fn(async () => (mocks.unlockActive.value ? { id: 'u1', unlockUntil: new Date(Date.now() + 3600_000) } : null)),
    },
  },
}))

const { canWriteEvidence } = await import('@/lib/evidence-access')
const { FORWARDED_FROZEN_MESSAGE } = await import('@/lib/daily-rollup')

const pic = { id: 'pic1', role: 'PIC_PROYEK', scopeEntityId: 'pt-a' } as unknown as SessionUser
const head = { id: 'head1', role: 'KEPALA_DIVISI', scopeEntityId: 'pt-a' } as unknown as SessionUser

// Selasa 6 Okt 2026 10.00 WIB.
const NOW = new Date('2026-10-06T03:00:00.000Z')
const TODAY = new Date('2026-10-05T17:00:00.000Z') // 6 Okt 00.00 WIB
const YESTERDAY = new Date('2026-10-04T17:00:00.000Z')
const THIS_MONDAY = new Date('2026-10-04T17:00:00.000Z') // 5 Okt 00.00 WIB
const LAST_MONDAY = new Date('2026-09-27T17:00:00.000Z')

function dailyReport(over: Record<string, unknown> = {}) {
  return { entityId: 'pt-a', reportDate: TODAY, isLocked: false, forwardedAt: null, project: { picUserId: 'pic1' }, ...over }
}
function weeklyItem(over: Record<string, unknown> = {}) {
  return {
    weeklyReport: {
      id: 'w1',
      entityId: 'pt-a',
      periodStart: THIS_MONDAY,
      isLocked: false,
      statusHeader: 'DRAFT',
      forwardedAt: null,
      division: { headUserId: 'head1' },
      ...over,
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.unlockActive.value = false
})
afterEach(() => {
  vi.useRealTimers()
})

describe('canWriteEvidence — laporan harian', () => {
  it('membolehkan laporan hari ini sebelum 17.00', async () => {
    mocks.daily.value = dailyReport()
    expect(await canWriteEvidence(pic, 'DAILY_REPORT', 'r1')).toMatchObject({ ok: true })
  })

  it('membekukan laporan yang sudah diteruskan dengan pesan pembekuan', async () => {
    mocks.daily.value = dailyReport({ forwardedAt: new Date(), isLocked: true })
    expect(await canWriteEvidence(pic, 'DAILY_REPORT', 'r1')).toEqual({ ok: false, status: 409, error: FORWARDED_FROZEN_MESSAGE })
  })

  it('menolak hari lalu tanpa buka kunci, membolehkan dengan buka kunci aktif', async () => {
    mocks.daily.value = dailyReport({ reportDate: YESTERDAY })
    expect(await canWriteEvidence(pic, 'DAILY_REPORT', 'r1')).toMatchObject({ ok: false, status: 409 })
    mocks.unlockActive.value = true
    expect(await canWriteEvidence(pic, 'DAILY_REPORT', 'r1')).toMatchObject({ ok: true })
  })

  it('buka kunci aktif juga menembus pembekuan setelah diteruskan', async () => {
    mocks.daily.value = dailyReport({ reportDate: YESTERDAY, forwardedAt: new Date(), isLocked: true })
    mocks.unlockActive.value = true
    expect(await canWriteEvidence(pic, 'DAILY_REPORT', 'r1')).toMatchObject({ ok: true })
  })

  it('tetap menolak PIC proyek lain (403) walau terbuka', async () => {
    mocks.daily.value = dailyReport({ project: { picUserId: 'pic-lain' } })
    expect(await canWriteEvidence(pic, 'DAILY_REPORT', 'r1')).toMatchObject({ ok: false, status: 403 })
  })
})

describe('canWriteEvidence — task', () => {
  it('task HARIAN hari lalu terbuka bila laporan hari itu dibuka kuncinya', async () => {
    mocks.task.value = { entityId: 'pt-a', projectId: 'p1', workDate: YESTERDAY, scope: 'HARIAN', project: { picUserId: 'pic1' } }
    mocks.daily.value = { id: 'r1', forwardedAt: null, isLocked: false }
    expect(await canWriteEvidence(pic, 'TASK', 't1')).toMatchObject({ ok: false, status: 409 })
    mocks.unlockActive.value = true
    expect(await canWriteEvidence(pic, 'TASK', 't1')).toMatchObject({ ok: true })
  })

  it('task HARIAN hari ini dibekukan bila laporannya sudah diteruskan', async () => {
    mocks.task.value = { entityId: 'pt-a', projectId: 'p1', workDate: TODAY, scope: 'HARIAN', project: { picUserId: 'pic1' } }
    mocks.daily.value = { id: 'r1', forwardedAt: new Date(), isLocked: true }
    expect(await canWriteEvidence(pic, 'TASK', 't1')).toEqual({ ok: false, status: 409, error: FORWARDED_FROZEN_MESSAGE })
  })
})

describe('canWriteEvidence — item mingguan', () => {
  it('membolehkan minggu berjalan sebelum Jumat 17.00', async () => {
    mocks.weekly.value = weeklyItem()
    expect(await canWriteEvidence(head, 'WEEKLY_ITEM', 'i1')).toMatchObject({ ok: true })
  })

  it('membekukan laporan yang sudah diteruskan walau sebelum Jumat 17.00', async () => {
    mocks.weekly.value = weeklyItem({ forwardedAt: new Date(), statusHeader: 'DISETUJUI' })
    expect(await canWriteEvidence(head, 'WEEKLY_ITEM', 'i1')).toMatchObject({ ok: false, status: 409 })
  })

  it('minggu lalu terbuka hanya dengan buka kunci aktif', async () => {
    mocks.weekly.value = weeklyItem({ periodStart: LAST_MONDAY })
    expect(await canWriteEvidence(head, 'WEEKLY_ITEM', 'i1')).toMatchObject({ ok: false, status: 409 })
    mocks.unlockActive.value = true
    expect(await canWriteEvidence(head, 'WEEKLY_ITEM', 'i1')).toMatchObject({ ok: true })
  })
})
