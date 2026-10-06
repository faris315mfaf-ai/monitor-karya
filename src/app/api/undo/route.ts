import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { serverError } from '@/lib/api-error'
import { applyUndo } from '@/lib/undo'

/**
 * [F2-URUNGKAN] POST { token } — urungkan satu tindakan yang bisa dibalik
 * (keputusan pengajuan proyek, eskalasi, ajukan ulang & arsip proyek,
 * penerusan laporan). Tiket diterbitkan oleh route tindakan asal sebagai
 * `undoToken`; berlaku 15 menit, hanya untuk pelaku yang sama. Lihat
 * src/lib/undo.ts untuk aturan lengkap.
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json({ error: 'Tiket urungkan tidak valid' }, { status: 400 })
  }

  try {
    const result = await applyUndo(user, token, req)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (err) {
    return serverError(err, 'Tindakan belum bisa diurungkan. Coba lagi.', 'undo')
  }
}
