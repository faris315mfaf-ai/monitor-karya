import { ROLE_LABELS } from '@/lib/constants'
import { complianceFor, companiesFor } from './mock-summary'
import { people, divisions, entities, groupRoles, actor } from './mock-catalog'
import { projectSnapshots } from './mock-proyek'
import { reportHistory } from './mock-history'
import { unlockItems, dailyProjects, deskWeeklyReports } from './mock-laporan'
import { isWorkingDay, startOfWibDay } from '@/lib/lock'
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

// ------------------------------------------------------------------
// [T3-A4] Arsip laporan harian (/api/daily-reports) — drill-down dashboard
// Manajemen per perusahaan. Parameter lama (entityId, status, dateFrom,
// dateTo, search, page) mengikuti route produksi; `projectId` memfilter
// satu proyek untuk kartu "Laporan per perusahaan". Bentuk kolom sama
// dengan model DailyProjectReport + include project/entity/submittedBy.
// ------------------------------------------------------------------

const DAY = 86400000

type DailyReportItem = {
  id: string; projectId: string; entityId: string; reportDate: string
  status: string; progressPct: number; phase: string
  achievementToday: string; obstacle: string | null; followUp: string | null
  followUpTargetDate: string | null; decisionRequestedFrom: string | null
  needsEscalation: boolean; evidenceCount: number
  isLocked: boolean; lockedAt: string | null; isLate: boolean
  submittedById: string | null; submittedBy: { id: string; name: string; email: string } | null; submittedAt: string | null
  forwardedById: string | null; forwardedBy: { id: string; name: string } | null; forwardedAt: string | null
  createdAt: string; updatedAt: string
  project: { id: string; name: string; code: string }
  entity: { id: string; name: string; code: string; region: string }
}

type DailySeed = { status: string; progressPct: number; isLate?: boolean; evidenceCount?: number }

/** Laporan contoh khusus proyek PT. SPKD (urutan index 0 = hari kerja terbaru sebelum hari ini). */
const RICH_DAILY: Record<string, DailySeed[]> = {
  sp1: [
    { status: 'ON_PROGRESS', progressPct: 64, evidenceCount: 2 },
    { status: 'SELESAI', progressPct: 62, evidenceCount: 2 },
    { status: 'ON_PROGRESS', progressPct: 60, evidenceCount: 1 },
    { status: 'TERKENDALA', progressPct: 58, evidenceCount: 1 },
    { status: 'ON_PROGRESS', progressPct: 58, evidenceCount: 1 },
    { status: 'ON_PROGRESS', progressPct: 56, evidenceCount: 2 },
    { status: 'SELESAI', progressPct: 54, evidenceCount: 1 },
    { status: 'TIDAK_ADA_PERUBAHAN', progressPct: 54, evidenceCount: 0 },
    { status: 'ON_PROGRESS', progressPct: 54, isLate: true, evidenceCount: 1 },
    { status: 'ON_PROGRESS', progressPct: 52, evidenceCount: 1 },
    { status: 'SELESAI', progressPct: 50, evidenceCount: 2 },
    { status: 'ON_PROGRESS', progressPct: 48, evidenceCount: 1 },
  ],
  sp2: [
    { status: 'ON_PROGRESS', progressPct: 48, evidenceCount: 1 },
    { status: 'ON_PROGRESS', progressPct: 46, evidenceCount: 2 },
    { status: 'TERKENDALA', progressPct: 45, evidenceCount: 1 },
    { status: 'ON_PROGRESS', progressPct: 44, evidenceCount: 1 },
    { status: 'TIDAK_ADA_PERUBAHAN', progressPct: 44, evidenceCount: 0 },
    { status: 'SELESAI', progressPct: 42, evidenceCount: 1 },
    { status: 'ON_PROGRESS', progressPct: 40, isLate: true, evidenceCount: 1 },
    { status: 'SELESAI', progressPct: 38, evidenceCount: 2 },
    { status: 'ON_PROGRESS', progressPct: 36, evidenceCount: 1 },
    { status: 'SELESAI', progressPct: 34, evidenceCount: 1 },
  ],
  sp3: [
    { status: 'ON_PROGRESS', progressPct: 25, evidenceCount: 1 },
    { status: 'SELESAI', progressPct: 22, evidenceCount: 1 },
    { status: 'ON_PROGRESS', progressPct: 20, evidenceCount: 0 },
    { status: 'TIDAK_ADA_PERUBAHAN', progressPct: 20, evidenceCount: 0 },
    { status: 'ON_PROGRESS', progressPct: 18, evidenceCount: 1 },
    { status: 'ON_PROGRESS', progressPct: 15, evidenceCount: 1 },
  ],
}

