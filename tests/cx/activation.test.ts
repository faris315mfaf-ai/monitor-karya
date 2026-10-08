import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import type { Tx } from '@/lib/companies'
import { hashPassword, verifyPassword } from '@/lib/password'

const mocks = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    accessRequest: { findFirst: vi.fn() },
    accountActivation: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(), $transaction: vi.fn(),
  },
  requireApiUser: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: mocks.requireApiUser }))

import {
  ACTIVATION_TTL_MS, ActivationRefusal, activationAvailability, activationConsumeLimit,
  activationError, activationIssueLimit, consumeAccountActivation, issueAccountActivation,
} from '@/lib/account-activation'
import { POST as activate } from '@/app/api/auth/activate/route'
import { GET as availability, POST as reissue } from '@/app/api/companies/users/activation/route'
import { resetRate } from '@/lib/security'

const actor = { id: 'admin', role: 'ADMIN_PT', scopeEntityId: 'pt-a' }
const tx = mocks.db as unknown as Tx
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
let account: { id: string; username: string; email: string; role: string; scopeEntityId: string | null; passwordHash: string | null; isActive: boolean; mustChangePassword: boolean; lastLoginAt: Date | null }
type Link = { userId: string; tokenHash: string; credentialDigest: string; expiresAt: Date; consumedAt: Date | null; createdAt: Date }
let link: Link | null
let approved: boolean
let queue: Promise<unknown>

beforeEach(async () => {
  vi.clearAllMocks()
  account = { id: 'new-user', username: 'galih', email: 'galih@example.test', role: 'PIC_PROYEK', scopeEntityId: 'pt-a', passwordHash: await hashPassword('temporary-account-secret'), isActive: true, mustChangePassword: true, lastLoginAt: null }
  link = null
  approved = true
  queue = Promise.resolve()
  mocks.requireApiUser.mockResolvedValue(actor)
  mocks.db.user.findUnique.mockImplementation(async () => ({ ...account }))
  mocks.db.accessRequest.findFirst.mockImplementation(async () => approved ? { id: 'approved-request' } : null)
  mocks.db.accountActivation.findUnique.mockImplementation(async ({ where }) => {
    if (!link || (where.tokenHash && link.tokenHash !== where.tokenHash)) return null
    return { ...link }
  })
  mocks.db.accountActivation.upsert.mockImplementation(async ({ create, update }) => { link = link ? { ...link, ...update } : { ...create }; return link })
  mocks.db.accountActivation.updateMany.mockImplementation(async ({ where, data }) => {
    if (!link || link.tokenHash !== where.tokenHash || link.consumedAt || link.expiresAt <= where.expiresAt.gt) return { count: 0 }
    link = { ...link, ...data }; return { count: 1 }
  })
  mocks.db.user.updateMany.mockImplementation(async ({ where, data }) => {
    if (account.passwordHash !== where.passwordHash || !account.isActive || !account.mustChangePassword || account.lastLoginAt) return { count: 0 }
    account = { ...account, ...data }; return { count: 1 }
  })
  mocks.db.auditLog.create.mockResolvedValue({})
  mocks.db.$queryRaw.mockResolvedValue([{ id: account.id }])
  // Simulate transactions serialized by the User row lock, with rollback.
  // Real PostgreSQL lock behavior belongs to the parent's integration gate.
  mocks.db.$transaction.mockImplementation((fn) => {
    const next = queue.then(async () => {
      const before = { account: { ...account }, link: link ? { ...link } : null }
      try { return await fn(tx) }
      catch (err) { account = before.account; link = before.link; throw err }
    })
    queue = next.catch(() => undefined)
    return next
  })
  for (const key of ['activation:global', 'activation:ip:unknown', 'activation:ip:test-ip', 'activation:issue:admin', 'activation:target:new-user']) resetRate(key)
})

