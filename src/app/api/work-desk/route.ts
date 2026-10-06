import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { limitReminders } from '@/lib/security'
import { can, canSignSlot, pendingSlot } from '@/lib/rbac'
import { monthKeyNow } from '@/lib/wib'
import { countDailyIntake } from '@/lib/daily-intake'
import { DAILY_PIC_TEMPLATE, remindPicDaily, remindPicsDaily, type RemindActor } from '@/lib/reminders-pic'
import {
  DAILY_CUTOFF_LABEL,
  dailyCountdown,
  dailyLockAt,
  isDailyLocked,
  isoWeekOf,
  isWeeklyLocked,
  startOfWibDay,
  weekPeriodOf,
  weeklyDeadlines,
} from '@/lib/lock'

/**
 * Meja kerja — pekerjaan HARI INI akun yang sedang masuk, menurut perannya.
 *
 *   GET            — PIC proyek: proyek yang dipegang beserta laporan & tugas hari ini,
 *                    riwayat 10 hari kerja, dan pengingat yang diterima.
 *                    Kepala divisi: riwayat capaian divisinya 6 minggu terakhir
 *                    (papan minggu berjalan dibaca dari /api/weekly-input).
 *                    Admin PT: alur laporan harian & mingguan PT-nya, pengajuan
 *                    proyek yang menunggu tanda tangannya, eskalasi, buka kunci.
 *   POST { action: 'remind-pic', projectId }  — Admin PT mengingatkan PIC satu proyek.
 *   POST { action: 'remind-all-pics' }        — semua PIC yang belum mengirim hari ini.
 *
 * Akun diambil dari sesi, bukan dari parameter, sehingga satu akun tidak bisa
 * membaca meja akun lain. Pengingat harian hanya sekali per proyek per hari.
 */

const DAY = 86400000

/** 10 hari kerja terakhir (Senin–Jumat WIB), termasuk hari ini, urut lama → baru. */
function lastWorkingDays(today: Date, n = 10): Date[] {
  const out: Date[] = []
  for (let t = today.getTime(); out.length < n && t > today.getTime() - 30 * DAY; t -= DAY) {
    const dow = new Date(t + 7 * 3600000).getUTCDay()
    if (dow === 0 || dow === 6) continue
    out.unshift(new Date(t))
  }
  return out
}

