import 'server-only'
import { db } from '@/lib/db'

// Salinan lokal fungsi WIB dari lock.ts (hindari circular import).
const WIB_OFFSET_MS = 7 * 3600 * 1000
function wibIsoDayFromDate(date: Date): number {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  const day = wib.getUTCDay()
  return day === 0 ? 7 : day
}
function wibHourOnDate(date: Date, hour: number): Date {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), hour, 0, 0) - WIB_OFFSET_MS)
}

export type ReportSettingsData = {
  dailyCutoffHour: number | null  // null = 24/7 tanpa batas
  workingDays: number[]           // kosong = setiap hari
  dailyOpen: boolean
  weeklyCutoffHour: number | null
  weeklyOpen: boolean
}

/** Bawaan: 24/7 untuk fase inisiasi proyek (keputusan pemilik 10 Okt 2026). */
export const DEFAULT_SETTINGS: ReportSettingsData = {
  dailyCutoffHour: 17,   // bawaan kode = perilaku lama (tes kompatibel)
  workingDays: [1, 2, 3, 4, 5],  // Senin–Jumat
  dailyOpen: true,
  weeklyCutoffHour: 17,
  weeklyOpen: true,
}

/** Baca settings untuk entity; fallback ke bawaan 24/7 bila belum diatur. */
export async function getReportSettings(entityId: string | null): Promise<ReportSettingsData> {
  if (!entityId) return DEFAULT_SETTINGS
  try {
    const row = await db.reportSettings.findUnique({ where: { entityId } })
    if (!row) return DEFAULT_SETTINGS
    return {
      dailyCutoffHour: row.dailyCutoffHour,
      workingDays: row.workingDays,
      dailyOpen: row.dailyOpen,
      weeklyCutoffHour: row.weeklyCutoffHour,
      weeklyOpen: row.weeklyOpen,
    }
  } catch {
    // Tabel belum ada (mock/tes) atau DB belum termigrasi → bawaan 24/7.
    return DEFAULT_SETTINGS
  }
}

/** isWorkingDay versi settings: workingDays kosong = setiap hari. */
export function isWorkingDayWith(workingDays: number[], date: Date): boolean {
  if (workingDays.length === 0) return true // setiap hari
  return workingDays.includes(wibIsoDayFromDate(date))
}

/** isDailyLocked versi settings: cutoff null = 24/7 (tidak pernah terkunci). */
export function isDailyLockedWith(cutoffHour: number | null, dailyOpen: boolean, reportDate: Date, now: Date): boolean {
  if (!dailyOpen) return true
  if (cutoffHour === null) return false
  const lock = wibHourOnDate(reportDate, cutoffHour)
  return lock !== null && now >= lock
}
