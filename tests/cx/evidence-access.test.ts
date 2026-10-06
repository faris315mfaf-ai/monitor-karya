import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth'

const mocks = vi.hoisted(() => ({
  daily: vi.fn(),
  weeklyItem: vi.fn(),
  task: vi.fn(),
  unlock: vi.fn(),
  dailyLocked: vi.fn(),
  weeklyLocked: vi.fn(),
  scope: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: {
  dailyProjectReport: { findUnique: mocks.daily },
  weeklyReportItem: { findUnique: mocks.weeklyItem },
  task: { findUnique: mocks.task },
  unlockRequest: { findFirst: mocks.unlock },
} }))
vi.mock('@/lib/auth', () => ({
  isGlobalRole: (role: string) => role === 'SUPERADMIN',
  scopeEntityIds: mocks.scope,
}))
vi.mock('@/lib/rbac', () => ({ isMasterRole: (role: string) => role === 'SUPERADMIN' }))
vi.mock('@/lib/lock', () => ({
  isDailyLocked: mocks.dailyLocked,
  isWeeklyLocked: mocks.weeklyLocked,
  isProgressLocked: vi.fn(),
}))

// Keep activeUnlockFor real; only its database query is mocked. This checks
// expiry/relock filtering as well as the report ID used by evidence access.
import { canReadEvidence, canWriteEvidence } from '@/lib/evidence-access'

const now = new Date('2026-10-06T12:00:00Z')
const day = new Date('2026-10-06T00:00:00Z')
const owner: SessionUser = {
  id: 'owner', name: 'Pemilik', email: 'owner@example.test',
  role: 'PIC_PROYEK', scopeEntityId: 'entity', avatarColor: null,
}

type UnlockRow = {
  id: string; targetType: string; targetId: string; status: string
  unlockUntil: Date; reLockedAt: Date | null
}
let unlockRow: UnlockRow | null
let daily: { id: string; entityId: string; reportDate: Date; isLocked: boolean; forwardedAt: Date | null; project: { picUserId: string } }
let weekly: { id: string; entityId: string; periodStart: Date; isLocked: boolean; forwardedAt: Date | null; statusHeader: string; division: { headUserId: string } }
let reportExists: boolean

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  unlockRow = null
  reportExists = true
  daily = { id: 'daily-report', entityId: 'entity', reportDate: day, isLocked: false, forwardedAt: null, project: { picUserId: 'owner' } }
  weekly = { id: 'weekly-report', entityId: 'entity', periodStart: day, isLocked: false, forwardedAt: null, statusHeader: 'DRAFT', division: { headUserId: 'owner' } }
  mocks.daily.mockImplementation(() => reportExists ? daily : null)
  mocks.weeklyItem.mockImplementation(() => ({ weeklyReport: weekly }))
  mocks.task.mockResolvedValue({ entityId: 'entity', projectId: 'project', workDate: day, project: { picUserId: 'owner' } })
  mocks.dailyLocked.mockReturnValue(false)
  mocks.weeklyLocked.mockReturnValue(false)
  mocks.scope.mockResolvedValue(['entity'])
  mocks.unlock.mockImplementation(({ where }) => {
    if (!unlockRow || unlockRow.targetType !== where.targetType || unlockRow.targetId !== where.targetId ||
      unlockRow.status !== where.status || unlockRow.reLockedAt !== where.reLockedAt ||
      unlockRow.unlockUntil <= where.unlockUntil.gt) return null
    return { id: unlockRow.id, unlockUntil: unlockRow.unlockUntil }
  })
})

afterEach(() => vi.useRealTimers())

const targets = ['DAILY_REPORT', 'TASK', 'WEEKLY_ITEM'] as const

function actor(target: string) {
  return target === 'WEEKLY_ITEM' ? { ...owner, role: 'KEPALA_DIVISI' } : owner
}
function unlock(target: string) {
  unlockRow = {
    id: 'unlock', targetType: target === 'WEEKLY_ITEM' ? 'WEEKLY_REPORT' : 'DAILY_REPORT',
    targetId: target === 'WEEKLY_ITEM' ? weekly.id : daily.id,
    status: 'DIEKSEKUSI', unlockUntil: new Date(now.getTime() + 3600000), reLockedAt: null,
  }
}
function freeze(target: string, reason: 'manual' | 'forwarded' | 'cutoff') {
  if (reason === 'manual') (target === 'WEEKLY_ITEM' ? weekly : daily).isLocked = true
  if (reason === 'forwarded') (target === 'WEEKLY_ITEM' ? weekly : daily).forwardedAt = now
  if (reason === 'cutoff') (target === 'WEEKLY_ITEM' ? mocks.weeklyLocked : mocks.dailyLocked).mockReturnValue(true)
}

