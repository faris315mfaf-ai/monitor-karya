import { ROLE_LABELS } from '@/lib/constants'
import { complianceFor, companiesFor } from './mock-summary'
import { people, divisions, actor } from './mock-catalog'
import { projectSnapshots } from './mock-proyek'
import { unlockItems, dailyProjects, deskWeeklyReports } from './mock-laporan'
import { can } from '@/lib/rbac'
/**
 * Rute pratinjau tambahan untuk area ini (P2). Kembalikan Response untuk path
 * yang ditangani, atau null agar diteruskan ke rute lain. Hanya mode pengembangan.
 *
 * P2-C (Admin PT): permintaan akses, pengingat otomatis, buka kunci, data
 * induk, pengguna per peran, dan kepatuhan per orang. Data contoh disimpan di
 * memori agar sakelar, persetujuan, dan pengajuan terlihat hasilnya.
 */

import * as mock from './mock-data'
import type { AccessRequestItem, AdminOverview, ReminderKind, ReminderRuleView } from '@/lib/admin-meta'
import { REMINDER_DEFAULTS, REMINDER_KINDS, REMINDER_LABELS } from '@/lib/admin-meta'
import type { ComplianceData } from '@/lib/admin-compliance'
import { csvRow } from '@/lib/admin-compliance'
import type { ActivityEntry } from '@/lib/audit-labels'

const HOUR = 3600000
const now = Date.now()
const ago = (h: number) => new Date(now - h * HOUR).toISOString()
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const body = (init?: RequestInit) => JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const ME = actor('ADMIN_PT')

// ------------------------------------------------------------------
// Permintaan akses
// ------------------------------------------------------------------

const AR = (o: Partial<AccessRequestItem> & Pick<AccessRequestItem, 'id' | 'type' | 'title' | 'detail'>): AccessRequestItem => ({
  status: 'DIAJUKAN',
  reason: null,
  entityId: 'e1',
  entityName: 'PT Ratu Karya',
  requester: { id: 'u-andi', name: 'Andi Wijaya' },
  target: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  expiresAt: null,
  revertedAt: null,
  createdAt: ago(2),
  canDecide: true,
  ...o,
})

const access: AccessRequestItem[] = [
  AR({ id: 'ar1', type: 'AKUN_BARU', title: 'Akun baru Galih Pratama', detail: 'Operasional · peran Manager / PIC proyek', reason: 'Bergabung di proyek gudang mulai Senin', createdAt: ago(1.5) }),
  AR({
    id: 'ar2',
    type: 'AKSES_SEMENTARA',
    title: 'Akses sementara untuk Yoga Saputra',
    detail: '30 hari',
    reason: 'Pendampingan auditor eksternal laporan keuangan',
    requester: { id: 'u-hadi', name: 'Hadi Santoso' },
    target: { id: 'u-yoga', name: 'Yoga Saputra' },
    createdAt: ago(5),
  }),
  AR({
    id: 'ar3',
    type: 'PINDAH_PERAN',
    title: 'Pindah peran Yoga Saputra jadi kepala divisi',
    detail: 'Teknologi',
    requester: { id: 'u-andi', name: 'Andi Wijaya' },
    target: { id: 'u-yoga', name: 'Yoga Saputra' },
    createdAt: ago(26),
  }),
  AR({
    id: 'ar4',
    type: 'AKUN_BARU',
    title: 'Akun baru Sinta Maharani',
    detail: 'Keuangan · peran Manager / PIC proyek',
    status: 'DISETUJUI',
    decidedBy: ME,
    decidedAt: ago(30),
    createdAt: ago(50),
    canDecide: false,
  }),
]

const REQUESTERS: Record<string, { id: string; name: string }> = {
  KEPALA_DIVISI: { id: 'pratinjau-KEPALA_DIVISI', name: 'Andi Wijaya' },
  PIC_PROYEK: { id: 'pratinjau-PIC_PROYEK', name: 'Rina Kartika' },
}

