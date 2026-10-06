import { entities, entityKpis, divisions, groupRoles, people } from './mock-catalog'
import { summaryFor } from './mock-summary'
import { ROLE_CAPABILITIES } from '@/lib/rbac'
import { historyDays, reportHistory, onTime30 } from './mock-history'
import { dailyProjects, activeUnlock } from './mock-laporan'
import { outputSnapshots } from './mock-pic'
import { projectSnapshots, weeklySnapshots } from './mock-proyek'
import { unlockItems } from './mock-laporan'
import { dailyCountdown, isDailyLocked, weeklyDeadlines, wibDateKey } from '@/lib/lock'
/**
 * [F2-GRUP] Data contoh /pratinjau untuk peran grup (Direksi holding SDM & GA,
 * Tim TI, Super Admin, Auditor): /api/system, /api/system/grup,
 * /api/audit-logs, /api/entities, /api/entities/[id], serta antrean buka kunci
 * untuk peran grup. Tanpa basis data; perubahan hanya hidup
 * selama halaman terbuka.
 */

import { REMINDER_DEFAULTS, REMINDER_KINDS } from '@/lib/admin-meta'
import type { AuditPanel, ReminderMatrixRow, SdmPanel, TeknisPanel } from '@/lib/group-panel'

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const H = 3600000
const ago = (h: number) => new Date(Date.now() - h * H).toISOString()

const PTS = entities
// ------------------------------------------------------------------
// Panel Ringkasan
// ------------------------------------------------------------------

const cron = (): TeknisPanel['cron'] => [
  { job: 'reminder-rules', label: 'Pengingat otomatis', schedule: 'Tiap 30 menit, 07.00–18.00 WIB hari kerja', lastAt: ago(0.4), health: 'on' },
  { job: 'remind-divisions', label: 'Pengingat divisi mingguan', schedule: '09.00 WIB hari kerja', lastAt: ago(3), health: 'on' },
  { job: 'kpi-snapshot', label: 'Cuplikan KPI', schedule: '17.30 WIB setiap hari', lastAt: ago(41), health: 'late' },
]

const teknis = (): TeknisPanel => ({
  kind: 'TEKNIS',
  unlocks: {
    waitingApproval: unlockItems.filter((u) => u.status === 'DIAJUKAN').length,
    waitingExecution: unlockItems.filter((u) => u.status === 'DISETUJUI').length,
    activeNow: unlockItems.filter((u) => Boolean(activeUnlock(u.targetId))).length,
  },
  accessPending: 2,
  cron: cron(),
  reminders: { enabled: matrix.flatMap((m) => m.rules).filter((r) => r.enabled).length, total: matrix.flatMap((m) => m.rules).length, lastRunAt: ago(0.4) },
  accounts: { active: people.length, inactive: 0, neverLoggedIn: people.length, noPassword: 0, mustChange: 0 },
  notifications: { failed7d: 1 },
})

function audit(): AuditPanel {
  const dates = historyDays(30).filter((d) => Date.now() - Date.parse(d) < 30 * 24 * H)
  const reports = projectSnapshots('AUDITOR').filter((p) => p.lifecycle === 'AKTIF').flatMap((p) => reportHistory(p.id, dates).filter((r) => r.submitted).map((r) => ({ ...r, project: p })))
  const weekly = weeklySnapshots('AUDITOR')
  const late = reports.filter((r) => r.isLate)
  const executed = unlockItems.filter((u) => u.executedAt)
  return {
    kind: 'AUDIT',
    late: { daily30: late.length, dailyTotal30: reports.length, weeklyLate8w: weekly.filter((w) => w.isLate).length,
      byEntity: PTS.map((e) => ({ ...e, dailyLate: late.filter((r) => r.project.entityId === e.id).length, dailyTotal: reports.filter((r) => r.project.entityId === e.id).length, weeklyLate: weekly.filter((w) => w.entityId === e.id && w.isLate).length })),
      recent: late.slice(-10).reverse().map((r) => ({ id: `${r.project.id}:${r.key}`, kind: 'HARIAN', label: r.project.name, entityCode: r.project.entityCode, period: r.date, submittedAt: r.submittedAt! })),
    },
    audit: { last24h: auditRows.filter((r) => Date.now() - Date.parse(r.at) < 24 * H).length, last7d: auditRows.filter((r) => Date.now() - Date.parse(r.at) < 7 * 24 * H).length, total: auditRows.length, sensitive7d: auditRows.filter((r) => r.action.includes('UNLOCK')).length, topActions: [...new Set(auditRows.map((r) => r.action))].map((action) => ({ action, count: auditRows.filter((r) => r.action === action).length })).sort((a, b) => b.count - a.count) },
    unlocks30: { executed: executed.length, items: executed.map((u) => ({ id: u.id, targetType: u.targetType, reason: u.reason, executedAt: u.executedAt!, requestedBy: u.requestedBy?.name ?? 'Pengguna', executedBy: u.executedBy?.name ?? 'Tim TI' })) },
  }
}

