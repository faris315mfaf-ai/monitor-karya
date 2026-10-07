import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  query: vi.fn(), create: vi.fn(), update: vi.fn(), find: vi.fn(), ruleRows: vi.fn(), entityRows: vi.fn(),
  configured: vi.fn(), signed: vi.fn(), kpi: vi.fn(), working: vi.fn(), remind: vi.fn(),
  entities: vi.fn(), rules: vi.fn(), due: vi.fn(), run: vi.fn(), enabled: vi.fn(),
  revert: vi.fn(), relock: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: {
  $queryRaw: m.query, auditLog: { create: m.create, updateMany: m.update, findFirst: m.find },
  reminderRule: { findMany: m.ruleRows }, entity: { findMany: m.entityRows },
} }))
vi.mock('@/lib/storage', () => ({ storageConfigured: m.configured, EVIDENCE_BUCKET: 'evidence' }))
vi.mock('@/lib/storage-s3', () => ({ signedS3EvidenceUrl: m.signed }))
vi.mock('@/lib/kpi-snapshot', () => ({ refreshKpiSnapshots: m.kpi }))
vi.mock('@/lib/lock', () => ({ isWorkingDay: m.working }))
vi.mock('@/lib/reminders', () => ({ remindUnreportedDivisions: m.remind }))
vi.mock('@/lib/reminder-rules', () => ({ reportingEntities: m.entities, getRules: m.rules, isDue: m.due, runDueRules: m.run, entitiesWithRuleEnabled: m.enabled }))
vi.mock('@/lib/access-requests', () => ({ revertExpiredAccess: m.revert }))
vi.mock('@/lib/unlock-requests', () => ({ relockExpiredUnlocks: m.relock }))

import { readiness, operationalStatus, runOperationalJob, finishJob, JOBS, STORAGE_PROBE_CONTENT, PROBE_TIMEOUT_MS } from '@/lib/operational-health'
import { GET as live } from '@/app/api/health/route'
import { GET as ready } from '@/app/api/health/ready/route'
import { GET as internal } from '@/app/api/health/internal/route'
import { POST as report } from '@/app/api/health/backup/route'
import { GET as kpi } from '@/app/api/cron/kpi-snapshot/route'
import { GET as divisions } from '@/app/api/cron/remind-divisions/route'
import { GET as rules } from '@/app/api/cron/reminder-rules/route'

const secret = 'offline-test-operational-secret-32chars'
const runId = 'a1234567-1234-4123-8123-123456789abc'
const req = (secretValue = secret) => new NextRequest('http://localhost/api/cron/test', { headers: { authorization: `Bearer ${secretValue}` } })
const backup = (body: unknown) => new Request('http://localhost/api/health/backup', { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['OPS_HEALTH_SECRET', 'BACKUP_REPORT_SECRET', 'CRON_SECRET']) vi.stubEnv(name, secret)
  vi.stubEnv('STORAGE_DRIVER', 'supabase')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.invalid')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'offline-private-storage-secret')
  m.query.mockResolvedValue([{ '?column?': 1 }]); m.create.mockResolvedValue({ id: runId })
  m.update.mockResolvedValue({ count: 1 }); m.find.mockResolvedValue(null); m.configured.mockReturnValue(true)
  m.ruleRows.mockResolvedValue([]); m.entityRows.mockResolvedValue([{ id: 'allowed' }]); m.working.mockReturnValue(true); m.enabled.mockResolvedValue(null)
  m.signed.mockReturnValue('https://storage.invalid/evidence/_health/readiness.txt?signature=private')
  m.kpi.mockResolvedValue({ updated: ['one'], failed: [] })
  m.remind.mockResolvedValue({ sent: 0, results: [], week: { key: '2026-W41' } })
  m.entities.mockResolvedValue([{ id: 'entity-one' }]); m.rules.mockResolvedValue([{ kind: 'HARIAN' }])
  m.due.mockReturnValue(true); m.run.mockResolvedValue([{ entityId: 'entity-one', kind: 'HARIAN', sent: 1 }])
  m.revert.mockResolvedValue(0); m.relock.mockResolvedValue(0)
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(STORAGE_PROBE_CONTENT)))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('readiness reads real dependencies without exposing private details', () => {
  it('keeps liveness independent of DB and storage', async () => {
    expect(await live().json()).toEqual({ ok: true, status: 'alive' })
    expect(m.query).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it('requires a query and the exact probe content, not merely credentials or HTTP 200', async () => {
    const response = await ready()
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, status: 'ready' })
    expect(m.query.mock.calls[0][0]).toEqual(['SELECT 1'])
    expect(fetch).toHaveBeenCalledWith(new URL('https://storage.invalid/storage/v1/object/authenticated/evidence/_health/readiness.txt'), expect.objectContaining({ cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) }))
    expect(response.headers.get('cache-control')).toBe('no-store')
    await ready(); expect(m.query).toHaveBeenCalledTimes(2)
  })
  it.each([403, 404, 500])('rejects failed storage status %i', async status => {
    vi.mocked(fetch).mockResolvedValue(new Response('secret detail', { status }))
    const response = await ready(); expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, status: 'degraded' })
  })
  it.each(['<html>Login</html>', '', STORAGE_PROBE_CONTENT + '\n', 'x'.repeat(129)])('rejects incorrect object body (%s)', async body => {
    vi.mocked(fetch).mockResolvedValue(new Response(body)); expect((await ready()).status).toBe(200)
    expect((await readiness()).storage).toBe(false)
  })
  it('uses an authenticated S3 GET, rather than considering a minted URL a successful probe', async () => {
    vi.stubEnv('STORAGE_DRIVER', 's3')
    expect((await ready()).status).toBe(200)
    expect(m.signed).toHaveBeenCalledWith('_health/readiness.txt', 30)
    expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ headers: {} }))
    vi.mocked(fetch).mockRejectedValue(new Error('private signature'))
    expect((await readiness()).storageStatus).toBe('degraded')
  })
  it('fails closed for absent storage configuration and DB errors', async () => {
    m.configured.mockReturnValue(false); m.query.mockRejectedValue(new Error('postgres://private-secret'))
    const response = await ready(); expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, status: 'unavailable' }); expect(fetch).not.toHaveBeenCalled()
  })
  it('bounds stalled queries and shares only in-flight checks', async () => {
    vi.useFakeTimers(); m.query.mockImplementation(() => new Promise(() => {}))
    const first = readiness(); const second = readiness(); expect(first).toBe(second)
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1)
    expect(await first).toEqual({ ok: false, database: false, storage: true, storageStatus: 'ok' })
    m.query.mockResolvedValue([]); expect((await readiness()).ok).toBe(true)
  })
  it('bounds stalled storage connections', async () => {
    vi.useFakeTimers(); vi.mocked(fetch).mockImplementation(() => new Promise(() => {}))
    const response = ready(); await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1)
    expect((await response).status).toBe(200)
    expect((await (await response).json()).status).toBe('degraded')
  })
  it('reports configmissing explicitly without rejecting DB readiness', async () => {
    m.configured.mockReturnValue(false)
    expect(await readiness()).toEqual({ ok: true, database: true, storage: false, storageStatus: 'configmissing' })
    expect((await internal(req())).status).toBe(503)
  })
})

