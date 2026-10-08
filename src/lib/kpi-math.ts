/**
 * Rumus KPI bulanan per PT [F1-D] — bagian murni (tanpa basis data) dari
 * src/lib/kpi-snapshot.ts, supaya bisa dites.
 *
 *   onTimeDailyPct            laporan harian terkirim tepat waktu ÷ laporan yang
 *                             diharapkan (aktif pada hari itu menurut riwayat,
 *                             sejak dibuat/disetujui/mulai, PIC tidak absen)
 *   weeklyCompletenessPct     laporan mingguan terserahkan ÷ (divisi aktif ×
 *                             minggu bulan ini yang tenggat serahnya lewat)
 *   evidenceCompletenessPct   laporan harian & butir mingguan yang wajib bukti
 *                             dan punya bukti ÷ semua yang wajib bukti
 *   highPriorityCompletionPct task TINGGI/KRITIS bulan ini berstatus SELESAI ÷
 *                             semua task TINGGI/KRITIS bulan ini
 *   complianceScore           rata-rata berbobot 40/30/20/10 dari empat angka di
 *                             atas; komponen tanpa penyebut (mis. PT tanpa divisi)
 *                             tidak ikut dihitung dan bobotnya dibagi ulang.
 *
 * Komponen tanpa penyebut disimpan 0 (kolom tidak boleh null) dan tidak ikut
 * menurunkan skor.
 */

export type Ratio = { num: number; den: number }

export const SCORE_WEIGHTS = { onTimeDaily: 0.4, weekly: 0.3, evidence: 0.2, highPriority: 0.1 } as const

/** Persen 0–100 dengan satu desimal; null bila penyebut 0. */
export function pct(r: Ratio): number | null {
  if (r.den <= 0) return null
  return Math.round(Math.min(1, Math.max(0, r.num / r.den)) * 1000) / 10
}

export function complianceScore(parts: Record<keyof typeof SCORE_WEIGHTS, number | null>): number {
  let sum = 0
  let weight = 0
  for (const k of Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]) {
    const v = parts[k]
    if (v === null) continue
    sum += v * SCORE_WEIGHTS[k]
    weight += SCORE_WEIGHTS[k]
  }
  return weight === 0 ? 0 : Math.round((sum / weight) * 10) / 10
}

const DAY = 86400000
const WIB = 7 * 3600000

/** Tengah malam WIB tanggal 1 bulan `monthKey` ("YYYY-MM") dan bulan berikutnya. */
export function monthBounds(monthKey: string): { start: Date; end: Date } {
  const [y, m] = monthKey.split('-').map(Number)
  return { start: new Date(Date.UTC(y, m - 1, 1) - WIB), end: new Date(Date.UTC(y, m, 1) - WIB) }
}

