import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRow } from '@/components/preview/mock-laporan'

type Board = {
  mode: string; locked: boolean; period: { key: string }
  frozenDays: string[]; days: string[]; tasks: TaskRow[]
}
const role = 'PIC_PROYEK'
let handle: typeof import('@/components/preview/mock-laporan').handle

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-06T07:00:00Z'))
  handle = (await import('@/components/preview/mock-laporan')).handle
})
afterEach(() => vi.useRealTimers())

async function request(path: string, query: string, init?: RequestInit) {
  const response = handle(path, `${path}?${query}`, init, role)
  expect(response).not.toBeNull()
  return await response!
}
async function board(week: string) {
  const response = await request('/api/tasks', `projectId=p2&week=${week}`)
  expect(response.status).toBe(200)
  return await response.json() as Board
}

describe('PIC weekly preview integration', () => {
  it('serves the current board with a populated frozen Monday', async () => {
    const data = await board('2026-W41')
    expect(data.mode).toBe('MINGGUAN')
    expect(data.locked).toBe(false)
    const monday = '2026-10-04T17:00:00.000Z'
    expect(data.frozenDays).toContain(monday)
    expect(data.tasks.some((t) => t.scope === 'HARIAN' && t.workDate === monday)).toBe(true)
    expect(data.days).toContain(monday)
  })

  it('serves populated and empty frozen lanes in the previous week without duplicating tasks', async () => {
    const data = await board('2026-W40')
    const monday = '2026-09-27T17:00:00.000Z'
    const friday = '2026-10-01T17:00:00.000Z'
    expect(data.frozenDays).toContain(monday)
    expect(data.frozenDays).toContain(friday)
    expect(data.tasks.some((t) => t.scope === 'HARIAN' && t.workDate === monday)).toBe(true)
    expect(data.tasks.filter((t) => t.scope === 'HARIAN' && t.workDate === friday)).toEqual([])
    expect((await board('2026-W40')).tasks.map((t) => t.id)).toEqual(data.tasks.map((t) => t.id))
  })

  it('rejects a move into a frozen lane even when that lane has no cards', async () => {
    // Thursday: preserve Tuesday's canonical tasks; Wednesday is the empty frozen lane.
    vi.setSystemTime(new Date('2026-10-08T07:00:00Z'))
    const data = await board('2026-W41')
    const wednesday = '2026-10-06T17:00:00.000Z'
    expect(data.tasks.filter((t) => t.scope === 'HARIAN' && t.workDate === '2026-10-05T17:00:00.000Z')).toHaveLength(4)
    expect(data.locked).toBe(false)
    expect(data.frozenDays).toContain(wednesday)
    expect(data.tasks.filter((t) => t.scope === 'HARIAN' && t.workDate === wednesday)).toEqual([])
    const task = data.tasks.find((t) => t.scope === 'MINGGUAN')!
    const response = await request('/api/tasks', '', {
      method: 'PATCH', body: JSON.stringify({ projectId: 'p2', week: '2026-W41', moves: [{ id: task.id, lane: '2026-10-07', sortOrder: 0 }] }),
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ frozen: 'FORWARDED', locked: true })
  })

  it.each(['MINGGUAN', 'BULANAN'])('serves PIC progress reports for %s through the existing interceptor', async (cadence) => {
    const response = await request('/api/progress-reports', `projectId=p2&cadence=${cadence}`)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.project.id).toBe('p2')
    expect(data.cadence).toBe(cadence)
    expect(data.periods.some((p: { current: boolean }) => p.current)).toBe(true)
  })
})