const ACHIEVEMENTS: Record<string, string> = {
  SELESAI: 'Seluruh pekerjaan hari ini selesai sesuai rencana.',
  ON_PROGRESS: 'Pekerjaan berjalan sesuai rencana hari ini.',
  TERKENDALA: 'Pekerjaan tertahan; kendala sedang dikawal bersama mitra.',
  TIDAK_ADA_PERUBAHAN: 'Tidak ada perubahan yang bisa dikerjakan hari ini.',
  MENUNGGU_KEPUTUSAN: 'Menunggu keputusan manajemen sebelum pekerjaan dilanjutkan.',
}
const OBSTACLES: Record<string, string> = {
  sp1: 'Sandbox bridging BPJS belum diaktifkan mitra integrasi.',
  sp2: 'Kuota penyimpanan konten klinik penuh; menunggu persetujuan anggaran.',
  sp3: 'Kunci lisensi payment gateway belum diterbitkan vendor.',
}
const FOLLOW_UPS: Record<string, string> = {
  sp1: 'Dorong mitra mengaktifkan sandbox pekan ini.',
  sp2: 'Arsip sementara dipindah ke penyimpanan lokal sementara menunggu kuota.',
  sp3: 'Menagih kunci lisensi ke vendor paling lambat Jumat.',
}

/** Hari kerja terakhir sebelum hari ini (baru → lama), tanpa menyentuh hari berjalan. */
function pastWorkdays(count: number): Date[] {
  const out: Date[] = []
  for (let t = startOfWibDay(new Date()).getTime() - DAY; out.length < count; t -= DAY) {
    const d = new Date(t)
    if (isWorkingDay(d)) out.push(d)
  }
  return out
}

