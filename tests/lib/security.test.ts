import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanText, contentMatchesMime, hit, peek, resetRate, safeDisplayName, safeEqual } from '@/lib/security'
import { buildCsp, createNonce, staticSecurityHeaders } from '@/lib/security-headers'

/** Pengaman bersama (src/lib/security.ts, src/lib/security-headers.ts). Tanpa basis data. */

afterEach(() => {
  vi.useRealTimers()
})

describe('safeEqual', () => {
  it('sama → true, beda isi atau panjang → false', () => {
    expect(safeEqual('Bearer rahasia-panjang', 'Bearer rahasia-panjang')).toBe(true)
    expect(safeEqual('Bearer rahasia-panjanG', 'Bearer rahasia-panjang')).toBe(false)
    expect(safeEqual('Bearer rahasia', 'Bearer rahasia-panjang')).toBe(false)
    expect(safeEqual('', 'x')).toBe(false)
  })
})

describe('pembatas laju', () => {
  it('menolak setelah batas, memberi Retry-After, dan pulih setelah jendela', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T03:00:00Z'))
    const key = `tes:${Math.random()}`
    for (let i = 0; i < 3; i++) expect(hit(key, 3, 60_000).ok).toBe(true)
    const blocked = hit(key, 3, 60_000)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBe(60)
    expect(peek(key, 3).ok).toBe(false)
    vi.setSystemTime(new Date('2026-10-06T03:01:00Z'))
    expect(peek(key, 3).ok).toBe(true)
    expect(hit(key, 3, 60_000).ok).toBe(true)
  })

  it('resetRate menghapus hitungan', () => {
    const key = `tes:${Math.random()}`
    hit(key, 1, 60_000)
    expect(peek(key, 1).ok).toBe(false)
    resetRate(key)
    expect(peek(key, 1).ok).toBe(true)
  })
})

describe('teks masukan', () => {
  it('membuang karakter kendali & pembalik arah, memangkas, dan membatasi panjang', () => {
    expect(cleanText('  halo\u0000‮dunia  ', 100)).toBe('halodunia')
    expect(cleanText('baris\nbaru\ttab', 100)).toBe('baris\nbaru\ttab')
    expect(cleanText('abcdef', 3)).toBe('abc')
    expect(cleanText(42, 10)).toBe('')
  })

  it('nama tampilan berkas tanpa pemisah jalur', () => {
    expect(safeDisplayName('../../etc/passwd')).toBe('..-..-etc-passwd')
    expect(safeDisplayName('   ')).toBe('berkas')
    expect(safeDisplayName('a'.repeat(500)).length).toBe(200)
  })
})

describe('contentMatchesMime', () => {
  const bytes = (...xs: (number | string)[]) =>
    new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])))

  it('menerima tanda tangan yang benar', () => {
    expect(contentMatchesMime(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe(true)
    expect(contentMatchesMime(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0), 'image/png')).toBe(true)
    expect(contentMatchesMime(bytes('GIF89a'), 'image/gif')).toBe(true)
    expect(contentMatchesMime(bytes('RIFF', 0, 0, 0, 0, 'WEBP'), 'image/webp')).toBe(true)
    expect(contentMatchesMime(bytes(0, 0, 0, 0x18, 'ftypheic'), 'image/heic')).toBe(true)
    expect(contentMatchesMime(bytes('%PDF-1.7'), 'application/pdf')).toBe(true)
    expect(contentMatchesMime(bytes('PK', 3, 4), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
    expect(contentMatchesMime(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 'application/vnd.ms-excel')).toBe(true)
    expect(contentMatchesMime(bytes('a,b\n1,2\n'), 'text/csv')).toBe(true)
  })

  it('menolak HTML yang dinamai gambar, biner yang dinamai teks, dan jenis tak dikenal', () => {
    expect(contentMatchesMime(bytes('<html><script>'), 'image/png')).toBe(false)
    expect(contentMatchesMime(bytes('<svg onload=x>'), 'image/jpeg')).toBe(false)
    expect(contentMatchesMime(bytes('abc', 0, 'def'), 'text/plain')).toBe(false)
    expect(contentMatchesMime(bytes('<html>'), 'text/html')).toBe(false)
  })
})

describe('header keamanan', () => {
  it('CSP produksi: skrip hanya bernonce, tanpa unsafe-eval/unsafe-inline, tidak bisa dibingkai', () => {
    const nonce = createNonce()
    const csp = buildCsp(nonce, { dev: false })
    const script = csp.split('; ').find((d) => d.startsWith('script-src'))!
    expect(script).toContain(`'nonce-${nonce}'`)
    expect(script).toContain("'strict-dynamic'")
    expect(script).not.toContain('unsafe-eval')
    expect(script).not.toContain('unsafe-inline')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('CSP dev mengizinkan eval & websocket HMR', () => {
    const csp = buildCsp('n', { dev: true })
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain('ws:')
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('nonce acak dan cukup panjang', () => {
    const a = createNonce()
    expect(a).not.toBe(createNonce())
    expect(Buffer.from(a, 'base64').length).toBe(16)
  })

  it('HSTS hanya di produksi', () => {
    expect(staticSecurityHeaders(true).some((h) => h.key === 'Strict-Transport-Security')).toBe(true)
    expect(staticSecurityHeaders(false).some((h) => h.key === 'Strict-Transport-Security')).toBe(false)
  })
})
