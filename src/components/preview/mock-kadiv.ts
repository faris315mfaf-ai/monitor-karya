import { onTime30 } from './mock-history'
import { projectSnapshots } from './mock-proyek'
import { outputSnapshots } from './mock-pic'
import { people } from './mock-catalog'
import { dailyProjects } from './mock-laporan'
import * as mock from './mock-data'
import { isDailyLocked } from '@/lib/lock'
/**
 * Rute pratinjau tambahan untuk area kepala divisi (P2-B). Kembalikan Response
 * untuk path yang ditangani, atau null agar diteruskan ke rute lain. Hanya mode
 * pengembangan. Data contoh bisa berubah (terima output, catat cuti, ingatkan)
 * supaya muat ulang tetap konsisten selama sesi pratinjau.
 */

import type { AttendanceStatus, KadivProject, KadivTeam, TeamMember, WeeklySummaryView } from '@/components/kadiv/types'

const DAY = 86400000
const now = () => new Date()
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString()
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

function wibMidnight(d: Date) {
  const w = new Date(d.getTime() + 7 * 3600000)
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - 7 * 3600000)
}
function workdays(n: number) {
  const out: Date[] = []
  for (let t = wibMidnight(now()).getTime(); out.length < n; t -= DAY) {
    const dow = new Date(t + 7 * 3600000).getUTCDay()
    if (dow !== 0 && dow !== 6) out.unshift(new Date(t))
  }
  return out
}

function projectDetails(): KadivProject[] {
  return projectSnapshots('KEPALA_DIVISI').filter((p) => p.lifecycle === 'AKTIF').map((p) => {
    const list = outputSnapshots('KEPALA_DIVISI').filter((o) => o.projectId === p.id)
    const accepted = list.filter((o) => o.status === 'DITERIMA').length
    const pending = list.filter((o) => o.status === 'MENUNGGU_REVIEW').length
    const revise = list.filter((o) => o.status === 'PERLU_REVISI').length
    return { ...p, outputs: { total: list.length, accepted, pending, revise, open: list.length - accepted - pending - revise }, nextOutputDue: list.filter((o) => o.status !== 'DITERIMA' && o.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]?.dueDate ?? null, stages: [], lastReport: p.latestReport ? { date: p.latestReport.reportDate, status: p.latestReport.status, submittedAt: p.lastReportAt } : null }
  })
}

/* Ringkasan laporan mingguan untuk Direktur [F2-KADIV] */
export const summary = { status: 'DRAF' as 'DRAF' | 'TERKIRIM', points: null as string[] | null, sentAt: null as string | null, updatedAt: null as string | null }

function weekInfo() {
  const today = wibMidnight(now())
  const dow = new Date(today.getTime() + 7 * 3600000).getUTCDay() || 7
  const start = new Date(today.getTime() - (dow - 1) * DAY)
  const thu = new Date(start.getTime() + 3 * DAY + 17 * 3600000)
  const fri = new Date(start.getTime() + 4 * DAY + 17 * 3600000)
  const w = new Date(start.getTime() + 7 * 3600000)
  const d = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + 3))
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const isoWeek = Math.ceil(((d.getTime() - y0.getTime()) / DAY + 1) / 7)
  return { key: `${d.getUTCFullYear()}-W${String(isoWeek).padStart(2, '0')}`, isoYear: d.getUTCFullYear(), isoWeek, start: start.toISOString(), handoverBy: thu.toISOString(), lockAt: fri.toISOString() }
}

