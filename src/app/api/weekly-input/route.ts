import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { isoWeekOf, isWeeklyLocked, validateWeeklyItem, weeklyDeadlines } from '@/lib/lock'

/**
 * The weekly division desk.
 *
 *   GET  — this week's report for the division(s) the account answers for.
 *   PUT  — add or update one work item.
 *   POST — hand over to Admin PT ("submit") or sign off ("approve").
 *
 * A head of division sees the division they lead; an Admin PT sees every
 * division of their entity, since they compile the bundle that goes upward.
 */

async function visibleDivisions(user: SessionUser) {
  if (user.role === 'KEPALA_DIVISI') {
    return db.division.findMany({
      where: { headUserId: user.id, isActive: true },
      include: { divisionType: { select: { name: true } } },
      orderBy: { name: 'asc' },
    })
  }
  if (user.role === 'TI') {
    return db.division.findMany({
      where: { isActive: true },
      include: { divisionType: { select: { name: true } } },
      orderBy: { name: 'asc' },
    })
  }
  if (!user.scopeEntityId) return []
  return db.division.findMany({
    where: { entityId: user.scopeEntityId, isActive: true },
    include: { divisionType: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
}

async function ensureReport(divisionId: string, entityId: string) {
  const now = new Date()
  const { isoYear, isoWeek } = isoWeekOf(now)
  const { periodStart, periodEnd } = weeklyDeadlines(now)

  const existing = await db.weeklyDivisionReport.findUnique({
    where: { divisionId_isoYear_isoWeek: { divisionId, isoYear, isoWeek } },
  })
  if (existing) return existing

  return db.weeklyDivisionReport.create({
    data: {
      divisionId,
      entityId,
      isoYear,
      isoWeek,
      periodStart,
      periodEnd,
      statusHeader: 'DRAFT',
    },
  })
}

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'weekly:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input mingguan' }, { status: 403 })
  }

  const now = new Date()
  const { isoYear, isoWeek } = isoWeekOf(now)
  const deadlines = weeklyDeadlines(now)
  const divisions = await visibleDivisions(user)

  const reports = await db.weeklyDivisionReport.findMany({
    where: { divisionId: { in: divisions.map((d) => d.id) }, isoYear, isoWeek },
    include: {
      items: {
        include: {
          aspectCategory: { select: { id: true, code: true, name: true } },
          priority: { select: { id: true, code: true, name: true } },
          subtasks: { orderBy: { position: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  const byDivision = new Map(reports.map((r) => [r.divisionId, r]))

  // Evidence lives in its own table keyed by target id, so fetch it in one go
  // and hang it off each item.
  const itemIds = reports.flatMap((r) => r.items.map((i) => i.id))
  const evidence = await db.evidence.findMany({
    where: { targetType: 'WEEKLY_ITEM', targetId: { in: itemIds } },
    select: { id: true, targetId: true, fileName: true, url: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // Which items already went up, so the UI does not offer to raise them twice.
  const raised = await db.escalation.findMany({
    where: { sourceType: 'WEEKLY_ITEM', sourceId: { in: itemIds } },
    select: { sourceId: true },
  })
  const raisedIds = new Set(raised.map((r) => r.sourceId))

  const [aspects, priorities] = await Promise.all([
    db.aspectCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    db.priority.findMany({ orderBy: { weight: 'desc' } }),
  ])

  return NextResponse.json({
    isoYear,
    isoWeek,
    periodStart: deadlines.periodStart.toISOString(),
    periodEnd: deadlines.periodEnd.toISOString(),
    handoverBy: deadlines.handoverBy.toISOString(),
    lockAt: deadlines.lockAt.toISOString(),
    locked: isWeeklyLocked(deadlines.periodStart),
    aspects,
    priorities,
    canApprove: can(user.role, 'weekly:approve'),
    divisions: divisions.map((d) => {
      const report = byDivision.get(d.id) ?? null
      return {
        id: d.id,
        name: d.name,
        type: d.divisionType.name,
        report: report
          ? {
              id: report.id,
              statusHeader: report.statusHeader,
              submittedAt: report.submittedAt,
              approvedAt: report.approvedAt,
              forwardedAt: report.forwardedAt,
              isLocked: report.isLocked,
              items: report.items.map((i) => ({
                ...i,
                evidence: evidence.filter((e) => e.targetId === i.id),
                escalationRaised: raisedIds.has(i.id),
              })),
            }
          : null,
      }
    }),
  })
}

/** An ISO date from the client, or null when absent or unreadable — an
 *  Invalid Date would otherwise surface as a 500 from Prisma. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Guard shared by PUT and POST: the division must belong to this account. */
async function assertOwnsDivision(user: SessionUser, divisionId: string) {
  const division = await db.division.findUnique({ where: { id: divisionId } })
  if (!division) return { error: NextResponse.json({ error: 'Divisi tidak ditemukan' }, { status: 404 }) }

  const owns =
    user.role === 'KEPALA_DIVISI'
      ? division.headUserId === user.id
      : user.role === 'TI'
        ? true
        : division.entityId === user.scopeEntityId
  if (!owns) {
    return { error: NextResponse.json({ error: 'Divisi ini bukan tanggung jawab Anda' }, { status: 403 }) }
  }
  return { division }
}

export async function PUT(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'weekly:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input mingguan' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const divisionId = typeof body.divisionId === 'string' ? body.divisionId : ''
  const itemId = typeof body.itemId === 'string' ? body.itemId : null
  const guard = await assertOwnsDivision(user, divisionId)
  if (guard.error) return guard.error
  const division = guard.division!

  const { periodStart } = weeklyDeadlines(new Date())
  if (isWeeklyLocked(periodStart)) {
    return NextResponse.json(
      { error: 'Minggu ini sudah dikunci. Ajukan permohonan buka kunci.', locked: true },
      { status: 409 }
    )
  }

  const report = await ensureReport(division.id, division.entityId)
  if (report.isLocked || report.statusHeader === 'TERKUNCI') {
    return NextResponse.json({ error: 'Laporan minggu ini sudah dikunci', locked: true }, { status: 409 })
  }

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '')
  const payload = {
    workItem: str('workItem'),
    targetOutput: str('targetOutput'),
    picName: str('picName'),
    picTitle: str('picTitle') || str('picName'),
    status: str('status'),
    achievementThisWeek: str('achievementThisWeek'),
    obstacleFollowUp: str('obstacleFollowUp') || null,
    progressPct: Math.max(0, Math.min(100, Number(body.progressPct) || 0)),
    aspectCategoryId: str('aspectCategoryId'),
    priorityId: str('priorityId'),
    targetDate: parseDate(body.targetDate),
    tags: Array.isArray(body.tags)
      ? (body.tags as unknown[])
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [],
  }

  // Sent whole, so the list is replaced rather than diffed.
  const subtasks = Array.isArray(body.subtasks)
    ? (body.subtasks as unknown[])
        .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
        .filter((x): x is Record<string, unknown> => x !== null)
        .map((x, i) => ({
          title: typeof x.title === 'string' ? x.title.trim() : '',
          isDone: Boolean(x.isDone),
          position: i,
        }))
        .filter((x) => x.title)
        .slice(0, 30)
    : []

  if (!payload.aspectCategoryId || !payload.priorityId) {
    return NextResponse.json({ error: 'Aspek dan prioritas wajib dipilih' }, { status: 422 })
  }
  if (!payload.workItem.trim() || !payload.status) {
    return NextResponse.json({ error: 'Uraian pekerjaan dan status wajib diisi' }, { status: 422 })
  }

  const existing = itemId
    ? await db.weeklyReportItem.findFirst({ where: { id: itemId, weeklyReportId: report.id } })
    : null
  if (itemId && !existing) {
    return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })
  }

  const evidenceCount = existing
    ? await db.evidence.count({ where: { targetType: 'WEEKLY_ITEM', targetId: existing.id } })
    : 0

  const item = existing
    ? await db.$transaction(async (tx) => {
        await tx.subtask.deleteMany({ where: { weeklyItemId: existing.id } })
        return tx.weeklyReportItem.update({
          where: { id: existing.id },
          data: {
            ...payload,
            evidenceCount,
            needsEscalation: payload.status === 'TERKENDALA',
            subtasks: { create: subtasks },
          },
        })
      })
    : await db.weeklyReportItem.create({
        data: {
          ...payload,
          weeklyReportId: report.id,
          evidenceCount: 0,
          needsEscalation: payload.status === 'TERKENDALA',
          subtasks: { create: subtasks },
        },
      })

  // Editing after a hand-over pulls the report back to draft.
  if (report.statusHeader !== 'DRAFT') {
    await db.weeklyDivisionReport.update({
      where: { id: report.id },
      data: { statusHeader: 'DRAFT', submittedAt: null, submittedById: null, approvedAt: null, approvedById: null },
    })
  }

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: existing ? 'UPDATE_WEEKLY_ITEM' : 'CREATE_WEEKLY_ITEM',
      targetType: 'WEEKLY_ITEM',
      targetId: item.id,
      beforeData: existing ? JSON.stringify({ status: existing.status, progressPct: existing.progressPct }) : null,
      afterData: JSON.stringify({ status: item.status, progressPct: item.progressPct }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json({ ok: true, reportId: report.id, itemId: item.id })
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

  const divisionId = typeof body.divisionId === 'string' ? body.divisionId : ''
  const action = body.action === 'approve' ? 'approve' : 'submit'

  if (action === 'submit' && !can(user.role, 'weekly:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak menyerahkan capaian mingguan' }, { status: 403 })
  }
  if (action === 'approve' && !can(user.role, 'weekly:approve')) {
    return NextResponse.json({ error: 'Peran Anda tidak menyetujui capaian mingguan' }, { status: 403 })
  }

  const guard = await assertOwnsDivision(user, divisionId)
  if (guard.error) return guard.error
  const division = guard.division!

  const { periodStart } = weeklyDeadlines(new Date())
  if (isWeeklyLocked(periodStart)) {
    return NextResponse.json({ error: 'Minggu ini sudah dikunci', locked: true }, { status: 409 })
  }

  const report = await ensureReport(division.id, division.entityId)
  const items = await db.weeklyReportItem.findMany({ where: { weeklyReportId: report.id } })

  if (items.length === 0) {
    return NextResponse.json({ error: 'Belum ada item pekerjaan untuk diserahkan' }, { status: 422 })
  }

  // Every item must pass validation before the bundle moves on.
  const problems: string[] = []
  for (const item of items) {
    const evidenceCount = await db.evidence.count({
      where: { targetType: 'WEEKLY_ITEM', targetId: item.id },
    })
    const errs = validateWeeklyItem({ ...item, evidenceCount })
    if (errs.length) problems.push(`${item.workItem}: ${errs[0]}`)
  }
  if (problems.length) {
    return NextResponse.json(
      { error: `${problems.length} item belum lolos validasi`, errors: problems },
      { status: 422 }
    )
  }

  const now = new Date()
  const updated =
    action === 'submit'
      ? await db.weeklyDivisionReport.update({
          where: { id: report.id },
          data: { statusHeader: 'MENUNGGU_PERSETUJUAN', submittedById: user.id, submittedAt: now },
        })
      : await db.weeklyDivisionReport.update({
          where: { id: report.id },
          data: {
            statusHeader: 'DISETUJUI',
            approvedById: user.id,
            approvedAt: now,
            // A genuine digest of what was approved and when, so the label is honest.
            approvalHash: `sha256:${createHash('sha256')
              .update(`${report.id}:${user.id}:${now.toISOString()}:${items.map((i) => i.id).sort().join(',')}`)
              .digest('hex')
              .slice(0, 32)}`,
          },
        })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: action === 'submit' ? 'SUBMIT_WEEKLY_REPORT' : 'APPROVE_WEEKLY',
      targetType: 'WEEKLY_REPORT',
      targetId: report.id,
      beforeData: JSON.stringify({ statusHeader: report.statusHeader }),
      afterData: JSON.stringify({ statusHeader: updated.statusHeader, items: items.length }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json({ ok: true, statusHeader: updated.statusHeader })
}
