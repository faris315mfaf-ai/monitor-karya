/**
 * Rute pratinjau tambahan untuk area ini (P2). Kembalikan Response untuk path
 * yang ditangani, atau null agar diteruskan ke rute lain. Hanya mode pengembangan.
 *
 * P2-C (Admin PT): permintaan akses, pengingat otomatis, buka kunci, data
 * induk, pengguna per peran, dan kepatuhan per orang. Data contoh disimpan di
 * memori agar sakelar, persetujuan, dan pengajuan terlihat hasilnya.
 */

import * as mock from './mock-data'
import type { AccessRequestItem, AdminOverview, ReminderKind, ReminderRuleView, UnlockItem } from '@/lib/admin-meta'
import { REMINDER_DEFAULTS, REMINDER_KINDS, REMINDER_LABELS } from '@/lib/admin-meta'
import type { ComplianceData, DivisionCompliance } from '@/lib/admin-compliance'
import { csvRow } from '@/lib/admin-compliance'
import type { ActivityEntry } from '@/lib/audit-labels'

const HOUR = 3600000
const now = Date.now()
const ago = (h: number) => new Date(now - h * HOUR).toISOString()
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const body = (init?: RequestInit) => JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const ME = { id: 'pratinjau-ADMIN_PT', name: 'Maya Lestari' }

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
  const user = mock.companies.companies.flatMap((c) => c.users).find((u) => u.id === p.userId) ?? requesterUsers.find((u) => u.id === p.userId)
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

const U = (o: Partial<UnlockItem> & Pick<UnlockItem, 'id' | 'targetLabel' | 'reason' | 'status'>): UnlockItem => ({
  targetType: 'DAILY_REPORT',
  targetId: 'dr-x',
  requestedBy: ME,
  approvedBy: null,
  executedBy: null,
  approvedAt: null,
  executedAt: null,
  unlockUntil: null,
  reLockedAt: null,
  createdAt: ago(3),
  ...o,
})

const unlocks: UnlockItem[] = [
  U({ id: 'ul1', targetLabel: 'Laporan harian Aplikasi Absensi · Jum 2 Okt', reason: 'Bukti foto tertukar dengan proyek lain', status: 'DIAJUKAN' }),
  U({
    id: 'ul2',
    targetType: 'WEEKLY_REPORT',
    targetLabel: 'Laporan mingguan Divisi Keuangan · M39/2026',
    reason: 'Angka realisasi anggaran salah ketik',
    status: 'DIEKSEKUSI',
    approvedBy: { id: 'u-sdm', name: 'Direksi Holding' },
    executedBy: { id: 'u-ti', name: 'Tim TI' },
    approvedAt: ago(70),
    executedAt: ago(69),
    unlockUntil: ago(45),
    reLockedAt: ago(45),
    createdAt: ago(72),
  }),
]

function unlockRequests(init?: RequestInit) {
  if (!init?.method || init.method === 'GET') {
    return json({ items: unlocks, total: unlocks.length, page: 1, pageSize: 20, can: { request: true, approve: false, execute: false }, me: ME.id })
  }
  const b = body(init)
  if (init.method === 'POST') {
    const pick = [...dailyCandidates, ...weeklyCandidates].find((c) => c.id === b.targetId)
    const item = U({
      id: uid('ul'),
      targetType: String(b.targetType),
      targetId: String(b.targetId),
      targetLabel: pick?.label ?? 'Laporan',
      reason: String(b.reason ?? ''),
      status: 'DIAJUKAN',
      createdAt: new Date().toISOString(),
    })
    unlocks.unshift(item)
    return json({ ok: true, item }, 201)
  }
  return json({ error: 'Peran Anda tidak memutuskan buka kunci' }, 403)
}

const dailyCandidates = [
  { id: 'dr-1', label: 'Laporan harian Aplikasi Absensi · Jum 2 Okt', reportDate: ago(96), project: { name: 'Aplikasi Absensi' } },
  { id: 'dr-2', label: 'Laporan harian Migrasi Server Data · Kam 1 Okt', reportDate: ago(120), project: { name: 'Migrasi Server Data' } },
]
const weeklyCandidates = [{ id: 'wr-1', label: 'Laporan mingguan Divisi Teknologi · M39/2026', isoWeek: 39, isoYear: 2026, division: { name: 'Teknologi' } }]

// ------------------------------------------------------------------
// Data induk, pengguna per peran, kepatuhan per orang
// ------------------------------------------------------------------

const P = (id: string, name: string, h: number | null) => ({ id, name, role: 'Manager / PIC proyek', lastReportAt: h === null ? null : ago(h) })

