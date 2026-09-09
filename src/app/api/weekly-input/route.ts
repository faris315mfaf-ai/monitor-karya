import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { can, isMasterRole } from '@/lib/rbac'
import {
  WEEKLY_LOCK_LABEL,
  dayInPeriod,
  daysOfWeek,
  isoWeekOf,
  isWeeklyLocked,
  parseWeekKey,
  parseWibDateKey,
  periodOf,
  validateWeeklyItem,
  weekPeriodOf,
  weeklyDeadlines,
  type Period,
} from '@/lib/lock'
import { removeEvidence, storageConfigured } from '@/lib/storage'

/**
 * The weekly division desk — since 8 Sep 2026 a board of the week's
 * achievements per day, plus a "Mingguan" lane for achievements without a
 * particular day.
 *
 *   GET    ?entityId= &week=   — the division(s) the account answers for, with
 *                                 that week's report. Admin PT is pinned to their
 *                                 entity; TI may pick any PT.
 *   PUT    — add or update one work item (status, capaian, kendala, tindak
 *            lanjut, prioritas, hari pengerjaan).
 *   PATCH  — move / reorder cards between days.
 *   POST   — hand over to Admin PT ("submit") or sign off ("approve").
 *   DELETE ?itemId=            — remove one item.
 *
 * A head of division sees the division they lead; an Admin PT sees every
 * division of their entity, since they compile the bundle that goes upward.
 * Only the running week can be written to; earlier weeks are read back as-is.
 */

const WEEKS_SHOWN = 8

/** The PT entities this account may file a division report for. */
async function reportableEntities(user: SessionUser) {
  const select = { id: true, code: true, name: true }
  if (isMasterRole(user.role)) {
    return db.entity.findMany({ where: { type: 'PT', isActive: true }, select, orderBy: { name: 'asc' } })
  }
  if (user.role === 'KEPALA_DIVISI') {
    const divisions = await db.division.findMany({
      where: { headUserId: user.id, isActive: true },
      select: { entity: { select } },
    })
    const seen = new Map(divisions.map((d) => [d.entity.id, d.entity]))
    return Array.from(seen.values())
  }
  if (!user.scopeEntityId) return []
  const own = await db.entity.findUnique({ where: { id: user.scopeEntityId }, select })
  return own ? [own] : []
}

