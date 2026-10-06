/** Snapshot riwayat contoh per proyek dan hari WIB; agregat tidak menebak hari libur. */
import { startOfWibDay, isWorkingDay, wibDateKey } from '@/lib/lock'
import { dailyReportOn } from './mock-laporan'
import { projectSnapshots } from './mock-proyek'

const DAY = 86400000
const seedDay = startOfWibDay(new Date()).getTime()
export function historyDays(count = 10) {
  const days: string[] = []
  for (let t = startOfWibDay(new Date()).getTime(); days.length < count; t -= DAY) {
    if (isWorkingDay(new Date(t))) days.unshift(new Date(t).toISOString())
  }
  return days
}
export function reportHistory(projectId: string, dates = historyDays()) {
  const p = projectSnapshots('SUPERADMIN').find((p) => p.id === projectId)
  const hash = [...projectId].reduce((n, c) => n + c.charCodeAt(0), 0)
  return dates.map((date) => {
    const time = Date.parse(date)
    const today = time === startOfWibDay(new Date()).getTime()
    const live = dailyReportOn(projectId, date)
    const recorded = today || Boolean(live)
    const dayIndex = Math.round((seedDay - time) / DAY)
    const required = Boolean(p && p.picUserId && (!p.startDate || time >= startOfWibDay(new Date(p.startDate)).getTime()))
    const submitted = recorded ? Boolean(live?.submittedAt) : required && (hash + dayIndex) % 9 !== 0
    const isLate = recorded ? Boolean(live?.isLate) : submitted && (hash + dayIndex) % 11 === 0
    return { date, submittedAt: live?.submittedAt ?? (submitted ? new Date(time + 10 * 3600000).toISOString() : null), updatedAt: live?.submittedAt ?? new Date(time + 10 * 3600000).toISOString(), key: wibDateKey(new Date(date)), required, submitted, isLate, forwarded: recorded ? Boolean(live?.forwardedAt) : submitted, status: recorded ? live?.status ?? null : submitted ? 'ON_PROGRESS' : null, progressPct: recorded ? live?.progressPct ?? null : submitted ? Math.max(0, (p?.progress ?? 0) - Math.max(0, dayIndex) * 2) : null }
  })
}
export function dailyHistoryTotals(role: string, count = 10, entityId?: string) {
  const days = historyDays(count)
  const projects = projectSnapshots(role).filter((p) => p.lifecycle === 'AKTIF' && (!entityId || p.entityId === entityId))
  return days.map((date) => {
    const rows = projects.map((p) => reportHistory(p.id, [date])[0])
    return { date, expected: rows.filter((r) => r.required).length, submitted: rows.filter((r) => r.submitted).length, onTime: rows.filter((r) => r.submitted && !r.isLate).length, forwarded: rows.filter((r) => r.forwarded).length }
  })
}
export function onTime30(role: string, entityId?: string) {
  const since = startOfWibDay(new Date()).getTime() - 29 * DAY
  const days = dailyHistoryTotals(role, 30, entityId).filter((d) => Date.parse(d.date) >= since)
  const total = days.reduce((s, d) => s + d.expected, 0)
  const ok = days.reduce((s, d) => s + d.onTime, 0)
  return { pct: total ? Math.round(ok / total * 100) : 0, total, ok, days: days.length, target: 85 }
}
