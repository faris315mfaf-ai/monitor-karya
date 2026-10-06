/**
 * [F2-GRUP] Data contoh /pratinjau untuk peran grup (Direksi holding SDM & GA,
 * Tim TI, Super Admin, Auditor): /api/system, /api/system/grup,
 * /api/audit-logs, /api/entities, /api/entities/[id], serta antrean buka kunci
 * untuk peran grup. Tanpa basis data; perubahan hanya hidup
 * selama halaman terbuka.
 */

import { REMINDER_DEFAULTS, REMINDER_KINDS, type UnlockItem } from '@/lib/admin-meta'
import type { AuditPanel, ReminderMatrixRow, SdmPanel, TeknisPanel } from '@/lib/group-panel'

const GROUP = ['DIREKTUR_SDM_GA', 'TI', 'SUPERADMIN', 'AUDITOR']
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const H = 3600000
const ago = (h: number) => new Date(Date.now() - h * H).toISOString()
const body = (init?: RequestInit) => JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

const PTS = [
  { id: 'e1', name: 'PT Ratu Karya', code: 'RTK' },
  { id: 'e2', name: 'PT Bumi Lestari', code: 'BML' },
  { id: 'e3', name: 'PT Nusa Logistik', code: 'NSL' },
  { id: 'e4', name: 'PT Sinar Energi', code: 'SNE' },
]

// ------------------------------------------------------------------
// Panel Ringkasan
// ------------------------------------------------------------------

const sdm: SdmPanel = {
  kind: 'SDM',
  week: { isoYear: 2026, isoWeek: 40, label: 'M40', handoverBy: '2026-10-01T10:00:00.000Z' },
  entities: [
    { ...PTS[0], activeProjects: 9, reportedToday: 7, onTime30: 172, total30: 186, divisions: 5, weeklyIn: 5, weeklyLate: 0, people: 42, away: 3, openEscalations: 1, lateIncidents30: 1 },
    { ...PTS[1], activeProjects: 6, reportedToday: 3, onTime30: 101, total30: 128, divisions: 4, weeklyIn: 2, weeklyLate: 1, people: 31, away: 2, openEscalations: 2, lateIncidents30: 4 },
    { ...PTS[2], activeProjects: 5, reportedToday: 5, onTime30: 98, total30: 104, divisions: 3, weeklyIn: 3, weeklyLate: 0, people: 24, away: 0, openEscalations: 0, lateIncidents30: 0 },
    { ...PTS[3], activeProjects: 4, reportedToday: 2, onTime30: 66, total30: 84, divisions: 3, weeklyIn: 2, weeklyLate: 0, people: 19, away: 1, openEscalations: 0, lateIncidents30: 2 },
  ],
  workload: [
    { id: 'u-rk', name: 'Rina Kartika', entityCode: 'RTK', activeProjects: 6, openTasks: 17, blockedTasks: 2, level: 'late' },
    { id: 'u-bs', name: 'Budi Santoso', entityCode: 'BML', activeProjects: 4, openTasks: 11, blockedTasks: 1, level: 'risk' },
    { id: 'u-sw', name: 'Sari Wulandari', entityCode: 'NSL', activeProjects: 3, openTasks: 8, blockedTasks: 0, level: 'on' },
    { id: 'u-ap', name: 'Agus Prasetyo', entityCode: 'SNE', activeProjects: 2, openTasks: 6, blockedTasks: 1, level: 'on' },
    { id: 'u-dn', name: 'Dian Novita', entityCode: 'RTK', activeProjects: 2, openTasks: 4, blockedTasks: 0, level: 'on' },
  ],
  workloadSummary: { pics: 14, avgProjects: 1.7, overloaded: 2 },
  awayToday: [
    { id: 'at-1', name: 'Fajar Nugroho', entityCode: 'RTK', status: 'CUTI', note: 'Cuti tahunan' },
    { id: 'at-2', name: 'Lina Marlina', entityCode: 'BML', status: 'SAKIT', note: null },
    { id: 'at-3', name: 'Tono Wijaya', entityCode: 'SNE', status: 'IZIN', note: 'Urusan keluarga' },
  ],
}

