import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { ROLE_CAPABILITIES, can } from '@/lib/rbac'
import { serverError } from '@/lib/api-error'
import { reminderMatrix, technicalStatus } from '@/lib/system-status'
import { WEEKLY_CUTOFF_HOUR, startOfWibDay, weeklyDeadlines } from '@/lib/lock'
import {
  dailyCountdownWith,
  dailyCutoffLabelWith,
  dailyLockInstantWith,
  getReportSettings,
  isDailyLockedWith,
  type ReportSettingsData,
} from '@/lib/report-settings'

/**
 * The system administrator's console: who has access, whether the locking and
 * notification machinery is behaving, and how much data is in the system.
 *
 * [F2-GRUP] Ditambah `technical` (antrean buka kunci, permintaan akses, proses
 * otomatis terakhir, kesehatan akun) dan `reminders` (sakelar per PT) untuk
 * tab Sistem & akses Tim TI / Super Admin (07-ti.md).
 */
export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'users:manage')) {
    return NextResponse.json({ error: 'Konsol sistem hanya untuk Tim TI dan Super Admin' }, { status: 403 })
  }
  try {
    return NextResponse.json(await consoleData())
  } catch (err) {
    return serverError(err, 'Konsol sistem belum termuat. Coba lagi.', 'system GET')
  }
}

/**
 * [T13] Kunci konsol TI mengikuti aturan tiap PT (ReportSettings), bukan env 17.00.
 * Konsol ini lintas PT, jadi ringkasan lama (`dailyCutoff`, `dailyLocked`,
 * `dailyCountdown`, `weekly*`) dihitung dari seluruh PT aktif: aturan seragam
 * tampil apa adanya; bila beragam, label "beragam per PT", `dailyLocked` hanya
 * benar bila SEMUA PT terkunci, hitung mundur ke kunci terdekat, dan tenggat
 * mingguan yang paling awal. Rincian tiap PT ada di `perEntity` (tambahan baru).
 */
async function lockingSummary(now: Date, today: Date) {
  const entities = await db.entity.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  })
  const rows: { id: string; name: string; code: string; rpt: ReportSettingsData }[] = []
  for (const e of entities) rows.push({ ...e, rpt: await getReportSettings(e.id) })
  if (rows.length === 0) rows.push({ id: '', name: '', code: '', rpt: await getReportSettings(null) })

  const sameRule = (a: ReportSettingsData, b: ReportSettingsData) =>
    a.dailyCutoffHour === b.dailyCutoffHour && a.dailyOpen === b.dailyOpen
  const uniform = rows.every((r) => sameRule(r.rpt, rows[0].rpt))
  const lockedFlags = rows.map((r) => isDailyLockedWith(r.rpt.dailyCutoffHour, r.rpt.dailyOpen, today, now))
  const allLocked = lockedFlags.every(Boolean)
  // Titik kunci terdekat di antara PT yang masih terbuka (semua terkunci: bebas).
  const open = rows.filter((_, i) => !lockedFlags[i])
  const nearest = (open.length > 0 ? open : rows).reduce((a, b) =>
    dailyLockInstantWith(b.rpt, today) < dailyLockInstantWith(a.rpt, today) ? b : a
  )
  const weekly = rows.map((r) => weeklyDeadlines(now, r.rpt.weeklyCutoffHour ?? WEEKLY_CUTOFF_HOUR))
  const earliest = (pick: 'handoverBy' | 'lockAt') =>
    weekly.reduce((a, b) => (b[pick] < a[pick] ? b : a))[pick]

  return {
    dailyCutoff: uniform ? dailyCutoffLabelWith(rows[0].rpt) : 'beragam per PT',
    dailyLockAt: dailyLockInstantWith(nearest.rpt, today).toISOString(),
    dailyLocked: allLocked,
    dailyCountdown: dailyCountdownWith(nearest.rpt, now),
    weeklyHandoverBy: earliest('handoverBy').toISOString(),
    weeklyLockAt: earliest('lockAt').toISOString(),
    perEntity: entities.length === 0 ? [] : rows.map((r, i) => ({
      entityId: r.id,
      name: r.name,
      code: r.code,
      dailyCutoff: r.rpt.dailyOpen ? dailyCutoffLabelWith(r.rpt) : 'ditutup',
      dailyOpen: r.rpt.dailyOpen,
      dailyLockAt: dailyLockInstantWith(r.rpt, today).toISOString(),
      dailyLocked: lockedFlags[i],
      workingDays: r.rpt.workingDays,
      weeklyOpen: r.rpt.weeklyOpen,
      weeklyHandoverBy: weekly[i].handoverBy.toISOString(),
      weeklyLockAt: weekly[i].lockAt.toISOString(),
    })),
  }
}

async function consoleData() {

  const nowDate = new Date()
  const today = startOfWibDay(nowDate)
  const lockingInfo = await lockingSummary(nowDate, today)

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
    technical,
    reminders,
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
    technicalStatus(),
    reminderMatrix(),
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

  return {
    technical,
    reminders,
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
      ...lockingInfo,
      lockedToday,
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
  }
}