// ------------------------------------------------------------------
// Buka kunci (peran grup: setujui / jalankan)
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Konsol Sistem & akses
// ------------------------------------------------------------------

const matrix: ReminderMatrixRow[] = PTS.map((pt, i) => ({
  entityId: pt.id,
  entityName: pt.name,
  entityCode: pt.code,
  rules: REMINDER_KINDS.map((kind) => ({
    kind,
    enabled: i === 1 && kind === 'HARIAN' ? false : REMINDER_DEFAULTS[kind].enabled,
    time: REMINDER_DEFAULTS[kind].time,
    weekday: REMINDER_DEFAULTS[kind].weekday,
    days: REMINDER_DEFAULTS[kind].params.days ?? null,
    lastRunAt: kind === 'HARIAN' && i !== 1 ? ago(20) : kind === 'MINGGUAN' ? ago(100) : null,
  })),
}))

function system() {
  const t = teknis()
  return {
    technical: { ...t, kind: undefined },
    reminders: matrix,
    access: {
      byRole: Object.entries(ROLE_CAPABILITIES).map(([role, capabilities]) => ({ role, count: people.filter((p) => p.role === role).length, capabilities: capabilities.length })),
      inactiveUsers: people.filter((p) => !p.isActive).length,
      noPassword: 0,
      users: people.map((p) => ({ ...p, lastLoginAt: null, hasPassword: true })),
    },
    locking: {
      dailyCutoff: '17.00 WIB',
      dailyLocked: isDailyLocked(new Date()),
      dailyCountdown: dailyCountdown(),
      lockedToday: 0,
      weeklyHandoverBy: weeklyDeadlines(new Date()).handoverBy.toISOString(),
      weeklyLockAt: weeklyDeadlines(new Date()).lockAt.toISOString(),
      pendingUnlocks: t.unlocks.waitingApproval + t.unlocks.waitingExecution,
    },
    notifications: { sent: 3120, failed: 1 },
    data: { entities: entities.length, projects: projectSnapshots('SUPERADMIN').length, divisions: divisions.length, dailyReports: dailyProjects().filter((p) => p.report).length, weeklyReports: weeklySnapshots('SUPERADMIN').length, evidence: dailyProjects().reduce((n, p) => n + (p.report?.evidenceCount ?? 0), 0) + outputSnapshots('SUPERADMIN').reduce((n, o) => n + o.evidenceCount, 0), auditLogs: auditRows.length },
    recentAudit: auditRows.slice(0, 10).map((a) => ({ id: a.id, action: a.action, at: a.at, actorName: a.actor?.name ?? 'Sistem', actorRole: a.actor?.role ?? null, targetType: a.targetType })),
  }
}

// ------------------------------------------------------------------
// Log aktivitas
// ------------------------------------------------------------------

const actors = ['ADMIN_PT', 'PIC_PROYEK', 'KEPALA_DIVISI', 'DIREKTUR_SDM_GA', 'TI'].map((role) => people.find((p) => p.id === `pratinjau-${role}`)!)
const pattern: [string, string, number][] = [
  ['SUBMIT_DAILY_REPORT', 'DAILY_REPORT', 1],
  ['FORWARD_DAILY_REPORT', 'DAILY_REPORT', 0],
  ['UPDATE_TASK', 'TASK', 1],
  ['SUBMIT_WEEKLY_REPORT', 'WEEKLY_REPORT', 2],
  ['APPROVE_UNLOCK', 'DAILY_REPORT', 3],
  ['UNLOCK_EXECUTE', 'DAILY_REPORT', 4],
  ['CREATE_ESCALATION', 'ESCALATION', 2],
  ['LOGIN', 'USER', 0],
  ['READ_WEEKLY_REPORT', 'WEEKLY_REPORT', 3],
  ['AUTO_REMINDER', 'REMINDER_RULE', -1],
]
const auditRows = Array.from({ length: 46 }, (_, i) => {
  const [action, targetType, who] = pattern[i % pattern.length]
  const actor = who < 0 ? null : actors[who]
  return {
    id: `al-${i}`,
    actorId: actor?.id ?? null,
    actor,
    action,
    targetType,
    targetId: `${targetType.toLowerCase()}-${i}`,
    beforeData: action.startsWith('UPDATE') ? { status: 'BERJALAN', progressPct: 40 } : null,
    afterData: action.startsWith('UPDATE') ? { status: 'SELESAI', progressPct: 100 } : action === 'AUTO_REMINDER' ? { message: 'Pengingat laporan harian ke 3 PIC' } : null,
    ip: actor ? '10.0.0.12' : null,
    userAgent: actor ? 'Mozilla/5.0 (Macintosh)' : null,
    at: ago(i * 2.5 + 0.2),
  }
})