const cron = (): TeknisPanel['cron'] => [
  { job: 'reminder-rules', label: 'Pengingat otomatis', schedule: 'Tiap 30 menit, 07.00–18.00 WIB hari kerja', lastAt: ago(0.4), health: 'on' },
  { job: 'remind-divisions', label: 'Pengingat divisi mingguan', schedule: '09.00 WIB hari kerja', lastAt: ago(3), health: 'on' },
  { job: 'kpi-snapshot', label: 'Cuplikan KPI', schedule: '17.30 WIB setiap hari', lastAt: ago(41), health: 'late' },
]

const teknis = (): TeknisPanel => ({
  kind: 'TEKNIS',
  unlocks: {
    waitingApproval: unlocks.filter((u) => u.status === 'DIAJUKAN').length,
    waitingExecution: unlocks.filter((u) => u.status === 'DISETUJUI').length,
    activeNow: unlocks.filter((u) => u.status === 'DIEKSEKUSI' && !u.reLockedAt).length,
  },
  accessPending: 2,
  cron: cron(),
  reminders: { enabled: 12, total: 16, lastRunAt: ago(0.4) },
  accounts: { active: 107, inactive: 6, neverLoggedIn: 9, noPassword: 0, mustChange: 4 },
  notifications: { failed7d: 1 },
})

const audit: AuditPanel = {
  kind: 'AUDIT',
  late: {
    daily30: 61,
    dailyTotal30: 502,
    weeklyLate8w: 4,
    byEntity: [
      { ...PTS[1], dailyLate: 27, dailyTotal: 128, weeklyLate: 2 },
      { ...PTS[3], dailyLate: 18, dailyTotal: 84, weeklyLate: 1 },
      { ...PTS[0], dailyLate: 14, dailyTotal: 186, weeklyLate: 1 },
      { ...PTS[2], dailyLate: 2, dailyTotal: 104, weeklyLate: 0 },
    ],
    recent: [
      { id: 'dr-1', kind: 'HARIAN', label: 'Gudang Cikarang tahap 2', entityCode: 'BML', period: ago(24), submittedAt: ago(20) },
      { id: 'wr-1', kind: 'MINGGUAN', label: 'Divisi Keuangan · M40', entityCode: 'BML', period: ago(70), submittedAt: ago(70) },
      { id: 'dr-2', kind: 'HARIAN', label: 'Panel surya atap kantor', entityCode: 'SNE', period: ago(48), submittedAt: ago(44) },
    ],
  },
  audit: {
    last24h: 214,
    last7d: 1386,
    total: 48210,
    sensitive7d: 9,
    topActions: [
      { action: 'SUBMIT_DAILY_REPORT', count: 412 },
      { action: 'UPDATE_TASK', count: 388 },
      { action: 'FORWARD_DAILY_REPORT', count: 205 },
      { action: 'LOGIN', count: 171 },
      { action: 'UNLOCK_EXECUTE', count: 3 },
    ],
  },
  unlocks30: {
    executed: 3,
    items: [
      { id: 'ul-a', targetType: 'DAILY_REPORT', reason: 'Bukti foto tertukar dengan proyek lain', executedAt: ago(30), requestedBy: 'Maya Lestari', executedBy: 'Tim TI' },
      { id: 'ul-b', targetType: 'WEEKLY_REPORT', reason: 'Capaian divisi salah ketik 60% menjadi 6%', executedAt: ago(140), requestedBy: 'Andi Wijaya', executedBy: 'Tim TI' },
    ],
  },
}

// ------------------------------------------------------------------
// Buka kunci (peran grup: setujui / jalankan)
// ------------------------------------------------------------------