function accessRequests(url: string, init: RequestInit | undefined, role: string) {
  const method = init?.method ?? 'GET'
  // [F2-ADMIN] Kepala divisi & PIC hanya melihat permintaannya sendiri.
  const mine = REQUESTERS[role]
  const pool = mine ? access.filter((a) => a.requester?.id === mine.id) : access
  if (method === 'GET') {
    const all = new URL(url, 'http://x').searchParams.get('status') === 'all'
    const items = all ? pool : pool.filter((a) => a.status === 'DIAJUKAN')
    return json({ items, pending: pool.filter((a) => a.status === 'DIAJUKAN').length, canDecide: !mine })
  }
  const b = body(init)
  if (method === 'PATCH') {
    if (!['ADMIN_PT', 'TI', 'SUPERADMIN'].includes(role)) return json({ error: 'Peran Anda tidak memutuskan permintaan akses.' }, 403)
    const a = access.find((x) => x.id === b.id)
    if (!a) return json({ error: 'Permintaan tidak ditemukan' }, 404)
    if (a.status !== 'DIAJUKAN') return json({ error: 'Permintaan ini sudah diputuskan.' }, 409)
    Object.assign(a, {
      status: b.decision === 'approve' ? 'DISETUJUI' : 'DITOLAK',
      decidedBy: ME,
      decidedAt: new Date().toISOString(),
      canDecide: false,
      expiresAt: b.decision === 'approve' && a.type === 'AKSES_SEMENTARA' ? new Date(now + 30 * 24 * HOUR).toISOString() : null,
    })
    return json({ ok: true, item: a })
  }
  const p = (b.payload ?? {}) as Record<string, unknown>
  const type = String(b.type) as AccessRequestItem['type']
  const user = people.find((u) => u.id === p.userId) ?? requesterUsers.find((u) => u.id === p.userId)
  const title =
    type === 'AKUN_BARU'
      ? `Akun baru ${String(p.name ?? '')}`
      : type === 'PINDAH_PERAN'
        ? `Pindah peran ${user?.name ?? 'akun'} jadi ${String(p.role ?? '')}`
        : `Akses sementara untuk ${user?.name ?? 'akun'}`
  const item = AR({
    id: uid('ar'),
    type,
    title,
    detail: type === 'AKSES_SEMENTARA' ? `${p.days ?? 30} hari` : '',
    reason: typeof b.reason === 'string' ? b.reason : null,
    requester: mine ?? ME,
    target: user ? { id: user.id, name: user.name } : null,
    createdAt: new Date().toISOString(),
    canDecide: false,
  })
  access.unshift(item)
  log(mine ?? ME, 'REQUEST_ACCESS', `mengajukan permintaan akses: ${title.toLowerCase()}`)
  return json({ ok: true, item }, 201)
}

// ------------------------------------------------------------------
// Pengingat otomatis
// ------------------------------------------------------------------

const rules: ReminderRuleView[] = REMINDER_KINDS.map((kind) => ({
  kind,
  ...REMINDER_DEFAULTS[kind],
  lastRunAt: kind === 'HARIAN' ? ago(22) : kind === 'ESKALASI_KADIV' ? ago(5) : null,
  updatedAt: kind === 'RINGKASAN_MANAJEMEN' ? ago(72) : null,
  updatedBy: kind === 'RINGKASAN_MANAJEMEN' ? ME.name : null,
}))

function reminderRules(init?: RequestInit) {
  if (!init?.method || init.method === 'GET') return json({ entityId: 'e1', rules })
  const b = body(init)
  const r = rules.find((x) => x.kind === b.kind)
  if (!r) return json({ error: 'Jenis pengingat tidak dikenali.' }, 422)
  if (typeof b.enabled === 'boolean') r.enabled = b.enabled
  r.updatedAt = new Date().toISOString()
  r.updatedBy = ME.name
  const message = `${ME.name} ${r.enabled ? 'menyalakan' : 'mematikan'} ${REMINDER_LABELS[r.kind as ReminderKind]}`
  log(ME, 'UPDATE_REMINDER_RULE', message.slice(ME.name.length + 1))
  return json({ ok: true, rule: r, message })
}