async function visibleDivisions(user: SessionUser, entityId: string | null) {
  const include = { divisionType: { select: { name: true } }, headUser: { select: { id: true, name: true } } }
  if (user.role === 'KEPALA_DIVISI') {
    return db.division.findMany({
      where: { headUserId: user.id, isActive: true, ...(entityId ? { entityId } : {}) },
      include,
      orderBy: { name: 'asc' },
    })
  }
  if (!entityId) return []
  return db.division.findMany({ where: { entityId, isActive: true }, include, orderBy: { name: 'asc' } })
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

const ITEM_INCLUDE = {
  aspectCategory: { select: { id: true, code: true, name: true } },
  priority: { select: { id: true, code: true, name: true } },
  subtasks: { orderBy: { position: 'asc' } },
} as const

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'weekly:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input mingguan' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const current = weekPeriodOf(new Date())
  const period = sp.get('week') ? parseWeekKey(sp.get('week') as string) : current
  if (!period) return NextResponse.json({ error: 'Kunci minggu tidak dikenali' }, { status: 400 })

  const { isoYear, isoWeek } = isoWeekOf(period.start)
  const deadlines = weeklyDeadlines(period.start)

  const entities = await reportableEntities(user)
  const requested = sp.get('entityId')
  // Peran berlingkup terpaku pada entitasnya; TI memilih dari daftar.
  const entity =
    isMasterRole(user.role) ? (entities.find((e) => e.id === requested) ?? entities[0] ?? null) : (entities[0] ?? null)
  const divisions = await visibleDivisions(user, entity?.id ?? null)

  const reports = await db.weeklyDivisionReport.findMany({
    where: { divisionId: { in: divisions.map((d) => d.id) }, isoYear, isoWeek },
    include: {
      items: { include: ITEM_INCLUDE, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
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

  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => periodOf('MINGGUAN', i)).map((p) => ({
    key: p.key,
    start: p.start.toISOString(),
    end: p.end.toISOString(),
    current: p.key === current.key,
  }))

  return NextResponse.json({
    week: {
      key: period.key,
      isoYear,
      isoWeek,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      handoverBy: deadlines.handoverBy.toISOString(),
      lockAt: deadlines.lockAt.toISOString(),
      current: period.key === current.key,
    },
    // Bentuk lama tetap dikirim agar pembaca lain tidak berubah.
    isoYear,
    isoWeek,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    handoverBy: deadlines.handoverBy.toISOString(),
    lockAt: deadlines.lockAt.toISOString(),
    locked: isWeeklyLocked(period.start),
    days: daysOfWeek(period).map((d) => d.toISOString()),
    weeks,
    entities,
    entityId: entity?.id ?? null,
    entityPinned: !isMasterRole(user.role),
    aspects,
    priorities,
    canApprove: can(user.role, 'weekly:approve'),
    canRemind: can(user.role, 'notify:remind'),
    divisions: divisions.map((d) => {
      const report = byDivision.get(d.id) ?? null
      return {
        id: d.id,
        name: d.name,
        type: d.divisionType.name,
        headName: d.headUser?.name ?? null,
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

/** Guard shared by the writers: the division must belong to this account. */
async function assertOwnsDivision(user: SessionUser, divisionId: string) {
  const division = await db.division.findUnique({ where: { id: divisionId } })
  if (!division) return { error: NextResponse.json({ error: 'Divisi tidak ditemukan' }, { status: 404 }) }

  const owns =
    user.role === 'KEPALA_DIVISI'
      ? division.headUserId === user.id
      : isMasterRole(user.role)
        ? true
        : division.entityId === user.scopeEntityId
  if (!owns) {
    return { error: NextResponse.json({ error: 'Divisi ini bukan tanggung jawab Anda' }, { status: 403 }) }
  }
  return { division }
}

/** Only the running week is writable; the 409 to send otherwise. */
function assertCurrentWeek(weekKey: unknown): { period: Period } | { error: NextResponse } {
  const current = weekPeriodOf(new Date())
  if (typeof weekKey === 'string' && weekKey && weekKey !== current.key) {
    return {
      error: NextResponse.json(
        { error: 'Hanya minggu berjalan yang bisa diisi. Minggu lain hanya dibaca.', locked: true },
        { status: 409 }
      ),
    }
  }
  if (isWeeklyLocked(current.start)) {
    return {
      error: NextResponse.json(
        { error: `Minggu ini sudah dikunci (${WEEKLY_LOCK_LABEL}). Ajukan permohonan buka kunci.`, locked: true },
        { status: 409 }
      ),
    }
  }
  return { period: current }
}

/** Editing after a hand-over pulls the report back to draft. */
async function backToDraft(report: { id: string; statusHeader: string }) {
  if (report.statusHeader === 'DRAFT') return
  await db.weeklyDivisionReport.update({
    where: { id: report.id },
    data: { statusHeader: 'DRAFT', submittedAt: null, submittedById: null, approvedAt: null, approvedById: null },
  })
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

  const week = assertCurrentWeek(body.week)
  if ('error' in week) return week.error

  const report = await ensureReport(division.id, division.entityId)
  if (report.isLocked || report.statusHeader === 'TERKUNCI') {
    return NextResponse.json({ error: 'Laporan minggu ini sudah dikunci', locked: true }, { status: 409 })
  }

  const existing = itemId
    ? await db.weeklyReportItem.findFirst({ where: { id: itemId, weeklyReportId: report.id } })
    : null
  if (itemId && !existing) {
    return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })
  }

  // Hari pengerjaan: null = lajur "Mingguan". Tidak dikirim = pertahankan yang ada.
  let workDate: Date | null = existing?.workDate ?? null
  if (body.workDate !== undefined) {
    if (body.workDate === null || body.workDate === '') workDate = null
    else {
      const parsed = parseWibDateKey(body.workDate)
      if (!parsed || !dayInPeriod(week.period, parsed)) {
        return NextResponse.json({ error: 'Hari pengerjaan berada di luar minggu ini.' }, { status: 422 })
      }
      workDate = parsed
    }
  }

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '')
  const payload = {
    workItem: str('workItem'),
    targetOutput: str('targetOutput'),
    picName: str('picName'),
    picTitle: str('picTitle') || str('picName'),
    status: str('status'),
    achievementThisWeek: str('achievementThisWeek'),
    obstacleFollowUp: str('obstacleFollowUp').trim() || null,
    followUp: str('followUp').trim() || null,
    progressPct: Math.max(0, Math.min(100, Number(body.progressPct) || 0)),
    aspectCategoryId: str('aspectCategoryId'),
    priorityId: str('priorityId'),
    targetDate: parseDate(body.targetDate),
    workDate,
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
  if (payload.status === 'TERKENDALA' && !payload.obstacleFollowUp) {
    return NextResponse.json({ error: 'Kendala wajib diisi untuk status Terkendala' }, { status: 422 })
  }

  const evidenceCount = existing
    ? await db.evidence.count({ where: { targetType: 'WEEKLY_ITEM', targetId: existing.id } })
    : 0

  // Kartu yang pindah lajur jatuh ke urutan paling bawah lajur barunya.
  const laneChanged = !existing || (existing.workDate?.getTime() ?? null) !== (workDate?.getTime() ?? null)
  const position = laneChanged
    ? ((await db.weeklyReportItem.aggregate({ where: { weeklyReportId: report.id, workDate }, _max: { position: true } }))
        ._max.position ?? -1) + 1
    : existing!.position

  const item = existing
    ? await db.$transaction(async (tx) => {
        await tx.subtask.deleteMany({ where: { weeklyItemId: existing.id } })
        return tx.weeklyReportItem.update({
          where: { id: existing.id },
          data: {
            ...payload,
            position,
            evidenceCount,
            needsEscalation: payload.status === 'TERKENDALA',
            subtasks: { create: subtasks },
          },
        })
      })
    : await db.weeklyReportItem.create({
        data: {
          ...payload,
          position,
          weeklyReportId: report.id,
          evidenceCount: 0,
          needsEscalation: payload.status === 'TERKENDALA',
          subtasks: { create: subtasks },
        },
      })

  await backToDraft(report)

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: existing ? 'UPDATE_WEEKLY_ITEM' : 'CREATE_WEEKLY_ITEM',
      targetType: 'WEEKLY_ITEM',
      targetId: item.id,
      beforeData: existing
        ? JSON.stringify({ status: existing.status, progressPct: existing.progressPct, workDate: existing.workDate })
        : null,
      afterData: JSON.stringify({ status: item.status, progressPct: item.progressPct, workDate: item.workDate }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json({ ok: true, reportId: report.id, itemId: item.id })
}

/**
 * PATCH — seret-lepas di papan divisi. Setiap `move` menyebut item, hari
 * tujuannya ("YYYY-MM-DD" di minggu berjalan, atau null untuk lajur Mingguan)
 * dan urutannya. Menyusun ulang tidak menarik laporan kembali ke draft: isinya
 * tidak berubah, hanya letaknya.
 */
export async function PATCH(req: NextRequest) {
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
  const guard = await assertOwnsDivision(user, divisionId)
  if (guard.error) return guard.error
  const division = guard.division!

  const week = assertCurrentWeek(body.week)
  if ('error' in week) return week.error

  const report = await ensureReport(division.id, division.entityId)
  if (report.isLocked || report.statusHeader === 'TERKUNCI') {
    return NextResponse.json({ error: 'Laporan minggu ini sudah dikunci', locked: true }, { status: 409 })
  }

  const moves = Array.isArray(body.moves)
    ? (body.moves as unknown[])
        .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : null))
        .filter((m): m is Record<string, unknown> => m !== null && typeof m.itemId === 'string')
        .slice(0, 200)
    : []
  if (moves.length === 0) return NextResponse.json({ error: 'Tidak ada kartu yang dipindahkan' }, { status: 422 })

  const ids = moves.map((m) => m.itemId as string)
  const owned = await db.weeklyReportItem.findMany({
    where: { id: { in: ids }, weeklyReportId: report.id },
    select: { id: true },
  })
  if (owned.length !== new Set(ids).size) {
    return NextResponse.json({ error: 'Ada kartu yang bukan milik laporan ini.' }, { status: 422 })
  }

  const updates: { id: string; workDate: Date | null; position: number }[] = []
  for (const m of moves) {
    let workDate: Date | null = null
    if (m.workDate !== null && m.workDate !== undefined && m.workDate !== '') {
      const day = parseWibDateKey(m.workDate)
      if (!day || !dayInPeriod(week.period, day)) {
        return NextResponse.json({ error: 'Hari tujuan berada di luar minggu ini.' }, { status: 422 })
      }
      workDate = day
    }
    updates.push({ id: m.itemId as string, workDate, position: Math.max(0, Math.floor(Number(m.position) || 0)) })
  }

  await db.$transaction(
    updates.map((u) =>
      db.weeklyReportItem.update({ where: { id: u.id }, data: { workDate: u.workDate, position: u.position } })
    )
  )

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'REORDER_WEEKLY_ITEMS',
      targetType: 'WEEKLY_REPORT',
      targetId: report.id,
      afterData: JSON.stringify({ week: week.period.key, moves: updates.length }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  return NextResponse.json({ ok: true, moved: updates.length })
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'weekly:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input mingguan' }, { status: 403 })
  }

  const itemId = req.nextUrl.searchParams.get('itemId') || ''
  const existing = await db.weeklyReportItem.findUnique({
    where: { id: itemId },
    include: {
      weeklyReport: { select: { id: true, divisionId: true, periodStart: true, statusHeader: true, isLocked: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Item tidak ditemukan' }, { status: 404 })

  const guard = await assertOwnsDivision(user, existing.weeklyReport.divisionId)
  if (guard.error) return guard.error

  const report = existing.weeklyReport
  if (report.isLocked || report.statusHeader === 'TERKUNCI' || isWeeklyLocked(report.periodStart)) {
    return NextResponse.json({ error: 'Minggu ini sudah dikunci; item tidak dapat dihapus.', locked: true }, { status: 409 })
  }
  const raised = await db.escalation.count({ where: { sourceType: 'WEEKLY_ITEM', sourceId: itemId } })
  if (raised > 0) {
    return NextResponse.json({ error: 'Item yang sudah dieskalasi tidak dapat dihapus.' }, { status: 409 })
  }

  // Lampirannya ikut dihapus — dari penyimpanan dulu, lalu barisnya.
  const files = await db.evidence.findMany({ where: { targetType: 'WEEKLY_ITEM', targetId: itemId } })
  if (storageConfigured()) {
    for (const f of files) {
      if (!f.url) {
        try {
          await removeEvidence(f.storageKey)
        } catch {
          // Objek yang sudah hilang tidak boleh menggagalkan penghapusan item.
        }
      }
    }
  }
  await db.evidence.deleteMany({ where: { targetType: 'WEEKLY_ITEM', targetId: itemId } })
  await db.weeklyReportItem.delete({ where: { id: itemId } })
  await backToDraft(report)

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'DELETE_WEEKLY_ITEM',
      targetType: 'WEEKLY_ITEM',
      targetId: itemId,
      beforeData: JSON.stringify({ workItem: existing.workItem, status: existing.status, workDate: existing.workDate }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  return NextResponse.json({ ok: true })
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

  const week = assertCurrentWeek(body.week)
  if ('error' in week) return week.error

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
