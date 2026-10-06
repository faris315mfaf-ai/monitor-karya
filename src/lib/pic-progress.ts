/**
 * Progres PIC dibanding rencana, tenggat terdekat, dan riwayat laporan
 * (05-pic-proyek.md · "Progres dibanding rencana", "Tenggat terdekat",
 * "Riwayat laporan 6 hari"). Fungsi murni tanpa basis data agar bisa dites;
 * dipakai GET /api/project-progress. [F2-PIC]
 *
 * Rencana per minggu:
 *   - Sumber utama tahapan bertanggal (ProjectStage). Setiap tahap bernilai
 *     sama (1/n proyek); di dalam tahap, rencana naik linear dari tanggal mulai
 *     ke akhir hari tanggal selesainya. Tahap tanpa tanggal mulai memakai akhir
 *     tahap sebelumnya (atau mulai proyek); tanpa tanggal selesai memakai mulai
 *     tahap berikutnya (atau tenggat proyek). Tahap yang tetap tanpa rentang
 *     diabaikan.
 *   - Tanpa tahapan yang bisa dipakai: linear dari mulai proyek ke tenggat.
 *   - Tanpa keduanya: tidak ada rencana (null).
 * Aktual per minggu = progres laporan harian terkirim terakhir sampai akhir
 * minggu itu (minggu berjalan: sampai sekarang).
 */

const DAY = 86400000
const WIB = 7 * 3600000

export type StageInput = {
  id: string
  name: string
  position: number
  startDate: Date | null
  dueDate: Date | null
  status: string
  note: string | null
}
export type ProjectInput = { startDate: Date | null; targetEndDate: Date | null }
export type ReportInput = {
  reportDate: Date
  progressPct: number
  status: string
  submittedAt: Date | null
  forwardedAt: Date | null
  isLate: boolean
}
export type OutputInput = { id: string; title: string; status: string; dueDate: Date | null }
export type ProposalInput = { proposedDate: Date } | null

export type PlanSource = 'STAGES' | 'LINEAR' | 'NONE'

/** Tengah malam WIB hari `d`, sebagai instan UTC. */
export function wibMidnight(d: Date): Date {
  const w = new Date(d.getTime() + WIB)
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - WIB)
}

function wibKey(d: Date): string {
  return new Date(d.getTime() + WIB).toISOString().slice(0, 10)
}

function isoDow(d: Date): number {
  const day = new Date(d.getTime() + WIB).getUTCDay()
  return day === 0 ? 7 : day
}

function isoWeekNumber(d: Date): number {
  const w = new Date(d.getTime() + WIB)
  const x = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()))
  const dow = x.getUTCDay() || 7
  x.setUTCDate(x.getUTCDate() + 4 - dow)
  const yearStart = Date.UTC(x.getUTCFullYear(), 0, 1)
  return Math.ceil(((x.getTime() - yearStart) / DAY + 1) / 7)
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

type Span = { start: number; end: number }

/** Rentang waktu tiap tahap (ms), sesuai aturan di kepala berkas. */
export function stageSpans(stages: StageInput[], project: ProjectInput): Span[] {
  const sorted = [...stages].sort((a, b) => a.position - b.position)
  const spans: Span[] = []
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    const prev = sorted[i - 1]
    const next = sorted[i + 1]
    const start =
      s.startDate?.getTime() ??
      (prev?.dueDate ? prev.dueDate.getTime() + DAY : undefined) ??
      (i === 0 ? project.startDate?.getTime() : undefined)
    const end =
      (s.dueDate ? s.dueDate.getTime() + DAY : undefined) ??
      next?.startDate?.getTime() ??
      (i === sorted.length - 1 ? project.targetEndDate?.getTime() : undefined)
    if (start === undefined || end === undefined || end <= start) continue
    spans.push({ start, end })
  }
  return spans
}

/** Rencana (0–100) pada instan `t`, beserta sumbernya. */
export function plannedPctAt(spans: Span[], project: ProjectInput, t: Date): number | null {
  const at = t.getTime()
  if (spans.length) {
    const sum = spans.reduce((a, s) => a + clamp01((at - s.start) / (s.end - s.start)), 0)
    return Math.round((sum / spans.length) * 100)
  }
  const a = project.startDate?.getTime()
  const b = project.targetEndDate ? project.targetEndDate.getTime() + DAY : undefined
  if (a === undefined || b === undefined || b <= a) return null
  return Math.round(clamp01((at - a) / (b - a)) * 100)
}

