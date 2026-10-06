import 'server-only'

import { db } from '@/lib/db'
import { isDailyLocked } from '@/lib/lock'
import { activeUnlockFor } from '@/lib/unlock-requests'

/**
 * Rolls a project's tasks up into its daily report.
 *
 * Once a day has tasks, the report's status, progress and evidence count are
 * derived from them rather than typed a second time — the PIC records the work
 * once, in the place the work actually lives. A day with no tasks keeps the
 * plain manual form, so nothing is forced on projects that do not use tasks.
 */

/** Worst-first: a single blocked task colours the whole day. */
function deriveStatus(statuses: string[]): string {
  if (statuses.length === 0) return 'TIDAK_ADA_PERUBAHAN'
  if (statuses.includes('TERKENDALA')) return 'TERKENDALA'
  if (statuses.includes('MENUNGGU_KEPUTUSAN')) return 'MENUNGGU_KEPUTUSAN'
  if (statuses.every((s) => s === 'SELESAI')) return 'SELESAI'
  if (statuses.some((s) => s === 'BERJALAN' || s === 'SELESAI')) return 'ON_PROGRESS'
  return 'TIDAK_ADA_PERUBAHAN'
}

/** Plain-language summary of the day, used when the PIC has not written one. */
function composeAchievement(
  tasks: { title: string; status: string; progressPct: number }[]
): string {
  const done = tasks.filter((t) => t.status === 'SELESAI')
  const running = tasks.filter((t) => t.status === 'BERJALAN')
  const parts: string[] = []

  if (done.length) parts.push(`Selesai: ${done.map((t) => t.title).join('; ')}`)
  if (running.length) {
    parts.push(
      `Berjalan: ${running.map((t) => `${t.title} (${t.progressPct}%)`).join('; ')}`
    )
  }
  if (!parts.length) parts.push(`${tasks.length} task terencana, belum ada yang dimulai.`)
  return parts.join('. ')
}

export type Rollup = {
  taskCount: number
  status: string
  progressPct: number
  evidenceCount: number
  needsEscalation: boolean
  achievement: string
  /** Blocking notes gathered from the tasks, for the report-level summary. */
  obstacle: string | null
}

/** Computes the derived values without writing anything. */
export async function computeRollup(projectId: string, workDate: Date): Promise<Rollup | null> {
  // Hanya capaian harian yang membentuk laporan hari itu; kartu bercakupan
  // MINGGUAN adalah capaian minggu dan hidup di papan mingguan.
  const tasks = await db.task.findMany({
    where: { projectId, workDate, scope: 'HARIAN' },
    select: { id: true, title: true, status: true, progressPct: true, obstacle: true, decisionNeeded: true },
  })
  if (tasks.length === 0) return null

  const taskEvidence = await db.evidence.count({
    where: { targetType: 'TASK', targetId: { in: tasks.map((t) => t.id) } },
  })

  const statuses = tasks.map((t) => t.status)
  const status = deriveStatus(statuses)

  // Roll the blocked tasks up into one sentence the report can carry.
  const blockingNotes = tasks
    .map((t) => ({ title: t.title, note: t.obstacle?.trim() || t.decisionNeeded?.trim() || '' }))
    .filter((t) => t.note)
    .map((t) => `${t.title}: ${t.note}`)

  return {
    taskCount: tasks.length,
    status,
    progressPct: Math.round(tasks.reduce((s, t) => s + t.progressPct, 0) / tasks.length),
    evidenceCount: taskEvidence,
    needsEscalation: status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN',
    achievement: composeAchievement(tasks),
    obstacle: blockingNotes.length ? blockingNotes.join(' | ') : null,
  }
}

/**
 * Writes the derived values onto the day's report, creating it if the PIC has
 * not opened the form yet. Never marks the report as submitted — handing it to
 * the Admin PT stays a deliberate act.
 *
 * `evidenceCount` on the report is the day's total: files attached to the
 * report itself plus everything attached to its tasks.
 */
