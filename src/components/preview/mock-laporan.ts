/**
 * [F3-A] Rute pratinjau untuk alur laporan: /api/daily-input (selain PIC —
 * layar PIC memakai mock-pic), /api/progress-reports, /api/tasks (meja harian
 * dan papan mingguan, lengkap dengan workDate), /api/inbox, /api/evidence*, dan
 * efek samping POST /api/unlock-requests untuk laporan harian di sini.
 *
 * Bentuk respons mengikuti route sungguhan (src/app/api/...). Data disimpan di
 * memori dan memakai objek mock-data yang sama (deskAdmin, deskPic, deskTasks,
 * weeklyInput) supaya meja kerja, penerimaan, dan laporan tetap konsisten
 * setelah muat ulang. Hanya mode pengembangan.
 */

import * as mock from './mock-data'
import { actor, divisions, entities, groupRoles } from './mock-catalog'
import type { UnlockItem } from '@/lib/admin-meta'
import { can, isMasterRole } from '@/lib/rbac'
import {
  DAILY_CUTOFF_LABEL,
  DAILY_STATUSES,
  TASK_STATUSES,
  TASK_URGENCIES,
  WEEKLY_LOCK_LABEL,
  dailyCountdown,
  dailyLockAt,
  dayInPeriod,
  daysOfWeek,
  isDailyLocked,
  isProgressLocked,
  isWeeklyLocked,
  isWorkingDay,
  isoWeekOf,
  parseWeekKey,
  parseWibDateKey,
  periodOf,
  progressLockAt,
  startOfWibDay,
  validateDailyReport,
  validateProgressReport,
  weekPeriodOf,
  weeklyDeadlines,
  weeklyWriteBlock,
  wibDateKey,
  type Period,
  type ProgressCadence,
} from '@/lib/lock'

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
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const todayDate = () => startOfWibDay(new Date())
const todayIso = () => todayDate().toISOString()

const GROUP_ROLES = ['MANAJEMEN', 'SUPERADMIN', 'DIREKTUR_SDM_GA', 'TI', 'AUDITOR']
const ACTOR: Record<string, string> = {
  ADMIN_PT: 'Maya Lestari',
  PIC_PROYEK: 'Rina Kartika',
  TI: 'Tim TI',
  SUPERADMIN: 'Super Admin',
  KEPALA_DIVISI: 'Andi Wijaya',
}
const scopeOf = (role: string) => (GROUP_ROLES.includes(role) ? null : 'e1')

const FORWARDED_FROZEN = 'Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.'
const LOCKED_FROZEN = 'Laporan ini sudah dikunci. Ajukan buka kunci untuk mengubahnya.'

// ------------------------------------------------------------------
// Proyek & laporan harian (dibagi dengan meja kerja Admin PT)
// ------------------------------------------------------------------

/** Satu laporan harian. Objek hari ini adalah objek `report` milik mock.deskAdmin, jadi meja kerja ikut berubah. */
export type DailyRow = {
  id: string
  status: string
  progressPct: number
  evidenceCount: number
  submittedAt: string | null
  submittedBy?: string | null
  forwardedAt: string | null
  isLate: boolean
  needsEscalation?: boolean
  achievement?: string
  achievementToday?: string
  obstacle?: string | null
  followUp?: string | null
  decisionRequestedFrom?: string | null
  isLocked?: boolean
  lockedAt?: string | null
}

type Holder = {
  id: string
  code: string
  name: string
  phase: string
  picName: string | null
  report: DailyRow | null
  tasks?: { total: number; done: number }
}

export const ENTITIES = Object.fromEntries(entities.map((e) => [e.id, e]))

const atToday = (h: number, m = 0) => new Date(todayDate().getTime() + h * HOUR + m * 60000).toISOString()

const EXTRA_HOLDERS: { holder: Holder; entityId: string }[] = [
  {
    entityId: 'e2',
    holder: {
      id: 'sg1', code: 'SGD-PRJ-01', name: 'Renovasi Ruang IT', phase: 'PERENCANAAN', picName: 'Dimas Saputra',
      tasks: { total: 2, done: 1 },
      report: {
        id: 'r-sg1', status: 'TERKENDALA', progressPct: 35, evidenceCount: 1, submittedAt: atToday(10, 15), submittedBy: 'Dimas Saputra',
        forwardedAt: null, isLate: false, needsEscalation: true, achievement: 'Survei ulang denah ruang server bersama vendor.',
        achievementToday: 'Survei ulang denah ruang server bersama vendor.', obstacle: 'Vendor belum konfirmasi jadwal pemasangan rak.',
        followUp: 'Minta konfirmasi tertulis vendor paling lambat Kamis.',
      },
    },
  },
  {
    entityId: 'e3',
    holder: { id: 'bm1', code: 'BML-PRJ-01', name: 'Audit Kontrak Vendor', phase: 'PENYELESAIAN', picName: 'Lina Marlina Putri', tasks: { total: 2, done: 2 }, report: null },
  },
]

type DailyProject = { holder: Holder; entityId: string }

/** Proyek aktif yang dilaporkan harian: PT Ratu Karya dari meja kerja Admin PT, ditambah PT lain untuk akun induk. */
function dailyCatalog(): DailyProject[] {
  return [
    ...(mock.deskAdmin.projects as unknown as Holder[]).map((holder) => ({ holder, entityId: 'e1' })),
    ...EXTRA_HOLDERS,
  ]
}

/** Laporan hari ini per proyek, untuk modul lain (mis. latestReport di daftar proyek). */
export function dailyProjects() {
  return dailyCatalog().map(({ holder, entityId }) => ({
    id: holder.id, code: holder.code, name: holder.name, phase: holder.phase, picName: holder.picName, entityId, report: holder.report,
  }))
}

function visibleDaily(role: string): DailyProject[] {
  const all = dailyCatalog()
  if (role === 'PIC_PROYEK') return all.filter((p) => isPicProject(p.holder.id))
  if (groupRoles.includes(role)) return all
  const scope = scopeOf(role)
  return scope ? all.filter((p) => p.entityId === scope) : []
}

/** Laporan historis disimpan saat hari WIB berganti, tanpa kehilangan buka kunci. */
const pastReports: Record<string, DailyRow> = {}
let reportDay = wibDateKey(new Date())
export function refreshPreviewDay() {
  const key = wibDateKey(new Date())
  if (key === reportDay) return
  for (const p of dailyCatalog()) {
    if (p.holder.report) pastReports[`${p.holder.id}|${reportDay}`] = p.holder.report
    p.holder.report = null
    if (p.holder.tasks) p.holder.tasks = { total: 0, done: 0 }
  }
  reportDay = key
  mock.deskPic.today = todayIso()
  mock.deskAdmin.today = todayIso()
}
function reportDayOf(id: string) {
  const key = Object.entries(pastReports).find(([, r]) => r.id === id)?.[0].split('|')[1]
  return key ? parseWibDateKey(key)! : todayDate()
}

function reportFor(p: DailyProject, dayKey: string): DailyRow | null {
  return dayKey === wibDateKey(todayDate()) ? p.holder.report : (pastReports[`${p.holder.id}|${dayKey}`] ?? null)
}

// ------------------------------------------------------------------
// Buka kunci laporan harian (status pengajuan dari pratinjau)
// ------------------------------------------------------------------

export const unlockItems: UnlockItem[] = []
const unlocks: Record<string, UnlockItem> = {}
export const activeUnlock = (reportId: string | undefined) => {
  const u = reportId ? unlocks[reportId] : undefined
  if (u?.status === 'DIEKSEKUSI' && !u.reLockedAt && u.unlockUntil) {
    if (Date.parse(u.unlockUntil) > Date.now()) return u
    u.reLockedAt = new Date().toISOString()
    const target = unlockTarget(u.targetType, u.targetId)
    if (target) Object.assign(target.report, { isLocked: true })
  }
  return null
}

function frozenOf(r: DailyRow | null): 'FORWARDED' | 'LOCKED' | null {
  if (!r || activeUnlock(r.id)) return null
  return r.forwardedAt ? 'FORWARDED' : r.isLocked ? 'LOCKED' : null
}
const frozenText = (f: 'FORWARDED' | 'LOCKED' | null) => (f === 'FORWARDED' ? FORWARDED_FROZEN : f === 'LOCKED' ? LOCKED_FROZEN : null)

// ------------------------------------------------------------------
// Bukti
// ------------------------------------------------------------------

type Ev = {
  id: string
  targetType: string
  targetId: string
  storageKey: string
  fileName: string
  mime: string
  size: number
  url: string | null
  uploadedById: string | null
  createdAt: string
}
const evidence: Record<string, Ev[]> = {}
const evKey = (type: string, id: string) => `${type}:${id}`

/** Daftar bukti satu sasaran; diisi contoh sejumlah `seed` saat pertama dibaca. */
function evidenceOf(type: string, id: string, seed = 0): Ev[] {
  const k = evKey(type, id)
  if (!evidence[k]) {
    evidence[k] = Array.from({ length: seed }, (_, i) => ({
      id: uid('ev'), targetType: type, targetId: id, storageKey: `pratinjau/${id}/${i}`,
      fileName: i % 2 ? `Notulen ${i + 1}.pdf` : `Foto progres ${i + 1}.jpg`, mime: i % 2 ? 'application/pdf' : 'image/jpeg',
      size: 180000 + i * 52000, url: null, uploadedById: null, createdAt: new Date(Date.now() - (i + 2) * HOUR).toISOString(),
    }))
  }
  return evidence[k]
}
const evOut = (e: Ev) => ({ id: e.id, targetId: e.targetId, fileName: e.fileName, url: e.url, mime: e.mime, size: e.size, createdAt: e.createdAt })

