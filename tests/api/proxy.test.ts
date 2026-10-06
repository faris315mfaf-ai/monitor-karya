import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

/** src/proxy.ts: CSRF untuk mutasi API, batas ukuran, dan CSP bernonce untuk halaman. */

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://app.test${path}`, {
    method: init.method ?? 'GET',
    headers: { host: 'app.test', ...(init.headers ?? {}) },
  })
}

const isPassThrough = (res: Response) => res.headers.get('x-middleware-next') === '1'

describe('proxy — API', () => {
  it('GET lintas situs tetap lewat (tidak mengubah apa pun)', () => {
    expect(isPassThrough(proxy(req('/api/dashboard', { headers: { origin: 'https://jahat.test' } })))).toBe(true)
  })

  it('POST dari origin sendiri lewat; dari origin lain / null / Sec-Fetch-Site cross-site ditolak 403', async () => {
    expect(isPassThrough(proxy(req('/api/tasks', { method: 'POST', headers: { origin: 'http://app.test' } })))).toBe(true)
    const cases: Record<string, string>[] = [{ origin: 'https://jahat.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]
    for (const headers of cases) {
      const res = proxy(req('/api/tasks', { method: 'POST', headers }))
      expect(res.status).toBe(403)
    }
  })

  it('X-Forwarded-Host dari proxy tepercaya ikut dianggap origin sendiri', () => {
    const res = proxy(req('/api/tasks', { method: 'PATCH', headers: { origin: 'https://karya.example', 'x-forwarded-host': 'karya.example' } }))
    expect(isPassThrough(res)).toBe(true)
  })

  it('klien non-browser tanpa Origin/Sec-Fetch-Site dibiarkan ke pemeriksaan sesi', () => {
    expect(isPassThrough(proxy(req('/api/tasks', { method: 'DELETE' })))).toBe(true)
  })

  it('badan JSON > 1 MB ditolak 413; unggah bukti boleh sampai 21 MB', () => {
    const big = String(2 * 1024 * 1024)
    expect(proxy(req('/api/tasks', { method: 'POST', headers: { 'content-length': big } })).status).toBe(413)
    expect(isPassThrough(proxy(req('/api/evidence/upload', { method: 'POST', headers: { 'content-length': big } })))).toBe(true)
    expect(proxy(req('/api/evidence/upload', { method: 'POST', headers: { 'content-length': String(30 * 1024 * 1024) } })).status).toBe(413)
  })
})

describe('proxy — halaman', () => {
  it('setiap halaman mendapat CSP bernonce baru (Report-Only di luar produksi)', () => {
    const a = proxy(req('/'))
    const b = proxy(req('/'))
    const csp = a.headers.get('content-security-policy-report-only') ?? a.headers.get('content-security-policy') ?? ''
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce).toBeTruthy()
    const csp2 = b.headers.get('content-security-policy-report-only') ?? b.headers.get('content-security-policy') ?? ''
    expect(csp2).not.toContain(nonce!)
    // Nonce diteruskan ke render lewat header permintaan.
    expect(a.headers.get('x-middleware-request-x-nonce')).toBe(nonce)
  })
})