const issue = () => mocks.db.$transaction((client: Tx) => issueAccountActivation(client, actor, account.id, null)) as ReturnType<typeof issueAccountActivation>
const tokenOf = (path: string) => new URLSearchParams(path.split('#')[1]).get('token')!
const request = (url: string, body: unknown) => new NextRequest(`http://localhost:3200${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('CX18 — activation handoff', () => {
  it('issues an opaque fragment token; only digests and expiry are persisted/audited', async () => {
    const value = await issue()
    const token = tokenOf(value.path)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(value.path).toMatch(/^\/login\/aktivasi#token=/)
    expect(value.path).not.toContain('?')
    expect(link?.tokenHash).toBe(sha(token))
    expect(link?.credentialDigest).toBe(sha(account.passwordHash!))
    expect(link!.expiresAt.getTime() - link!.createdAt.getTime()).toBe(ACTIVATION_TTL_MS)
    expect(JSON.stringify(mocks.db.accountActivation.upsert.mock.calls)).not.toContain(token)
    expect(JSON.stringify(mocks.db.auditLog.create.mock.calls)).not.toContain(token)
    expect(JSON.stringify(mocks.db.auditLog.create.mock.calls)).not.toContain(account.passwordHash!)
    expect(mocks.db.$queryRaw).toHaveBeenCalled()
  })
  it('metadata cannot recover a token', async () => {
    await issue()
    expect(await activationAvailability(actor, account.id)).toEqual({ canActivate: true })
    expect(await (await availability(new NextRequest(`http://localhost:3200/api/companies/users/activation?id=${account.id}`))).json()).toEqual({ canActivate: true })
  })
  it.each([
    ['PIC_PROYEK', 'pt-a'], ['AUDITOR', null], ['ADMIN_PT', null], ['ADMIN_PT', 'pt-b'],
  ])('denies issuer %s scoped %s', async (role, scopeEntityId) => {
    await expect(issueAccountActivation(tx, { ...actor, role: role!, scopeEntityId }, account.id, null)).rejects.toBeInstanceOf(ActivationRefusal)
    expect(mocks.db.accountActivation.upsert).not.toHaveBeenCalled()
  })
  it('denies Admin PT elevated roles, and denies TI a SUPERADMIN target', async () => {
    account.role = 'DIREKTUR_ENTITAS'
    await expect(issue()).rejects.toMatchObject({ status: 404 })
    account.role = 'SUPERADMIN'
    await expect(issueAccountActivation(tx, { ...actor, role: 'TI', scopeEntityId: null }, account.id, null)).rejects.toMatchObject({ status: 404 })
  })
  it('permits TI ordinary accounts and Super Admin approved elevated accounts', async () => {
    await issueAccountActivation(tx, { ...actor, role: 'TI', scopeEntityId: null }, account.id, null)
    account.role = 'DIREKTUR_ENTITAS'
    await expect(issueAccountActivation(tx, { ...actor, role: 'SUPERADMIN', scopeEntityId: null }, account.id, null)).resolves.toHaveProperty('path')
  })
  it('requires approved AKUN_BARU and excludes self', async () => {
    approved = false
    await expect(issue()).rejects.toMatchObject({ status: 409 })
    expect(mocks.db.accessRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { targetUserId: account.id, type: 'AKUN_BARU', status: 'DISETUJUI' } }))
    account.id = actor.id
    await expect(issue()).rejects.toMatchObject({ status: 403 })
  })
  it.each(['inactive', 'already-set', 'already-login', 'no-hash'])('does not issue for %s account', async (kind) => {
    if (kind === 'inactive') account.isActive = false
    if (kind === 'already-set') account.mustChangePassword = false
    if (kind === 'already-login') account.lastLoginAt = new Date()
    if (kind === 'no-hash') account.passwordHash = null
    await expect(issue()).rejects.toMatchObject({ status: 409 })
  })
  it('sets a hashed password once and returns login identity without session cookies', async () => {
    const value = await issue()
    const response = await activate(request('/api/auth/activate', { token: tokenOf(value.path), password: 'chosen-password-123' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.json()).toEqual({ ok: true, username: 'galih' })
    expect(await verifyPassword('chosen-password-123', account.passwordHash)).toBe(true)
    expect(account.mustChangePassword).toBe(false)
    expect(link?.consumedAt).toBeInstanceOf(Date)
    await expect(consumeAccountActivation(tokenOf(value.path), 'another-password', null)).rejects.toMatchObject({ status: 400 })
    expect(JSON.stringify(mocks.db.auditLog.create.mock.calls)).not.toContain('chosen-password-123')
  })
  it('reissue invalidates old tokens immediately', async () => {
    const first = await issue()
    const second = await issue()
    expect(first.path).not.toBe(second.path)
    await expect(consumeAccountActivation(tokenOf(first.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    await expect(consumeAccountActivation(tokenOf(second.path), 'chosen-password', null)).resolves.toEqual({ username: 'galih' })
  })
  it('rejects expired tokens without changing credentials', async () => {
    const value = await issue()
    link!.expiresAt = new Date(0)
    const hash = account.passwordHash
    await expect(consumeAccountActivation(tokenOf(value.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    expect(account.passwordHash).toBe(hash)
    expect(link!.consumedAt).toBeNull()
  })
  it('reset invalidates activation even if mustChangePassword remains true', async () => {
    const value = await issue()
    account.passwordHash = await hashPassword('admin-reset-password')
    await expect(consumeAccountActivation(tokenOf(value.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    await expect(issue()).rejects.toMatchObject({ status: 409 })
  })
  it('self password change invalidates activation', async () => {
    const value = await issue()
    account.passwordHash = await hashPassword('self-changed-password')
    account.mustChangePassword = false
    await expect(consumeAccountActivation(tokenOf(value.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
  })
  it('disabled accounts cannot consume a valid token', async () => {
    const value = await issue()
    account.isActive = false
    await expect(consumeAccountActivation(tokenOf(value.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
  })
  it.each(['short', ' '.repeat(8), 'x'.repeat(257)])('rejects passwords outside policy', async (password) => {
    const value = await issue()
    await expect(consumeAccountActivation(tokenOf(value.path), password, null)).rejects.toMatchObject({ status: 422 })
    expect(link?.consumedAt).toBeNull()
  })
  it('rolls back token claim if the conditional credential update loses a race', async () => {
    const value = await issue()
    mocks.db.user.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(consumeAccountActivation(tokenOf(value.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    expect(link?.consumedAt).toBeNull()
    expect(account.mustChangePassword).toBe(true)
  })
  it('rejects a lost token claim without updating credentials', async () => {
    const value = await issue()
    mocks.db.accountActivation.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(consumeAccountActivation(tokenOf(value.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    expect(mocks.db.user.updateMany).not.toHaveBeenCalled()
  })
  it('two simulated concurrent consumes yield exactly one success', async () => {
    const value = await issue()
    const results = await Promise.allSettled([consumeAccountActivation(tokenOf(value.path), 'password-one', null), consumeAccountActivation(tokenOf(value.path), 'password-two', null)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(mocks.db.user.updateMany).toHaveBeenCalledTimes(1)
  })
  it('two simulated concurrent reissues leave only the final token usable', async () => {
    const [one, two] = await Promise.all([issue(), issue()])
    await expect(consumeAccountActivation(tokenOf(one.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    await expect(consumeAccountActivation(tokenOf(two.path), 'chosen-password', null)).resolves.toHaveProperty('username')
  })
  it('re-reads the token after locking to reject a reissue while a consume waits', async () => {
    const value = await issue()
    mocks.db.$queryRaw.mockImplementationOnce(async () => { link!.tokenHash = sha('reissued-elsewhere'); return [] })
    await expect(consumeAccountActivation(tokenOf(value.path), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    expect(mocks.db.user.updateMany).not.toHaveBeenCalled()
  })
  it('reports malformed and unknown tokens uniformly', async () => {
    await expect(consumeAccountActivation('bad', 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    await expect(consumeAccountActivation('Z'.repeat(43), 'chosen-password', null)).rejects.toMatchObject({ status: 400 })
    expect((await activate(request('/api/auth/activate', {}))).status).toBe(400)
  })
  it('rate limits issue per target and actor, and consume per IP and digest', async () => {
    for (let i = 0; i < 5; i++) expect(activationIssueLimit(actor.id, account.id)).toBeNull()
    expect(activationIssueLimit(actor.id, account.id)?.status).toBe(429)
    for (let i = 0; i < 20; i++) expect(activationConsumeLimit('test-ip')).toBeNull()
    expect(activationConsumeLimit('test-ip')?.headers.get('retry-after')).toBeTruthy()
    const token = 'Q'.repeat(43)
    resetRate(`activation:token:${sha(token)}`)
    for (let i = 0; i < 10; i++) expect(activationConsumeLimit('other-ip', token)).toBeNull()
    expect(activationConsumeLimit('rotated-ip', token)?.status).toBe(429)
  })
  it('requires issuer authentication and returns issuance only once with no-store', async () => {
    const { NextResponse } = await import('next/server')
    mocks.requireApiUser.mockReset().mockResolvedValueOnce(NextResponse.json({ error: 'Masuk dulu' }, { status: 401 })).mockResolvedValue(actor)
    expect((await reissue(request('/api/companies/users/activation', { userId: account.id }))).status).toBe(401)
    const response = await reissue(request('/api/companies/users/activation', { userId: account.id }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).activation.path).toContain('#token=')
  })
  it('unexpected failures never log raw error data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = activationError(new Error('sensitive-password-and-token'))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('sensitive')
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive')
  })
})

it('approved AKUN_BARU creates a usable one-time handoff through the real approval route (in-memory DB)', async () => {
  const fake = await import('../api/admin-fake-db')
  fake.world()
  fake.seed('accessRequest', [{ id: 'cx18-request', type: 'AKUN_BARU', requestedById: 'u-kadiv-a', entityId: 'pt-a', payload: JSON.stringify({ name: 'Galih Aktivasi', username: 'galih.aktivasi', email: 'galih.activation@example.test', role: 'PIC_PROYEK' }) }])
  mocks.requireApiUser.mockResolvedValue({ id: 'u-admin-a', name: 'Admin PT A', role: 'ADMIN_PT', scopeEntityId: 'pt-a' })
  vi.resetModules()
  vi.doMock('@/lib/db', () => ({ db: fake.db }))
  try {
    const route = await import('@/app/api/access-requests/route')
    const activateRoute = await import('@/app/api/auth/activate/route')
    const response = await route.PATCH(new NextRequest('http://localhost:3200/api/access-requests', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'cx18-request', decision: 'approve' }),
    }))
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.item.status).toBe('DISETUJUI')
    expect(result.item.canActivate).toBe(true)
    expect(result.activation.username).toBe('galih.aktivasi')
    expect(fake.rows('accountActivation')).toHaveLength(1)
    const rawToken = tokenOf(result.activation.path)
    expect(JSON.stringify(fake.store)).not.toContain(rawToken)
    const userId = result.activation.userId
    expect(fake.one('user', userId).mustChangePassword).toBe(true)
    const consumed = await activateRoute.POST(request('/api/auth/activate', { token: rawToken, password: 'new-private-password' }))
    expect(consumed.status).toBe(200)
    expect(consumed.headers.get('set-cookie')).toBeNull()
    expect(fake.one('user', userId).mustChangePassword).toBe(false)
    expect(await verifyPassword('new-private-password', fake.one('user', userId).passwordHash as string)).toBe(true)
    expect(JSON.stringify(fake.store)).not.toContain('new-private-password')
    const replay = await activateRoute.POST(request('/api/auth/activate', { token: rawToken, password: 'different-password' }))
    expect(replay.status).toBe(400)
  } finally {
    vi.doMock('@/lib/db', () => ({ db: mocks.db }))
    vi.resetModules()
  }
})
