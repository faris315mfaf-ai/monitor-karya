import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [F3-D] POST /api/inbox (Admin PT meneruskan ke holding) dengan basis data
 * tiruan di memori: hak & cakupan PT, laporan mingguan harus disetujui, dan
 * dua klik bersamaan hanya meneruskan sekali (satu AuditLog, satu tiket
 * urungkan) — untuk laporan harian maupun mingguan.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})

import { AUTH_SECRET_FOR_TESTS, cookie, one, rows, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { isoWeekOf, startOfWibDay, weeklyDeadlines } from '@/lib/lock'
import { POST as inboxPost } from '@/app/api/inbox/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const T0 = new Date('2026-10-06T03:00:00Z') // Selasa 10.00 WIB

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}
const forward = (body: Record<string, unknown>) =>
  inboxPost(new NextRequest('http://localhost/api/inbox', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))

let dailyId: string
let weeklyId: string

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  vi.spyOn(console, 'error').mockImplementation(() => {})
  ;[{ id: dailyId }] = seed('dailyProjectReport', [
    { projectId: 'prj-a', entityId: 'pt-a', reportDate: startOfWibDay(T0), status: 'ON_PROGRESS', submittedAt: T0, submittedById: 'u-pic-a' },
  ]) as { id: string }[]
  const { isoYear, isoWeek } = isoWeekOf(T0)
  const { periodStart, periodEnd } = weeklyDeadlines(T0)
  ;[{ id: weeklyId }] = seed('weeklyDivisionReport', [
    { divisionId: 'div-a1', entityId: 'pt-a', isoYear, isoWeek, periodStart, periodEnd, statusHeader: 'DISETUJUI', submittedAt: T0, approvedAt: T0 },
  ]) as { id: string }[]
})
afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/inbox', () => {
  it('PIC, kepala divisi, dan Auditor tidak meneruskan; Admin PT lain 403', async () => {
    for (const who of ['u-pic-a', 'u-auditor', 'u-dir-a']) {
      signIn(who)
      expect((await forward({ kind: 'daily', id: dailyId })).status, who).toBe(403)
    }
    signIn('u-kadiv-a')
    expect((await forward({ kind: 'weekly', id: weeklyId })).status).toBe(403)
    signIn('u-admin-b')
    expect((await forward({ kind: 'daily', id: dailyId })).status).toBe(403)
    expect((await forward({ kind: 'weekly', id: weeklyId })).status).toBe(403)
    expect(one('dailyProjectReport', dailyId).forwardedAt).toBeNull()
    expect(one('weeklyDivisionReport', weeklyId).forwardedAt).toBeNull()
  })

  it('laporan mingguan yang belum disetujui kepala divisi ditolak 422', async () => {
    one('weeklyDivisionReport', weeklyId).statusHeader = 'MENUNGGU_PERSETUJUAN'
    signIn('u-admin-a')
    expect((await forward({ kind: 'weekly', id: weeklyId })).status).toBe(422)
  })

  it('harian: dua klik bersamaan → satu diteruskan, satu 409', async () => {
    signIn('u-admin-a')
    const [a, b] = await Promise.all([forward({ kind: 'daily', id: dailyId }), forward({ kind: 'daily', id: dailyId })])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(one('dailyProjectReport', dailyId)).toMatchObject({ forwardedById: 'u-admin-a', isLocked: true })
    expect(rows('auditLog', { action: 'FORWARD_DAILY_REPORT' })).toHaveLength(1)
    expect(rows('undoToken')).toHaveLength(1)
  })

  it('mingguan: dua klik bersamaan → satu diteruskan, satu 409', async () => {
    signIn('u-admin-a')
    const [a, b] = await Promise.all([forward({ kind: 'weekly', id: weeklyId }), forward({ kind: 'weekly', id: weeklyId })])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(one('weeklyDivisionReport', weeklyId).forwardedById).toBe('u-admin-a')
    expect(rows('auditLog', { action: 'FORWARD_WEEKLY_REPORT' })).toHaveLength(1)
    expect(rows('undoToken')).toHaveLength(1)
  })
})