const person = (id: string, name: string) => ({ id, name })
const unlocks: UnlockItem[] = [
  {
    id: 'gul-1', targetType: 'DAILY_REPORT', targetId: 'dr-9', targetLabel: 'Renovasi lobi kantor pusat · 2 Okt',
    reason: 'Persentase progres salah ketik 80% menjadi 8%', status: 'DIAJUKAN', requestedBy: person('u-maya', 'Maya Lestari'),
    approvedBy: null, executedBy: null, approvedAt: null, executedAt: null, unlockUntil: null, reLockedAt: null, createdAt: ago(5),
  },
  {
    id: 'gul-2', targetType: 'WEEKLY_REPORT', targetId: 'wr-7', targetLabel: 'Divisi Operasional · M40 2026',
    reason: 'Butir kendala belum dilampiri bukti notulen', status: 'DISETUJUI', requestedBy: person('u-bml', 'Rudi Hartono'),
    approvedBy: person('u-dewi', 'Dewi Kartika'), executedBy: null, approvedAt: ago(2), executedAt: null, unlockUntil: null, reLockedAt: null, createdAt: ago(20),
  },
  {
    id: 'gul-3', targetType: 'DAILY_REPORT', targetId: 'dr-3', targetLabel: 'Gudang Cikarang tahap 2 · 30 Sep',
    reason: 'Bukti foto tertukar dengan proyek lain', status: 'DIEKSEKUSI', requestedBy: person('u-maya', 'Maya Lestari'),
    approvedBy: person('u-dewi', 'Dewi Kartika'), executedBy: person('u-ti', 'Tim TI'), approvedAt: ago(28), executedAt: ago(27),
    unlockUntil: new Date(Date.now() + 20 * H).toISOString(), reLockedAt: null, createdAt: ago(30),
  },
]

