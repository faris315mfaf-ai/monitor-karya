import 'server-only'

import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { startOfWibDay } from '@/lib/lock'
import { getReportSettings, isDailyLockedWith, isWorkingDayWith, type ReportSettingsData } from '@/lib/report-settings'

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
  /** Tomorrow's plans gathered from the tasks, for the report-level summary. */
  followUp: string | null
}

/** Computes the derived values without writing anything. */
export async function computeRollup(projectId: string, workDate: Date, client: Prisma.TransactionClient = db): Promise<Rollup | null> {
  // Hanya capaian harian yang membentuk laporan hari itu; kartu bercakupan
  // MINGGUAN adalah capaian minggu dan hidup di papan mingguan.
  const tasks = await client.task.findMany({
    where: { projectId, workDate, scope: 'HARIAN' },
    select: { id: true, title: true, status: true, progressPct: true, obstacle: true, decisionNeeded: true, achievementToday: true, followUp: true, needsEscalation: true },
  })
  if (tasks.length === 0) return null

  const taskEvidence = await client.evidence.count({
    where: { targetType: 'TASK', targetId: { in: tasks.map((t) => t.id) } },
  })

  const statuses = tasks.map((t) => t.status)
  const status = deriveStatus(statuses)

  // Roll the blocked tasks up into one sentence the report can carry.
  const blockingNotes = tasks
    .map((t) => ({ title: t.title, note: t.obstacle?.trim() || t.decisionNeeded?.trim() || '' }))
    .filter((t) => t.note)
    .map((t) => `${t.title}: ${t.note}`)

  // Entri laporan multi-item (10 Okt 2026): narasi hasil dan rencana besok
  // ditulis per entri; laporan harian membawa semuanya, dipisah pemisah yang
  // sama dengan kendala. Tanpa narasi entri, kapasitas ringkas lama dipakai.
  const joinEntries = (values: (string | null | undefined)[]) => {
    const merged = values.map((v) => v?.trim() || '').filter(Boolean)
    return merged.length ? merged.join(' | ') : null
  }

  return {
    taskCount: tasks.length,
    status,
    progressPct: Math.round(tasks.reduce((s, t) => s + t.progressPct, 0) / tasks.length),
    evidenceCount: taskEvidence,
    needsEscalation:
      status === 'TERKENDALA' ||
      status === 'MENUNGGU_KEPUTUSAN' ||
      tasks.some((t) => t.needsEscalation),
    achievement: joinEntries(tasks.map((t) => t.achievementToday)) ?? composeAchievement(tasks),
    obstacle: blockingNotes.length ? blockingNotes.join(' | ') : null,
    followUp: joinEntries(tasks.map((t) => t.followUp)),
  }
}

/** Lock the parent even when the report does not exist yet. All daily writers
 * acquire Project before DailyProjectReport; forward uses the same order. */
export async function lockDailyProject(client: Prisma.TransactionClient, projectId: string) {
  await client.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
}

export async function lockDailyReport(client: Prisma.TransactionClient, projectId: string, day: Date) {
  await client.$queryRaw`SELECT "id" FROM "DailyProjectReport" WHERE "projectId" = ${projectId} AND "reportDate" = ${day} FOR UPDATE`
}

/**
 * Writes the derived values onto the day's report, creating it if the PIC has
 * not opened the form yet. Never marks the report as submitted — handing it to
 * the Admin PT stays a deliberate act.
 *
 * `evidenceCount` on the report is the day's total: files attached to the
 * report itself plus everything attached to its tasks.
 */
