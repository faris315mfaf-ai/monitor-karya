import 'server-only'

import { db } from '@/lib/db'
import { historicalOnTimeDaily } from '@/lib/kpi-math'
import type { SessionUser } from '@/lib/auth'
import { isMasterRole } from '@/lib/rbac'
import { initials } from '@/lib/format'
import {
  DAILY_CUTOFF_LABEL, dailyLockAt, isDailyLocked, isoWeekOf, isoWeekStart, parseWeekKey, startOfWibDay, weekPeriodOf,
  weeklyDeadlines, wibIsoDay,
} from '@/lib/lock'
import { deriveProjectStatus } from '@/lib/project-status'
import { ON_TIME_TARGET, draftPoints, lockedWorkdays, summaryBlock, type SummaryFacts } from '@/lib/kadiv-math'
import type {
  AttendanceStatus, KadivProject, KadivTeam, TeamActivity, TeamMember, WeeklySummaryStats, WeeklySummaryView,
} from '@/components/kadiv/types'

/**
 * Data tim kepala divisi (03-kepala-divisi.md, 6 Okt 2026).
 *
 * Cakupan: kepala divisi hanya melihat divisi yang ia pimpin
 * (`Division.headUserId`). Tim = anggota (`User.divisionId`) ∪ PIC proyek
 * divisi (lihat divisionProjects). Keputusan skema: prisma/schema.prisma [P2-B].
 */

export const DAY = 86400000
export const DAILY_PIC_TEMPLATE = 'PENGINGAT_HARIAN_PIC'
export const OUTPUT_REVIEW_TEMPLATE = 'REVIEW_OUTPUT'
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['HADIR', 'TERLAMBAT', 'CUTI', 'SAKIT', 'IZIN'] // [F2-DIREKTUR] + TERLAMBAT
export const ABSENT: ReadonlySet<string> = new Set(['CUTI', 'SAKIT', 'IZIN'])

/** Menit kerja sehari dan menit bawaan untuk task tanpa durasi/jam. */
export const WORKDAY_MIN = 480
export const DEFAULT_TASK_MIN = 60
/** Task terbuka dari hari kerja sebelumnya ikut dihitung sampai 14 hari ke belakang. */
const OVERDUE_LOOKBACK_DAYS = 14
const OPEN_TASK = ['BELUM_MULAI', 'BERJALAN', 'TERKENDALA', 'MENUNGGU_KEPUTUSAN']

/**
 * Tabel baru 0021 [F2-KADIV] (DailyReportRead, WeeklyDivisionSummary) mungkin
 * belum ada di basis data: P2021/P2022 dibaca sebagai "kosong" supaya layar
 * lain tetap tampil. Galat lain tetap dilempar.
 */
export function isMissingTable(err: unknown) {
  const code = (err as { code?: unknown } | null)?.code
  return code === 'P2021' || code === 'P2022'
}
async function optionalRows<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p
  } catch (err) {
    if (isMissingTable(err)) return []
    throw err
  }
}

export type LedDivision = { id: string; name: string; entityId: string; entityName: string; headUserId: string | null }

