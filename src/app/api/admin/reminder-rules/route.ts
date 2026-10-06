import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { getRules, reminderDesk, setRule } from '@/lib/reminder-rules'
import { REMINDER_KINDS, TIME_RE, type ReminderKind } from '@/lib/admin-meta'
import { serverError } from '@/lib/api-error'

/**
 * Pengingat otomatis per PT (04-admin-pt.md).
 *
 *   GET   ?entityId= — empat aturan PT (Admin PT: PT-nya sendiri; TI/Super Admin: pilih PT)
 *   PATCH { kind, enabled?, time?, weekday?, days?, entityId? } — berlaku seketika,
 *         tercatat di AuditLog dengan kalimat "<nama> mematikan …".
 */

export const dynamic = 'force-dynamic'

async function resolveEntity(desk: { full: boolean; entityId: string | null }, requested: unknown): Promise<string | NextResponse> {
  if (!desk.full) {
    if (typeof requested === 'string' && requested && requested !== desk.entityId) {
      return NextResponse.json({ error: 'Anda hanya mengatur pengingat perusahaan Anda sendiri.' }, { status: 403 })
    }
    return desk.entityId!
  }
  if (typeof requested !== 'string' || !requested) return NextResponse.json({ error: 'Pilih perusahaan.' }, { status: 422 })
  const pt = await db.entity.findFirst({ where: { id: requested, type: 'PT' }, select: { id: true } })
  if (!pt) return NextResponse.json({ error: 'Perusahaan tidak ditemukan.' }, { status: 404 })
  return pt.id
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const desk = reminderDesk(user)
  if (!desk) return NextResponse.json({ error: 'Peran Anda tidak mengatur pengingat otomatis' }, { status: 403 })
  const entityId = await resolveEntity(desk, req.nextUrl.searchParams.get('entityId') ?? (desk.full ? null : desk.entityId))
  if (entityId instanceof NextResponse) return entityId
  try {
    return NextResponse.json({ entityId, rules: await getRules(entityId) })
  } catch (err) {
    return serverError(err, 'Pengingat belum termuat. Coba lagi.', 'admin/reminder-rules GET')
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const desk = reminderDesk(user)
  if (!desk) return NextResponse.json({ error: 'Peran Anda tidak mengatur pengingat otomatis' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const kind = body.kind as ReminderKind
  if (!REMINDER_KINDS.includes(kind)) return NextResponse.json({ error: 'Jenis pengingat tidak dikenali.' }, { status: 422 })
  const entityId = await resolveEntity(desk, body.entityId ?? (desk.full ? null : desk.entityId))
  if (entityId instanceof NextResponse) return entityId

  const patch: { enabled?: boolean; time?: string; weekday?: number | null; days?: number } = {}
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (body.time !== undefined) {
    if (typeof body.time !== 'string' || !TIME_RE.test(body.time)) return NextResponse.json({ error: 'Jam tidak valid (JJ:MM).' }, { status: 422 })
    patch.time = body.time
  }
  if (body.weekday !== undefined) {
    if (body.weekday !== null && !(typeof body.weekday === 'number' && Number.isInteger(body.weekday) && body.weekday >= 1 && body.weekday <= 7)) {
      return NextResponse.json({ error: 'Hari tidak valid.' }, { status: 422 })
    }
    patch.weekday = body.weekday as number | null
  }
  if (body.days !== undefined) {
    if (typeof body.days !== 'number' || !Number.isInteger(body.days) || body.days < 1 || body.days > 10) {
      return NextResponse.json({ error: 'Jumlah hari 1–10.' }, { status: 422 })
    }
    patch.days = body.days
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Tidak ada yang diubah.' }, { status: 422 })

  try {
    const r = await setRule(entityId, kind, patch, { id: user.id, name: user.name }, req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null)
    return NextResponse.json({ ok: true, ...r })
  } catch (err) {
    return serverError(err, 'Gagal menyimpan pengingat. Coba lagi.', 'admin/reminder-rules PATCH')
  }
}