export function planSource(spans: Span[], project: ProjectInput): PlanSource {
  if (spans.length) return 'STAGES'
  if (project.startDate && project.targetEndDate && project.targetEndDate > project.startDate) return 'LINEAR'
  return 'NONE'
}

export type WeekPoint = {
  /** "2026-W41" */
  key: string
  /** "M41" */
  label: string
  start: string
  actual: number
  plan: number | null
  /** Ada laporan terkirim sampai akhir minggu ini. */
  reported: boolean
}

/**
 * `weeks` minggu ISO terakhir sampai minggu berjalan. Minggu sebelum proyek
 * mulai (bila tanggal mulai diketahui) tidak ikut, tetapi minggu berjalan
 * selalu ada.
 */
export function weeklyProgress(input: {
  stages: StageInput[]
  project: ProjectInput
  reports: ReportInput[]
  now: Date
  weeks?: number
}): { source: PlanSource; weeks: WeekPoint[] } {
  const n = input.weeks ?? 6
  const spans = stageSpans(input.stages, input.project)
  const source = planSource(spans, input.project)
  const sent = input.reports
    .filter((r) => r.submittedAt)
    .sort((a, b) => a.reportDate.getTime() - b.reportDate.getTime())
  const monday = wibMidnight(new Date(input.now.getTime() - (isoDow(input.now) - 1) * DAY))
  const projectStart = input.project.startDate ? wibMidnight(input.project.startDate).getTime() : null

  const out: WeekPoint[] = []
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * 7 * DAY)
    const endExclusive = start.getTime() + 7 * DAY
    if (i > 0 && projectStart !== null && endExclusive <= projectStart) continue
    const until = i === 0 ? input.now.getTime() : endExclusive
    let last: ReportInput | null = null
    for (const r of sent) {
      if (r.reportDate.getTime() < until) last = r
      else break
    }
    const wk = isoWeekNumber(start)
    const thursday = new Date(start.getTime() + 3 * DAY + WIB)
    out.push({
      key: `${thursday.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`,
      label: `M${wk}`,
      start: start.toISOString(),
      actual: last?.progressPct ?? 0,
      plan: source === 'NONE' ? null : plannedPctAt(spans, input.project, new Date(until)),
      reported: last !== null,
    })
  }
  return { source, weeks: out }
}

// ------------------------------------------------------------------
// Tenggat terdekat
// ------------------------------------------------------------------

export type DeadlineKind = 'STAGE_START' | 'STAGE_DUE' | 'OUTPUT' | 'PROJECT'
export type DeadlineState = 'late' | 'risk' | 'neutral' | 'on'
export type DeadlineItem = {
  id: string
  kind: DeadlineKind
  date: string
  title: string
  note: string | null
  /** Hari dari hari ini (WIB); negatif = sudah lewat. */
  daysLeft: number
  state: DeadlineState
  badge: string
}

const OUTPUT_LABEL: Record<string, string> = {
  DIKERJAKAN: 'Output dikerjakan',
  PERLU_REVISI: 'Output perlu revisi',
  MENUNGGU_REVIEW: 'Output menunggu review',
}

function daysBetween(today: Date, d: Date): number {
  return Math.round((wibMidnight(d).getTime() - wibMidnight(today).getTime()) / DAY)
}

function badgeFor(daysLeft: number, blocked = false): { state: DeadlineState; badge: string } {
  if (daysLeft < 0) return { state: 'late', badge: `Lewat ${-daysLeft} hari` }
  if (blocked) return { state: 'risk', badge: daysLeft === 0 ? 'Hari ini · tertahan' : `${daysLeft} hari · tertahan` }
  if (daysLeft === 0) return { state: 'risk', badge: 'Hari ini' }
  if (daysLeft <= 3) return { state: 'risk', badge: `${daysLeft} hari lagi` }
  return { state: 'neutral', badge: `${daysLeft} hari lagi` }
}

/**
 * Tenggat yang masih terbuka, terdekat dulu: mulai/selesai tahap yang belum
 * selesai, target output yang belum diterima, dan tenggat proyek (dengan usul
 * geser bila ada). Yang sudah lewat tetap tampil di atas sebagai "Lewat n hari".
 */