/** Divisi aktif yang dipimpin akun ini. */
export async function ledDivisions(userId: string): Promise<LedDivision[]> {
  const rows = await db.division.findMany({
    where: { headUserId: userId, isActive: true },
    select: { id: true, name: true, entityId: true, headUserId: true, entity: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  return rows.map((d) => ({ id: d.id, name: d.name, entityId: d.entityId, entityName: d.entity.name, headUserId: d.headUserId }))
}

/**
 * Divisi yang diminta, asal dipimpin akun ini; tanpa `divisionId` = divisi
 * pertama. null bila akun tidak memimpin divisi tersebut.
 */
export async function pickLedDivision(user: SessionUser, divisionId?: string | null) {
  const all = await ledDivisions(user.id)
  if (all.length === 0) return { all, current: null }
  const current = divisionId ? (all.find((d) => d.id === divisionId) ?? null) : all[0]
  return { all, current }
}

/** Boleh mengatur anggota/kehadiran divisi: kepala divisinya, Admin PT di PT-nya, atau Super Admin/TI. */
export async function canManageDivision(user: SessionUser, divisionId: string) {
  const d = await db.division.findUnique({
    where: { id: divisionId },
    select: { id: true, name: true, entityId: true, headUserId: true, isActive: true, entity: { select: { name: true } } },
  })
  if (!d || !d.isActive) return null
  const ok =
    (user.role === 'KEPALA_DIVISI' && d.headUserId === user.id) ||
    isMasterRole(user.role) ||
    (user.role === 'ADMIN_PT' && user.scopeEntityId === d.entityId)
  return ok ? { id: d.id, name: d.name, entityId: d.entityId, entityName: d.entity.name, headUserId: d.headUserId } : null
}

/**
 * Proyek AKTIF milik divisi, urutan aturan sama dengan /api/ringkasan:
 * 1. `Project.divisionId` = divisi ini;
 * 2. bila kosong: PIC-nya anggota divisi ini (`User.divisionId`);
 * 3. bila PIC juga tanpa divisi: PIC-nya kepala divisi ini.
 * Cadangan 2–3 hanya untuk proyek di PT yang sama dengan divisinya.
 * `historical` menyertakan semua lifecycle untuk KPI; operasi tim tetap hanya AKTIF.
 */
export async function divisionProjects(div: LedDivision, historical = false) {
  return db.project.findMany({
    where: {
      ...(historical ? {} : { lifecycle: 'AKTIF' }),
      OR: [
        { divisionId: div.id },
        { divisionId: null, entityId: div.entityId, picUser: { divisionId: div.id } },
        ...(div.headUserId ? [{ divisionId: null, entityId: div.entityId, picUserId: div.headUserId, picUser: { divisionId: null } }] : []),
      ],
    },
    select: {
      id: true, code: true, name: true, picUserId: true, picName: true, phase: true, lifecycle: true,
      startDate: true, targetEndDate: true, createdAt: true, approvedAt: true, picUser: { select: { name: true } },
    },
    orderBy: { code: 'asc' },
  })
}

/** Id orang di tim divisi (anggota ∪ PIC proyek divisi), tanpa kepala divisinya. */
export async function teamUserIds(div: LedDivision, projects?: { picUserId: string | null }[]) {
  const ps = projects ?? (await divisionProjects(div))
  const members = await db.user.findMany({ where: { divisionId: div.id, isActive: true }, select: { id: true } })
  const ids = new Set<string>(members.map((m) => m.id))
  for (const p of ps) if (p.picUserId) ids.add(p.picUserId)
  if (div.headUserId) ids.delete(div.headUserId)
  return [...ids]
}

/** n hari kerja terakhir (Senin–Jumat WIB) termasuk hari ini bila hari kerja, urut lama → baru. */
export function lastWorkingDays(today: Date, n = 10): Date[] {
  const out: Date[] = []
  for (let t = today.getTime(); out.length < n && t > today.getTime() - 30 * DAY; t -= DAY) {
    const d = startOfWibDay(new Date(t + 3600000))
    if (wibIsoDay(d) > 5) continue
    out.unshift(d)
  }
  return out
}

/** Hari kerja yang tersisa minggu ini, termasuk hari ini. */
function remainingWorkdays(today: Date): Date[] {
  const out: Date[] = []
  for (let d = today; wibIsoDay(d) <= 5 && out.length < 5; d = startOfWibDay(new Date(d.getTime() + DAY + 3600000))) {
    out.push(d)
    if (wibIsoDay(d) === 5) break
  }
  return out
}

function taskMinutes(t: { durationMin: number | null; startAt: Date | null; endAt: Date | null }) {
  if (t.durationMin && t.durationMin > 0) return t.durationMin
  if (t.startAt && t.endAt && t.endAt > t.startAt) return Math.round((t.endAt.getTime() - t.startAt.getTime()) / 60000)
  return DEFAULT_TASK_MIN
}

/**
 * Beban kerja seseorang minggu ini, dalam persen:
 *
 *   beban = Σ sisa menit task terbuka ÷ sisa kapasitas minggu ini × 100
 *
 * - Task terbuka = status BELUM_MULAI/BERJALAN/TERKENDALA/MENUNGGU_KEPUTUSAN
 *   dengan PIC orang itu, tanggal kerja dari 14 hari lalu (tunggakan) sampai
 *   Jumat minggu ini.
 * - Sisa menit task = durasi rencana × (100 − progres) / 100. Durasi rencana =
 *   `durationMin`, atau selisih jam mulai–selesai, atau 60 menit bila kosong.
 * - Sisa kapasitas = hari kerja tersisa minggu ini (termasuk hari ini) yang
 *   tidak cuti/sakit/izin × 480 menit (8 jam).
 * - 80% = batas sehat (target di DivisionBar); di atas 100% = kelebihan beban.
 * - Tanpa kapasitas (cuti sepanjang sisa minggu) → null.
 */
export function workloadPct(openMinutes: number, capacityDays: number): number | null {
  if (capacityDays <= 0) return null
  return Math.round((openMinutes / (capacityDays * WORKDAY_MIN)) * 100)
}

/* ------------------------------------------------------------------ */
/* Aktivitas tim dari AuditLog                                          */
/* ------------------------------------------------------------------ */

/** Hanya aksi kerja yang aman ditampilkan ke kepala divisi (bukan login, sandi, profil). */
const ACTIVITY_TEXT: Record<string, string> = {
  CREATE_REPORT: 'mengirim laporan harian',
  UPDATE_REPORT: 'memperbarui laporan harian',
  SUBMIT_DAILY_REPORT: 'mengirim laporan harian',
  SAVE_DAILY_REPORT: 'menyimpan draf laporan harian',
  SUBMIT_PROGRESS_REPORT: 'mengirim laporan kemajuan proyek',
  SUBMIT_WEEKLY_REPORT: 'menyerahkan capaian mingguan',
  CREATE_TASK: 'menambah task',
  UPDATE_TASK: 'memperbarui task',
  DELETE_TASK: 'menghapus task',
  REORDER_TASKS: 'mengatur ulang urutan task',
  UPLOAD_EVIDENCE: 'mengunggah bukti',
  ATTACH_EVIDENCE: 'melampirkan bukti',
  REMOVE_EVIDENCE: 'menghapus bukti',
  CREATE_ESCALATION: 'mengajukan eskalasi',
  UPDATE_PROJECT: 'memperbarui proyek',
  RESUBMIT_PROJECT: 'mengajukan ulang proyek',
  DELETE_WEEKLY_ITEM: 'menghapus item mingguan',
  REORDER_WEEKLY_ITEMS: 'mengatur ulang papan mingguan',
  CREATE_OUTPUT: 'menambah output',
  OUTPUT_UPDATE: 'memperbarui output',
  OUTPUT_SUBMIT: 'mengirim output untuk direview',
  OUTPUT_WITHDRAW: 'menarik kembali output',
  DELETE_OUTPUT: 'menghapus output',
  CREATE_PROJECT_NOTE: 'menulis catatan proyek',
  CREATE_PROJECT_STAGE: 'menambah tahapan proyek',
  UPDATE_PROJECT_STAGE: 'memperbarui tahapan proyek',
  PROPOSE_DEADLINE: 'mengusulkan geser tenggat',
  REQUEST_UNLOCK: 'meminta buka kunci laporan',
  FORWARD_DAILY_REPORT: 'meneruskan laporan harian',
  OUTPUT_ACCEPT: 'menerima output',
  OUTPUT_REVISE: 'meminta revisi output',
  OUTPUT_REVIEW_UNDO: 'mengurungkan review output',
  REMIND_PIC: 'mengingatkan laporan harian',
  SET_ATTENDANCE: 'mencatat kehadiran',
}

function detailOf(raw: string | null): string | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    for (const k of ['title', 'workItem', 'name', 'projectName', 'project']) {
      const v = o[k]
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80)
    }
  } catch {
    /* bukan JSON */
  }
  return null
}

