import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isGlobalRole, refuseUnscoped, requireApiUser, scopeEntityIds, scopeUserIds } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/constants'
import { startOfWibDay } from '@/lib/lock'
import { reminderDesk } from '@/lib/reminder-rules'
import type { AdminOverview } from '@/lib/admin-meta'

/**
 * Ringkasan Admin PT (6 Okt 2026, 04-admin-pt.md): hitungan data induk,
 * pengguna per peran, kepatuhan laporan harian per orang di tiap divisi, dan
 * jumlah buka kunci. Admin PT / Direktur entitas: subtree PT-nya; peran grup:
 * seluruh grup atau ?entityId=.
 *
 * Kepatuhan per orang memakai keanggotaan divisi (User.divisionId, area P2-B).
 * Yang dihitung "wajib lapor" adalah anggota aktif yang memegang proyek aktif
 * sebagai PIC; ia "sudah lapor" bila semua proyeknya sudah terkirim hari ini.
 * Anggota yang tercatat CUTI/SAKIT/IZIN hari ini tidak masuk penyebut.
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
    let entityIds = await scopeEntityIds(user)
    const requested = req.nextUrl.searchParams.get('entityId')
    if (entityIds === null && requested) {
      const e = await db.entity.findUnique({ where: { id: requested }, select: { path: true } })
      if (!e) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })
      entityIds = (await db.entity.findMany({ where: { path: { startsWith: e.path } }, select: { id: true } })).map((x) => x.id)
    }
    const inEntities = entityIds ? { in: entityIds } : undefined
    // Peran grup yang memilih ?entityId= tidak punya cakupan sendiri (scopeUserIds = null);
    // hitungan buka kunci harus tetap terbatas pada akun di PT yang dipilih.
    const userIds = !entityIds
      ? null
      : ((await scopeUserIds(user)) ??
        (await db.user.findMany({ where: { scopeEntityId: { in: entityIds } }, select: { id: true } })).map((u) => u.id))
    const today = startOfWibDay(new Date())

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

    // ---- Kepatuhan per orang ----
    const divisions = await db.division.findMany({
      where: { isActive: true, ...(inEntities ? { entityId: inEntities } : {}) },
      select: {
        id: true,
        name: true,
        headUser: { select: { name: true } },
        members: { where: { isActive: true }, select: { id: true, name: true, role: true } },
      },
      orderBy: { name: 'asc' },
    })
    const memberIds = divisions.flatMap((d) => d.members.map((m) => m.id))
    const hasMembership = memberIds.length > 0
    const [picProjects, leave] = hasMembership
      ? await Promise.all([
          db.project.findMany({
            where: { lifecycle: 'AKTIF', picUserId: { in: memberIds } },
            select: {
              id: true,
              picUserId: true,
              dailyReports: { where: { submittedAt: { not: null } }, orderBy: { reportDate: 'desc' }, take: 1, select: { reportDate: true, submittedAt: true } },
            },
          }),
          db.attendance.findMany({ where: { userId: { in: memberIds }, date: today, status: { in: ['CUTI', 'SAKIT', 'IZIN'] } }, select: { userId: true } }),
        ])
      : [[], []]
    const onLeave = new Set(leave.map((l) => l.userId))
    const projectsOf = new Map<string, { reportedToday: boolean; last: Date | null }[]>()
    for (const p of picProjects) {
      const last = p.dailyReports[0]
      const list = projectsOf.get(p.picUserId!) ?? []
      list.push({ reportedToday: !!last && last.reportDate.getTime() === today.getTime(), last: last?.submittedAt ?? null })
      projectsOf.set(p.picUserId!, list)
    }

    const compliance: AdminOverview['compliance'] = {
      hasMembership,
      divisions: divisions.map((d) => {
        let expected = 0
        let reported = 0
        let leaveCount = 0
        const missing: AdminOverview['compliance']['divisions'][number]['missing'] = []
        for (const m of d.members) {
          const mine = projectsOf.get(m.id)
          if (!mine?.length) continue
          if (onLeave.has(m.id)) {
            leaveCount += 1
            continue
          }
          expected += 1
          if (mine.every((x) => x.reportedToday)) reported += 1
          else {
            const last = mine.map((x) => x.last).filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0]
            missing.push({ id: m.id, name: m.name, role: ROLE_LABELS[m.role] ?? m.role, lastReportAt: last?.toISOString() ?? null })
          }
        }
        return { id: d.id, name: d.name, head: d.headUser?.name ?? null, expected, reported, onLeave: leaveCount, missing }
      }),
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Data induk belum termuat' }, { status: 500 })
  }
}
