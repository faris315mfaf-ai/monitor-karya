import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

/**
 * T2-S2 — audit src/proxy.ts: perlakuan Origin/Sec-Fetch-Site, parsing
 * APP_ORIGINS, bypass subdomain, batas badan di nilai batas, CSP produksi.
 * Tanpa basis data dan tanpa jaringan.
 */

const isPassThrough = (res: Response) => res.headers.get('x-middleware-next') === '1'

function req(path: string, init: { method?: string; headers?: Record<string, string>; host?: string } = {}) {
  return new NextRequest(`http://${init.host ?? 'app.test'}${path}`, {
    method: init.method ?? 'GET',
    headers: { host: init.host ?? 'app.test', ...(init.headers ?? {}) },
  })
}

const post = (path: string, headers: Record<string, string>, host?: string) => proxy(req(path, { method: 'POST', headers, host }))

const originalEnv = { ...process.env }
const originalNodeEnv = process.env.NODE_ENV ?? 'test'
afterEach(() => {
  process.env = { ...originalEnv }
  vi.stubEnv('NODE_ENV', originalNodeEnv)
})

describe('S2 proxy — Origin', () => {
  it('port berbeda pada Origin ditolak (host dengan port harus persis)', () => {
    expect(post('/api/tasks', { origin: 'http://app.test:9999' }).status).toBe(403)
    expect(post('/api/tasks', { origin: 'http://app.test:3200' }, 'app.test:3200').headers.get('x-middleware-next')).toBe('1')
  })

  it('huruf besar/kecil pada Origin dan Host tidak bisa dilompati', () => {
    // URL menormalkan host ke huruf kecil; Host juga dibandingkan lower-case.
    expect(isPassThrough(post('/api/tasks', { origin: 'HTTPS://APP.TEST' }))).toBe(true)
  })

  it('subdomain dan lookalike tidak diizinkan walau APP_ORIGINS terpasang', () => {
    process.env.APP_ORIGINS = 'https://app.test, https://karya.example'
    const rejected = [
      'https://evil.app.test', // subdomain dari domain aplikasi
      'https://app.test.evil.com', // domain aplikasi sebagai subdomain penyerang
      'https://app-test', // tanda hubung
      'https://app.test:8443', // port lain
    ]
    for (const origin of rejected) expect(post('/api/tasks', { origin }).status).toBe(403)
    expect(isPassThrough(post('/api/tasks', { origin: 'https://karya.example' }))).toBe(true)
  })

  it('APP_ORIGINS diparsing toleran: spasi, huruf besar, path, dan port bawaan dinormalkan', () => {
    process.env.APP_ORIGINS = '  https://Karya.Example/lembar , https://alt.example:443/  '
    expect(isPassThrough(post('/api/tasks', { origin: 'https://karya.example' }))).toBe(true)
    expect(isPassThrough(post('/api/tasks', { origin: 'https://alt.example' }))).toBe(true)
    expect(post('/api/tasks', { origin: 'https://karya.example.evil.net' }).status).toBe(403)
  })

  it('Origin null ditolak; tanpa Origin hanya same-origin/none yang lolos', () => {
    expect(post('/api/tasks', { origin: 'null' }).status).toBe(403)
    expect(isPassThrough(post('/api/tasks', { 'sec-fetch-site': 'none' }))).toBe(true)
    expect(isPassThrough(post('/api/tasks', {}))).toBe(true) // klien non-browser
    expect(post('/api/tasks', { 'sec-fetch-site': 'same-site' }).status).toBe(403)
    expect(post('/api/tasks', { 'sec-fetch-site': 'cross-site' }).status).toBe(403)
  })

  it('metode aman (GET/HEAD/OPTIONS) tidak dijaga CSRF; PUT/PATCH/DELETE dijaga', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isPassThrough(proxy(req('/api/audit-logs', { method, headers: { origin: 'https://jahat.test' } })))).toBe(true)
    }
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      expect(proxy(req('/api/tasks', { method, headers: { origin: 'https://jahat.test' } })).status).toBe(403)
    }
  })

  it('mutasi ke path /api persis (tanpa garis miring) ikut dijaga CSRF dan batas badan', () => {
    expect(post('/api', { origin: 'https://jahat.test' }).status).toBe(403)
    expect(post('/api', { 'content-length': String(5 * 1024 * 1024) }).status).toBe(413)
    expect(isPassThrough(post('/api', { origin: 'http://app.test' }))).toBe(true)
  })
})

describe('S2 proxy — batas ukuran badan di nilai batas', () => {
  it('JSON: tepat 1 MB lolos, 1 MB + 1 byte ditolak 413', () => {
    const max = String(1024 * 1024)
    expect(isPassThrough(post('/api/tasks', { 'content-length': max }))).toBe(true)
    expect(post('/api/tasks', { 'content-length': String(1024 * 1024 + 1) }).status).toBe(413)
  })

  it('unggahan: tepat 21 MB lolos, 21 MB + 1 byte ditolak 413', () => {
    const max = String(21 * 1024 * 1024)
    expect(isPassThrough(post('/api/evidence/upload', { 'content-length': max }))).toBe(true)
    expect(post('/api/evidence/upload', { 'content-length': String(21 * 1024 * 1024 + 1) }).status).toBe(413)
  })

  it('content-length rusak ditolak 400; badan chunked tanpa panjang ditolak 411', () => {
    expect(post('/api/tasks', { 'content-length': 'abc' }).status).toBe(400)
    expect(post('/api/tasks', { 'content-length': '-1' }).status).toBe(400)
    expect(post('/api/tasks', { 'transfer-encoding': 'chunked' }).status).toBe(411)
  })
})

describe('S2 proxy — CSP dan /pratinjau', () => {
  it('produksi: /pratinjau 404, CSP ditegakkan (bukan Report-Only) dengan nonce dan frame-ancestors none', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(proxy(req('/pratinjau?peran=TI')).status).toBe(404)
    const res = proxy(req('/'))
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).not.toBe('')
    expect(res.headers.get('content-security-policy-report-only')).toBeNull()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('ws:')
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce).toBeTruthy()
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce)
  })

  it('dev: /pratinjau tetap terbuka dan CSP hanya Report-Only', () => {
    const res = proxy(req('/pratinjau'))
    expect(isPassThrough(res)).toBe(true)
    expect(res.headers.get('content-security-policy-report-only')).toContain('nonce-')
    expect(res.headers.get('content-security-policy')).toBeNull()
  })

  it('nonce tidak berulang antar permintaan (500 kali)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const csp = proxy(req('/')).headers.get('content-security-policy-report-only') ?? ''
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
      expect(nonce).toBeTruthy()
      seen.add(nonce!)
    }
    expect(seen.size).toBe(500)
  })
})