type WeeklyItemRef = { id: string; evidenceCount: number; evidence: unknown[] }
function weeklyItem(id: string): WeeklyItemRef | null {
  for (const d of mock.weeklyInput.divisions) {
    const it = (d.report?.items as unknown as WeeklyItemRef[] | undefined)?.find((x) => x.id === id)
    if (it) return it
  }
  return null
}

/** Sasaran bukti yang dikelola berkas ini; null = serahkan ke mock lain (OUTPUT, laporan harian PIC). */
function ownsTarget(type: string, id: string): boolean {
  if (type === 'TASK') return Boolean(findTask(id))
  if (type === 'PROGRESS_REPORT') return Object.values(progress).some((r) => r.id === id)
  if (type === 'WEEKLY_ITEM') return Boolean(weeklyItem(id))
  if (type === 'DAILY_REPORT') return Boolean(findDailyById(id))
  return false
}

function findDailyById(id: string): DailyRow | null {
  for (const p of dailyCatalog()) if (p.holder.report?.id === id) return p.holder.report
  return Object.values(pastReports).find((r) => r.id === id) ?? null
}

/** Sasaran yang terkunci untuk bukti: laporan diteruskan/terkunci atau lewat 17.00, task hari beku. */
function evidenceLock(type: string, id: string, role: string): string | null {
  if (type === 'DAILY_REPORT') {
    const r = findDailyById(id)
    const f = frozenOf(r)
    if (f) return frozenText(f)
    if (isDailyLocked(reportDayOf(id)) && !activeUnlock(id)) return `Laporan ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}.`
  }
  if (type === 'PROGRESS_REPORT') {
    const r = Object.values(progress).find((x) => x.id === id)
    if (r && (r.isLocked || isProgressLocked(r.period))) return 'Periode ini sudah dikunci.'
  }
  if (type === 'WEEKLY_ITEM') {
    const r = mock.weeklyInput.divisions.find((d) => d.report.items.some((it) => it.id === id))?.report
    if (r && !activeUnlock(r.id) && (r.forwardedAt || r.isLocked || isWeeklyLocked(new Date(mock.weeklyInput.week.start)))) return 'Laporan mingguan dikunci.'
  }
  if (type === 'TASK') {
    const t = findTask(id)
    if (t && t.scope === 'HARIAN' && dayFrozen(t.projectId, t.workDate, role)) return FORWARDED_FROZEN
  }
  return null
}

/** Jumlah bukti baru ke sasarannya, seperti syncEvidenceCount. */
function syncCount(type: string, id: string): number {
  const n = evidenceOf(type, id).length
  if (type === 'DAILY_REPORT') {
    const r = findDailyById(id)
    if (r) r.evidenceCount = n + tasksEvidence(projectOfReport(id), todayIso())
  }
  if (type === 'PROGRESS_REPORT') {
    const r = Object.values(progress).find((x) => x.id === id)
    if (r) r.evidenceCount = n
  }
  if (type === 'WEEKLY_ITEM') {
    const it = weeklyItem(id)
    if (it) {
      it.evidenceCount = n
      it.evidence = evidenceOf(type, id).map(evOut)
    }
  }
  return n
}

function projectOfReport(reportId: string): string {
  return dailyCatalog().find((p) => p.holder.report?.id === reportId)?.holder.id ?? Object.entries(pastReports).find(([, r]) => r.id === reportId)?.[0].split('|')[0] ?? ''
}

function evidenceAccess(type: string, id: string, role: string, write: boolean) {
  if (type === 'WEEKLY_ITEM') {
    if (!write || can(role, 'weekly:input')) return null
    return json({ error: 'Peran Anda tidak mengubah bukti mingguan.' }, 403)
  }
  const pid = type === 'DAILY_REPORT' ? projectOfReport(id) : type === 'TASK' ? findTask(id)?.projectId : Object.values(progress).find((r) => r.id === id)?.projectId
  if (!pid) return json({ error: 'Data induk bukti tidak ditemukan.' }, 404)
  const guard = guardProject(pid, role, write)
  return guard.ok ? null : guard.res
}

function evidenceRoute(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  if (path === '/api/evidence/upload') {
    const fd = init?.body instanceof FormData ? init.body : null
    if (!fd) return null
    const type = String(fd.get('targetType') ?? '')
    const id = String(fd.get('targetId') ?? '')
    if (!ownsTarget(type, id)) return null
    const denied = evidenceAccess(type, id, role, method !== 'GET')
    if (denied) return denied
    const file = fd.get('file')
    const f = file instanceof File ? file : null
    if (!f) return json({ error: 'Berkas wajib dipilih' }, 422)
    if (f.size === 0) return json({ error: 'Berkas kosong' }, 422)
    if (f.size > 10 * 1024 * 1024) return json({ error: 'Ukuran berkas maksimal 10 MB' }, 413)
    const locked = evidenceLock(type, id, role)
    if (locked) return json({ error: locked, locked: true }, 409)
    const ev: Ev = {
      id: uid('ev'), targetType: type, targetId: id, storageKey: `pratinjau/${id}/${f.name}`, fileName: f.name.slice(0, 200),
      mime: f.type || 'application/octet-stream', size: f.size, url: null, uploadedById: `pratinjau-${role}`, createdAt: new Date().toISOString(),
    }
    evidenceOf(type, id).unshift(ev)
    const count = syncCount(type, id)
    return json({ ok: true, evidence: { id: ev.id, fileName: ev.fileName, mime: ev.mime, size: ev.size, storageKey: ev.storageKey, url: null, createdAt: ev.createdAt }, evidenceCount: count })
  }
  if (path === '/api/evidence') {
    if (method === 'GET') {
      const sp = params(url)
      const type = sp.get('targetType') ?? ''
      const id = sp.get('targetId') ?? ''
      if (!ownsTarget(type, id)) return null
      const denied = evidenceAccess(type, id, role, method !== 'GET')
      if (denied) return denied
      const items = evidenceOf(type, id)
      return json({ items, total: items.length })
    }
    const b = body(init)
    const type = str(b.targetType, 40)
    const id = str(b.targetId, 64)
    if (!ownsTarget(type, id)) return null
    const denied = evidenceAccess(type, id, role, method !== 'GET')
    if (denied) return denied
    const fileName = str(b.fileName, 200)
    const link = typeof b.url === 'string' && b.url.length <= 2000 ? b.url.trim() : ''
    const locked = evidenceLock(type, id, role)
    if (locked) return json({ error: locked, locked: true }, 409)
    if (!fileName) return json({ error: 'Nama/keterangan bukti wajib diisi' }, 422)
    if (!/^https?:\/\/\S+$/i.test(link)) return json({ error: 'Tautan bukti harus berupa URL yang diawali http:// atau https://' }, 422)
    const ev: Ev = {
      id: uid('ev'), targetType: type, targetId: id, storageKey: `link:${type}:${id}:${Date.now()}`, fileName, mime: 'text/uri-list',
      size: link.length, url: link, uploadedById: `pratinjau-${role}`, createdAt: new Date().toISOString(),
    }
    evidenceOf(type, id).unshift(ev)
    return json({ ok: true, evidence: ev, evidenceCount: syncCount(type, id) })
  }
  // /api/evidence/<id>
  const evId = decodeURIComponent(path.slice('/api/evidence/'.length))
  const list = Object.values(evidence).find((l) => l.some((e) => e.id === evId))
  const ev = list?.find((e) => e.id === evId)
  if (!list || !ev) return null
  const denied = evidenceAccess(ev.targetType, ev.targetId, role, method !== 'GET')
  if (denied) return denied
  if (method === 'DELETE') {
    const locked = evidenceLock(ev.targetType, ev.targetId, role)
    if (locked) return json({ error: locked, locked: true }, 409)
    list.splice(list.indexOf(ev), 1)
    return json({ ok: true, evidenceCount: syncCount(ev.targetType, ev.targetId) })
  }
  if (ev.url) return json({ url: ev.url, kind: 'link' })
  return json({ url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(`Pratinjau: ${ev.fileName}`), kind: 'file', expiresInSeconds: 300 })
}

// ------------------------------------------------------------------
// Task harian & papan mingguan
// ------------------------------------------------------------------

type Sub = { id?: string; title: string; isDone: boolean; position?: number }
export type TaskRow = {
  id: string
  projectId: string
  title: string
  description: string | null
  tags: string[]
  picName: string | null
  picUserId: string | null
  startAt: string | null
  endAt: string | null
  durationMin: number | null
  status: string
  progressPct: number
  urgency: string
  obstacle: string | null
  decisionNeeded: string | null
  escalationId: string | null
  escalation?: { id: string; status: string; needed: string; decisionText: string | null } | null
  subtasks: Sub[]
  evidence?: unknown[]
  workDate: string
  scope: 'HARIAN' | 'MINGGUAN'
  sortOrder: number
}

/** Task hari ini milik meja kerja Admin PT (dibangkitkan dari hitungan di deskAdmin). */
const adminToday: Record<string, TaskRow[]> = {}
/** Task hari lain dalam minggu (papan mingguan), per proyek. */
const extras: Record<string, TaskRow[]> = {}
const weeksSeeded = new Set<string>()

/** Angka kecil yang stabil per id proyek, agar judul contoh tiap proyek berbeda. */
const hashOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7)

const TITLES = [
  'Rapat koordinasi tim', 'Perbarui rencana kerja', 'Uji fungsi modul utama', 'Dokumentasi hasil uji',
  'Tindak lanjut vendor', 'Rekap kebutuhan pengguna', 'Siapkan materi presentasi', 'Periksa kualitas data',
]