const emailOfName = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@karya.co.id`

type SnapshotLite = { id: string; name: string; code: string; phase: string; picName: string | null; entityId: string }

/** Satu baris laporan harian dari benih status, dengan jam kirim/terus yang tetap. */
function seedItem(p: SnapshotLite, entity: DailyReportItem['entity'], seed: DailySeed, day: Date, seq: number): DailyReportItem {
  const blocked = seed.status === 'TERKENDALA' || seed.status === 'MENUNGGU_KEPUTUSAN'
  const lateAt = seed.isLate ? 17 * HOUR + 25 * 60000 : 10 * HOUR + 5 * 60000
  const submittedAt = new Date(day.getTime() + lateAt).toISOString()
  const submitter = p.picName ? { id: `u-${p.id}`, name: p.picName, email: emailOfName(p.picName) } : null
  return {
    id: `dr-${p.id}-${seq}`, projectId: p.id, entityId: entity.id, reportDate: day.toISOString(),
    status: seed.status, progressPct: seed.progressPct, phase: p.phase,
    achievementToday: ACHIEVEMENTS[seed.status] ?? ACHIEVEMENTS.ON_PROGRESS,
    obstacle: seed.status === 'TERKENDALA' ? OBSTACLES[p.id] ?? null : null,
    followUp: seed.status === 'TERKENDALA' ? FOLLOW_UPS[p.id] ?? null : null,
    followUpTargetDate: null, decisionRequestedFrom: null,
    needsEscalation: blocked, evidenceCount: seed.evidenceCount ?? 1,
    isLocked: true, lockedAt: new Date(day.getTime() + 17 * HOUR).toISOString(),
    isLate: Boolean(seed.isLate),
    submittedById: submitter?.id ?? null, submittedBy: submitter, submittedAt,
    forwardedById: null, forwardedBy: null, forwardedAt: new Date(day.getTime() + 13 * HOUR).toISOString(),
    createdAt: submittedAt, updatedAt: submittedAt,
    project: { id: p.id, name: p.name, code: p.code }, entity,
  }
}

/** Baris laporan proyek lain mengikuti riwayat contoh (mock-history) agar konsisten dengan pratinjau lain. */
function historyItems(p: SnapshotLite, entity: DailyReportItem['entity']): DailyReportItem[] {
  return reportHistory(p.id)
    .filter((r) => r.submitted && r.submittedAt)
    .map((r, i) => {
      const day = new Date(r.date)
      const submitter = p.picName ? { id: `u-${p.id}`, name: p.picName, email: emailOfName(p.picName) } : null
      return {
        id: `dr-${p.id}-${r.key}`, projectId: p.id, entityId: entity.id, reportDate: r.date,
        status: r.status ?? 'ON_PROGRESS', progressPct: r.progressPct ?? 0, phase: p.phase,
        achievementToday: ACHIEVEMENTS[r.status ?? 'ON_PROGRESS'] ?? ACHIEVEMENTS.ON_PROGRESS,
        obstacle: r.status === 'TERKENDALA' ? OBSTACLES[p.id] ?? 'Kendala sedang ditindaklanjuti bersama pihak terkait.' : null,
        followUp: null, followUpTargetDate: null, decisionRequestedFrom: null,
        needsEscalation: r.status === 'TERKENDALA', evidenceCount: (i % 3 === 0 ? 2 : 1),
        isLocked: true, lockedAt: new Date(day.getTime() + 17 * HOUR).toISOString(),
        isLate: Boolean(r.isLate),
        submittedById: submitter?.id ?? null, submittedBy: submitter, submittedAt: r.submittedAt,
        forwardedById: null, forwardedBy: null, forwardedAt: r.forwarded ? new Date(day.getTime() + 13 * HOUR).toISOString() : null,
        createdAt: r.submittedAt!, updatedAt: r.updatedAt,
        project: { id: p.id, name: p.name, code: p.code }, entity,
      }
    })
    .reverse()
}

/** Seluruh laporan harian contoh: proyek aktif semua PT, diurutkan terbaru dulu. */
function allDailyItems(): DailyReportItem[] {
  const catalog = Object.fromEntries(entities.map((e) => [e.id, e]))
  const out: DailyReportItem[] = []
  for (const p of projectSnapshots('SUPERADMIN').filter((x) => x.lifecycle === 'AKTIF')) {
    const entity = catalog[p.entityId]
    if (!entity) continue
    if (RICH_DAILY[p.id]) out.push(...pastWorkdays(RICH_DAILY[p.id].length).map((day, i) => seedItem(p, entity, RICH_DAILY[p.id][i], day, i)))
    else out.push(...historyItems(p, entity))
  }
  return out.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.createdAt.localeCompare(a.createdAt))
}

function dailyReportsRoute(url: string, role: string) {
  const sp = new URL(url, 'http://x').searchParams
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)
  const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '20', 10) || 20))
  const projectId = sp.get('projectId') || ''
  // [T3-A1] projectId exact match; string pendek (≤ 64 karakter) seperti route produksi.
  if (projectId.length > 64) return json({ error: 'Parameter projectId tidak valid' }, 400)
  const entityId = sp.get('entityId') || ''
  const status = sp.get('status') || ''
  const search = (sp.get('search') || '').trim().toLowerCase()
  const rawFrom = sp.get('dateFrom')
  const rawTo = sp.get('dateTo')
  const from = rawFrom ? Date.parse(rawFrom) : null
  const to = rawTo ? Date.parse(rawTo) : null
  if ((from !== null && Number.isNaN(from)) || (to !== null && Number.isNaN(to))) return json({ error: 'Format tanggal tidak valid' }, 400)
  // Peran grup membaca seluruh grup; peran lain terikat PT Ratu Karya (scopeEntityIds produksi).
  const scope = groupRoles.includes(role) ? null : ['e1']
  const rows = allDailyItems().filter(
    (r) =>
      (!projectId || r.projectId === projectId) &&
      (!entityId || r.entityId === entityId) &&
      (!status || r.status === status) &&
      (!scope || scope.includes(r.entityId)) &&
      (!search || r.project.name.toLowerCase().includes(search)) &&
      (from === null || Date.parse(r.reportDate) >= from) &&
      (to === null || Date.parse(r.reportDate) <= to),
  )
  return json({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize })
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
  // [T3-A4] Arsip umum (tanpa penanda for=…): dukung projectId & pageSize untuk drill-down.
  if (path === '/api/daily-reports' && method === 'GET') return dailyReportsRoute(url, role)
  if (url.includes('for=unlock') && path === '/api/weekly-reports') return json({ items: deskWeeklyReports().filter((d) => d.report).map((d) => ({ ...d.report, isoYear: mock.weeklyInput.week.isoYear, isoWeek: mock.weeklyInput.week.isoWeek, division: { name: d.name } })) })
  if (url.includes('for=access') && path === '/api/companies' && role === 'ADMIN_PT') return json(companiesFor(role))
  return null
}
