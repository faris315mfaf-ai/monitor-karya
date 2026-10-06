/**
 * Header keamanan HTTP (6 Okt 2026, lihat docs/KEAMANAN.md).
 *
 * Dipakai oleh src/proxy.ts (CSP bernonce per permintaan) dan next.config.ts
 * (header statis untuk semua respons, termasuk aset). Tanpa `server-only` dan
 * tanpa modul Node agar aman dimuat di proxy maupun saat konfigurasi dibaca.
 */

const isProd = process.env.NODE_ENV === 'production'

/** Origin Supabase Storage: gambar bukti dibuka lewat URL bertanda tangan. */
function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
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
  const storage = supabaseOrigin()
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
