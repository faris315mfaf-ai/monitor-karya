import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { serverError } from '@/lib/api-error'
import { ENTITY_ROLES } from '@/lib/rbac'
import { isoWeekOf, isoWeekStart, startOfWibDay, weeklyDeadlines } from '@/lib/lock'
import {
  SENSITIVE_AUDIT_ACTIONS, groupPanelKind, workloadLevel, type AuditPanel, type SdmPanel, type TeknisPanel,
} from '@/lib/group-panel'
import { technicalStatus } from '@/lib/system-status'

/**
 * [F2-GRUP] GET /api/system/grup — panel khusus di Ringkasan peran grup
 * (docs/design/peran/06–08, docs/fitur/peran-grup.md). Hanya baca.
 *
 *   DIREKTUR_SDM_GA → { kind: 'SDM' }    kepatuhan lintas PT, beban kerja PIC, izin/cuti hari ini
 *   TI, SUPERADMIN  → { kind: 'TEKNIS' } buka kunci, akses, proses otomatis, akun
 *   AUDITOR         → { kind: 'AUDIT' }  laporan terlambat, ringkasan jejak audit, buka kunci yang dijalankan
 *
 * Peran lain 403. Ketiga peran membaca seluruh grup (group:read / akun induk),
 * jadi tidak ada saringan entitas; peran berlingkup PT tidak pernah sampai ke sini.
 */

export const dynamic = 'force-dynamic'

const DAY = 86400000

async function optional<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch {
    return fallback
  }
}

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const kind = groupPanelKind(user.role)
  if (!kind) return NextResponse.json({ error: 'Panel ini untuk peran tingkat grup' }, { status: 403 })
  try {
    const now = new Date()
    if (kind === 'TEKNIS') return NextResponse.json({ kind, ...(await technicalStatus(now)) } satisfies TeknisPanel)
    if (kind === 'SDM') return NextResponse.json(await sdmPanel(now))
    return NextResponse.json(await auditPanel(now))
  } catch (err) {
    return serverError(err, 'Panel peran belum termuat. Coba lagi.', 'system/grup GET')
  }
}

// ------------------------------------------------------------------
// Direksi holding (SDM & GA): kehadiran, beban kerja, kepatuhan lintas PT
// ------------------------------------------------------------------

