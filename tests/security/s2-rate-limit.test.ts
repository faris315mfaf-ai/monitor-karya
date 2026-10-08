import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { clientIp, hit, peek, resetRate } from '@/lib/security'

/**
 * T2-S2 — audit pembatas laju (src/lib/security.ts) dan kunci IP-nya pada
 * route login. Dokumentasi karakteristik kunci x-forwarded-for: nilai PERTAMA
 * dipakai, sehingga di balik proxy yang menambah (append) nilai klien — bukan
 * menimpa — batas per-IP bisa diputar dengan header palsu (lihat laporan
 * T2-S2-S1). Tanpa basis data nyata; @/lib/db di-mock.
 */

const mocks = vi.hoisted(() => ({
  db: {
    user: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/lib/db', () => ({ db: mocks.db }))

import { POST as login } from '@/app/api/auth/login/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.user.findFirst.mockResolvedValue(null) // akun tidak ada → 401 + hash tiruan
  mocks.db.auditLog.create.mockResolvedValue({})
})
afterEach(() => {
  vi.restoreAllMocks()
})

const attempt = (identifier: string, xff?: string) =>
  login(
    new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(xff ? { 'x-forwarded-for': xff } : {}),
      },
      body: JSON.stringify({ identifier, password: `tebak-salah-${Math.random()}` }),
    })
  )

describe('S2 clientIp — kontrak dan permukaan spoof', () => {
  it('x-real-ip diutamakan; tanpa itu entri TERAKHIR x-forwarded-for yang dipakai (tambalan T2-S2-S1)', () => {
    const h = (v: Record<string, string>) => ({ headers: new Headers(v) }) as unknown as Request
    expect(clientIp(h({ 'x-real-ip': '7.7.7.7', 'x-forwarded-for': '1.1.1.1, 7.7.7.7' }))).toBe('7.7.7.7')
    // Caddy menambahkan alamat klien di belakang XFF yang sudah ada; prefiks
    // milik klien tidak boleh lagi menentukan kunci pembatas.
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9, 7.7.7.8' }))).toBe('7.7.7.8')
    expect(clientIp(h({ 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8 , 2001:db8::1 ' }))).toBe('2001:db8::1')
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9' }))).toBe('9.9.9.9')
    expect(clientIp(h({}))).toBeNull()
    expect(clientIp(h({ 'x-forwarded-for': ', ,' }))).toBeNull()
  })

  it('prefiks XFF palsu tidak bisa memutasi ember: dua klien berbeda hasil Caddy tetap kunci berbeda', () => {
    const h = (xff: string) => ({ headers: new Headers({ 'x-forwarded-for': xff }) }) as unknown as Request
    // Penyerang menyemprot prefiks acak; korban dan penyerang sama-sama diakhiri
    // alamat riil mereka sendiri oleh proxy → ember per-IP tetap utuh.
    expect(clientIp(h('spoof-1, 203.0.113.9'))).toBe('203.0.113.9')
    expect(clientIp(h('spoof-2, 198.51.100.7'))).toBe('198.51.100.7')
    // Penyerang mengulang dengan prefiks baru untuk IP yang sama: kunci tidak berubah.
    expect(clientIp(h('spoof-3, 203.0.113.9'))).toBe('203.0.113.9')
  })

  it('nilai lebih dari 64 karakter dipangkas (kunci laju tetap terbatas)', () => {
    const h = { headers: new Headers({ 'x-real-ip': 'x'.repeat(100) }) } as unknown as Request
    expect(clientIp(h)?.length).toBe(64)
  })
})

describe('S2 hit — jendela tetap dan pembatas memori', () => {
  it('blokir pada batas, Retry-After tidak melebihi jendela, kunci terpisah antar akun', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'))
    const a = `s2:a:${Math.random()}`
    const b = `s2:b:${Math.random()}`
    for (let i = 0; i < 3; i++) expect(hit(a, 3, 60_000).ok).toBe(true)
    const blocked = hit(a, 3, 60_000)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeLessThanOrEqual(60)
    expect(hit(b, 3, 60_000).ok).toBe(true) // kunci lain tidak terpengaruh
    resetRate(a)
    expect(hit(a, 3, 60_000).ok).toBe(true)
    vi.useRealTimers()
  })

  it('banjir kunci unik tidak merusak pembatas: kunci baru tetap dihitung (prune)', () => {
    for (let i = 0; i < 20_100; i++) hit(`s2:flood:${i}`, 1, 3_600_000)
    const fresh = `s2:fresh:${Math.random()}`
    expect(hit(fresh, 2, 60_000).ok).toBe(true)
    expect(hit(fresh, 2, 60_000).ok).toBe(true)
    expect(hit(fresh, 2, 60_000).ok).toBe(false)
  })

  it('banjir kunci dapat menggeser bucket tertua: blokir bisa terhapus (batas rem memori)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'))
    // Modul segar supaya peta bucket mulai kosong dan urutan penyisipan pasti.
    vi.resetModules()
    const fresh = await import('@/lib/security')
    const victim = 's2:victim-korban'
    fresh.hit(victim, 1, 3_600_000)
    expect(fresh.peek(victim, 1).ok).toBe(false)
    // Melebihi MAX_BUCKETS memaksa pembuangan 1000 bucket tertua — korban
    // adalah kunci pertama. Sifat rem memori, bukan kuota global.
    for (let i = 0; i < 20_100; i++) fresh.hit(`s2:flood2:${i}`, 1, 3_600_000)
    expect(fresh.peek(victim, 1).ok).toBe(true)
    vi.useRealTimers()
  })
})

describe('S2 login — batas per-IP dan permukaan spoof XFF', () => {
  it('IP sama 30 percobaan lalu ditolak 429 meski identifier unik', async () => {
    const ip = '10.20.30.40'
    for (let i = 0; i < 30; i++) {
      expect((await attempt(`korban-${i}@example.test`, ip)).status).toBe(401)
    }
    const blocked = await attempt(`korban-30@example.test`, ip)
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBeTruthy()
  }, 30_000)

  it('TAMBALAN T2-S2-S1: rotasi prefiks XFF tidak lagi memutasi batas 30/IP (spraying ditolak 429)', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 35; i++) {
      // Proxy penambah (mis. Caddy default) menyisipkan IP klien di BELAKANG;
      // sejak tambalan kanan-XFF, kunci pembatas memakai entri terakhir sehingga
      // prefiks milik penyerang tidak menghasilkan "IP baru" per permintaan.
      const res = await attempt(`semprot-${i}@example.test`, `198.51.100.${i % 256}, 203.0.113.9`)
      statuses.push(res.status)
    }
    expect(statuses).toContain(429)
    expect(statuses.filter((s) => s === 401)).toHaveLength(30)
  }, 60_000)
})