// ------------------------------------------------------------------
// Buka kunci
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Data induk, pengguna per peran, kepatuhan per orang
// ------------------------------------------------------------------

function overviewFor(): AdminOverview {
  const c = complianceFor()
  const users = people.filter((p) => p.scopeEntityId === 'e1')
  const projects = projectSnapshots('ADMIN_PT')
  return { scope: 'ENTITY', entityName: 'PT Ratu Karya', masterData: { entities: 1, divisions: divisions.filter((d) => d.entityId === 'e1').length, projects: projects.length, activeProjects: projects.filter((p) => p.lifecycle === 'AKTIF').length, users: users.length, activeUsers: users.filter((p) => p.isActive).length, templates: new Set(divisions.map((d) => d.name)).size }, usersByRole: [...new Set(users.map((p) => p.role))].map((role) => ({ role, label: ROLE_LABELS[role] ?? role, count: users.filter((p) => p.role === role).length })), compliance: { hasMembership: true, divisions: c.divisions.map((d) => ({ ...d, head: d.head?.name ?? null })) }, unlocks: { pending: unlockItems.filter((u) => u.status === 'DIAJUKAN').length, approved: unlockItems.filter((u) => u.status === 'DISETUJUI').length }, canManageReminders: true }
}
// ------------------------------------------------------------------
// [F2-ADMIN] Kepatuhan per divisi, pengingat per orang, log aktivitas, unduh log,
// pilihan formulir permintaan akses, keanggotaan divisi di sheet akun.
// ------------------------------------------------------------------

function remindCompliance(init?: RequestInit) {
  const b = body(init)
  const at = new Date().toISOString()
  const compliance: ComplianceData = complianceFor()
  const targets = compliance.divisions.flatMap((d) =>
    d.missing.filter((m) => !m.remindedAt && (b.all === true || b.divisionId === d.id || b.userId === m.id))
  )
  if (typeof b.userId === 'string' && targets.length === 0) {
    const m = compliance.divisions.flatMap((d) => d.missing).find((x) => x.id === b.userId)
    return json({ error: 'Orang ini sudah diingatkan hari ini.', remindedAt: m?.remindedAt ?? null }, 409)
  }
  const seen = new Set<string>()
  for (const t of targets) {
    t.remindedAt = at
    for (const p of mock.deskAdmin.projects) if (t.projects.includes(p.name)) p.remindedAt = at
    if (!seen.has(t.id)) log(ME, 'REMIND_PIC', `mengingatkan PIC ${t.name}`)
    seen.add(t.id)
  }
  compliance.totals.reminded += seen.size
  return json({ ok: true, people: Array.from(seen).map((id) => ({ userId: id, name: targets.find((t) => t.id === id)!.name, remindedAt: at })), sent: targets.length, skipped: 0 })
}

const activity: ActivityEntry[] = [
  { id: 'a1', at: ago(0.4), action: 'FORWARD_DAILY_REPORT', actor: ME, text: 'meneruskan laporan harian Aplikasi Absensi', count: 1 },
  { id: 'a2', at: ago(1.2), action: 'APPROVE_ACCESS_REQUEST', actor: ME, text: 'menyetujui permintaan akses', count: 1 },
  { id: 'a3', at: ago(3), action: 'AUTO_REMINDER', actor: null, text: 'mengirim pengingat laporan harian ke 4 orang', count: 1 },
  { id: 'a4', at: ago(5), action: 'SUBMIT_WEEKLY_REPORT', actor: { id: 'u-lina', name: 'Lina Marlina' }, text: 'menyerahkan laporan mingguan Divisi Media M41', count: 1 },
  { id: 'a5', at: ago(72), action: 'UPDATE_REMINDER_RULE', actor: ME, text: 'mematikan ringkasan untuk manajemen', count: 1 },
]
function log(actor: { id: string; name: string }, action: string, text: string) {
  activity.unshift({ id: uid('act'), at: new Date().toISOString(), action, actor, text, count: 1 })
}

