import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomBytes, scryptSync } from 'node:crypto'

/**
 * [T13] Temuan keamanan M1/M2 + waktu hash tiruan:
 *  - plafon login lintas-IP tidak boleh mengunci pemilik sah (cookie perangkat dikenal);
 *  - sukses tidak menghapus hitungan lintas-IP;
 *  - eviction ember tidak membuang status kunci aktif;
 *  - IP tak terbaca tidak berbagi satu ember;
 *  - verifikasi hash lama berbiaya seragam dengan hash baru.
 */

const mocks = vi.hoisted(() => ({
  db: {
    authSession: { create: vi.fn() },
    accessRequest: { count: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
process.env.AUTH_SECRET = 'tes-rahasia-auth-yang-panjangnya-lebih-dari-32-karakter'

import { POST } from '@/app/api/auth/login/route'
import { DEVICE_COOKIE, createDeviceToken, isKnownDevice } from '@/lib/auth'
import { CURRENT_SCRYPT_N, hashCostN, hashPassword, verifyPassword, verifyPasswordUniformCost } from '@/lib/password'

const db = mocks.db
let seq = 0
let goodHash: string

const login = (body: unknown, ip: string | null = `10.13.0.${++seq}`, cookie?: string) =>
  POST(
    new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...(ip ? { 'x-real-ip': ip } : {}),
        ...(cookie ? { cookie: `${DEVICE_COOKIE}=${encodeURIComponent(cookie)}` } : {}),
      },
    })
  )

const account = (username: string) => ({
  id: `id-${username}`, name: 'Rina', email: `${username}@contoh.test`, username, role: 'ADMIN_PT', isActive: true, passwordHash: goodHash,
})

beforeEach(async () => {
  goodHash ??= await hashPassword('benar-sekali')
  db.authSession.create.mockResolvedValue({})
  db.accessRequest.count.mockResolvedValue(0)
  db.user.findUnique.mockResolvedValue({ isActive: true })
  db.user.update.mockResolvedValue({})
  db.auditLog.create.mockResolvedValue({})
  db.user.findFirst.mockReset()
})

/** Membanjiri kegagalan dari banyak IP berbeda hingga plafon lintas-IP (30) tercapai. */
async function floodFromManyIps(username: string, count = 30) {
  seq += 1
  for (let i = 0; i < count; i++) {
    const res = await login({ identifier: username, password: 'salah' }, `172.20.${seq}.${i + 1}`)
    expect([401, 429]).toContain(res.status)
  }
}

// Tiap percobaan memverifikasi scrypt N=2^16 (±100 ms): 30 kegagalan melewati batas 5 dtk bawaan di mesin sibuk.
describe('plafon login lintas-IP (M1)', { timeout: 30_000 }, () => {
  it('penyerang terdistribusi mendapat 429 SEBELUM kata sandi diperiksa — tanpa sinyal benar/salah', async () => {
    db.user.findFirst.mockResolvedValue(account('plafon-a'))
    await floodFromManyIps('plafon-a')
    // Penyerang yang kebetulan menebak benar dari IP baru tetap ditolak.
    const res = await login({ identifier: 'plafon-a', password: 'benar-sekali' }, '198.51.100.201')
    expect(res.status).toBe(429)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('pemilik sah di perangkat dikenal (cookie HMAC) tetap bisa masuk meski plafon terlampaui', async () => {
    db.user.findFirst.mockResolvedValue(account('plafon-b'))
    // Masuk normal sekali dulu: server memasang cookie perangkat dikenal.
    const first = await login({ identifier: 'plafon-b', password: 'benar-sekali' })
    expect(first.status).toBe(200)
    const setCookie = first.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(DEVICE_COOKIE)
    const device = decodeURIComponent(setCookie.split(`${DEVICE_COOKIE}=`)[1].split(';')[0])

    await floodFromManyIps('plafon-b')
    const owner = await login({ identifier: 'plafon-b', password: 'benar-sekali' }, '198.51.100.202', device)
    expect(owner.status).toBe(200)
    // Tanpa cookie, dari IP yang sama: tetap tertahan.
    expect((await login({ identifier: 'plafon-b', password: 'benar-sekali' }, '198.51.100.203')).status).toBe(429)
  })

  it('cookie perangkat milik akun lain / sandi lama / rusak tidak membebaskan', async () => {
    const { token } = createDeviceToken('id-orang-lain', goodHash)
    expect(isKnownDevice(token, 'id-plafon-c', goodHash)).toBe(false) // akun lain
    const mine = createDeviceToken('id-plafon-c', goodHash).token
    expect(isKnownDevice(mine, 'id-plafon-c', goodHash)).toBe(true)
    expect(isKnownDevice(mine, 'id-plafon-c', 'hash-sandi-baru')).toBe(false) // sandi berganti → dicabut
    expect(isKnownDevice(`${mine.slice(0, -2)}xx`, 'id-plafon-c', goodHash)).toBe(false) // tanda tangan palsu
    expect(isKnownDevice('bukan-token', 'id-plafon-c', goodHash)).toBe(false)
    expect(isKnownDevice(undefined, 'id-plafon-c', goodHash)).toBe(false)
  })

  it('akun yang tidak ada dijawab 429 yang sama saat plafon terlampaui (tidak membocorkan keberadaan akun)', async () => {
    db.user.findFirst.mockResolvedValue(null)
    await floodFromManyIps('hantu-plafon')
    const res = await login({ identifier: 'hantu-plafon', password: 'x' }, '198.51.100.204')
    expect(res.status).toBe(429)
  })

  it('masuk berhasil TIDAK menghapus hitungan lintas-IP (penyerang tak mendapat 30 tebakan baru)', async () => {
    db.user.findFirst.mockResolvedValue(account('plafon-d'))
    const first = await login({ identifier: 'plafon-d', password: 'benar-sekali' })
    const device = decodeURIComponent((first.headers.get('set-cookie') ?? '').split(`${DEVICE_COOKIE}=`)[1].split(';')[0])
    await floodFromManyIps('plafon-d', 29) // 29 kegagalan: tinggal 1 sebelum plafon
    // Pemilik sah masuk (sukses) di tengah serangan...
    expect((await login({ identifier: 'plafon-d', password: 'benar-sekali' }, '198.51.100.205', device)).status).toBe(200)
    // ...lalu satu kegagalan lagi sudah mencapai plafon: hitungan tidak di-reset oleh sukses tadi.
    await login({ identifier: 'plafon-d', password: 'salah' }, '198.51.100.206')
    expect((await login({ identifier: 'plafon-d', password: 'benar-sekali' }, '198.51.100.207')).status).toBe(429)
  })
})

describe('IP klien tak terbaca (L5)', () => {
  it('klien tanpa header IP tidak berbagi satu ember per-IP: >30 percobaan akun berbeda tetap diproses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.user.findFirst.mockResolvedValue(null)
    for (let i = 0; i < 35; i++) {
      expect((await login({ identifier: `anon-${i}`, password: 'x' }, null)).status).toBe(401)
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('IP klien tidak terbaca')).length).toBeLessThanOrEqual(1)
    warn.mockRestore()
  })

  it('batas per-akun tetap berlaku tanpa IP', async () => {
    db.user.findFirst.mockResolvedValue(account('tanpa-ip'))
    for (let i = 0; i < 5; i++) expect((await login({ identifier: 'tanpa-ip', password: 'salah' }, null)).status).toBe(401)
    expect((await login({ identifier: 'tanpa-ip', password: 'benar-sekali' }, null)).status).toBe(429)
  })
})

describe('eviction ember pembatas (M2)', () => {
  it('banjir kunci acak tidak menghapus kunci aktif maupun hitungan kegagalan korban', async () => {
    vi.resetModules()
    const sec = await import('@/lib/security')
    const lockedKey = 'login:acct:1.2.3.4:korban'
    for (let i = 0; i < 5; i++) sec.hit(lockedKey, 5, 3_600_000) // 5 kegagalan: terkunci
    const partialKey = 'login:acct:1.2.3.4:korban-2'
    for (let i = 0; i < 4; i++) sec.hit(partialKey, 5, 3_600_000) // 4 dari 5
    expect(sec.peek(lockedKey, 5).ok).toBe(false)
    // Penyerang menyemprot 25.000 kunci acak (satu kegagalan masing-masing) melewati MAX_BUCKETS.
    for (let i = 0; i < 25_000; i++) sec.hit(`login:acct:9.9.9.9:acak-${i}`, 5, 3_600_000)
    expect(sec.peek(lockedKey, 5).ok).toBe(false) // kunci aktif bertahan
    expect(sec.hit(partialKey, 5, 3_600_000).ok).toBe(true) // hitungan ke-5 masih tercatat...
    expect(sec.peek(partialKey, 5).ok).toBe(false) // ...sehingga kini terkunci (bukan mulai dari nol)
  })

  it('ember kedaluwarsa dibuang lebih dulu', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T03:00:00Z'))
    vi.resetModules()
    const sec = await import('@/lib/security')
    for (let i = 0; i < 20_000; i++) sec.hit(`kdl:${i}`, 1, 1_000)
    vi.setSystemTime(new Date('2026-10-12T03:00:05Z'))
    sec.hit('kunci-baru', 1, 60_000)
    expect(sec.peek('kunci-baru', 1).ok).toBe(false)
    vi.useRealTimers()
  })
})

describe('waktu hash tiruan vs hash lama (M1 regresi)', () => {
  function hashLama(password: string): string {
    const salt = randomBytes(16)
    const key = scryptSync(password.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 })
    return `scrypt$16384$${salt.toString('base64url')}$${key.toString('base64url')}`
  }
  const timed = async (fn: () => Promise<unknown>) => {
    const t = performance.now()
    await fn()
    return performance.now() - t
  }

  it('hashCostN membaca N dari string hash', async () => {
    expect(hashCostN(hashLama('x'))).toBe(16384)
    expect(hashCostN(await hashPassword('x'))).toBe(CURRENT_SCRYPT_N)
    expect(hashCostN(null)).toBeNull()
    expect(hashCostN('bukan-hash')).toBeNull()
  })

  it('hasil verifikasi seragam sama dengan verifikasi biasa (benar dan salah)', async () => {
    const lama = hashLama('sandi-lama-1')
    expect(await verifyPasswordUniformCost('sandi-lama-1', lama)).toBe(true)
    expect(await verifyPasswordUniformCost('salah', lama)).toBe(false)
    expect(await verifyPasswordUniformCost('apa saja', null)).toBe(false)
    expect(await verifyPassword('sandi-lama-1', lama)).toBe(true)
  })

  it('sandi salah pada hash lama memakan waktu sebanding hash baru (bukan ~4x lebih cepat)', async () => {
    const lama = hashLama('sandi-lama-2')
    const baru = await hashPassword('sandi-baru-2')
    await verifyPassword('x', lama) // pemanasan
    const lamaBiasa = Math.min(await timed(() => verifyPassword('salah', lama)), await timed(() => verifyPassword('salah', lama)))
    const lamaSeragam = Math.min(await timed(() => verifyPasswordUniformCost('salah', lama)), await timed(() => verifyPasswordUniformCost('salah', lama)))
    const baruBiasa = Math.min(await timed(() => verifyPasswordUniformCost('salah', baru)), await timed(() => verifyPasswordUniformCost('salah', baru)))
    // Seragam jauh di atas hash lama biasa dan berada dalam rentang hash baru.
    expect(lamaSeragam).toBeGreaterThan(lamaBiasa * 2.2)
    expect(lamaSeragam).toBeGreaterThan(baruBiasa * 0.5)
    expect(lamaSeragam).toBeLessThan(baruBiasa * 2)
  }, 30_000)
})
