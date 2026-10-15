import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { readJsonObject, requireShUser, unprocessable } from '@/lib/subholding/http'
import { inboxWhere } from '@/lib/subholding/inbox'
import { requireShAdmin } from '@/lib/subholding/scope'

/**
 * POST /api/sh/inbox/read (ADMIN_SUBHOLDING) { ids?: string[], all?: true }
 * Menandai pesan kotak masuk subholding sendiri sebagai dibaca. Id di luar
 * subholding akun diabaikan diam-diam. → { ok: true, marked }
 */
export async function POST(req: NextRequest) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const sub = await requireShAdmin(user)
  if (sub instanceof NextResponse) return sub

  const body = await readJsonObject(req)
  if (body instanceof NextResponse) return body
  const all = body.all === true
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64).slice(0, 200)
    : []
  if (!all && ids.length === 0) return unprocessable('Tidak ada pesan yang ditandai')

  try {
    const res = await db.subholdingReportComment.updateMany({
      where: { AND: [inboxWhere(sub.id), { readAt: null }, ...(all ? [] : [{ id: { in: ids } }])] },
      data: { readAt: new Date() },
    })
    return NextResponse.json({ ok: true, marked: res.count })
  } catch (err) {
    return serverError(err, 'Pesan gagal ditandai. Coba lagi.', 'sh/inbox/read POST')
  }
}