export function monthKeyOf(date: Date): string {
  const w = new Date(date.getTime() + WIB)
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}`
}

export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Hari kerja (Senin–Jumat WIB) dalam [from, to], keduanya tengah malam WIB. */
export function workdaysBetween(from: Date, to: Date): Date[] {
  const out: Date[] = []
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const dow = new Date(t + WIB).getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(new Date(t))
  }
  return out
}

/** Jejak lifecycle yang sudah dicatat jalur proyek dan Urungkan. `at` adalah waktu kejadian, bukan updatedAt proyek. */
export type LifecycleAudit = { targetId: string; at: Date; action: string; beforeData: string | null; afterData: string | null }
export type HistoricalProject = {
  id: string; lifecycle: string; picUserId: string | null; startDate: Date | null; createdAt: Date; approvedAt: Date | null
}
const LIFECYCLES = new Set(['AKTIF', 'DITUTUP', 'DIARSIPKAN', 'DIUSULKAN', 'DITOLAK'])

function lifecycleIn(raw: string | null): string | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    const state = value?.lifecycle ?? value?.restored?.project?.lifecycle
    return typeof state === 'string' && LIFECYCLES.has(state) ? state : null
  } catch { return null }
}

/** Interval aktif dibuktikan tanggal persetujuan dan jejak transisi. Riwayat tutup yang hilang tidak ditebak. */
function activeIntervals(p: HistoricalProject, history: LifecycleAudit[]) {
  const events = history.filter((h) => h.targetId === p.id).map((h) => ({
    at: h.at.getTime(),
    before: lifecycleIn(h.beforeData) ?? (
      h.action === 'APPROVE_PROJECT' || h.action === 'REJECT_PROJECT' ? 'DIUSULKAN' :
      h.action === 'RESUBMIT_PROJECT' ? 'DITOLAK' : null
    ),
    after: lifecycleIn(h.afterData) ?? (
      h.action === 'CREATE_PROJECT' || h.action === 'CREATE_PROJECT_NO_APPROVAL' ? 'AKTIF' :
      h.action === 'PROPOSE_PROJECT' ? 'DIUSULKAN' : null
    ),
  })).filter((h) => h.after !== null).sort((a, b) => a.at - b.at)
  const earliest = Math.max(p.createdAt.getTime(), p.startDate?.getTime() ?? -Infinity)
  const first = events[0]
  let state = first ? first.before : p.lifecycle
  // approvedAt bisa diperbarui saat aktif kembali. Bukti AKTIF sebelum itu
  // pada audit lebih tua tetap dipertahankan.
  const approved = p.approvedAt?.getTime()
  let from = Math.max(earliest, approved !== undefined && (!first || approved <= first.at) ? approved : earliest)
  const intervals: { from: number; to: number }[] = []
  const unknown: { from: number; to: number }[] = []
  if (!first && (p.lifecycle === 'DITUTUP' || p.lifecycle === 'DIARSIPKAN' || (p.lifecycle !== 'AKTIF' && p.approvedAt))) {
    unknown.push({ from: earliest, to: Infinity })
  } else if (first && (first.before === 'DITUTUP' || first.before === 'DIARSIPKAN')) {
    // Tidak diketahui kapan masa aktif sebelum transisi pertama berakhir.
    unknown.push({ from: earliest, to: first.at })
  }
  let knownAt = earliest
  for (const event of events) {
    if (event.before && state && event.before !== state) unknown.push({ from: knownAt, to: event.at })
    if (state === 'AKTIF' && event.after !== 'AKTIF') intervals.push({ from, to: event.at })
    if (state !== 'AKTIF' && event.after === 'AKTIF') from = Math.max(earliest, event.at)
    state = event.after
    knownAt = event.at
  }
  if (state === 'AKTIF') intervals.push({ from, to: Infinity })
  if (events.length && state !== p.lifecycle) unknown.push({ from: knownAt, to: Infinity })
  return { intervals, unknown }
}

/** Pasangan proyek/hari wajib: pernah aktif sebelum tenggat di hari WIB itu, mempunyai PIC, dan tidak cuti. */
export function historicalOnTimeDaily(input: {
  days: Date[]; projects: HistoricalProject[]; history: LifecycleAudit[]
  reports: { projectId: string; reportDate: Date; submittedAt: Date | null; isLate: boolean }[]
  lockAt: (day: Date) => Date; absent: (userId: string, day: Date) => boolean
}): { ok: number; total: number; pct: number | null; historyComplete: boolean; unknownProjects: number } {
  const reports = new Map(input.reports.map((r) => [`${r.projectId}|${r.reportDate.getTime()}`, r]))
  const byProject = new Map<string, LifecycleAudit[]>()
  for (const h of input.history) {
    const rows = byProject.get(h.targetId) ?? []
    rows.push(h); byProject.set(h.targetId, rows)
  }
  let ok = 0
  let total = 0
  let unknownProjects = 0
  for (const project of input.projects) {
    if (!project.picUserId) continue
    const { intervals, unknown } = activeIntervals(project, byProject.get(project.id) ?? [])
    let incomplete = false
    for (const day of input.days) {
      const deadline = input.lockAt(day).getTime()
      if (unknown.some((i) => i.from <= deadline && i.to > day.getTime() && i.from < i.to)) {
        incomplete = true
        continue
      }
      if (!intervals.some((i) => i.from <= deadline && i.to > day.getTime() && i.from < i.to)) continue
      if (input.absent(project.picUserId, day)) continue
      total++
      const report = reports.get(`${project.id}|${day.getTime()}`)
      if (report?.submittedAt && !report.isLate && report.submittedAt.getTime() <= deadline) ok++
    }
    if (incomplete) unknownProjects++
  }
  return { ok, total, pct: total && !unknownProjects ? Math.round(ok / total * 100) : null, historyComplete: unknownProjects === 0, unknownProjects }
}

export type ProgressComparison = { current: number; previous: number; delta: number; projects: number; asOf: string }

/** Bandingkan seluruh kohor yang sama; satu proyek tanpa riwayat terverifikasi berarti delta tidak tersedia. */
export function compareProgress(
  projects: { id: string; progress: number; submittedAt: Date | null }[],
  history: { projectId: string; progressPct: number; reportDate: Date; submittedAt: Date | null; updatedAt: Date }[],
  cutoff: Date,
): ProgressComparison | null {
  if (!projects.length || projects.some((p) => !p.submittedAt)) return null
  const previous = new Map<string, { progress: number; date: number }>()
  for (const r of history) {
    if (!r.submittedAt || r.submittedAt >= cutoff || r.reportDate >= cutoff || r.updatedAt >= cutoff) continue
    if (!Number.isFinite(r.progressPct) || r.progressPct < 0 || r.progressPct > 100) continue
    if ((previous.get(r.projectId)?.date ?? -Infinity) < r.reportDate.getTime()) {
      previous.set(r.projectId, { progress: r.progressPct, date: r.reportDate.getTime() })
    }
  }
  if (projects.some((p) => !previous.has(p.id))) return null
  const current = Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length)
  const before = Math.round(projects.reduce((sum, p) => sum + previous.get(p.id)!.progress, 0) / projects.length)
  return { current, previous: before, delta: current - before, projects: projects.length, asOf: cutoff.toISOString() }
}
