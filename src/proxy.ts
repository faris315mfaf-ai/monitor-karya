import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp, createNonce } from '@/lib/security-headers'

/**
 * Proxy Next.js 16 (pengganti middleware) — garis depan keamanan
 * (6 Okt 2026, lihat docs/KEAMANAN.md):
 *
 *  1. /pratinjau tidak ada di produksi (404 sebelum merender apa pun).
 *  2. Mutasi API (POST/PUT/PATCH/DELETE) harus berasal dari origin aplikasi
 *     sendiri: Origin / Sec-Fetch-Site lintas situs ditolak (CSRF).
 *  3. Batas ukuran badan permintaan API (Content-Length).
 *  4. Content-Security-Policy bernonce untuk setiap halaman. Di produksi
 *     ditegakkan; di mode dev dikirim sebagai Report-Only supaya pelanggaran
 *     tampil di konsol tanpa merusak pratinjau.
 *
 * Otorisasi tetap di tiap route (requireApiUser + cakupan); proxy hanya
 * lapisan tambahan.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Badan JSON biasa: logo perusahaan (maks 400 rb karakter) adalah yang terbesar. */
const JSON_MAX_BYTES = 1024 * 1024
/** Unggah bukti: 20 MB berkas + kelonggaran pembungkus multipart. */
const UPLOAD_MAX_BYTES = 21 * 1024 * 1024
const UPLOAD_PATH = '/api/evidence/upload'

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

/** Host yang dianggap "aplikasi ini": Host, X-Forwarded-Host, dan APP_ORIGINS (dipisah koma). */
function expectedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>()
  const host = req.headers.get('host')
  if (host) hosts.add(host.toLowerCase())
  const fwd = req.headers.get('x-forwarded-host')
  if (fwd) for (const h of fwd.split(',')) if (h.trim()) hosts.add(h.trim().toLowerCase())
  for (const o of (process.env.APP_ORIGINS ?? '').split(',')) {
    const t = o.trim()
    if (!t) continue
    try {
      hosts.add(new URL(t).host.toLowerCase())
    } catch {
      hosts.add(t.toLowerCase())
    }
  }
  return hosts
}

/**
 * Apakah mutasi ini datang dari situs lain? Browser modern selalu mengirim
 * Origin pada POST/PUT/PATCH/DELETE, dan Sec-Fetch-Site pada semua fetch.
 * Klien non-browser (cron, skrip) tidak membawa cookie korban, jadi
 * permintaan tanpa kedua header itu dibiarkan lewat ke pemeriksaan sesi.
 */
function isCrossSite(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (origin) {
    if (origin === 'null') return true
    let host: string
    try {
      host = new URL(origin).host.toLowerCase()
    } catch {
      return true
    }
    return !expectedHosts(req).has(host)
  }
  const site = req.headers.get('sec-fetch-site')
  return !!site && site !== 'same-origin' && site !== 'none'
}

function guardApi(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null

  if (isCrossSite(req)) {
    return jsonError(403, 'Permintaan lintas situs ditolak.')
  }

  const max = req.nextUrl.pathname === UPLOAD_PATH ? UPLOAD_MAX_BYTES : JSON_MAX_BYTES
  const raw = req.headers.get('content-length')
  if (raw !== null) {
    const len = Number(raw)
    if (!Number.isFinite(len) || len < 0) return jsonError(400, 'Panjang permintaan tidak valid.')
    if (len > max) return jsonError(413, 'Permintaan terlalu besar.')
  } else if (req.headers.get('transfer-encoding')) {
    // Badan tanpa panjang yang jelas tidak bisa dibatasi sebelum dibaca.
    return jsonError(411, 'Panjang permintaan wajib disertakan.')
  }
  return null
}

export function proxy(req: NextRequest) {
  const prod = process.env.NODE_ENV === 'production'
  const { pathname } = req.nextUrl

  if (prod && (pathname === '/pratinjau' || pathname.startsWith('/pratinjau/'))) {
    return new NextResponse('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }

  if (pathname.startsWith('/api/')) {
    return guardApi(req) ?? NextResponse.next()
  }

  // Halaman: CSP bernonce. Next.js membaca nonce dari header CSP permintaan
  // dan menempelkannya ke skripnya; layout meneruskannya ke skrip boot.
  const nonce = createNonce()
  const csp = buildCsp(nonce, { dev: !prod })
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set(prod ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', csp)
  return res
}

export const config = {
  matcher: [
    // Semua kecuali aset statis Next dan berkas publik bertipe gambar/teks.
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|woff|woff2|map)$).*)',
  ],
}
