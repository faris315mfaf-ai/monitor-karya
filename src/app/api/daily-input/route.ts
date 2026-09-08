import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import {
  DAILY_CUTOFF_LABEL,
  dailyCountdown,
  dailyLockAt,
  isDailyLocked,
  startOfWibDay,
  validateDailyReport,
} from '@/lib/lock'
import { computeRollup, rollupDailyReport } from '@/lib/daily-rollup'
import { removeEvidence, storageConfigured } from '@/lib/storage'

/**
 * The daily reporting desk.
 *
 *   GET  — the projects this account is responsible for, with today's report.
 *   PUT  — save a draft, or submit it for the Admin PT once it validates.
 *
 * A PIC sees only the projects assigned to them; an Admin PT sees every project
 * of their entity, because they enter data on the PIC's behalf when needed.
 */

async function visibleProjects(user: SessionUser) {
  if (user.role === 'PIC_PROYEK') {
    return db.project.findMany({
      where: { picUserId: user.id, lifecycle: 'AKTIF' },
      orderBy: { code: 'asc' },
    })
  }
  // TI is the master account and is not pinned to an entity.
  if (user.role === 'TI') {
    return db.project.findMany({ where: { lifecycle: 'AKTIF' }, orderBy: { code: 'asc' } })
  }
  if (!user.scopeEntityId) return []
  return db.project.findMany({
    where: { entityId: user.scopeEntityId, lifecycle: 'AKTIF' },
    orderBy: { code: 'asc' },
  })
}

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'daily:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input harian' }, { status: 403 })
  }

  const today = startOfWibDay(new Date())
  const projects = await visibleProjects(user)

  const reports = await db.dailyProjectReport.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, reportDate: today },
  })
  const byProject = new Map(reports.map((r) => [r.projectId, r]))

  // A project with tasks has its status and progress derived from them.
  const taskCounts = await db.task.groupBy({
    by: ['projectId'],
    where: { projectId: { in: projects.map((p) => p.id) }, workDate: today },
    _count: { _all: true },
  })
  const tasksByProject = new Map(taskCounts.map((t) => [t.projectId, t._count._all]))

  const evidences = await db.evidence.findMany({
    where: { targetType: 'DAILY_REPORT', targetId: { in: reports.map((r) => r.id) } },
    select: { id: true, targetId: true, fileName: true, url: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    reportDate: today.toISOString(),
    lockAt: dailyLockAt(today).toISOString(),
    locked: isDailyLocked(today),
    countdown: dailyCountdown(),
    projects: projects.map((p) => {
      const report = byProject.get(p.id) ?? null
      const taskCount = tasksByProject.get(p.id) ?? 0
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        phase: p.phase,
        taskCount,
        derived: taskCount > 0,
        report: report
          ? {
              id: report.id,
              status: report.status,
              progressPct: report.progressPct,
              achievementToday: report.achievementToday,
              obstacle: report.obstacle,
              followUp: report.followUp,
              decisionRequestedFrom: report.decisionRequestedFrom,
              evidenceCount: report.evidenceCount,
              submittedAt: report.submittedAt,
              forwardedAt: report.forwardedAt,
              isLocked: report.isLocked,
              evidence: evidences.filter((e) => e.targetId === report.id),
            }
          : null,
      }
    }),
  })
}

/**
 * DELETE ?projectId= — hapus laporan HARI INI selama belum dikunci dan belum
 * diteruskan Admin PT. Task harinya tidak ikut dihapus (mereka punya tombol
 * hapus sendiri); hanya laporan ringkasnya beserta lampiran di levelnya.
 */
