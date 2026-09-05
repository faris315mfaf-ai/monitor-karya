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