function mkTask(projectId: string, title: string, status: string, workDate: string, o: Partial<TaskRow> = {}): TaskRow {
  return {
    id: uid('t'), projectId, title, description: null, tags: [], picName: null, picUserId: null, startAt: null, endAt: null,
    durationMin: null, status, progressPct: status === 'SELESAI' ? 100 : status === 'BELUM_MULAI' ? 0 : 50, urgency: 'SEDANG',
    obstacle: null, decisionNeeded: null, escalationId: null, escalation: null, subtasks: [], workDate, scope: 'HARIAN', sortOrder: 0, ...o,
  }
}

/** Task PIC (mock.deskTasks) diberi workDate/scope/sortOrder agar papan mingguan memetakan lajurnya. */
let picPrepared = false
function preparePicTasks() {
  if (picPrepared) return
  picPrepared = true
  const today = todayIso()
  for (const [pid, list] of Object.entries(mock.deskTasks)) {
    ;(list as unknown as TaskRow[]).forEach((t, i) => {
      t.projectId ??= pid
      t.workDate ??= today
      t.scope ??= 'HARIAN'
      t.sortOrder ??= i
      t.escalation ??= null
    })
  }
}

const isPicProject = (pid: string) => mock.deskPic.projects.some((p) => p.id === pid)

/** Daftar task hari ini untuk proyek ini — objek yang sama dengan meja kerja PIC bila proyeknya proyek PIC. */
function todayList(pid: string, role: string): TaskRow[] {
  preparePicTasks()
  if (mock.deskTasks[pid]) {
    const lists = mock.deskTasks as unknown as Record<string, TaskRow[]>
    return (lists[pid] ??= [])
  }
  if (!adminToday[pid]) {
    const h = dailyCatalog().find((p) => p.holder.id === pid)?.holder
    const total = h?.tasks?.total ?? 0
    const done = h?.tasks?.done ?? 0
    adminToday[pid] = Array.from({ length: total }, (_, i) =>
      mkTask(pid, TITLES[(i + hashOf(pid)) % TITLES.length], i < done ? 'SELESAI' : i === done && h?.report?.status === 'TERKENDALA' ? 'TERKENDALA' : 'BERJALAN', todayIso(), {
        picName: h?.picName ?? null,
        sortOrder: i,
        startAt: atToday(8 + i * 2),
        endAt: atToday(9 + i * 2, 30),
        durationMin: 90,
        obstacle: i === done && h?.report?.status === 'TERKENDALA' ? (h.report.obstacle ?? 'Menunggu konfirmasi pihak terkait.') : null,
      })
    )
  }
  return adminToday[pid]
}

/** Contoh capaian hari-hari sebelumnya pada minggu `period` (sekali per minggu per proyek). */
function seedWeek(pid: string, period: Period) {
  const k = `${pid}|${period.key}`
  if (weeksSeeded.has(k)) return
  weeksSeeded.add(k)
  const list = (extras[pid] ??= [])
  const today = todayDate().getTime()
  const pastDays = daysOfWeek(period).filter((d) => isWorkingDay(d) && d.getTime() < today)
  pastDays.forEach((d, i) => {
    // p2 keeps one frozen lane empty when there are at least two past days,
    // so preview can verify both populated and empty frozen lanes (CX2).
    if (pid === 'p2' && pastDays.length > 1 && i === pastDays.length - 1) return
    if (todayList(pid, 'SUPERADMIN').some((t) => t.scope === 'HARIAN' && t.workDate === d.toISOString())) return
    list.push(mkTask(pid, TITLES[(i * 3 + 4 + hashOf(pid)) % TITLES.length], 'SELESAI', d.toISOString(), { sortOrder: 0 }))
    if (i % 2 === 0) list.push(mkTask(pid, TITLES[(i * 3 + 5 + hashOf(pid)) % TITLES.length], 'BERJALAN', d.toISOString(), { sortOrder: 1, progressPct: 60 }))
  })
  list.push(mkTask(pid, 'Ringkasan capaian minggu ini', period.start.getTime() <= today && today < period.end.getTime() + DAY ? 'BERJALAN' : 'SELESAI', period.start.toISOString(), { scope: 'MINGGUAN', sortOrder: 0, urgency: 'TINGGI' }))
}

const allTasks = (pid: string, role: string) => [...todayList(pid, role), ...(extras[pid] ?? [])]

export function findTask(id: string): TaskRow | undefined {
  preparePicTasks()
  const pools = [
    ...Object.values(mock.deskTasks as unknown as Record<string, TaskRow[]>),
    ...Object.values(adminToday),
    ...Object.values(extras),
  ]
  for (const l of pools) {
    const t = l.find((x) => x.id === id)
    if (t) return t
  }
  return undefined
}

/** Ditandai dari mock-proyek saat eskalasi dibuat dari sebuah task. */
export function markTaskEscalated(taskId: string, esc: { id: string; status: string; needed: string; decisionText: string | null }): boolean {
  const t = findTask(taskId)
  if (!t) return false
  t.escalationId = esc.id
  t.escalation = esc
  return true
}

/** Laporan harian proyek ini untuk instan tengah malam `dayIso`, dilihat dari peran mana pun. */
export function dailyReportOn(pid: string, dayIso: string, _role = 'SUPERADMIN'): DailyRow | null {
  const key = wibDateKey(new Date(dayIso))
  if (key === wibDateKey(todayDate())) {
    return dailyCatalog().find((p) => p.holder.id === pid)?.holder.report ?? null
  }
  return pastReports[`${pid}|${key}`] ?? null
}

/** Hari beku: laporannya diteruskan/terkunci. Hari kerja lampau dianggap sudah diteruskan (riwayat contoh). */
function dayFrozen(pid: string, dayIso: string, role: string): 'FORWARDED' | 'LOCKED' | null {
  const day = startOfWibDay(new Date(dayIso))
  const r = dailyReportOn(pid, day.toISOString(), role)
  if (r) return frozenOf(r)
  return day.getTime() < todayDate().getTime() && isWorkingDay(day) ? 'FORWARDED' : null
}

function tasksEvidence(pid: string, dayIso: string): number {
  return allTasks(pid, 'ADMIN_PT')
    .filter((t) => t.workDate === dayIso && t.scope === 'HARIAN')
    .reduce((n, t) => n + evidenceOf('TASK', t.id).length, 0)
}

function deriveStatus(statuses: string[]): string {
  if (statuses.length === 0) return 'TIDAK_ADA_PERUBAHAN'
  if (statuses.includes('TERKENDALA')) return 'TERKENDALA'
  if (statuses.includes('MENUNGGU_KEPUTUSAN')) return 'MENUNGGU_KEPUTUSAN'
  if (statuses.every((s) => s === 'SELESAI')) return 'SELESAI'
  if (statuses.some((s) => s === 'BERJALAN' || s === 'SELESAI')) return 'ON_PROGRESS'
  return 'TIDAK_ADA_PERUBAHAN'
}

function rollup(list: TaskRow[]) {
  if (!list.length) return null
  return {
    status: deriveStatus(list.map((t) => t.status)),
    progressPct: Math.round(list.reduce((s, t) => s + t.progressPct, 0) / list.length),
    evidenceCount: list.reduce((n, t) => n + evidenceOf('TASK', t.id).length, 0),
  }
}

/** Setelah task hari ini berubah: hitungan di meja kerja dan laporan hari itu ikut diperbarui (rollupDailyReport). */
function afterTaskChange(pid: string, role: string) {
  const today = todayIso()
  const list = todayList(pid, role).filter((t) => t.scope === 'HARIAN' && t.workDate === today)
  const pic = mock.deskPic.projects.find((p) => p.id === pid)
  if (pic && (role === 'PIC_PROYEK' || pid === 'p2')) {
    pic.tasks = { total: list.length, done: list.filter((t) => t.status === 'SELESAI').length, blocked: list.filter((t) => t.status === 'TERKENDALA').length }
  }
  const admin = dailyCatalog().find((p) => p.holder.id === pid)?.holder
  if (admin && admin.tasks) admin.tasks = { total: list.length, done: list.filter((t) => t.status === 'SELESAI').length }
  const r = dailyReportOn(pid, today, role)
  const ru = rollup(list)
  if (r && ru && !frozenOf(r)) {
    r.status = ru.status
    r.progressPct = ru.progressPct
    r.needsEscalation = ru.status === 'TERKENDALA' || ru.status === 'MENUNGGU_KEPUTUSAN'
  }
}

type GuardOk = { ok: true; entityId: string }
function guardProject(pid: string, role: string, write = false): GuardOk | { ok: false; res: Promise<Response> } {
  if (role === 'PIC_PROYEK') {
    if (!isPicProject(pid)) return { ok: false, res: json({ error: 'Proyek ini bukan tanggung jawab Anda' }, 403) }
    return { ok: true, entityId: 'e1' }
  }
  const p = dailyCatalog().find((x) => x.holder.id === pid)
  if (!p) return { ok: false, res: json({ error: 'Proyek tidak ditemukan' }, 404) }
  if (!groupRoles.includes(role) && p.entityId !== scopeOf(role)) return { ok: false, res: json({ error: 'Proyek ini bukan tanggung jawab Anda' }, 403) }
  if (write && !can(role, 'daily:input')) return { ok: false, res: json({ error: 'Peran Anda tidak mengelola task harian' }, 403) }
  return { ok: true, entityId: p.entityId }
}

const taskOut = (t: TaskRow) => ({
  ...t,
  picUser: null,
  subtasks: t.subtasks.map((s, i) => ({ id: s.id ?? `${t.id}-s${i}`, title: s.title, isDone: s.isDone, position: s.position ?? i })),
  evidence: evidenceOf('TASK', t.id).map(evOut),
})

const hhmm = (dayIso: string, v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{1,2}:\d{2}$/.test(v)) return null
  const [h, m] = v.split(':').map(Number)
  if (h > 23 || m > 59) return null
  return new Date(Date.parse(dayIso) + h * HOUR + m * 60000).toISOString()
}

