/**
 * Rumus KPI bulanan per PT [F1-D] — bagian murni (tanpa basis data) dari
 * src/lib/kpi-snapshot.ts, supaya bisa dites.
 *
 *   onTimeDailyPct            laporan harian terkirim tepat waktu ÷ laporan yang
 *                             diharapkan (proyek AKTIF × hari kerja yang sudah
 *                             terkunci bulan ini, sejak tanggal mulai proyek)
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
