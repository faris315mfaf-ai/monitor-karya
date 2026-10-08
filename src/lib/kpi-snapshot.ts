import 'server-only'

import { db } from '@/lib/db'
import {
  dailyLockAt, dailyRequiresEvidence, isDailyLocked, isoWeekOf, startOfWibDay, weeklyDeadlines, weeklyRequiresEvidence,
} from '@/lib/lock'
import {
  complianceScore, historicalOnTimeDaily, monthBounds, monthKeyOf, pct, previousMonthKey, workdaysBetween, type Ratio,
} from '@/lib/kpi-math'
import { reportingEntities } from '@/lib/reminder-rules'

/**
 * Pembaruan KpiSnapshot harian [F1-D] — dipanggil /api/cron/kpi-snapshot.
 * Menulis baris BULANAN ("YYYY-MM", WIB) per entitas pelapor; itu yang dibaca
 * dashboard, kpi-trends, compliance-map, entities, dan my-dashboard. Rumus di
 * src/lib/kpi-math.ts. Aman dijalankan berulang (upsert per entitas & bulan).
 *
 * Pada 7 hari pertama bulan baru, bulan sebelumnya ikut dihitung ulang supaya
 * laporan susulan dan buka kunci di akhir bulan ikut tercatat.
 */

const DAY = 86400000
const HIGH = ['TINGGI', 'KRITIS']

type Snapshot = {
  onTimeDailyPct: number
  weeklyCompletenessPct: number
  evidenceCompletenessPct: number
  highPriorityCompletionPct: number
  avgEscalationDays: number
  totalProjects: number
  activeProjects: number
  reportsToday: number
  lateToday: number
  pendingReports: number
  complianceScore: number
}

