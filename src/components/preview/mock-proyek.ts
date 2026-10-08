/**
 * [F3-A] Rute pratinjau untuk modul proyek, eskalasi, dan arsip laporan
 * mingguan: /api/projects (daftar, opsi formulir, ajukan, ubah, hapus),
 * /api/projects/approve, /api/escalations, /api/escalations/actions, dan
 * /api/weekly-reports. /api/deadline-proposals sudah ditangani mock-pic (PIC)
 * dan mock-oversight (peran lain), jadi tidak diulang di sini.
 *
 * Bentuk respons mengikuti route sungguhan (src/app/api/...). Mutasi mengubah
 * data di memori agar muat ulang konsisten; laporan harian & task dibaca dari
 * mock-laporan, laporan mingguan berjalan dari mock-data (weeklyInput,
 * deskAdmin). Hanya mode pengembangan.
 */

import * as mock from './mock-data'
import { divisions as catalogDivisions, people, groupRoles, actor } from './mock-catalog'
import { deriveProjectStatus } from '@/lib/project-status'
import { ENTITIES, dailyProjects, deskWeeklyReports, findTask, markTaskEscalated } from './mock-laporan'
import { approvalChainFor, can, canSignSlot, isMasterRole, pendingSlot, PROJECT_ENTITY_SLOTS } from '@/lib/rbac'
import { NO_APPROVAL_LABEL, PROJECT_APPROVER_LABELS } from '@/lib/constants'
import { isoWeekOf, startOfWibDay, weeklyDeadlines } from '@/lib/lock'

// ------------------------------------------------------------------
// Utilitas
// ------------------------------------------------------------------

const HOUR = 3600000
const DAY = 86400000
const json = (b: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } }))
const body = (init?: RequestInit): Record<string, unknown> => {
  try {
    return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
  } catch {
    return {}
  }
}
const params = (url: string) => new URL(url, 'http://pratinjau.local').searchParams
let seq = 0
const uid = (p: string) => `${p}-${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`
const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const ahead = (days: number) => new Date(startOfWibDay(new Date()).getTime() + days * DAY).toISOString()

