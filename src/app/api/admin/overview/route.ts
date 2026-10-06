import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isGlobalRole, refuseUnscoped, requireApiUser, scopeEntityIds, scopeUserIds } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/constants'
import { loadCompliance, resolveEntityScope } from '@/lib/admin-compliance-server'
import { reminderDesk } from '@/lib/reminder-rules'
import type { AdminOverview } from '@/lib/admin-meta'
import { serverError } from '@/lib/api-error' // [F3-D]

/**
 * Ringkasan Admin PT (6 Okt 2026, 04-admin-pt.md): hitungan data induk,
 * pengguna per peran, kepatuhan laporan harian per orang di tiap divisi, dan
 * jumlah buka kunci. Admin PT / Direktur entitas: subtree PT-nya; peran grup:
 * seluruh grup atau ?entityId=.
 *
 * Kepatuhan memakai pemuat yang sama dengan /api/admin/compliance, lalu
 * diproyeksikan ke bentuk respons lama agar konsumen overview tetap cocok.
 */

export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['ADMIN_PT', 'DIREKTUR_ENTITAS'])

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!ALLOWED.has(user.role) && !isGlobalRole(user.role)) {
    return NextResponse.json({ error: 'Peran Anda tidak membuka data induk' }, { status: 403 })
  }
  const unscoped = refuseUnscoped(user)
  if (unscoped) return unscoped

  try {
    const requested = (req.nextUrl.searchParams.get('entityId') || '').slice(0, 64) || null
    const entityIds = await resolveEntityScope(await scopeEntityIds(user), requested)
    if (entityIds === 'NOT_FOUND') return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })
    const inEntities = entityIds ? { in: entityIds } : undefined
    // Peran grup yang memilih ?entityId= tidak punya cakupan sendiri (scopeUserIds = null);
    // hitungan buka kunci harus tetap terbatas pada akun di PT yang dipilih.
    const userIds = !entityIds
      ? null
      : ((await scopeUserIds(user)) ??
        (await db.user.findMany({ where: { scopeEntityId: { in: entityIds } }, select: { id: true } })).map((u) => u.id))

    const [entities, divisionsCount, projects, activeProjects, users, activeUsers, templates, byRole, entity, unlockPending, unlockApproved] = await Promise.all([
      db.entity.count({ where: { type: 'PT', isActive: true, ...(inEntities ? { id: inEntities } : {}) } }),
      db.division.count({ where: { isActive: true, ...(inEntities ? { entityId: inEntities } : {}) } }),
      db.project.count({ where: { lifecycle: { not: 'DIARSIPKAN' }, ...(inEntities ? { entityId: inEntities } : {}) } }),
      db.project.count({ where: { lifecycle: 'AKTIF', ...(inEntities ? { entityId: inEntities } : {}) } }),
      db.user.count({ where: inEntities ? { scopeEntityId: inEntities } : {} }),
      db.user.count({ where: { isActive: true, ...(inEntities ? { scopeEntityId: inEntities } : {}) } }),
      db.divisionType.count({ where: { isActive: true } }),
      db.user.groupBy({ by: ['role'], where: { isActive: true, ...(inEntities ? { scopeEntityId: inEntities } : {}) }, _count: { _all: true } }),
      user.scopeEntityId ? db.entity.findUnique({ where: { id: user.scopeEntityId }, select: { name: true } }) : Promise.resolve(null),
      db.unlockRequest.count({ where: { status: 'DIAJUKAN', ...(userIds ? { requestedById: { in: userIds } } : {}) } }),
      db.unlockRequest.count({ where: { status: 'DISETUJUI', ...(userIds ? { requestedById: { in: userIds } } : {}) } }),
    ])

    const [dailyCompliance, memberDivisions] = await Promise.all([
      loadCompliance(entityIds, { canRemind: false }),
      // Pertahankan penanda keanggotaan respons lama, termasuk anggota tanpa proyek.
      db.division.count({ where: {
        isActive: true,
        ...(inEntities ? { entityId: inEntities } : {}),
        members: { some: { isActive: true } },
      } }),
    ])
    const compliance: AdminOverview['compliance'] = {
      hasMembership: memberDivisions > 0,
      divisions: dailyCompliance.divisions.map((d) => ({
        id: d.id,
        name: d.name,
        head: d.head?.name ?? null,
        expected: d.expected,
        reported: d.reported,
        onLeave: d.onLeave,
        missing: d.missing.map(({ id, name, role, lastReportAt }) => ({ id, name, role, lastReportAt })),
      })),
    }

    const body: AdminOverview = {
      scope: entityIds ? 'ENTITY' : 'ALL',
      entityName: entity?.name ?? null,
      masterData: { entities, divisions: divisionsCount, projects, activeProjects, users, activeUsers, templates },
      usersByRole: byRole
        .map((r) => ({ role: r.role, label: ROLE_LABELS[r.role] ?? r.role, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      compliance,
      unlocks: { pending: unlockPending, approved: unlockApproved },
      canManageReminders: !!reminderDesk(user),
    }
    return NextResponse.json(body)
  } catch (err) {
    // [F3-D] Jangan kembalikan err.message mentah (nama tabel/kolom Prisma bisa bocor).
    return serverError(err, 'Data induk belum termuat. Coba lagi.', 'admin/overview GET')
  }
}