/** readBody + validate dari route tasks. */
function readTask(b: Record<string, unknown>, dayIso: string) {
  const startAt = hhmm(dayIso, b.startTime)
  const endAt = hhmm(dayIso, b.endTime)
  const status = (TASK_STATUSES as readonly string[]).includes(str(b.status)) ? str(b.status) : 'BELUM_MULAI'
  const t = {
    title: str(b.title, 200),
    description: str(b.description, 4000) || null,
    picName: str(b.picName, 120) || null,
    picUserId: typeof b.picUserId === 'string' && b.picUserId ? b.picUserId : null,
    tags: Array.isArray(b.tags) ? (b.tags as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 8) : [],
    status,
    progressPct: Math.max(0, Math.min(100, Number(b.progressPct) || 0)),
    urgency: (TASK_URGENCIES as readonly string[]).includes(str(b.urgency)) ? str(b.urgency) : 'SEDANG',
    obstacle: str(b.obstacle) || null,
    decisionNeeded: str(b.decisionNeeded) || null,
    startAt,
    endAt,
    durationMin: startAt && endAt ? Math.max(0, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60000)) : null,
    subtasks: Array.isArray(b.subtasks)
      ? (b.subtasks as unknown[])
          .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : null))
          .filter((s): s is Record<string, unknown> => s !== null)
          .map((s, i) => ({ id: uid('st'), title: str(s.title, 200), isDone: Boolean(s.isDone), position: i }))
          .filter((s) => s.title)
          .slice(0, 30)
      : [],
  }
  const errors: string[] = []
  if (!t.title) errors.push('Judul task wajib diisi.')
  if (t.startAt && t.endAt && Date.parse(t.endAt) <= Date.parse(t.startAt)) errors.push('Jam selesai harus setelah jam mulai.')
  if (t.status === 'TERKENDALA' && !t.obstacle) errors.push('Uraian kendala wajib diisi untuk status Terkendala.')
  if (t.status === 'MENUNGGU_KEPUTUSAN' && !t.decisionNeeded) errors.push('Keputusan yang dibutuhkan wajib diisi.')
  return { t, errors }
}

/** lockCheck dari route tasks. */
function lockCheck(context: 'HARIAN' | 'MINGGUAN', pid: string, dayIso: string, scope: 'HARIAN' | 'MINGGUAN', role: string): Promise<Response> | null {
  const day = startOfWibDay(new Date(dayIso))
  const r = dailyReportOn(pid, day.toISOString(), role)
  if (scope === 'HARIAN') {
    const f = dayFrozen(pid, day.toISOString(), role)
    if (f) return json({ error: frozenText(f), locked: true, frozen: f, reportId: r?.id ?? null }, 409)
  }
  if (context === 'HARIAN') {
    if (!isDailyLocked(day) || activeUnlock(r?.id)) return null
    const isToday = day.getTime() === todayDate().getTime()
    return json({ error: isToday ? `Hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}.` : 'Hari itu tidak sedang dibuka. Ajukan buka kunci untuk mengubahnya.', locked: true, reportId: r?.id ?? null }, 409)
  }
  return isWeeklyLocked(weekPeriodOf(day).start) ? json({ error: `Minggu ini sudah dikunci (${WEEKLY_LOCK_LABEL}).`, locked: true }, 409) : null
}

function tasksRoute(url: string, init: RequestInit | undefined, role: string): Promise<Response> {
  const method = init?.method ?? 'GET'
  const sp = params(url)

  if (method === 'GET') {
    const pid = sp.get('projectId') ?? ''
    const g = guardProject(pid, role)
    if (!g.ok) return g.res
    const weekKey = sp.get('week')
    if (weekKey) {
      const period = parseWeekKey(weekKey)
      if (!period) return json({ error: 'Kunci minggu tidak dikenali' }, 400)
      seedWeek(pid, period)
      const tasks = allTasks(pid, role)
        .filter((t) => dayInPeriod(period, new Date(t.workDate)))
        .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.sortOrder - b.sortOrder)
      const days = daysOfWeek(period)
      return json({
        mode: 'MINGGUAN',
        period: {
          key: period.key, start: period.start.toISOString(), end: period.end.toISOString(),
          lockAt: weeklyDeadlines(period.start).lockAt.toISOString(), current: period.key === weekPeriodOf(new Date()).key,
        },
        locked: isWeeklyLocked(period.start),
        frozenDays: days.filter((d) => isWorkingDay(d) && dayFrozen(pid, d.toISOString(), role)).map((d) => d.toISOString()),
        today: todayIso(),
        days: days.map((d) => d.toISOString()),
        tasks: tasks.map(taskOut),
      })
    }
    const raw = sp.get('date')
    const day = raw ? (parseWibDateKey(raw) ?? new Date(raw)) : new Date()
    if (Number.isNaN(day.getTime())) return json({ error: 'Parameter tanggal tidak valid' }, 400)
    const d0 = startOfWibDay(day)
    if (raw && d0.getTime() < todayDate().getTime()) seedWeek(pid, weekPeriodOf(d0))
    const r = dailyReportOn(pid, d0.toISOString(), role)
    const frozen = dayFrozen(pid, d0.toISOString(), role)
    const unlock = activeUnlock(r?.id)
    return json({
      workDate: d0.toISOString(),
      locked: (isDailyLocked(d0) && !unlock) || frozen !== null,
      frozen,
      reportId: r?.id ?? null,
      unlockUntil: unlock?.unlockUntil ?? null,
      tasks: allTasks(pid, role)
        .filter((t) => t.workDate === d0.toISOString() && t.scope === 'HARIAN')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(taskOut),
    })
  }

  if (method === 'DELETE') {
    const t = findTask(sp.get('id') ?? '')
    if (!t) return json({ error: 'Task tidak ditemukan' }, 404)
    const g = guardProject(t.projectId, role, true)
    if (!g.ok) return g.res
    const blocked = lockCheck(sp.get('context') === 'MINGGUAN' ? 'MINGGUAN' : 'HARIAN', t.projectId, t.workDate, t.scope, role)
    if (blocked) return blocked
    for (const l of [todayList(t.projectId, role), extras[t.projectId] ?? []]) {
      const i = l.indexOf(t)
      if (i >= 0) l.splice(i, 1)
    }
    delete evidence[evKey('TASK', t.id)]
    afterTaskChange(t.projectId, role)
    return json({ ok: true })
  }

  const b = body(init)

  if (method === 'PATCH') {
    const pid = str(b.projectId, 64)
    const g = guardProject(pid, role, true)
    if (!g.ok) return g.res
    const period = parseWeekKey(str(b.week, 10))
    if (!period) return json({ error: 'Kunci minggu tidak dikenali' }, 400)
    if (isWeeklyLocked(period.start)) return json({ error: `Minggu ini sudah dikunci (${WEEKLY_LOCK_LABEL}).`, locked: true }, 409)
    const moves = (Array.isArray(b.moves) ? b.moves : [])
      .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : null))
      .filter((m): m is Record<string, unknown> => m !== null)
      .slice(0, 200)
    if (moves.length === 0) return json({ error: 'Tidak ada kartu yang dipindahkan' }, 422)
    const plan: { t: TaskRow; workDate: string; scope: 'HARIAN' | 'MINGGUAN'; sortOrder: number }[] = []
    for (const m of moves) {
      const t = findTask(str(m.id, 64))
      if (!t || t.projectId !== pid || !dayInPeriod(period, new Date(t.workDate))) return json({ error: 'Ada kartu yang bukan milik minggu ini.' }, 422)
      const lane = str(m.lane, 12)
      const weekly = lane === 'MINGGUAN'
      // Ke lajur mingguan: hari kartu tetap (seperti route); ke lajur hari: hari itu.
      const day = weekly ? startOfWibDay(new Date(t.workDate)) : parseWibDateKey(lane)
      if (!day || !dayInPeriod(period, day)) return json({ error: 'Lajur tujuan berada di luar minggu ini.' }, 422)
      // Hari asal (bila kartu harian) dan hari tujuan (bila harian) yang beku tidak boleh berubah isinya.
      const days = [...(t.scope === 'HARIAN' ? [t.workDate] : []), ...(!weekly ? [day.toISOString()] : [])]
      for (const d of days) {
        const f = dayFrozen(pid, d, role)
        if (f) return json({ error: frozenText(f), locked: true, frozen: f }, 409)
      }
      plan.push({ t, workDate: day.toISOString(), scope: weekly ? 'MINGGUAN' : 'HARIAN', sortOrder: Math.max(0, Math.round(Number(m.sortOrder) || 0)) })
    }
    const today = todayIso()
    for (const p of plan) {
      // Kartu pindah ke/dari hari ini: pindahkan antar daftar agar meja harian tetap benar.
      const from = p.t.workDate === today && p.t.scope === 'HARIAN' ? todayList(pid, role) : (extras[pid] ??= [])
      Object.assign(p.t, { workDate: p.workDate, scope: p.scope, sortOrder: p.sortOrder })
      const to = p.workDate === today && p.scope === 'HARIAN' ? todayList(pid, role) : (extras[pid] ??= [])
      if (from !== to && from.includes(p.t)) {
        from.splice(from.indexOf(p.t), 1)
        to.push(p.t)
      }
    }
    afterTaskChange(pid, role)
    return json({ ok: true, moved: plan.length })
  }

  if (method === 'POST') {
    const pid = str(b.projectId, 64)
    const g = guardProject(pid, role, true)
    if (!g.ok) return g.res
    const context = b.context === 'MINGGUAN' ? 'MINGGUAN' : 'HARIAN'
    let scope: 'HARIAN' | 'MINGGUAN' = 'HARIAN'
    let day: Date
    if (context === 'MINGGUAN') {
      const period = parseWeekKey(str(b.week, 10))
      if (!period) return json({ error: 'Kunci minggu tidak dikenali' }, 400)
      scope = b.scope === 'MINGGUAN' ? 'MINGGUAN' : 'HARIAN'
      const d = scope === 'MINGGUAN' ? period.start : parseWibDateKey(b.workDate)
      if (!d || !dayInPeriod(period, d)) return json({ error: 'Tanggal berada di luar minggu ini.' }, 422)
      day = d
    } else {
      const requested = b.workDate ? parseWibDateKey(b.workDate) : todayDate()
      if (!requested) return json({ error: 'Tanggal tidak valid.' }, 400)
      if (requested.getTime() > todayDate().getTime()) return json({ error: 'Task tidak bisa dicatat untuk tanggal yang belum tiba.' }, 422)
      if (!isWorkingDay(requested)) return json({ error: 'Task harian hanya untuk hari kerja (Senin–Jumat).' }, 422)
      day = requested
    }
    const blocked = lockCheck(context, pid, day.toISOString(), scope, role)
    if (blocked) return blocked
    const { t, errors } = readTask(b, day.toISOString())
    if (errors.length) return json({ error: errors[0], errors }, 422)
    const list = day.toISOString() === todayIso() && scope === 'HARIAN' ? todayList(pid, role) : (extras[pid] ??= [])
    const task = mkTask(pid, t.title, t.status, day.toISOString(), { ...t, scope, sortOrder: list.filter((x) => x.workDate === day.toISOString() && x.scope === scope).length })
    list.push(task)
    afterTaskChange(pid, role)
    return json({ ok: true, task: taskOut(task) })
  }

  // PUT
  const existing = findTask(str(b.id, 64))
  if (!existing) return json({ error: 'Task tidak ditemukan' }, 404)
  const g = guardProject(existing.projectId, role, true)
  if (!g.ok) return g.res
  const context = b.context === 'MINGGUAN' ? 'MINGGUAN' : 'HARIAN'
  const blocked = lockCheck(context, existing.projectId, existing.workDate, existing.scope, role)
  if (blocked) return blocked
  const { t, errors } = readTask(b, existing.workDate)
  if (errors.length) return json({ error: errors[0], errors }, 422)
  Object.assign(existing, t)
  afterTaskChange(existing.projectId, role)
  return json({ ok: true, task: taskOut(existing) })
}

