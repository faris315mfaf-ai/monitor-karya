/**
 * Satu sumber status proyek untuk semua layar (peran/00-alur-antarperan.md:
 * "satu sumber data per konsep; layar tidak menghitung ulang dengan rumus sendiri").
 *
 * Kosakata desain: on = Sesuai jadwal, risk = Perlu perhatian, late = Terlambat,
 * done = Selesai, neutral = Belum mulai.
 */

export type ProjectStatus = 'on' | 'risk' | 'late' | 'done' | 'neutral'

export type LatestReport = {
  status: string
  progressPct: number
  obstacle: string | null
  needsEscalation: boolean
  reportDate: Date
} | null

const DAY = 86400000

export function deriveProjectStatus(
  p: { lifecycle: string; targetEndDate: Date | null },
  latest: LatestReport,
  now: Date = new Date()
): { status: ProjectStatus; reason: string | null; progress: number } {
  const progress = Math.max(0, Math.min(100, latest?.progressPct ?? 0))
  if (p.lifecycle === 'DITUTUP' || latest?.status === 'SELESAI' || progress >= 100) {
    return { status: 'done', reason: null, progress: latest ? progress : 100 }
  }
  if (p.targetEndDate && p.targetEndDate.getTime() < now.getTime()) {
    const days = Math.max(1, Math.floor((now.getTime() - p.targetEndDate.getTime()) / DAY))
    return { status: 'late', reason: `Lewat tenggat ${days} hari`, progress }
  }
  if (!latest) return { status: 'neutral', reason: 'Belum ada laporan harian', progress }
  if (latest.status === 'TERKENDALA' || latest.status === 'MENUNGGU_KEPUTUSAN' || latest.needsEscalation) {
    const reason =
      latest.obstacle?.trim() ||
      (latest.status === 'MENUNGGU_KEPUTUSAN' ? 'Menunggu keputusan' : 'Ada kendala di laporan terakhir')
    return { status: 'risk', reason: firstSentence(reason), progress }
  }
  return { status: 'on', reason: null, progress }
}

export const STATUS_ORDER: Record<ProjectStatus, number> = { late: 0, risk: 1, on: 2, neutral: 3, done: 4 }

function firstSentence(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  const cut = t.split(/(?<=[.!?])\s/)[0]
  return cut.length > 90 ? cut.slice(0, 88).trimEnd() + '…' : cut
}
