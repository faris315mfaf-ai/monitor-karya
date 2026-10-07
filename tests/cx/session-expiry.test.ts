import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', async () => ({ db: (await import('../api/admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('../api/admin-fake-db')
  return { cookies: async () => ({ get: () => cookie.value ? { value: cookie.value } : undefined }) }
})

import { AUTH_SECRET_FOR_TESTS, cookie, one, seed, store, world, rows } from '../api/admin-fake-db'
import { createSessionToken } from '../api/test-session'
import { createSessionToken as unregisteredToken, getSessionUser, readSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { POST as logout } from '@/app/api/auth/logout/route'
import { PATCH as decideAccess } from '@/app/api/access-requests/route'
import { ensureTemporaryAccessCurrent } from '@/lib/access-requests'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { POST as changePassword } from '@/app/api/profile/password/route'

const now = new Date('2026-10-07T03:00:00Z')
process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); world() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function signIn(id = 'u-pic-a') {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
  return cookie.value
}
function request(token: string) {
  return new NextRequest('http://localhost/api/auth/logout', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${token}` } })
}
function expired(over: Record<string, unknown> = {}) {
  seed('accessRequest', [{ id: 'expired-access', targetUserId: 'u-pic-a', type: 'AKSES_SEMENTARA', status: 'DISETUJUI',
    expiresAt: now, appliedData: JSON.stringify({ role: 'PIC_PROYEK', isActive: true, grantedRole: 'KEPALA_DIVISI' }), ...over }])
  one('user', 'u-pic-a').role = 'KEPALA_DIVISI'
}

describe('sesi server dan tenggat akses', () => {
  it('insert sesi pengganti gagal membatalkan perubahan sandi dan audit', async () => {
    const oldHash = await hashPassword('sandi-lama-uji')
    one('user', 'u-pic-a').passwordHash = oldHash
    signIn()
    vi.spyOn(db.authSession, 'create').mockRejectedValueOnce(new Error('private session store error'))
    const response = await changePassword(new NextRequest('http://localhost/api/profile/password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'sandi-lama-uji', newPassword: 'sandi-baru-uji' }),
    }))
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(one('user', 'u-pic-a').passwordHash).toBe(oldHash)
    expect(rows('auditLog', { action: 'CHANGE_OWN_PASSWORD' })).toHaveLength(0)
    expect((await getSessionUser())?.id).toBe('u-pic-a')
  })
  it('dua akses sementara bertumpuk ditolak tanpa menerapkan peran kedua', async () => {
    signIn('u-super')
    for (const id of ['grant-1', 'grant-2']) seed('accessRequest', [{ id, entityId: 'pt-a', requestedById: 'u-pic-a2',
      targetUserId: 'u-pic-a', type: 'AKSES_SEMENTARA', payload: JSON.stringify({ userId: 'u-pic-a', role: 'KEPALA_DIVISI', days: 1 }) }])
    const decide = (id: string) => decideAccess(new NextRequest('http://localhost/api/access-requests', {
      method: 'PATCH', body: JSON.stringify({ id, decision: 'approve' }), headers: { 'content-type': 'application/json' },
    }))
    expect((await decide('grant-1')).status).toBe(200)
    expect((await decide('grant-2')).status).toBe(409)
    expect(one('accessRequest', 'grant-2').status).toBe('DIAJUKAN')
    expect(one('user', 'u-pic-a').role).toBe('KEPALA_DIVISI')
  })
  it('token bertanda tangan tanpa baris sesi ditolak', async () => {
    cookie.value = unregisteredToken('u-pic-a', one('user', 'u-pic-a').passwordHash as string).token
    expect(await getSessionUser()).toBeNull()
  })
  it('logout mencabut salinan token yang sama, sesi perangkat lain tetap berlaku', async () => {
    const first = signIn()
    const second = signIn()
    expect(first).not.toBe(second)
    const res = await logout(request(first))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    cookie.value = first
    expect(await getSessionUser()).toBeNull()
    cookie.value = second
    expect((await getSessionUser())?.id).toBe('u-pic-a')
  })
  it('audit gagal tetap mencabut sesi dan membersihkan cookie', async () => {
    const token = signIn()
    vi.spyOn(db.auditLog, 'create').mockRejectedValueOnce(new Error('audit unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await logout(request(token))).status).toBe(200)
    expect(await getSessionUser()).toBeNull()
  })
  it('pencabutan gagal membersihkan cookie tetapi tidak mengaku sukses', async () => {
    const token = signIn()
    vi.spyOn(db.authSession, 'updateMany').mockRejectedValueOnce(new Error('private database error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await logout(request(token))
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(JSON.stringify(await res.json())).not.toContain('private database error')
  })
  it('baris sesi kedaluwarsa/akun nonaktif/sandi berubah semuanya ditolak', async () => {
    const token = signIn()
    const sid = readSessionToken(token)!.sid
    one('authSession', sid).expiresAt = now
    expect(await getSessionUser()).toBeNull()
    one('authSession', sid).expiresAt = new Date(now.getTime() + 10000)
    one('user', 'u-pic-a').isActive = false
    expect(await getSessionUser()).toBeNull()
    one('user', 'u-pic-a').isActive = true
    one('user', 'u-pic-a').passwordHash = 'changed'
    expect(await getSessionUser()).toBeNull()
  })
  it('tenggat akses tepat sekarang dipulihkan saat request tanpa cron', async () => {
    expired(); signIn()
    expect((await getSessionUser())?.role).toBe('PIC_PROYEK')
    expect(one('accessRequest', 'expired-access').revertedAt).toEqual(now)
    expect(rows('auditLog', { action: 'TEMP_ACCESS_EXPIRED' })).toHaveLength(1)
    await getSessionUser()
    expect(rows('auditLog', { action: 'TEMP_ACCESS_EXPIRED' })).toHaveLength(1)
  })
  it('sebelum tenggat peran sementara masih sah', async () => {
    expired({ expiresAt: new Date(now.getTime() + 1) }); signIn()
    expect((await getSessionUser())?.role).toBe('KEPALA_DIVISI')
  })
  it('akun yang diaktifkan sementara kembali nonaktif saat tenggat', async () => {
    expired({ appliedData: JSON.stringify({ role: 'PIC_PROYEK', isActive: false }) }); signIn()
    expect(await getSessionUser()).toBeNull()
    expect(one('user', 'u-pic-a').isActive).toBe(false)
  })
  it('pemulihan gagal menolak akses dan transaksi rollback', async () => {
    expired(); signIn()
    vi.spyOn(db.auditLog, 'create').mockRejectedValue(new Error('audit unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getSessionUser()).toBeNull()
    expect(one('accessRequest', 'expired-access').revertedAt).toBeNull()
    expect(one('user', 'u-pic-a').role).toBe('KEPALA_DIVISI')
  })
  it('tidak mencabut akun lain ketika pengguna biasa masuk', async () => {
    expired(); signIn('u-admin-a')
    await ensureTemporaryAccessCurrent('u-admin-a')
    expect(one('accessRequest', 'expired-access').revertedAt).toBeNull()
    expect(store.authSession).toHaveLength(1)
  })
})