// ------------------------------------------------------------------
// Laporan harian (selain PIC)
// ------------------------------------------------------------------

function resolveDay(raw: unknown): { ok: true; day: Date; isToday: boolean } | { ok: false; res: Promise<Response> } {
  const today = todayDate()
  if (raw === undefined || raw === null || raw === '') return { ok: true, day: today, isToday: true }
  const day = parseWibDateKey(raw)
  if (!day) return { ok: false, res: json({ error: 'Tanggal laporan tidak valid.' }, 400) }
  if (day.getTime() > today.getTime()) return { ok: false, res: json({ error: 'Laporan tidak bisa diisi untuk tanggal yang belum tiba.' }, 422) }
  if (!isWorkingDay(day)) return { ok: false, res: json({ error: 'Laporan harian hanya untuk hari kerja (Senin–Jumat).' }, 422) }
  return { ok: true, day, isToday: day.getTime() === today.getTime() }
}

function dailyInputRoute(url: string, init: RequestInit | undefined, role: string): Promise<Response> {
  const method = init?.method ?? 'GET'
  if (!can(role, 'daily:input')) return json({ error: 'Peran Anda tidak melakukan input harian' }, 403)

  if (method === 'GET') {
    const resolved = resolveDay(params(url).get('date'))
    if (!resolved.ok) return resolved.res
    const day = resolved.day
    const dayKey = wibDateKey(day)
    const timeLocked = isDailyLocked(day)
    const projects = visibleDaily(role)
    const openDays = Object.entries(pastReports)
      .filter(([, r]) => activeUnlock(r.id))
      .map(([k, r]) => {
        const [pid, date] = k.split('|')
        const p = projects.find((x) => x.holder.id === pid)
        return p && date !== dayKey ? { reportId: r.id, projectId: pid, projectName: p.holder.name, date, unlockUntil: unlocks[r.id]?.unlockUntil ?? null } : null
      })
      .filter(Boolean)
    return json({
      reportDate: day.toISOString(),
      reportDateKey: dayKey,
      today: resolved.isToday,
      todayKey: wibDateKey(new Date()),
      lockAt: dailyLockAt(day).toISOString(),
      locked: timeLocked,
      countdown: dailyCountdown(),
      canRequestUnlock: can(role, 'unlock:request'),
      openDays,
      projects: projects.map((p) => {
        const r = reportFor(p, dayKey)
        const taskCount = allTasks(p.holder.id, role).filter((t) => t.workDate === day.toISOString() && t.scope === 'HARIAN').length
        const u = r ? (unlocks[r.id] ?? null) : null
        const unlock = u && (u.status !== 'DIEKSEKUSI' || activeUnlock(r!.id)) ? u : null
        const unlocked = unlock?.status === 'DIEKSEKUSI'
        const lockReason = unlocked ? null : r?.forwardedAt ? 'FORWARDED' : r?.isLocked ? 'LOCKED' : timeLocked ? 'TIME' : null
        return {
          id: p.holder.id,
          code: p.holder.code,
          name: p.holder.name,
          phase: p.holder.phase,
          taskCount,
          derived: taskCount > 0,
          editable: lockReason === null,
          lockReason,
          unlock,
          report: r
            ? {
                id: r.id,
                status: r.status,
                progressPct: r.progressPct,
                achievementToday: r.achievementToday ?? r.achievement ?? '',
                obstacle: r.obstacle ?? null,
                followUp: r.followUp ?? null,
                decisionRequestedFrom: r.decisionRequestedFrom ?? null,
                evidenceCount: r.evidenceCount,
                submittedAt: r.submittedAt,
                forwardedAt: r.forwardedAt,
                isLocked: Boolean(r.isLocked),
                evidence: evidenceOf('DAILY_REPORT', r.id, Math.min(r.evidenceCount, 3)).map(evOut),
              }
            : null,
        }
      }),
    })
  }

  const sp = params(url)
  const b = method === 'DELETE' ? {} : body(init)
  const pid = method === 'DELETE' ? (sp.get('projectId') ?? '').slice(0, 64) : str(b.projectId, 64)
  if (!pid && method === 'DELETE') return json({ error: 'Proyek wajib dipilih' }, 400)
  const resolved = resolveDay(method === 'DELETE' ? sp.get('date') : b.reportDate)
  if (!resolved.ok) return resolved.res
  const day = resolved.day
  const dayKey = wibDateKey(day)
  const p = dailyCatalog().find((x) => x.holder.id === pid)
  if (!p) return json({ error: 'Proyek tidak ditemukan' }, 404)
  const guard = guardProject(pid, role, true)
  if (!guard.ok) return guard.res
  const existing = reportFor(p, dayKey)
  const unlock = activeUnlock(existing?.id)
  const frozen = frozenOf(existing)
  const timeLocked = isDailyLocked(day) && !unlock

  if (method === 'DELETE') {
    if (!existing) return json({ error: resolved.isToday ? 'Belum ada laporan hari ini' : 'Belum ada laporan pada tanggal ini' }, 404)
    if (existing.forwardedAt) {
      return json(
        unlock
          ? { error: 'Laporan yang sudah diteruskan ke holding tidak dapat dihapus. Ubah isinya selama buka kunci berlaku.', locked: true, frozen: 'FORWARDED' }
          : { error: FORWARDED_FROZEN, locked: true, frozen: 'FORWARDED', reportId: existing.id },
        409
      )
    }
    if (frozen) return json({ error: frozenText(frozen), locked: true, frozen, reportId: existing.id }, 409)
    if (timeLocked) return json({ error: `Laporan ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}. Ajukan buka kunci untuk mengubahnya.`, locked: true, reportId: existing.id }, 409)
    delete evidence[evKey('DAILY_REPORT', existing.id)]
    if (resolved.isToday) p.holder.report = null
    else delete pastReports[`${pid}|${dayKey}`]
    return json({ ok: true })
  }

  // PUT
  const action = b.action === 'submit' ? 'submit' : 'save'
  const status = typeof b.status === 'string' ? b.status : ''
  const achievementToday = typeof b.achievementToday === 'string' ? b.achievementToday.slice(0, 4000) : ''
  const obstacle = typeof b.obstacle === 'string' ? b.obstacle.slice(0, 2000) : null
  const followUp = typeof b.followUp === 'string' ? b.followUp.slice(0, 2000) : null
  const decisionRequestedFrom = typeof b.decisionRequestedFrom === 'string' ? b.decisionRequestedFrom.slice(0, 200) : null
  const progressPct = Math.max(0, Math.min(100, Math.round(Number(b.progressPct) || 0)))
  if (status && !(DAILY_STATUSES as readonly string[]).includes(status)) return json({ error: 'Status laporan tidak dikenali.' }, 422)
  if (frozen) return json({ error: frozenText(frozen), locked: true, frozen, reportId: existing?.id ?? null }, 409)
  if (timeLocked) {
    return json(
      {
        error: resolved.isToday
          ? `Laporan hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}. Ajukan buka kunci untuk mengubahnya.`
          : 'Laporan tanggal ini tidak sedang dibuka. Ajukan buka kunci untuk mengubahnya.',
        locked: true,
        reportId: existing?.id ?? null,
      },
      409
    )
  }
  const ownEvidence = existing ? evidenceOf('DAILY_REPORT', existing.id, Math.min(existing.evidenceCount, 3)).length : 0
  const ru = rollup(allTasks(pid, role).filter((t) => t.workDate === day.toISOString() && t.scope === 'HARIAN'))
  const effStatus = ru ? ru.status : status
  const effProgress = ru ? ru.progressPct : progressPct
  const effEvidence = ru ? ownEvidence + ru.evidenceCount : ownEvidence
  const errors =
    action === 'submit'
      ? validateDailyReport({ status: effStatus, achievementToday, evidenceCount: effEvidence, obstacle, followUp })
      : !effStatus || !achievementToday.trim()
        ? ['Status dan capaian hari ini wajib diisi.']
        : []
  if (errors.length) return json({ error: errors[0], errors, evidenceCount: ownEvidence }, 422)

  const row: DailyRow = existing ?? {
    id: `r-${pid}-${dayKey}`, status: effStatus, progressPct: effProgress, evidenceCount: 0, submittedAt: null, submittedBy: null,
    forwardedAt: null, isLate: false,
  }
  Object.assign(row, {
    status: effStatus,
    progressPct: effProgress,
    achievementToday,
    achievement: achievementToday,
    obstacle,
    followUp,
    decisionRequestedFrom,
    needsEscalation: effStatus === 'TERKENDALA' || effStatus === 'MENUNGGU_KEPUTUSAN',
    evidenceCount: effEvidence,
    ...(action === 'submit'
      ? { submittedAt: new Date().toISOString(), submittedBy: ACTOR[role] ?? 'Pratinjau', ...(unlock && isDailyLocked(day) && !existing?.submittedAt ? { isLate: true } : {}) }
      : {}),
  })
  if (!existing) {
    if (resolved.isToday) p.holder.report = row
    else pastReports[`${pid}|${dayKey}`] = row
  }
  return json({ ok: true, reportId: row.id, submitted: action === 'submit', derivedFromTasks: Boolean(ru) })
}

