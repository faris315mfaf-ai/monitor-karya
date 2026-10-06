/**
 * Rumus murni fitur kepala divisi [F2-KADIV] (tanpa basis data, supaya bisa
 * dites): KPI "Tepat waktu 30 hari", draf ringkasan laporan mingguan untuk
 * Direktur, dan aturan kirim ringkasan. Pemakai: src/lib/kadiv.ts dan
 * /api/kadiv/weekly-summary. Lihat docs/fitur/peran-kadiv.md.
 */

const DAY = 86400000
const WIB = 7 * 3600000

/** Target KPI "Tepat waktu 30 hari" (03-kepala-divisi.md §3). */
export const ON_TIME_TARGET = 85
/** Panjang jendela KPI tepat waktu, hari kalender. */
export const ON_TIME_WINDOW_DAYS = 30
/** Jumlah poin ringkasan mingguan dan panjang maksimum tiap poin. */
export const SUMMARY_POINTS = 3
export const SUMMARY_POINT_MAX = 280

export type OnTimeProject = { id: string; picUserId: string | null; startDate: Date | null; createdAt: Date }
export type OnTimeReport = { projectId: string; reportDate: Date; submittedAt: Date | null; isLate: boolean }

/**
 * Tepat waktu 30 hari per divisi:
 *
 *   tepat waktu ÷ wajib
 *
 * - `days`: hari kerja (tengah malam WIB) dalam 30 hari terakhir yang tenggat
 *   17.00-nya sudah lewat (hari ini ikut bila sudah lewat 17.00).
 * - Wajib = pasangan (proyek AKTIF divisi, hari) dengan hari ≥ tanggal mulai
 *   proyek (atau tanggal dibuat bila tanpa tanggal mulai), dan PIC proyek tidak
 *   cuti/sakit/izin hari itu. Proyek tanpa PIC tidak dihitung.
 * - Tepat waktu = laporan hari itu ada, `submittedAt` ≤ tenggat hari itu, dan
 *   tidak bertanda terlambat.
 * - `lockAt(day)` = tenggat laporan harian hari itu (dailyLockAt).
 * - `absent(userId, day)` = true bila orang itu cuti/sakit/izin hari itu.
 */
export function onTimeDaily(input: {
  days: Date[]
  projects: OnTimeProject[]
  reports: OnTimeReport[]
  lockAt: (day: Date) => Date
  absent: (userId: string, day: Date) => boolean
}): { ok: number; total: number; pct: number | null } {
  const byKey = new Map<string, OnTimeReport>()
  for (const r of input.reports) byKey.set(`${r.projectId}|${r.reportDate.getTime()}`, r)
  let ok = 0
  let total = 0
  for (const p of input.projects) {
    if (!p.picUserId) continue
    const from = wibMidnight(p.startDate ?? p.createdAt).getTime()
    for (const d of input.days) {
      if (d.getTime() < from) continue
      if (input.absent(p.picUserId, d)) continue
      total += 1
      const r = byKey.get(`${p.id}|${d.getTime()}`)
      if (r?.submittedAt && !r.isLate && r.submittedAt.getTime() <= input.lockAt(d).getTime()) ok += 1
    }
  }
  return { ok, total, pct: total ? Math.round((ok / total) * 100) : null }
}

function wibMidnight(d: Date) {
  const w = new Date(d.getTime() + WIB)
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - WIB)
}

