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
