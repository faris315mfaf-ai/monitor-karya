import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * /api/auth/login dan token sesi (src/lib/auth.ts) tanpa basis data:
 * @/lib/db di-mock. Memeriksa pembatas laju, jawaban seragam, cookie sesi,
 * dan pencabutan sesi saat kata sandi berganti.
 */

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    db: {
      user: { findFirst: fn(), findUnique: fn(), update: fn() },
      auditLog: { create: fn() },
    },
    cookieValue: { value: undefined as string | undefined },
  }
})

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (mocks.cookieValue.value ? { value: mocks.cookieValue.value } : undefined) }),
}))

process.env.AUTH_SECRET = 'tes-rahasia-auth-yang-panjangnya-lebih-dari-32-karakter'

import { POST } from '@/app/api/auth/login/route'
import { createSessionToken, getSessionUser, hashPassword, readSessionToken } from '@/lib/auth'

const db = mocks.db
let ipSeq = 0

function login(body: unknown, ip = `10.0.0.${++ipSeq}`) {
  return POST(
    new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    })
  )
}

let goodHash: string
beforeEach(async () => {
  goodHash ??= await hashPassword('benar-sekali')
  db.user.findFirst.mockReset()
  db.user.update.mockReset().mockResolvedValue({})
  db.auditLog.create.mockReset().mockResolvedValue({})
})

const account = (over: Record<string, unknown> = {}) => ({
  id: 'u-1', name: 'Rina', email: 'rina@contoh.test', username: 'rina', role: 'PIC_PROYEK', isActive: true, passwordHash: goodHash, ...over,
})

describe('POST /api/auth/login', () => {
  it('berhasil: cookie sesi httpOnly + SameSite=Lax, token membawa sidik kata sandi', async () => {
    db.user.findFirst.mockResolvedValue(account({ username: 'rina-ok' }))
    const res = await login({ identifier: 'rina-ok', password: 'benar-sekali' })
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/mk_session=/)
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='))
    expect(readSessionToken(token)?.pv).toBeTruthy()
  })

  it('akun tidak ada dan kata sandi salah dijawab sama (401), keduanya dicatat LOGIN_FAILED', async () => {
    db.user.findFirst.mockResolvedValue(null)
    const a = await login({ identifier: 'tidak-ada', password: 'apa saja' })
    db.user.findFirst.mockResolvedValue(account({ username: 'rina-salah' }))
    const b = await login({ identifier: 'rina-salah', password: 'salah' })
    expect(a.status).toBe(401)
    expect(b.status).toBe(401)
    expect(await a.json()).toEqual(await b.json())
    expect(db.auditLog.create).toHaveBeenCalledTimes(2)
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('LOGIN_FAILED')
  })

  it('5 kegagalan untuk satu akun → percobaan ke-6 ditolak 429 tanpa menyentuh basis data', async () => {
    db.user.findFirst.mockResolvedValue(account({ username: 'rina-kunci' }))
    for (let i = 0; i < 5; i++) {
      expect((await login({ identifier: 'rina-kunci', password: 'salah' })).status).toBe(401)
    }
    db.user.findFirst.mockClear()
    const res = await login({ identifier: 'rina-kunci', password: 'benar-sekali' })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })

  it('30 percobaan dari satu IP → berikutnya 429', async () => {
    db.user.findFirst.mockResolvedValue(null)
    for (let i = 0; i < 30; i++) {
      expect((await login({ identifier: `orang-${i}`, password: 'x' }, '192.0.2.77')).status).toBe(401)
    }
    expect((await login({ identifier: 'orang-baru', password: 'x' }, '192.0.2.77')).status).toBe(429)
  })

  it('kata sandi raksasa ditolak tanpa hashing', async () => {
    const res = await login({ identifier: 'rina', password: 'x'.repeat(10_000) })
    expect(res.status).toBe(401)
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })

  it('akun nonaktif dengan sandi benar: 403', async () => {
    db.user.findFirst.mockResolvedValue(account({ username: 'rina-off', isActive: false }))
    expect((await login({ identifier: 'rina-off', password: 'benar-sekali' })).status).toBe(403)
  })
})

describe('sesi', () => {
  const row = (passwordHash: string | null) => ({
    id: 'u-1', name: 'Rina', email: 'r@contoh.test', role: 'PIC_PROYEK', scopeEntityId: 'pt-a', avatarColor: null, isActive: true, passwordHash,
  })

  it('token berlaku selama kata sandi sama; tidak membocorkan hash', async () => {
    mocks.cookieValue.value = createSessionToken('u-1', 'hash-lama').token
    db.user.findUnique.mockResolvedValue(row('hash-lama'))
    const user = await getSessionUser()
    expect(user?.id).toBe('u-1')
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('kata sandi berganti → sesi lama dicabut', async () => {
    mocks.cookieValue.value = createSessionToken('u-1', 'hash-lama').token
    db.user.findUnique.mockResolvedValue(row('hash-baru'))
    expect(await getSessionUser()).toBeNull()
  })

  it('token lama tanpa sidik, tanda tangan palsu, atau kedaluwarsa ditolak', () => {
    const { token } = createSessionToken('u-1', 'h')
    const [body, sig] = token.split('.')
    const legacy = Buffer.from(JSON.stringify({ sub: 'u-1', iat: 1, exp: 9_999_999_999 })).toString('base64url')
    expect(readSessionToken(`${legacy}.${sig}`)).toBeNull()
    expect(readSessionToken(`${body}.${sig.slice(0, -2)}xx`)).toBeNull()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 9 * 3600_000)
    expect(readSessionToken(token)).toBeNull()
    vi.useRealTimers()
  })
})
