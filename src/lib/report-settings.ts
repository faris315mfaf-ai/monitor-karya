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
  } catch (err) {
    // [T11-DB] Galat koneksi/inisialisasi DB tidak boleh disamarkan menjadi "aturan
    // bawaan" (entitas 24/7 mendadak terkunci 17.00): biarkan naik. Hanya tabel/kolom
    // belum ada (DB belum termigrasi, mock tes) yang jatuh ke bawaan.
    const code = (err as { code?: unknown } | null)?.code
    if (
      (err as { name?: unknown } | null)?.name === 'PrismaClientInitializationError' ||
      (typeof code === 'string' && ['P1001', 'P1002', 'P1008', 'P1017'].includes(code))
    ) {
      throw err
    }
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

// Catatan: wibHourOnDate(d, 24) jatuh pada tengah malam WIB berikutnya (Date.UTC meluap).

/**
 * Tenggat laporan harian untuk perhitungan KPI "tepat waktu": mengikuti jam batas
 * entitas. Mode 24/7 (cutoff null) tidak punya jam batas, jadi tenggatnya ditutup
 * pada akhir hari WIB itu (laporan hari D tetap dinilai pada hari D). `dailyOpen`
 * sengaja diabaikan: itu sakelar saat ini, bukan fakta historis.
 */
export function dailyDeadlineWith(cutoffHour: number | null, reportDate: Date): Date {
  return wibHourOnDate(reportDate, cutoffHour ?? 24)
}

/**
 * Titik kunci laporan harian untuk tampilan (tidak pernah null): ditutup = awal hari,
 * 24/7 = akhir hari WIB, selain itu jam batas entitas.
 */
export function dailyLockInstantWith(
  s: Pick<ReportSettingsData, 'dailyCutoffHour' | 'dailyOpen'>,
  reportDate: Date
): Date {
  if (!s.dailyOpen) return wibHourOnDate(reportDate, 0)
  return dailyDeadlineWith(s.dailyCutoffHour, reportDate)
}

/** Hitung mundur ke titik kunci hari ini menurut settings entitas. */
export function dailyCountdownWith(
  s: Pick<ReportSettingsData, 'dailyCutoffHour' | 'dailyOpen'>,
  now: Date
): { hours: number; minutes: number; totalMs: number; passed: boolean } {
  const diff = dailyLockInstantWith(s, now).getTime() - now.getTime()
  if (diff <= 0) return { hours: 0, minutes: 0, totalMs: 0, passed: true }
  return {
    hours: Math.floor(diff / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    totalMs: diff,
    passed: false,
  }
}

/** Label jam batas untuk pesan: "17.00 WIB"; mode 24/7 = "24.00 WIB" (akhir hari, sama dengan titik kunci tampilan). */
export function dailyCutoffLabelWith(s: Pick<ReportSettingsData, 'dailyCutoffHour'>): string {
  return `${String(s.dailyCutoffHour ?? 24).padStart(2, '0')}.00 WIB`
}