function summaryView(): WeeklySummaryView {
  const t = team()
  const pending = t.summary.pendingReview
  const onTrack = t.projects.filter((p) => p.status === 'on' || p.status === 'done').length
  const accepted = state.outputs.filter((o) => o.status === 'DITERIMA')
  const stats = { outputsAccepted: t.summary.outputsAccepted, outputsTarget: t.summary.outputsTarget, projectsOnTrack: onTrack, projectsTotal: t.projects.length, openObstacles: 1, pendingReview: pending }
  const live = [
    `${stats.outputsAccepted} output diterima minggu ini dari ${stats.outputsTarget} yang ditargetkan: ${accepted.length ? accepted.slice(0, 3).map((o) => o.title).join(', ') : 'Uji beban server, Migrasi akun Keuangan, Desain halaman tagihan'}.`,
    `${onTrack} dari ${t.projects.length} proyek sesuai jadwal. Aplikasi Absensi perlu perhatian (Perangkat sidik jari cabang Bekasi belum terpasang.).`,
    '1 kendala terbuka: Aplikasi Absensi: Perangkat sidik jari cabang Bekasi belum terpasang.',
  ]
  const wk = weekInfo()
  const locked = Date.now() >= Date.parse(wk.lockAt)
  return {
    division: { id: 'dv-tek', name: 'Teknologi' },
    week: wk,
    live: { ...stats, points: live },
    saved: summary.points || summary.status === 'TERKIRIM'
      ? { ...stats, status: summary.status, points: summary.points ?? live, sentAt: summary.sentAt, updatedAt: summary.updatedAt ?? new Date().toISOString() }
      : null,
    daily: { sent: 17, required: 19 },
    report: mock.weeklyInput.divisions[0].report,
    directors: [{ id: 'dir1', name: 'Hadi Santoso' }],
    blocked: locked ? { code: 'LOCKED', message: 'Minggu ini sudah dikunci. Ringkasan tidak bisa diubah lagi.' } : null,
    undoMinutes: 15,
  }
}

const initialsOf = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
const state = {
  members: people.filter((p) => p.divisionId === 'dv-tek' && p.role === 'PIC_PROYEK').map((p): TeamMember => ({
    id: p.id, name: p.name, title: p.title, role: p.role, initials: initialsOf(p.name), isMember: true,
    attendance: 'HADIR', attendanceNote: null, projects: [], report: { state: 'TIDAK_WAJIB', required: 0, sent: 0, submittedAt: null, remindedAt: null, readAt: null },
    today: { tasks: [], achievements: [], obstacles: [], plans: [] }, load: { pct: null, openTasks: 0, openMinutes: 0 },
  })),
  get outputs() { return outputSnapshots('KEPALA_DIVISI') },
}

const HEAT_BASE = [
  [2, 3, 1, 2, 0, 3, 2, 1, 2, 1],
  [3, 2, 4, 2, 3, 2, 3, 4, 2, 2],
  [1, 2, 2, 1, 2, 3, 1, 2, 2, 1],
  [2, 1, 2, 3, 2, 2, 1, 3, 2, 2],
  [2, 3, 2, 2, 3, 1, 2, 2, 3, 2],
  [1, 2, 1, 2, 1, 2, 1, null, null, null],
  [1, 1, 2, 1, 2, 1, 2, 1, 1, 2],
]

function absent(m: TeamMember) {
  return m.attendance !== 'HADIR' && m.attendance !== 'TERLAMBAT' // [F2-DIREKTUR]
}

