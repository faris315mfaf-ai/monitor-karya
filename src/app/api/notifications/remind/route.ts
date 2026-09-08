import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refuseUnscoped, requireApiUser, scopeEntityIds, type SessionUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { listUnreportedDivisions, remindUnreportedDivisions } from '@/lib/reminders'

/**
 * Pengingat manual ke divisi yang belum melapor (8 Sep 2026).
 *
 *   GET  — siapa saja yang belum menyerahkan laporan minggu ini (pratinjau).
 *   POST — kirim pengingat ke kepala divisi masing-masing.
 *
 * Lingkupnya mengikuti entitas pemanggil: Admin PT hanya divisinya sendiri,
 * Direktur SDM & GA / TI seluruh grup.
 */

/**
 * Entitas yang dijangkau: lingkup akun, dipersempit ke satu entitas bila
 * diminta. Peran berlingkup tidak bisa melebar keluar lingkupnya sendiri.
 */
async function targetEntities(user: SessionUser, requested: string | null): Promise<string[] | null> {
  const scope = await scopeEntityIds(user)
  if (!requested) return scope
  if (scope === null) return [requested]
  return scope.includes(requested) ? [requested] : scope
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'notify:remind')) {
    return NextResponse.json({ error: 'Peran Anda tidak mengirim pengingat' }, { status: 403 })
  }
  const unscoped = refuseUnscoped(user)
  if (unscoped) return unscoped

  const entityIds = await targetEntities(user, req.nextUrl.searchParams.get('entityId'))
  return NextResponse.json(await listUnreportedDivisions(entityIds))
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'notify:remind')) {
    return NextResponse.json({ error: 'Peran Anda tidak mengirim pengingat' }, { status: 403 })
  }
  const unscoped = refuseUnscoped(user)
  if (unscoped) return unscoped

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const entityIds = await targetEntities(user, typeof body.entityId === 'string' ? body.entityId : null)
  const result = await remindUnreportedDivisions({ entityIds, source: 'MANUAL', actorName: user.name })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'SEND_DIVISION_REMINDERS',
      targetType: 'WEEKLY_REPORT',
      targetId: result.week.key,
      afterData: JSON.stringify({ sent: result.sent, unreported: result.results.length }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json(result)
}
