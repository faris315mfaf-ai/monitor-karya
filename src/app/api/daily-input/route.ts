import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { can, isMasterRole } from '@/lib/rbac'
import {
  DAILY_CUTOFF_LABEL,
  DAILY_STATUSES,
  dailyCountdown,
  dailyLockAt,
  isDailyLocked,
  isWorkingDay,
  parseWibDateKey,
  startOfWibDay,
  validateDailyReport,
  wibDateKey,
} from '@/lib/lock'
import { computeRollup, dailyGate, frozenMessage, rollupDailyReport } from '@/lib/daily-rollup'
import { removeEvidence, storageConfigured } from '@/lib/storage'

/**
 * The daily reporting desk.
 *
 *   GET    ?date=YYYY-MM-DD — the projects this account is responsible for, with
 *                             that day's report (default: today).
 *   PUT    — save a draft, or submit it for the Admin PT once it validates.
 *   DELETE — remove a draft that has not been forwarded.
 *
 * A PIC sees only the projects assigned to them; an Admin PT sees every project
 * of their entity, because they enter data on the PIC's behalf when needed.
 *
 * Pembekuan (6 Okt 2026): laporan dikirim PIC langsung ke Admin PT; begitu
 * Admin PT meneruskannya ke holding, laporan dibekukan — PUT/DELETE ditolak 409
 * kecuali ada buka kunci yang sedang berlaku (`dailyGate`). Buka kunci juga
 * satu-satunya jalan menulis laporan tanggal lampau: `reportDate` hanya hari
 * kerja, tidak di masa depan, dan untuk hari selain hari ini hanya bila
 * laporannya sedang dibuka.
 */

const ipOf = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

/**
 * Tanggal laporan yang diminta (kunci "YYYY-MM-DD" WIB) atau hari ini. Menolak
 * tanggal mustahil, akhir pekan, dan masa depan.
 */
function resolveDay(raw: unknown, now: Date = new Date()): { ok: true; day: Date; isToday: boolean } | { ok: false; res: NextResponse } {
  const today = startOfWibDay(now)
  if (raw === undefined || raw === null || raw === '') return { ok: true, day: today, isToday: true }
  const day = parseWibDateKey(raw)
  if (!day) return { ok: false, res: NextResponse.json({ error: 'Tanggal laporan tidak valid.' }, { status: 400 }) }
  if (day.getTime() > today.getTime()) {
    return { ok: false, res: NextResponse.json({ error: 'Laporan tidak bisa diisi untuk tanggal yang belum tiba.' }, { status: 422 }) }
  }
  if (!isWorkingDay(day)) {
    return { ok: false, res: NextResponse.json({ error: 'Laporan harian hanya untuk hari kerja (Senin–Jumat).' }, { status: 422 }) }
  }
  return { ok: true, day, isToday: day.getTime() === today.getTime() }
}

/** Status buka kunci yang relevan untuk satu laporan, untuk ditampilkan ke PIC. */
type UnlockInfo = { id: string; status: string; unlockUntil: Date | null }