function payloadOf(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/* ------------------------------------------------------------------ */
/* PIC proyek                                                          */
/* ------------------------------------------------------------------ */
async function picDesk(user: SessionUser) {
  const now = new Date()
  const today = startOfWibDay(now)
  const days = lastWorkingDays(today)

  const projects = await db.project.findMany({
    where: { picUserId: user.id, lifecycle: 'AKTIF' },
    select: {
      id: true, code: true, name: true, phase: true, startDate: true, targetEndDate: true,
      entity: { select: { name: true } },
    },
    orderBy: { code: 'asc' },
  })
  const ids = projects.map((p) => p.id)

  const [reports, tasks, reminders] = await Promise.all([
    db.dailyProjectReport.findMany({
      where: { projectId: { in: ids }, reportDate: { gte: days[0] } },
      select: {
        projectId: true, reportDate: true, status: true, progressPct: true, submittedAt: true,
        forwardedAt: true, isLate: true, evidenceCount: true,
      },
    }),
    db.task.findMany({
      where: { projectId: { in: ids }, workDate: today, scope: 'HARIAN' },
      select: { projectId: true, status: true },
    }),
    db.notificationLog.findMany({
      where: { userId: user.id, template: DAILY_PIC_TEMPLATE, createdAt: { gte: today } },
      select: { payload: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    kind: 'PIC' as const,
    today: today.toISOString(),
    lockAt: dailyLockAt(today).toISOString(),
    locked: isDailyLocked(today),
    countdown: dailyCountdown(now),
    cutoffLabel: DAILY_CUTOFF_LABEL,
    days: days.map((d) => d.toISOString()),
    projects: projects.map((p) => {
      const mine = reports.filter((r) => r.projectId === p.id)
      const todayReport = mine.find((r) => r.reportDate.getTime() === today.getTime()) ?? null
      const myTasks = tasks.filter((t) => t.projectId === p.id)
      const reminder = reminders.find((r) => payloadOf(r.payload).projectId === p.id)
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        phase: p.phase,
        startDate: p.startDate,
        targetEndDate: p.targetEndDate,
        entityName: p.entity.name,
        tasks: {
          total: myTasks.length,
          done: myTasks.filter((t) => t.status === 'SELESAI').length,
          blocked: myTasks.filter((t) => t.status === 'TERKENDALA' || t.status === 'MENUNGGU_KEPUTUSAN').length,
        },
        report: todayReport
          ? {
              status: todayReport.status,
              progressPct: todayReport.progressPct,
              submittedAt: todayReport.submittedAt,
              forwardedAt: todayReport.forwardedAt,
              isLate: todayReport.isLate,
              evidenceCount: todayReport.evidenceCount,
            }
          : null,
        history: days.map((d) => {
          const r = mine.find((x) => x.reportDate.getTime() === d.getTime())
          return {
            date: d.toISOString(),
            submitted: Boolean(r?.submittedAt),
            isLate: Boolean(r?.isLate),
            status: r?.status ?? null,
            progressPct: r?.progressPct ?? null,
          }
        }),
        remindedAt: reminder?.createdAt ?? null,
        remindedBy: reminder ? ((payloadOf(reminder.payload).actorName as string) ?? null) : null,
      }
    }),
  }
}

/* ------------------------------------------------------------------ */
/* Kepala divisi                                                       */
/* ------------------------------------------------------------------ */
async function kadivDesk(user: SessionUser) {
  const now = new Date()
  const current = weekPeriodOf(now)
  const from = new Date(current.start.getTime() - 5 * 7 * DAY)
  const divisions = await db.division.findMany({
    where: { headUserId: user.id, isActive: true },
    select: { id: true, name: true, entity: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  const reports = await db.weeklyDivisionReport.findMany({
    where: { divisionId: { in: divisions.map((d) => d.id) }, periodStart: { gte: from } },
    select: {
      divisionId: true, isoWeek: true, periodStart: true, statusHeader: true, submittedAt: true,
      items: { select: { status: true } },
    },
  })
  return {
    kind: 'KADIV' as const,
    today: startOfWibDay(now).toISOString(),
    divisions: divisions.map((d) => ({
      id: d.id,
      name: d.name,
      entityName: d.entity.name,
      history: Array.from({ length: 6 }, (_, i) => {
        const start = new Date(from.getTime() + i * 7 * DAY)
        const wk = isoWeekOf(start).isoWeek
        const r = reports.find((x) => x.divisionId === d.id && x.isoWeek === wk)
        const handoverBy = weeklyDeadlines(start).handoverBy
        return {
          label: `M${wk}`,
          done: r?.items.filter((it) => it.status === 'SELESAI').length ?? 0,
          total: r?.items.filter((it) => it.status !== 'NA').length ?? 0,
          status: r?.statusHeader ?? null,
          onTime: Boolean(r?.submittedAt && r.submittedAt <= handoverBy),
        }
      }),
    })),
  }
}

/* ------------------------------------------------------------------ */
/* Admin PT                                                            */
/* ------------------------------------------------------------------ */
async function adminDesk(user: SessionUser, entityId: string) {
  const now = new Date()
  const today = startOfWibDay(now)
  const days = lastWorkingDays(today)
  const { isoYear, isoWeek } = isoWeekOf(now)
  const deadlines = weeklyDeadlines(now)

  const entity = await db.entity.findUnique({ where: { id: entityId }, select: { id: true, name: true, code: true, region: true } })
  if (!entity) return null

  const [projects, recentDaily, tasks, divisions, weekly, proposals, escalations, unlocks, lateThisMonth, reminders] = await Promise.all([
    db.project.findMany({
      where: { entityId, lifecycle: 'AKTIF' },
      select: { id: true, code: true, name: true, phase: true, picUser: { select: { id: true, name: true } }, picName: true },
      orderBy: { code: 'asc' },
    }),
    db.dailyProjectReport.findMany({
      where: { entityId, reportDate: { gte: days[0] } },
      select: {
        id: true, projectId: true, reportDate: true, status: true, progressPct: true, evidenceCount: true,
        submittedAt: true, forwardedAt: true, isLate: true, needsEscalation: true, achievementToday: true,
        submittedBy: { select: { name: true } },
      },
    }),
    db.task.findMany({ where: { entityId, workDate: today, scope: 'HARIAN' }, select: { projectId: true, status: true } }),
    db.division.findMany({
      where: { entityId, isActive: true },
      select: { id: true, name: true, headUser: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    }),
    db.weeklyDivisionReport.findMany({
      where: { entityId, isoYear, isoWeek },
      select: {
        id: true, divisionId: true, statusHeader: true, submittedAt: true, approvedAt: true, forwardedAt: true,
        items: { select: { status: true, evidenceCount: true, needsEscalation: true } },
      },
    }),
    db.project.findMany({
      where: { entityId, lifecycle: 'DIUSULKAN' },
      select: {
        id: true, name: true, entityId: true, approvalChain: true, proposedAt: true, createdAt: true, description: true,
        proposedBy: { select: { name: true } },
        approvals: { select: { role: true, decision: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.escalation.findMany({
      where: { entityId, status: { in: ['DIAJUKAN', 'DITINJAU'] } },
      select: { id: true, summary: true, status: true, needed: true, raisedAt: true, slaDays: true, raisedBy: { select: { name: true } } },
      orderBy: { raisedAt: 'asc' },
      take: 8,
    }),
    db.unlockRequest.findMany({
      where: { requestedById: user.id, status: { in: ['DIAJUKAN', 'DISETUJUI'] } },
      select: { id: true, targetType: true, reason: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.lateIncident.count({ where: { entityId, period: { startsWith: monthKeyNow() } } }),
    // Hanya pengingat ke PIC proyek PT ini (bukan semua PT) [F1-D].
    db.notificationLog.findMany({
      where: {
        template: DAILY_PIC_TEMPLATE,
        createdAt: { gte: today },
        user: { projectsAsPic: { some: { entityId, lifecycle: 'AKTIF' } } },
      },
      select: { payload: true, createdAt: true },
    }),
  ])

  const reminded = new Map<string, Date>()
  for (const r of reminders) {
    const pid = payloadOf(r.payload).projectId
    if (typeof pid === 'string' && !reminded.has(pid)) reminded.set(pid, r.createdAt)
  }

  const todayReports = recentDaily.filter((r) => r.reportDate.getTime() === today.getTime())
  // Angka "laporan masuk" yang sama dengan Ringkasan Admin (/api/my-dashboard).
  const intake = countDailyIntake(projects.map((p) => p.id), todayReports)

  return {
    kind: 'ADMIN' as const,
    entity,
    today: today.toISOString(),
    lockAt: dailyLockAt(today).toISOString(),
    locked: isDailyLocked(today),
    countdown: dailyCountdown(now),
    cutoffLabel: DAILY_CUTOFF_LABEL,
    week: {
      isoYear,
      isoWeek,
      handoverBy: deadlines.handoverBy.toISOString(),
      lockAt: deadlines.lockAt.toISOString(),
      locked: isWeeklyLocked(deadlines.periodStart),
    },
    intake: { projects: intake.projects, received: intake.received, awaitingForward: intake.awaitingForward, missing: intake.missing },
    canForward: can(user.role, 'daily:forward'),
    canRemind: can(user.role, 'notify:remind'),
    projects: projects.map((p) => {
      const r = todayReports.find((x) => x.projectId === p.id) ?? null
      const t = tasks.filter((x) => x.projectId === p.id)
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        phase: p.phase,
        pic: p.picUser ? { id: p.picUser.id, name: p.picUser.name } : null,
        picName: p.picUser?.name ?? p.picName ?? null,
        tasks: { total: t.length, done: t.filter((x) => x.status === 'SELESAI').length },
        report: r
          ? {
              id: r.id,
              status: r.status,
              progressPct: r.progressPct,
              evidenceCount: r.evidenceCount,
              submittedAt: r.submittedAt,
              submittedBy: r.submittedBy?.name ?? null,
              forwardedAt: r.forwardedAt,
              isLate: r.isLate,
              needsEscalation: r.needsEscalation,
              achievement: r.achievementToday,
            }
          : null,
        remindedAt: reminded.get(p.id) ?? null,
      }
    }),
    divisions: divisions.map((d) => {
      const w = weekly.find((x) => x.divisionId === d.id) ?? null
      return {
        id: d.id,
        name: d.name,
        head: d.headUser ? { id: d.headUser.id, name: d.headUser.name } : null,
        report: w
          ? {
              id: w.id,
              statusHeader: w.statusHeader,
              submittedAt: w.submittedAt,
              approvedAt: w.approvedAt,
              forwardedAt: w.forwardedAt,
              items: w.items.length,
              done: w.items.filter((i) => i.status === 'SELESAI').length,
              blocked: w.items.filter((i) => i.status === 'TERKENDALA').length,
              missingEvidence: w.items.filter((i) => i.evidenceCount === 0 && !['BELUM_MULAI', 'NA'].includes(i.status)).length,
            }
          : null,
      }
    }),
    approvals: proposals
      .map((p) => {
        const approved = p.approvals.filter((a) => a.decision === 'DISETUJUI').map((a) => a.role)
        const rejected = p.approvals.some((a) => a.decision === 'DITOLAK')
        const slot = pendingSlot(p.approvalChain, approved)
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          proposer: p.proposedBy?.name ?? 'Pengaju',
          proposedAt: p.proposedAt ?? p.createdAt,
          mine: !rejected && slot !== null && canSignSlot(user, slot, p.entityId),
          slot,
        }
      })
      .filter((p) => p.mine),
    escalations: escalations.map((e) => ({
      id: e.id,
      summary: e.summary,
      status: e.status,
      needed: e.needed,
      raisedAt: e.raisedAt,
      raisedBy: e.raisedBy?.name ?? null,
      ageDays: Math.floor((now.getTime() - e.raisedAt.getTime()) / DAY),
      overdue: (now.getTime() - e.raisedAt.getTime()) / DAY > e.slaDays,
    })),
    unlocks,
    lateThisMonth,
    history: days.map((d) => {
      const mine = recentDaily.filter((r) => r.reportDate.getTime() === d.getTime())
      return {
        date: d.toISOString(),
        submitted: mine.filter((r) => r.submittedAt).length,
        onTime: mine.filter((r) => r.submittedAt && !r.isLate).length,
        forwarded: mine.filter((r) => r.forwardedAt).length,
      }
    }),
  }
}

export async function GET() {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user

    if (user.role === 'PIC_PROYEK') return NextResponse.json(await picDesk(user))
    if (user.role === 'KEPALA_DIVISI') return NextResponse.json(await kadivDesk(user))

    if (!user.scopeEntityId) {
      return NextResponse.json({ error: 'Meja kerja berlaku untuk akun yang terikat pada satu PT.' }, { status: 400 })
    }
    const desk = await adminDesk(user, user.scopeEntityId)
    if (!desk) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })
    return NextResponse.json(desk)
  } catch (err) {
    console.error('[work-desk] GET:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Meja kerja belum termuat' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'notify:remind') && !can(user.role, 'daily:forward')) {
    return NextResponse.json({ error: 'Peran Anda tidak mengirim pengingat' }, { status: 403 })
  }
  const limited = limitReminders(user.id, 'work-desk')
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const today = startOfWibDay(new Date())
  if (isDailyLocked(today)) {
    return NextResponse.json({ error: `Laporan hari ini sudah dikunci pukul ${DAILY_CUTOFF_LABEL}.`, locked: true }, { status: 409 })
  }

  const actor: RemindActor = { kind: 'user', id: user.id, name: user.name, role: user.role, scopeEntityId: user.scopeEntityId }
  const meta = {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
  }

  if (body.action === 'remind-pic') {
    const projectId = typeof body.projectId === 'string' ? body.projectId.slice(0, 64) : ''
    const r = await remindPicDaily(actor, projectId, today, meta)
    if (!r.ok) return NextResponse.json({ error: r.error, remindedAt: 'remindedAt' in r ? r.remindedAt : null }, { status: r.status })
    return NextResponse.json(r)
  }

  if (body.action === 'remind-all-pics') {
    if (!user.scopeEntityId) return NextResponse.json({ error: 'Akun Anda tidak terikat pada satu PT' }, { status: 400 })
    const projects = await db.project.findMany({
      where: { entityId: user.scopeEntityId, lifecycle: 'AKTIF', picUserId: { not: null } },
      select: { id: true },
    })
    const { sent, skipped } = await remindPicsDaily(actor, projects.map((p) => p.id), today, meta)
    return NextResponse.json({ ok: true, sent, skipped })
  }

  return NextResponse.json({ error: 'Aksi tidak dikenali' }, { status: 400 })
}
