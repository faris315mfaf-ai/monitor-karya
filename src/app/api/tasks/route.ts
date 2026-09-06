import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { DAILY_CUTOFF_LABEL, TASK_STATUSES, isDailyLocked, startOfWibDay } from '@/lib/lock'
import { rollupDailyReport } from '@/lib/daily-rollup'

/**
 * Daily tasks — the granular work a PIC plans and reports under one project.
 *
 *   GET  ?projectId= &date=  — tasks for a project on a WIB day
 *   POST                     — create a task (with its subtasks)
 *   PUT                      — update a task (replaces its subtask list)
 *   DELETE ?id=              — remove a task
 *
 * Everything is gated on owning the project and on the day not being locked,
 * the same rules the daily report itself follows.
 */

type Guard = { ok: true; project: { id: string; entityId: string } } | { ok: false; res: NextResponse }

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
      : user.role === 'TI'
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

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const projectId = req.nextUrl.searchParams.get('projectId') || ''
  const dateParam = req.nextUrl.searchParams.get('date')
  const parsed = dateParam ? new Date(dateParam) : new Date()
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'Parameter tanggal tidak valid' }, { status: 400 })
  }
  const day = startOfWibDay(parsed)

  const guard = await guardProject(user, projectId)
  if (!guard.ok) return guard.res

  const tasks = await db.task.findMany({
    where: { projectId, workDate: day },
    include: TASK_INCLUDE,
    orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
  })

  const evidence = await db.evidence.findMany({
    where: { targetType: 'TASK', targetId: { in: tasks.map((t) => t.id) } },
    select: { id: true, targetId: true, fileName: true, url: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    workDate: day.toISOString(),
    locked: isDailyLocked(day),
    tasks: tasks.map((t) => ({ ...t, evidence: evidence.filter((e) => e.targetId === t.id) })),
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

  const day = startOfWibDay(new Date())
  if (isDailyLocked(day)) {
    return NextResponse.json(
      { error: `Hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}.`, locked: true },
      { status: 409 }
    )
  }

  const t = readBody(body, day)
  const errors = await validate(t, guard.project.entityId)
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 422 })

  const { subtasks, ...fields } = t
  const task = await db.task.create({
    data: {
      ...fields,
      projectId,
      entityId: guard.project.entityId,
      workDate: day,
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
      afterData: JSON.stringify({ title: task.title, status: task.status, subtasks: subtasks.length }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  await rollupDailyReport(projectId, day)

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

  if (isDailyLocked(existing.workDate)) {
    return NextResponse.json(
      { error: 'Task ini sudah dikunci dan tidak dapat diubah.', locked: true },
      { status: 409 }
    )
  }

  const t = readBody(body, startOfWibDay(existing.workDate))
  const errors = await validate(t, guard.project.entityId)
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 422 })

  const { subtasks, ...fields } = t

  // Subtasks are sent whole, so replace the list rather than diffing it.
  const task = await db.$transaction(async (tx) => {
    await tx.subtask.deleteMany({ where: { taskId: id } })
    return tx.task.update({
      where: { id },
      data: { ...fields, subtasks: { create: subtasks } },
      include: TASK_INCLUDE,
    })
  })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'UPDATE_TASK',
      targetType: 'TASK',
      targetId: id,
      beforeData: JSON.stringify({ status: existing.status, progressPct: existing.progressPct }),
      afterData: JSON.stringify({ status: task.status, progressPct: task.progressPct }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  await rollupDailyReport(existing.projectId, startOfWibDay(existing.workDate))

  return NextResponse.json({ ok: true, task })
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const id = req.nextUrl.searchParams.get('id') || ''
  const existing = await db.task.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 })

  const guard = await guardProject(user, existing.projectId, { write: true })
  if (!guard.ok) return guard.res

  if (isDailyLocked(existing.workDate)) {
    return NextResponse.json({ error: 'Task ini sudah dikunci.', locked: true }, { status: 409 })
  }
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
      beforeData: JSON.stringify({ title: existing.title, status: existing.status }),
    },
  })

  await rollupDailyReport(existing.projectId, startOfWibDay(existing.workDate))

  return NextResponse.json({ ok: true })
}
