/**
 * Header keamanan HTTP (6 Okt 2026, lihat docs/KEAMANAN.md).
 *
 * Dipakai oleh src/proxy.ts (CSP bernonce per permintaan) dan next.config.ts
 * (header statis untuk semua respons, termasuk aset). Tanpa `server-only` dan
 * tanpa modul Node agar aman dimuat di proxy maupun saat konfigurasi dibaca.
 */

const isProd = process.env.NODE_ENV === 'production'

/** Only literal HTTP(S) hosts may enter a CSP source list. */
function safeStorageUrl(raw: string): URL | null {
  try {
    // URL parsing strips controls; reject them first rather than silently repair.
    if (/[\s\x00-\x1f\x7f]/.test(raw)) return null
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        !/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])$/i.test(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

/**
 * Origin of the selected storage driver, never a wildcard or a credential.
 * Keep S3 validation/addressing aligned with storage-s3.configuration/objectUrl.
 * This module also loads in next.config/proxy, so importing the server-only
 * signer is not safe. Differential tests compare this origin to signed URLs.
 */
function storageOrigin(): string | null {
  const driver = process.env.STORAGE_DRIVER ?? 'supabase'
  if (driver === 'supabase') {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
    return raw ? safeStorageUrl(raw)?.origin ?? null : null
  }
  if (driver !== 's3') return null

  const region = process.env.S3_REGION || 'us-east-1'
  const bucket = process.env.S3_BUCKET
  const accessKey = process.env.S3_ACCESS_KEY_ID
  const pathStyle = process.env.S3_FORCE_PATH_STYLE ?? 'false'
  if (!bucket || !accessKey || !process.env.S3_SECRET_ACCESS_KEY ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..') ||
      !/^[a-z0-9-]+$/.test(region) || !['true', 'false'].includes(pathStyle) ||
      /[\s/,]/.test(accessKey)) return null

  const url = safeStorageUrl(process.env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`)
  if (!url || url.pathname !== '/' || url.search || url.hash) return null
  if (pathStyle === 'false') {
    if (url.hostname.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return null
    url.hostname = `${bucket}.${url.hostname}`
  }
  return url.origin
}

/** Nonce acak per permintaan (base64, 128 bit). */
export function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/**
 * Content-Security-Policy untuk halaman.
 *
 * - Skrip: hanya yang membawa nonce (Next.js menempelkannya otomatis ke
 *   skripnya sendiri; skrip boot tampilan & next-themes menerimanya dari
 *   layout) ditambah yang dimuat skrip itu ('strict-dynamic').
 * - Gaya: 'unsafe-inline' tetap perlu karena React merender atribut style=""
 *   dan beberapa komponen (sonner, chart) menyisipkan <style>.
 * - Mode dev butuh 'unsafe-eval' (React merekonstruksi stack) dan websocket HMR.
 */
export function buildCsp(nonce: string, opts: { dev?: boolean } = {}): string {
  const dev = opts.dev ?? !isProd
  const storage = storageOrigin()
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...(storage ? [storage] : [])],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...(storage ? [storage] : []), ...(dev ? ['ws:', 'wss:'] : [])],
    'media-src': ["'self'", 'blob:', ...(storage ? [storage] : [])],
    'frame-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`)
  if (!dev) parts.push('upgrade-insecure-requests')
  return parts.join('; ')
}

/** Header statis untuk setiap respons (halaman, API, aset). */
export function staticSecurityHeaders(prod = isProd): { key: string; value: string }[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=(), interest-cohort=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    ...(prod ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
  ]
}