function team(): KadivTeam {
  const days = workdays(10)
  const today = wibMidnight(now())
  const lockAt = new Date(today.getTime() + 17 * 3600000)
  const ps = projectSnapshots('KEPALA_DIVISI').filter((p) => p.lifecycle === 'AKTIF')
  for (const m of state.members) {
    const owned = ps.filter((p) => p.picUserId === m.id)
    m.projects = owned.map((p) => ({ id: p.id, name: p.name, code: p.code }))
    const sent = owned.filter((p) => p.reportedToday).length
    m.report = { ...m.report, state: absent(m) ? 'ABSEN' : !owned.length ? 'TIDAK_WAJIB' : sent === owned.length ? 'TERKIRIM' : 'BELUM', required: absent(m) ? 0 : owned.length, sent, submittedAt: owned.find((p) => p.lastReportAt)?.lastReportAt ?? null, remindedAt: mock.deskAdmin.projects.find((p) => owned.some((o) => o.id === p.id))?.remindedAt ?? m.report.remindedAt }
    const reps = dailyProjects().filter((p) => owned.some((o) => o.id === p.id)).map((p) => p.report)
    m.today.achievements = reps.flatMap((r) => r?.submittedAt && (r.achievementToday || r.achievement) ? [r.achievementToday ?? r.achievement!] : [])
    m.today.obstacles = reps.flatMap((r) => r?.obstacle ? [r.obstacle] : [])
    m.today.plans = reps.flatMap((r) => r?.followUp ? [r.followUp] : [])
  }
  const ms = state.members
  const reporters = ms.filter((m) => m.report.state === 'TERKIRIM' || m.report.state === 'BELUM')
  const loads = ms.map((m) => m.load.pct).filter((v): v is number => v !== null)
  const accepted = state.outputs.filter((o) => o.status === 'DITERIMA').length
  return {
    today: today.toISOString(),
    lockAt: lockAt.toISOString(),
    locked: isDailyLocked(new Date()),
    cutoffLabel: '17.00',
    division: { id: 'dv-tek', name: 'Teknologi', entityName: 'PT Ratu Karya' },
    divisions: [{ id: 'dv-tek', name: 'Teknologi' }],
    projects: projectDetails(),
    members: ms,
    days: days.map((d) => d.toISOString()),
    heat: ms.map((m, i) => (HEAT_BASE[i] ?? HEAT_BASE[0]).map((v, j) => (j === 9 && absent(m) ? null : v))),
    trend: [24, 27, 25, 29, 30, 28, 33, accepted].map((v, i) => ({ label: `M${34 + i}`, accepted: v, target: [30, 30, 32, 32, 34, 34, 36, 38][i] })),
    activity: [
      { id: 'a1', actorName: 'Bagus Pratama', initials: 'BP', text: 'mengirim laporan harian · Migrasi Server', at: ago(20) },
      { id: 'a2', actorName: 'Yoga Saputra', initials: 'YS', text: 'mengirim output untuk direview · Laporan uji beban server cadangan', at: ago(48) },
      { id: 'a3', actorName: 'Dewi Lestari', initials: 'DL', text: 'mengunggah bukti · Daftar akun termigrasi', at: ago(75) },
      { id: 'a4', actorName: 'Rina Kartika', initials: 'RK', text: 'memperbarui task · Uji coba gelombang 2 di 3 cabang', at: ago(130) },
      { id: 'a5', actorName: 'Sari Wulandari', initials: 'SW', text: 'mengirim laporan harian · Portal Pelanggan', at: ago(140) },
      { id: 'a6', actorName: 'Lina Marlina', initials: 'LM', text: 'menambah task · Laporan uji Aplikasi Absensi', at: ago(300) },
    ],
    onTime30: onTime30('KEPALA_DIVISI'),
    summary: {
      members: ms.length,
      present: ms.filter((m) => !absent(m)).length,
      absent: ms.filter(absent).length,
      absentNames: ms.filter(absent).map((m) => m.name),
      reporters: reporters.length,
      reported: reporters.filter((m) => m.report.state === 'TERKIRIM').length,
      outputsAccepted: accepted,
      outputsTarget: state.outputs.length,
      pendingReview: state.outputs.filter((o) => o.status === 'MENUNGGU_REVIEW').length,
      avgLoad: loads.length ? Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) : null,
      overloaded: loads.filter((v) => v > 100).length,
    },
  }
}

function setAttendance(userId: string, status: AttendanceStatus, note: string | null) {
  const m = state.members.find((x) => x.id === userId)
  if (!m) return null
  const previous = m.attendance === 'HADIR' ? null : { status: m.attendance, note: m.attendanceNote }
  m.attendance = status
  m.attendanceNote = note
  const wasRequired = m.projects.length > 0
  if (status !== 'HADIR' && status !== 'TERLAMBAT') m.report = { ...m.report, state: 'ABSEN', required: 0 }
  else if (!wasRequired) m.report = { ...m.report, state: 'TIDAK_WAJIB', required: 0 }
  else m.report = { ...m.report, state: m.report.sent >= m.projects.length ? 'TERKIRIM' : 'BELUM', required: m.projects.length }
  return { row: { userId, name: m.name, status, note }, previous }
}

