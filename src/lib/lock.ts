/**
 * Deadlines and locking, all reckoned in WIB (UTC+7) because that is the clock
 * the business runs on. Timestamps are stored as UTC, as everywhere else.
 *
 *   Daily   — a project's report for day D closes at 17:00 WIB on D.
 *   Weekly  — the head of division hands over by Thursday 17:00 WIB;
 *             Admin PT forwards by Friday 17:00 WIB, when the week locks.
 *
 * Locking is derived from the clock rather than driven by a scheduled job, so
 * there is no window where a missed cron leaves a report editable.
 */

const WIB_OFFSET_MS = 7 * 3600 * 1000

/** Cutoff hours are configurable so a different reporting rhythm — or a test
 *  run outside office hours — does not require a code change. Server-side only;
 *  in the browser these fall back to the documented defaults. */
function hourFromEnv(name: string, fallback: number): number {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
}

export const DAILY_CUTOFF_HOUR = hourFromEnv('DAILY_CUTOFF_HOUR', 17)
/** ISO day-of-week, 1 = Monday. Configurable for a different weekly rhythm. */
function dayFromEnv(name: string, fallback: number): number {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : fallback
}

export const WEEKLY_HANDOVER_DAY = dayFromEnv('WEEKLY_HANDOVER_DAY', 4) // Thursday
export const WEEKLY_LOCK_DAY = dayFromEnv('WEEKLY_LOCK_DAY', 5) // Friday
export const WEEKLY_CUTOFF_HOUR = hourFromEnv('WEEKLY_CUTOFF_HOUR', 17)

const DAY_NAMES_ID = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

/** "17.00 WIB" — for messages, so the wording follows the configured hour. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}.00 WIB`
}

export const DAILY_CUTOFF_LABEL = hourLabel(DAILY_CUTOFF_HOUR)
export const WEEKLY_HANDOVER_LABEL = `${DAY_NAMES_ID[WEEKLY_HANDOVER_DAY]} ${hourLabel(WEEKLY_CUTOFF_HOUR)}`
export const WEEKLY_LOCK_LABEL = `${DAY_NAMES_ID[WEEKLY_LOCK_DAY]} ${hourLabel(WEEKLY_CUTOFF_HOUR)}`

/** The UTC instant of a given WIB wall-clock hour on the WIB calendar day of `date`. */
function wibHourOn(date: Date, hour: number): Date {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  return new Date(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), hour, 0, 0) - WIB_OFFSET_MS
  )
}

/** Midnight WIB of the day containing `date`, as a UTC instant. Used as the
 *  canonical value of DailyProjectReport.reportDate. */
export function startOfWibDay(date: Date = new Date()): Date {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_OFFSET_MS)
}

/** WIB calendar day as YYYY-MM-DD. */
export function wibDateKey(date: Date = new Date()): string {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  return wib.toISOString().slice(0, 10)
}

/** ISO day-of-week in WIB: 1 = Monday … 7 = Sunday. */
export function wibIsoDay(date: Date = new Date()): number {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  return wib.getUTCDay() === 0 ? 7 : wib.getUTCDay()
}

export function isWorkingDay(date: Date = new Date()): boolean {
  return wibIsoDay(date) <= 5
}

// ------------------------------------------------------------------
// Daily reports
// ------------------------------------------------------------------

export function dailyLockAt(reportDate: Date): Date {
  return wibHourOn(reportDate, DAILY_CUTOFF_HOUR)
}

export function isDailyLocked(reportDate: Date, now: Date = new Date()): boolean {
  return now >= dailyLockAt(reportDate)
}

/** Time left before today's 17:00 WIB cutoff. */
export function dailyCountdown(now: Date = new Date()): {
  hours: number
  minutes: number
  totalMs: number
  passed: boolean
} {
  const diff = dailyLockAt(now).getTime() - now.getTime()
  if (diff <= 0) return { hours: 0, minutes: 0, totalMs: 0, passed: true }
  return {
    hours: Math.floor(diff / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    totalMs: diff,
    passed: false,
  }
}

// ------------------------------------------------------------------
// Weekly reports
// ------------------------------------------------------------------

/** Monday 00:00 WIB of the ISO week containing `date`, as a UTC instant. */
export function isoWeekStart(date: Date = new Date()): Date {
  const day = wibIsoDay(date)
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  const monday = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() - (day - 1))
  return new Date(monday - WIB_OFFSET_MS)
}

export function isoWeekOf(date: Date = new Date()): { isoYear: number; isoWeek: number } {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { isoYear: d.getUTCFullYear(), isoWeek }
}

/** Handover (Thursday) and lock (Friday) instants for the week containing `date`. */
export function weeklyDeadlines(date: Date = new Date()): {
  periodStart: Date
  periodEnd: Date
  handoverBy: Date
  lockAt: Date
} {
  const start = isoWeekStart(date)
  const dayMs = 86400000
  return {
    periodStart: start,
    periodEnd: new Date(start.getTime() + 6 * dayMs),
    handoverBy: wibHourOn(new Date(start.getTime() + (WEEKLY_HANDOVER_DAY - 1) * dayMs), WEEKLY_CUTOFF_HOUR),
    lockAt: wibHourOn(new Date(start.getTime() + (WEEKLY_LOCK_DAY - 1) * dayMs), WEEKLY_CUTOFF_HOUR),
  }
}

