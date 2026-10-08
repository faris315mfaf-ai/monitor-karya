import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

/**
 * T2-S2 — audit sesi/token (src/lib/auth.ts + route auth). Token HMAC + sidik
 * kata sandi (pv) + baris AuthSession; tanpa basis data nyata (admin-fake-db).
 */

vi.mock('@/lib/db', async () => ({ db: (await import('../api/admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('../api/admin-fake-db')
  return { cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }) }
})

import { AUTH_SECRET_FOR_TESTS, cookie, one, rows, world } from '../api/admin-fake-db'
import { createSessionToken } from '../api/test-session'
import {
  clearSessionCookie,
  createSessionToken as mint,
  getSessionUser,
  readSessionToken,
  SESSION_COOKIE,
  setSessionCookie,
} from '@/lib/auth'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { POST as logout } from '@/app/api/auth/logout/route'
import { POST as changePassword } from '@/app/api/profile/password/route'

const now = new Date('2026-10-08T03:00:00Z')
const originalNodeEnv = process.env.NODE_ENV ?? 'test'
process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  world()
  cookie.value = undefined
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.stubEnv('NODE_ENV', originalNodeEnv)
})

/** Tanda tangan HMAC token sesi (skema sama dengan auth.ts, kunci uji). */
const signBody = (body: string, secret = AUTH_SECRET_FOR_TESTS) =>
  createHmac('sha256', secret).update(body).digest('base64url')

/** Menyusun token sah dengan payload sembarang (untuk menguji validasi isi). */
function forge(payload: Record<string, unknown>, secret = AUTH_SECRET_FOR_TESTS): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signBody(body, secret)}`
}

const signIn = (id = 'u-pic-a', passwordHash = one('user', id).passwordHash as string) => {
  cookie.value = createSessionToken(id, passwordHash).token
  return cookie.value
}

describe('S2 sesi — bentuk token yang ditolak tanpa menyentuh DB', () => {
  it('token rusak/dipalsukan ditolak dan tidak memicu lookup AuthSession', async () => {
    const spy = vi.spyOn(db.authSession, 'findFirst')
    const valid = mint('u-pic-a', 'hash-apapun').token
    const [body, sig] = valid.split('.')
    const bad = [
      '',
      undefined as unknown as string,
      'abc',
      `${body}.`,
      `.${sig}`,
      `${body}.${sig}.ekstra`,
      `${body}.${sig.slice(0, -1)}`, // tanda tangan dipendekkan
      `${body.slice(0, -1)}x.${sig}`, // isi dipindahi tanpa tanda tangan ulang
      'x'.repeat(2049) + '.' + sig,
      forge({ sub: 'u-pic-a', exp: Math.floor(Date.now() / 1000) + 60 }), // tanpa pv/sid
    ]
    for (const token of bad) expect(readSessionToken(token)).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('token lama tanpa pv atau tanpa sid wajib masuk ulang', () => {
    const later = Math.floor(Date.now() / 1000) + 3600
    expect(readSessionToken(forge({ sub: 'u-pic-a', iat: 1, exp: later, sid: 's-1' }))).toBeNull()
    expect(readSessionToken(forge({ sub: 'u-pic-a', iat: 1, exp: later, pv: 'pv' }))).toBeNull()
  })

  it('exp kedaluwarsa ditolak sebelum lookup basis data', async () => {
    const past = Math.floor(Date.now() / 1000) - 1
    const spy = vi.spyOn(db.authSession, 'findFirst')
    expect(readSessionToken(forge({ sub: 'u-pic-a', iat: past - 10, exp: past, pv: 'pv', sid: 's-1' }))).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('rotasi AUTH_SECRET mematikan semua token lama', () => {
    const token = mint('u-pic-a', 'hash').token
    const [body] = token.split('.')
    const resigned = `${body}.${signBody(body, 'kunci-baru-setelah-rotasi-minimal-32-karakter!!')}`
    expect(readSessionToken(resigned)).toBeNull()
  })
})

describe('S2 sesi — logout, replay, dan ganti sandi', () => {
  const request = (token: string) =>
    new NextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })

  it('logout idempoten: replay token yang sudah dicabut tetap 200 dan tidak hidupkan kembali', async () => {
    const token = signIn()
    expect((await logout(request(token))).status).toBe(200)
    const replay = await logout(request(token))
    expect(replay.status).toBe(200)
    cookie.value = token
    expect(await getSessionUser()).toBeNull()
  })

  it('ganti sandi sukses: perangkat lain mati lewat pv, cookie baru langsung hidup', async () => {
    const oldHash = await hashPassword('sandi-lama-uji')
    one('user', 'u-pic-a').passwordHash = oldHash
    signIn('u-pic-a', oldHash) // perangkat pelaku (cookie aktif)
    const otherDevice = createSessionToken('u-pic-a', oldHash).token // sesi perangkat kedua

    const res = await changePassword(
      new NextRequest('http://localhost/api/profile/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'sandi-lama-uji', newPassword: 'sandi-baru-uji' }),
      })
    )
    expect(res.status).toBe(200)

    // Perangkat lain: baris AuthSession masih ada, tetapi pv tidak cocok lagi.
    cookie.value = otherDevice
    expect(await getSessionUser()).toBeNull()

    // Cookie pengganti dari transaksi berlaku.
    const setCookie = res.headers.get('set-cookie')!
    const token = /mk_session=([^;]+)/.exec(setCookie)![1]
    cookie.value = token
    expect((await getSessionUser())?.id).toBe('u-pic-a')
    expect(rows('auditLog', { action: 'CHANGE_OWN_PASSWORD' })).toHaveLength(1)
  })
})

describe('S2 sesi — kontrak cookie', () => {
  it('dev: nama mk_session, HttpOnly, SameSite=Lax, Path=/, tanpa Secure dan tanpa Domain', async () => {
    const res = new NextResponse(null)
    await setSessionCookie(res, 'u-pic-a', 'hash', { authSession: { create: async () => ({}) } } as never)
    const sc = res.headers.get('set-cookie')!
    expect(sc).toContain('mk_session=')
    expect(sc.toLowerCase()).toContain('httponly')
    expect(sc.toLowerCase()).toContain('samesite=lax')
    expect(sc).toContain('Path=/')
    expect(sc).not.toContain('Secure')
    expect(sc).not.toContain('Domain=')
    const cleared = new NextResponse(null)
    clearSessionCookie(cleared)
    expect(cleared.headers.get('set-cookie')).toContain('mk_session=;')
  })

  it('produksi: awalan __Host- dengan Secure, Path=/, tanpa Domain', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      vi.resetModules()
      const prodAuth = await import('@/lib/auth')
      const res = new NextResponse(null)
      await prodAuth.setSessionCookie(res, 'u-pic-a', 'hash', {
        authSession: { create: async () => ({}) },
      } as never)
      const sc = res.headers.get('set-cookie')!
      expect(sc).toContain('__Host-mk_session=')
      expect(sc).toContain('Secure')
      expect(sc.toLowerCase()).toContain('httponly')
      expect(sc.toLowerCase()).toContain('samesite=lax')
      expect(sc).toContain('Path=/')
      expect(sc).not.toContain('Domain=')
    } finally {
      vi.resetModules()
    }
  })
})
