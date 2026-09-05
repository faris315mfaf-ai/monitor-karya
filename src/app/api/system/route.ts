import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { ROLE_CAPABILITIES, can } from '@/lib/rbac'
import { dailyCountdown, isDailyLocked, startOfWibDay, weeklyDeadlines } from '@/lib/lock'

/**
 * The system administrator's console: who has access, whether the locking and
 * notification machinery is behaving, and how much data is in the system.
 */
export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'users:manage')) {
    return NextResponse.json({ error: 'Hanya Pengelola Sistem IT' }, { status: 403 })
  }

  const today = startOfWibDay(new Date())
  const deadlines = weeklyDeadlines(new Date())

  const [
    usersByRole,
    inactiveUsers,
    noPassword,
    totals,
    notifFailed,
    notifSent,
    lockedToday,
    pendingUnlocks,
    lastAudit,
  ] = await Promise.all([
    db.user.groupBy({ by: ['role'], _count: { _all: true }, where: { isActive: true } }),
    db.user.count({ where: { isActive: false } }),
    db.user.count({ where: { passwordHash: null } }),
    Promise.all([
      db.entity.count(),
      db.project.count(),
      db.division.count(),
      db.dailyProjectReport.count(),
      db.weeklyDivisionReport.count(),
      db.evidence.count(),
      db.auditLog.count(),
    ]),
    db.notificationLog.count({ where: { status: 'FAILED' } }),
    db.notificationLog.count({ where: { status: 'SENT' } }),
    db.dailyProjectReport.count({ where: { reportDate: today, isLocked: true } }),
    db.unlockRequest.count({ where: { status: { in: ['DIAJUKAN', 'DISETUJUI'] } } }),
    db.auditLog.findMany({
      take: 10,
      orderBy: { at: 'desc' },
      include: { actor: { select: { name: true, role: true } } },
    }),
  ])

  const [entities, projects, divisions, dailyReports, weeklyReports, evidence, auditLogs] = totals

  const recentUsers = await db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      lastLoginAt: true,
      passwordHash: true,
      scopeEntityId: true,
    },
    orderBy: [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }],
    take: 25,
  })

  return NextResponse.json({
    access: {
      byRole: usersByRole
        .map((r) => ({
          role: r.role,
          count: r._count._all,
          capabilities: ROLE_CAPABILITIES[r.role]?.length ?? 0,
        }))
        .sort((a, b) => b.count - a.count),
      inactiveUsers,
      noPassword,
      users: recentUsers.map(({ passwordHash, ...u }) => ({
        ...u,
        hasPassword: Boolean(passwordHash),
      })),
    },
    locking: {
      dailyCutoff: '17:00 WIB',
      dailyLockAt: new Date(today.getTime() + 17 * 3600 * 1000).toISOString(),
      dailyLocked: isDailyLocked(today),
      dailyCountdown: dailyCountdown(),
      lockedToday,
      weeklyHandoverBy: deadlines.handoverBy.toISOString(),
      weeklyLockAt: deadlines.lockAt.toISOString(),
      pendingUnlocks,
    },
    notifications: { sent: notifSent, failed: notifFailed },
    data: { entities, projects, divisions, dailyReports, weeklyReports, evidence, auditLogs },
    recentAudit: lastAudit.map((a) => ({
      id: a.id,
      action: a.action,
      at: a.at,
      actorName: a.actor?.name ?? 'Sistem',
      actorRole: a.actor?.role ?? null,
      targetType: a.targetType,
    })),
  })
}