export function isWeeklyLocked(periodStart: Date, now: Date = new Date()): boolean {
  return now >= weeklyDeadlines(periodStart).lockAt
}

// ------------------------------------------------------------------
// Laporan kemajuan proyek — mingguan & bulanan (7 Sep 2026)
// ------------------------------------------------------------------

export const PROGRESS_CADENCES = ['MINGGUAN', 'BULANAN'] as const
export type ProgressCadence = (typeof PROGRESS_CADENCES)[number]

export type Period = { cadence: ProgressCadence; key: string; start: Date; end: Date }

/** ISO week containing `date`: key "2026-W36", Monday 00:00 -> Sunday 00:00 WIB. */
export function weekPeriodOf(date: Date = new Date()): Period {
  const { isoYear, isoWeek } = isoWeekOf(date)
  const start = isoWeekStart(date)
  return {
    cadence: 'MINGGUAN',
    key: `${isoYear}-W${String(isoWeek).padStart(2, '0')}`,
    start,
    end: new Date(start.getTime() + 6 * 86400000),
  }
}

/** Calendar month containing `date`: key "2026-09", 1st -> last day, 00:00 WIB. */
export function monthPeriodOf(date: Date = new Date()): Period {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  const y = wib.getUTCFullYear()
  const m = wib.getUTCMonth()
  return {
    cadence: 'BULANAN',
    key: `${y}-${String(m + 1).padStart(2, '0')}`,
    start: new Date(Date.UTC(y, m, 1) - WIB_OFFSET_MS),
    end: new Date(Date.UTC(y, m + 1, 0) - WIB_OFFSET_MS),
  }
}

/** The period `offset` steps before the current one (0 = current). */
export function periodOf(cadence: ProgressCadence, offset = 0, now: Date = new Date()): Period {
  if (cadence === 'MINGGUAN') {
    return weekPeriodOf(new Date(now.getTime() - offset * 7 * 86400000))
  }
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  const anchor = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - offset, 1) - WIB_OFFSET_MS)
  return monthPeriodOf(anchor)
}

/**
 * A monthly report stays open until the cutoff hour on the 3rd day of the
 * following month, so the PIC has a short window after month-end to close it.
 * Weekly project reports follow the same Friday lock as the division bundle.
 */
export function progressLockAt(period: Period): Date {
  if (period.cadence === 'MINGGUAN') return weeklyDeadlines(period.start).lockAt
  const wib = new Date(period.start.getTime() + WIB_OFFSET_MS)
  const graceDay = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() + 1, 3) - WIB_OFFSET_MS)
  return wibHourOn(graceDay, WEEKLY_CUTOFF_HOUR)
}

export function isProgressLocked(period: Period, now: Date = new Date()): boolean {
  return now >= progressLockAt(period)
}

export const TASK_URGENCIES = ['RENDAH', 'SEDANG', 'TINGGI', 'KRITIS'] as const

// ------------------------------------------------------------------
// Papan mingguan — capaian task per hari (8 Sep 2026)
// ------------------------------------------------------------------

/** HARIAN: capaian hari tertentu. MINGGUAN: capaian minggu tanpa hari tertentu. */
export const TASK_SCOPES = ['HARIAN', 'MINGGUAN'] as const
export type TaskScope = (typeof TASK_SCOPES)[number]

/** "2026-W37" -> periode minggu itu; null bila formatnya tidak dikenali. */
export function parseWeekKey(key: string): Period | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  if (week < 1 || week > 53) return null
  // ISO: minggu ke-1 selalu memuat 4 Januari. Cari Senin minggu itu, lalu geser.
  const jan4 = Date.UTC(year, 0, 4)
  const jan4Dow = new Date(jan4).getUTCDay() || 7
  const mondayW1 = jan4 - (jan4Dow - 1) * 86400000
  const monday = new Date(mondayW1 + (week - 1) * 7 * 86400000 - WIB_OFFSET_MS)
  const period = weekPeriodOf(monday)
  return period.key === key ? period : null
}

/** Tujuh hari (Senin..Minggu) sebuah periode mingguan, tengah malam WIB sebagai UTC. */
export function daysOfWeek(period: Period): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(period.start.getTime() + i * 86400000))
}

/** Apakah hari (tengah malam WIB) berada di dalam periode. */
export function dayInPeriod(period: Period, day: Date): boolean {
  return day.getTime() >= period.start.getTime() && day.getTime() <= period.end.getTime()
}