const overview: AdminOverview = {
  scope: 'ENTITY',
  entityName: 'PT Ratu Karya',
  masterData: { entities: 3, divisions: 6, projects: 24, activeProjects: 18, users: 52, activeUsers: 50, templates: 8 },
  usersByRole: [
    { role: 'PIC_PROYEK', label: 'Manager / PIC proyek', count: 39 },
    { role: 'KEPALA_DIVISI', label: 'Kepala divisi', count: 6 },
    { role: 'DIREKTUR_ENTITAS', label: 'Direktur entitas', count: 3 },
    { role: 'ADMIN_PT', label: 'Admin PT', count: 2 },
    { role: 'MANAJEMEN', label: 'Manajemen', count: 2 },
  ],
  compliance: {
    hasMembership: true,
    divisions: [
      { id: 'dv-tek', name: 'Teknologi', head: 'Andi Wijaya', expected: 6, reported: 5, onLeave: 0, missing: [P('u-yoga', 'Yoga Saputra', 26)] },
      { id: 'dv-keu', name: 'Keuangan', head: 'Sari Widodo', expected: 8, reported: 8, onLeave: 1, missing: [] },
      { id: 'dv-med', name: 'Media', head: 'Lina Marlina', expected: 8, reported: 6, onLeave: 0, missing: [P('u-dodi', 'Dodi Firmansyah', 30), P('u-rara', 'Rara Anindya', null)] },
      { id: 'dv-sdm', name: 'SDM', head: 'Bayu Nugroho', expected: 7, reported: 7, onLeave: 0, missing: [] },
      { id: 'dv-ops', name: 'Operasional', head: 'Wahyu Hidayat', expected: 16, reported: 15, onLeave: 0, missing: [P('u-galih', 'Teguh Santoso', 50)] },
      { id: 'dv-huk', name: 'Hukum', head: 'Ratna Sari', expected: 5, reported: 5, onLeave: 0, missing: [] },
    ],
  },
  unlocks: { pending: 1, approved: 0 },
  canManageReminders: true,
}

/** Meja akun terbatas Admin PT: hanya PT Ratu Karya. */
function scopedCompanies() {
  const ratu = mock.companies.companies.filter((c) => c.id === 'c-ratu')
  return json({ ...mock.companies, companies: ratu, holdingUsers: [], me: 'u-maya', scope: 'ENTITY', canManageCompanies: false, manageableRoles: ['ADMIN_PT', 'KEPALA_DIVISI', 'PIC_PROYEK'] })
}

// ------------------------------------------------------------------
// [F2-ADMIN] Kepatuhan per divisi, pengingat per orang, log aktivitas, unduh log,
// pilihan formulir permintaan akses, keanggotaan divisi di sheet akun.
// ------------------------------------------------------------------

const DAY = 86400000
function workingDays(n: number): string[] {
  const out: string[] = []
  const wibMidnight = (t: number) => {
    const w = new Date(t + 7 * HOUR)
    return Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - 7 * HOUR
  }
  for (let t = wibMidnight(now); out.length < n; t -= DAY) {
    const dow = new Date(t + 7 * HOUR).getUTCDay()
    if (dow !== 0 && dow !== 6) out.unshift(new Date(t).toISOString())
  }
  return out
}
const days = workingDays(10)
const monday = (() => {
  const t = Date.parse(days[days.length - 1])
  const dow = new Date(t + 7 * HOUR).getUTCDay() || 7
  return t - (dow - 1) * DAY
})()
const handoverBy = new Date(monday + 3 * DAY + 17 * HOUR).toISOString()
const lockAt = new Date(monday + 4 * DAY + 17 * HOUR).toISOString()

const person = (id: string, name: string, h: number | null, projects: string[], remindedAt: string | null = null) => ({
  id,
  name,
  role: 'Manager / PIC proyek',
  lastReportAt: h === null ? null : ago(h),
  remindedAt,
  projects,
})
const DV = (o: Omit<DivisionCompliance, 'entityId' | 'onLeave'> & { onLeave?: number }): DivisionCompliance => ({ entityId: 'e1', onLeave: 0, ...o })