// ------------------------------------------------------------------
// Penerimaan Admin PT (/api/inbox)
// ------------------------------------------------------------------

type DeskDivision = {
  id: string
  name: string
  head: { id: string; name: string } | null
  report: {
    id: string; statusHeader: string; submittedAt: string | null; approvedAt: string | null; forwardedAt: string | null
    items: number; done: number; blocked: number; missingEvidence: number; isLocked?: boolean
  } | null
}

function deskDivisions(): DeskDivision[] {
  return mock.deskAdmin.divisions as unknown as DeskDivision[]
}

/** Laporan mingguan divisi yang diteruskan dari penerimaan — dibaca mock-proyek untuk arsip /api/weekly-reports. */
export function deskWeeklyReports() {
  return deskDivisions().map((d) => ({ divisionId: d.id, name: d.name, head: d.head, report: d.report }))
}

type UndoFn = () => { ok: true; message: string } | { ok: false; status: number; error: string }
const undoTokens: Record<string, { fn: UndoFn; at: number; used: boolean }> = {}
function issueUndo(fn: UndoFn) {
  const token = `pvl${(++seq).toString(36)}${Math.random().toString(36).slice(2, 8)}`
  undoTokens[token] = { fn, at: Date.now(), used: false }
  return token
}

function inboxRoute(init: RequestInit | undefined, role: string): Promise<Response> {
  const method = init?.method ?? 'GET'
  if (method === 'GET') {
    if (!can(role, 'daily:forward') && !can(role, 'weekly:forward')) return json({ error: 'Peran Anda tidak menerima penerusan' }, 403)
    if (!scopeOf(role) && !isMasterRole(role)) return json({ error: 'Peran ini tidak terikat pada satu entitas' }, 400)
    const today = todayDate()
    const { isoYear, isoWeek } = isoWeekOf(new Date())
    const dl = weeklyDeadlines(new Date())
    return json({
      reportDate: today.toISOString(),
      dailyLockAt: dailyLockAt(today).toISOString(),
      dailyCountdown: dailyCountdown(),
      dailyLocked: isDailyLocked(today),
      week: { isoYear, isoWeek, handoverBy: dl.handoverBy.toISOString(), lockAt: dl.lockAt.toISOString() },
      daily: visibleDaily(role).map(({ holder: h }) => {
        const r = h.report
        return {
          projectId: h.id,
          code: h.code,
          name: h.name,
          picName: h.picName,
          reportId: r?.id ?? null,
          status: r?.status ?? null,
          progressPct: r?.progressPct ?? null,
          evidenceCount: r?.evidenceCount ?? 0,
          submittedAt: r?.submittedAt ?? null,
          submittedBy: r?.submittedBy ?? null,
          forwardedAt: r?.forwardedAt ?? null,
          readyToForward: Boolean(r?.submittedAt) && !r?.forwardedAt,
        }
      }),
      weekly: deskDivisions().map((d) => ({
        divisionId: d.id,
        name: d.name,
        headName: d.head?.name ?? null,
        reportId: d.report?.id ?? null,
        statusHeader: d.report?.statusHeader ?? null,
        itemCount: d.report?.items ?? 0,
        submittedAt: d.report?.submittedAt ?? null,
        approvedAt: d.report?.approvedAt ?? null,
        forwardedAt: d.report?.forwardedAt ?? null,
        readyToForward: d.report?.statusHeader === 'DISETUJUI' && !d.report?.forwardedAt,
      })),
    })
  }

  const b = body(init)
  const id = str(b.id, 64)
  if (!id) return json({ error: 'Id laporan wajib diisi' }, 400)
  if (b.kind !== 'weekly') {
    if (!can(role, 'daily:forward')) return json({ error: 'Peran Anda tidak meneruskan laporan harian' }, 403)
    const p = dailyCatalog().find((x) => x.holder.report?.id === id)
    const r = p?.holder.report
    if (!p || !r) return json({ error: 'Laporan tidak ditemukan' }, 404)
    if (!isMasterRole(role) && p.entityId !== scopeOf(role)) return json({ error: 'Laporan ini di luar entitas Anda' }, 403)
    if (!r.submittedAt) return json({ error: 'PIC belum mengirimkan laporan ini' }, 422)
    if (r.forwardedAt) return json({ error: 'Laporan ini sudah diteruskan' }, 409)
    const before = { isLocked: r.isLocked ?? false, lockedAt: r.lockedAt ?? null }
    const at = new Date().toISOString()
    Object.assign(r, { forwardedAt: at, isLocked: true, lockedAt: at })
    const undoToken = issueUndo(() => {
      if (r.forwardedAt !== at) return { ok: false, status: 409, error: 'Laporan ini sudah berubah sejak diteruskan.' }
      if (unlocks[r.id]) return { ok: false, status: 409, error: 'Laporan ini sudah diajukan buka kunci; penerusan tidak bisa diurungkan.' }
      Object.assign(r, { forwardedAt: null, ...before })
      return { ok: true, message: 'Penerusan laporan harian diurungkan.' }
    })
    return json({ ok: true, undoToken })
  }
  if (!can(role, 'weekly:forward')) return json({ error: 'Peran Anda tidak meneruskan laporan mingguan' }, 403)
  const d = deskDivisions().find((x) => x.report?.id === id)
  const w = d?.report
  if (!w) return json({ error: 'Laporan tidak ditemukan' }, 404)
  if (w.statusHeader !== 'DISETUJUI') return json({ error: 'Kepala divisi belum menyetujui laporan ini' }, 422)
  if (w.forwardedAt) return json({ error: 'Laporan ini sudah diteruskan' }, 409)
  const at = new Date().toISOString()
  const beforeLocked = w.isLocked ?? false
  Object.assign(w, { forwardedAt: at, isLocked: true })
  const undoToken = issueUndo(() => {
    if (w.forwardedAt !== at) return { ok: false, status: 409, error: 'Laporan ini sudah berubah sejak diteruskan.' }
    if (unlocks[w.id]) return { ok: false, status: 409, error: 'Laporan sudah diajukan buka kunci.' }
    Object.assign(w, { forwardedAt: null, isLocked: beforeLocked })
    return { ok: true, message: 'Penerusan laporan mingguan diurungkan.' }
  })
  return json({ ok: true, undoToken })
}

function undoRoute(init: RequestInit | undefined): Promise<Response> | null {
  const token = str(body(init).token, 64)
  const t = undoTokens[token]
  if (!t) return null
  if (t.used || Date.now() - t.at > 15 * 60000) return json({ error: 'Batas waktu urungkan sudah lewat.' }, 409)
  const r = t.fn()
  if (!r.ok) return json({ error: r.error }, r.status)
  t.used = true
  return json(r)
}

// ------------------------------------------------------------------
// Laporan kemajuan mingguan & bulanan (/api/progress-reports)
// ------------------------------------------------------------------

type PR = {
  id: string
  projectId: string
  cadence: ProgressCadence
  period: Period
  status: string
  progressPct: number
  summary: string
  obstacle: string | null
  followUp: string | null
  evidenceCount: number
  submittedAt: string | null
  isLocked: boolean
  updatedAt: string
}
const PERIODS_SHOWN: Record<ProgressCadence, number> = { MINGGUAN: 8, BULANAN: 6 }
const progress: Record<string, PR> = {}
const progressSeeded = new Set<string>()
const prKey = (pid: string, cadence: string, key: string) => `${pid}|${cadence}|${key}`