async function visibleProjects(user: SessionUser) {
  if (user.role === 'PIC_PROYEK') {
    return db.project.findMany({
      where: { picUserId: user.id, lifecycle: 'AKTIF' },
      orderBy: { code: 'asc' },
    })
  }
  // TI is the master account and is not pinned to an entity.
  if (isMasterRole(user.role)) {
    return db.project.findMany({ where: { lifecycle: 'AKTIF' }, orderBy: { code: 'asc' } })
  }
  if (!user.scopeEntityId) return []
  return db.project.findMany({
    where: { entityId: user.scopeEntityId, lifecycle: 'AKTIF' },
    orderBy: { code: 'asc' },
  })
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'daily:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input harian' }, { status: 403 })
  }

  const now = new Date()
  const resolved = resolveDay(req.nextUrl.searchParams.get('date'), now)
  if (!resolved.ok) return resolved.res
  const day = resolved.day
  const projects = await visibleProjects(user)
  const projectIds = projects.map((p) => p.id)

  const reports = await db.dailyProjectReport.findMany({
    where: { projectId: { in: projectIds }, reportDate: day },
  })
  const byProject = new Map(reports.map((r) => [r.projectId, r]))

  // A project with tasks has its status and progress derived from them.
  const taskCounts = await db.task.groupBy({
    by: ['projectId'],
    where: { projectId: { in: projectIds }, workDate: day, scope: 'HARIAN' },
    _count: { _all: true },
  })
  const tasksByProject = new Map(taskCounts.map((t) => [t.projectId, t._count._all]))

  const evidences = await db.evidence.findMany({
    where: { targetType: 'DAILY_REPORT', targetId: { in: reports.map((r) => r.id) } },
    select: { id: true, targetId: true, fileName: true, url: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // Buka kunci per laporan hari itu: yang masih diproses atau sedang berlaku.
  const unlockRows = reports.length
    ? await db.unlockRequest.findMany({
        where: { targetType: 'DAILY_REPORT', targetId: { in: reports.map((r) => r.id) }, status: { in: ['DIAJUKAN', 'DISETUJUI', 'DIEKSEKUSI'] } },
        select: { id: true, targetId: true, status: true, unlockUntil: true, reLockedAt: true },
        orderBy: { createdAt: 'desc' },
      })
    : []
  const unlockByReport = new Map<string, UnlockInfo>()
  for (const u of unlockRows) {
    if (unlockByReport.has(u.targetId)) continue
    const active = u.status === 'DIEKSEKUSI' && !u.reLockedAt && u.unlockUntil && u.unlockUntil > now
    if (u.status === 'DIEKSEKUSI' && !active) continue
    unlockByReport.set(u.targetId, { id: u.id, status: u.status, unlockUntil: u.unlockUntil })
  }

  // Hari lain yang sedang dibuka, agar PIC bisa langsung ke sana.
  const otherActive = projectIds.length
    ? await db.unlockRequest.findMany({
        where: { targetType: 'DAILY_REPORT', status: 'DIEKSEKUSI', reLockedAt: null, unlockUntil: { gt: now } },
        select: { targetId: true, unlockUntil: true },
        take: 100,
      })
    : []
  const openReports = otherActive.length
    ? await db.dailyProjectReport.findMany({
        where: { id: { in: otherActive.map((u) => u.targetId) }, projectId: { in: projectIds }, NOT: { reportDate: day } },
        select: { id: true, projectId: true, reportDate: true, project: { select: { name: true } } },
        orderBy: { reportDate: 'desc' },
        take: 20,
      })
    : []
  const untilById = new Map(otherActive.map((u) => [u.targetId, u.unlockUntil]))

  const timeLocked = isDailyLocked(day, now)

  return NextResponse.json({
    reportDate: day.toISOString(),
    reportDateKey: wibDateKey(day),
    today: resolved.isToday,
    todayKey: wibDateKey(now),
    lockAt: dailyLockAt(day).toISOString(),
    locked: timeLocked,
    countdown: dailyCountdown(now),
    canRequestUnlock: can(user.role, 'unlock:request'),
    openDays: openReports.map((r) => ({
      reportId: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      date: wibDateKey(r.reportDate),
      unlockUntil: untilById.get(r.id) ?? null,
    })),
    projects: projects.map((p) => {
      const report = byProject.get(p.id) ?? null
      const taskCount = tasksByProject.get(p.id) ?? 0
      const unlock = report ? (unlockByReport.get(report.id) ?? null) : null
      const unlocked = unlock?.status === 'DIEKSEKUSI'
      const lockReason: 'FORWARDED' | 'LOCKED' | 'TIME' | null = unlocked
        ? null
        : report?.forwardedAt
          ? 'FORWARDED'
          : report?.isLocked
            ? 'LOCKED'
            : timeLocked
              ? 'TIME'
              : null
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        phase: p.phase,
        taskCount,
        derived: taskCount > 0,
        editable: lockReason === null,
        lockReason,
        unlock,
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

/** Proyek ini tanggung jawab akun ini? PIC: proyeknya sendiri; Admin PT: PT-nya; TI/Super Admin: semua. */
function ownsProject(user: SessionUser, project: { picUserId: string | null; entityId: string }) {
  return user.role === 'PIC_PROYEK'
    ? project.picUserId === user.id
    : isMasterRole(user.role)
      ? true
      : project.entityId === user.scopeEntityId
}

/**
 * DELETE ?projectId= &date= — hapus laporan (bawaan: hari ini) selama belum
 * diteruskan ke holding. Hari yang lewat tenggat atau laporan yang terkunci
 * hanya bisa dihapus selama buka kunci berlaku. Laporan yang sudah diteruskan
 * tidak pernah dihapus — holding sudah menerimanya. Task harinya tidak ikut
 * dihapus (mereka punya tombol hapus sendiri); hanya laporan ringkasnya beserta
 * lampiran di levelnya.
 */
export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'daily:input')) {
    return NextResponse.json({ error: 'Peran Anda tidak melakukan input harian' }, { status: 403 })
  }

  const projectId = (req.nextUrl.searchParams.get('projectId') || '').slice(0, 64)
  if (!projectId) return NextResponse.json({ error: 'Proyek wajib dipilih' }, { status: 400 })
  const resolved = resolveDay(req.nextUrl.searchParams.get('date'))
  if (!resolved.ok) return resolved.res
  const day = resolved.day

  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 })
  if (!ownsProject(user, project)) {
    return NextResponse.json({ error: 'Proyek ini bukan tanggung jawab Anda' }, { status: 403 })
  }

  const existing = await db.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: day } },
  })
  if (!existing) return NextResponse.json({ error: resolved.isToday ? 'Belum ada laporan hari ini' : 'Belum ada laporan pada tanggal ini' }, { status: 404 })

  const gate = await dailyGate(projectId, day)
  if (existing.forwardedAt) {
    return NextResponse.json(
      gate.unlock
        ? { error: 'Laporan yang sudah diteruskan ke holding tidak dapat dihapus. Ubah isinya selama buka kunci berlaku.', locked: true, frozen: 'FORWARDED' }
        : { error: frozenMessage(gate), locked: true, frozen: 'FORWARDED', reportId: existing.id },
      { status: 409 }
    )
  }
  const frozen = frozenMessage(gate)
  if (frozen) return NextResponse.json({ error: frozen, locked: true, frozen: gate.frozen, reportId: existing.id }, { status: 409 })
  if (gate.timeLocked) {
    return NextResponse.json(
      { error: `Laporan ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}. Ajukan buka kunci untuk mengubahnya.`, locked: true, reportId: existing.id },
      { status: 409 }
    )
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
      beforeData: JSON.stringify({
        status: existing.status,
        progressPct: existing.progressPct,
        reportDate: wibDateKey(day),
        ...(gate.unlock ? { unlockRequestId: gate.unlock.id } : {}),
      }),
      ip: ipOf(req),
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
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  // Batas panjang per kolom: teks bebas tidak boleh tak terbatas.
  const text = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).slice(0, max) : null)
  const projectId = typeof body.projectId === 'string' ? body.projectId.slice(0, 64) : ''
  const action = body.action === 'submit' ? 'submit' : 'save'
  const status = typeof body.status === 'string' ? body.status : ''
  const achievementToday = text('achievementToday', 4000) ?? ''
  const obstacle = text('obstacle', 2000)
  const followUp = text('followUp', 2000)
  const decisionRequestedFrom = text('decisionRequestedFrom', 200)
  const progressPct = Math.max(0, Math.min(100, Math.round(Number(body.progressPct) || 0)))

  if (status && !DAILY_STATUSES.includes(status as (typeof DAILY_STATUSES)[number])) {
    return NextResponse.json({ error: 'Status laporan tidak dikenali.' }, { status: 422 })
  }

  const resolved = resolveDay(body.reportDate)
  if (!resolved.ok) return resolved.res
  const day = resolved.day

  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 })
  if (!ownsProject(user, project)) {
    return NextResponse.json({ error: 'Proyek ini bukan tanggung jawab Anda' }, { status: 403 })
  }

  // Satu aturan untuk semua jalur tulis: dibekukan setelah diteruskan atau
  // dikunci, terkunci setelah 17.00 — kecuali buka kunci sedang berlaku.
  const gate = await dailyGate(projectId, day)
  const frozen = frozenMessage(gate)
  if (frozen) {
    return NextResponse.json({ error: frozen, locked: true, frozen: gate.frozen, reportId: gate.report?.id ?? null }, { status: 409 })
  }
  if (gate.timeLocked) {
    return NextResponse.json(
      {
        error: resolved.isToday
          ? `Laporan hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}. Ajukan buka kunci untuk mengubahnya.`
          : 'Laporan tanggal ini tidak sedang dibuka. Ajukan buka kunci untuk mengubahnya.',
        locked: true,
        reportId: gate.report?.id ?? null,
      },
      { status: 409 }
    )
  }

  const existing = await db.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: day } },
  })

  const evidenceCount = existing
    ? await db.evidence.count({
        where: { targetType: 'DAILY_REPORT', targetId: existing.id },
      })
    : 0

  // Once the day has tasks they are the source of truth: the report cannot
  // disagree with the work it summarises.
  const rollup = await computeRollup(projectId, day)
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
    // Laporan yang dikirim setelah tenggat lewat buka kunci tercatat terlambat.
    ...(action === 'submit' ? { submittedById: user.id, submittedAt: new Date(), ...(gate.unlock && isDailyLocked(day) && !existing?.submittedAt ? { isLate: true } : {}) } : {}),
  }

  const report = existing
    ? await db.dailyProjectReport.update({ where: { id: existing.id }, data })
    : await db.dailyProjectReport.create({
        data: { ...data, projectId, entityId: project.entityId, reportDate: day },
      })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: action === 'submit' ? 'SUBMIT_DAILY_REPORT' : 'SAVE_DAILY_REPORT',
      targetType: 'DAILY_REPORT',
      targetId: report.id,
      beforeData: existing ? JSON.stringify({ status: existing.status, progressPct: existing.progressPct }) : null,
      afterData: JSON.stringify({
        status: effectiveStatus,
        progressPct: effectiveProgress,
        evidenceCount: effectiveEvidence,
        derivedFromTasks: Boolean(rollup),
        reportDate: wibDateKey(day),
        // Perubahan lewat buka kunci (termasuk atas laporan yang sudah diteruskan) selalu tercatat.
        ...(gate.unlock ? { unlockRequestId: gate.unlock.id, afterForward: Boolean(existing?.forwardedAt) } : {}),
      }),
      ip: ipOf(req),
      userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
    },
  })

  // Keep the cached totals consistent with whatever the tasks now say.
  if (rollup) await rollupDailyReport(projectId, day)

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    submitted: action === 'submit',
    derivedFromTasks: Boolean(rollup),
  })
}