function exportCsv() {
  const rows = [
    csvRow(['Waktu (WIB)', 'Pelaku', 'Peran pelaku', 'Aksi', 'Kode aksi', 'Jenis sasaran', 'ID sasaran', 'Keterangan']),
    ...activity.map((a) => csvRow([a.at.replace('T', ' ').slice(0, 19), a.actor?.name ?? 'Sistem', a.actor ? 'Admin PT' : '', a.text, a.action, '', '', ''])),
  ]
  return Promise.resolve(
    new Response('﻿' + rows.join('\r\n') + '\r\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="log-aktivitas-pratinjau.csv"',
        'X-Total-Rows': String(activity.length),
        'X-Exported-Rows': String(activity.length),
      },
    })
  )
}

const requesterUsers = people.filter((p) => p.divisionId === 'dv-tek').map((p) => ({ ...p, roleLabel: p.role, divisionName: 'Teknologi' }))
function requestOptions(role: string) {
  const me = `pratinjau-${role}`
  return json({
    entity: { id: 'e1', name: 'PT Ratu Karya' },
    divisions: [{ id: 'dv-tek', name: 'Teknologi' }],
    users: requesterUsers.filter((u) => role === 'KEPALA_DIVISI' || u.id === me || u.role === 'PIC_PROYEK').map((u) => ({ ...u, isSelf: u.id === me })),
    roles: [
      { role: 'PIC_PROYEK', label: 'Manager / PIC proyek' },
      { role: 'KEPALA_DIVISI', label: 'Kepala divisi' },
    ],
  })
}

export function handle(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  if (path === '/api/admin/compliance') return json(complianceFor())
  if (path === '/api/admin/compliance/remind') return can(role, 'notify:remind') ? remindCompliance(init) : json({ error: 'Peran Anda tidak mengirim pengingat.' }, 403)
  if (path === '/api/admin/activity') return json({ items: activity.slice(0, 12) })
  if (path === '/api/audit-logs/export') return exportCsv()
  if (path === '/api/access-requests/options') return requestOptions(role)
  if (path === '/api/companies/users' && method === 'GET' && url.includes('id=')) {
    const id = new URL(url, 'http://x').searchParams.get('id')
    const u = people.find((x) => x.id === id)
    return json({ id, memberDivisionId: u?.role === 'PIC_PROYEK' ? u.divisionId : null })
  }
  if (path === '/api/access-requests') return accessRequests(url, init, role)
  if (path === '/api/admin/reminder-rules') return reminderRules(init)
  if (path === '/api/admin/overview') return json(overviewFor())
  // Hanya panggilan kartu Admin (penanda ?for=…) supaya rute area lain tidak tertimpa.
  if (url.includes('for=unlock') && path === '/api/daily-reports') return json({ items: dailyProjects().filter((p) => p.entityId === 'e1' && p.report).map((p) => ({ ...p.report, reportDate: mock.deskAdmin.today, project: { name: p.name } })) })
  if (url.includes('for=unlock') && path === '/api/weekly-reports') return json({ items: deskWeeklyReports().filter((d) => d.report).map((d) => ({ ...d.report, isoYear: mock.weeklyInput.week.isoYear, isoWeek: mock.weeklyInput.week.isoWeek, division: { name: d.name } })) })
  if (url.includes('for=access') && path === '/api/companies' && role === 'ADMIN_PT') return json(companiesFor(role))
  return null
}