const compliance: ComplianceData = {
  today: days[days.length - 1],
  days,
  locked: false,
  week: { isoYear: 2026, isoWeek: 41, handoverBy, lockAt, handoverPassed: Date.now() >= Date.parse(handoverBy) },
  totals: { expected: 50, reported: 46, onLeave: 1, reminded: 0, unassigned: 2 },
  canRemind: true,
  divisions: [
    DV({
      id: 'dv-tek', name: 'Teknologi', head: { id: 'u-andi', name: 'Andi Wijaya', email: 'andi.wijaya@karya.co.id', phone: '0812 3456 7801' },
      expected: 6, reported: 5, missing: [person('u-yoga', 'Yoga Saputra', 26, ['Aplikasi Absensi'])],
      history: [100, 100, 83, 100, 100, 83, 100, 100, 100, 83],
      weekly: { state: 'MASUK', statusHeader: 'DISETUJUI', submittedAt: ago(30), approvedAt: ago(28), forwardedAt: null },
    }),
    DV({
      id: 'dv-keu', name: 'Keuangan', head: { id: 'u-sari', name: 'Sari Widodo', email: 'sari.widodo@karya.co.id', phone: null },
      expected: 8, reported: 8, onLeave: 1, missing: [],
      history: [100, 88, 100, 100, 100, 100, 88, 100, 100, 100],
      weekly: { state: 'MASUK', statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: ago(20), approvedAt: null, forwardedAt: null },
    }),
    DV({
      id: 'dv-med', name: 'Media', head: { id: 'u-lina', name: 'Lina Marlina', email: 'lina.marlina@karya.co.id', phone: '0813 2222 9090' },
      expected: 8, reported: 6,
      missing: [person('u-dodi', 'Dodi Firmansyah', 30, ['Kampanye Ulang Tahun']), person('u-rara', 'Rara Anindya', null, ['Video Profil Perusahaan'])],
      history: [75, 88, 75, 63, 88, 75, 75, 88, 75, 75],
      weekly: { state: 'TERLAMBAT', statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: ago(4), approvedAt: null, forwardedAt: null },
    }),
    DV({
      id: 'dv-sdm', name: 'SDM', head: { id: 'u-bayu', name: 'Bayu Nugroho', email: 'bayu.nugroho@karya.co.id', phone: null },
      expected: 7, reported: 7, missing: [],
      history: [100, 100, 100, 86, 100, 100, 100, 100, 100, 100],
      weekly: { state: 'MASUK', statusHeader: 'DISETUJUI', submittedAt: ago(32), approvedAt: ago(31), forwardedAt: ago(26) },
    }),
    DV({
      id: 'dv-ops', name: 'Operasional', head: { id: 'u-wahyu', name: 'Wahyu Hidayat', email: 'wahyu.hidayat@karya.co.id', phone: '0811 7000 1234' },
      expected: 16, reported: 15, missing: [person('u-teguh', 'Teguh Santoso', 50, ['Gudang Distribusi Timur', 'Armada Logistik'])],
      history: [94, 88, 94, 100, 94, 88, 94, 100, 94, 94],
      weekly: { state: 'BELUM', statusHeader: 'DRAFT', submittedAt: null, approvedAt: null, forwardedAt: null },
    }),
    DV({
      id: 'dv-huk', name: 'Hukum', head: { id: 'u-ratna', name: 'Ratna Sari', email: 'ratna.sari@karya.co.id', phone: null },
      expected: 5, reported: 5, missing: [],
      history: [100, 100, 100, 100, 80, 100, 100, 100, 100, 100],
      weekly: { state: 'BELUM', statusHeader: null, submittedAt: null, approvedAt: null, forwardedAt: null },
    }),
  ],
}

function remindCompliance(init?: RequestInit) {
  const b = body(init)
  const at = new Date().toISOString()
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

const requesterUsers = [
  { id: 'pratinjau-KEPALA_DIVISI', name: 'Andi Wijaya', role: 'KEPALA_DIVISI', roleLabel: 'Kepala divisi', divisionName: 'Teknologi', isActive: true },
  { id: 'pratinjau-PIC_PROYEK', name: 'Rina Kartika', role: 'PIC_PROYEK', roleLabel: 'Manager / PIC proyek', divisionName: 'Teknologi', isActive: true },
  { id: 'u-yoga', name: 'Yoga Saputra', role: 'PIC_PROYEK', roleLabel: 'Manager / PIC proyek', divisionName: 'Teknologi', isActive: true },
  { id: 'u-fajar', name: 'Fajar Ramadhan', role: 'PIC_PROYEK', roleLabel: 'Manager / PIC proyek', divisionName: 'Teknologi', isActive: false },
]
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
  if (path === '/api/admin/compliance') return json(compliance)
  if (path === '/api/admin/compliance/remind') return remindCompliance(init)
  if (path === '/api/admin/activity') return json({ items: activity.slice(0, 12) })
  if (path === '/api/audit-logs/export') return exportCsv()
  if (path === '/api/access-requests/options') return requestOptions(role)
  if (path === '/api/companies/users' && method === 'GET' && url.includes('id=')) {
    const id = new URL(url, 'http://x').searchParams.get('id')
    const u = mock.companies.companies.flatMap((c) => c.users).find((x) => x.id === id)
    return json({ id, memberDivisionId: u?.role === 'PIC_PROYEK' ? (mock.companies.companies.find((c) => c.users.includes(u))?.divisions[0]?.id ?? null) : null })
  }
  if (path === '/api/access-requests') return accessRequests(url, init, role)
  if (path === '/api/admin/reminder-rules') return reminderRules(init)
  if (path === '/api/admin/overview') return json(overview)
  if (path === '/api/unlock-requests') return unlockRequests(init)
  // Hanya panggilan kartu Admin (penanda ?for=…) supaya rute area lain tidak tertimpa.
  if (url.includes('for=unlock') && path === '/api/daily-reports') return json({ items: dailyCandidates, total: dailyCandidates.length })
  if (url.includes('for=unlock') && path === '/api/weekly-reports') return json({ items: weeklyCandidates, total: weeklyCandidates.length })
  if (url.includes('for=access') && path === '/api/companies' && role === 'ADMIN_PT') return scopedCompanies()
  return null
}