export function nearestDeadlines(input: {
  stages: StageInput[]
  outputs: OutputInput[]
  project: ProjectInput
  proposal: ProposalInput
  now: Date
  limit?: number
  formatDate?: (d: Date) => string
}): DeadlineItem[] {
  const limit = input.limit ?? 5
  const fmt = input.formatDate ?? ((d: Date) => wibKey(d))
  const items: DeadlineItem[] = []
  const push = (it: Omit<DeadlineItem, 'daysLeft' | 'state' | 'badge'>, d: Date, blocked = false) => {
    const daysLeft = daysBetween(input.now, d)
    items.push({ ...it, daysLeft, ...badgeFor(daysLeft, blocked) })
  }

  for (const s of input.stages) {
    if (s.status === 'SELESAI') continue
    const blocked = s.status === 'TERTAHAN'
    if (s.status === 'BELUM_MULAI' && s.startDate && daysBetween(input.now, s.startDate) >= 0) {
      push({ id: `${s.id}:start`, kind: 'STAGE_START', date: s.startDate.toISOString(), title: `${s.name} mulai`, note: s.note }, s.startDate)
    } else if (s.dueDate) {
      push(
        { id: `${s.id}:due`, kind: 'STAGE_DUE', date: s.dueDate.toISOString(), title: `${s.name} selesai`, note: blocked ? (s.note ?? 'Tertahan') : s.note },
        s.dueDate,
        blocked
      )
    }
  }
  for (const o of input.outputs) {
    if (o.status === 'DITERIMA' || !o.dueDate) continue
    push({ id: `${o.id}:output`, kind: 'OUTPUT', date: o.dueDate.toISOString(), title: o.title, note: OUTPUT_LABEL[o.status] ?? 'Output' }, o.dueDate, o.status === 'PERLU_REVISI')
  }
  if (input.project.targetEndDate) {
    const t = input.project.targetEndDate
    push(
      {
        id: 'project:target',
        kind: 'PROJECT',
        date: t.toISOString(),
        title: 'Tenggat proyek',
        note: input.proposal ? `Usul geser ke ${fmt(input.proposal.proposedDate)} · sedang ditinjau` : null,
      },
      t
    )
  }

  // Yang lewat paling lama di atas, lalu yang terdekat; tie: tahap, output, proyek.
  const order: Record<DeadlineKind, number> = { STAGE_START: 0, STAGE_DUE: 1, OUTPUT: 2, PROJECT: 3 }
  items.sort((a, b) => a.daysLeft - b.daysLeft || order[a.kind] - order[b.kind])
  // Tenggat proyek selalu tampil walau di luar batas: ganti butir terakhir.
  const top = items.slice(0, limit)
  const project = items.find((i) => i.kind === 'PROJECT')
  if (project && !top.includes(project) && top.length) top[top.length - 1] = project
  return top
}

// ------------------------------------------------------------------
// Riwayat laporan hari kerja
// ------------------------------------------------------------------

export type HistoryState = 'FORWARDED' | 'SENT' | 'LATE' | 'MISSING' | 'PENDING' | 'DRAFT'
export type HistoryDay = {
  /** "YYYY-MM-DD" WIB */
  date: string
  state: HistoryState
  status: string | null
  progressPct: number | null
  submittedAt: string | null
}

/** `n` hari kerja terakhir (Senin–Jumat) sampai hari ini, terlama dulu. */
export function workingDaysBack(now: Date, n: number): Date[] {
  const out: Date[] = []
  let d = wibMidnight(now)
  // Hari ini ikut bila hari kerja; akhir pekan mundur ke Jumat.
  while (out.length < n) {
    if (isoDow(d) <= 5) out.unshift(d)
    d = new Date(d.getTime() - DAY)
  }
  return out
}

/**
 * Riwayat laporan `n` hari kerja. `cutoffPassed(day)` menjawab apakah tenggat
 * hari itu sudah lewat (hari ini sebelum 17.00 = PENDING, bukan MISSING).
 */
export function reportHistory(input: {
  reports: ReportInput[]
  now: Date
  days?: number
  cutoffPassed: (day: Date) => boolean
}): HistoryDay[] {
  const byKey = new Map(input.reports.map((r) => [wibKey(r.reportDate), r]))
  return workingDaysBack(input.now, input.days ?? 6).map((d) => {
    const key = wibKey(d)
    const r = byKey.get(key)
    const passed = input.cutoffPassed(d)
    let state: HistoryState
    if (r?.forwardedAt) state = 'FORWARDED'
    else if (r?.submittedAt) state = r.isLate ? 'LATE' : 'SENT'
    else if (!passed) state = r ? 'DRAFT' : 'PENDING'
    else state = 'MISSING'
    return {
      date: key,
      state,
      status: r?.status ?? null,
      progressPct: r ? r.progressPct : null,
      submittedAt: r?.submittedAt ? r.submittedAt.toISOString() : null,
    }
  })
}