const GROUP_ROLES = ['MANAJEMEN', 'SUPERADMIN', 'DIREKTUR_SDM_GA', 'TI', 'AUDITOR']
const NAMES: Record<string, string> = {
  MANAJEMEN: 'Ris Hartanto', DIREKTUR_ENTITAS: 'Hadi Santoso', KEPALA_DIVISI: 'Andi Wijaya', ADMIN_PT: 'Maya Lestari',
  PIC_PROYEK: 'Rina Kartika', SUPERADMIN: 'Super Admin', DIREKTUR_SDM_GA: 'Dewi Kartika', TI: 'Tim TI', AUDITOR: 'Yusuf Pratama',
}
type Viewer = { id: string; name: string; role: string; scopeEntityId: string | null }
const viewer = (role: string): Viewer => ({ id: `pratinjau-${role}`, name: NAMES[role] ?? 'Pratinjau', role, scopeEntityId: GROUP_ROLES.includes(role) ? null : 'e1' })
/** null = seluruh grup; selain itu daftar PT yang terjangkau (scopeEntityIds). */
const scopeIds = (v: Viewer) => (v.scopeEntityId ? [v.scopeEntityId] : null)
const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@karya.co.id`

type UndoFn = () => { ok: true; message: string } | { ok: false; status: number; error: string }
const undoTokens: Record<string, { fn: UndoFn; actor: string; at: number; used: boolean }> = {}
function issueUndo(actor: string, fn: UndoFn) {
  const token = `pvp${(++seq).toString(36)}${Math.random().toString(36).slice(2, 8)}`
  undoTokens[token] = { fn, actor, at: Date.now(), used: false }
  return token
}

// ------------------------------------------------------------------
// Proyek
// ------------------------------------------------------------------

type Slot = { role: string; decision: 'DISETUJUI' | 'DITOLAK'; note: string | null; decidedAt: string; decidedByName: string }
type Proj = {
  id: string
  code: string
  name: string
  phase: string
  lifecycle: string
  entityId: string
  picUserId: string | null
  picName: string | null
  divisionId: string | null
  description: string | null
  purpose: string | null
  proposedBy: { id: string; name: string; role: string } | null
  proposedAt: string | null
  approvalChain: string[]
  approvals: Slot[]
  related: string[]
  startDate: string | null
  targetEndDate: string | null
  approvedByName: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  /** Riwayat laporan contoh bila proyek tidak ada di meja laporan harian. */
  fallbackReport: { status: string; progressPct: number; days: number; isLate: boolean } | null
}

const DIVISIONS = Object.fromEntries(Object.keys(ENTITIES).map((id) => [id, catalogDivisions.filter((d) => d.entityId === id)]))
const PIC_CANDIDATES = Object.fromEntries(Object.keys(ENTITIES).map((id) => [id, people.filter((p) => p.scopeEntityId === id && p.role === 'PIC_PROYEK')]))
const PHASES = ['INISIASI', 'PERENCANAAN', 'PELAKSANAAN', 'PENYELESAIAN']
const MANAGED = ['AKTIF', 'DITUTUP', 'DIARSIPKAN']

const DESC = 'Proyek ini mendukung target kerja tahunan perusahaan dengan hasil yang terukur dan terdokumentasi.'
const base = (o: Partial<Proj> & Pick<Proj, 'id' | 'code' | 'name' | 'entityId'>): Proj => ({
  phase: 'PELAKSANAAN', lifecycle: 'AKTIF', picUserId: null, picName: null, divisionId: null, description: DESC, purpose: null,
  proposedBy: null, proposedAt: ago(60), approvalChain: [], approvals: [], related: [], startDate: ago(40), targetEndDate: ahead(30),
  approvedByName: 'Hadi Santoso', approvedAt: ago(58), createdAt: ago(60), updatedAt: ago(1), fallbackReport: null, ...o,
})

/** Rincian proyek yang juga dilaporkan harian (id sama dengan mock-laporan / meja kerja Admin PT). */
const DAILY_DETAIL: Record<string, Partial<Proj>> = {
  p1: { divisionId: 'dv-tek', startDate: ago(50), targetEndDate: ahead(12), picUserId: 'u-p1' },
  p2: { divisionId: 'dv-tek', startDate: ago(40), targetEndDate: ahead(19), picUserId: 'pratinjau-PIC_PROYEK', related: ['e2'] },
  p3: { divisionId: 'dv-tek', phase: 'PENYELESAIAN', startDate: ago(60), targetEndDate: ahead(4), picUserId: 'u-p3' },
  p4: { divisionId: 'dv-tek', phase: 'PERENCANAAN', startDate: ago(25), targetEndDate: ahead(35), picUserId: 'u-p4', fallbackReport: { status: 'ON_PROGRESS', progressPct: 18, days: 1, isLate: false } },
  p5: { divisionId: 'dv-ops', startDate: ago(30), targetEndDate: ahead(45), picUserId: 'u-p5' },
  p6: { divisionId: 'dv-keu', phase: 'PERENCANAAN', startDate: ago(5), targetEndDate: ahead(80), fallbackReport: { status: 'ON_PROGRESS', progressPct: 6, days: 1, isLate: false } },
  p7: { divisionId: 'dv-med', startDate: ago(20), targetEndDate: ahead(21), picUserId: 'u-p7' },
  sg1: { divisionId: 'dv-sg-tek', phase: 'PERENCANAAN', startDate: ago(20), targetEndDate: ahead(30), picUserId: 'u-dimas', approvedByName: 'Wahyu Hidayat' },
  bm1: { divisionId: 'dv-bm-huk', phase: 'PENYELESAIAN', startDate: ago(45), targetEndDate: ahead(6), picUserId: 'u-bm-pic', approvedByName: 'Sri Rahayu', fallbackReport: { status: 'ON_PROGRESS', progressPct: 81, days: 1, isLate: false } },
}

const projects: Proj[] = [
  ...dailyProjects().map((p) =>
    base({ id: p.id, code: p.code, name: p.name, entityId: p.entityId, phase: p.phase, picName: p.picName, ...(DAILY_DETAIL[p.id] ?? {}) })
  ),
  base({
    id: 'sg2', code: 'SGD-PRJ-02', name: 'Portal Pelanggan', entityId: 'e2', picUserId: 'u-sari2', picName: 'Sekar Wulandari', divisionId: 'dv-sg-kom',
    startDate: ago(25), targetEndDate: ahead(35), approvedByName: 'Wahyu Hidayat', fallbackReport: { status: 'ON_PROGRESS', progressPct: 55, days: 0, isLate: false },
  }),
  base({
    id: 'sg3', code: 'SGD-PRJ-03', name: 'Pelatihan K3 Gudang', entityId: 'e2', picUserId: 'u-dimas', picName: 'Dimas Saputra', divisionId: 'dv-sg-tek',
    startDate: ago(10), targetEndDate: ahead(40), approvedByName: 'Wahyu Hidayat', fallbackReport: { status: 'ON_PROGRESS', progressPct: 40, days: 1, isLate: false },
  }),
  base({
    id: 'bm2', code: 'BML-PRJ-02', name: 'Kampanye Media Oktober', entityId: 'e3', picUserId: 'u-maya3', picName: 'Maya Anggraini', divisionId: 'dv-bm-hum',
    startDate: ago(30), targetEndDate: ago(5), approvedByName: 'Sri Rahayu', fallbackReport: { status: 'TERKENDALA', progressPct: 48, days: 1, isLate: true },
  }),
  base({
    id: 'bm3', code: 'BML-PRJ-03', name: 'Digitalisasi Arsip', entityId: 'e3', phase: 'PERENCANAAN', picUserId: 'u-maya3', picName: 'Maya Anggraini',
    divisionId: 'dv-bm-huk', startDate: ago(5), targetEndDate: ahead(60), approvedByName: 'Sri Rahayu', fallbackReport: { status: 'ON_PROGRESS', progressPct: 22, days: 0, isLate: false },
  }),
  // [T3-A4] PT. SPKD — tiga proyek contoh drill-down "Laporan per perusahaan"
  // (dashboard Manajemen per perusahaan). Nama dipakai persisi oleh tes pratinjau.
  base({
    id: 'sp1', code: 'SPK-PRJ-01', name: 'SIM RS', entityId: 'e4', picName: 'Tio Prasetyo',
    startDate: ago(80), targetEndDate: ahead(40), fallbackReport: { status: 'ON_PROGRESS', progressPct: 64, days: 1, isLate: false },
  }),
  base({
    id: 'sp2', code: 'SPK-PRJ-02', name: 'MEDCREATIX', entityId: 'e4', picName: 'Mira Anjani',
    startDate: ago(60), targetEndDate: ahead(12), fallbackReport: { status: 'TERKENDALA', progressPct: 46, days: 1, isLate: false },
  }),
  base({
    id: 'sp3', code: 'SPK-PRJ-03', name: 'MEDPAY', entityId: 'e4', picName: 'Galih Purnama',
    startDate: ago(30), targetEndDate: ahead(25), fallbackReport: { status: 'ON_PROGRESS', progressPct: 25, days: 1, isLate: false },
  }),
  // Pengajuan
  base({
    id: 'pp1', code: 'RTK-PRJ-08', name: 'Digitalisasi Arsip Kontrak', entityId: 'e1', phase: 'INISIASI', lifecycle: 'DIUSULKAN', picUserId: 'pratinjau-PIC_PROYEK',
    picName: 'Rina Kartika', divisionId: 'dv-keu', purpose: 'Arsip kontrak mudah dicari dan tidak hilang saat audit.',
    description: 'Memindai dan mengindeks 4.200 berkas kontrak vendor 2019–2026 ke penyimpanan dokumen perusahaan.',
    proposedBy: { id: 'pratinjau-PIC_PROYEK', name: 'Rina Kartika', role: 'PIC_PROYEK' }, proposedAt: ago(2), approvalChain: ['ADMIN_PT', 'DIREKTUR_ENTITAS'],
    startDate: ahead(7), targetEndDate: ahead(90), approvedByName: null, approvedAt: null, createdAt: ago(2), updatedAt: ago(2),
  }),
  base({
    id: 'pp2', code: 'RTK-PRJ-09', name: 'Otomasi Rekonsiliasi Bank', entityId: 'e1', phase: 'PERENCANAAN', lifecycle: 'DIUSULKAN', picUserId: 'u-p5',
    picName: 'Bayu Prakoso', divisionId: 'dv-keu', description: 'Mencocokkan mutasi rekening dengan jurnal secara otomatis setiap pagi untuk 6 rekening operasional.',
    proposedBy: { id: 'pratinjau-ADMIN_PT', name: 'Maya Lestari', role: 'ADMIN_PT' }, proposedAt: ago(3), approvalChain: ['DIREKTUR_ENTITAS'],
    startDate: ahead(14), targetEndDate: ahead(75), approvedByName: null, approvedAt: null, createdAt: ago(3), updatedAt: ago(3),
  }),
  base({
    id: 'd1', code: 'RTK-PRJ-10', name: 'Sistem Antrean Klinik', entityId: 'e1', phase: 'INISIASI', lifecycle: 'DIUSULKAN', divisionId: 'dv-tek',
    description: 'Antrean daring untuk klinik karyawan agar waktu tunggu turun dan jadwal dokter terbaca dari ponsel.',
    proposedBy: { id: 'pratinjau-DIREKTUR_ENTITAS', name: 'Hadi Santoso', role: 'DIREKTUR_ENTITAS' }, proposedAt: ago(1), approvalChain: ['MANAJEMEN'],
    startDate: ahead(10), targetEndDate: ahead(100), approvedByName: null, approvedAt: null, createdAt: ago(1), updatedAt: ago(1),
  }),
  base({
    id: 'd2', code: 'SGD-PRJ-04', name: 'Pengadaan Armada Listrik', entityId: 'e2', phase: 'INISIASI', lifecycle: 'DIUSULKAN', divisionId: 'dv-sg-kom',
    description: 'Mengganti 12 kendaraan operasional berbahan bakar minyak dengan kendaraan listrik secara bertahap.',
    proposedBy: { id: 'u-wahyu', name: 'Wahyu Hidayat', role: 'DIREKTUR_ENTITAS' }, proposedAt: ago(0.1), approvalChain: ['MANAJEMEN'], related: ['e1'],
    startDate: ahead(30), targetEndDate: ahead(200), approvedByName: null, approvedAt: null, createdAt: ago(0.1), updatedAt: ago(0.1),
  }),
  base({
    id: 'px1', code: 'RTK-PRJ-11', name: 'Aplikasi Kasir Kantin', entityId: 'e1', phase: 'INISIASI', lifecycle: 'DITOLAK', picUserId: 'pratinjau-PIC_PROYEK',
    picName: 'Rina Kartika', description: 'Kasir digital untuk kantin karyawan dengan potong gaji otomatis setiap akhir bulan.',
    proposedBy: { id: 'pratinjau-PIC_PROYEK', name: 'Rina Kartika', role: 'PIC_PROYEK' }, proposedAt: ago(6), approvalChain: ['ADMIN_PT', 'DIREKTUR_ENTITAS'],
    approvals: [{ role: 'ADMIN_PT', decision: 'DITOLAK', note: 'Lengkapi perkiraan biaya dan persetujuan pengelola kantin.', decidedAt: ago(5), decidedByName: 'Maya Lestari' }],
    startDate: null, targetEndDate: null, approvedByName: null, approvedAt: null, createdAt: ago(6), updatedAt: ago(5),
  }),
  // Selesai & arsip
  base({
    id: 'pc1', code: 'RTK-PRJ-05', name: 'Pembaruan Jaringan Kantor', entityId: 'e1', phase: 'PENYELESAIAN', lifecycle: 'DITUTUP', picUserId: 'u-p1',
    picName: 'Yoga Saputra', divisionId: 'dv-tek', startDate: ago(120), targetEndDate: ago(20), fallbackReport: { status: 'SELESAI', progressPct: 100, days: 21, isLate: false },
  }),
  base({
    id: 'pa1', code: 'RTK-PRJ-02', name: 'Survei Kepuasan Karyawan 2025', entityId: 'e1', phase: 'PENYELESAIAN', lifecycle: 'DIARSIPKAN', picUserId: 'u-p4',
    picName: 'Sari Wulandari', divisionId: 'dv-ops', startDate: ago(300), targetEndDate: ago(220), fallbackReport: { status: 'SELESAI', progressPct: 100, days: 221, isLate: false },
  }),
]

function inProjectScope(p: Proj, role: string) {
  if (role === 'PIC_PROYEK') return p.picUserId === actor(role).id
  if (role === 'KEPALA_DIVISI') return catalogDivisions.some((d) => d.id === p.divisionId && d.headId === actor(role).id)
  return groupRoles.includes(role) || p.entityId === 'e1'
}

/** Satu proyeksi proyek, dipakai Ringkasan, Tim, Sheet entitas dan pencarian. */
export function projectSnapshots(role: string) {
  return projects.filter((p) => inProjectScope(p, role)).map((p) => {
    const latest = latestReport(p)
    const live = dailyProjects().find((d) => d.id === p.id)?.report
    return {
      ...format(p, viewer(role)),
      ...deriveProjectStatus({ lifecycle: p.lifecycle, targetEndDate: p.targetEndDate ? new Date(p.targetEndDate) : null }, latest ? { ...latest, reportDate: new Date(latest.reportDate), obstacle: live?.obstacle ?? null, needsEscalation: live?.needsEscalation ?? false } : null),
      entityId: p.entityId, entityName: ENTITIES[p.entityId].name, entityCode: ENTITIES[p.entityId].code,
      divisionName: catalogDivisions.find((d) => d.id === p.divisionId)?.name ?? null,
      pic: p.picName, reportedToday: Boolean(live?.submittedAt), lastReportAt: live?.submittedAt ?? null,
      lastNote: live?.achievementToday ?? live?.achievement ?? null,
    }
  })
}

const DAILY_IDS = new Set(dailyProjects().map((p) => p.id))

function latestReport(p: Proj) {
  const today = startOfWibDay(new Date())
  const live = dailyProjects().find((x) => x.id === p.id)
  if (live) {
    const r = live.report
    if (r) return { status: r.status, progressPct: r.progressPct, reportDate: today.toISOString(), isLate: r.isLate }
  }
  const f = p.fallbackReport
  return f && p.lifecycle !== 'DIUSULKAN' && p.lifecycle !== 'DITOLAK'
    ? { status: f.status, progressPct: f.progressPct, reportDate: new Date(today.getTime() - f.days * DAY).toISOString(), isLate: f.isLate }
    : null
}

function canManage(v: Viewer, p: Proj) {
  if (isMasterRole(v.role)) return true
  if (can(v.role, 'project:manage') && v.scopeEntityId === p.entityId) return true
  return p.proposedBy?.id === v.id && (p.lifecycle === 'DIUSULKAN' || p.lifecycle === 'DITOLAK')
}
function canSetLifecycle(v: Viewer, p: Proj) {
  if (isMasterRole(v.role)) return true
  return can(v.role, 'project:manage') && v.scopeEntityId === p.entityId && p.lifecycle !== 'DIUSULKAN'
}
const approvedRoles = (p: Proj) => p.approvals.filter((a) => a.decision === 'DISETUJUI').map((a) => a.role)

function format(p: Proj, v: Viewer) {
  const pending = p.lifecycle === 'DIUSULKAN' ? pendingSlot(p.approvalChain, approvedRoles(p)) : null
  const e = ENTITIES[p.entityId]
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    phase: p.phase,
    lifecycle: p.lifecycle,
    picName: p.picName,
    picUserId: p.picUserId,
    divisionId: p.divisionId,
    division: (DIVISIONS[p.entityId] ?? []).find((d) => d.id === p.divisionId) ?? null,
    description: p.description,
    purpose: p.purpose,
    proposedBy: p.proposedBy,
    proposedAt: p.proposedAt,
    approvalChain: p.approvalChain,
    pendingRole: pending,
    approvals: p.approvalChain.map((role) => {
      const a = p.approvals.find((x) => x.role === role)
      return a
        ? { role, decision: a.decision, note: a.note, decidedAt: a.decidedAt, decidedByName: a.decidedByName }
        : { role, decision: null, note: null, decidedAt: null, decidedByName: null }
    }),
    relatedEntities: p.related.map((id) => ({ id, name: ENTITIES[id].name, code: ENTITIES[id].code })),
    startDate: p.startDate,
    targetEndDate: p.targetEndDate,
    approvedByName: p.approvedByName,
    approvedAt: p.approvedAt,
    noApproval: p.approvalChain.length === 0 && p.approvedByName === NO_APPROVAL_LABEL,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    entity: e,
    latestReport: latestReport(p),
    permissions: {
      manage: canManage(v, p),
      setLifecycle: canSetLifecycle(v, p),
      approve: pending !== null && canSignSlot(v, pending, p.entityId),
      resubmit: p.lifecycle === 'DITOLAK' && canManage(v, p),
    },
  }
}

function proposalEntity(v: Viewer, requested: string | null) {
  const id = isMasterRole(v.role) || can(v.role, 'group:read') ? (v.scopeEntityId ?? requested) : v.scopeEntityId
  return id && ENTITIES[id] ? ENTITIES[id] : null
}

function readFields(b: Record<string, unknown>, entityId: string, partial: boolean) {
  const has = (k: string) => b[k] !== undefined
  const errors: string[] = []
  const data: Partial<Proj> = {}
  if (!partial || has('name')) {
    const name = str(b.name)
    if (name.length < 5) errors.push('Nama proyek minimal 5 karakter.')
    else data.name = name
  }
  if (!partial || has('description')) {
    const d = str(b.description)
    if (d.length < 20) errors.push('Jelaskan proyeknya minimal 20 karakter agar penyetuju paham.')
    else data.description = d
  }
  if (has('purpose')) data.purpose = str(b.purpose, 2000) || null
  if (!partial || has('phase')) {
    const phase = str(b.phase)
    if (phase && !PHASES.includes(phase)) errors.push('Tahap tidak dikenali.')
    else data.phase = phase || 'INISIASI'
  }
  for (const k of ['startDate', 'targetEndDate'] as const) {
    if (!has(k)) continue
    const raw = str(b[k], 40)
    if (!raw) data[k] = null
    else if (Number.isNaN(Date.parse(raw))) errors.push('Format tanggal tidak valid.')
    else data[k] = new Date(raw).toISOString()
  }
  if (has('picUserId')) {
    const id = str(b.picUserId, 64)
    if (!id) Object.assign(data, { picUserId: null, picName: null })
    else {
      const pic = (PIC_CANDIDATES[entityId] ?? []).find((c) => c.id === id)
      if (!pic) errors.push('PIC yang dipilih bukan Manager/PIC Proyek aktif di PT ini.')
      else Object.assign(data, { picUserId: pic.id, picName: pic.name })
    }
  }
  if (has('divisionId')) {
    const id = str(b.divisionId, 64)
    if (!id) data.divisionId = null
    else if (!(DIVISIONS[entityId] ?? []).some((d) => d.id === id)) errors.push('Divisi yang dipilih bukan divisi aktif di PT ini.')
    else data.divisionId = id
  }
  if (has('relatedEntityIds')) {
    const raw = b.relatedEntityIds
    if (!Array.isArray(raw)) errors.push('Daftar PT terkait tidak valid.')
    else {
      const ids = Array.from(new Set(raw.filter((x): x is string => typeof x === 'string' && x !== entityId))).slice(0, 50)
      if (ids.some((id) => !ENTITIES[id])) errors.push('Ada PT terkait yang tidak dikenali.')
      else data.related = ids
    }
  }
  return { errors, data }
}

function projectsRoute(url: string, init: RequestInit | undefined, role: string): Promise<Response> {
  const method = init?.method ?? 'GET'
  const v = viewer(role)
  const sp = params(url)

  if (method === 'GET') {
    if (sp.get('options') === '1') {
      if (!can(role, 'project:propose') && !can(role, 'project:manage')) return json({ error: 'Tidak diizinkan' }, 403)
      const e = proposalEntity(v, sp.get('entityId'))
      return json({
        entity: e ? { id: e.id, code: e.code, name: e.name } : null,
        entityPinned: Boolean(v.scopeEntityId),
        entities: Object.values(ENTITIES).map((x) => ({ id: x.id, code: x.code, name: x.name })),
        candidates: e
          ? (PIC_CANDIDATES[e.id] ?? []).map((c) => ({ ...c, activeProjects: projects.filter((p) => p.picUserId === c.id && p.lifecycle === 'AKTIF').length }))
          : [],
        divisions: e ? (DIVISIONS[e.id] ?? []) : [],
        chain: approvalChainFor(role),
        picIsSelf: role === 'PIC_PROYEK',
      })
    }
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '20', 10) || 20))
    const id = sp.get('id') || ''
    const lifecycle = sp.get('lifecycle') || 'AKTIF'
    const phase = sp.get('phase') || ''
    const search = (sp.get('search') || '').toLowerCase()
    const entityId = sp.get('entityId') || ''
    const scope = scopeIds(v)
    const order = (s: string) => s
    const list = projects
      .filter((p) => !id || p.id === id)
      .filter((p) => (lifecycle === 'ALL' ? true : p.lifecycle === lifecycle))
      .filter((p) => !phase || p.phase === phase)
      .filter((p) => !search || p.name.toLowerCase().includes(search))
      .filter((p) => !scope || scope.includes(p.entityId) || p.related.some((r) => scope.includes(r)))
      .filter((p) => !entityId || p.entityId === entityId || p.related.includes(entityId))
      .sort((a, b) => order(a.lifecycle).localeCompare(order(b.lifecycle)) || a.code.localeCompare(b.code))
    const summary = { running: 0, waiting: 0, resubmit: 0, late: 0, risk: 0, silent: 0 }
    for (const p of list) {
      const permissions = format(p, v).permissions
      if (p.lifecycle === 'DIUSULKAN' && permissions.approve) summary.waiting++
      if (permissions.resubmit) summary.resubmit++
      if (p.lifecycle !== 'AKTIF') continue
      summary.running++
      const report = latestReport(p)
      const state = deriveProjectStatus({ lifecycle: p.lifecycle, targetEndDate: p.targetEndDate ? new Date(p.targetEndDate) : null }, report ? { ...report, obstacle: null, needsEscalation: false, reportDate: new Date(report.reportDate) } : null).status
      if (state === 'late') summary.late++
      if (state === 'risk') summary.risk++
      if (!report) summary.silent++
    }
    return json({ items: list.slice((page - 1) * pageSize, page * pageSize).map((p) => format(p, v)), total: list.length, page, pageSize, summary })
  }

  if (method === 'DELETE') {
    const p = projects.find((x) => x.id === sp.get('id'))
    if (!p) return json({ error: 'Proyek tidak ditemukan' }, 404)
    if (!canManage(v, p)) return json({ error: 'Anda tidak berwenang menghapus proyek ini' }, 403)
    const activity = DAILY_IDS.has(p.id) || p.fallbackReport ? 12 : 0
    if (activity > 0) {
      return json(
        { error: `Proyek ini sudah punya ${activity} laporan/task, jadi tidak dihapus agar riwayatnya utuh. Arsipkan saja.`, activity, canArchive: canSetLifecycle(v, p) },
        409
      )
    }
    projects.splice(projects.indexOf(p), 1)
    return json({ ok: true })
  }

  const b = body(init)

  if (method === 'POST') {
    if (!can(role, 'project:propose')) return json({ error: 'Peran Anda tidak mengajukan proyek' }, 403)
    const e = proposalEntity(v, typeof b.entityId === 'string' ? b.entityId : null)
    if (!e) return json({ error: 'Proyek harus diajukan untuk sebuah PT yang aktif' }, 400)
    const { errors, data } = readFields(b, e.id, false)
    if (data.startDate && data.targetEndDate && Date.parse(data.targetEndDate) <= Date.parse(data.startDate)) errors.push('Target selesai harus setelah rencana mulai.')
    if (errors.length) return json({ error: errors[0], errors }, 422)
    const roleChain = approvalChainFor(role)
    const skip = b.skipApproval === true && roleChain.length > 0
    if (skip && (data.phase ?? 'INISIASI') !== 'INISIASI') return json({ error: 'Pengajuan tanpa persetujuan hanya untuk tahap awal (Inisiasi).' }, 422)
    const chain = skip ? [] : roleChain
    const active = chain.length === 0
    const n = projects.filter((p) => p.entityId === e.id).length + 1
    const now = new Date().toISOString()
    const p = base({
      id: uid('prj'), code: `${e.code}-PRJ-${String(n).padStart(2, '0')}`, name: data.name!, entityId: e.id, ...data,
      lifecycle: active ? 'AKTIF' : 'DIUSULKAN', approvalChain: chain, proposedBy: { id: v.id, name: v.name, role }, proposedAt: now,
      approvedAt: active ? now : null, approvedByName: active ? (skip ? NO_APPROVAL_LABEL : v.name) : null, createdAt: now, updatedAt: now,
      startDate: data.startDate ?? null, targetEndDate: data.targetEndDate ?? null,
    })
    projects.push(p)
    return json({ ok: true, project: format(p, v) })
  }

  // PATCH
  const p = projects.find((x) => x.id === b.id)
  if (!p) return json({ error: 'Proyek tidak ditemukan' }, 404)
  if (!canManage(v, p)) return json({ error: 'Anda tidak berwenang mengubah proyek ini' }, 403)
  if (b.resubmit === true) {
    if (p.lifecycle !== 'DITOLAK') return json({ error: 'Hanya pengajuan yang ditolak yang bisa diajukan ulang' }, 409)
    const before = { lifecycle: p.lifecycle, approvals: p.approvals, proposedAt: p.proposedAt, approvedAt: p.approvedAt, approvedByName: p.approvedByName }
    const active = p.approvalChain.length === 0
    const now = new Date().toISOString()
    Object.assign(p, { approvals: [], lifecycle: active ? 'AKTIF' : 'DIUSULKAN', proposedAt: now, updatedAt: now, ...(active ? { approvedAt: now, approvedByName: v.name } : {}) })
    const stamp = p.updatedAt
    const undoToken = issueUndo(v.id, () => {
      if (p.updatedAt !== stamp) return { ok: false, status: 409, error: 'Proyek ini sudah berubah sejak diajukan ulang.' }
      Object.assign(p, before, { updatedAt: new Date().toISOString() })
      return { ok: true, message: 'Pengajuan ulang diurungkan.' }
    })
    return json({ ok: true, project: format(p, v), undoToken })
  }
  const { errors, data } = readFields(b, p.entityId, true)
  const start = data.startDate !== undefined ? data.startDate : p.startDate
  const end = data.targetEndDate !== undefined ? data.targetEndDate : p.targetEndDate
  if (start && end && Date.parse(end) <= Date.parse(start)) errors.push('Target selesai harus setelah rencana mulai.')
  const before = { lifecycle: p.lifecycle, approvedAt: p.approvedAt, approvedByName: p.approvedByName }
  if (typeof b.lifecycle === 'string' && b.lifecycle !== p.lifecycle) {
    if (!MANAGED.includes(b.lifecycle)) errors.push('Status tidak dikenali.')
    else if (!canSetLifecycle(v, p)) errors.push('Anda tidak berwenang mengganti status proyek ini.')
    else {
      data.lifecycle = b.lifecycle
      if (b.lifecycle === 'AKTIF' && !p.approvedAt) Object.assign(data, { approvedAt: new Date().toISOString(), approvedByName: v.name })
    }
  }
  if (errors.length) return json({ error: errors[0], errors }, 422)
  Object.assign(p, data, { updatedAt: new Date().toISOString() })
  const archived = p.lifecycle === 'DIARSIPKAN' && before.lifecycle !== 'DIARSIPKAN'
  const stamp = p.updatedAt
  const undoToken = archived
    ? issueUndo(v.id, () => {
        if (p.updatedAt !== stamp) return { ok: false, status: 409, error: 'Proyek ini sudah berubah sejak diarsipkan.' }
        Object.assign(p, before, { updatedAt: new Date().toISOString() })
        return { ok: true, message: 'Pengarsipan proyek diurungkan.' }
      })
    : null
  return json({ ok: true, project: format(p, v), undoToken })
}

function approveRoute(init: RequestInit | undefined, role: string): Promise<Response> | null {
  const v = viewer(role)
  const b = body(init)
  const p = projects.find((x) => x.id === b.projectId)
  // Proyek di luar data ini (mis. kartu ringkasan lain) dijawab rute umum pratinjau.
  if (!p) return null
  if (!can(role, 'project:approve')) return json({ error: 'Peran Anda tidak menyetujui proyek' }, 403)
  const decision = b.decision === 'DITOLAK' ? 'DITOLAK' : b.decision === 'DISETUJUI' ? 'DISETUJUI' : ''
  const note = str(b.note, 500)
  if (!decision) return json({ error: 'Proyek dan keputusan wajib diisi' }, 400)
  if (decision === 'DITOLAK' && note.length < 5) return json({ error: 'Alasan penolakan wajib diisi agar pengaju tahu apa yang perlu diperbaiki' }, 422)
  if (p.lifecycle !== 'DIUSULKAN') return json({ error: 'Proyek ini sudah tidak dalam tahap pengajuan' }, 409)
  const slot = pendingSlot(p.approvalChain, approvedRoles(p))
  const before = { lifecycle: p.lifecycle, approvals: [...p.approvals], approvedAt: p.approvedAt, approvedByName: p.approvedByName }
  const now = new Date().toISOString()
  if (slot && !canSignSlot(v, slot, p.entityId)) {
    const label = PROJECT_APPROVER_LABELS[slot] ?? slot
    const same = (PROJECT_ENTITY_SLOTS as readonly string[]).includes(slot) ? ' di PT pemilik proyek' : ''
    return json({ error: `Sekarang giliran ${label}${same}. Anda tidak bisa menandatangani slot ini.` }, 403)
  }
  if (slot) {
    p.approvals = [...p.approvals.filter((a) => a.role !== slot), { role: slot, decision, note: note || null, decidedAt: now, decidedByName: v.name }]
  }
  const next = decision === 'DISETUJUI' ? pendingSlot(p.approvalChain, approvedRoles(p)) : slot
  if (decision === 'DITOLAK') p.lifecycle = 'DITOLAK'
  else if (next === null) Object.assign(p, { lifecycle: 'AKTIF', approvedAt: now, approvedByName: v.name })
  p.updatedAt = now
  // Kartu "Pengajuan proyek" di meja kerja Admin PT ikut berkurang.
  const desk = mock.deskAdmin.approvals as { id: string }[]
  const deskIdx = desk.findIndex((a) => a.id === p.id)
  const deskRow = deskIdx >= 0 ? desk.splice(deskIdx, 1)[0] : null
  const stamp = p.updatedAt
  const undoToken = issueUndo(v.id, () => {
    if (p.updatedAt !== stamp) return { ok: false, status: 409, error: 'Pengajuan ini sudah berubah sejak diputuskan.' }
    Object.assign(p, before, { updatedAt: new Date().toISOString() })
    if (deskRow) desk.splice(deskIdx, 0, deskRow)
    return { ok: true, message: decision === 'DISETUJUI' ? 'Persetujuan proyek diurungkan.' : 'Penolakan proyek diurungkan.' }
  })
  return json({
    ok: true,
    lifecycle: p.lifecycle,
    pending: p.lifecycle === 'DIUSULKAN' ? next : null,
    approvals: p.approvals.map((a) => ({ role: a.role, decision: a.decision, note: a.note, decidedAt: a.decidedAt })),
    undoToken,
  })
}

// ------------------------------------------------------------------
// Eskalasi
// ------------------------------------------------------------------

type Person = { id: string; name: string; email: string }
type Esc = {
  id: string
  sourceType: string
  sourceId: string
  entityId: string
  raisedById: string | null
  raisedBy: Person | null
  raisedAt: string
  summary: string
  needed: string
  status: string
  decidedById: string | null
  decidedBy: Person | null
  decidedAt: string | null
  decisionText: string | null
  slaDays: number
  createdAt: string
  updatedAt: string
}
const person = (id: string, name: string): Person => ({ id, name, email: emailOf(name) })
const E = (o: Partial<Esc> & Pick<Esc, 'id' | 'summary' | 'needed' | 'status' | 'entityId'>, raisedDays: number, by: Person): Esc => ({
  sourceType: 'DAILY_REPORT', sourceId: `src-${o.id}`, raisedById: by.id, raisedBy: by, raisedAt: ago(raisedDays), decidedById: null, decidedBy: null,
  decidedAt: null, decisionText: null, slaDays: 7, createdAt: ago(raisedDays), updatedAt: ago(Math.max(0, raisedDays - 1)), ...o,
})
const escalations: Esc[] = [
  E({ id: 'es1', summary: 'Perangkat uji gelombang 2 terlambat dari vendor', needed: 'KEPUTUSAN', status: 'DIAJUKAN', entityId: 'e1', sourceType: 'TASK' }, 4, person('pratinjau-PIC_PROYEK', 'Rina Kartika')),
  E({ id: 'es2', summary: 'Tambahan anggaran lisensi peladen cadangan Rp 32 jt', needed: 'ANGGARAN', status: 'DITINJAU', entityId: 'e1', sourceType: 'WEEKLY_ITEM' }, 2, person('pratinjau-KEPALA_DIVISI', 'Andi Wijaya')),
  E({ id: 'x1', summary: 'Materi video Kampanye Oktober belum disetujui', needed: 'KEPUTUSAN', status: 'DIAJUKAN', entityId: 'e3' }, 9, person('u-lina3', 'Lina Marlina')),
  E({ id: 'x2', summary: 'Revisi anggaran Renovasi Ruang IT Rp 48,5 jt', needed: 'ANGGARAN', status: 'DITINJAU', entityId: 'e2' }, 2, person('u-dimas', 'Dimas Saputra')),
  E(
    {
      id: 'es3', summary: 'Butuh dukungan tim hukum untuk kontrak vendor armada', needed: 'DUKUNGAN_LINTAS_FUNGSI', status: 'DIPUTUSKAN', entityId: 'e2',
      decidedById: 'pratinjau-MANAJEMEN', decidedBy: person('pratinjau-MANAJEMEN', 'Ris Hartanto'), decidedAt: ago(1),
      decisionText: 'Tim hukum holding mendampingi negosiasi mulai pekan depan.',
    },
    6,
    person('u-wahyu', 'Wahyu Hidayat')
  ),
  E(
    {
      id: 'es4', summary: 'Pemindahan jadwal pelatihan K3 karena gudang penuh', needed: 'KEPUTUSAN', status: 'DITUTUP', entityId: 'e1',
      decidedById: 'pratinjau-MANAJEMEN', decidedBy: person('pratinjau-MANAJEMEN', 'Ris Hartanto'), decidedAt: ago(10),
      decisionText: 'Pelatihan dipindah ke aula kantor pusat pada minggu berikutnya.',
    },
    14,
    person('u-p5', 'Bayu Prakoso')
  ),
]
const ageDays = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / DAY)

function escalationsRoute(url: string, role: string): Promise<Response> {
  const v = viewer(role)
  const sp = params(url)
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)
  const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '50', 10) || 50))
  const scope = scopeIds(v)
  const rows = escalations
    .filter((e) => !sp.get('status') || e.status === sp.get('status'))
    .filter((e) => !sp.get('needed') || e.needed === sp.get('needed'))
    .filter((e) => !sp.get('entityId') || e.entityId === sp.get('entityId'))
    .filter((e) => !scope || scope.includes(e.entityId))
    .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
  const total = rows.length
  let items = rows.slice((page - 1) * pageSize, page * pageSize).map((e) => {
    const ad = ageDays(e.raisedAt)
    return { ...e, entity: ENTITIES[e.entityId], ageDays: ad, isOverdue: ad > e.slaDays }
  })
  if (sp.get('overdue') === 'true') items = items.filter((e) => e.isOverdue)
  else if (sp.get('overdue') === 'false') items = items.filter((e) => !e.isOverdue)
  return json({ items, total, page, pageSize })
}

type WeeklyItemLite = { id: string }
function weeklyItemSource(id: string) {
  for (const d of mock.weeklyInput.divisions) {
    if ((d.report?.items as unknown as WeeklyItemLite[] | undefined)?.some((x) => x.id === id)) return d
  }
  return null
}

function escalationActions(init: RequestInit | undefined, role: string): Promise<Response> {
  const v = viewer(role)
  const b = body(init)
  const action = str(b.action, 20)
  if (action === 'raise') {
    if (!can(role, 'escalation:raise')) return json({ error: 'Peran Anda tidak mengajukan eskalasi' }, 403)
    const sourceType = str(b.sourceType, 20)
    const sourceId = str(b.sourceId, 64)
    const summary = str(b.summary)
    const needed = str(b.needed, 40)
    if (!['TASK', 'DAILY_REPORT', 'WEEKLY_ITEM'].includes(sourceType) || !sourceId) return json({ error: 'Sumber eskalasi tidak valid' }, 400)
    if (summary.length < 10) return json({ error: 'Ringkasan eskalasi minimal 10 karakter agar dapat ditindaklanjuti' }, 422)
    if (!['KEPUTUSAN', 'ANGGARAN', 'DUKUNGAN_LINTAS_FUNGSI'].includes(needed)) return json({ error: 'Jenis kebutuhan wajib dipilih' }, 422)
    let entityId = 'e1'
    let own = true
    if (sourceType === 'TASK') {
      const t = findTask(sourceId)
      if (!t) return json({ error: 'Task tidak ditemukan' }, 404)
      if (t.escalationId) return json({ error: 'Task ini sudah dieskalasi' }, 409)
      entityId = dailyProjects().find((p) => p.id === t.projectId)?.entityId ?? 'e1'
      own = role !== 'PIC_PROYEK' || mock.deskPic.projects.some((p) => p.id === t.projectId)
      if (role === 'KEPALA_DIVISI') own = false
    } else if (sourceType === 'WEEKLY_ITEM') {
      if (!weeklyItemSource(sourceId)) return json({ error: 'Item tidak ditemukan' }, 404)
      own = role !== 'PIC_PROYEK'
    } else {
      const p = dailyProjects().find((x) => x.report?.id === sourceId)
      if (!p) return json({ error: 'Laporan tidak ditemukan' }, 404)
      entityId = p.entityId
      own = role !== 'KEPALA_DIVISI'
    }
    if (!own) return json({ error: 'Sumber ini bukan tanggung jawab Anda' }, 403)
    const scope = scopeIds(v)
    if (scope && !scope.includes(entityId)) return json({ error: 'Sumber ini di luar cakupan Anda' }, 403)
    if (escalations.some((e) => e.sourceType === sourceType && e.sourceId === sourceId && e.status !== 'DITUTUP')) {
      return json({ error: 'Sumber ini sudah memiliki eskalasi yang masih berjalan' }, 409)
    }
    const now = new Date().toISOString()
    const esc: Esc = {
      id: uid('esc'), sourceType, sourceId, entityId, raisedById: v.id, raisedBy: person(v.id, v.name), raisedAt: now, summary, needed, status: 'DIAJUKAN',
      decidedById: null, decidedBy: null, decidedAt: null, decisionText: null, slaDays: 7, createdAt: now, updatedAt: now,
    }
    escalations.unshift(esc)
    if (sourceType === 'TASK') markTaskEscalated(sourceId, { id: esc.id, status: esc.status, needed, decisionText: null })
    return json({ ok: true, escalation: esc })
  }

  const id = str(b.id, 64)
  if (!id) return json({ error: 'Id eskalasi wajib diisi' }, 400)
  const e = escalations.find((x) => x.id === id)
  if (!e) return json({ error: 'Eskalasi tidak ditemukan' }, 404)
  const scope = scopeIds(v)
  if (scope && !scope.includes(e.entityId)) return json({ error: 'Eskalasi ini di luar cakupan Anda' }, 403)
  const before = { status: e.status, decidedById: e.decidedById, decidedBy: e.decidedBy, decidedAt: e.decidedAt, decisionText: e.decisionText }
  const done = (label: string) => {
    e.updatedAt = new Date().toISOString()
    const stamp = e.updatedAt
    const undoToken = issueUndo(v.id, () => {
      if (e.updatedAt !== stamp) return { ok: false, status: 409, error: 'Eskalasi ini sudah berubah sejak tindakan tadi.' }
      Object.assign(e, before, { updatedAt: new Date().toISOString() })
      return { ok: true, message: `${label} diurungkan.` }
    })
    return json({ ok: true, escalation: e, undoToken })
  }
  if (action === 'review') {
    if (!can(role, 'escalation:followup')) return json({ error: 'Peran Anda tidak meninjau eskalasi' }, 403)
    if (e.status !== 'DIAJUKAN') return json({ error: 'Eskalasi ini sudah melewati tahap peninjauan' }, 409)
    e.status = 'DITINJAU'
    return done('Peninjauan eskalasi')
  }
  if (action === 'decide') {
    if (!can(role, 'escalation:decide')) return json({ error: 'Hanya Manajemen yang memutuskan eskalasi' }, 403)
    if (e.status === 'DITUTUP') return json({ error: 'Eskalasi ini sudah ditutup' }, 409)
    const text = str(b.decisionText)
    if (text.length < 10) return json({ error: 'Isi keputusan minimal 10 karakter agar jelas bagi pelaksana' }, 422)
    Object.assign(e, { status: 'DIPUTUSKAN', decidedById: v.id, decidedBy: person(v.id, v.name), decidedAt: new Date().toISOString(), decisionText: text })
    return done('Keputusan eskalasi')
  }
  if (action === 'close') {
    const may = can(role, 'escalation:decide') || can(role, 'escalation:followup') || e.raisedById === v.id
    if (!may) return json({ error: 'Peran Anda tidak menutup eskalasi' }, 403)
    if (e.status !== 'DIPUTUSKAN') return json({ error: 'Eskalasi hanya dapat ditutup setelah ada keputusan' }, 409)
    e.status = 'DITUTUP'
    return done('Penutupan eskalasi')
  }
  return json({ error: 'Aksi tidak dikenali' }, 400)
}

// ------------------------------------------------------------------
// Arsip laporan mingguan (/api/weekly-reports)
// ------------------------------------------------------------------

const ASPECTS = [
  { id: 'a1', name: 'Operasional', code: 'OPS' },
  { id: 'a2', name: 'Keuangan', code: 'KEU' },
  { id: 'a3', name: 'Sistem', code: 'SIS' },
]
const PRIORITIES = [
  { id: 'pr1', code: 'SEDANG', name: 'Sedang', weight: 2 },
  { id: 'pr2', code: 'TINGGI', name: 'Tinggi', weight: 3 },
  { id: 'pr3', code: 'RENDAH', name: 'Rendah', weight: 1 },
]
const WORK = [
  'Rekap capaian proyek divisi', 'Tindak lanjut temuan audit internal', 'Pemutakhiran SOP kerja', 'Koordinasi vendor pendukung',
  'Evaluasi kinerja mingguan tim', 'Penyusunan anggaran triwulan', 'Uji coba sistem baru', 'Pelatihan anggota baru',
]

function genItems(reportId: string, n: number, done: number, blocked: number, periodStart: string) {
  return Array.from({ length: n }, (_, i) => {
    const status = i < done ? 'SELESAI' : i < done + blocked ? 'TERKENDALA' : i === n - 1 ? 'BELUM_MULAI' : 'ON_PROGRESS'
    return {
      id: `${reportId}-i${i}`, weeklyReportId: reportId, aspectCategoryId: ASPECTS[i % 3].id, aspectCategory: ASPECTS[i % 3],
      workItem: WORK[(i + reportId.length) % WORK.length], targetOutput: 'Hasil terdokumentasi dan disetujui', picName: ['Yoga Saputra', 'Sari Wulandari', 'Fajar Nugroho'][i % 3],
      picTitle: 'Staf', targetDate: new Date(Date.parse(periodStart) + Math.min(4, i) * DAY).toISOString(), status,
      progressPct: status === 'SELESAI' ? 100 : status === 'BELUM_MULAI' ? 0 : 40 + i * 5, achievementThisWeek: 'Dikerjakan sesuai rencana kerja minggu ini.',
      obstacleFollowUp: status === 'TERKENDALA' ? 'Menunggu konfirmasi vendor; dijadwalkan ulang minggu depan.' : null,
      priorityId: PRIORITIES[i % 3].id, priority: PRIORITIES[i % 3], needsEscalation: status === 'TERKENDALA', evidenceCount: status === 'SELESAI' ? 1 : 0,
      tags: [], carriedOverFromId: null, workDate: null, position: i, followUp: null, createdAt: periodStart, updatedAt: periodStart,
    }
  })
}

const HEADS = Object.fromEntries(catalogDivisions.map((d) => [d.id, d.head]))
const OTHER_DIVS = catalogDivisions.filter((d) => d.entityId !== 'e1')

function weekMeta(offset: number) {
  const ref = new Date(Date.now() - offset * 7 * DAY)
  const { isoYear, isoWeek } = isoWeekOf(ref)
  const dl = weeklyDeadlines(ref)
  return { isoYear, isoWeek, periodStart: dl.periodStart.toISOString(), periodEnd: dl.periodEnd.toISOString(), handoverBy: dl.handoverBy.toISOString(), lockAt: dl.lockAt.toISOString() }
}

type WR = Record<string, unknown> & { id: string; entityId: string; isoYear: number; isoWeek: number; statusHeader: string; updatedAt: string }

/** Laporan arsip (minggu-minggu lalu, dan PT lain) — dibuat sekali. */
const archive: WR[] = (() => {
  const out: WR[] = []
  const mk = (id: string, divisionId: string, divisionName: string, entityId: string, head: string, offset: number, statusHeader: string, n: number, done: number, blocked: number, late = false): WR => {
    const w = weekMeta(offset)
    const submittedAt = statusHeader === 'DRAFT' ? null : new Date(Date.parse(w.handoverBy) - (late ? -5 : 6) * HOUR).toISOString()
    const approvedAt = statusHeader === 'DISETUJUI' || statusHeader === 'TERKUNCI' ? new Date(Date.parse(w.handoverBy) + 2 * HOUR).toISOString() : null
    const past = offset > 0
    return {
      id, divisionId, entityId, isoYear: w.isoYear, isoWeek: w.isoWeek, periodStart: w.periodStart, periodEnd: w.periodEnd, statusHeader,
      submittedById: submittedAt ? `u-${divisionId}` : null, submittedAt, forwardedById: past && approvedAt ? 'u-admin' : null,
      forwardedAt: past && approvedAt ? new Date(Date.parse(w.lockAt) - 3 * HOUR).toISOString() : null, approvedById: approvedAt ? `u-${divisionId}` : null,
      approvedAt, approvedBy: approvedAt ? person(`u-${divisionId}`, head) : null, approvalHash: null, isLocked: past, lockedAt: past ? w.lockAt : null, isLate: late,
      createdAt: w.periodStart, updatedAt: approvedAt ?? submittedAt ?? w.periodStart, division: { id: divisionId, name: divisionName }, entity: ENTITIES[entityId],
      items: genItems(id, n, done, blocked, w.periodStart),
    }
  }
  for (const [i, d] of deskWeeklyReports().filter((x) => x.head).entries()) {
    out.push(mk(`wa-${d.divisionId}-1`, d.divisionId, d.name, 'e1', d.head!.name, 1, 'DISETUJUI', 6 + i, 5 + i, 0, i === 2))
    out.push(mk(`wa-${d.divisionId}-2`, d.divisionId, d.name, 'e1', d.head!.name, 2, 'DISETUJUI', 5 + i, 5 + i, 0))
  }
  for (const [i, d] of OTHER_DIVS.entries()) {
    out.push(mk(`wo-${d.id}-0`, d.id, d.name, d.entityId, d.head, 0, i === 0 ? 'MENUNGGU_PERSETUJUAN' : i === 1 ? 'DISETUJUI' : 'DRAFT', 5, 3, i === 2 ? 1 : 0))
    out.push(mk(`wo-${d.id}-1`, d.id, d.name, d.entityId, d.head, 1, 'DISETUJUI', 6, 6, 0, i === 2))
  }
  return out
})()

/** Laporan minggu berjalan PT Ratu Karya, dibaca langsung dari meja kerja (weeklyInput & deskAdmin). */
function currentWeekE1(): WR[] {
  const w = weekMeta(0)
  const live = mock.weeklyInput.divisions[0]?.report as unknown as Record<string, unknown> | undefined
  return deskWeeklyReports()
    .filter((d) => d.report)
    .map((d) => {
      const r = d.report!
      const isLive = live && live.id === r.id
      const status = String(isLive ? live.statusHeader : r.statusHeader)
      const submittedAt = (isLive ? live.submittedAt : r.submittedAt) as string | null
      const approvedAt = (isLive ? live.approvedAt : r.approvedAt) as string | null
      const forwardedAt = r.forwardedAt ?? (isLive ? (live.forwardedAt as string | null) : null)
      const head = d.head?.name ?? HEADS[d.divisionId] ?? 'Kepala divisi'
      const items = isLive
        ? ((live.items as Record<string, unknown>[]) ?? []).map((it, i) => ({
            ...it,
            weeklyReportId: r.id,
            aspectCategoryId: ASPECTS[0].id,
            aspectCategory: { id: ASPECTS[0].id, name: String((it.aspectCategory as { name?: string } | undefined)?.name ?? ASPECTS[0].name), code: ASPECTS[0].code },
            priority: { ...PRIORITIES[i % 2], name: String((it.priority as { name?: string } | undefined)?.name ?? PRIORITIES[i % 2].name) },
            priorityId: PRIORITIES[i % 2].id,
            targetDate: (it.workDate as string | null) ?? null,
            needsEscalation: it.status === 'TERKENDALA',
            carriedOverFromId: null,
            createdAt: w.periodStart,
            updatedAt: w.periodStart,
          }))
        : genItems(r.id, r.items, r.done, r.blocked, w.periodStart)
      return {
        id: r.id, divisionId: d.divisionId, entityId: 'e1', isoYear: w.isoYear, isoWeek: w.isoWeek, periodStart: w.periodStart, periodEnd: w.periodEnd,
        statusHeader: status, submittedById: submittedAt ? `u-${d.divisionId}` : null, submittedAt, forwardedById: forwardedAt ? 'pratinjau-ADMIN_PT' : null,
        forwardedAt, approvedById: approvedAt ? `u-${d.divisionId}` : null, approvedAt, approvedBy: approvedAt ? person(`u-${d.divisionId}`, head) : null,
        approvalHash: null, isLocked: Boolean(r.isLocked), lockedAt: null, isLate: false, createdAt: w.periodStart, updatedAt: forwardedAt ?? approvedAt ?? submittedAt ?? w.periodStart,
        division: { id: d.divisionId, name: d.name }, entity: ENTITIES.e1, items,
      }
    })
}

export function weeklySnapshots(role: string) {
  return [...currentWeekE1(), ...archive].filter((r) => {
    if (role === 'PIC_PROYEK') return false
    if (role === 'KEPALA_DIVISI') return r.divisionId === 'dv-tek'
    return groupRoles.includes(role) || r.entityId === 'e1'
  })
}

export function weeklyReportsRoute(url: string, role: string): Promise<Response> {
  const v = viewer(role)
  const sp = params(url)
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)
  const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '20', 10) || 20))
  const scope = scopeIds(v)
  const isoYear = sp.get('isoYear') ? parseInt(sp.get('isoYear')!, 10) : null
  const isoWeek = sp.get('isoWeek') ? parseInt(sp.get('isoWeek')!, 10) : null
  const rows = weeklySnapshots(role)
    .filter((r) => !scope || scope.includes(r.entityId))
    .filter((r) => !sp.get('entityId') || r.entityId === sp.get('entityId'))
    .filter((r) => !sp.get('statusHeader') || r.statusHeader === sp.get('statusHeader'))
    .filter((r) => !isoYear || r.isoYear === isoYear)
    .filter((r) => !isoWeek || r.isoWeek === isoWeek)
    .sort((a, b) => b.isoYear - a.isoYear || b.isoWeek - a.isoWeek || b.updatedAt.localeCompare(a.updatedAt))
  return json({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize })
}

// ------------------------------------------------------------------
// Pintu masuk
// ------------------------------------------------------------------

function undoRoute(init: RequestInit | undefined, role: string): Promise<Response> | null {
  const token = str(body(init).token, 64)
  const t = undoTokens[token]
  if (!t) return null
  if (t.actor !== `pratinjau-${role}`) return json({ error: 'Tiket urungkan tidak ditemukan' }, 404)
  if (t.used || Date.now() - t.at > 15 * 60000) return json({ error: 'Batas waktu urungkan sudah lewat.' }, 409)
  const r = t.fn()
  if (!r.ok) return json({ error: r.error }, r.status)
  t.used = true
  return json(r)
}

export function handle(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  if (path === '/api/projects') return projectsRoute(url, init, role)
  if (path === '/api/projects/approve' && method === 'POST') return approveRoute(init, role)
  if (path === '/api/escalations' && method === 'GET') return escalationsRoute(url, role)
  if (path === '/api/escalations/actions' && method === 'POST') return escalationActions(init, role)
  if (path === '/api/weekly-reports' && method === 'GET') return weeklyReportsRoute(url, role)
  if (path === '/api/undo' && method === 'POST') return undoRoute(init, role)
  return null
}