function seedProgress(pid: string, cadence: ProgressCadence) {
  const k = `${pid}|${cadence}`
  if (progressSeeded.has(k)) return
  progressSeeded.add(k)
  for (let i = 1; i < PERIODS_SHOWN[cadence]; i++) {
    if (i % 4 === 3) continue // satu periode sengaja tidak dikirim
    const period = periodOf(cadence, i)
    const r: PR = {
      id: uid('pr'), projectId: pid, cadence, period, status: i === 2 ? 'TERKENDALA' : 'ON_PROGRESS', progressPct: Math.max(5, 70 - i * 8),
      summary: cadence === 'MINGGUAN' ? 'Capaian minggu ini sesuai rencana kerja; dokumentasi uji diperbarui.' : 'Capaian bulan ini mengikuti jadwal tahapan proyek.',
      obstacle: i === 2 ? 'Perangkat uji dari vendor terlambat.' : null, followUp: i === 2 ? 'Jadwalkan ulang uji setelah perangkat tiba.' : null,
      evidenceCount: 1, submittedAt: new Date(progressLockAt(period).getTime() - 30 * HOUR).toISOString(), isLocked: true,
      updatedAt: new Date(progressLockAt(period).getTime() - 30 * HOUR).toISOString(),
    }
    progress[prKey(pid, cadence, period.key)] = r
    evidenceOf('PROGRESS_REPORT', r.id, 1)
  }
  if (cadence === 'BULANAN') {
    const period = periodOf(cadence, 0)
    const r: PR = {
      id: uid('pr'), projectId: pid, cadence, period, status: 'ON_PROGRESS', progressPct: 58, summary: 'Draf ringkasan bulan berjalan.',
      obstacle: null, followUp: null, evidenceCount: 0, submittedAt: null, isLocked: false, updatedAt: new Date(Date.now() - 50 * HOUR).toISOString(),
    }
    progress[prKey(pid, cadence, period.key)] = r
  }
}

function projectInfo(pid: string, role: string): { id: string; name: string; code: string } | null {
  if (role === 'PIC_PROYEK') {
    const p = mock.deskPic.projects.find((x) => x.id === pid)
    return p ? { id: p.id, name: p.name, code: p.code } : null
  }
  const h = dailyCatalog().find((x) => x.holder.id === pid)?.holder
  return h ? { id: h.id, name: h.name, code: h.code } : null
}

function progressRoute(url: string, init: RequestInit | undefined, role: string): Promise<Response> {
  const method = init?.method ?? 'GET'
  const sp = params(url)
  const parseCadence = (v: unknown): ProgressCadence | null => (v === 'MINGGUAN' || v === 'BULANAN' ? v : null)

  if (method === 'GET') {
    const pid = sp.get('projectId') ?? ''
    const cadence = parseCadence(sp.get('cadence'))
    if (!cadence) return json({ error: 'Kadens tidak dikenali' }, 400)
    const g = guardProject(pid, role)
    if (!g.ok) return g.res
    seedProgress(pid, cadence)
    const periods = Array.from({ length: PERIODS_SHOWN[cadence] }, (_, i) => periodOf(cadence, i))
    return json({
      project: { ...projectInfo(pid, role), entityId: g.entityId },
      cadence,
      periods: periods.map((p) => {
        const r = progress[prKey(pid, cadence, p.key)] ?? null
        return {
          key: p.key,
          start: p.start.toISOString(),
          end: p.end.toISOString(),
          lockAt: progressLockAt(p).toISOString(),
          locked: (r?.isLocked ?? false) || isProgressLocked(p),
          current: p.key === periodOf(cadence, 0).key,
          report: r
            ? {
                id: r.id, status: r.status, progressPct: r.progressPct, summary: r.summary, obstacle: r.obstacle, followUp: r.followUp,
                evidenceCount: r.evidenceCount, submittedAt: r.submittedAt, isLocked: r.isLocked, updatedAt: r.updatedAt,
                evidence: evidenceOf('PROGRESS_REPORT', r.id).map(evOut),
              }
            : null,
        }
      }),
    })
  }

  if (method === 'DELETE') {
    const r = Object.values(progress).find((x) => x.id === sp.get('id'))
    if (!r) return json({ error: 'Laporan tidak ditemukan' }, 404)
    const g = guardProject(r.projectId, role, true)
    if (!g.ok) return g.res
    if (r.isLocked || isProgressLocked(r.period)) return json({ error: 'Laporan ini sudah dikunci dan tidak dapat dihapus.', locked: true }, 409)
    delete progress[prKey(r.projectId, r.cadence, r.period.key)]
    delete evidence[evKey('PROGRESS_REPORT', r.id)]
    return json({ ok: true })
  }

  // PUT
  const b = body(init)
  const pid = str(b.projectId, 64)
  const cadence = parseCadence(b.cadence)
  if (!cadence) return json({ error: 'Kadens tidak dikenali' }, 400)
  const g = guardProject(pid, role, true)
  if (!g.ok) return g.res
  let period: Period | null = periodOf(cadence, 0)
  if (typeof b.periodKey === 'string' && b.periodKey) {
    period = null
    for (let i = 0; i < PERIODS_SHOWN[cadence] + 2; i++) if (periodOf(cadence, i).key === b.periodKey) period = periodOf(cadence, i)
  }
  if (!period) return json({ error: 'Periode di luar jangkauan' }, 400)
  const existing = progress[prKey(pid, cadence, period.key)]
  if (existing?.isLocked || isProgressLocked(period)) return json({ error: 'Periode ini sudah dikunci. Ajukan permohonan buka kunci.', locked: true }, 409)
  const action = b.action === 'submit' ? 'submit' : 'save'
  const status = typeof b.status === 'string' ? b.status : ''
  const summary = typeof b.summary === 'string' ? b.summary.slice(0, 4000) : ''
  const obstacle = typeof b.obstacle === 'string' && b.obstacle.trim() ? b.obstacle.slice(0, 2000) : null
  const followUp = typeof b.followUp === 'string' && b.followUp.trim() ? b.followUp.slice(0, 2000) : null
  const progressPct = Math.max(0, Math.min(100, Number(b.progressPct) || 0))
  const evidenceCount = existing ? evidenceOf('PROGRESS_REPORT', existing.id).length : 0
  const errors =
    action === 'submit'
      ? validateProgressReport({ status, summary, evidenceCount, obstacle, followUp })
      : !(DAILY_STATUSES as readonly string[]).includes(status) || !summary.trim()
        ? ['Status dan ringkasan capaian wajib diisi.']
        : []
  if (errors.length) return json({ error: errors[0], errors, evidenceCount }, 422)
  const now = new Date().toISOString()
  const r: PR = existing ?? {
    id: uid('pr'), projectId: pid, cadence, period, status, progressPct, summary, obstacle, followUp, evidenceCount: 0, submittedAt: null, isLocked: false, updatedAt: now,
  }
  Object.assign(r, { status, progressPct, summary, obstacle, followUp, evidenceCount, updatedAt: now, ...(action === 'submit' ? { submittedAt: now } : {}) })
  progress[prKey(pid, cadence, period.key)] = r
  return json({ ok: true, reportId: r.id, periodKey: period.key, submitted: action === 'submit' })
}

// ------------------------------------------------------------------
// Buka kunci: efek samping untuk laporan harian di sini
// ------------------------------------------------------------------

function unlockTarget(type: string, id: string) {
  if (type === 'DAILY_REPORT') {
    const p = dailyCatalog().find((p) => p.holder.report?.id === id)
    const report = findDailyById(id)
    const owner = p ?? dailyCatalog().find((p) => p.holder.id === projectOfReport(id))
    if (report && owner) return { report, entityId: owner.entityId, projectId: owner.holder.id, label: `Laporan harian ${owner.holder.name} · ${wibDateKey(reportDayOf(id))}` }
  }
  if (type === 'WEEKLY_REPORT') {
    const d = deskDivisions().find((d) => d.report?.id === id)
    if (d?.report) return { report: d.report, entityId: 'e1', projectId: null, label: `Laporan mingguan Divisi ${d.name} · ${mock.weeklyInput.week.key}` }
  }
  return null
}

function unlockRoute(url: string, init: RequestInit | undefined, role: string): Promise<Response> {
  const method = init?.method ?? 'GET'
  unlockItems.forEach((u) => activeUnlock(u.targetId))
  const me = actor(role)
  if (method === 'GET') {
    const status = params(url).get('status')
    const items = unlockItems.filter((u) => {
      if (status && status !== 'all' && u.status !== status) return false
      if (role === 'PIC_PROYEK' || role === 'KEPALA_DIVISI') return u.requestedBy?.id === me.id
      return groupRoles.includes(role) || unlockTarget(u.targetType, u.targetId)?.entityId === 'e1'
    })
    return json({ items, total: items.length, page: 1, pageSize: 30, can: { request: can(role, 'unlock:request'), approve: can(role, 'unlock:approve'), execute: can(role, 'unlock:execute') }, me: me.id })
  }
  const b = body(init)
  const at = new Date().toISOString()
  if (method === 'POST') {
    if (!can(role, 'unlock:request')) return json({ error: 'Peran Anda tidak mengajukan buka kunci' }, 403)
    const targetType = str(b.targetType)
    const targetId = str(b.targetId)
    const target = unlockTarget(targetType, targetId)
    if (!target || (!groupRoles.includes(role) && target.entityId !== 'e1') || (role === 'PIC_PROYEK' && (!target.projectId || !isPicProject(target.projectId)))) return json({ error: 'Laporan tidak ditemukan di cakupan Anda.' }, 404)
    const reason = str(b.reason, 500)
    if (reason.length < 10) return json({ error: 'Tulis alasan minimal 10 karakter.' }, 422)
    if (unlocks[targetId] && ['DIAJUKAN', 'DISETUJUI'].includes(unlocks[targetId].status)) return json({ error: 'Buka kunci untuk laporan ini masih diproses.' }, 409)
    const item: UnlockItem = { id: uid('ul'), targetType, targetId, targetLabel: target.label, reason, status: 'DIAJUKAN', requestedBy: me, approvedBy: null, executedBy: null, approvedAt: null, executedAt: null, unlockUntil: null, reLockedAt: null, createdAt: at }
    unlocks[targetId] = item
    unlockItems.unshift(item)
    return json({ ok: true, item }, 201)
  }
  const action = str(b.action)
  if (!['approve', 'reject', 'execute', 'relock'].includes(action)) return json({ error: 'Permintaan tidak valid' }, 400)
  if (!can(role, action === 'approve' || action === 'reject' ? 'unlock:approve' : 'unlock:execute')) return json({ error: 'Peran Anda tidak memproses buka kunci ini.' }, 403)
  const item = unlockItems.find((u) => u.id === b.id)
  if (!item) return json({ error: 'Pengajuan tidak ditemukan' }, 404)
  const target = unlockTarget(item.targetType, item.targetId)
  if (!target) return json({ error: 'Laporan yang dituju sudah tidak ada.' }, 404)
  if (['approve', 'reject'].includes(action) && item.requestedBy?.id === me.id) return json({ error: 'Anda tidak dapat memutuskan pengajuan Anda sendiri.' }, 403)
  const expected = ['approve', 'reject'].includes(action) ? 'DIAJUKAN' : action === 'execute' ? 'DISETUJUI' : 'DIEKSEKUSI'
  if (item.status !== expected || (action === 'relock' && item.reLockedAt)) return json({ error: 'Status pengajuan sudah berubah.' }, 409)
  if (action === 'approve' || action === 'reject') Object.assign(item, { status: action === 'approve' ? 'DISETUJUI' : 'DITOLAK', approvedAt: at, approvedBy: me })
  if (action === 'execute') {
    const hours = typeof b.hours === 'number' && Number.isFinite(b.hours) ? Math.min(72, Math.max(1, Math.floor(b.hours))) : 24
    Object.assign(item, { status: 'DIEKSEKUSI', executedBy: me, executedAt: at, unlockUntil: new Date(Date.now() + hours * HOUR).toISOString() })
    Object.assign(target.report, { isLocked: false })
  }
  if (action === 'relock') {
    item.reLockedAt = at
    Object.assign(target.report, { isLocked: true })
  }
  return json({ ok: true, item })
}

