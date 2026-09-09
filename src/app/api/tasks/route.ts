import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { can, isMasterRole } from '@/lib/rbac'
import {
  DAILY_CUTOFF_LABEL,
  TASK_STATUSES,
  TASK_URGENCIES,
  WEEKLY_LOCK_LABEL,
  dayInPeriod,
  daysOfWeek,
  isDailyLocked,
  isWeeklyLocked,
  parseWeekKey,
  parseWibDateKey,
  startOfWibDay,
  weekPeriodOf,
  weeklyDeadlines,
  type Period,
  type TaskScope,
} from '@/lib/lock'
import { rollupDailyReport } from '@/lib/daily-rollup'

/**
 * Daily tasks — the granular work a PIC plans and reports under one project.
 *
 *   GET    ?projectId= &date=          — tasks for a project on a WIB day
 *   GET    ?projectId= &week=2026-W37  — the whole week, for the weekly board
 *   POST                               — create a task (with its subtasks)
 *   PUT                                — update a task (replaces its subtask list)
 *   PATCH                              — move / reorder cards on the weekly board
 *   DELETE ?id=                        — remove a task
 *
 * Two contexts share these handlers (8 Sep 2026). The daily desk follows the
 * daily 17:00 lock of the task's own day. The weekly board — where the weekly
 * report is composed from the week's daily tasks — follows the Friday lock of
 * that week instead, so a PIC can still tidy Monday's achievements on Wednesday.
 * Everything is gated on owning the project, the same rule the report follows.
 */

type Context = 'HARIAN' | 'MINGGUAN'
type Guard = { ok: true; project: { id: string; entityId: string } } | { ok: false; res: NextResponse }

const contextOf = (raw: unknown): Context => (raw === 'MINGGUAN' ? 'MINGGUAN' : 'HARIAN')
const scopeOf = (raw: unknown): TaskScope => (raw === 'MINGGUAN' ? 'MINGGUAN' : 'HARIAN')

async function guardProject(user: SessionUser, projectId: string, opts?: { write?: boolean }): Promise<Guard> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, entityId: true, picUserId: true },
  })
  if (!project) {
    return { ok: false, res: NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 }) }
  }

  const owns =
    user.role === 'PIC_PROYEK'
      ? project.picUserId === user.id
      : isMasterRole(user.role)
        ? true
        : project.entityId === user.scopeEntityId

  if (!owns) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Proyek ini bukan tanggung jawab Anda' }, { status: 403 }),
    }
  }

  if (opts?.write && !can(user.role, 'daily:input')) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Peran Anda tidak mengelola task harian' }, { status: 403 }),
    }
  }

  return { ok: true, project }
}

/** The lock that applies: the day's own 17:00 on the daily desk, the week's
 *  Friday 17:00 on the weekly board. Returns the 409 to send, or null. */
function lockCheck(context: Context, workDate: Date): NextResponse | null {
  if (context === 'HARIAN') {
    return isDailyLocked(workDate)
      ? NextResponse.json({ error: `Hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}.`, locked: true }, { status: 409 })
      : null
  }
  return isWeeklyLocked(weekPeriodOf(workDate).start)
    ? NextResponse.json({ error: `Minggu ini sudah dikunci (${WEEKLY_LOCK_LABEL}).`, locked: true }, { status: 409 })
    : null
}

/** Parses "HH:MM" against a WIB day into a UTC instant. */
function timeOn(day: Date, hhmm: unknown): Date | null {
  if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (h > 23 || m > 59) return null
  return new Date(day.getTime() + h * 3600000 + m * 60000)
}

function readBody(body: Record<string, unknown>, day: Date) {
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  const startAt = timeOn(day, body.startTime)
  const endAt = timeOn(day, body.endTime)

  return {
    title: str('title'),
    description: str('description') || null,
    picName: str('picName') || null,
    picUserId: typeof body.picUserId === 'string' && body.picUserId ? body.picUserId : null,
    tags: Array.isArray(body.tags)
      ? (body.tags as unknown[])
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [],
    status: TASK_STATUSES.includes(str('status') as (typeof TASK_STATUSES)[number])
      ? str('status')
      : 'BELUM_MULAI',
    progressPct: Math.max(0, Math.min(100, Number(body.progressPct) || 0)),
    // Empat kategori urgensi (7 Sep 2026); yang tidak dikenal jatuh ke SEDANG.
    urgency: TASK_URGENCIES.includes(str('urgency') as (typeof TASK_URGENCIES)[number])
      ? str('urgency')
      : 'SEDANG',
    obstacle: str('obstacle') || null,
    decisionNeeded: str('decisionNeeded') || null,
    startAt,
    endAt,
    durationMin: startAt && endAt ? Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60000)) : null,
    subtasks: Array.isArray(body.subtasks)
      ? (body.subtasks as unknown[])
          .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : null))
          .filter((s): s is Record<string, unknown> => s !== null)
          .map((s, i) => ({
            title: typeof s.title === 'string' ? s.title.trim() : '',
            isDone: Boolean(s.isDone),
            position: i,
          }))
          .filter((s) => s.title)
          .slice(0, 30)
      : [],
  }
}

