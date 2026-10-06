import { NextResponse } from 'next/server'

/**
 * Pesan galat yang aman untuk klien (F1-C, 6 Okt 2026, docs/KEAMANAN.md).
 *
 * Route API tidak boleh mengembalikan `err.message` mentah: galat Prisma,
 * Supabase Storage, atau runtime bisa membawa nama tabel/kolom, isi kueri,
 * atau detail penyimpanan. Dua pola:
 *
 *  - `serverError(err, fallback, tag)` — galat tak terduga (500/502): selalu
 *    pesan umum ke klien, detailnya hanya ke console.error.
 *  - `clientErrorMessage(err, fallback, tag)` — blok try yang juga memuat
 *    penolakan yang sengaja dilempar pustaka (mis. `new Error('Username "x"
 *    sudah dipakai.')` di src/lib/companies.ts). Hanya `Error` biasa dengan
 *    pesan pendek satu baris yang tidak berbau internal yang diteruskan;
 *    selain itu pesan umum + console.error.
 */

const INTERNAL_HINT =
  /prisma|invocation|database|postgres|sql|econn|etimedout|column|relation|constraint|unique|foreign key|supabase|bucket|jwt|token|stack|undefined|null|cannot read/i

export function isSafeClientMessage(err: unknown): err is Error {
  if (!(err instanceof Error) || err.constructor !== Error) return false
  const m = err.message
  return !!m && m.length <= 200 && !m.includes('\n') && !INTERNAL_HINT.test(m)
}

export function clientErrorMessage(err: unknown, fallback: string, tag: string): string {
  if (isSafeClientMessage(err)) return err.message
  console.error(`[${tag}]`, err)
  return fallback
}

/** Respons galat tak terduga: pesan umum, detail hanya ke log server. */
export function serverError(err: unknown, fallback: string, tag: string, status = 500): NextResponse {
  console.error(`[${tag}]`, err)
  return NextResponse.json({ error: fallback }, { status })
}
