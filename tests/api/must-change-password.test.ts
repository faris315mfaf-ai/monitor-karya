import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * F1-C: akun yang wajib ganti kata sandi (User.mustChangePassword) ditahan di
 * semua API kecuali /api/profile/password, /api/auth/logout, /api/auth/me;
 * ganti kata sandi menghapus tandanya; login memberi tahu klien; GET
 * /api/notifications hanya milik akun sendiri. @/lib/db di-mock.
 */

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  const db = {
    authSession: { create: fn(), findFirst: fn() },
    accessRequest: { count: fn() },
    user: { findFirst: fn(), findUnique: fn(), update: fn() },
    auditLog: { create: fn() },
    notificationLog: { findMany: fn(), count: fn() },
    $transaction: fn(),
  }
  return { db, cookieValue: { value: undefined as string | undefined } }
})

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (mocks.cookieValue.value ? { value: mocks.cookieValue.value } : undefined) }),
}))

process.env.AUTH_SECRET = 'tes-rahasia-auth-yang-panjangnya-lebih-dari-32-karakter'

import { createSessionToken, getSessionUser, hashPassword, requireApiUser } from '@/lib/auth'
import { POST as changePassword } from '@/app/api/profile/password/route'
import { GET as listNotifications } from '@/app/api/notifications/route'
import { POST as login } from '@/app/api/auth/login/route'

const db = mocks.db
let hash: string

const row = (over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  name: 'Rina',
  email: 'rina@contoh.test',
  role: 'MANAJEMEN',
  scopeEntityId: null,
  avatarColor: null,
  isActive: true,
  passwordHash: hash,
  mustChangePassword: false,
  ...over,
})

function signIn(over: Record<string, unknown> = {}) {
  const r = row(over)
  mocks.cookieValue.value = createSessionToken('u-1', r.passwordHash as string).token
  db.user.findUnique.mockResolvedValue(r)
}

let ipSeq = 0
const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.9.0.${++ipSeq}` },
  })

beforeEach(async () => {
  db.authSession.create.mockResolvedValue({})
  db.authSession.findFirst.mockResolvedValue({ id: 'session' })
  db.accessRequest.count.mockResolvedValue(0)
  hash ??= await hashPassword('sandi-dari-admin')
  for (const m of [db.user.findFirst, db.user.findUnique, db.user.update, db.auditLog.create, db.notificationLog.findMany, db.notificationLog.count]) {
    m.mockReset()
  }
  db.user.update.mockResolvedValue({})
  db.auditLog.create.mockResolvedValue({})
  db.notificationLog.findMany.mockResolvedValue([])
  db.notificationLog.count.mockResolvedValue(0)
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  mocks.cookieValue.value = undefined
})

describe('requireApiUser + mustChangePassword', () => {
  it('akun biasa lolos', async () => {
    signIn()
    const u = await requireApiUser()
    expect(u).not.toBeInstanceOf(NextResponse)
    expect((u as { mustChangePassword?: boolean }).mustChangePassword).toBe(false)
  })

  it('akun bertanda ditolak 403 "Ganti kata sandi dulu"', async () => {
    signIn({ mustChangePassword: true })
    const res = await requireApiUser()
    expect(res).toBeInstanceOf(NextResponse)
    const r = res as NextResponse
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'Ganti kata sandi dulu', code: 'MUST_CHANGE_PASSWORD' })
  })

  it('rute ganti kata sandi tetap terbuka bagi akun bertanda', async () => {
    signIn({ mustChangePassword: true })
    expect(await requireApiUser({ allowPendingPasswordChange: true })).not.toBeInstanceOf(NextResponse)
  })

  it('kolom belum ada (migrasi 0018 belum diterapkan): sesi tetap terbaca, dianggap false', async () => {
    const r = row()
    mocks.cookieValue.value = createSessionToken('u-1', r.passwordHash).token
    const { mustChangePassword: _drop, ...withoutColumn } = r
    db.user.findUnique
      .mockRejectedValueOnce(Object.assign(new Error('column does not exist'), { code: 'P2022' }))
      .mockResolvedValueOnce(withoutColumn)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const u = await getSessionUser()
    expect(u?.id).toBe('u-1')
    expect(u?.mustChangePassword).toBe(false)
    warn.mockRestore()
  })

  it('API lain (notifikasi) menolak akun bertanda', async () => {
    signIn({ mustChangePassword: true })
    const res = await listNotifications(new NextRequest('http://localhost/api/notifications?inbox=1'))
    expect(res.status).toBe(403)
    expect(db.notificationLog.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/profile/password', () => {
  it('kata sandi baru < 8 karakter ditolak 422', async () => {
    signIn({ mustChangePassword: true })
    const res = await changePassword(post('/api/profile/password', { currentPassword: 'sandi-dari-admin', newPassword: '1234' }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/minimal 8/)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('berhasil: tanda dihapus, dicatat, cookie sesi baru dipasang', async () => {
    signIn({ mustChangePassword: true })
    const res = await changePassword(post('/api/profile/password', { currentPassword: 'sandi-dari-admin', newPassword: 'sandi-milik-sendiri' }))
    expect(res.status).toBe(200)
    const data = db.user.update.mock.calls[0][0].data
    expect(data.mustChangePassword).toBe(false)
    expect(data.passwordHash).toMatch(/^scrypt\$/)
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('CHANGE_OWN_PASSWORD')
    expect(res.headers.get('set-cookie') ?? '').toMatch(/mk_session=/)
  })

  it('akun tanpa tanda tidak menyentuh kolom mustChangePassword', async () => {
    signIn()
    const res = await changePassword(post('/api/profile/password', { currentPassword: 'sandi-dari-admin', newPassword: 'sandi-milik-sendiri' }))
    expect(res.status).toBe(200)
    expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty('mustChangePassword')
  })
})

describe('POST /api/auth/login', () => {
  it('memberi tahu klien bila akun wajib ganti kata sandi', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u-1', name: 'Rina', email: 'r@contoh.test', username: 'rina-wajib', role: 'PIC_PROYEK', isActive: true, passwordHash: hash })
    db.user.findUnique.mockResolvedValue({ mustChangePassword: true, isActive: true })
    const res = await login(post('/api/auth/login', { identifier: 'rina-wajib', password: 'sandi-dari-admin' }))
    expect(res.status).toBe(200)
    expect((await res.json()).mustChangePassword).toBe(true)
  })
})

describe('GET /api/notifications', () => {
  it('peran grup pun hanya melihat notifikasi miliknya sendiri', async () => {
    signIn({ role: 'MANAJEMEN' })
    const res = await listNotifications(new NextRequest('http://localhost/api/notifications?page=1&pageSize=20'))
    expect(res.status).toBe(200)
    expect(db.notificationLog.findMany.mock.calls[0][0].where.userId).toBe('u-1')
    expect(db.notificationLog.count.mock.calls[0][0].where.userId).toBe('u-1')
  })

  it('galat basis data tidak membocorkan pesan mentah', async () => {
    signIn()
    db.notificationLog.findMany.mockRejectedValue(new Error('Invalid `prisma.notificationLog.findMany()` invocation'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await listNotifications(new NextRequest('http://localhost/api/notifications'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/prisma/i)
    err.mockRestore()
  })
})
