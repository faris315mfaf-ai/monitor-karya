import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'
import { safeEqual } from '@/lib/security'

/** Rahasia cron yang lebih pendek dari ini dianggap belum diatur. */
const MIN_CRON_SECRET_LENGTH = 16

/**
 * Pagar cron Vercel: Vercel mengirim "Authorization: Bearer <CRON_SECRET>".
 * Tanpa rahasia yang cocok tidak ada yang dijalankan. Mengembalikan respons
 * galat untuk langsung dikembalikan, atau null bila sah.
 *
 * Rahasia wajib ada (≥16 karakter) dan dibandingkan waktu-konstan lewat
 * ringkasan SHA-256, jadi panjangnya pun tidak bocor (6 Okt 2026).
 */
export function refuseCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
    return NextResponse.json({ error: 'CRON_SECRET belum diatur di lingkungan ini' }, { status: 503 })
  }
  const given = req.headers.get('authorization') ?? ''
  if (!safeEqual(given, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  }
  return null
}
