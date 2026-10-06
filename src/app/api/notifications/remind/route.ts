import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refuseUnscoped, requireApiUser, scopeEntityIds, type SessionUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { isoWeekStart, parseWeekKey } from '@/lib/lock'
import { listUnreportedDivisions, remindUnreportedDivisions, type ReminderTarget } from '@/lib/reminders'
import { clientIp, limitReminders } from '@/lib/security'

/**
 * Pengingat manual ke divisi yang belum melapor (8 Sep 2026).
 *
 *   GET  ?entityId= &divisionId= &week=  — siapa saja yang belum menyerahkan (pratinjau).
 *   POST { entityId?, divisionId?, week? } — kirim pengingat ke kepala divisi masing-masing.
 *
 * Lingkupnya mengikuti entitas pemanggil: Admin PT hanya divisinya sendiri,
 * Direktur SDM & GA / TI seluruh grup. `divisionId` mempersempit ke satu
 * divisi di dalam lingkup itu; `week` ("2026-W40") memilih minggu yang
 * ditagih — minggu berjalan atau yang sudah lewat, tidak minggu depan.
 * Tanpa keduanya: semua divisi dalam lingkup, minggu berjalan (perilaku lama).
 */

/** divisionId & week dari masukan, atau galat 4xx. Divisi harus ada di lingkup. */
async function parseTarget(
  entityIds: string[] | null,
  rawDivision: unknown,
  rawWeek: unknown
): Promise<ReminderTarget | NextResponse> {
  const target: ReminderTarget = {}
  if (rawWeek !== undefined && rawWeek !== null && rawWeek !== '') {
    const period = typeof rawWeek === 'string' && rawWeek.length <= 10 ? parseWeekKey(rawWeek) : null
    if (!period) return NextResponse.json({ error: 'Kunci minggu tidak dikenali' }, { status: 400 })
    if (period.start.getTime() > isoWeekStart(new Date()).getTime()) {
      return NextResponse.json({ error: 'Minggu yang belum berjalan belum bisa ditagih.' }, { status: 422 })
    }
    target.period = period
  }
  if (rawDivision !== undefined && rawDivision !== null && rawDivision !== '') {
    if (typeof rawDivision !== 'string' || rawDivision.length > 64) {
      return NextResponse.json({ error: 'Divisi tidak valid' }, { status: 400 })
    }
    const division = await db.division.findUnique({ where: { id: rawDivision }, select: { id: true, entityId: true } })
    // Divisi di luar lingkup dijawab sama dengan yang tidak ada (anti-IDOR).
    if (!division || (entityIds !== null && !entityIds.includes(division.entityId))) {
      return NextResponse.json({ error: 'Divisi tidak ditemukan di lingkup Anda.' }, { status: 404 })
    }
    target.divisionId = division.id
  }
  return target
}

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

  const sp = req.nextUrl.searchParams
  const entityIds = await targetEntities(user, sp.get('entityId'))
  const target = await parseTarget(entityIds, sp.get('divisionId'), sp.get('week'))
  if (target instanceof NextResponse) return target
  return NextResponse.json(await listUnreportedDivisions(entityIds, target))
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'notify:remind')) {
    return NextResponse.json({ error: 'Peran Anda tidak mengirim pengingat' }, { status: 403 })
  }
  const unscoped = refuseUnscoped(user)
  if (unscoped) return unscoped
  const limited = limitReminders(user.id, 'divisions')
  if (limited) return limited

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const entityIds = await targetEntities(user, typeof body.entityId === 'string' ? body.entityId : null)
  const target = await parseTarget(entityIds, body.divisionId, body.week)
  if (target instanceof NextResponse) return target
  const result = await remindUnreportedDivisions({ entityIds, source: 'MANUAL', actorName: user.name, ...target })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'SEND_DIVISION_REMINDERS',
      targetType: 'WEEKLY_REPORT',
      targetId: result.week.key,
      afterData: JSON.stringify({
        sent: result.sent,
        unreported: result.results.length,
        ...(target.divisionId ? { divisionId: target.divisionId } : {}),
      }),
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
    },
  })

  return NextResponse.json(result)
}