describe('internal job status is private and fails closed', () => {
  it('does not touch dependencies for unauthenticated or unconfigured requests', async () => {
    expect((await internal(req('wrong'))).status).toBe(401)
    vi.stubEnv('OPS_HEALTH_SECRET', 'short')
    expect((await internal(req())).status).toBe(503)
    expect(m.query).not.toHaveBeenCalled(); expect(m.find).not.toHaveBeenCalled()
  })
  it('missing heartbeats cannot report health', async () => {
    const response = await internal(req()); expect(response.status).toBe(503)
    expect((await response.json()).jobs).toHaveLength(4)
  })
  it('all fixed jobs with fresh successes are healthy', async () => {
    m.find.mockResolvedValue({ action: 'OPS_SUCCESS', at: new Date() })
    expect((await internal(req())).status).toBe(200)
  })
  it.each([
    ['OPS_FAILURE', 0, 'failure'], ['OPS_RUNNING', 7 * 3_600_000, 'stalled'],
    ['OPS_SUCCESS', 100 * 3_600_000, 'stale'], ['OPS_SUCCESS', -1000, 'invalid'],
    ['unknown', 0, 'invalid'],
  ])('rejects %s with age %i', async (action, age, state) => {
    const now = new Date(); m.find.mockResolvedValue({ action, at: new Date(now.getTime() - age) })
    const status = await operationalStatus(now)
    expect(status.ok).toBe(false); expect(status.jobs.every(job => job.status === state)).toBe(true)
  })
  it('a running attempt cannot hide a preceding failure', async () => {
    const at = new Date()
    m.find.mockImplementation(async ({ where }) => ({ action: where.action ? 'OPS_FAILURE' : 'OPS_RUNNING', at }))
    expect((await operationalStatus()).ok).toBe(false)
  })
  it('a running attempt can retain a recent successful state until it stalls', async () => {
    const at = new Date()
    m.find.mockImplementation(async ({ where }) => ({ action: where.action ? 'OPS_SUCCESS' : 'OPS_RUNNING', at }))
    expect((await operationalStatus()).ok).toBe(true)
  })
  it('does not leak DB diagnostics when heartbeat queries fail', async () => {
    m.find.mockRejectedValue(new Error('private database secret'))
    const response = await internal(req()); expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database secret')
  })
})