function auditLogs(url: string, role: string) {
  const sp = new URL(url, 'http://x').searchParams
  const page = Math.max(1, Number(sp.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(sp.get('pageSize') || 20)))
  const from = sp.get('dateFrom')
  const to = sp.get('dateTo')
  const rows = auditRows.filter(
    (r) =>
      (!sp.get('action') || r.action === sp.get('action')) &&
      (!sp.get('targetType') || r.targetType === sp.get('targetType')) &&
      (!sp.get('role') || r.actor?.role === sp.get('role')) &&
      (!from || r.at >= `${from}T00:00:00`) &&
      (!to || r.at <= `${to}T23:59:59`)
  )
  return json({
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    canExport: role !== 'ADMIN_PT' && role !== 'PIC_PROYEK' && role !== 'KEPALA_DIVISI',
  })
}

// ------------------------------------------------------------------
// Entitas
// ------------------------------------------------------------------

function entityTree(role: string) {
  return { periodKey: wibDateKey(new Date()).slice(0, 7), tree: [{ id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', type: 'HOLDING', region: 'Jakarta', kpi: null, children: entities.filter((e) => groupRoles.includes(role) || e.id === 'e1').map((e) => ({ ...e, type: 'PT', kpi: entityKpis[e.id], children: [] })) }] }
}
function entityDetail(id: string, role: string) {
  const pt = PTS.find((e) => e.id === id)
  if ((!pt && id !== 'h') || (!groupRoles.includes(role) && id !== 'e1')) return json({ error: 'Entitas tidak ditemukan' }, 404)
  const e = pt ?? { id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', region: 'Jakarta' }
  const projects = projectSnapshots(role).filter((p) => p.entityId === id)
  return json({
    entity: { ...e, type: pt ? 'PT' : 'HOLDING', path: pt ? `/h/${id}/` : '/h/', parentId: pt ? 'h' : null, isActive: true },
    parentChain: pt ? [{ id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', type: 'HOLDING', region: 'Jakarta' }] : [],
    children: pt ? [] : PTS.map((p) => ({ ...p, type: 'PT', isActive: true })),
    divisions: divisions.filter((d) => d.entityId === id).map((d) => ({ ...d, isActive: true, divisionType: { id: d.id, code: d.id, name: d.name } })),
    projects, adminAppointments: [], currentKpi: pt ? { ...entityKpis[id], totalProjects: projects.length, activeProjects: projects.filter((p) => p.lifecycle === 'AKTIF').length } : null,
    recentDailyReports: [], recentWeeklyReports: [],
  })
}
function sdmData(): SdmPanel {
  const s = summaryFor('DIREKTUR_SDM_GA')
  return { kind: 'SDM', week: s.reportWeek, entities: entities.map((e) => {
    const projects = s.projects.filter((p) => p.entityId === e.id)
    const divs = s.divisions.filter((d) => d.entityId === e.id)
    return { ...e, activeProjects: projects.length, reportedToday: projects.filter((p) => p.reportedToday).length, onTime30: onTime30('DIREKTUR_SDM_GA', e.id).pct, total30: onTime30('DIREKTUR_SDM_GA', e.id).total, divisions: divs.length, weeklyIn: divs.filter((d) => d.weekly.submittedAt).length, weeklyLate: 0, people: people.filter((p) => p.scopeEntityId === e.id).length, away: 0, openEscalations: 0, lateIncidents30: audit().late.byEntity.find((a) => a.id === e.id)?.dailyLate ?? 0 }
  }), workload: people.filter((p) => p.role === 'PIC_PROYEK').map((p) => ({ id: p.id, name: p.name, entityCode: entities.find((e) => e.id === p.scopeEntityId)?.code ?? '', activeProjects: s.projects.filter((x) => x.picUserId === p.id).length, openTasks: 0, blockedTasks: 0, level: 'on' })), workloadSummary: { pics: people.filter((p) => p.role === 'PIC_PROYEK').length, avgProjects: s.projects.length / people.filter((p) => p.role === 'PIC_PROYEK').length, overloaded: 0 }, awayToday: [] }
}

export function handle(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  if (path === '/api/system/grup') {
    if (role === 'DIREKTUR_SDM_GA') return json(sdmData())
    if (role === 'AUDITOR') return json(audit())
    if (role === 'TI' || role === 'SUPERADMIN') return json(teknis())
    return json({ error: 'Panel ini untuk peran tingkat grup' }, 403)
  }
  if (path === '/api/system') {
    return role === 'TI' || role === 'SUPERADMIN' ? json(system()) : json({ error: 'Konsol sistem hanya untuk Tim TI dan Super Admin' }, 403)
  }
  if (path === '/api/audit-logs' && method === 'GET') return auditLogs(url, role)
  if (path === '/api/entities' && method === 'GET') return json(entityTree(role))
  if (path.startsWith('/api/entities/') && method === 'GET') return entityDetail(decodeURIComponent(path.slice('/api/entities/'.length)), role)
  // Antrean di bawah ini hanya untuk peran grup; peran lain tetap memakai data area masing-masing.
  return null
}
