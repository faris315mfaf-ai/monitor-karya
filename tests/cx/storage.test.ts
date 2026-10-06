import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, createHmac } from 'node:crypto'

const supabase = vi.hoisted(() => ({
  upload: vi.fn(), createSignedUrl: vi.fn(), remove: vi.fn(), from: vi.fn(), createClient: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }))

import { buildStorageKey, storageConfigured, uploadEvidence, signedEvidenceUrl, removeEvidence } from '@/lib/storage'
import { signedS3EvidenceUrl } from '@/lib/storage-s3'

function s3Env() {
  vi.stubEnv('STORAGE_DRIVER', 's3')
  vi.stubEnv('S3_ENDPOINT', 'http://127.0.0.1:9000')
  vi.stubEnv('S3_REGION', 'us-east-1')
  vi.stubEnv('S3_BUCKET', 'evidence')
  vi.stubEnv('S3_ACCESS_KEY_ID', 'offline-key')
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'offline-secret')
  vi.stubEnv('S3_FORCE_PATH_STYLE', 'true')
}

// Independent reconstruction from the actual request received by the fetch mock.
// Explicit header list makes omitted conditional/payload headers a failure.
function verifyMutation(url: URL, init: RequestInit, method: string, body: Buffer) {
  const headers = init.headers as Record<string, string>
  const digest = createHash('sha256').update(body).digest('hex')
  expect(headers['x-amz-content-sha256']).toBe(digest)
  const names = method === 'PUT'
    ? ['content-type', 'host', 'if-none-match', 'x-amz-content-sha256', 'x-amz-date']
    : ['host', 'x-amz-content-sha256', 'x-amz-date']
  const canonical = [method, url.pathname, '', names.map(n => `${n}:${headers[n]}\n`).join(''), names.join(';'), digest].join('\n')
  const hmac = (key: string | Buffer, message: string) => createHmac('sha256', key).update(message).digest()
  const day = headers['x-amz-date'].slice(0, 8)
  const key = hmac(hmac(hmac(hmac('AWS4offline-secret', day), 'us-east-1'), 's3'), 'aws4_request')
  const stringToSign = ['AWS4-HMAC-SHA256', headers['x-amz-date'], `${day}/us-east-1/s3/aws4_request`, createHash('sha256').update(canonical).digest('hex')].join('\n')
  expect(headers.authorization).toBe(`AWS4-HMAC-SHA256 Credential=offline-key/${day}/us-east-1/s3/aws4_request, SignedHeaders=${names.join(';')}, Signature=${hmac(key, stringToSign).toString('hex')}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2013-05-24T00:00:00Z'))
  for (const name of ['STORAGE_DRIVER', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_FORCE_PATH_STYLE', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) vi.stubEnv(name, undefined)
  supabase.from.mockReturnValue(supabase)
  supabase.createClient.mockReturnValue({ storage: { from: supabase.from } })
  supabase.upload.mockResolvedValue({ error: null })
  supabase.remove.mockResolvedValue({ error: null })
  supabase.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://offline.invalid/signed' }, error: null })
  // All networking is mocked, including when a malformed configuration is tested.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Supabase compatibility', () => {
  it('defaults to Supabase and preserves upload/read/delete contracts', async () => {
    expect(storageConfigured()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://offline.invalid')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'offline-supabase-key')
    expect(storageConfigured()).toBe(true)
    const body = Buffer.from('test')
    await uploadEvidence('TASK/id/old.pdf', body, 'application/pdf')
    expect(supabase.upload).toHaveBeenCalledWith('TASK/id/old.pdf', body, { contentType: 'application/pdf', upsert: false })
    await expect(signedEvidenceUrl('TASK/id/old.pdf', 'laporan.pdf')).resolves.toBe('https://offline.invalid/signed')
    expect(supabase.createSignedUrl).toHaveBeenCalledWith('TASK/id/old.pdf', 300, { download: 'laporan.pdf' })
    await signedEvidenceUrl('TASK/id/old.pdf')
    expect(supabase.createSignedUrl).toHaveBeenLastCalledWith('TASK/id/old.pdf', 300, undefined)
    await removeEvidence('TASK/id/old.pdf')
    expect(supabase.remove).toHaveBeenCalledWith(['TASK/id/old.pdf'])
    expect(supabase.from).toHaveBeenCalledWith('evidence')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retains Supabase failures and missing-object deletion', async () => {
    supabase.upload.mockResolvedValue({ error: { message: 'duplicate' } })
    await expect(uploadEvidence('key', Buffer.alloc(0), 'text/plain')).rejects.toThrow('duplicate')
    supabase.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(signedEvidenceUrl('key')).rejects.toThrow('denied')
    supabase.remove.mockResolvedValue({ error: { message: 'not found' } })
    await expect(removeEvidence('key')).resolves.toBeUndefined()
    supabase.remove.mockResolvedValue({ error: { message: 'denied' } })
    await expect(removeEvidence('key')).rejects.toThrow('denied')
  })
  it('keeps the original key shape and filename cleanup', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(buildStorageKey('TASK', 'id', 'Laporan café (final).pdf')).toBe(`TASK/id/${Date.now().toString(36)}-i-Laporan-cafe-final.pdf`)
    expect(buildStorageKey('OUTPUT', 'id', '💾')).toMatch(/\/berkas$|-berkas$/)
  })
})

describe('S3 offline signing and operations', () => {
  beforeEach(s3Env)
  // Primary fixture: https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html
  it('matches the published AWS presigned URL vector exactly', () => {
    vi.stubEnv('S3_ENDPOINT', 'https://s3.amazonaws.com')
    vi.stubEnv('S3_BUCKET', 'examplebucket')
    vi.stubEnv('S3_ACCESS_KEY_ID', 'AKIAIOSFODNN7EXAMPLE')
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'false')
    expect(signedS3EvidenceUrl('test.txt', 86400)).toBe('https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('reads privately for 300 seconds, preserving keys and encoded download names', async () => {
    const url = new URL(await signedEvidenceUrl("TASK/id/a b+%?#é!'().pdf", 'laporan é"\r\n.pdf'))
    expect(url.origin).toBe('http://127.0.0.1:9000')
    expect(url.pathname).toBe('/evidence/TASK/id/a%20b%2B%25%3F%23%C3%A9%21%27%28%29.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(url.search).toContain('response-content-disposition=attachment%3B%20filename%3D')
    expect(url.search).toContain('filename%2A%3DUTF-8%27%27laporan%2520%25C3%25A9%2522.pdf')
    expect(url.search).not.toContain('+')
    expect(url.toString()).not.toContain('offline-secret')
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="laporan __.pdf"; filename*=UTF-8\'\'laporan%20%C3%A9%22.pdf')
    expect(fetch).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('signs download overrides so changing a filename changes the signature', async () => {
    const first = new URL(await signedEvidenceUrl('old/key', 'one.pdf'))
    const second = new URL(await signedEvidenceUrl('old/key', 'two.pdf'))
    expect(first.searchParams.get('X-Amz-Signature')).not.toBe(second.searchParams.get('X-Amz-Signature'))
  })
  it.each(['buffer', 'arraybuffer'])('uploads %s with signed no-overwrite condition and payload hash', async kind => {
    const bytes = Buffer.from([0, 255, 23, 64])
    const input = kind === 'buffer' ? bytes : Uint8Array.from(bytes).buffer
    await uploadEvidence('TASK/id/old.pdf', input, 'application/pdf')
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [URL, RequestInit]
    expect(url.toString()).toBe('http://127.0.0.1:9000/evidence/TASK/id/old.pdf')
    expect(init).toMatchObject({ method: 'PUT', cache: 'no-store', redirect: 'error', headers: { 'if-none-match': '*', 'content-type': 'application/pdf' } })
    expect(Buffer.from(init.body as ArrayBuffer)).toEqual(bytes)
    verifyMutation(url, init, 'PUT', bytes)
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it.each([409, 412, 403, 500])('rejects failed upload HTTP %i without retry or fallback', async status => {
    vi.mocked(fetch).mockResolvedValue(new Response('private provider details', { status }))
    await expect(uploadEvidence('key', Buffer.from('x'), 'text/plain')).rejects.toThrow(`HTTP ${status}`)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it.each([204, 404])('signs deletion and tolerates HTTP %i', async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }))
    await expect(removeEvidence('TASK/id/old.pdf')).resolves.toBeUndefined()
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [URL, RequestInit]
    expect(init.body).toBeUndefined()
    verifyMutation(url, init, 'DELETE', Buffer.alloc(0))
  })
  it('does not swallow deletion errors or network failures', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }))
    await expect(removeEvidence('key')).rejects.toThrow('HTTP 403')
    vi.mocked(fetch).mockRejectedValue(new TypeError('network offline'))
    await expect(uploadEvidence('key', Buffer.alloc(0), 'text/plain')).rejects.toThrow('network offline')
  })
  it('supports AWS endpoint and region defaults without creating a client', async () => {
    vi.stubEnv('S3_ENDPOINT', undefined)
    vi.stubEnv('S3_REGION', undefined)
    vi.stubEnv('S3_FORCE_PATH_STYLE', undefined)
    const url = new URL(await signedEvidenceUrl('old/key'))
    expect(url.hostname).toBe('evidence.s3.us-east-1.amazonaws.com')
    expect(url.pathname).toBe('/old/key')
    expect(storageConfigured()).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    ['S3_BUCKET', undefined], ['S3_ACCESS_KEY_ID', undefined], ['S3_SECRET_ACCESS_KEY', undefined],
    ['S3_REGION', '../invalid'], ['S3_BUCKET', '../bucket'], ['S3_FORCE_PATH_STYLE', 'yes'],
    ['S3_ENDPOINT', 'not-a-url'], ['S3_ENDPOINT', 'ftp://offline.invalid'],
    ['S3_ENDPOINT', 'https://key:secret@offline.invalid'], ['S3_ENDPOINT', 'https://offline.invalid/prefix'],
    ['S3_ENDPOINT', 'https://offline.invalid?query=1'], ['S3_ENDPOINT', 'https://offline.invalid/#fragment'],
  ])('fails closed for %s=%s', async (name, value) => {
    vi.stubEnv(name, value)
    expect(storageConfigured()).toBe(false)
    await expect(signedEvidenceUrl('key')).rejects.toThrow()
    await expect(uploadEvidence('key', Buffer.alloc(0), 'text/plain')).rejects.toThrow()
    await expect(removeEvidence('key')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it.each(['', 'minio', 'SUPABASE'])('rejects unknown driver %s even with Supabase credentials', async driver => {
    vi.stubEnv('STORAGE_DRIVER', driver)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://offline.invalid')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'offline-key')
    expect(storageConfigured()).toBe(false)
    await expect(signedEvidenceUrl('key')).rejects.toThrow('STORAGE_DRIVER')
    await expect(uploadEvidence('key', Buffer.alloc(0), 'text/plain')).rejects.toThrow('STORAGE_DRIVER')
    await expect(removeEvidence('key')).rejects.toThrow('STORAGE_DRIVER')
    expect(fetch).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it.each(['', 'TASK/../key', './key'])('rejects URL-normalized key %s', async key => {
    await expect(signedEvidenceUrl(key)).rejects.toThrow('Kunci')
    await expect(removeEvidence(key)).rejects.toThrow('Kunci')
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([0, -1, 1.5, 604801, NaN])('rejects invalid presigned TTL %s', ttl => {
    expect(() => signedS3EvidenceUrl('key', ttl)).toThrow('Masa berlaku')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects IP virtual-host addressing and header injection', async () => {
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'false')
    expect(storageConfigured()).toBe(false)
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'true')
    await expect(uploadEvidence('key', Buffer.alloc(0), 'text/plain\r\nx-test: value')).rejects.toThrow('Jenis')
    expect(fetch).not.toHaveBeenCalled()
  })
})