describe('cron instrumentation records terminal failures', () => {
  it.each([kpi, divisions, rules])('authenticates before creating heartbeats', async handler => {
    expect((await handler(req('wrong'))).status).toBe(401); expect(m.create).not.toHaveBeenCalled()
  })
  it.each([kpi, divisions, rules])('records a successful execution', async handler => {
    expect((await handler(req())).status).toBe(200)
    expect(m.create.mock.calls[0][0].data).toMatchObject({ action: 'OPS_RUNNING', targetType: 'OPERATIONAL_JOB' })
    expect(m.update.mock.calls.at(-1)?.[0].data.action).toBe('OPS_SUCCESS')
  })
  it('records weekend skips as successful execution', async () => {
    m.working.mockReturnValue(false)
    expect((await divisions(req())).status).toBe(200); expect(m.remind).not.toHaveBeenCalled()
    expect(m.update.mock.calls.at(-1)?.[0].data.action).toBe('OPS_SUCCESS')
  })
  it('records KPI partial failures as non-2xx', async () => {
    m.kpi.mockResolvedValue({ updated: ['one'], failed: ['two'] })
    expect((await kpi(req())).status).toBe(503)
    expect(m.update.mock.calls.at(-1)?.[0].data.action).toBe('OPS_FAILURE')
  })
  it('catches swallowed reminder-rule failures by checking the due set', async () => {
    m.run.mockResolvedValue([])
    const response = await rules(req()); expect(response.status).toBe(503)
    expect((await response.json()).failed).toBe(1)
    expect(m.update.mock.calls.at(-1)?.[0].data.action).toBe('OPS_FAILURE')
  })
  it('does not proceed through the legacy missing-rule-table fallback', async () => {
    m.ruleRows.mockRejectedValue(new Error('missing table'))
    expect((await divisions(req())).status).toBe(503); expect(m.remind).not.toHaveBeenCalled()
  })
  it('excludes explicitly disabled divisions without a fallback', async () => {
    m.ruleRows.mockResolvedValue([{ entityId: 'disabled', enabled: false }])
    expect((await divisions(req())).status).toBe(200)
    expect(m.entityRows).toHaveBeenCalledWith({ where: { isActive: true, id: { notIn: ['disabled'] } }, select: { id: true } })
    expect(m.remind).toHaveBeenCalledWith({ entityIds: ['allowed'], source: 'CRON' })
  })
  it('persists thrown failures without exception strings', async () => {
    m.revert.mockRejectedValue(new Error('private database secret'))
    const response = await rules(req()); expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database secret')
    expect(JSON.stringify(m.update.mock.calls)).not.toContain('private database secret')
  })
  it('does no work if start heartbeat cannot be saved', async () => {
    m.create.mockRejectedValue(new Error('unavailable'))
    expect((await kpi(req())).status).toBe(503); expect(m.kpi).not.toHaveBeenCalled()
  })
  it('does not claim success when completion cannot be saved', async () => {
    m.update.mockResolvedValue({ count: 0 })
    expect((await kpi(req())).status).toBe(503)
  })
  it('bounds hung job execution', async () => {
    vi.useFakeTimers()
    const response = runOperationalJob('kpi-snapshot', () => new Promise<{ ok: boolean }>(() => {}))
    await vi.advanceTimersByTimeAsync(JOBS['kpi-snapshot'].maxRunMs + 1)
    expect((await response).status).toBe(503)
  })
})

describe('backup reports have fixed states and bounded input', () => {
  it('uses a distinct secret and rejects before reading the body', async () => {
    vi.stubEnv('BACKUP_REPORT_SECRET', secret + '-different')
    expect((await report(backup({ status: 'success', runId }))).status).toBe(401)
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled()
  })
  it.each([
    null, [], { status: 'success' }, { status: 'green', runId }, { status: 'success', runId: '../key' },
    { status: 'success', runId, details: 'private' }, { status: 'success', runId, job: 'kpi-snapshot' },
    { status: 'success', runId, at: '2099-01-01' }, { status: 'x'.repeat(1024), runId },
  ])('rejects unbounded or arbitrary report fields', async payload => {
    expect((await report(backup(payload))).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled()
  })
  it('records running then accepts a conditional completion', async () => {
    expect((await report(backup({ status: 'running', runId }))).status).toBe(200)
    expect(m.create.mock.calls[0][0].data).toMatchObject({ id: runId, targetId: 'backup', action: 'OPS_RUNNING' })
    expect((await report(backup({ status: 'failure', runId }))).status).toBe(200)
    expect(m.update.mock.calls[0][0]).toMatchObject({ where: { id: runId, targetId: 'backup', action: 'OPS_RUNNING' }, data: { action: 'OPS_FAILURE' } })
  })
  it('rejects unknown, expired or replayed completion', async () => {
    m.update.mockResolvedValue({ count: 0 })
    expect((await report(backup({ status: 'success', runId }))).status).toBe(409)
    await finishJob('backup', runId, 'success')
    expect(m.update.mock.calls[0][0].where.at).toEqual({ gte: expect.any(Date), lte: expect.any(Date) })
  })
})
