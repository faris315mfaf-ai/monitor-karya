import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), access: vi.fn(), evidenceCreate: vi.fn(), auditCreate: vi.fn(), sync: vi.fn(), createClient: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireApiUser: mocks.user }))
vi.mock('@/lib/evidence-access', () => ({ canWriteEvidence: mocks.access }))
vi.mock('@/lib/db', () => ({ db: { evidence: { create: mocks.evidenceCreate }, auditLog: { create: mocks.auditCreate } } }))
vi.mock('@/lib/daily-rollup', () => ({ syncEvidenceCount: mocks.sync }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/api-error', () => ({ serverError: vi.fn() }))
vi.mock('@/lib/security', () => ({
  cleanText: (value: unknown) => typeof value === 'string' ? value : '',
  contentMatchesMime: vi.fn(), safeDisplayName: vi.fn(), clientIp: vi.fn(),
}))

import { buildCsp } from '@/lib/security-headers'
import { signedEvidenceUrl, storageConfigured } from '@/lib/storage'
import { POST } from '@/app/api/evidence/upload/route'

const storageDirectives = ['img-src', 'connect-src', 'media-src']
function sources(csp: string, directive: string) {
  return csp.split('; ').find(part => part.startsWith(`${directive} `))!.split(' ').slice(1)
}
function expectOrigin(origin: string | null) {
  const csp = buildCsp('fixed-test-nonce', { dev: false })
  for (const directive of storageDirectives) {
    const external = sources(csp, directive).filter(value => /^https?:/.test(value))
    expect(external).toEqual(origin ? [origin] : [])
  }
  expect(csp).not.toContain('*')
  expect(csp).not.toContain('offline-secret')
  expect(csp).not.toContain('offline-access-key')
  return csp
}
function s3Env() {
  vi.stubEnv('STORAGE_DRIVER', 's3')
  vi.stubEnv('S3_BUCKET', 'evidence')
  vi.stubEnv('S3_ACCESS_KEY_ID', 'offline-access-key')
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'offline-secret')
}
function request(): NextRequest {
  const body = new FormData()
  body.set('targetType', 'TASK')
  body.set('targetId', 'offline-task')
  body.set('file', new File(['offline'], 'test.txt', { type: 'text/plain' }))
  return new NextRequest('http://localhost/api/evidence/upload', { method: 'POST', body })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of ['STORAGE_DRIVER', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_FORCE_PATH_STYLE']) vi.stubEnv(key, undefined)
  mocks.user.mockResolvedValue({ id: 'offline-user', role: 'PIC_PROYEK' })
  mocks.access.mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live calls forbidden in tests') }))
})
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled()
  expect(mocks.createClient).not.toHaveBeenCalled()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('CSP storage origins', () => {
  it('keeps the default Supabase origin and security directives', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co/storage/v1/')
    vi.stubEnv('S3_ENDPOINT', 'https://unused.example')
    const csp = expectOrigin('https://example.supabase.co')
    expect(sources(csp, 'script-src')).toEqual(["'self'", "'nonce-fixed-test-nonce'", "'strict-dynamic'"])
    expect(sources(csp, 'frame-src')).toEqual(["'none'"])
    expect(sources(csp, 'object-src')).toEqual(["'none'"])
    expect(csp).toContain('upgrade-insecure-requests')
  })
  it('allows an explicit Supabase driver and adds no origin when unset', () => {
    vi.stubEnv('STORAGE_DRIVER', 'supabase')
    expectOrigin(null)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    expectOrigin('https://example.supabase.co')
  })
  it.each([
    ['http://127.0.0.1:9000', 'true', undefined, 'http://127.0.0.1:9000'],
    ['https://minio.example:9443', 'true', 'ap-southeast-1', 'https://minio.example:9443'],
    ['http://[::1]:9000', 'true', undefined, 'http://[::1]:9000'],
    ['https://objects.example', 'false', undefined, 'https://evidence.objects.example'],
    [undefined, undefined, undefined, 'https://evidence.s3.us-east-1.amazonaws.com'],
    [undefined, undefined, 'ap-southeast-1', 'https://evidence.s3.ap-southeast-1.amazonaws.com'],
  ])('matches the signer origin for endpoint=%s pathStyle=%s region=%s', async (endpoint, style, region, origin) => {
    s3Env()
    vi.stubEnv('S3_ENDPOINT', endpoint)
    vi.stubEnv('S3_FORCE_PATH_STYLE', style)
    vi.stubEnv('S3_REGION', region)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://unused.supabase.co')
    expect(storageConfigured()).toBe(true)
    const signed = new URL(await signedEvidenceUrl('TASK/old-key/file.pdf'))
    expect(signed.origin).toBe(origin)
    expectOrigin(signed.origin)
  })
  it.each([
    'https://*.example', 'https://example;img-src.example', "https://example'unsafe-inline'.example",
    'https://user:password@example.com', 'javascript:alert(1)', 'data:text/html,example',
    'ftp://example.com', '//example.com', 'https://example.com\r\n', 'https://exa\tmple.com',
    'https://example.com/path', 'https://example.com?foo=bar', 'https://example.com/#fragment', 'not a URL',
  ])('rejects unsafe or non-origin S3 endpoint %s', endpoint => {
    s3Env()
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'true')
    vi.stubEnv('S3_ENDPOINT', endpoint)
    expectOrigin(null)
  })
  it.each([
    'https://*.example', 'https://example;script-src.example', 'https://user:password@example.com',
    'javascript:alert(1)', 'data:text/html,example', 'ftp://example.com', 'https://exa\nmple.com', 'bad-url',
  ])('fails closed for unsafe Supabase URL %s', value => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', value)
    expectOrigin(null)
  })
  it.each([
    ['S3_BUCKET', undefined], ['S3_ACCESS_KEY_ID', undefined], ['S3_SECRET_ACCESS_KEY', undefined],
    ['S3_BUCKET', '*.example'], ['S3_BUCKET', '../bucket'], ['S3_BUCKET', 'bucket..name'],
    ['S3_REGION', 'us-east-1; script-src *'], ['S3_FORCE_PATH_STYLE', 'yes'],
    ['S3_ACCESS_KEY_ID', 'key/injected'],
  ])('does not allow a storage origin for invalid %s', (key, value) => {
    s3Env()
    vi.stubEnv(key, value)
    expect(storageConfigured()).toBe(false)
    expectOrigin(null)
  })
  it('rejects IP endpoints using virtual host style in both CSP and storage', () => {
    s3Env()
    vi.stubEnv('S3_ENDPOINT', 'http://127.0.0.1:9000')
    expect(storageConfigured()).toBe(false)
    expectOrigin(null)
  })
  it.each(['', 'minio', 'SUPABASE', 's3; script-src *'])('fails closed for unknown driver %s', driver => {
    s3Env()
    vi.stubEnv('STORAGE_DRIVER', driver)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    expect(storageConfigured()).toBe(false)
    expectOrigin(null)
  })
  it('retains dev HMR allowances without allowing storage scripts or frames', () => {
    s3Env()
    const csp = buildCsp('fixed-test-nonce', { dev: true })
    expect(sources(csp, 'connect-src')).toEqual(["'self'", 'https://evidence.s3.us-east-1.amazonaws.com', 'ws:', 'wss:'])
    expect(sources(csp, 'script-src')).toContain("'unsafe-eval'")
    expect(sources(csp, 'script-src').join(' ')).not.toContain('amazonaws')
    expect(sources(csp, 'frame-src')).toEqual(["'none'"])
  })
  it('keeps the header module free of Node and server-only imports', () => {
    const source = readFileSync(new URL('../../src/lib/security-headers.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/^import\s/m)
  })
})