/**
 * Shared validation: the rules a task must satisfy to be saved. A picUserId
 * is checked against the user table here rather than left for the foreign key
 * to reject, which would surface as an opaque 500.
 */
async function validate(t: ReturnType<typeof readBody>, entityId: string): Promise<string[]> {
  const errors: string[] = []
  if (!t.title) errors.push('Judul task wajib diisi.')
  if (t.picUserId) {
    const pic = await db.user.findFirst({
      where: { id: t.picUserId, isActive: true, OR: [{ scopeEntityId: entityId }, { scopeEntityId: null }] },
      select: { id: true },
    })
    if (!pic) errors.push('PIC pelaksana tidak ditemukan atau berada di luar entitas ini.')
  }
  if (t.startAt && t.endAt && t.endAt <= t.startAt) {
    errors.push('Jam selesai harus setelah jam mulai.')
  }
  if (t.status === 'TERKENDALA' && !t.obstacle) {
    errors.push('Uraian kendala wajib diisi untuk status Terkendala.')
  }
  if (t.status === 'MENUNGGU_KEPUTUSAN' && !t.decisionNeeded) {
    errors.push('Keputusan yang dibutuhkan wajib diisi.')
  }
  return errors
}

const TASK_INCLUDE = {
  subtasks: { orderBy: { position: 'asc' } },
  picUser: { select: { id: true, name: true } },
  escalation: { select: { id: true, status: true, needed: true, decisionText: true } },
} as const

/** Where-clause for the lane a card sits in: one day, or the week's "Mingguan" lane. */
function laneWhere(projectId: string, scope: TaskScope, workDate: Date, period: Period | null) {
  return scope === 'MINGGUAN' && period
    ? { projectId, scope, workDate: { gte: period.start, lte: period.end } }
    : { projectId, scope, workDate }
}

async function nextSortOrder(where: ReturnType<typeof laneWhere>) {
  const last = await db.task.aggregate({ where, _max: { sortOrder: true } })
  return (last._max.sortOrder ?? -1) + 1
}

