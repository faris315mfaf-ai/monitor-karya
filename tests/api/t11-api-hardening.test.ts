import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asUser, db, jsonReq, resetWorld, wib } from './pic-world'

/*
 * [T11] Penguatan API sisa audit T10: panjang field laporan kemajuan,
 * P2002 -> 409, batas id notifikasi, dan unlock-request di bawah kunci baris.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => (await import('./pic-world')).auth)

import * as progress from '@/app/api/progress-reports/route'
import * as notifications from '@/app/api/notifications/route'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-06T10:00:00'))
  resetWorld()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('/api/progress-reports PUT', () => {
  const put = (body: Record<string, unknown>) =>
    progress.PUT(jsonReq('/api/progress-reports', 'PUT', { projectId: 'p-1', cadence: 'MINGGUAN', action: 'save', status: 'ON_PROGRESS', summary: 'ok', ...body }))

  beforeEach(() => {
    db.projectProgressReport.findUnique.mockResolvedValue(null)
    db.evidence.count.mockResolvedValue(0)
    db.projectProgressReport.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'r-1', ...data }))
  })

  it('S-2: summary/obstacle/followUp dipangkas sebelum disimpan', async () => {
    asUser('pic-1')
    const res = await put({ summary: 's'.repeat(50_000), obstacle: 'o'.repeat(50_000), followUp: 'f'.repeat(50_000) })
    expect(res.status).toBe(200)
    const data = db.projectProgressReport.create.mock.calls[0][0].data
    expect(data.summary).toHaveLength(4000)
    expect(data.obstacle).toHaveLength(2000)
    expect(data.followUp).toHaveLength(2000)
  })

  it('R-6: kiriman bersamaan (P2002) dibalas 409, bukan 500', async () => {
    asUser('pic-1')
    db.projectProgressReport.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    const res = await put({})
    expect(res.status).toBe(409)
  })

  it('S-3: galat tulis tak terduga dibalas 500 umum tanpa bocor detail', async () => {
    asUser('pic-1')
    db.projectProgressReport.create.mockRejectedValue(new Error('Invalid prisma.projectProgressReport.create() invocation'))
    const res = await put({})
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/prisma|invocation/i)
  })
})

describe('/api/notifications PATCH', () => {
  it('R-3: ids dibatasi 200 butir dan 64 karakter', async () => {
    asUser('pic-1')
    db.notificationLog.updateMany.mockResolvedValue({ count: 0 })
    const ids = [...Array.from({ length: 500 }, (_, i) => `n-${i}`), 'x'.repeat(100)]
    await notifications.PATCH(jsonReq('/api/notifications', 'PATCH', { ids }))
    const where = db.notificationLog.updateMany.mock.calls[0][0].where
    expect(where.id.in).toHaveLength(200)
    expect(where.id.in.every((x: string) => x.length <= 64)).toBe(true)
  })
})