describe('upload configuration errors', () => {
  it.each([undefined, 'supabase', 's3', 's3; dangerous'])('returns a driver-aware 503 for %s without echoing env values', async driver => {
    vi.stubEnv('STORAGE_DRIVER', driver)
    const response = await POST(request())
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.needsConfig).toBe(true)
    if (driver === 's3') {
      expect(body.error).toContain('konfigurasi S3')
      expect(body.error).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    } else if (driver === undefined || driver === 'supabase') {
      expect(body.error).toContain('SUPABASE_SERVICE_ROLE_KEY')
    } else {
      expect(body.error).toContain('STORAGE_DRIVER')
      expect(body.error).not.toContain(driver)
    }
    expect(mocks.evidenceCreate).not.toHaveBeenCalled()
    expect(mocks.auditCreate).not.toHaveBeenCalled()
  })
  it('checks evidence access before disclosing configuration', async () => {
    mocks.access.mockResolvedValue({ ok: false, error: 'Akses ditolak', status: 403 })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Akses ditolak' })
  })
  it('checks authentication before reading the upload body', async () => {
    mocks.user.mockResolvedValue(NextResponse.json({ error: 'Belum masuk' }, { status: 401 }))
    const req = request()
    const readBody = vi.spyOn(req, 'formData')
    const response = await POST(req)
    expect(response.status).toBe(401)
    expect(readBody).not.toHaveBeenCalled()
    expect(mocks.access).not.toHaveBeenCalled()
  })
})