async function computeEntityMonth(entityId: string, monthKey: string, now: Date): Promise<Snapshot> {
  const { start, end } = monthBounds(monthKey)
  const today = startOfWibDay(now)
  const isCurrent = today >= start && today < end
  // Hari terakhir yang dihitung: hari ini bila sudah terkunci, selain itu kemarin.
  const lastDay = isCurrent ? (isDailyLocked(today, now) ? today : new Date(today.getTime() - DAY)) : new Date(end.getTime() - DAY)
  const days = lastDay >= start ? workdaysBetween(start, lastDay) : []

  const [projects, totalProjects, divisions] = await Promise.all([
    db.project.findMany({ where: { entityId }, select: { id: true, lifecycle: true, picUserId: true, startDate: true, createdAt: true, approvedAt: true } }),
    db.project.count({ where: { entityId, lifecycle: { not: 'DIARSIPKAN' } } }),
    db.division.count({ where: { entityId, isActive: true } }),
  ])
  const activeIds = projects.filter((p) => p.lifecycle === 'AKTIF').map((p) => p.id)
  const projectIds = projects.map((p) => p.id)

  // ---- Laporan harian tepat waktu
  const [reports, history, attendance, dailyEv] = await Promise.all([
    db.dailyProjectReport.findMany({
      where: { entityId, projectId: { in: projectIds }, reportDate: { in: days } },
      select: { projectId: true, reportDate: true, submittedAt: true, isLate: true },
    }),
    db.auditLog.findMany({
      where: { targetType: 'PROJECT', targetId: { in: projectIds }, at: { lte: now } },
      select: { targetId: true, at: true, action: true, beforeData: true, afterData: true },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    }),
    db.attendance.findMany({
      where: { userId: { in: projects.flatMap((p) => p.picUserId ? [p.picUserId] : []) }, date: { in: days }, status: { in: ['CUTI', 'SAKIT', 'IZIN'] } },
      select: { userId: true, date: true },
    }),
    db.dailyProjectReport.findMany({
      where: { entityId, reportDate: { gte: start, lt: end }, submittedAt: { not: null } },
      select: { status: true, evidenceCount: true },
    }),
  ])
  const absent = new Set(attendance.map((a) => `${a.userId}|${a.date.getTime()}`))
  const onTime = historicalOnTimeDaily({ days, projects, history, reports, lockAt: dailyLockAt, absent: (id, d) => absent.has(`${id}|${d.getTime()}`) })
  // Snapshot lama tidak memiliki kolom null/coverage. Jangan terbitkan angka
  // pengganti bila kewajiban historis belum dapat dibuktikan. Cron melaporkan failed.
  if (!onTime.historyComplete) throw new Error(`Riwayat lifecycle ${onTime.unknownProjects} proyek belum lengkap`)
  const daily: Ratio = { num: onTime.ok, den: onTime.total }

  // ---- Laporan mingguan: minggu yang Seninnya jatuh di bulan ini dan tenggat serahnya lewat
  const weeks: { isoYear: number; isoWeek: number }[] = []
  for (let t = start.getTime(); t < end.getTime(); t += DAY) {
    const d = new Date(t)
    if (new Date(t + 7 * 3600000).getUTCDay() !== 1) continue
    if (weeklyDeadlines(d).handoverBy > now) continue
    weeks.push(isoWeekOf(d))
  }
  const weeklyRows = weeks.length
    ? await db.weeklyDivisionReport.findMany({
        where: { entityId, OR: weeks.map((w) => ({ isoYear: w.isoYear, isoWeek: w.isoWeek })) },
        select: { submittedAt: true, division: { select: { isActive: true } }, items: { select: { status: true, evidenceCount: true } } },
      })
    : []
  const weekly: Ratio = {
    num: weeklyRows.filter((r) => r.submittedAt && r.division.isActive).length,
    den: divisions * weeks.length,
  }

  // ---- Kelengkapan bukti
  const needDaily = dailyEv.filter((r) => dailyRequiresEvidence(r.status))
  const needWeekly = weeklyRows.flatMap((r) => r.items).filter((i) => weeklyRequiresEvidence(i.status))
  const evidence: Ratio = {
    num: needDaily.filter((r) => r.evidenceCount > 0).length + needWeekly.filter((i) => i.evidenceCount > 0).length,
    den: needDaily.length + needWeekly.length,
  }

  // ---- Task prioritas tinggi
  const [highTotal, highDone] = await Promise.all([
    db.task.count({ where: { entityId, urgency: { in: HIGH }, workDate: { gte: start, lt: end } } }),
    db.task.count({ where: { entityId, urgency: { in: HIGH }, workDate: { gte: start, lt: end }, status: 'SELESAI' } }),
  ])
  const high: Ratio = { num: highDone, den: highTotal }

  // ---- Rata-rata umur eskalasi yang diajukan bulan ini (sampai diputuskan, atau sampai sekarang)
  const escalations = await db.escalation.findMany({
    where: { entityId, raisedAt: { gte: start, lt: end } },
    select: { raisedAt: true, decidedAt: true },
  })
  const avgEscalationDays = escalations.length
    ? Math.round(
        (escalations.reduce((s, e) => s + ((e.decidedAt ?? now).getTime() - e.raisedAt.getTime()) / DAY, 0) / escalations.length) * 10
      ) / 10
    : 0

  // ---- Hari ini (hanya untuk bulan berjalan)
  let reportsToday = 0
  let lateToday = 0
  let pendingReports = 0
  if (isCurrent && workdaysBetween(today, today).length) {
    const todayRows = await db.dailyProjectReport.findMany({
      where: { entityId, projectId: { in: activeIds }, reportDate: today, submittedAt: { not: null } },
      select: { isLate: true },
    })
    reportsToday = todayRows.length
    lateToday = todayRows.filter((r) => r.isLate).length
    pendingReports = Math.max(0, activeIds.length - reportsToday)
  }

  const parts = { onTimeDaily: pct(daily), weekly: pct(weekly), evidence: pct(evidence), highPriority: pct(high) }
  return {
    onTimeDailyPct: parts.onTimeDaily ?? 0,
    weeklyCompletenessPct: parts.weekly ?? 0,
    evidenceCompletenessPct: parts.evidence ?? 0,
    highPriorityCompletionPct: parts.highPriority ?? 0,
    avgEscalationDays,
    totalProjects,
    activeProjects: activeIds.length,
    reportsToday,
    lateToday,
    pendingReports,
    complianceScore: complianceScore(parts),
  }
}

export type KpiRunResult = { entityId: string; periodKey: string; complianceScore: number }

/** Memperbarui snapshot bulan berjalan (dan bulan lalu pada 7 hari pertama) untuk semua entitas pelapor. */
export async function refreshKpiSnapshots(now = new Date()): Promise<{ updated: KpiRunResult[]; failed: string[] }> {
  const current = monthKeyOf(now)
  const wibDate = new Date(now.getTime() + 7 * 3600000).getUTCDate()
  const months = wibDate <= 7 ? [previousMonthKey(current), current] : [current]
  const entities = await reportingEntities()
  const updated: KpiRunResult[] = []
  const failed: string[] = []
  for (const e of entities) {
    for (const periodKey of months) {
      try {
        const s = await computeEntityMonth(e.id, periodKey, now)
        await db.kpiSnapshot.upsert({
          where: { entityId_periodType_periodKey: { entityId: e.id, periodType: 'BULANAN', periodKey } },
          create: { entityId: e.id, periodType: 'BULANAN', periodKey, ...s },
          update: s,
        })
        updated.push({ entityId: e.id, periodKey, complianceScore: s.complianceScore })
      } catch (err) {
        console.error('[kpi-snapshot]', e.id, periodKey, err instanceof Error ? err.message : err)
        failed.push(`${e.id}:${periodKey}`)
      }
    }
  }
  return { updated, failed }
}