export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'daily:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input harian' }, { status: 403 })
  }

  const projectId = req.nextUrl.searchParams.get('projectId') || ''
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 })

  const owns =
    user.role === 'PIC_PROYEK'
      ? project.picUserId === user.id
      : user.role === 'TI'
        ? true
        : project.entityId === user.scopeEntityId
  if (!owns) {
    return NextResponse.json({ error: 'Proyek ini bukan tanggung jawab Anda' }, { status: 403 })
  }

  const today = startOfWibDay(new Date())
  const existing = await db.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: today } },
  })
  if (!existing) return NextResponse.json({ error: 'Belum ada laporan hari ini' }, { status: 404 })
  if (existing.isLocked || isDailyLocked(today)) {
    return NextResponse.json({ error: 'Laporan hari ini sudah dikunci', locked: true }, { status: 409 })
  }
  if (existing.forwardedAt) {
    return NextResponse.json({ error: 'Laporan yang sudah diteruskan tidak dapat dihapus' }, { status: 409 })
  }

  const files = await db.evidence.findMany({ where: { targetType: 'DAILY_REPORT', targetId: existing.id } })
  if (storageConfigured()) {
    for (const f of files) {
      if (!f.url) {
        try {
          await removeEvidence(f.storageKey)
        } catch {
          // Objek yang sudah hilang tidak boleh menggagalkan penghapusan laporan.
        }
      }
    }
  }
  await db.evidence.deleteMany({ where: { targetType: 'DAILY_REPORT', targetId: existing.id } })
  await db.dailyProjectReport.delete({ where: { id: existing.id } })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'DELETE_DAILY_REPORT',
      targetType: 'DAILY_REPORT',
      targetId: existing.id,
      beforeData: JSON.stringify({ status: existing.status, progressPct: existing.progressPct }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'daily:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input harian' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const action = body.action === 'submit' ? 'submit' : 'save'
  const status = typeof body.status === 'string' ? body.status : ''
  const achievementToday = typeof body.achievementToday === 'string' ? body.achievementToday : ''
  const obstacle = typeof body.obstacle === 'string' ? body.obstacle : null
  const followUp = typeof body.followUp === 'string' ? body.followUp : null
  const decisionRequestedFrom =
    typeof body.decisionRequestedFrom === 'string' ? body.decisionRequestedFrom : null
  const progressPct = Math.max(0, Math.min(100, Number(body.progressPct) || 0))

  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 })

  const owns =
    user.role === 'PIC_PROYEK'
      ? project.picUserId === user.id
      : user.role === 'TI'
        ? true
        : project.entityId === user.scopeEntityId
  if (!owns) {
    return NextResponse.json({ error: 'Proyek ini bukan tanggung jawab Anda' }, { status: 403 })
  }

  const today = startOfWibDay(new Date())
  if (isDailyLocked(today)) {
    return NextResponse.json(
      {
        error: `Laporan hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}. Ajukan permohonan buka kunci.`,
        locked: true,
      },
      { status: 409 }
    )
  }

  const existing = await db.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: today } },
  })
  if (existing?.isLocked) {
    return NextResponse.json({ error: 'Laporan ini sudah dikunci', locked: true }, { status: 409 })
  }

  const evidenceCount = existing
    ? await db.evidence.count({
        where: { targetType: 'DAILY_REPORT', targetId: existing.id },
      })
    : 0

  // Once the day has tasks they are the source of truth: the report cannot
  // disagree with the work it summarises.
  const rollup = await computeRollup(projectId, today)
  const effectiveStatus = rollup ? rollup.status : status
  const effectiveProgress = rollup ? rollup.progressPct : progressPct
  const effectiveEvidence = rollup ? evidenceCount + rollup.evidenceCount : evidenceCount

  // A draft only needs the essentials; the full rule set applies on submit.
  const errors =
    action === 'submit'
      ? validateDailyReport({
          status: effectiveStatus,
          achievementToday,
          evidenceCount: effectiveEvidence,
          obstacle,
          followUp,
        })
      : !effectiveStatus || !achievementToday.trim()
        ? ['Status dan capaian hari ini wajib diisi.']
        : []

  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors, evidenceCount }, { status: 422 })
  }

  const needsEscalation = effectiveStatus === 'TERKENDALA' || effectiveStatus === 'MENUNGGU_KEPUTUSAN'
  const data = {
    status: effectiveStatus,
    progressPct: effectiveProgress,
    phase: project.phase,
    achievementToday,
    obstacle,
    followUp,
    decisionRequestedFrom,
    needsEscalation,
    evidenceCount: effectiveEvidence,
    ...(action === 'submit' ? { submittedById: user.id, submittedAt: new Date() } : {}),
  }

  const report = existing
    ? await db.dailyProjectReport.update({ where: { id: existing.id }, data })
    : await db.dailyProjectReport.create({
        data: { ...data, projectId, entityId: project.entityId, reportDate: today },
      })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: action === 'submit' ? 'SUBMIT_DAILY_REPORT' : 'SAVE_DAILY_REPORT',
      targetType: 'DAILY_REPORT',
      targetId: report.id,
      beforeData: existing ? JSON.stringify({ status: existing.status, progressPct: existing.progressPct }) : null,
      afterData: JSON.stringify({ status: effectiveStatus, progressPct: effectiveProgress, evidenceCount: effectiveEvidence, derivedFromTasks: Boolean(rollup) }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  // Keep the cached totals consistent with whatever the tasks now say.
  if (rollup) await rollupDailyReport(projectId, today)

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    submitted: action === 'submit',
    derivedFromTasks: Boolean(rollup),
  })
}
