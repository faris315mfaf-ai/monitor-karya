// Date helpers considering WIB (Asia/Jakarta, UTC+7) timezone
// Database stores UTC; we convert to WIB for display and aggregation.

const WIB_OFFSET_MS = 7 * 3600 * 1000

/** Convert any Date to its WIB wall-clock components */
export function toWIB(date: Date = new Date()): Date {
  return new Date(date.getTime() + WIB_OFFSET_MS)
}

/** Start of "today" in WIB (00:00 WIB) as UTC Date */
export function startOfTodayWIB(): Date {
  const now = new Date()
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_OFFSET_MS)
}

/** End of "today" in WIB (24h after start) as UTC Date */
export function endOfTodayWIB(): Date {
  return new Date(startOfTodayWIB().getTime() + 24 * 3600 * 1000)
}

/** Start of given date in WIB (00:00 WIB) as UTC Date */
export function startOfDayWIB(date: Date): Date {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_OFFSET_MS)
}

/** End of given date in WIB as UTC Date */
export function endOfDayWIB(date: Date): Date {
  return new Date(startOfDayWIB(date).getTime() + 24 * 3600 * 1000)
}

/** Current month key YYYY-MM in WIB */
export function monthKeyNow(): string {
  const wib = toWIB()
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}`
}

/** ISO week + year of a date in WIB */
export function isoWeekKey(date: Date = new Date()): { year: number; week: number } {
  const wib = toWIB(date)
  const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

/** Last N month keys as YYYY-MM strings (most recent last) */
export function lastNMonthKeys(n: number): string[] {
  const keys: string[] = []
  const wib = toWIB()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - i, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/** Age in days (rounded down) */
export function ageDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86400000)
}

/** Days until target hour today (e.g. 17 for 17:00 WIB) */
export function countdownTo(targetHour: number): { hours: number; minutes: number; total: number; passed: boolean } {
  const now = new Date()
  const wib = toWIB(now)
  const target = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), targetHour, 0, 0) - WIB_OFFSET_MS)
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) {
    return { hours: 0, minutes: 0, total: 0, passed: true }
  }
  return {
    hours: Math.floor(diff / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    total: diff,
    passed: false,
  }
}
