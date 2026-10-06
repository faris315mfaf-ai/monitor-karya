/**
 * Rute pratinjau tambahan untuk area kepala divisi (P2-B). Kembalikan Response
 * untuk path yang ditangani, atau null agar diteruskan ke rute lain. Hanya mode
 * pengembangan. Data contoh bisa berubah (terima output, catat cuti, ingatkan)
 * supaya muat ulang tetap konsisten selama sesi pratinjau.
 */

import type { AttendanceStatus, KadivProject, KadivTeam, ReviewOutput, TeamMember, WeeklySummaryView } from '@/components/kadiv/types'

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

const PROJECTS = {
  mig: { id: 'kp-mig', code: 'RTK-021', name: 'Migrasi Server' },
  abs: { id: 'kp-abs', code: 'RTK-024', name: 'Aplikasi Absensi' },
  gws: { id: 'kp-gws', code: 'RTK-027', name: 'Google Workspace' },
  por: { id: 'kp-por', code: 'RTK-030', name: 'Portal Pelanggan' },
}

const isoDay = (offset: number) => new Date(wibMidnight(now()).getTime() + offset * DAY).toISOString()

/** Detail proyek untuk Timeline & Sheet proyek [F2-KADIV]. */
function projectDetails(): KadivProject[] {
  const outs = (pid: string) => {
    const mine = state.outputs.filter((o) => o.project.id === pid)
    return { pending: mine.filter((o) => o.status === 'MENUNGGU_REVIEW').length, acceptedNow: mine.filter((o) => o.status === 'DITERIMA').length, revise: mine.filter((o) => o.status === 'PERLU_REVISI').length }
  }
  const base = [
    { p: PROJECTS.mig, pic: 'Yoga Saputra', phase: 'PELAKSANAAN', start: -48, end: 40, status: 'on' as const, reason: null, progress: 64, accepted: 9, open: 3, due: 3, last: -0 },
    { p: PROJECTS.abs, pic: 'Rina Kartika', phase: 'PELAKSANAAN', start: -35, end: 21, status: 'risk' as const, reason: 'Perangkat sidik jari cabang Bekasi belum terpasang.', progress: 48, accepted: 6, open: 4, due: 2, last: -1 },
    { p: PROJECTS.gws, pic: 'Dewi Lestari', phase: 'PENYELESAIAN', start: -60, end: 12, status: 'on' as const, reason: null, progress: 82, accepted: 11, open: 1, due: 5, last: 0 },
    { p: PROJECTS.por, pic: 'Sari Wulandari', phase: 'PERENCANAAN', start: -14, end: 75, status: 'on' as const, reason: null, progress: 22, accepted: 5, open: 6, due: 8, last: 0 },
  ]
  return base.map((b) => {
    const o = outs(b.p.id)
    const accepted = b.accepted + o.acceptedNow
    return {
      ...b.p,
      picName: b.pic,
      phase: b.phase,
      startDate: isoDay(b.start),
      targetEndDate: isoDay(b.end),
      status: b.status,
      reason: b.reason,
      progress: b.progress,
      outputs: { total: accepted + o.pending + o.revise + b.open, accepted, pending: o.pending, revise: o.revise, open: b.open },
      nextOutputDue: isoDay(b.due),
      stages: [
        { id: `${b.p.id}-s1`, name: 'Analisis kebutuhan', status: 'SELESAI', dueDate: isoDay(b.start + 14) },
        { id: `${b.p.id}-s2`, name: 'Pelaksanaan', status: b.status === 'risk' ? 'TERTAHAN' : 'BERJALAN', dueDate: isoDay(b.end - 10) },
        { id: `${b.p.id}-s3`, name: 'Serah terima', status: 'BELUM_MULAI', dueDate: isoDay(b.end) },
      ],
      lastReport: { date: isoDay(b.last), status: b.status === 'risk' ? 'TERKENDALA' : 'ON_PROGRESS', submittedAt: ago(60) },
    }
  })
}