function weeklyInputRoute(url: string, init: RequestInit | undefined, role: string) {
  const method = init?.method ?? 'GET'
  if (!can(role, 'weekly:input') && !can(role, 'weekly:approve')) return json({ error: 'Peran Anda tidak mengisi laporan mingguan.' }, 403)
  const src = mock.weeklyInput
  const blockOf = (r: typeof src.divisions[number]['report']) => weeklyWriteBlock({ period: weekPeriodOf(new Date(src.week.start)), report: { ...r, forwardedAt: r.forwardedAt ? new Date(r.forwardedAt) : null }, unlocked: Boolean(activeUnlock(r.id)) })
  const isFrozen = (r: typeof src.divisions[number]['report']) => Boolean(blockOf(r))
  if (method === 'GET') return json({ ...src, canApprove: can(role, 'weekly:approve'), locked: isWeeklyLocked(new Date(src.week.start)), divisions: src.divisions.map((d) => ({ ...d, writable: !isFrozen(d.report), editable: !isFrozen(d.report), locked: isFrozen(d.report), lockReason: blockOf(d.report)?.message ?? null, frozen: blockOf(d.report)?.reason === 'FORWARDED', unlockUntil: activeUnlock(d.report.id)?.unlockUntil ?? null, unlock: unlocks[d.report.id] ?? null })) })
  const b = body(init)
  let itemId = method === 'DELETE' ? params(url).get('itemId') ?? params(url).get('id') : b.itemId ?? b.id
  const d = src.divisions.find((d) => d.id === b.divisionId || d.report.items.some((i) => i.id === itemId))
  if (!d) return json({ error: 'Divisi tidak ditemukan di cakupan Anda.' }, 404)
  const r = d.report
  if (isFrozen(r)) return json({ error: 'Laporan mingguan dikunci. Ajukan buka kunci untuk mengubahnya.' }, 409)
  if (method === 'POST') {
    const approve = b.action === 'approve'
    if (!can(role, approve ? 'weekly:approve' : 'weekly:input')) return json({ error: 'Peran Anda tidak menyetujui laporan mingguan.' }, 403)
    if (r.statusHeader !== (approve ? 'MENUNGGU_PERSETUJUAN' : 'DRAFT')) return json({ error: 'Status laporan sudah berubah.' }, 409)
    Object.assign(r, approve ? { statusHeader: 'DISETUJUI', approvedAt: new Date().toISOString() } : { statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: new Date().toISOString() })
    return json({ ok: true, reportId: r.id })
  }
  if (!can(role, 'weekly:input')) return json({ error: 'Peran Anda tidak mengubah laporan mingguan.' }, 403)
  if (method === 'DELETE') {
    const i = r.items.findIndex((i) => i.id === itemId)
    if (i < 0) return json({ error: 'Butir tidak ditemukan.' }, 404)
    r.items.splice(i, 1)
  } else if (method === 'PATCH') {
    const moves = Array.isArray(b.moves) ? b.moves as Record<string, unknown>[] : []
    if (!moves.length) return json({ error: 'Tidak ada kartu yang dipindahkan.' }, 422)
    const updates: { item: typeof r.items[number]; workDate: string | null; position: number }[] = []
    for (const move of moves) {
      const item = r.items.find((i) => i.id === move.itemId)
      const day = move.workDate ? parseWibDateKey(move.workDate) : null
      if (!item || (move.workDate && (!day || !src.days.includes(day.toISOString())))) return json({ error: 'Kartu atau hari tujuan berada di luar laporan ini.' }, 422)
      updates.push({ item, workDate: day?.toISOString() ?? null, position: Math.max(0, Math.floor(Number(move.position) || 0)) })
    }
    updates.forEach(({ item, ...change }) => Object.assign(item, change))
  } else if (method === 'PUT') {
    let item = r.items.find((i) => i.id === itemId)
    if (itemId && !item) return json({ error: 'Butir tidak ditemukan.' }, 404)
    const workItem = str(b.workItem, 4000)
    const status = str(b.status)
    const aspect = src.aspects.find((a) => a.id === b.aspectCategoryId)
    const priority = src.priorities.find((p) => p.id === b.priorityId)
    if (!workItem || !['BELUM_MULAI', 'ON_PROGRESS', 'TERKENDALA', 'SELESAI'].includes(status) || !aspect || !priority) return json({ error: 'Lengkapi pekerjaan, status, aspek dan prioritas.' }, 422)
    if (status === 'TERKENDALA' && !str(b.obstacleFollowUp)) return json({ error: 'Kendala wajib diisi untuk status Terkendala.' }, 422)
    const day = b.workDate ? parseWibDateKey(b.workDate) : null
    if (b.workDate && (!day || !src.days.includes(day.toISOString()))) return json({ error: 'Hari pengerjaan berada di luar minggu ini.' }, 422)
    if (!item) {
      item = { id: uid('wi'), workItem, targetOutput: '', picName: '', picTitle: '', status, progressPct: 0, achievementThisWeek: '', obstacleFollowUp: null, followUp: null, workDate: null, position: r.items.length, evidenceCount: 0, tags: [], subtasks: [], evidence: [], aspectCategory: aspect, priority }
      r.items.push(item)
      itemId = item.id
    }
    Object.assign(item, { workItem, status, aspectCategory: aspect, priority, progressPct: status === 'SELESAI' ? 100 : Math.max(0, Math.min(100, Number(b.progressPct) || 0)), ...(b.workDate !== undefined ? { workDate: day?.toISOString() ?? null } : {}) })
    for (const key of ['targetOutput', 'picName', 'picTitle', 'achievementThisWeek', 'obstacleFollowUp', 'followUp']) {
      if (key in b) Object.assign(item, { [key]: str(b[key], 4000) })
    }
  } else return json({ error: 'Metode tidak didukung.' }, 405)

  return json({ ok: true, reportId: r.id, itemId })
}

// ------------------------------------------------------------------
// Pintu masuk
// ------------------------------------------------------------------

/**
 * Dipanggil paling depan untuk laporan semua peran, task, penerusan dan unlock.
 * Bukti OUTPUT diteruskan ke mock-pic (null).
 */
export function handle(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  if (role === 'AUDITOR' && (init?.method ?? 'GET') !== 'GET') return json({ error: 'Peran Anda hanya dapat membaca.' }, 403)
  if (path === '/api/daily-input') return dailyInputRoute(url, init, role)
  if (path === '/api/weekly-input') return weeklyInputRoute(url, init, role)
  if (path === '/api/tasks') return tasksRoute(url, init, role)
  if (path === '/api/progress-reports') return progressRoute(url, init, role)
  if (path === '/api/inbox') return inboxRoute(init, role)
  if (path === '/api/evidence' || path.startsWith('/api/evidence/')) return evidenceRoute(path, url, init, role)
  if (path === '/api/unlock-requests') return unlockRoute(url, init, role)
  if (path === '/api/undo') return undoRoute(init)
  return null
}

// Seed satu kali: angka laporan mengikuti rumus computeRollup (src/lib/daily-rollup.ts),
// termasuk laporan contoh yang sudah dibekukan. Sesudah seed, mutasi selalu lewat gate.
for (const p of dailyCatalog()) {
  const tasks = todayList(p.holder.id, 'ADMIN_PT')
  const derived = rollup(tasks)
  if (p.holder.report && derived) {
    Object.assign(p.holder.report, { status: derived.status, progressPct: derived.progressPct, needsEscalation: ['TERKENDALA', 'MENUNGGU_KEPUTUSAN'].includes(derived.status) })
    p.holder.report.obstacle ??= tasks.filter((t) => t.obstacle || t.decisionNeeded).map((t) => t.obstacle || t.decisionNeeded).join(' | ') || null
  }
}
