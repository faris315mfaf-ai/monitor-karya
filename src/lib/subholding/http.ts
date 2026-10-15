import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { parseWibDateKey } from '@/lib/lock'

/** Pembantu kecil rute /api/sh/** (16 Okt 2026). */

/** requireApiUser untuk modul subholding (peran subholding diizinkan masuk). */
export function requireShUser(): Promise<SessionUser | NextResponse> {
  return requireApiUser({ allowSubholdingRoles: true })
}

/** Badan JSON objek, atau 400. */
export async function readJsonObject(req: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = (await req.json()) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
    }
    return body as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }
}

/** Parameter tanggal YYYY-MM-DD (WIB): kosong → `fallback`; tidak sah → 'invalid'. */
export function dateParam(raw: string | null, fallback: Date | null): Date | null | 'invalid' {
  if (raw === null || raw.trim() === '') return fallback
  return parseWibDateKey(raw.trim()) ?? 'invalid'
}

export function unprocessable(error: string, field?: string): NextResponse {
  return NextResponse.json(field ? { error, field } : { error }, { status: 422 })
}

export const notFound = () => NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })

/**
 * Galat yang dilempar dari dalam transaksi supaya seluruh tulisannya batal,
 * lalu diubah menjadi respons { error } dengan status ini (mis. 409 klaim
 * bersyarat kalah balapan).
 */
export class ShHttpError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export function shHttpErrorResponse(err: unknown): NextResponse | null {
  return err instanceof ShHttpError ? NextResponse.json({ error: err.message }, { status: err.status }) : null
}