/* Ringkasan laporan mingguan untuk Direktur [F2-KADIV] */
const summary = { status: 'DRAF' as 'DRAF' | 'TERKIRIM', points: null as string[] | null, sentAt: null as string | null, updatedAt: null as string | null }

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
    division: { id: 'dv1', name: 'Teknologi' },
    week: wk,
    live: { ...stats, points: live },
    saved: summary.points || summary.status === 'TERKIRIM'
      ? { ...stats, status: summary.status, points: summary.points ?? live, sentAt: summary.sentAt, updatedAt: summary.updatedAt ?? new Date().toISOString() }
      : null,
    daily: { sent: 17, required: 19 },
    report: { id: 'wr1', statusHeader: 'DRAFT', submittedAt: null, approvedAt: null, forwardedAt: null },
    directors: [{ id: 'dir1', name: 'Hadi Santoso' }],
    blocked: locked ? { code: 'LOCKED', message: 'Minggu ini sudah dikunci. Ringkasan tidak bisa diubah lagi.' } : null,
    undoMinutes: 15,
  }
}

type Seed = Omit<TeamMember, 'initials' | 'isMember'>
const SEED: Seed[] = [
  {
    id: 'km-rina', name: 'Rina Kartika', title: 'Analis sistem', role: 'PIC_PROYEK', attendance: 'HADIR', attendanceNote: null,
    projects: [PROJECTS.abs],
    report: { state: 'BELUM', required: 1, sent: 0, submittedAt: null, remindedAt: null, readAt: null },
    today: {
      achievements: [],
      tasks: [
        { id: 't1', title: 'Uji coba gelombang 2 di 3 cabang', status: 'TERKENDALA', progressPct: 30, projectName: 'Aplikasi Absensi' },
        { id: 't2', title: 'Rekap umpan balik pengguna', status: 'BERJALAN', progressPct: 60, projectName: 'Aplikasi Absensi' },
      ],
      obstacles: ['Perangkat sidik jari cabang Bekasi belum terpasang.'],
      plans: ['Jadwal ulang uji coba cabang Bekasi'],
    },
    load: { pct: 112, openTasks: 9, openMinutes: 1610 },
  },
  {
    id: 'km-yoga', name: 'Yoga Saputra', title: 'Insinyur infrastruktur', role: 'PIC_PROYEK', attendance: 'HADIR', attendanceNote: null,
    projects: [PROJECTS.mig],
    report: { state: 'TERKIRIM', required: 1, sent: 1, submittedAt: ago(35), remindedAt: null, readAt: null },
    today: {
      achievements: ['Uji beban server cadangan selesai, 1.200 pengguna serentak tanpa galat.'],
      tasks: [
        { id: 't3', title: 'Uji beban server cadangan', status: 'SELESAI', progressPct: 100, projectName: 'Migrasi Server' },
        { id: 't4', title: 'Pindahkan basis data arsip', status: 'BERJALAN', progressPct: 45, projectName: 'Migrasi Server' },
      ],
      obstacles: [],
      plans: ['Pemindahan basis data arsip tahap 2'],
    },
    load: { pct: 86, openTasks: 6, openMinutes: 1240 },
  },
  {
    id: 'km-sari', name: 'Sari Wulandari', title: 'Desainer produk', role: 'PIC_PROYEK', attendance: 'HADIR', attendanceNote: null,
    projects: [PROJECTS.por],
    report: { state: 'TERKIRIM', required: 1, sent: 1, submittedAt: ago(140), remindedAt: null, readAt: null },
    today: { achievements: [], tasks: [{ id: 't5', title: 'Desain halaman tagihan', status: 'BERJALAN', progressPct: 55, projectName: 'Portal Pelanggan' }], obstacles: [], plans: ['Uji keterbacaan dengan 5 pelanggan'] },
    load: { pct: 74, openTasks: 4, openMinutes: 1070 },
  },
  {
    id: 'km-dewi', name: 'Dewi Lestari', title: 'Administrator TI', role: 'PIC_PROYEK', attendance: 'HADIR', attendanceNote: null,
    projects: [PROJECTS.gws],
    report: { state: 'TERKIRIM', required: 1, sent: 1, submittedAt: ago(70), remindedAt: null, readAt: null },
    today: { achievements: [], tasks: [{ id: 't6', title: 'Migrasi akun divisi Keuangan', status: 'SELESAI', progressPct: 100, projectName: 'Google Workspace' }], obstacles: [], plans: ['Migrasi akun divisi SDM'] },
    load: { pct: 63, openTasks: 3, openMinutes: 910 },
  },
  {
    id: 'km-bagus', name: 'Bagus Pratama', title: 'Pengembang', role: 'PIC_PROYEK', attendance: 'HADIR', attendanceNote: null,
    projects: [PROJECTS.mig],
    report: { state: 'TERKIRIM', required: 1, sent: 1, submittedAt: ago(20), remindedAt: null, readAt: null },
    today: { achievements: [], tasks: [{ id: 't7', title: 'Skrip pemantauan server baru', status: 'BERJALAN', progressPct: 80, projectName: 'Migrasi Server' }], obstacles: [], plans: [] },
    load: { pct: 81, openTasks: 5, openMinutes: 1170 },
  },
  {
    id: 'km-fajar', name: 'Fajar Nugroho', title: 'Teknisi jaringan', role: 'PIC_PROYEK', attendance: 'CUTI', attendanceNote: 'Cuti tahunan sampai Rabu',
    projects: [],
    report: { state: 'ABSEN', required: 0, sent: 0, submittedAt: null, remindedAt: null, readAt: null },
    today: { achievements: [], tasks: [], obstacles: [], plans: [] },
    load: { pct: null, openTasks: 2, openMinutes: 240 },
  },
  {
    id: 'km-lina', name: 'Lina Marlina', title: 'Penguji perangkat lunak', role: 'PIC_PROYEK', attendance: 'HADIR', attendanceNote: null,
    projects: [],
    report: { state: 'TIDAK_WAJIB', required: 0, sent: 0, submittedAt: null, remindedAt: null, readAt: null },
    today: { achievements: [], tasks: [{ id: 't8', title: 'Laporan uji Aplikasi Absensi', status: 'BERJALAN', progressPct: 40, projectName: 'Aplikasi Absensi' }], obstacles: [], plans: [] },
    load: { pct: 68, openTasks: 4, openMinutes: 980 },
  },
]