export async function teamActivity(actorIds: string[], take = 12): Promise<TeamActivity[]> {
  if (actorIds.length === 0) return []
  const rows = await db.auditLog.findMany({
    where: { actorId: { in: actorIds }, action: { in: Object.keys(ACTIVITY_TEXT) }, at: { gte: new Date(Date.now() - 14 * DAY) } },
    select: { id: true, action: true, afterData: true, at: true, actor: { select: { name: true } } },
    orderBy: { at: 'desc' },
    take,
  })
  return rows.map((r) => {
    const who = r.actor?.name ?? 'Anggota'
    const detail = detailOf(r.afterData)
    return {
      id: r.id,
      actorName: who,
      initials: initials(who),
      text: ACTIVITY_TEXT[r.action] + (detail ? ` · ${detail}` : ''),
      at: r.at.toISOString(),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Ringkasan tim                                                        */
/* ------------------------------------------------------------------ */

export async function buildTeam(user: SessionUser, divisionId?: string | null): Promise<KadivTeam | null> {
  const now = new Date()
  const today = startOfWibDay(now)
  const { all, current: div } = await pickLedDivision(user, divisionId)
  const base = {
    today: today.toISOString(),
    lockAt: dailyLockAt(today).toISOString(),
    locked: isDailyLocked(today),
    cutoffLabel: DAILY_CUTOFF_LABEL,
    divisions: all.map((d) => ({ id: d.id, name: d.name })),
  }
  if (divisionId && !div) return null
  if (!div) {
    return {
      ...base, division: null, projects: [], members: [], days: [], heat: [], trend: [], activity: [],
      onTime30: { pct: null, ok: 0, total: 0, target: ON_TIME_TARGET, days: 0, historyComplete: true, unknownProjects: 0 },
      summary: { members: 0, present: 0, absent: 0, absentNames: [], reporters: 0, reported: 0, outputsAccepted: 0, outputsTarget: 0, pendingReview: 0, avgLoad: null, overloaded: 0 },
    }
  }

  const historicalProjects = await divisionProjects(div, true)
  const projects = historicalProjects.filter((p) => p.lifecycle === 'AKTIF')
  const projectIds = projects.map((p) => p.id)
  const historicalIds = historicalProjects.map((p) => p.id)
  const ids = await teamUserIds(div, projects)
  const attendanceIds = [...new Set([...ids, ...historicalProjects.flatMap((p) => p.picUserId ? [p.picUserId] : [])])]
  const days = lastWorkingDays(today)
  const weekStart = isoWeekStart(now)
  const weekEnd = new Date(weekStart.getTime() + 5 * DAY) // Sabtu 00.00 WIB
  const restDays = remainingWorkdays(today)
  const trendFrom = new Date(weekStart.getTime() - 7 * 7 * DAY)
  const heatFrom = days[0] ?? today
  // [F2-KADIV] KPI tepat waktu 30 hari: hari kerja yang tenggat 17.00-nya sudah lewat.
  const onTimeDays = lockedWorkdays(now, dailyLockAt)
  const onTimeFrom = onTimeDays[0] ?? today
  const attFrom = [heatFrom, onTimeFrom, today].reduce((a, b) => (b < a ? b : a))

  const [people, attendance, reportsToday, tasksOpen, tasksToday, tasksDone, outputs, reminders, followUps] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, title: true, role: true, divisionId: true },
      orderBy: { name: 'asc' },
    }),
    db.attendance.findMany({
      where: { userId: { in: attendanceIds }, date: { gte: attFrom, lte: restDays[restDays.length - 1] ?? today } },
      select: { userId: true, date: true, status: true, note: true },
    }),
    db.dailyProjectReport.findMany({
      where: { projectId: { in: projectIds }, reportDate: today },
      select: { id: true, projectId: true, submittedAt: true, obstacle: true, followUp: true, achievementToday: true },
    }),
    db.task.findMany({
      where: {
        picUserId: { in: ids },
        status: { in: OPEN_TASK },
        workDate: { gte: new Date(today.getTime() - OVERDUE_LOOKBACK_DAYS * DAY), lt: weekEnd },
      },
      select: { picUserId: true, durationMin: true, startAt: true, endAt: true, progressPct: true },
    }),
    db.task.findMany({
      where: { picUserId: { in: ids }, workDate: today },
      select: { id: true, picUserId: true, title: true, status: true, progressPct: true, obstacle: true, project: { select: { name: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    db.task.findMany({
      where: { picUserId: { in: ids }, status: 'SELESAI', workDate: { gte: heatFrom } },
      select: { picUserId: true, workDate: true },
    }),
    db.output.findMany({
      where: { projectId: { in: projectIds }, OR: [{ reviewedAt: { gte: trendFrom } }, { dueDate: { gte: trendFrom } }, { status: 'MENUNGGU_REVIEW' }, { submittedAt: { gte: heatFrom } }] },
      select: { ownerId: true, status: true, dueDate: true, submittedAt: true, reviewedAt: true },
    }),
    db.notificationLog.findMany({
      where: { template: DAILY_PIC_TEMPLATE, userId: { in: ids }, createdAt: { gte: today } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.task.findMany({
      where: { picUserId: { in: ids }, workDate: { gt: today, lt: new Date(today.getTime() + 4 * DAY) } },
      select: { picUserId: true, title: true, workDate: true },
      orderBy: [{ workDate: 'asc' }, { sortOrder: 'asc' }],
    }),
  ])

  // [F2-KADIV] Data tambahan: laporan 30 hari (KPI tepat waktu & status proyek),
  // rekap output & tahapan per proyek (Sheet proyek), tanda baca laporan hari ini.
  const [recentReports, outputGroups, openOutputDue, stages, reads, lifecycleHistory] = await Promise.all([
    db.dailyProjectReport.findMany({
      where: { projectId: { in: historicalIds }, reportDate: { gte: onTimeFrom, lte: today } },
      select: { projectId: true, reportDate: true, submittedAt: true, isLate: true, status: true, progressPct: true, obstacle: true, needsEscalation: true },
      orderBy: { reportDate: 'desc' },
    }),
    db.output.groupBy({ by: ['projectId', 'status'], where: { projectId: { in: projectIds } }, _count: { _all: true } }),
    db.output.findMany({
      where: { projectId: { in: projectIds }, status: { in: ['DIKERJAKAN', 'PERLU_REVISI', 'MENUNGGU_REVIEW'] }, dueDate: { not: null } },
      select: { projectId: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    }),
    db.projectStage.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, name: true, status: true, dueDate: true },
      orderBy: [{ projectId: 'asc' }, { position: 'asc' }],
    }),
    optionalRows(
      db.dailyReportRead.findMany({
        where: { userId: user.id, dailyReportId: { in: reportsToday.map((r) => r.id) } },
        select: { dailyReportId: true, readAt: true },
      }),
    ),
    db.auditLog.findMany({
      where: { targetType: 'PROJECT', targetId: { in: historicalIds }, at: { lte: now } },
      select: { targetId: true, at: true, action: true, beforeData: true, afterData: true },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    }),
  ])
  const readOf = new Map(reads.map((r) => [r.dailyReportId, r.readAt]))

  const attOn = (uid: string, d: Date) => attendance.find((a) => a.userId === uid && a.date.getTime() === d.getTime())
  const nextWorkday = (() => {
    const futures = followUps.map((f) => f.workDate.getTime())
    return futures.length ? Math.min(...futures) : null
  })()

  const members: TeamMember[] = people.map((p) => {
    const att = attOn(p.id, today)
    const status = (att?.status as AttendanceStatus | undefined) ?? 'HADIR'
    const myProjects = projects.filter((pr) => pr.picUserId === p.id)
    const myReports = reportsToday.filter((r) => myProjects.some((pr) => pr.id === r.projectId))
    const sent = myReports.filter((r) => r.submittedAt).length
    const absent = ABSENT.has(status)
    const state = absent ? 'ABSEN' : myProjects.length === 0 ? 'TIDAK_WAJIB' : sent >= myProjects.length ? 'TERKIRIM' : 'BELUM'
    const lastSent = myReports
      .map((r) => r.submittedAt?.getTime() ?? 0)
      .reduce((a, b) => Math.max(a, b), 0)
    const reminded = reminders.find((r) => r.userId === p.id)
    const sentReports = myReports.filter((r) => r.submittedAt)
    const readTimes = sentReports.map((r) => readOf.get(r.id))
    const readAt = sentReports.length && readTimes.every(Boolean) ? new Date(Math.max(...readTimes.map((d) => (d as Date).getTime()))) : null

    const open = tasksOpen.filter((t) => t.picUserId === p.id)
    const openMinutes = Math.round(open.reduce((s, t) => s + taskMinutes(t) * (100 - Math.min(100, Math.max(0, t.progressPct))) / 100, 0))
    const capacityDays = restDays.filter((d) => !ABSENT.has(attOn(p.id, d)?.status ?? 'HADIR')).length
    const mineToday = tasksToday.filter((t) => t.picUserId === p.id)

    return {
      id: p.id,
      name: p.name,
      title: p.title,
      role: p.role,
      initials: initials(p.name),
      isMember: p.divisionId === div.id,
      attendance: status,
      attendanceNote: att?.note ?? null,
      projects: myProjects.map((pr) => ({ id: pr.id, code: pr.code, name: pr.name })),
      report: {
        state,
        required: absent ? 0 : myProjects.length,
        sent,
        submittedAt: lastSent ? new Date(lastSent).toISOString() : null,
        remindedAt: reminded ? reminded.createdAt.toISOString() : null,
        readAt: readAt ? readAt.toISOString() : null,
      },
      today: {
        tasks: mineToday.map((t) => ({ id: t.id, title: t.title, status: t.status, progressPct: t.progressPct, projectName: t.project.name })),
        achievements: sentReports
          .map((r) => {
            const name = myProjects.find((pr) => pr.id === r.projectId)?.name
            const text = r.achievementToday?.trim()
            return text ? (myProjects.length > 1 && name ? `${name}: ${text}` : text) : ''
          })
          .filter(Boolean)
          .slice(0, 5),
        obstacles: [
          ...mineToday.filter((t) => t.status === 'TERKENDALA' && t.obstacle).map((t) => t.obstacle as string),
          ...myReports.filter((r) => r.obstacle).map((r) => r.obstacle as string),
        ].slice(0, 5),
        plans: [
          ...followUps.filter((f) => f.picUserId === p.id && f.workDate.getTime() === nextWorkday).map((f) => f.title),
          ...myReports.filter((r) => r.followUp).map((r) => r.followUp as string),
        ].slice(0, 5),
      },
      load: { pct: workloadPct(openMinutes, capacityDays), openTasks: open.length, openMinutes },
    }
  })

  const heat = members.map((m) =>
    days.map((d) => {
      const a = attOn(m.id, d)
      if (a && ABSENT.has(a.status)) return null
      const next = d.getTime() + DAY
      const tasks = tasksDone.filter((t) => t.picUserId === m.id && t.workDate.getTime() === d.getTime()).length
      const outs = outputs.filter(
        (o) => o.ownerId === m.id && o.status === 'DITERIMA' && o.submittedAt && o.submittedAt.getTime() >= d.getTime() && o.submittedAt.getTime() < next,
      ).length
      return tasks + outs
    }),
  )

  const trend = Array.from({ length: 8 }, (_, i) => {
    const from = new Date(trendFrom.getTime() + i * 7 * DAY)
    const to = new Date(from.getTime() + 7 * DAY)
    const inWeek = (d: Date | null) => Boolean(d && d >= from && d < to)
    return {
      label: `M${isoWeekOf(new Date(from.getTime() + DAY)).isoWeek}`,
      accepted: outputs.filter((o) => o.status === 'DITERIMA' && inWeek(o.reviewedAt)).length,
      target: outputs.filter((o) => inWeek(o.dueDate)).length,
    }
  })

  const accepted = outputs.filter((o) => o.status === 'DITERIMA' && o.reviewedAt && o.reviewedAt >= weekStart).length
  const pending = outputs.filter((o) => o.status === 'MENUNGGU_REVIEW').length
  const openDue = outputs.filter((o) => (o.status === 'DIKERJAKAN' || o.status === 'PERLU_REVISI') && o.dueDate && o.dueDate < weekEnd).length
  const absentMembers = members.filter((m) => ABSENT.has(m.attendance))
  const loads = members.map((m) => m.load.pct).filter((v): v is number => v !== null)
  const reporters = members.filter((m) => m.report.state === 'TERKIRIM' || m.report.state === 'BELUM')

  const activity = await teamActivity(ids)

  // CX9: kewajiban per hari berdasarkan interval lifecycle yang tercatat.
  const onTime = historicalOnTimeDaily({
    days: onTimeDays,
    projects: historicalProjects,
    history: lifecycleHistory,
    reports: recentReports,
    lockAt: dailyLockAt,
    absent: (uid, d) => ABSENT.has(attOn(uid, d)?.status ?? 'HADIR'),
  })

  // [F2-KADIV] Proyek divisi untuk Timeline & Sheet proyek; status dari src/lib/project-status.ts.
  const projectRows: KadivProject[] = projects.map((p) => {
    const latest = recentReports.find((r) => r.projectId === p.id) ?? null
    const derived = deriveProjectStatus(p, latest, now)
    const count = (st: string) => outputGroups.find((g) => g.projectId === p.id && g.status === st)?._count._all ?? 0
    const total = outputGroups.filter((g) => g.projectId === p.id).reduce((a, g) => a + g._count._all, 0)
    const due = openOutputDue.find((o) => o.projectId === p.id)?.dueDate ?? null
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      picName: p.picUser?.name ?? p.picName ?? null,
      phase: p.phase,
      startDate: (p.startDate ?? p.createdAt).toISOString(),
      targetEndDate: p.targetEndDate?.toISOString() ?? null,
      status: derived.status,
      reason: derived.reason,
      progress: derived.progress,
      outputs: { total, accepted: count('DITERIMA'), pending: count('MENUNGGU_REVIEW'), revise: count('PERLU_REVISI'), open: count('DIKERJAKAN') },
      nextOutputDue: due ? due.toISOString() : null,
      stages: stages
        .filter((s) => s.projectId === p.id)
        .map((s) => ({ id: s.id, name: s.name, status: s.status, dueDate: s.dueDate?.toISOString() ?? null })),
      lastReport: latest ? { date: latest.reportDate.toISOString(), status: latest.status, submittedAt: latest.submittedAt?.toISOString() ?? null } : null,
    }
  })

  return {
    ...base,
    division: { id: div.id, name: div.name, entityName: div.entityName },
    projects: projectRows,
    members,
    days: days.map((d) => d.toISOString()),
    heat,
    trend,
    activity,
    onTime30: { ...onTime, target: ON_TIME_TARGET, days: onTimeDays.length },
    summary: {
      members: members.length,
      present: members.length - absentMembers.length,
      absent: absentMembers.length,
      absentNames: absentMembers.map((m) => m.name),
      reporters: reporters.length,
      reported: reporters.filter((m) => m.report.state === 'TERKIRIM').length,
      outputsAccepted: accepted,
      outputsTarget: accepted + pending + openDue,
      pendingReview: pending,
      avgLoad: loads.length ? Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) : null,
      overloaded: loads.filter((v) => v > 100).length,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Pengingat laporan harian dari kepala divisi                          */
/* ------------------------------------------------------------------ */

/**
 * Mengingatkan anggota yang belum mengirim laporan harian hari ini. Memakai
 * templat & aturan yang sama dengan pengingat Admin PT (sekali per proyek per
 * hari, payload memuat projectId), sehingga meja PIC menampilkan siapa yang
 * mengingatkan dan pengingat Admin PT tidak menumpuk.
 */
export async function remindTeam(user: SessionUser, div: LedDivision, onlyUserId?: string | null) {
  const today = startOfWibDay(new Date())
  const projects = await divisionProjects(div)
  const ids = await teamUserIds(div, projects)
  if (onlyUserId && !ids.includes(onlyUserId)) return { ok: false as const, status: 404, error: 'Orang ini bukan anggota tim Anda' }
  const targets = projects.filter((p) => p.picUserId && (!onlyUserId || p.picUserId === onlyUserId))
  const pics = await db.user.findMany({
    where: { id: { in: targets.map((p) => p.picUserId as string) }, isActive: true },
    select: { id: true, name: true, email: true },
  })
  const [reports, absent, already] = await Promise.all([
    db.dailyProjectReport.findMany({ where: { projectId: { in: targets.map((p) => p.id) }, reportDate: today, submittedAt: { not: null } }, select: { projectId: true } }),
    db.attendance.findMany({ where: { userId: { in: pics.map((p) => p.id) }, date: today, status: { in: [...ABSENT] } }, select: { userId: true } }),
    db.notificationLog.findMany({ where: { template: DAILY_PIC_TEMPLATE, userId: { in: pics.map((p) => p.id) }, createdAt: { gte: today } }, select: { payload: true } }),
  ])
  const sentIds = new Set(reports.map((r) => r.projectId))
  const absentIds = new Set(absent.map((a) => a.userId))
  const remindedProjects = new Set<string>()
  for (const n of already) {
    try {
      const pid = (JSON.parse(n.payload) as { projectId?: unknown }).projectId
      if (typeof pid === 'string') remindedProjects.add(pid)
    } catch {
      /* abaikan */
    }
  }

  const sent: { userId: string; name: string; projectId: string }[] = []
  let skipped = 0
  for (const p of targets) {
    const pic = pics.find((x) => x.id === p.picUserId)
    if (!pic || sentIds.has(p.id) || absentIds.has(pic.id) || remindedProjects.has(p.id)) {
      skipped += 1
      continue
    }
    await db.notificationLog.create({
      data: {
        userId: pic.id,
        channel: 'APLIKASI',
        recipient: pic.email,
        template: DAILY_PIC_TEMPLATE,
        status: 'SENT',
        sentAt: new Date(),
        payload: JSON.stringify({
          title: `Laporan harian ${p.name} belum dikirim`,
          body: `Tenggat pukul ${DAILY_CUTOFF_LABEL}. Diingatkan oleh ${user.name}.`,
          tab: 'work-desk',
          projectId: p.id,
          actorName: user.name,
        }),
      },
    })
    await db.auditLog.create({
      data: { actorId: user.id, action: 'REMIND_PIC', targetType: 'PROJECT', targetId: p.id, afterData: JSON.stringify({ pic: pic.name, by: 'KEPALA_DIVISI' }) },
    })
    sent.push({ userId: pic.id, name: pic.name, projectId: p.id })
  }
  return { ok: true as const, sent, skipped }
}

/* ------------------------------------------------------------------ */
/* Tanda "sudah dibaca" laporan harian anggota [F2-KADIV]               */
/* ------------------------------------------------------------------ */

/**
 * Menandai (read=true) atau membatalkan tanda (read=false) laporan harian hari
 * ini milik satu anggota tim. Hanya laporan yang sudah terkirim, pada proyek
 * divisi yang ia pegang. Laporan tetap milik alur PIC → Admin PT; tanda ini
 * hanya untuk kepala divisi.
 */
export async function markMemberRead(user: SessionUser, div: LedDivision, userId: string, read: boolean) {
  const today = startOfWibDay(new Date())
  const projects = await divisionProjects(div)
  const ids = await teamUserIds(div, projects)
  if (!ids.includes(userId)) return { ok: false as const, status: 404, error: 'Orang ini bukan anggota tim Anda' }
  const mine = projects.filter((p) => p.picUserId === userId).map((p) => p.id)
  const reports = await db.dailyProjectReport.findMany({
    where: { projectId: { in: mine }, reportDate: today, submittedAt: { not: null } },
    select: { id: true },
  })
  if (reports.length === 0) return { ok: false as const, status: 409, error: 'Belum ada laporan harian yang masuk hari ini' }
  const reportIds = reports.map((r) => r.id)
  try {
    if (read) {
      const have = await db.dailyReportRead.findMany({ where: { userId: user.id, dailyReportId: { in: reportIds } }, select: { dailyReportId: true } })
      const missing = reportIds.filter((id) => !have.some((h) => h.dailyReportId === id))
      if (missing.length) await db.dailyReportRead.createMany({ data: missing.map((id) => ({ dailyReportId: id, userId: user.id })), skipDuplicates: true })
    } else {
      await db.dailyReportRead.deleteMany({ where: { userId: user.id, dailyReportId: { in: reportIds } } })
    }
  } catch (err) {
    if (isMissingTable(err)) return { ok: false as const, status: 503, error: 'Fitur tanda baca belum aktif. Minta TI menjalankan migrasi 0021.' }
    throw err
  }
  return { ok: true as const, reportIds }
}

/* ------------------------------------------------------------------ */
/* Ringkasan laporan mingguan untuk Direktur [F2-KADIV]                 */
/* ------------------------------------------------------------------ */

/** Direktur entitas yang membaca divisi ini: direktur PT itu, lalu induknya (terdekat dulu). */
export async function entityDirectors(entityId: string): Promise<{ id: string; name: string; email: string }[]> {
  const ent = await db.entity.findUnique({ where: { id: entityId }, select: { path: true } })
  const codes = (ent?.path ?? '').split('/').filter(Boolean)
  const chain = codes.length
    ? await db.entity.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } })
    : []
  const order = [entityId, ...codes.slice().reverse().map((c) => chain.find((e) => e.code === c)?.id).filter((v): v is string => Boolean(v))]
  const ids = [...new Set(order)]
  const users = await db.user.findMany({
    where: { role: 'DIREKTUR_ENTITAS', isActive: true, scopeEntityId: { in: ids } },
    select: { id: true, name: true, email: true, scopeEntityId: true },
  })
  for (const id of ids) {
    const here = users.filter((u) => u.scopeEntityId === id)
    if (here.length) return here.map((u) => ({ id: u.id, name: u.name, email: u.email }))
  }
  return []
}

const OPEN_OUTPUT = ['DIKERJAKAN', 'PERLU_REVISI']

/**
 * Draf ringkasan laporan mingguan sebuah divisi (03-kepala-divisi.md §8):
 * angka minggu itu, 3 poin bawaan, baris tersimpan, dan status laporan
 * mingguan. null bila kunci minggu tidak valid atau minggu belum berjalan.
 */
export async function buildWeeklySummary(div: LedDivision, weekKey: string | null, now: Date = new Date()): Promise<WeeklySummaryView | null> {
  const period = weekKey ? parseWeekKey(weekKey) : weekPeriodOf(now)
  if (!period) return null
  const currentStart = isoWeekStart(now)
  if (period.start.getTime() > currentStart.getTime()) return null
  const { isoYear, isoWeek } = isoWeekOf(period.start)
  const dl = weeklyDeadlines(period.start)
  const weekEnd = new Date(period.start.getTime() + 7 * DAY)
  const asOf = weekEnd < now ? weekEnd : now

  const projects = await divisionProjects(div)
  const projectIds = projects.map((p) => p.id)
  const today = startOfWibDay(now)
  const days: Date[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(period.start.getTime() + i * DAY)
    if (d.getTime() <= today.getTime()) days.push(d)
  }
  const picIds = [...new Set(projects.map((p) => p.picUserId).filter((v): v is string => Boolean(v)))]

  const [accepted, pending, openDue, latest, weekReports, attendance, report, saved, directors] = await Promise.all([
    db.output.findMany({
      where: { projectId: { in: projectIds }, status: 'DITERIMA', reviewedAt: { gte: period.start, lt: weekEnd } },
      select: { title: true },
      orderBy: { reviewedAt: 'desc' },
    }),
    db.output.count({ where: { projectId: { in: projectIds }, status: 'MENUNGGU_REVIEW' } }),
    db.output.count({ where: { projectId: { in: projectIds }, status: { in: OPEN_OUTPUT }, dueDate: { lt: weekEnd } } }),
    db.dailyProjectReport.findMany({
      where: { projectId: { in: projectIds }, reportDate: { lt: weekEnd, gte: new Date(period.start.getTime() - 30 * DAY) } },
      select: { projectId: true, reportDate: true, status: true, progressPct: true, obstacle: true, needsEscalation: true },
      orderBy: { reportDate: 'desc' },
    }),
    db.dailyProjectReport.findMany({
      where: { projectId: { in: projectIds }, reportDate: { gte: period.start, lt: weekEnd }, submittedAt: { not: null } },
      select: { projectId: true, reportDate: true },
    }),
    db.attendance.findMany({
      where: { userId: { in: picIds }, date: { gte: period.start, lt: weekEnd }, status: { in: [...ABSENT] } },
      select: { userId: true, date: true },
    }),
    db.weeklyDivisionReport.findUnique({
      where: { divisionId_isoYear_isoWeek: { divisionId: div.id, isoYear, isoWeek } },
      select: {
        id: true, statusHeader: true, submittedAt: true, approvedAt: true, forwardedAt: true,
        items: { where: { status: 'TERKENDALA' }, select: { workItem: true, obstacleFollowUp: true, followUp: true }, orderBy: { position: 'asc' } },
      },
    }),
    readSummaryRow(div.id, isoYear, isoWeek),
    entityDirectors(div.entityId),
  ])

  // Status proyek per akhir minggu itu (atau hari ini untuk minggu berjalan).
  const statuses = projects.map((p) => {
    const last = latest.find((r) => r.projectId === p.id) ?? null
    return { p, last, d: deriveProjectStatus(p, last, asOf) }
  })
  const onTrack = statuses.filter((x) => x.d.status === 'on' || x.d.status === 'done')
  const offTrack = statuses
    .filter((x) => x.d.status === 'risk' || x.d.status === 'late')
    .map((x) => ({ name: x.p.name, reason: x.d.reason, status: x.d.status as 'risk' | 'late' }))

  // Kendala terbuka = proyek yang laporan terakhirnya terkendala/menunggu keputusan
  // + butir capaian mingguan berstatus Terkendala.
  const dailyObstacles = statuses
    .filter((x) => x.last && (x.last.status === 'TERKENDALA' || x.last.status === 'MENUNGGU_KEPUTUSAN'))
    .map((x) => `${x.p.name}: ${x.last?.obstacle?.trim() || (x.last?.status === 'MENUNGGU_KEPUTUSAN' ? 'menunggu keputusan' : 'terkendala')}`)
  const itemObstacles = (report?.items ?? []).map((i) => `${i.workItem}${i.obstacleFollowUp?.trim() ? ` (${i.obstacleFollowUp.trim()})` : ''}`)
  const obstacles = [...dailyObstacles, ...itemObstacles]

  const stats: WeeklySummaryStats = {
    outputsAccepted: accepted.length,
    outputsTarget: accepted.length + pending + openDue,
    projectsOnTrack: onTrack.length,
    projectsTotal: projects.length,
    openObstacles: obstacles.length,
    pendingReview: pending,
  }
  const facts: SummaryFacts = { ...stats, divisionName: div.name, acceptedTitles: accepted.map((o) => o.title), offTrack, obstacles }

  // Laporan harian minggu itu: pasangan (proyek, hari kerja yang sudah berjalan) yang wajib vs terkirim.
  let required = 0
  let sent = 0
  for (const p of projects) {
    if (!p.picUserId) continue
    const from = startOfWibDay(p.startDate ?? p.createdAt).getTime()
    for (const d of days) {
      if (d.getTime() < from) continue
      if (attendance.some((a) => a.userId === p.picUserId && a.date.getTime() === d.getTime())) continue
      required += 1
      if (weekReports.some((r) => r.projectId === p.id && r.reportDate.getTime() === d.getTime())) sent += 1
    }
  }

  const blocked = summaryBlock({
    now,
    weekStart: period.start,
    currentWeekStart: currentStart,
    handoverBy: dl.handoverBy,
    lockAt: dl.lockAt,
    forwarded: Boolean(report?.forwardedAt),
    sending: false,
    pendingReview: pending,
    confirmPending: false,
  })

  return {
    division: { id: div.id, name: div.name },
    week: { key: period.key, isoYear, isoWeek, start: period.start.toISOString(), handoverBy: dl.handoverBy.toISOString(), lockAt: dl.lockAt.toISOString() },
    live: { ...stats, points: draftPoints(facts) },
    saved: saved
      ? {
          status: saved.status === 'TERKIRIM' ? 'TERKIRIM' : 'DRAF',
          points: saved.points,
          outputsAccepted: saved.outputsAccepted,
          outputsTarget: saved.outputsTarget,
          projectsOnTrack: saved.projectsOnTrack,
          projectsTotal: saved.projectsTotal,
          openObstacles: saved.openObstacles,
          pendingReview: saved.pendingReview,
          sentAt: saved.sentAt?.toISOString() ?? null,
          updatedAt: saved.updatedAt.toISOString(),
        }
      : null,
    daily: { sent, required },
    report: report
      ? {
          id: report.id,
          statusHeader: report.statusHeader,
          submittedAt: report.submittedAt?.toISOString() ?? null,
          approvedAt: report.approvedAt?.toISOString() ?? null,
          forwardedAt: report.forwardedAt?.toISOString() ?? null,
        }
      : null,
    directors: directors.map((d) => ({ id: d.id, name: d.name })),
    blocked,
    undoMinutes: SUMMARY_UNDO_MINUTES,
  }
}

/** Batas waktu "Urungkan" setelah ringkasan dikirim. */
export const SUMMARY_UNDO_MINUTES = 15

async function readSummaryRow(divisionId: string, isoYear: number, isoWeek: number) {
  try {
    return await db.weeklyDivisionSummary.findUnique({ where: { divisionId_isoYear_isoWeek: { divisionId, isoYear, isoWeek } } })
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

export type DivisionSummaryForDirector = WeeklySummaryStats & { points: string[]; sentAt: string | null; sentById: string | null }

/**
 * Untuk layar Direktur/Manajemen (/api/ringkasan): ringkasan yang sudah
 * DIKIRIM kepala divisi pada minggu tertentu, per divisi. Draf tidak ikut.
 * Peta kosong bila migrasi 0021 belum dijalankan. Cakupan divisi dijaga
 * pemanggil (hanya kirim divisionIds yang boleh dilihat).
 */
export async function readDivisionSummaries(divisionIds: string[], isoYear: number, isoWeek: number): Promise<Map<string, DivisionSummaryForDirector>> {
  if (divisionIds.length === 0) return new Map()
  const rows = await optionalRows(
    db.weeklyDivisionSummary.findMany({ where: { divisionId: { in: divisionIds }, isoYear, isoWeek, status: 'TERKIRIM' } }),
  )
  return new Map(
    rows.map((r) => [
      r.divisionId,
      {
        points: r.points,
        outputsAccepted: r.outputsAccepted,
        outputsTarget: r.outputsTarget,
        projectsOnTrack: r.projectsOnTrack,
        projectsTotal: r.projectsTotal,
        openObstacles: r.openObstacles,
        pendingReview: r.pendingReview,
        sentAt: r.sentAt?.toISOString() ?? null,
        sentById: r.sentById,
      },
    ]),
  )
}