export async function rollupDailyReport(projectId: string, workDate: Date, client?: Prisma.TransactionClient): Promise<Rollup | null> {
  if (!client) return db.$transaction(async (tx) => {
    await lockDailyProject(tx, projectId)
    return rollupDailyReport(projectId, workDate, tx)
  }, { isolationLevel: 'ReadCommitted' })
  await lockDailyReport(client, projectId, workDate)
  const rollup = await computeRollup(projectId, workDate, client)
  const gate = await dailyGate(projectId, workDate, new Date(), client)
  if (gate.frozen || gate.timeLocked || workDate > startOfWibDay(new Date())) return rollup
  // Aturan per entitas proyek (bukan null): workingDays kosong = setiap hari,
  // jadi rollup juga terjadi di hari yang dilaporkan entitas 6/7 hari.
  if (!isWorkingDayWith(gate.settings.workingDays, workDate)) return rollup

  const existing = await client.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: workDate } },
  })

  if (!rollup) {
    // The last task was removed: fall back to counting only the report's own files.
    if (existing) {
      const own = await client.evidence.count({
        where: { targetType: 'DAILY_REPORT', targetId: existing.id },
      })
      await client.dailyProjectReport.update({
        where: { id: existing.id },
        data: { evidenceCount: own },
      })
    }
    return null
  }

  const ownEvidence = existing
    ? await client.evidence.count({ where: { targetType: 'DAILY_REPORT', targetId: existing.id } })
    : 0

  const data = {
    status: rollup.status,
    progressPct: rollup.progressPct,
    needsEscalation: rollup.needsEscalation,
    evidenceCount: ownEvidence + rollup.evidenceCount,
    // Only fill the narrative when the PIC has not written their own.
    achievementToday: existing?.achievementToday?.trim() ? existing.achievementToday : rollup.achievement,
    obstacle: existing?.obstacle?.trim() ? existing.obstacle : rollup.obstacle,
    followUp: existing?.followUp?.trim() ? existing.followUp : rollup.followUp,
  }

  if (existing) {
    await client.dailyProjectReport.update({ where: { id: existing.id }, data })
  } else {
    const project = await client.project.findUnique({
      where: { id: projectId },
      select: { entityId: true, phase: true },
    })
    if (!project) return rollup

    await client.dailyProjectReport.create({
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
  /** Lewat tenggat (jam kunci entitas, bawaan 17.00 WIB) hari itu dan tidak sedang dibuka. */
  timeLocked: boolean
  /** Aturan entitas yang dipakai menghitung kunci — pemanggil tak perlu membaca ulang. */
  settings: ReportSettingsData
}

/**
 * Boleh tidaknya laporan harian satu proyek pada satu hari ditulis — dipakai
 * /api/daily-input dan /api/tasks agar aturannya satu:
 *
 *   - laporan yang sudah diteruskan ke holding (`forwardedAt`) atau dikunci
 *     (`isLocked`) dibekukan;
 *   - hari yang lewat tenggat jam entitas (bawaan 17.00 WIB) terkunci;
 *   - keduanya hanya bisa ditembus oleh buka kunci yang sedang berlaku
 *     (`activeUnlockFor`), yang selalu menunjuk satu laporan.
 */
export async function dailyGate(projectId: string, day: Date, now: Date = new Date(), client: Prisma.TransactionClient = db): Promise<DailyGate> {
  const report = await client.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: day } },
    select: { id: true, forwardedAt: true, isLocked: true, entityId: true },
  })
  // Aturan pelaporan per entitas (10 Okt 2026). entityId diambil dari PROJECT,
  // bukan hanya dari baris laporan: hari tanpa laporan (belum ada baris) pun
  // mengikuti aturan entitasnya, bukan bawaan 17.00/Senin–Jumat.
  const entityId = report?.entityId
    ?? (await client.project.findUnique({ where: { id: projectId }, select: { entityId: true } }))?.entityId
    ?? null
  const settings = await getReportSettings(entityId)
  // Jam kustom benar-benar dipakai: null = 24/7 (tak pernah terkunci),
  // dailyOpen = false = ditutup, selain itu jam batas entitas berlaku.
  const pastCutoff = isDailyLockedWith(settings.dailyCutoffHour, settings.dailyOpen, day, now)
  const blocked = Boolean(report?.forwardedAt) || Boolean(report?.isLocked) || pastCutoff
  const unlock = report && blocked ? await client.unlockRequest.findFirst({
    where: { targetType: 'DAILY_REPORT', targetId: report.id, status: 'DIEKSEKUSI', reLockedAt: null, unlockUntil: { gt: now } },
    select: { id: true, unlockUntil: true },
  }) : null
  return {
    report: report ?? null,
    unlock,
    frozen: unlock ? null : report?.forwardedAt ? 'FORWARDED' : report?.isLocked ? 'LOCKED' : null,
    timeLocked: pastCutoff && !unlock,
    settings,
  }
}

/** Pesan untuk laporan yang dibekukan, atau null. */
export function frozenMessage(gate: Pick<DailyGate, 'frozen'>): string | null {
  return gate.frozen === 'FORWARDED' ? FORWARDED_FROZEN_MESSAGE : gate.frozen === 'LOCKED' ? REPORT_LOCKED_MESSAGE : null
}
