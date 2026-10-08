import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * Pengaman bersama untuk route API (6 Okt 2026, lihat docs/KEAMANAN.md):
 * perbandingan rahasia waktu-konstan, pembatas laju, IP klien, teks aman,
 * dan pemeriksaan isi berkas unggahan.
 *
 * Berkas ini hanya untuk server. Header keamanan & CSP ada di
 * src/lib/security-headers.ts karena dipakai juga oleh proxy.
 */

// ------------------------------------------------------------------
// Perbandingan rahasia
// ------------------------------------------------------------------

/**
 * Membandingkan dua rahasia tanpa membocorkan isi maupun panjangnya lewat
 * waktu: keduanya diringkas SHA-256 dulu sehingga panjang yang dibandingkan
 * selalu 32 byte.
 */
export function safeEqual(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b) && given.length === expected.length
}

// ------------------------------------------------------------------
// IP klien
// ------------------------------------------------------------------

/**
 * IP klien untuk jejak audit dan pembatas laju. `x-real-ip` diisi Vercel; di
 * VPS hanya Caddy yang menerbukan port dan Caddy MENAMBAHKAN alamat klien di
 * belakang `x-forwarded-for` yang sudah ada (tidak menimpa), sehingga entri
 * PERTAMA bisa diisi klien untuk memutasi ember pembatas. Entri TERAKHIR
 * dipakai: itulah yang ditambahkan proxy tepercaya terdekat. Bila suatu saat
 * ada lebih dari satu hop (mis. CDN di depan Caddy), entri terakhir jatuh ke
 * peer proxy — pembatas jadi terlalu ketat, tidak pernah terlalu longgar.
 * Tanpa proxy tepercaya nilai ini bisa dipalsukan, jadi pembatas laju tidak
 * pernah HANYA memakai IP. (Tambalan temuan T2-S2-S1.)
 */
export function clientIp(req: Request): string | null {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real.slice(0, 64)
  const parts = req.headers.get('x-forwarded-for')?.split(',') ?? []
  const last = parts[parts.length - 1]?.trim()
  return last ? last.slice(0, 64) : null
}

// ------------------------------------------------------------------
// Pembatas laju (jendela tetap, di memori)
// ------------------------------------------------------------------

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 20_000

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  // Masih penuh (serangan dengan banyak kunci): buang yang tertua.
  if (buckets.size >= MAX_BUCKETS) {
    const drop = buckets.size - MAX_BUCKETS + 1000
    let i = 0
    for (const k of buckets.keys()) {
      if (i++ >= drop) break
      buckets.delete(k)
    }
  }
}

export type RateResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number }

/**
 * Menghitung satu kejadian untuk `key`. Batas berlaku per instans server:
 * di serverless setiap instans punya hitungannya sendiri, jadi ini rem
 * terbaik-usaha, bukan kuota global (lihat docs/KEAMANAN.md).
 */
export function hit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now()
  prune(now)
  let b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs }
    buckets.set(key, b)
  }
  b.count += 1
  if (b.count > limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  return { ok: true, remaining: limit - b.count }
}

/** Seperti `hit` tetapi tanpa menambah hitungan: apakah kunci ini sedang diblokir? */
export function peek(key: string, limit: number): RateResult {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) return { ok: true, remaining: limit }
  if (b.count >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  return { ok: true, remaining: limit - b.count }
}

/** Menghapus hitungan (mis. setelah masuk berhasil). */
export function resetRate(key: string) {
  buckets.delete(key)
}

export function tooManyRequests(retryAfterSec: number, message?: string) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60))
  return NextResponse.json(
    { error: message ?? `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`, retryAfter: retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  )
}

/**
 * Rem untuk endpoint pengingat: per akun per endpoint. Pengingat sudah
 * dibatasi sekali sehari per proyek/divisi oleh logikanya sendiri; ini
 * mencegah skrip memanggilnya bertubi-tubi.
 */
export const REMINDER_LIMIT = { limit: 30, windowMs: 5 * 60_000 }

export function limitReminders(userId: string, endpoint: string): NextResponse | null {
  const r = hit(`remind:${endpoint}:${userId}`, REMINDER_LIMIT.limit, REMINDER_LIMIT.windowMs)
  return r.ok ? null : tooManyRequests(r.retryAfterSec, 'Terlalu banyak pengingat dalam waktu singkat. Coba lagi sebentar lagi.')
}

// ------------------------------------------------------------------
// Teks masukan
// ------------------------------------------------------------------

// Karakter kendali kecuali tab (09), baris baru (0A) dan carriage return (0D).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g

/** Teks bebas yang aman disimpan: tanpa karakter kendali/pembalik arah, dipangkas, dibatasi panjangnya. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL, '').trim().slice(0, max)
}

/** Panjang maksimal kata sandi yang diterima — mencegah hashing masukan raksasa. */
export const MAX_PASSWORD_LENGTH = 256

// ------------------------------------------------------------------
// Unggahan berkas
// ------------------------------------------------------------------

const startsWith = (buf: Uint8Array, sig: number[], offset = 0) =>
  buf.length >= offset + sig.length && sig.every((b, i) => buf[offset + i] === b)
const ascii = (buf: Uint8Array, from: number, to: number) => String.fromCharCode(...buf.subarray(from, to))

/**
 * Apakah byte awal berkas cocok dengan jenis MIME yang diklaim? Browser
 * mengisi `type` dari ekstensi, jadi tanpa pemeriksaan ini sebuah HTML/skrip
 * bisa diunggah dengan nama .png. Teks/CSV ditolak bila memuat byte NUL
 * (berkas biner yang menyamar).
 */
export function contentMatchesMime(buf: Uint8Array, mime: string): boolean {
  switch (mime) {
    case 'image/jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff])
    case 'image/png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/gif':
      return ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a'
    case 'image/webp':
      return ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP'
    case 'image/heic':
      // ISO-BMFF: "ftyp" di offset 4 lalu merek heic/heix/mif1/msf1/hevc.
      return ascii(buf, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(ascii(buf, 8, 12))
    case 'application/pdf':
      return ascii(buf, 0, 5) === '%PDF-'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return startsWith(buf, [0x50, 0x4b, 0x03, 0x04])
    case 'application/msword':
    case 'application/vnd.ms-excel':
      return startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    case 'text/plain':
    case 'text/csv': {
      const head = buf.subarray(0, Math.min(buf.length, 8192))
      return !head.includes(0)
    }
    default:
      return false
  }
}

/** Nama tampilan berkas: tanpa karakter kendali & pemisah jalur, maks 200 karakter. */
export function safeDisplayName(name: string): string {
  const cleaned = cleanText(name, 400).replace(/[\\/]+/g, '-').replace(/\s+/g, ' ')
  return cleaned.slice(-200) || 'berkas'
}