describe.each(targets)('%s evidence', (target) => {
  it('allows its owner before locking', async () => {
    expect(await canWriteEvidence(actor(target), target, 'target')).toEqual({ ok: true, entityId: 'entity' })
  })

  it.each(['manual', 'forwarded', 'cutoff'] as const)('freezes evidence for %s and permits an active unlock', async (reason) => {
    freeze(target, reason)
    expect(await canWriteEvidence(actor(target), target, 'target')).toMatchObject({ ok: false, status: 409 })
    unlock(target)
    // A direct daily target is itself the report ID.
    const id = target === 'DAILY_REPORT' ? daily.id : 'target'
    expect(await canWriteEvidence(actor(target), target, id)).toEqual({ ok: true, entityId: 'entity' })
    expect(mocks.unlock).toHaveBeenLastCalledWith({
      where: {
        targetType: target === 'WEEKLY_ITEM' ? 'WEEKLY_REPORT' : 'DAILY_REPORT',
        targetId: target === 'WEEKLY_ITEM' ? weekly.id : daily.id,
        status: 'DIEKSEKUSI', reLockedAt: null, unlockUntil: { gt: now },
      },
      select: { id: true, unlockUntil: true },
    })
  })

  it.each(['expired', 'boundary', 'relocked', 'pending', 'foreign-report'] as const)('rejects an %s unlock', async (state) => {
    freeze(target, 'forwarded')
    unlock(target)
    if (state === 'expired') unlockRow!.unlockUntil = new Date(now.getTime() - 1)
    if (state === 'boundary') unlockRow!.unlockUntil = now
    if (state === 'relocked') unlockRow!.reLockedAt = new Date(now.getTime() - 1)
    if (state === 'pending') unlockRow!.status = 'DISETUJUI'
    if (state === 'foreign-report') unlockRow!.targetId = 'other-report'
    expect(await canWriteEvidence(actor(target), target, target === 'DAILY_REPORT' ? daily.id : 'target')).toMatchObject({ ok: false, status: 409 })
  })

  it('does not grant ownership when the report is unlocked', async () => {
    freeze(target, 'manual')
    unlock(target)
    expect(await canWriteEvidence({ ...actor(target), id: 'foreign-owner' }, target, target === 'DAILY_REPORT' ? daily.id : 'target')).toMatchObject({ ok: false, status: 403 })
  })

  it('keeps monitoring roles read-only even with an active unlock', async () => {
    unlock(target)
    expect(await canWriteEvidence({ ...owner, role: 'DIREKTUR_ENTITAS' }, target, 'target')).toMatchObject({ ok: false, status: 403 })
  })

  it('keeps scoped evidence readable while frozen', async () => {
    freeze(target, 'forwarded')
    expect(await canReadEvidence({ ...owner, role: 'DIREKTUR_ENTITAS' }, target, 'target')).toEqual({ ok: true, entityId: 'entity' })
    mocks.scope.mockResolvedValue(['other-entity'])
    expect(await canReadEvidence(owner, target, 'target')).toMatchObject({ ok: false, status: 403 })
  })
})

it('looks up the task report using its project and work date', async () => {
  freeze('TASK', 'manual')
  await canWriteEvidence(owner, 'TASK', 'task')
  expect(mocks.daily).toHaveBeenCalledWith({
    where: { projectId_reportDate: { projectId: 'project', reportDate: day } },
    select: { id: true, isLocked: true, forwardedAt: true },
  })
})

it('locks a task after cutoff even if there is no daily report to unlock', async () => {
  reportExists = false
  mocks.dailyLocked.mockReturnValue(true)
  expect(await canWriteEvidence(owner, 'TASK', 'task')).toMatchObject({ ok: false, status: 409 })
  mocks.dailyLocked.mockReturnValue(false)
  expect(await canWriteEvidence(owner, 'TASK', 'task')).toEqual({ ok: true, entityId: 'entity' })
})

it('honors the weekly TERKUNCI header and its report unlock', async () => {
  weekly.statusHeader = 'TERKUNCI'
  expect(await canWriteEvidence(actor('WEEKLY_ITEM'), 'WEEKLY_ITEM', 'item')).toMatchObject({ ok: false, status: 409 })
  unlock('WEEKLY_ITEM')
  expect(await canWriteEvidence(actor('WEEKLY_ITEM'), 'WEEKLY_ITEM', 'item')).toEqual({ ok: true, entityId: 'entity' })
})

it('returns 404 for missing reports and tasks', async () => {
  reportExists = false
  mocks.task.mockResolvedValue(null)
  mocks.weeklyItem.mockResolvedValue(null)
  for (const target of targets) {
    expect(await canWriteEvidence(actor(target), target, 'missing')).toMatchObject({ ok: false, status: 404 })
  }
})