const initialsOf = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

const state = {
  members: SEED.map((m) => ({ ...m, initials: initialsOf(m.name), isMember: true })) as TeamMember[],
  accepted: 31,
  target: 38,
  outputs: [
    { id: 'ko1', title: 'Laporan uji beban server cadangan', project: PROJECTS.mig, owner: 'km-yoga', min: 2900, ev: 2 },
    { id: 'ko2', title: 'Runbook pemindahan basis data', project: PROJECTS.mig, owner: 'km-bagus', min: 1500, ev: 1 },
    { id: 'ko3', title: 'Hasil uji coba gelombang 1', project: PROJECTS.abs, owner: 'km-rina', min: 600, ev: 3 },
    { id: 'ko4', title: 'Daftar akun termigrasi divisi Keuangan', project: PROJECTS.gws, owner: 'km-dewi', min: 240, ev: 1 },
    { id: 'ko5', title: 'Tautan desain halaman tagihan', project: PROJECTS.por, owner: 'km-sari', min: 95, ev: 1 },
  ].map(
    (o): ReviewOutput => ({
      id: o.id,
      title: o.title,
      description: null,
      status: 'MENUNGGU_REVIEW',
      project: o.project,
      owner: { id: o.owner, name: SEED.find((m) => m.id === o.owner)?.name ?? '', initials: initialsOf(SEED.find((m) => m.id === o.owner)?.name ?? '') },
      submittedAt: ago(o.min),
      dueDate: null,
      evidenceCount: o.ev,
      reviewedAt: null,
      revisionNote: null,
    }),
  ),
  notes: [] as { id: string; body: string; createdAt: string; authorName: string; mine: boolean; readAt: string | null; projectId: string }[],
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
  const ms = state.members
  const reporters = ms.filter((m) => m.report.state === 'TERKIRIM' || m.report.state === 'BELUM')
  const loads = ms.map((m) => m.load.pct).filter((v): v is number => v !== null)
  const accepted = state.accepted + state.outputs.filter((o) => o.status === 'DITERIMA').length
  return {
    today: today.toISOString(),
    lockAt: lockAt.toISOString(),
    locked: false,
    cutoffLabel: '17.00',
    division: { id: 'dv1', name: 'Teknologi', entityName: 'PT Ratu Karya' },
    divisions: [{ id: 'dv1', name: 'Teknologi' }],
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
    onTime30: { pct: 82, ok: 70, total: 85, target: 85, days: 21 },
    summary: {
      members: ms.length,
      present: ms.filter((m) => !absent(m)).length,
      absent: ms.filter(absent).length,
      absentNames: ms.filter(absent).map((m) => m.name),
      reporters: reporters.length,
      reported: reporters.filter((m) => m.report.state === 'TERKIRIM').length,
      outputsAccepted: accepted,
      outputsTarget: state.target,
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

  if (path === '/api/outputs/review') {
    if (role !== 'KEPALA_DIVISI') return json({ error: 'Divisi ini di luar tanggung jawab Anda' }, 403)
    if (method === 'POST') {
      const b = body(init)
      const at = new Date().toISOString()
      const byId = (id: unknown) => state.outputs.find((o) => o.id === id)
      if (b.action === 'accept' || b.action === 'revise') {
        const o = byId(b.id)
        if (!o || o.status !== 'MENUNGGU_REVIEW') return json({ error: 'Output ini sudah diputuskan' }, 409)
        if (b.action === 'revise' && String(b.note ?? '').trim().length < 5) return json({ error: 'Tulis catatan revisi untuk PIC, minimal 5 huruf' }, 422)
        Object.assign(o, { status: b.action === 'accept' ? 'DITERIMA' : 'PERLU_REVISI', reviewedAt: at, revisionNote: b.action === 'revise' ? String(b.note) : null })
        return json({ ok: true, ids: [o.id], reviewedAt: at })
      }
      if (b.action === 'accept-all') {
        const ids = Array.isArray(b.ids) ? (b.ids as string[]) : null
        const rows = state.outputs.filter((o) => o.status === 'MENUNGGU_REVIEW' && (!ids || ids.includes(o.id)))
        rows.forEach((o) => Object.assign(o, { status: 'DITERIMA', reviewedAt: at }))
        return json({ ok: true, ids: rows.map((o) => o.id), reviewedAt: at })
      }
      if (b.action === 'undo') {
        const ids = Array.isArray(b.ids) ? (b.ids as string[]) : []
        const rows = state.outputs.filter((o) => ids.includes(o.id) && o.status !== 'MENUNGGU_REVIEW')
        // Sama dengan server [F1-D]: urungkan "minta revisi" memulihkan catatan putaran sebelumnya
        // (di data contoh selalu putaran pertama, jadi kosong); urungkan "terima" tidak mengubah catatan.
        rows.forEach((o) => Object.assign(o, { status: 'MENUNGGU_REVIEW', reviewedAt: null, revisionNote: o.status === 'PERLU_REVISI' ? null : o.revisionNote }))
        return json({ ok: true, ids: rows.map((o) => o.id) })
      }
      return json({ error: 'Aksi tidak dikenal' }, 400)
    }
    return json({
      queue: state.outputs.filter((o) => o.status === 'MENUNGGU_REVIEW'),
      decided: state.outputs.filter((o) => o.status !== 'MENUNGGU_REVIEW'),
      undoMinutes: 15,
    })
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
      division: { id: 'dv1', name: 'Teknologi' },
      people: [
        ...state.members.map((m) => ({ id: m.id, name: m.name, title: m.title, role: m.role, divisionId: m.isMember ? 'dv1' : null, divisionName: m.isMember ? 'Teknologi' : null, isMember: m.isMember })),
        { id: 'km-hadi', name: 'Hendra Gunawan', title: 'Staf keuangan', role: 'PIC_PROYEK', divisionId: 'dv2', divisionName: 'Keuangan', isMember: false },
      ],
      projects: Object.values(PROJECTS).map((p) => ({ ...p, picName: null, divisionId: 'dv1', divisionName: 'Teknologi' })),
    })
  }

  if (path === '/api/project-notes' && role === 'KEPALA_DIVISI') {
    const sp = new URL(url, 'http://pratinjau').searchParams
    if (method === 'POST') {
      const b = body(init)
      state.notes.push({ id: `kn${state.notes.length}`, body: String(b.body ?? ''), createdAt: new Date().toISOString(), authorName: 'Andi Wijaya', mine: true, readAt: null, projectId: String(b.projectId ?? '') })
      return json({ ok: true }, 201)
    }
    if (method === 'PATCH') return json({ ok: true, marked: 0 })
    const pid = sp.get('projectId') ?? ''
    return json({ projectId: pid, unread: 0, heads: ['Andi Wijaya'], items: state.notes.filter((n) => n.projectId === pid) })
  }

  return null
}
