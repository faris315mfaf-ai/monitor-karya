import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refuseUnscoped, requireApiUser, scopeEntityIds } from '@/lib/auth'
import { isoWeekOf, monthPeriodOf, parseWibDateKey, startOfWibDay, weekPeriodOf, wibDateKey } from '@/lib/lock'

/**
 * Aktivitas per perusahaan untuk bagian teratas dashboard pengawas (8 Sep 2026).
 *
 *   GET ?cadence=HARIAN|MINGGUAN|BULANAN &date=YYYY-MM-DD &priority=ALL|KRITIS|TINGGI|SEDANG|RENDAH
 *
 * Satu bagian per PT: apa yang dikerjakan proyek-proyeknya (task, laporan
 * harian, laporan kemajuan) dan divisi-divisinya (item mingguan) pada periode
 * yang dipilih. Penyaring prioritas berlaku pada hal-hal yang membawa
 * prioritas — urgensi task dan prioritas item divisi; laporan proyek tidak
 * punya prioritas, jadi disembunyikan saat penyaring aktif.
 */

const CADENCES = ['HARIAN', 'MINGGUAN', 'BULANAN'] as const
type Cadence = (typeof CADENCES)[number]
const PRIORITIES = ['ALL', 'KRITIS', 'TINGGI', 'SEDANG', 'RENDAH'] as const
type PriorityFilter = (typeof PRIORITIES)[number]

const DAY_MS = 86400000
const WIB_OFFSET_MS = 7 * 3600 * 1000

function shift(anchor: Date, cadence: Cadence, direction: -1 | 1): string {
  if (cadence === 'HARIAN') return wibDateKey(new Date(anchor.getTime() + direction * DAY_MS))
  if (cadence === 'MINGGUAN') return wibDateKey(new Date(anchor.getTime() + direction * 7 * DAY_MS))
  const wib = new Date(anchor.getTime() + WIB_OFFSET_MS)
  return wibDateKey(new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() + direction, 1) - WIB_OFFSET_MS))
}