async function sdmPanel(now: Date): Promise<SdmPanel> {
  const today = startOfWibDay(now)
  const since30 = new Date(today.getTime() - 30 * DAY)
  const weekStart = isoWeekStart(now)
  // Minggu laporan sama dengan /api/ringkasan: minggu berjalan setelah tenggat serah, selain itu minggu lalu.
  const thisWeek = weeklyDeadlines(now)
  const anchor = now >= thisWeek.handoverBy ? now : new Date(weekStart.getTime() - 3 * DAY)
  const wk = isoWeekOf(anchor)
  const wkDl = weeklyDeadlines(anchor)

  const [entities, projects, today_, daily30, divisions, weekly, people, escalations, incidents, pics, tasks, away] = await Promise.all([
    db.entity.findMany({
      where: { isActive: true, type: { in: ['PT', 'UNIT', 'SUB_HOLDING'] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    db.project.groupBy({ by: ['entityId'], where: { lifecycle: 'AKTIF' }, _count: { _all: true } }),
    db.dailyProjectReport.groupBy({ by: ['entityId'], where: { reportDate: today, submittedAt: { not: null } }, _count: { _all: true } }),
    db.dailyProjectReport.groupBy({
      by: ['entityId', 'isLate'],
      where: { reportDate: { gte: since30, lt: today }, submittedAt: { not: null } },
      _count: { _all: true },
    }),
    db.division.groupBy({ by: ['entityId'], where: { isActive: true }, _count: { _all: true } }),
    db.weeklyDivisionReport.groupBy({
      by: ['entityId', 'isLate'],
      where: { isoYear: wk.isoYear, isoWeek: wk.isoWeek, submittedAt: { not: null } },
      _count: { _all: true },
    }),
    db.user.groupBy({
      by: ['scopeEntityId'],
      where: { isActive: true, role: { in: [...ENTITY_ROLES] }, scopeEntityId: { not: null } },
      _count: { _all: true },
    }),
    db.escalation.groupBy({ by: ['entityId'], where: { status: { in: ['DIAJUKAN', 'DITINJAU'] } }, _count: { _all: true } }),
    db.lateIncident.groupBy({ by: ['entityId'], where: { createdAt: { gte: since30 } }, _count: { _all: true } }),
    db.project.groupBy({ by: ['picUserId'], where: { lifecycle: 'AKTIF', picUserId: { not: null } }, _count: { _all: true } }),
    db.task.groupBy({
      by: ['picUserId', 'status'],
      where: { picUserId: { not: null }, status: { not: 'SELESAI' }, workDate: { gte: weekStart }, project: { lifecycle: 'AKTIF' } },
      _count: { _all: true },
    }),
    optional(
      db.attendance.findMany({
        where: { date: today, status: { notIn: ['HADIR', 'TERLAMBAT'] }, user: { isActive: true } }, // [F2-DIREKTUR] terlambat = hadir
        select: { id: true, status: true, note: true, user: { select: { name: true, scopeEntityId: true } } },
        orderBy: { user: { name: 'asc' } },
        take: 50,
      }),
      null
    ),
  ])

  const count = (rows: { entityId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.entityId === id)?._count._all ?? 0
  const codeOf = new Map(entities.map((e) => [e.id, e.code]))

  const rows = entities
    .map((e) => {
      const d30 = daily30.filter((r) => r.entityId === e.id)
      const total30 = d30.reduce((a, r) => a + r._count._all, 0)
      const late30 = d30.filter((r) => r.isLate).reduce((a, r) => a + r._count._all, 0)
      const wkRows = weekly.filter((r) => r.entityId === e.id)
      return {
        id: e.id,
        name: e.name,
        code: e.code,
        activeProjects: count(projects, e.id),
        reportedToday: count(today_, e.id),
        onTime30: total30 - late30,
        total30,
        divisions: count(divisions, e.id),
        weeklyIn: wkRows.reduce((a, r) => a + r._count._all, 0),
        weeklyLate: wkRows.filter((r) => r.isLate).reduce((a, r) => a + r._count._all, 0),
        people: people.find((p) => p.scopeEntityId === e.id)?._count._all ?? 0,
        away: away ? away.filter((a) => a.user.scopeEntityId === e.id).length : null,
        openEscalations: count(escalations, e.id),
        lateIncidents30: count(incidents, e.id),
      }
    })
    .filter((r) => r.activeProjects > 0 || r.divisions > 0 || r.people > 0)

  // Beban kerja PIC: proyek aktif + tugas terbuka minggu ini.
  const load = new Map<string, { projects: number; open: number; blocked: number }>()
  for (const p of pics) {
    if (!p.picUserId) continue
    load.set(p.picUserId, { projects: p._count._all, open: 0, blocked: 0 })
  }
  for (const t of tasks) {
    if (!t.picUserId) continue
    const e = load.get(t.picUserId) ?? { projects: 0, open: 0, blocked: 0 }
    e.open += t._count._all
    if (t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN') e.blocked += t._count._all
    load.set(t.picUserId, e)
  }
  const ranked = [...load.entries()]
    .sort((a, b) => b[1].projects - a[1].projects || b[1].open - a[1].open)
    .slice(0, 8)
  const names = ranked.length
    ? await db.user.findMany({ where: { id: { in: ranked.map(([id]) => id) } }, select: { id: true, name: true, scopeEntityId: true } })
    : []
  const workload = ranked.map(([id, l]) => {
    const u = names.find((n) => n.id === id)
    return {
      id,
      name: u?.name ?? 'Akun dihapus',
      entityCode: u?.scopeEntityId ? codeOf.get(u.scopeEntityId) ?? null : null,
      activeProjects: l.projects,
      openTasks: l.open,
      blockedTasks: l.blocked,
      level: workloadLevel(l.projects, l.open),
    }
  })
  const all = [...load.values()]
  const picCount = all.filter((l) => l.projects > 0).length

  return {
    kind: 'SDM',
    week: { isoYear: wk.isoYear, isoWeek: wk.isoWeek, label: `M${wk.isoWeek}`, handoverBy: wkDl.handoverBy.toISOString() },
    entities: rows,
    workload,
    workloadSummary: {
      pics: picCount,
      avgProjects: picCount ? Math.round((all.reduce((a, l) => a + l.projects, 0) / picCount) * 10) / 10 : 0,
      overloaded: all.filter((l) => workloadLevel(l.projects, l.open) !== 'on').length,
    },
    awayToday: away
      ? away.map((a) => ({
          id: a.id,
          name: a.user.name,
          entityCode: a.user.scopeEntityId ? codeOf.get(a.user.scopeEntityId) ?? null : null,
          status: a.status,
          note: a.note ? a.note.slice(0, 140) : null,
        }))
      : null,
  }
}

// ------------------------------------------------------------------
// Auditor: laporan terlambat, ringkasan jejak audit, buka kunci yang dijalankan
// ------------------------------------------------------------------

async function auditPanel(now: Date): Promise<AuditPanel> {
  const today = startOfWibDay(now)
  const since30 = new Date(today.getTime() - 30 * DAY)
  const since8w = new Date(isoWeekStart(now).getTime() - 7 * 7 * DAY)
  const since24h = new Date(now.getTime() - DAY)
  const since7d = new Date(now.getTime() - 7 * DAY)

  const [entities, daily, weeklyLate, recentDaily, recentWeekly, last24h, last7d, total, sensitive7d, top, unlocks] = await Promise.all([
    db.entity.findMany({ where: { type: { not: 'HOLDING' } }, select: { id: true, name: true, code: true } }),
    db.dailyProjectReport.groupBy({
      by: ['entityId', 'isLate'],
      where: { reportDate: { gte: since30 }, submittedAt: { not: null } },
      _count: { _all: true },
    }),
    db.weeklyDivisionReport.groupBy({ by: ['entityId'], where: { isLate: true, periodStart: { gte: since8w } }, _count: { _all: true } }),
    db.dailyProjectReport.findMany({
      where: { isLate: true, reportDate: { gte: since30 } },
      orderBy: { reportDate: 'desc' },
      take: 6,
      select: { id: true, reportDate: true, submittedAt: true, project: { select: { name: true } }, entity: { select: { code: true } } },
    }),
    db.weeklyDivisionReport.findMany({
      where: { isLate: true, periodStart: { gte: since8w } },
      orderBy: { periodStart: 'desc' },
      take: 4,
      select: { id: true, isoWeek: true, submittedAt: true, division: { select: { name: true } }, entity: { select: { code: true } } },
    }),
    db.auditLog.count({ where: { at: { gte: since24h } } }),
    db.auditLog.count({ where: { at: { gte: since7d } } }),
    db.auditLog.count(),
    db.auditLog.count({ where: { at: { gte: since7d }, action: { in: [...SENSITIVE_AUDIT_ACTIONS] } } }),
    db.auditLog.groupBy({ by: ['action'], where: { at: { gte: since7d } }, _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 5 }),
    db.unlockRequest.findMany({
      where: { status: 'DIEKSEKUSI', executedAt: { gte: since30 } },
      orderBy: { executedAt: 'desc' },
      take: 5,
      select: {
        id: true, targetType: true, reason: true, executedAt: true,
        requestedBy: { select: { name: true } }, executedBy: { select: { name: true } },
      },
    }),
  ])
  const executed = await db.unlockRequest.count({ where: { status: 'DIEKSEKUSI', executedAt: { gte: since30 } } })

  const byEntity = entities
    .map((e) => {
      const d = daily.filter((r) => r.entityId === e.id)
      return {
        id: e.id,
        name: e.name,
        code: e.code,
        dailyLate: d.filter((r) => r.isLate).reduce((a, r) => a + r._count._all, 0),
        dailyTotal: d.reduce((a, r) => a + r._count._all, 0),
        weeklyLate: weeklyLate.find((w) => w.entityId === e.id)?._count._all ?? 0,
      }
    })
    .filter((e) => e.dailyTotal > 0 || e.weeklyLate > 0)
    .sort((a, b) => b.dailyLate + b.weeklyLate - (a.dailyLate + a.weeklyLate))

  const fmtDay = (d: Date) => d.toISOString()
  const recent = [
    ...recentDaily.map((r) => ({
      id: r.id,
      kind: 'HARIAN' as const,
      label: r.project.name,
      entityCode: r.entity.code,
      period: fmtDay(r.reportDate),
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    })),
    ...recentWeekly.map((r) => ({
      id: r.id,
      kind: 'MINGGUAN' as const,
      label: `Divisi ${r.division.name} · M${r.isoWeek}`,
      entityCode: r.entity.code,
      period: r.submittedAt ? r.submittedAt.toISOString() : '',
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    })),
  ]
    .sort((a, b) => (b.submittedAt ?? b.period).localeCompare(a.submittedAt ?? a.period))
    .slice(0, 8)

  return {
    kind: 'AUDIT',
    late: {
      daily30: byEntity.reduce((a, e) => a + e.dailyLate, 0),
      dailyTotal30: byEntity.reduce((a, e) => a + e.dailyTotal, 0),
      weeklyLate8w: byEntity.reduce((a, e) => a + e.weeklyLate, 0),
      byEntity: byEntity.slice(0, 8),
      recent,
    },
    audit: {
      last24h,
      last7d,
      total,
      sensitive7d,
      topActions: top.map((t) => ({ action: t.action, count: t._count._all })),
    },
    unlocks30: {
      executed,
      items: unlocks.map((u) => ({
        id: u.id,
        targetType: u.targetType,
        reason: u.reason.slice(0, 200),
        executedAt: u.executedAt ? u.executedAt.toISOString() : null,
        requestedBy: u.requestedBy?.name ?? null,
        executedBy: u.executedBy?.name ?? null,
      })),
    },
  }
}