function unlockRequests(init: RequestInit | undefined, role: string) {
  const can = { request: role !== 'AUDITOR' && role !== 'DIREKTUR_SDM_GA', approve: role !== 'AUDITOR', execute: role === 'TI' || role === 'SUPERADMIN' }
  if (!init?.method || init.method === 'GET') {
    return json({ items: unlocks, total: unlocks.length, page: 1, pageSize: 20, can, me: `pratinjau-${role}` })
  }
  if (init.method !== 'PATCH') return json({ error: 'Pratinjau: pengajuan baru lewat meja Admin PT' }, 403)
  const b = body(init)
  const u = unlocks.find((x) => x.id === b.id)
  if (!u) return json({ error: 'Pengajuan tidak ditemukan' }, 404)
  const me = person(`pratinjau-${role}`, role === 'TI' ? 'Tim TI' : role === 'SUPERADMIN' ? 'Super Admin' : 'Dewi Kartika')
  const now = new Date().toISOString()
  if ((b.action === 'approve' || b.action === 'reject') && !can.approve) return json({ error: 'Peran Anda tidak memutuskan buka kunci' }, 403)
  if ((b.action === 'execute' || b.action === 'relock') && !can.execute) return json({ error: 'Peran Anda tidak menjalankan buka kunci' }, 403)
  if (b.action === 'approve') Object.assign(u, { status: 'DISETUJUI', approvedBy: me, approvedAt: now })
  else if (b.action === 'reject') Object.assign(u, { status: 'DITOLAK', approvedBy: me, approvedAt: now })
  else if (b.action === 'execute') Object.assign(u, { status: 'DIEKSEKUSI', executedBy: me, executedAt: now, unlockUntil: new Date(Date.now() + 24 * H).toISOString() })
  else if (b.action === 'relock') Object.assign(u, { reLockedAt: now })
  return json({ ok: true, item: u })
}

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
      byRole: [
        { role: 'PIC_PROYEK', count: 64, capabilities: 4 },
        { role: 'KEPALA_DIVISI', count: 22, capabilities: 3 },
        { role: 'ADMIN_PT', count: 8, capabilities: 11 },
        { role: 'DIREKTUR_ENTITAS', count: 4, capabilities: 6 },
        { role: 'MANAJEMEN', count: 3, capabilities: 6 },
        { role: 'DIREKTUR_SDM_GA', count: 1, capabilities: 8 },
        { role: 'TI', count: 2, capabilities: 18 },
        { role: 'AUDITOR', count: 2, capabilities: 2 },
        { role: 'SUPERADMIN', count: 1, capabilities: 20 },
      ],
      inactiveUsers: 6,
      noPassword: 0,
      users: [
        { id: 'u1', name: 'Maya Lestari', email: 'maya@ratukarya.co.id', role: 'ADMIN_PT', lastLoginAt: ago(0.5), hasPassword: true, scopeEntityId: 'e1' },
        { id: 'u2', name: 'Rina Kartika', email: 'rina@ratukarya.co.id', role: 'PIC_PROYEK', lastLoginAt: ago(1), hasPassword: true, scopeEntityId: 'e1' },
        { id: 'u3', name: 'Andi Wijaya', email: 'andi@ratukarya.co.id', role: 'KEPALA_DIVISI', lastLoginAt: ago(3), hasPassword: true, scopeEntityId: 'e1' },
        { id: 'u4', name: 'Dewi Kartika', email: 'dewi@bike.co.id', role: 'DIREKTUR_SDM_GA', lastLoginAt: ago(5), hasPassword: true, scopeEntityId: null },
        { id: 'u5', name: 'Yusuf Pratama', email: 'yusuf@bike.co.id', role: 'AUDITOR', lastLoginAt: null, hasPassword: true, scopeEntityId: null },
      ],
    },
    locking: {
      dailyCutoff: '17.00 WIB',
      dailyLocked: false,
      dailyCountdown: { hours: 4, minutes: 12, passed: false },
      lockedToday: 0,
      weeklyHandoverBy: '2026-10-08T10:00:00.000Z',
      weeklyLockAt: '2026-10-09T10:00:00.000Z',
      pendingUnlocks: t.unlocks.waitingApproval + t.unlocks.waitingExecution,
    },
    notifications: { sent: 3120, failed: 1 },
    data: { entities: 6, projects: 41, divisions: 15, dailyReports: 8640, weeklyReports: 512, evidence: 2210, auditLogs: 48210 },
    recentAudit: auditRows.slice(0, 10).map((a) => ({ id: a.id, action: a.action, at: a.at, actorName: a.actor?.name ?? 'Sistem', actorRole: a.actor?.role ?? null, targetType: a.targetType })),
  }
}

// ------------------------------------------------------------------
// Log aktivitas
// ------------------------------------------------------------------

const actors = [
  { id: 'u1', name: 'Maya Lestari', email: 'maya@ratukarya.co.id', role: 'ADMIN_PT' },
  { id: 'u2', name: 'Rina Kartika', email: 'rina@ratukarya.co.id', role: 'PIC_PROYEK' },
  { id: 'u3', name: 'Andi Wijaya', email: 'andi@ratukarya.co.id', role: 'KEPALA_DIVISI' },
  { id: 'u4', name: 'Dewi Kartika', email: 'dewi@bike.co.id', role: 'DIREKTUR_SDM_GA' },
  { id: 'u6', name: 'Tim TI', email: 'ti@bike.co.id', role: 'TI' },
]
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