function body(init?: RequestInit): Record<string, unknown> {
  try {
    return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function handle(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  if (role === 'KEPALA_DIVISI') team()

  if (path === '/api/kadiv/team') {
    if (role !== 'KEPALA_DIVISI') return json({ error: 'Divisi ini di luar tanggung jawab Anda' }, 403)
    if (method === 'POST' && (body(init).action === 'read' || body(init).action === 'unread')) {
      const b = body(init)
      const m = state.members.find((x) => x.id === b.userId)
      if (!m) return json({ error: 'Orang ini bukan anggota tim Anda' }, 404)
      if (m.report.state !== 'TERKIRIM') return json({ error: 'Belum ada laporan harian yang masuk hari ini' }, 409)
      m.report.readAt = b.action === 'read' ? new Date().toISOString() : null
      return json({ ok: true, reportIds: [m.id] })
    }
    if (method === 'POST') {
      const b = body(init)
      const at = new Date().toISOString()
      const sent = state.members
        .filter((m) => m.report.state === 'BELUM' && !m.report.remindedAt && (!b.userId || m.id === b.userId))
        .map((m) => {
          m.report.remindedAt = at
          return { userId: m.id, name: m.name, projectId: m.projects[0]?.id ?? '' }
        })
      return json({ ok: true, sent, skipped: 0 })
    }
    return json(team())
  }

  if (path === '/api/kadiv/weekly-summary') {
    if (role !== 'KEPALA_DIVISI') return json({ error: 'Divisi ini di luar tanggung jawab Anda' }, 403)
    const b = method === 'GET' ? {} : body(init)
    const view = summaryView()
    if (method === 'GET') return json(view)
    if (view.blocked) return json({ error: view.blocked.message, code: view.blocked.code }, 409)
    const clean = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 3) : null)
    if (method === 'PUT') {
      if (summary.status === 'TERKIRIM') return json({ error: 'Ringkasan sudah dikirim ke Direktur. Tarik kembali dulu untuk menyuntingnya.', code: 'SENT' }, 409)
      const pts = clean(b.points)
      if (!pts?.length) return json({ error: 'Tulis 1 sampai 3 poin, masing-masing paling banyak 280 huruf' }, 422)
      summary.points = pts
      summary.updatedAt = new Date().toISOString()
      return json({ ok: true, updatedAt: summary.updatedAt })
    }
    if (b.action === 'unsend') {
      if (summary.status !== 'TERKIRIM') return json({ error: 'Ringkasan ini belum dikirim' }, 409)
      Object.assign(summary, { status: 'DRAF', sentAt: null })
      return json({ ok: true })
    }
    if (b.action === 'send') {
      if (summary.status === 'TERKIRIM') return json({ error: 'Ringkasan minggu ini sudah dikirim', code: 'SENT' }, 409)
      const pending = view.live.pendingReview
      if (pending > 0 && b.confirmPending !== true && Date.now() < Date.parse(view.week.handoverBy)) {
        return json({ error: `${pending} output masih menunggu review. Angka output belum final; kirim tetap atau review dulu.`, code: 'PENDING_REVIEW', pendingReview: pending }, 409)
      }
      summary.points = clean(b.points) ?? summary.points ?? view.live.points
      Object.assign(summary, { status: 'TERKIRIM', sentAt: new Date().toISOString() })
      return json({ ok: true, sentAt: summary.sentAt, directors: view.directors })
    }
    return json({ error: 'Aksi tidak dikenal' }, 400)
  }

  if (path === '/api/attendance' && role === 'KEPALA_DIVISI') {
    const sp = new URL(url, 'http://pratinjau').searchParams
    if (method === 'DELETE') {
      setAttendance(sp.get('userId') ?? '', 'HADIR', null)
      return json({ ok: true, removed: 1 })
    }
    if (method === 'POST') {
      const b = body(init)
      const r = setAttendance(String(b.userId ?? ''), String(b.status ?? 'HADIR') as AttendanceStatus, (b.note as string | null) ?? null)
      return r ? json({ ok: true, ...r }) : json({ error: 'Orang ini di luar tim Anda' }, 403)
    }
    return json({ rows: state.members.filter(absent).map((m) => ({ userId: m.id, name: m.name, status: m.attendance, note: m.attendanceNote })) })
  }

  if (path === '/api/kadiv/members' && role === 'KEPALA_DIVISI') {
    if (method === 'PUT') {
      const b = body(init)
      const m = state.members.find((x) => x.id === b.userId)
      if (m && typeof b.member === 'boolean') m.isMember = b.member
      return json({ ok: true, previousDivisionId: null })
    }
    return json({
      division: { id: 'dv-tek', name: 'Teknologi' },
      people: [
        ...state.members.map((m) => ({ id: m.id, name: m.name, title: m.title, role: m.role, divisionId: m.isMember ? 'dv-tek' : null, divisionName: m.isMember ? 'Teknologi' : null, isMember: m.isMember })),
        { id: 'km-hadi', name: 'Hendra Gunawan', title: 'Staf keuangan', role: 'PIC_PROYEK', divisionId: 'dv2', divisionName: 'Keuangan', isMember: false },
      ],
      projects: projectSnapshots('KEPALA_DIVISI').map((p) => ({ ...p, picName: null, divisionId: 'dv-tek', divisionName: 'Teknologi' })),
    })
  }


  return null
}