/** Kunci "YYYY-MM-DD" (WIB) -> tengah malam WIB sebagai UTC; null bila tidak valid. */
export function parseWibDateKey(key: unknown): Date | null {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const d = new Date(`${key}T00:00:00+07:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function validateProgressReport(input: {
  status: string
  summary: string
  evidenceCount: number
  obstacle?: string | null
  followUp?: string | null
}): string[] {
  const errors: string[] = []
  if (!DAILY_STATUSES.includes(input.status as (typeof DAILY_STATUSES)[number])) {
    errors.push('Status wajib dipilih.')
  }
  if (!input.summary?.trim()) errors.push('Ringkasan capaian wajib diisi.')
  if (dailyRequiresEvidence(input.status) && input.evidenceCount < 1) {
    errors.push('Bukti pendukung wajib dilampirkan minimal 1 untuk status ini.')
  }
  if (
    (input.status === 'TERKENDALA' || input.status === 'MENUNGGU_KEPUTUSAN') &&
    !input.obstacle?.trim()
  ) {
    errors.push('Kendala wajib dijelaskan untuk status Terkendala/Menunggu Keputusan.')
  }
  if (input.status === 'TERKENDALA' && !input.followUp?.trim()) {
    errors.push('Rencana tindak lanjut wajib diisi untuk status Terkendala.')
  }
  return errors
}

// ------------------------------------------------------------------
// Validation — "status dan bukti wajib terisi"
// ------------------------------------------------------------------

/** Statuses that stand on their own, with nothing to evidence. */
const DAILY_STATUS_WITHOUT_EVIDENCE = new Set(['TIDAK_ADA_PERUBAHAN'])
const WEEKLY_STATUS_WITHOUT_EVIDENCE = new Set(['BELUM_MULAI', 'NA'])

export const DAILY_STATUSES = [
  'SELESAI',
  'ON_PROGRESS',
  'TERKENDALA',
  'MENUNGGU_KEPUTUSAN',
  'TIDAK_ADA_PERUBAHAN',
] as const

export const TASK_STATUSES = [
  'BELUM_MULAI',
  'BERJALAN',
  'SELESAI',
  'TERKENDALA',
  'MENUNGGU_KEPUTUSAN',
] as const

export const WEEKLY_ITEM_STATUSES = [
  'SELESAI',
  'ON_PROGRESS',
  'BELUM_MULAI',
  'TERKENDALA',
  'NA',
] as const

export function dailyRequiresEvidence(status: string): boolean {
  return !DAILY_STATUS_WITHOUT_EVIDENCE.has(status)
}

export function weeklyRequiresEvidence(status: string): boolean {
  return !WEEKLY_STATUS_WITHOUT_EVIDENCE.has(status)
}

/**
 * Checks one daily report before it is accepted. Returns the list of problems;
 * an empty array means the item is valid.
 */
export function validateDailyReport(input: {
  status: string
  achievementToday: string
  evidenceCount: number
  obstacle?: string | null
  followUp?: string | null
}): string[] {
  const errors: string[] = []

  if (!DAILY_STATUSES.includes(input.status as (typeof DAILY_STATUSES)[number])) {
    errors.push('Status wajib dipilih.')
  }
  if (!input.achievementToday?.trim()) {
    errors.push('Capaian hari ini wajib diisi.')
  }
  if (dailyRequiresEvidence(input.status) && input.evidenceCount < 1) {
    errors.push('Bukti pendukung wajib dilampirkan minimal 1 untuk status ini.')
  }
  if (
    (input.status === 'TERKENDALA' || input.status === 'MENUNGGU_KEPUTUSAN') &&
    !input.obstacle?.trim()
  ) {
    errors.push('Kendala wajib dijelaskan untuk status Terkendala/Menunggu Keputusan.')
  }
  if (input.status === 'TERKENDALA' && !input.followUp?.trim()) {
    errors.push('Rencana tindak lanjut wajib diisi untuk status Terkendala.')
  }

  return errors
}

export function validateWeeklyItem(input: {
  workItem: string
  targetOutput: string
  picName: string
  status: string
  achievementThisWeek: string
  evidenceCount: number
  obstacleFollowUp?: string | null
}): string[] {
  const errors: string[] = []

  if (!input.workItem?.trim()) errors.push('Uraian pekerjaan wajib diisi.')
  if (!input.targetOutput?.trim()) errors.push('Target output wajib diisi.')
  if (!input.picName?.trim()) errors.push('PIC wajib diisi.')
  if (!WEEKLY_ITEM_STATUSES.includes(input.status as (typeof WEEKLY_ITEM_STATUSES)[number])) {
    errors.push('Status wajib dipilih.')
  }
  if (!input.achievementThisWeek?.trim()) errors.push('Capaian minggu ini wajib diisi.')
  if (weeklyRequiresEvidence(input.status) && input.evidenceCount < 1) {
    errors.push('Bukti pendukung wajib dilampirkan minimal 1 untuk status ini.')
  }
  if (input.status === 'TERKENDALA' && !input.obstacleFollowUp?.trim()) {
    errors.push('Kendala dan tindak lanjut wajib diisi untuk status Terkendala.')
  }

  return errors
}