const kpi = (s: number, d: number, w: number, late: number, pending: number) => ({
  complianceScore: s, onTimeDailyPct: d, weeklyCompletenessPct: w, lateToday: late, pendingReports: pending,
})
const tree = {
  periodKey: '2026-10',
  tree: [
    {
      id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', type: 'HOLDING', region: 'Jakarta', kpi: null,
      children: [
        { id: 'e1', name: 'PT Ratu Karya', code: 'RTK', type: 'PT', region: 'Jakarta', kpi: kpi(91, 92, 100, 0, 2), children: [] },
        { id: 'e2', name: 'PT Bumi Lestari', code: 'BML', type: 'PT', region: 'Bekasi', kpi: kpi(72, 79, 50, 3, 3), children: [] },
        { id: 'e3', name: 'PT Nusa Logistik', code: 'NSL', type: 'PT', region: 'Surabaya', kpi: kpi(95, 94, 100, 0, 0), children: [] },
        { id: 'e4', name: 'PT Sinar Energi', code: 'SNE', type: 'PT', region: 'Semarang', kpi: kpi(78, 79, 67, 1, 2), children: [] },
      ],
    },
  ],
}

function entityDetail(id: string) {
  const pt = PTS.find((p) => p.id === id)
  if (!pt && id !== 'h') return json({ error: 'Entitas tidak ditemukan' }, 404)
  const e = pt ?? { id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE' }
  return json({
    entity: { ...e, type: pt ? 'PT' : 'HOLDING', path: pt ? `/h/${id}/` : '/h/', region: 'Jakarta', parentId: pt ? 'h' : null, isActive: true },
    parentChain: pt ? [{ id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', type: 'HOLDING', region: 'Jakarta' }] : [],
    children: pt ? [] : PTS.map((p) => ({ ...p, type: 'PT', region: null, isActive: true })),
    divisions: pt
      ? ['Keuangan', 'Operasional', 'Pemasaran'].map((n, i) => ({ id: `${id}-d${i}`, name: n, isActive: true, divisionType: { id: `dt-${i}`, code: n.slice(0, 3).toUpperCase(), name: n } }))
      : [],
    projects: pt
      ? [
          { id: `${id}-p1`, name: 'Renovasi lobi kantor pusat', code: `${pt.code}-01`, phase: 'PELAKSANAAN', lifecycle: 'AKTIF', picName: 'Rina Kartika', startDate: ago(900), targetEndDate: new Date(Date.now() + 600 * H).toISOString() },
          { id: `${id}-p2`, name: 'Sistem gudang terpadu', code: `${pt.code}-02`, phase: 'PERENCANAAN', lifecycle: 'AKTIF', picName: 'Budi Santoso', startDate: ago(400), targetEndDate: new Date(Date.now() + 1400 * H).toISOString() },
        ]
      : [],
    adminAppointments: [],
    currentKpi: pt
      ? { complianceScore: 88, onTimeDailyPct: 92, weeklyCompletenessPct: 100, evidenceCompletenessPct: 81, highPriorityCompletionPct: 75, lateToday: 0, pendingReports: 2, totalProjects: 11, activeProjects: 9 }
      : null,
    recentDailyReports: [],
    recentWeeklyReports: [],
  })
}

export function handle(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  const group = GROUP.includes(role)
  if (path === '/api/system/grup') {
    if (role === 'DIREKTUR_SDM_GA') return json(sdm)
    if (role === 'AUDITOR') return json(audit)
    if (role === 'TI' || role === 'SUPERADMIN') return json(teknis())
    return json({ error: 'Panel ini untuk peran tingkat grup' }, 403)
  }
  if (path === '/api/system') {
    return role === 'TI' || role === 'SUPERADMIN' ? json(system()) : json({ error: 'Konsol sistem hanya untuk Tim TI dan Super Admin' }, 403)
  }
  if (path === '/api/audit-logs' && method === 'GET') return auditLogs(url, role)
  if (path === '/api/entities' && method === 'GET') return json(tree)
  if (path.startsWith('/api/entities/') && method === 'GET') return entityDetail(decodeURIComponent(path.slice('/api/entities/'.length)))
  // Antrean di bawah ini hanya untuk peran grup; peran lain tetap memakai data area masing-masing.
  if (group && path === '/api/unlock-requests') return unlockRequests(init, role)
  return null
}