export async function rollupDailyReport(projectId: string, workDate: Date): Promise<Rollup | null> {
  const rollup = await computeRollup(projectId, workDate)

  const existing = await db.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: workDate } },
  })

  if (!rollup) {
    // The last task was removed: fall back to counting only the report's own files.
    if (existing) {
      const own = await db.evidence.count({
        where: { targetType: 'DAILY_REPORT', targetId: existing.id },
      })
      await db.dailyProjectReport.update({
        where: { id: existing.id },
        data: { evidenceCount: own },
      })
    }
    return null
  }

  // Laporan yang dikunci atau sudah diteruskan ke holding dibekukan; hanya buka
  // kunci yang sedang berlaku yang boleh mengubah angkanya lagi.
  if ((existing?.isLocked || existing?.forwardedAt) && !(await activeUnlockFor('DAILY_REPORT', existing.id))) {
    return rollup
  }

  const ownEvidence = existing
    ? await db.evidence.count({ where: { targetType: 'DAILY_REPORT', targetId: existing.id } })
    : 0

  const data = {
    status: rollup.status,
    progressPct: rollup.progressPct,
    needsEscalation: rollup.needsEscalation,
    evidenceCount: ownEvidence + rollup.evidenceCount,
    // Only fill the narrative when the PIC has not written their own.
    achievementToday: existing?.achievementToday?.trim() ? existing.achievementToday : rollup.achievement,
    obstacle: existing?.obstacle?.trim() ? existing.obstacle : rollup.obstacle,
  }

  if (existing) {
    await db.dailyProjectReport.update({ where: { id: existing.id }, data })
  } else {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { entityId: true, phase: true },
    })
    if (!project) return rollup

    await db.dailyProjectReport.create({
      data: {
        ...data,
        projectId,
        entityId: project.entityId,
        reportDate: workDate,
        phase: project.phase,
      },
    })
  }

  return rollup
}

/**
 * Recounts the evidence on one target and writes the cached total back onto
 * its parent row. Daily reports and tasks go through the roll-up so that task
 * attachments stay part of the day's total.
 */
export async function syncEvidenceCount(targetType: string, targetId: string): Promise<number> {
  const count = await db.evidence.count({ where: { targetType, targetId } })

  if (targetType === 'DAILY_REPORT') {
    const report = await db.dailyProjectReport.findUnique({
      where: { id: targetId },
      select: { projectId: true, reportDate: true },
    })
    if (report) await rollupDailyReport(report.projectId, report.reportDate)
  } else if (targetType === 'TASK') {
    const task = await db.task.findUnique({
      where: { id: targetId },
      select: { projectId: true, workDate: true },
    })
    if (task) await rollupDailyReport(task.projectId, task.workDate)
  } else if (targetType === 'WEEKLY_ITEM') {
    await db.weeklyReportItem.updateMany({ where: { id: targetId }, data: { evidenceCount: count } })
  } else if (targetType === 'PROGRESS_REPORT') {
    await db.projectProgressReport.updateMany({ where: { id: targetId }, data: { evidenceCount: count } })
  }

  return count
}

// ------------------------------------------------------------------
// Pembekuan laporan harian (6 Okt 2026)
// ------------------------------------------------------------------

/** Pesan 409 untuk laporan yang sudah diteruskan Admin PT ke holding. */
export const FORWARDED_FROZEN_MESSAGE = 'Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.'
export const REPORT_LOCKED_MESSAGE = 'Laporan ini sudah dikunci. Ajukan buka kunci untuk mengubahnya.'

export type DailyGate = {
  report: { id: string; forwardedAt: Date | null; isLocked: boolean } | null
  /** Buka kunci yang sedang berlaku untuk laporan hari itu, bila ada. */
  unlock: { id: string; unlockUntil: Date | null } | null
  /** Alasan laporan dibekukan (diteruskan/terkunci) tanpa buka kunci aktif; null bila tidak. */
  frozen: 'FORWARDED' | 'LOCKED' | null
  /** Lewat tenggat 17.00 hari itu dan tidak sedang dibuka. */
  timeLocked: boolean
}

/**
 * Boleh tidaknya laporan harian satu proyek pada satu hari ditulis — dipakai
 * /api/daily-input dan /api/tasks agar aturannya satu:
 *
 *   - laporan yang sudah diteruskan ke holding (`forwardedAt`) atau dikunci
 *     (`isLocked`) dibekukan;
 *   - hari yang lewat tenggat 17.00 WIB terkunci;
 *   - keduanya hanya bisa ditembus oleh buka kunci yang sedang berlaku
 *     (`activeUnlockFor`), yang selalu menunjuk satu laporan.
 */
export async function dailyGate(projectId: string, day: Date, now: Date = new Date()): Promise<DailyGate> {
  const report = await db.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: day } },
    select: { id: true, forwardedAt: true, isLocked: true },
  })
  const pastCutoff = isDailyLocked(day, now)
  const blocked = Boolean(report?.forwardedAt) || Boolean(report?.isLocked) || pastCutoff
  const unlock = report && blocked ? await activeUnlockFor('DAILY_REPORT', report.id, now) : null
  return {
    report: report ?? null,
    unlock,
    frozen: unlock ? null : report?.forwardedAt ? 'FORWARDED' : report?.isLocked ? 'LOCKED' : null,
    timeLocked: pastCutoff && !unlock,
  }
}

/** Pesan untuk laporan yang dibekukan, atau null. */
export function frozenMessage(gate: Pick<DailyGate, 'frozen'>): string | null {
  return gate.frozen === 'FORWARDED' ? FORWARDED_FROZEN_MESSAGE : gate.frozen === 'LOCKED' ? REPORT_LOCKED_MESSAGE : null
}