/** Hari kerja (Senin–Jumat WIB) dalam `windowDays` hari terakhir yang tenggatnya sudah lewat, urut lama → baru. */
export function lockedWorkdays(now: Date, lockAt: (day: Date) => Date, windowDays = ON_TIME_WINDOW_DAYS): Date[] {
  const today = wibMidnight(now)
  const out: Date[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY)
    const dow = new Date(d.getTime() + WIB).getUTCDay()
    if (dow === 0 || dow === 6) continue
    if (lockAt(d).getTime() > now.getTime()) continue
    out.push(d)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Ringkasan laporan mingguan untuk Direktur                            */
/* ------------------------------------------------------------------ */

export type SummaryStats = {
  outputsAccepted: number
  outputsTarget: number
  projectsOnTrack: number
  projectsTotal: number
  openObstacles: number
  pendingReview: number
}

export type SummaryFacts = SummaryStats & {
  divisionName: string
  /** Judul output yang diterima minggu ini, terbaru dulu. */
  acceptedTitles: string[]
  /** Proyek yang tidak sesuai jadwal: nama + alasan singkat. */
  offTrack: { name: string; reason: string | null; status: 'risk' | 'late' }[]
  /** Kendala terbuka (teks), terbaru dulu. */
  obstacles: string[]
}

const clip = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const list = (xs: string[], n = 3) => {
  const head = xs.slice(0, n).map((x) => clip(x, 60))
  const rest = xs.length - head.length
  return head.join(', ') + (rest > 0 ? `, dan ${rest} lainnya` : '')
}

/** Tiga poin bawaan draf ringkasan: capaian output, jadwal proyek, kendala. */
export function draftPoints(f: SummaryFacts): string[] {
  const p1 =
    f.outputsAccepted > 0
      ? `${f.outputsAccepted} output diterima minggu ini${f.outputsTarget ? ` dari ${f.outputsTarget} yang ditargetkan` : ''}: ${list(f.acceptedTitles)}.`
      : f.outputsTarget > 0
        ? `Belum ada output yang diterima minggu ini dari ${f.outputsTarget} yang ditargetkan.`
        : 'Belum ada output yang ditargetkan minggu ini.'
  const p2 =
    f.projectsTotal === 0
      ? `Divisi ${f.divisionName} belum memegang proyek aktif.`
      : f.offTrack.length === 0
        ? `Semua ${f.projectsTotal} proyek aktif sesuai jadwal.`
        : `${f.projectsOnTrack} dari ${f.projectsTotal} proyek sesuai jadwal. ${f.offTrack
            .slice(0, 2)
            .map((p) => `${p.name} ${p.status === 'late' ? 'terlambat' : 'perlu perhatian'}${p.reason ? ` (${clip(p.reason.replace(/[.!?]+$/, ''), 70)})` : ''}`)
            .join('; ')}.`
  const p3 =
    f.openObstacles === 0
      ? f.pendingReview
        ? `Tidak ada kendala terbuka. ${f.pendingReview} output masih menunggu review.`
        : 'Tidak ada kendala terbuka.'
      : `${f.openObstacles} kendala terbuka: ${clip(f.obstacles[0] ?? 'lihat laporan harian', 140)}`
  return [p1, p2, p3].map((s) => clip(s, SUMMARY_POINT_MAX))
}

/** Validasi poin kiriman klien: tepat 1–3 teks, dipangkas, tiap poin ≤ 280 huruf. null = tidak valid. */
export function normalizePoints(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  if (input.length > SUMMARY_POINTS) return null
  const out: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') return null
    const t = v.replace(/\s+/g, ' ').trim()
    if (t.length > SUMMARY_POINT_MAX) return null
    if (t) out.push(t)
  }
  return out.length ? out : null
}

export type SendBlock =
  | { code: 'NOT_CURRENT_WEEK'; message: string }
  | { code: 'LOCKED'; message: string }
  | { code: 'FORWARDED'; message: string }
  | { code: 'PENDING_REVIEW'; message: string; pendingReview: number }

/**
 * Boleh tidaknya ringkasan disunting/dikirim. Urutan:
 * 1. Hanya minggu berjalan.
 * 2. Laporan mingguan yang sudah diteruskan ke holding membekukan ringkasannya.
 * 3. Sejak kunci Jumat 17.00 ringkasan tidak bisa diubah lagi.
 * 4. (Hanya untuk kirim) Bila masih ada output menunggu review dan tenggat serah
 *    belum lewat, kirim butuh konfirmasi (`confirmPending`).
 */
export function summaryBlock(input: {
  now: Date
  weekStart: Date
  currentWeekStart: Date
  handoverBy: Date
  lockAt: Date
  forwarded: boolean
  sending: boolean
  pendingReview: number
  confirmPending: boolean
}): SendBlock | null {
  if (input.weekStart.getTime() !== input.currentWeekStart.getTime()) {
    return { code: 'NOT_CURRENT_WEEK', message: 'Ringkasan hanya bisa disusun untuk minggu berjalan.' }
  }
  if (input.forwarded) {
    return { code: 'FORWARDED', message: 'Laporan minggu ini sudah diteruskan ke holding. Ringkasannya tidak bisa diubah lagi.' }
  }
  if (input.now.getTime() >= input.lockAt.getTime()) {
    return { code: 'LOCKED', message: 'Minggu ini sudah dikunci. Ringkasan tidak bisa diubah lagi.' }
  }
  if (input.sending && input.pendingReview > 0 && !input.confirmPending && input.now.getTime() < input.handoverBy.getTime()) {
    return {
      code: 'PENDING_REVIEW',
      message: `${input.pendingReview} output masih menunggu review. Angka output belum final; kirim tetap atau review dulu.`,
      pendingReview: input.pendingReview,
    }
  }
  return null
}