const BLOCKED = new Set(['TERKENDALA', 'MENUNGGU_KEPUTUSAN'])

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const unscoped = refuseUnscoped(user)
  if (unscoped) return unscoped

  const sp = req.nextUrl.searchParams
  const cadence: Cadence = CADENCES.includes(sp.get('cadence') as Cadence) ? (sp.get('cadence') as Cadence) : 'HARIAN'
  const priority: PriorityFilter = PRIORITIES.includes(sp.get('priority') as PriorityFilter)
    ? (sp.get('priority') as PriorityFilter)
    : 'ALL'
  const anchor = parseWibDateKey(sp.get('date')) ?? startOfWibDay(new Date())

  const period =
    cadence === 'HARIAN'
      ? { key: wibDateKey(anchor), start: anchor, end: anchor }
      : cadence === 'MINGGUAN'
        ? weekPeriodOf(anchor)
        : monthPeriodOf(anchor)
  const rangeEnd = new Date(period.end.getTime() + DAY_MS) // eksklusif
  const range = { gte: period.start, lt: rangeEnd }
  const week = isoWeekOf(cadence === 'HARIAN' ? anchor : period.start)

  const scopeIds = await scopeEntityIds(user)
  const entities = await db.entity.findMany({
    where: { type: 'PT', isActive: true, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
    select: { id: true, code: true, name: true, region: true },
    orderBy: { name: 'asc' },
  })
  const ptIds = entities.map((e) => e.id)
  const inScope = { entityId: { in: ptIds } }

  const taskPriority = priority === 'ALL' ? {} : { urgency: priority }
  // Item divisi hanya punya Tinggi/Sedang/Rendah; "Kritis" tidak memuat satu pun.
  const itemPriority =
    priority === 'ALL' ? {} : priority === 'KRITIS' ? { priority: { code: '__tidak_ada__' } } : { priority: { code: priority } }

  const [projects, divisions, tasks, dailyReports, weeklyReports, progressReports] = await Promise.all([
    db.project.findMany({
      where: { ...inScope, lifecycle: 'AKTIF' },
      select: { id: true, entityId: true, code: true, name: true, phase: true, picName: true, picUser: { select: { name: true } } },
      orderBy: { code: 'asc' },
    }),
    db.division.findMany({
      where: { ...inScope, isActive: true },
      select: { id: true, entityId: true, name: true, headUser: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    db.task.findMany({
      where: {
        ...inScope,
        workDate: range,
        ...(cadence === 'HARIAN' ? { scope: 'HARIAN' } : {}),
        ...taskPriority,
      },
      select: {
        id: true,
        entityId: true,
        projectId: true,
        workDate: true,
        scope: true,
        title: true,
        status: true,
        progressPct: true,
        urgency: true,
        picName: true,
        obstacle: true,
        decisionNeeded: true,
        sortOrder: true,
        picUser: { select: { name: true } },
        subtasks: { select: { isDone: true } },
      },
      orderBy: [{ workDate: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.dailyProjectReport.findMany({
      where: { ...inScope, reportDate: range },
      select: {
        id: true,
        entityId: true,
        projectId: true,
        reportDate: true,
        status: true,
        progressPct: true,
        achievementToday: true,
        obstacle: true,
        followUp: true,
        submittedAt: true,
        isLate: true,
        evidenceCount: true,
      },
      orderBy: { reportDate: 'asc' },
    }),
    db.weeklyDivisionReport.findMany({
      where: {
        ...inScope,
        ...(cadence === 'BULANAN' ? { periodStart: range } : { isoYear: week.isoYear, isoWeek: week.isoWeek }),
      },
      select: {
        id: true,
        entityId: true,
        divisionId: true,
        isoYear: true,
        isoWeek: true,
        statusHeader: true,
        submittedAt: true,
        approvedAt: true,
        periodStart: true,
        items: {
          where: {
            ...itemPriority,
            ...(cadence === 'HARIAN' ? { workDate: range } : {}),
          },
          select: {
            id: true,
            workItem: true,
            workDate: true,
            status: true,
            progressPct: true,
            achievementThisWeek: true,
            obstacleFollowUp: true,
            followUp: true,
            picName: true,
            evidenceCount: true,
            position: true,
            priority: { select: { code: true, name: true } },
            aspectCategory: { select: { code: true, name: true } },
          },
          orderBy: [{ workDate: 'asc' }, { position: 'asc' }],
        },
      },
      orderBy: [{ isoWeek: 'asc' }],
    }),
    cadence === 'HARIAN'
      ? Promise.resolve([])
      : db.projectProgressReport.findMany({
          where: { ...inScope, cadence, periodKey: period.key },
          select: {
            id: true,
            projectId: true,
            status: true,
            progressPct: true,
            summary: true,
            obstacle: true,
            followUp: true,
            submittedAt: true,
            evidenceCount: true,
          },
        }),
  ])

  const filtered = priority !== 'ALL'

  const result = entities.map((e) => {
    const eProjects = projects.filter((p) => p.entityId === e.id)
    const eDivisions = divisions.filter((d) => d.entityId === e.id)
    const eTasks = tasks.filter((t) => t.entityId === e.id)
    const eDaily = dailyReports.filter((r) => r.entityId === e.id)
    const eWeekly = weeklyReports.filter((w) => w.entityId === e.id)
    const eItems = eWeekly.flatMap((w) => w.items)

    return {
      id: e.id,
      code: e.code,
      name: e.name,
      region: e.region,
      stats: {
        projects: eProjects.length,
        divisions: eDivisions.length,
        tasks: eTasks.length,
        tasksDone: eTasks.filter((t) => t.status === 'SELESAI').length,
        tasksBlocked: eTasks.filter((t) => BLOCKED.has(t.status)).length,
        dailyReports: eDaily.filter((r) => r.submittedAt).length,
        dailyLate: eDaily.filter((r) => r.isLate).length,
        weeklyItems: eItems.length,
        weeklyItemsBlocked: eItems.filter((i) => i.status === 'TERKENDALA').length,
        weeklyReports: eWeekly.filter((w) => w.statusHeader !== 'DRAFT').length,
      },
      projects: eProjects.map((p) => {
        const pTasks = eTasks.filter((t) => t.projectId === p.id)
        const pDaily = eDaily.filter((r) => r.projectId === p.id)
        const progress = progressReports.find((r) => r.projectId === p.id) ?? null
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          phase: p.phase,
          picName: p.picUser?.name ?? p.picName,
          // Bulanan: daftar task terlalu panjang — cukup hitungan dan yang terhambat.
          tasks: (cadence === 'BULANAN' ? pTasks.filter((t) => BLOCKED.has(t.status)) : pTasks).map((t) => ({
            id: t.id,
            title: t.title,
            workDate: t.workDate,
            scope: t.scope,
            status: t.status,
            progressPct: t.progressPct,
            urgency: t.urgency,
            picName: t.picUser?.name ?? t.picName,
            note: t.obstacle ?? t.decisionNeeded ?? null,
            subtaskDone: t.subtasks.filter((s) => s.isDone).length,
            subtaskTotal: t.subtasks.length,
          })),
          taskStats: {
            total: pTasks.length,
            done: pTasks.filter((t) => t.status === 'SELESAI').length,
            blocked: pTasks.filter((t) => BLOCKED.has(t.status)).length,
          },
          dailyReports: (filtered || cadence === 'BULANAN' ? [] : pDaily).map((r) => ({
            id: r.id,
            date: r.reportDate,
            status: r.status,
            progressPct: r.progressPct,
            achievement: r.achievementToday,
            obstacle: r.obstacle,
            followUp: r.followUp,
            submitted: Boolean(r.submittedAt),
            late: r.isLate,
            evidenceCount: r.evidenceCount,
          })),
          dailyStats: {
            submitted: pDaily.filter((r) => r.submittedAt).length,
            late: pDaily.filter((r) => r.isLate).length,
            blocked: pDaily.filter((r) => BLOCKED.has(r.status)).length,
          },
          progressReport:
            filtered || !progress
              ? null
              : {
                  status: progress.status,
                  progressPct: progress.progressPct,
                  summary: progress.summary,
                  obstacle: progress.obstacle,
                  followUp: progress.followUp,
                  submitted: Boolean(progress.submittedAt),
                  evidenceCount: progress.evidenceCount,
                },
        }
      }),
      divisions: eDivisions.map((d) => {
        const dReports = eWeekly.filter((w) => w.divisionId === d.id)
        const dItems = dReports.flatMap((w) => w.items)
        return {
          id: d.id,
          name: d.name,
          headName: d.headUser?.name ?? null,
          reports: dReports.map((w) => ({
            id: w.id,
            isoWeek: w.isoWeek,
            statusHeader: w.statusHeader,
            submitted: Boolean(w.submittedAt),
            approved: Boolean(w.approvedAt),
            itemCount: w.items.length,
          })),
          items: (cadence === 'BULANAN' ? dItems.filter((i) => i.status === 'TERKENDALA') : dItems).map((i) => ({
            id: i.id,
            workItem: i.workItem,
            workDate: i.workDate,
            status: i.status,
            progressPct: i.progressPct,
            achievement: i.achievementThisWeek,
            obstacle: i.obstacleFollowUp,
            followUp: i.followUp,
            priority: i.priority.code,
            aspect: i.aspectCategory.name,
            picName: i.picName,
            evidenceCount: i.evidenceCount,
          })),
          itemStats: {
            total: dItems.length,
            done: dItems.filter((i) => i.status === 'SELESAI').length,
            blocked: dItems.filter((i) => i.status === 'TERKENDALA').length,
          },
        }
      }),
    }
  })

  return NextResponse.json({
    cadence,
    priority,
    date: wibDateKey(anchor),
    period: {
      key: period.key,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      isoWeek: week.isoWeek,
      isoYear: week.isoYear,
    },
    prev: shift(anchor, cadence, -1),
    next: shift(anchor, cadence, 1),
    today: wibDateKey(startOfWibDay(new Date())),
    entities: result,
  })
}