async function attachEvidence<T extends { id: string }>(tasks: T[]) {
  const evidence = await db.evidence.findMany({
    where: { targetType: 'TASK', targetId: { in: tasks.map((t) => t.id) } },
    select: { id: true, targetId: true, fileName: true, url: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return tasks.map((t) => ({ ...t, evidence: evidence.filter((e) => e.targetId === t.id) }))
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const projectId = req.nextUrl.searchParams.get('projectId') || ''
  const guard = await guardProject(user, projectId)
  if (!guard.ok) return guard.res

  // Papan mingguan: seluruh task minggu itu, kedua cakupan, urut per hari lalu urutan kartu.
  const weekKey = req.nextUrl.searchParams.get('week')
  if (weekKey) {
    const period = parseWeekKey(weekKey)
    if (!period) return NextResponse.json({ error: 'Kunci minggu tidak dikenali' }, { status: 400 })

    const tasks = await db.task.findMany({
      where: { projectId, workDate: { gte: period.start, lte: period.end } },
      include: TASK_INCLUDE,
      orderBy: [{ workDate: 'asc' }, { sortOrder: 'asc' }, { startAt: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json({
      mode: 'MINGGUAN',
      period: {
        key: period.key,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        lockAt: weeklyDeadlines(period.start).lockAt.toISOString(),
        current: period.key === weekPeriodOf(new Date()).key,
      },
      locked: isWeeklyLocked(period.start),
      today: startOfWibDay(new Date()).toISOString(),
      days: daysOfWeek(period).map((d) => d.toISOString()),
      tasks: await attachEvidence(tasks),
    })
  }

  const dateParam = req.nextUrl.searchParams.get('date')
  const parsed = dateParam ? new Date(dateParam) : new Date()
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'Parameter tanggal tidak valid' }, { status: 400 })
  }
  const day = startOfWibDay(parsed)

  // Meja harian hanya memuat capaian hari itu; capaian bercakupan MINGGUAN
  // hidup di papan mingguan.
  const tasks = await db.task.findMany({
    where: { projectId, workDate: day, scope: 'HARIAN' },
    include: TASK_INCLUDE,
    orderBy: [{ sortOrder: 'asc' }, { startAt: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({
    workDate: day.toISOString(),
    locked: isDailyLocked(day),
    tasks: await attachEvidence(tasks),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const guard = await guardProject(user, projectId, { write: true })
  if (!guard.ok) return guard.res

  const context = contextOf(body.context)
  const today = startOfWibDay(new Date())
  let workDate = today
  let scope: TaskScope = 'HARIAN'
  let period: Period | null = null

  if (context === 'MINGGUAN') {
    period = typeof body.week === 'string' && body.week ? parseWeekKey(body.week) : weekPeriodOf(new Date())
    if (!period) return NextResponse.json({ error: 'Kunci minggu tidak dikenali' }, { status: 400 })
    scope = scopeOf(body.scope)
    const requested = parseWibDateKey(body.workDate)
    workDate = requested ?? (dayInPeriod(period, today) ? today : period.start)
    if (!dayInPeriod(period, workDate)) {
      return NextResponse.json({ error: 'Tanggal berada di luar minggu ini.' }, { status: 422 })
    }
  }

  const lockRes = lockCheck(context, workDate)
  if (lockRes) return lockRes

  const t = readBody(body, workDate)
  const errors = await validate(t, guard.project.entityId)
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 422 })

  const { subtasks, ...fields } = t
  const task = await db.task.create({
    data: {
      ...fields,
      projectId,
      entityId: guard.project.entityId,
      workDate,
      scope,
      sortOrder: await nextSortOrder(laneWhere(projectId, scope, workDate, period)),
      createdById: user.id,
      subtasks: { create: subtasks },
    },
    include: TASK_INCLUDE,
  })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'CREATE_TASK',
      targetType: 'TASK',
      targetId: task.id,
      afterData: JSON.stringify({ title: task.title, status: task.status, urgency: task.urgency, scope, context, subtasks: subtasks.length }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  await rollupDailyReport(projectId, workDate)

  return NextResponse.json({ ok: true, task })
}

export async function PUT(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const existing = await db.task.findUnique({ where: { id }, include: { subtasks: true } })
  if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 })

  const guard = await guardProject(user, existing.projectId, { write: true })
  if (!guard.ok) return guard.res

  const context = contextOf(body.context)
  const lockRes = lockCheck(context, existing.workDate)
  if (lockRes) return lockRes

  // Di papan mingguan kartu boleh pindah hari atau berubah cakupan, selama
  // tetap di minggu yang sama; di meja harian tanggalnya tetap.
  let workDate = startOfWibDay(existing.workDate)
  let scope = existing.scope as TaskScope
  const period = weekPeriodOf(existing.workDate)
  if (context === 'MINGGUAN') {
    const requested = parseWibDateKey(body.workDate)
    if (requested) {
      if (!dayInPeriod(period, requested)) {
        return NextResponse.json({ error: 'Tanggal berada di luar minggu ini.' }, { status: 422 })
      }
      workDate = requested
    }
    if (body.scope === 'HARIAN' || body.scope === 'MINGGUAN') scope = body.scope
  }

  const t = readBody(body, workDate)
  const errors = await validate(t, guard.project.entityId)
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 422 })

  const { subtasks, ...fields } = t
  const movedLane = workDate.getTime() !== existing.workDate.getTime() || scope !== existing.scope
  const sortOrder = movedLane
    ? await nextSortOrder(laneWhere(existing.projectId, scope, workDate, period))
    : existing.sortOrder

  // Subtasks are sent whole, so replace the list rather than diffing it.
  const task = await db.$transaction(async (tx) => {
    await tx.subtask.deleteMany({ where: { taskId: id } })
    return tx.task.update({
      where: { id },
      data: { ...fields, workDate, scope, sortOrder, subtasks: { create: subtasks } },
      include: TASK_INCLUDE,
    })
  })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'UPDATE_TASK',
      targetType: 'TASK',
      targetId: id,
      beforeData: JSON.stringify({ status: existing.status, progressPct: existing.progressPct, workDate: existing.workDate, scope: existing.scope }),
      afterData: JSON.stringify({ status: task.status, progressPct: task.progressPct, workDate, scope, context }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  await rollupDailyReport(existing.projectId, startOfWibDay(existing.workDate))
  if (movedLane) await rollupDailyReport(existing.projectId, workDate)

  return NextResponse.json({ ok: true, task })
}

/**
 * PATCH — seret-lepas di papan mingguan. Setiap `move` menyebut kartu, lajur
 * tujuannya ("MINGGUAN" atau tanggal "YYYY-MM-DD" di minggu itu) dan urutan
 * barunya. Semua kartu harus milik proyek dan minggu yang sama; minggu yang
 * sudah terkunci tidak bisa disusun ulang.
 */
export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const guard = await guardProject(user, projectId, { write: true })
  if (!guard.ok) return guard.res

  const period = typeof body.week === 'string' && body.week ? parseWeekKey(body.week) : weekPeriodOf(new Date())
  if (!period) return NextResponse.json({ error: 'Kunci minggu tidak dikenali' }, { status: 400 })
  if (isWeeklyLocked(period.start)) {
    return NextResponse.json({ error: `Minggu ini sudah dikunci (${WEEKLY_LOCK_LABEL}).`, locked: true }, { status: 409 })
  }

  const moves = Array.isArray(body.moves)
    ? (body.moves as unknown[])
        .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : null))
        .filter((m): m is Record<string, unknown> => m !== null && typeof m.id === 'string')
        .slice(0, 200)
    : []
  if (moves.length === 0) return NextResponse.json({ error: 'Tidak ada kartu yang dipindahkan' }, { status: 422 })

  const ids = moves.map((m) => m.id as string)
  const tasks = await db.task.findMany({
    where: { id: { in: ids }, projectId, workDate: { gte: period.start, lte: period.end } },
    select: { id: true, workDate: true, scope: true },
  })
  if (tasks.length !== new Set(ids).size) {
    return NextResponse.json({ error: 'Ada kartu yang bukan milik minggu ini.' }, { status: 422 })
  }
  const byId = new Map(tasks.map((t) => [t.id, t]))

  const updates: { id: string; workDate: Date; scope: TaskScope; sortOrder: number }[] = []
  for (const m of moves) {
    const current = byId.get(m.id as string)!
    const lane = typeof m.lane === 'string' ? m.lane : ''
    let workDate = startOfWibDay(current.workDate)
    let scope: TaskScope = 'HARIAN'
    if (lane === 'MINGGUAN') {
      scope = 'MINGGUAN'
    } else {
      const day = parseWibDateKey(lane)
      if (!day || !dayInPeriod(period, day)) {
        return NextResponse.json({ error: 'Lajur tujuan berada di luar minggu ini.' }, { status: 422 })
      }
      workDate = day
    }
    updates.push({ id: current.id, workDate, scope, sortOrder: Math.max(0, Math.floor(Number(m.sortOrder) || 0)) })
  }

  await db.$transaction(
    updates.map((u) =>
      db.task.update({ where: { id: u.id }, data: { workDate: u.workDate, scope: u.scope, sortOrder: u.sortOrder } })
    )
  )

  // Hari asal dan hari tujuan sama-sama berubah isinya, jadi keduanya dihitung ulang.
  const touched = new Set<number>()
  for (const u of updates) {
    touched.add(startOfWibDay(byId.get(u.id)!.workDate).getTime())
    touched.add(u.workDate.getTime())
  }
  for (const ms of touched) await rollupDailyReport(projectId, new Date(ms))

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'REORDER_TASKS',
      targetType: 'PROJECT',
      targetId: projectId,
      afterData: JSON.stringify({ week: period.key, moves: updates.length }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  return NextResponse.json({ ok: true, moved: updates.length })
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const id = req.nextUrl.searchParams.get('id') || ''
  const existing = await db.task.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 })

  const guard = await guardProject(user, existing.projectId, { write: true })
  if (!guard.ok) return guard.res

  const lockRes = lockCheck(contextOf(req.nextUrl.searchParams.get('context')), existing.workDate)
  if (lockRes) return lockRes
  if (existing.escalationId) {
    return NextResponse.json(
      { error: 'Task yang sudah dieskalasi tidak dapat dihapus.' },
      { status: 409 }
    )
  }

  await db.evidence.deleteMany({ where: { targetType: 'TASK', targetId: id } })
  await db.task.delete({ where: { id } })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'DELETE_TASK',
      targetType: 'TASK',
      targetId: id,
      beforeData: JSON.stringify({ title: existing.title, status: existing.status, workDate: existing.workDate, scope: existing.scope }),
    },
  })

  await rollupDailyReport(existing.projectId, startOfWibDay(existing.workDate))

  return NextResponse.json({ ok: true })
}
