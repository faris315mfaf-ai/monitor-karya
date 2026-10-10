import 'server-only'
import { db } from '@/lib/db'

export type ReportSettingsData = {
  dailyCutoffHour: number | null  // null = 24/7 tanpa batas
  workingDays: number[]           // kosong = setiap hari
  dailyOpen: boolean
  weeklyCutoffHour: number | null
  weeklyOpen: boolean
}

/** Bawaan: 24/7 untuk fase inisiasi proyek (keputusan pemilik 10 Okt 2026). */
export const DEFAULT_SETTINGS: ReportSettingsData = {
  dailyCutoffHour: null,
  workingDays: [],
  dailyOpen: true,
  weeklyCutoffHour: null,
  weeklyOpen: true,
}

/** Baca settings untuk entity; fallback ke bawaan 24/7 bila belum diatur. */
export async function getReportSettings(entityId: string | null): Promise<ReportSettingsData> {
  if (!entityId) return DEFAULT_SETTINGS
  const row = await db.reportSettings.findUnique({ where: { entityId } })
  if (!row) return DEFAULT_SETTINGS
  return {
    dailyCutoffHour: row.dailyCutoffHour,
    workingDays: row.workingDays,
    dailyOpen: row.dailyOpen,
    weeklyCutoffHour: row.weeklyCutoffHour,
    weeklyOpen: row.weeklyOpen,
  }
}
