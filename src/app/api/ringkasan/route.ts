import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { compareProgress } from '@/lib/kpi-math'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds, scopeUserIds } from '@/lib/auth'
import { can, canSignSlot, pendingSlot } from '@/lib/rbac'
import { canDecideDeadline } from '@/lib/pic-access'
import { isoWeekOf, isoWeekStart, startOfWibDay, weeklyDeadlines } from '@/lib/lock'
import { deriveProjectStatus, STATUS_ORDER, type LatestReport } from '@/lib/project-status'
// [F2-DIREKTUR] tanggapan, tinjauan proyek, persetujuan materi/anggaran/cuti, kontak kadiv, kehadiran terlambat
import { serverError } from '@/lib/api-error'
import { readDivisionSummaries } from '@/lib/kadiv'
import { APPROVAL_SELECT, decidableWhere, reportWeekOf, shapeApprovals, type ApprovalJson } from '@/lib/oversight'
import { isApprovalDecider, isProjectOverseer, isWeeklyReader } from '@/lib/oversight-shared'

/**
 * Ringkasan untuk peran pemantau (Manajemen, Direksi Holding, Direktur Entitas,
 * TI, Super Admin, Auditor) dalam bentuk yang dipakai dashboard desain baru:
 * status proyek (Sesuai jadwal / Perlu perhatian / Terlambat), kepatuhan laporan
 * harian per perusahaan, tren 8 minggu, keputusan yang menunggu, dan aktivitas.
 *
 * Tambahan P2-D (6 Okt 2026, 01-manajemen.md & 02-direktur.md):
 * - `divisions`: per divisi — kepala divisi, laporan mingguan minggu laporan
 *   (`reportWeek`) dengan lencana Terkirim / Terlambat masuk / Belum masuk /
 *   Sudah dibaca, output aktif & selesai, tepat waktu, tren 8 minggu.
 * - `outputs`: agregat output (model Output) + tren per minggu/bulan/kuartal.
 * - `deadlineProposals`: usulan geser tenggat yang menunggu keputusan pemanggil.
 * Tabel baru (Output, DeadlineProposal, WeeklyReportRead, kolom divisionId)
 * dibaca dengan penjagaan: bila migrasinya belum dijalankan, bagian itu kosong
 * dan ringkasan lainnya tetap tampil.
 */

const DAY = 86400000
const WEEKS = 8

const ACTIVITY: Record<string, string> = {
  CREATE_REPORT: 'mengirim laporan harian',
  UPDATE_REPORT: 'memperbarui laporan harian',
  SUBMIT_DAILY_REPORT: 'mengirim laporan harian',
  FORWARD_DAILY_REPORT: 'meneruskan laporan harian ke holding',
  SUBMIT_PROGRESS_REPORT: 'mengirim laporan kemajuan proyek',
  ATTACH_EVIDENCE: 'melampirkan bukti',
  UPLOAD_EVIDENCE: 'mengunggah bukti',
  CREATE_TASK: 'menambah tugas',
  UPDATE_TASK: 'memperbarui tugas',
  SEND_DIVISION_REMINDERS: 'mengirim pengingat ke divisi',
  REMIND_PIC: 'mengingatkan PIC untuk laporan harian',
  CRON_DIVISION_REMINDERS: 'mengirim pengingat otomatis',
  RESUBMIT_PROJECT: 'mengajukan ulang proyek',
  APPROVE_WEEKLY: 'menyetujui laporan mingguan',
  SUBMIT_WEEKLY_REPORT: 'menyerahkan capaian mingguan',
  FORWARD_WEEKLY_REPORT: 'meneruskan laporan mingguan',
  LOCK_REPORT: 'mengunci laporan',
  UNLOCK_EXECUTE: 'membuka kunci laporan',
  CREATE_ESCALATION: 'mengajukan eskalasi',
  REVIEW_ESCALATION: 'meninjau eskalasi',
  DECIDE_ESCALATION: 'memutuskan eskalasi',
  CLOSE_ESCALATION: 'menutup eskalasi',
  PROPOSE_PROJECT: 'mengajukan proyek baru',
  APPROVE_PROJECT: 'menyetujui pengajuan proyek',
  REJECT_PROJECT: 'menolak pengajuan proyek',
  CREATE_PROJECT: 'menambah proyek',
  UPDATE_PROJECT: 'mengubah proyek',
  // [F2-DIREKTUR]
  CREATE_APPROVAL_REQUEST: 'meminta persetujuan',
  APPROVE_APPROVAL_REQUEST: 'menyetujui permintaan',
  REJECT_APPROVAL_REQUEST: 'menolak permintaan',
  COMMENT_WEEKLY_REPORT: 'menanggapi laporan mingguan',
  REVIEW_PROJECT: 'meninjau proyek',
  APPROVE_DEADLINE: 'menyetujui geser tenggat',
  REJECT_DEADLINE: 'menolak geser tenggat',
}

// Hanya kejadian kerja yang dikenal; urusan akun dan sistem tidak tampil di aktivitas.
function activityText(action: string) {
  return ACTIVITY[action] ?? null
}

/** Bagian opsional: galat (mis. tabel/kolom belum dimigrasi) menjadi nilai kosong. */
async function optional<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch {
    return fallback
  }
}

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const WIB_MS = 7 * 3600000

/** Awal bulan (WIB) `back` bulan sebelum bulan `now`, sebagai instan UTC. */
function wibMonthStart(now: Date, back: number) {
  const w = new Date(now.getTime() + WIB_MS)
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() - back, 1) - WIB_MS)
}

type WeeklyState = 'sent' | 'late' | 'missing' | 'read'

/** Peran yang menandai laporan mingguan divisi "Sudah dibaca" (sama dengan laporan-dibaca/route.ts). */
const READERS = ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN']

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  try {
    const now = new Date()
    const today = startOfWibDay(now)
    const scopeIds = await scopeEntityIds(user)
    const inScope = scopeIds ? { entityId: { in: scopeIds } } : {}
    const weekStart = isoWeekStart(now)
    const trendFrom = new Date(weekStart.getTime() - (WEEKS - 1) * 7 * DAY)
    const since30 = new Date(today.getTime() - 30 * DAY)
    const { isoYear, isoWeek } = isoWeekOf(now)

    const [projects, recentReports, entities, divisions, weekly, escalations, proposals, userIds] = await Promise.all([
      db.project.findMany({
        where: { ...inScope, lifecycle: 'AKTIF' },
        select: {
          id: true, code: true, name: true, phase: true, lifecycle: true, startDate: true, targetEndDate: true,
          picName: true, picUserId: true, picUser: { select: { name: true } },
          entity: { select: { id: true, name: true, code: true } },
          dailyReports: {
            orderBy: { reportDate: 'desc' },
            take: 1,
            select: { status: true, progressPct: true, obstacle: true, needsEscalation: true, reportDate: true, submittedAt: true, achievementToday: true },
          },
        },
      }),
      db.dailyProjectReport.findMany({
        where: { ...inScope, reportDate: { gte: trendFrom < since30 ? trendFrom : since30 } },
        select: { reportDate: true, submittedAt: true, isLate: true, entityId: true },
      }),
      db.entity.findMany({
        where: { ...(scopeIds ? { id: { in: scopeIds } } : {}), isActive: true, type: { in: ['PT', 'UNIT', 'SUB_HOLDING'] } },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      db.division.count({ where: { ...inScope, isActive: true } }),
      db.weeklyDivisionReport.findMany({
        where: { ...inScope, isoYear, isoWeek },
        select: { statusHeader: true, submittedAt: true },
      }),
      db.escalation.findMany({
        where: { ...inScope, status: { in: ['DIAJUKAN', 'DITINJAU'] } },
        // Select eksplisit (T2-B6): hanya kolom yang dipakai jawaban (pemetaan esc
        // + asal divisi lewat sourceType/sourceId); `include` memuat seluruh skalar
        // Eskalasi (decisionText, decidedById, decidedAt, createdAt, updatedAt, dst.).
        select: {
          id: true, sourceType: true, sourceId: true, summary: true, needed: true, status: true,
          raisedAt: true, slaDays: true,
          entity: { select: { name: true, code: true } },
          raisedBy: { select: { name: true } },
        },
        orderBy: { raisedAt: 'asc' },
      }),
      db.project.findMany({
        where: { ...inScope, lifecycle: 'DIUSULKAN' },
        select: {
          id: true, name: true, entityId: true, approvalChain: true, proposedAt: true, createdAt: true,
          entity: { select: { name: true } },
          proposedBy: { select: { name: true } },
          approvals: { select: { role: true, decision: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      scopeUserIds(user),
    ])

    const activity = await db.auditLog.findMany({
      where: {
        ...(userIds ? { actorId: { in: userIds } } : {}),
        action: { in: Object.keys(ACTIVITY) },
      },
      include: { actor: { select: { name: true, role: true } } },
      orderBy: { at: 'desc' },
      take: 12,
    })

    // ---- Minggu laporan: minggu berjalan bila tenggat serah terimanya sudah
    // lewat, selain itu minggu lalu (Senin pagi direktur membaca laporan M-1).
    const reportWk = reportWeekOf(now)
    const reportDl = { handoverBy: reportWk.handoverBy }
    const projectIds = projects.map((p) => p.id)
    // As-of akhir minggu lalu: hanya laporan terkirim yang belum diubah lagi
    // sesudah batas tersebut. Tanpa bukti penuh untuk kohor yang sama: null.
    const progressHistory = projectIds.length ? await db.dailyProjectReport.findMany({
      where: {
        ...inScope, projectId: { in: projectIds }, reportDate: { lt: weekStart },
        submittedAt: { not: null, lt: weekStart }, updatedAt: { lt: weekStart },
      },
      select: { projectId: true, progressPct: true, reportDate: true, submittedAt: true, updatedAt: true },
      orderBy: [{ reportDate: 'desc' }, { id: 'desc' }],
      distinct: ['projectId'],
    }) : []

    const quarterFrom = wibMonthStart(now, 9 + (new Date(now.getTime() + WIB_MS).getUTCMonth() % 3))

    const [divisionRows, reportWeekly, projectDivs, outputs, deadline] = await Promise.all([
      db.division.findMany({
        where: { ...inScope, isActive: true },
        select: {
          id: true, name: true, entityId: true,
          entity: { select: { name: true, code: true } },
          divisionType: { select: { name: true } },
          headUser: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: [{ entityId: 'asc' }, { name: 'asc' }],
      }),
      db.weeklyDivisionReport.findMany({
        where: { ...inScope, isoYear: reportWk.isoYear, isoWeek: reportWk.isoWeek },
        select: {
          id: true, divisionId: true, statusHeader: true, submittedAt: true, isLate: true,
          submittedBy: { select: { name: true } },
          items: {
            select: { workItem: true, status: true, achievementThisWeek: true, obstacleFollowUp: true, needsEscalation: true },
            orderBy: { position: 'asc' },
          },
        },
      }),
      // Divisi proyek (kolom P2-B): proyek → divisi langsung, atau lewat divisi PIC.
      projectIds.length
        ? optional(
            db.$queryRaw<{ id: string; divisionId: string | null; picDivisionId: string | null }[]>`
              SELECT p."id", p."divisionId", u."divisionId" AS "picDivisionId"
              FROM "Project" p LEFT JOIN "User" u ON u."id" = p."picUserId"
              WHERE p."id" IN (${Prisma.join(projectIds)})`,
            []
          )
        : Promise.resolve([]),
      projectIds.length
        ? optional(
            db.output.findMany({
              where: {
                projectId: { in: projectIds },
                OR: [{ status: { not: 'DITERIMA' } }, { reviewedAt: { gte: quarterFrom } }],
              },
              select: { id: true, projectId: true, status: true, dueDate: true, submittedAt: true, reviewedAt: true },
            }),
            []
          )
        : Promise.resolve([]),
      optional(
        db.deadlineProposal.findMany({
          where: { status: 'DIAJUKAN', project: { ...inScope } },
          select: {
            id: true, projectId: true, previousDate: true, proposedDate: true, reason: true, createdAt: true, proposedById: true,
            project: { select: { name: true, entityId: true, entity: { select: { name: true } } } },
            proposedBy: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        []
      ),
    ])

    // Kehadiran hari ini (model Attendance P2-B): hari tanpa catatan dianggap hadir.
    const attendance = await optional(
      (async () => {
        const people = await db.user.count({ where: { isActive: true, ...(userIds ? { id: { in: userIds } } : {}) } })
        const away = await db.attendance.groupBy({
          by: ['status'],
          where: { date: today, status: { not: 'HADIR' }, user: { isActive: true }, ...(userIds ? { userId: { in: userIds } } : {}) },
          _count: { _all: true },
        })
        // [F2-DIREKTUR] TERLAMBAT tetap hadir; dihitung terpisah untuk batang bertumpuk.
        const late = away.filter((r) => r.status === 'TERLAMBAT').reduce((a, r) => a + r._count._all, 0)
        const leave = away.filter((r) => r.status !== 'TERLAMBAT').reduce((a, r) => a + r._count._all, 0)
        return { people, present: Math.max(0, people - leave), late, leave }
      })(),
      null
    )

    const readRows = reportWeekly.length
      ? await optional(
          db.weeklyReportRead.findMany({
            where: { userId: user.id, weeklyReportId: { in: reportWeekly.map((w) => w.id) } },
            select: { weeklyReportId: true, readAt: true },
          }),
          []
        )
      : []

    // ---- [F2-DIREKTUR] Bagian tambahan (tabel 0021/0023 bisa belum ada → kosong).
    const reportIds = reportWeekly.map((w) => w.id)
    const approvalWhere = await decidableWhere(user)
    const [reviewRows, approvalRows, commentRows, kadivSummaries] = await Promise.all([
      projectIds.length
        ? optional(
            db.projectReview.findMany({
              where: { projectId: { in: projectIds }, reviewedAt: { gte: new Date(now.getTime() - 90 * DAY) } },
              orderBy: { reviewedAt: 'desc' },
              select: { projectId: true, reviewerId: true, reviewedAt: true },
              take: 2000,
            }),
            []
          )
        : Promise.resolve([]),
      approvalWhere
        ? optional(
            db.approvalRequest.findMany({
              where: { ...approvalWhere, status: 'DIAJUKAN' },
              orderBy: { createdAt: 'asc' },
              take: 50,
              select: APPROVAL_SELECT,
            }),
            []
          )
        : Promise.resolve([]),
      reportIds.length
        ? optional(
            db.weeklyReportComment.groupBy({ by: ['weeklyReportId'], where: { weeklyReportId: { in: reportIds } }, _count: { _all: true } }),
            []
          )
        : Promise.resolve([]),
      optional(readDivisionSummaries(divisionRows.map((d) => d.id), reportWk.isoYear, reportWk.isoWeek), new Map()),
    ])
    const approvalRequests: ApprovalJson[] = await optional(shapeApprovals(approvalRows), [])
    const lastReview = new Map<string, { at: Date; reviewerId: string }>()
    const myReview = new Map<string, Date>()
    for (const r of reviewRows) {
      if (!lastReview.has(r.projectId)) lastReview.set(r.projectId, { at: r.reviewedAt, reviewerId: r.reviewerId })
      if (r.reviewerId === user.id && !myReview.has(r.projectId)) myReview.set(r.projectId, r.reviewedAt)
    }
    const reviewerNames = new Map(
      (await optional(
        db.user.findMany({ where: { id: { in: [...new Set([...lastReview.values()].map((v) => v.reviewerId))] } }, select: { id: true, name: true } }),
        []
      )).map((u) => [u.id, u.name])
    )
    const commentCount = new Map(commentRows.map((c) => [c.weeklyReportId, c._count._all]))

    // ---- Divisi proyek: kolom divisionId, lalu divisi PIC, lalu PIC sebagai kepala divisi.
    const divisionIds = new Set(divisionRows.map((d) => d.id))
    const headOf = new Map<string, string>()
    for (const d of divisionRows) if (d.headUser) headOf.set(`${d.entityId}:${d.headUser.id}`, d.id)
    const directDiv = new Map(projectDivs.map((r) => [r.id, r.divisionId ?? r.picDivisionId]))
    const divisionOf = (p: { id: string; picUserId: string | null; entity: { id: string } }): string | null => {
      const d = directDiv.get(p.id)
      if (d && divisionIds.has(d)) return d
      return p.picUserId ? (headOf.get(`${p.entity.id}:${p.picUserId}`) ?? null) : null
    }
    const divisionName = new Map(divisionRows.map((d) => [d.id, d.name]))

    // ---- Proyek
    const rows = projects
      .map((p) => {
        const r = p.dailyReports[0]
        const latest: LatestReport = r
          ? { status: r.status, progressPct: r.progressPct, obstacle: r.obstacle, needsEscalation: r.needsEscalation, reportDate: r.reportDate }
          : null
        const d = deriveProjectStatus(p, latest, now)
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          phase: p.phase,
          entityId: p.entity.id,
          entityName: p.entity.name,
          entityCode: p.entity.code,
          divisionId: divisionOf(p),
          divisionName: divisionName.get(divisionOf(p) ?? '') ?? null,
          pic: p.picUser?.name ?? p.picName ?? 'Belum ada PIC',
          startDate: p.startDate,
          targetEndDate: p.targetEndDate,
          status: d.status,
          reason: d.reason,
          progress: d.progress,
          lastReportAt: r?.reportDate ?? null,
          lastNote: r?.achievementToday ?? null,
          reportedToday: Boolean(r && r.submittedAt && r.reportDate.getTime() >= today.getTime()),
        }
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.targetEndDate?.getTime() ?? Infinity) - (b.targetEndDate?.getTime() ?? Infinity))

    const counts = { on: 0, risk: 0, late: 0, done: 0, neutral: 0 }
    for (const r of rows) counts[r.status]++

    // ---- Laporan harian
    const submittedToday = rows.filter((r) => r.reportedToday).length
    const last30 = recentReports.filter((r) => r.reportDate.getTime() >= since30.getTime())
    const onTime30 = last30.filter((r) => r.submittedAt && !r.isLate).length

    const trend = Array.from({ length: WEEKS }, (_, i) => {
      const start = new Date(trendFrom.getTime() + i * 7 * DAY)
      const end = start.getTime() + 7 * DAY
      const inWeek = recentReports.filter((r) => r.reportDate.getTime() >= start.getTime() && r.reportDate.getTime() < end)
      const submitted = inWeek.filter((r) => r.submittedAt).length
      const onTime = inWeek.filter((r) => r.submittedAt && !r.isLate).length
      return { label: 'M' + isoWeekOf(start).isoWeek, submitted, onTimePct: submitted ? Math.round((onTime / submitted) * 100) : 0 }
    })

    // ---- Kepatuhan per perusahaan (tepat waktu 30 hari)
    const byEntity = entities
      .map((e) => {
        const mine = last30.filter((r) => r.entityId === e.id)
        const ok = mine.filter((r) => r.submittedAt && !r.isLate).length
        const projectsHere = rows.filter((r) => r.entityId === e.id)
        return {
          id: e.id,
          name: e.name,
          code: e.code,
          onTimePct: mine.length ? Math.round((ok / mine.length) * 100) : null,
          onTime: ok,
          total: mine.length,
          projects: projectsHere.length,
          reportedToday: projectsHere.filter((r) => r.reportedToday).length,
        }
      })
      .filter((e) => e.total > 0 || e.projects > 0)
      .sort((a, b) => (b.onTimePct ?? -1) - (a.onTimePct ?? -1))

    // ---- Keputusan yang menunggu
    const decisions = proposals
      .map((p) => {
        const approved = p.approvals.filter((a) => a.decision === 'DISETUJUI').map((a) => a.role)
        const rejected = p.approvals.some((a) => a.decision === 'DITOLAK')
        const slot = pendingSlot(p.approvalChain, approved)
        const mine = !rejected && slot !== null && canSignSlot(user, slot, p.entityId)
        return {
          id: p.id,
          name: p.name,
          entityName: p.entity.name,
          proposer: p.proposedBy?.name ?? 'Pengaju',
          proposedAt: p.proposedAt ?? p.createdAt,
          slot,
          mine,
        }
      })
      .filter((p) => p.mine)

    // Divisi asal eskalasi: laporan harian → proyek → divisi; butir mingguan → laporan divisi.
    const dailySrc = escalations.filter((e) => e.sourceType === 'DAILY_REPORT').map((e) => e.sourceId)
    const weeklySrc = escalations.filter((e) => e.sourceType === 'WEEKLY_ITEM').map((e) => e.sourceId)
    const [srcDaily, srcWeekly] = await Promise.all([
      dailySrc.length
        ? db.dailyProjectReport.findMany({ where: { id: { in: dailySrc } }, select: { id: true, projectId: true } })
        : Promise.resolve([]),
      weeklySrc.length
        ? db.weeklyReportItem.findMany({ where: { id: { in: weeklySrc } }, select: { id: true, weeklyReport: { select: { divisionId: true } } } })
        : Promise.resolve([]),
    ])
    const rowDivision = new Map(rows.map((r) => [r.id, r.divisionId]))
    const escDivision = new Map<string, string | null>([
      ...srcDaily.map((d) => [d.id, rowDivision.get(d.projectId) ?? null] as const),
      ...srcWeekly.map((w) => [w.id, w.weeklyReport.divisionId] as const),
    ])

    const esc = escalations.map((e) => {
      const age = Math.floor((now.getTime() - e.raisedAt.getTime()) / DAY)
      return {
        divisionId: escDivision.get(e.sourceId) ?? null,
        id: e.id,
        summary: e.summary,
        needed: e.needed,
        status: e.status,
        raisedAt: e.raisedAt,
        raisedBy: e.raisedBy?.name ?? null,
        entityName: e.entity.name,
        entityCode: e.entity.code,
        ageDays: age,
        overdue: age > e.slaDays,
      }
    })

    // ---- Output (model Output): tepat waktu = diserahkan paling lambat tenggatnya.
    const projectDivision = new Map(rows.map((r) => [r.id, r.divisionId]))
    const outputByProject = new Map<string, { done: number; total: number }>()
    const weekIdx = (t: Date | null) => {
      if (!t) return -1
      const i = Math.floor((t.getTime() - trendFrom.getTime()) / (7 * DAY))
      return i >= 0 && i < WEEKS ? i : -1
    }
    const onTimeOf = (o: (typeof outputs)[number]) => {
      const at = o.submittedAt ?? o.reviewedAt
      return Boolean(o.dueDate && at && at.getTime() <= startOfWibDay(o.dueDate).getTime() + DAY)
    }
    const outputWeekTrend = Array.from({ length: WEEKS }, () => 0)
    const MONTHS = 6
    const monthStarts = Array.from({ length: MONTHS + 1 }, (_, i) => wibMonthStart(now, MONTHS - 1 - i))
    const outputMonthTrend = Array.from({ length: MONTHS }, () => 0)
    const QUARTERS = 4
    const quarterStarts = Array.from({ length: QUARTERS + 1 }, (_, i) => wibMonthStart(now, (new Date(now.getTime() + WIB_MS).getUTCMonth() % 3) + 3 * (QUARTERS - 1 - i)))
    const outputQuarterTrend = Array.from({ length: QUARTERS }, () => 0)
    type DivOut = { total: number; done: number; active: number; review: number; onTime: number; withDue: number; trend: number[] }
    const emptyOut = (): DivOut => ({ total: 0, done: 0, active: 0, review: 0, onTime: 0, withDue: 0, trend: Array.from({ length: WEEKS }, () => 0) })
    const outByDivision = new Map<string, DivOut>()
    const outAll = emptyOut()
    for (const o of outputs) {
      const div = projectDivision.get(o.projectId) ?? null
      const targets = [outAll, ...(div ? [outByDivision.get(div) ?? outByDivision.set(div, emptyOut()).get(div)!] : [])]
      const done = o.status === 'DITERIMA'
      const bp = outputByProject.get(o.projectId) ?? { done: 0, total: 0 }
      bp.total++
      if (done) bp.done++
      outputByProject.set(o.projectId, bp)
      const wi = done ? weekIdx(o.reviewedAt) : -1
      for (const t of targets) {
        t.total++
        if (done) t.done++
        else if (o.status === 'MENUNGGU_REVIEW') t.review++
        else t.active++
        if (done && o.dueDate) {
          t.withDue++
          if (onTimeOf(o)) t.onTime++
        }
        if (wi >= 0) t.trend[wi]++
      }
      if (done && o.reviewedAt) {
        const at = o.reviewedAt.getTime()
        for (let i = 0; i < MONTHS; i++) if (at >= monthStarts[i].getTime() && at < monthStarts[i + 1].getTime()) outputMonthTrend[i]++
        for (let i = 0; i < QUARTERS; i++) if (at >= quarterStarts[i].getTime() && at < quarterStarts[i + 1].getTime()) outputQuarterTrend[i]++
      }
    }
    outAll.trend.forEach((v, i) => (outputWeekTrend[i] = v))
    const weekLabels = trend.map((t) => t.label)
    const monthLabel = (d: Date) => MONTHS_ID[new Date(d.getTime() + WIB_MS).getUTCMonth()]
    const quarterLabel = (d: Date) => {
      const w = new Date(d.getTime() + WIB_MS)
      return `K${Math.floor(w.getUTCMonth() / 3) + 1}'${String(w.getUTCFullYear()).slice(2)}`
    }

    // ---- Laporan harian 30 hari per divisi (cadangan tepat waktu bila belum ada output bertenggat)
    const dailyByDivision = new Map<string, { ok: number; total: number }>()
    // recentReports tidak memuat projectId; hitung dari proyek per entitas tidak cukup,
    // jadi cadangan memakai laporan terakhir per proyek di divisi itu.
    for (const r of rows) {
      if (!r.divisionId) continue
      const d = dailyByDivision.get(r.divisionId) ?? { ok: 0, total: 0 }
      d.total++
      if (r.reportedToday) d.ok++
      dailyByDivision.set(r.divisionId, d)
    }

    // ---- Laporan mingguan per divisi pada minggu laporan
    const readMap = new Map(readRows.map((r) => [r.weeklyReportId, r.readAt]))
    const weeklyByDivision = new Map(reportWeekly.map((w) => [w.divisionId, w]))
    const divisionSummaries = divisionRows.map((d) => {
      const w = weeklyByDivision.get(d.id)
      const submitted = Boolean(w && (w.submittedAt || w.statusHeader !== 'DRAFT'))
      const readAt = w ? (readMap.get(w.id) ?? null) : null
      const late = Boolean(w && (w.isLate || (w.submittedAt && w.submittedAt > reportDl.handoverBy)))
      const state: WeeklyState = !submitted ? 'missing' : readAt ? 'read' : late ? 'late' : 'sent'
      const items = w?.items ?? []
      const counted = items.filter((i) => i.status !== 'NA')
      const doneItems = counted.filter((i) => i.status === 'SELESAI')
      const blocked = counted.filter((i) => i.status === 'TERKENDALA' || i.needsEscalation)
      const points = [...doneItems, ...counted.filter((i) => i.status === 'ON_PROGRESS')]
        .map((i) => (i.achievementThisWeek || i.workItem).trim())
        .filter(Boolean)
        .slice(0, 3)
      const o = outByDivision.get(d.id) ?? emptyOut()
      const daily = dailyByDivision.get(d.id)
      return {
        id: d.id,
        name: d.name,
        typeName: d.divisionType?.name ?? d.name,
        entityId: d.entityId,
        entityName: d.entity.name,
        entityCode: d.entity.code,
        head: d.headUser ? { id: d.headUser.id, name: d.headUser.name, email: d.headUser.email, phone: d.headUser.phone } : null,
        projects: rows.filter((r) => r.divisionId === d.id).length,
        weekly: {
          id: w?.id ?? null,
          state,
          statusHeader: w?.statusHeader ?? null,
          submittedAt: w?.submittedAt ?? null,
          submittedBy: w?.submittedBy?.name ?? null,
          readAt,
          itemsTotal: counted.length,
          itemsDone: doneItems.length,
          summary: submitted
            ? counted.length
              ? `${doneItems.length} dari ${counted.length} pekerjaan selesai${blocked.length ? `, ${blocked.length} tertahan` : ''}.`
              : 'Laporan terkirim tanpa butir pekerjaan.'
            : null,
          points,
          obstacles: blocked.map((i) => (i.obstacleFollowUp || i.workItem).trim()).filter(Boolean).slice(0, 3),
          // [F2-DIREKTUR] jumlah tanggapan & ringkasan yang dikirim kepala divisi (0021, F2-KADIV)
          comments: w ? (commentCount.get(w.id) ?? 0) : 0,
          headSummary: (() => {
            const k = kadivSummaries.get(d.id)
            return k ? { points: k.points, sentAt: k.sentAt, outputsAccepted: k.outputsAccepted, outputsTarget: k.outputsTarget, openObstacles: k.openObstacles } : null
          })(),
        },
        outputs: {
          total: o.total,
          done: o.done,
          active: o.active,
          review: o.review,
          onTime: o.onTime,
          withDue: o.withDue,
          trend: o.trend,
        },
        onTime:
          o.withDue > 0
            ? { pct: Math.round((o.onTime / o.withDue) * 100), ok: o.onTime, total: o.withDue, basis: 'output' as const }
            : daily && daily.total > 0
              ? { pct: Math.round((daily.ok / daily.total) * 100), ok: daily.ok, total: daily.total, basis: 'laporan' as const }
              : null,
      }
    })

    // ---- Usulan geser tenggat yang menunggu pemanggil (aturan sama dengan PATCH /api/deadline-proposals:
    // peran pemutus, dalam cakupan, bukan usulan sendiri).
    const decidesDeadline = canDecideDeadline(user.role)
    const deadlineProposals = deadline
      .filter((d) => decidesDeadline && d.proposedById !== user.id)
      .map((d) => ({
        id: d.id,
        projectId: d.projectId,
        projectName: d.project.name,
        entityName: d.project.entity.name,
        divisionId: projectDivision.get(d.projectId) ?? null,
        proposer: d.proposedBy.name,
        proposedAt: d.createdAt,
        previousDate: d.previousDate,
        proposedDate: d.proposedDate,
        reason: d.reason,
      }))

    return NextResponse.json({
      kind: 'RINGKASAN' as const,
      week: isoWeek,
      scope: {
        entities: entities.length,
        divisions,
        global: scopeIds === null,
      },
      projects: rows.map((r) => ({
        ...r,
        outputsDone: outputByProject.get(r.id)?.done ?? 0,
        outputsTotal: outputByProject.get(r.id)?.total ?? 0,
        // [F2-DIREKTUR] tinjauan terakhir (siapa pun) & tinjauan saya
        lastReview: lastReview.has(r.id)
          ? { at: lastReview.get(r.id)!.at, by: reviewerNames.get(lastReview.get(r.id)!.reviewerId) ?? null }
          : null,
        reviewedByMeAt: myReview.get(r.id) ?? null,
      })),
      counts,
      progressComparison: compareProgress(
        rows.map((r) => ({ id: r.id, progress: r.progress, submittedAt: projects.find((p) => p.id === r.id)?.dailyReports[0]?.submittedAt ?? null })),
        progressHistory,
        weekStart,
      ),
      daily: {
        expected: rows.length,
        submitted: submittedToday,
        onTime30Pct: last30.length ? Math.round((onTime30 / last30.length) * 100) : 0,
        onTime30,
        total30: last30.length,
      },
      weekly: {
        expected: divisions,
        submitted: weekly.filter((w) => w.submittedAt || w.statusHeader !== 'DRAFT').length,
        approved: weekly.filter((w) => w.statusHeader === 'DISETUJUI' || w.statusHeader === 'TERKUNCI').length,
      },
      trend,
      byEntity,
      reportWeek: {
        isoYear: reportWk.isoYear,
        isoWeek: reportWk.isoWeek,
        label: 'M' + reportWk.isoWeek,
        handoverBy: reportDl.handoverBy,
        current: reportWk.isoWeek === isoWeek && reportWk.isoYear === isoYear,
      },
      divisions: divisionSummaries,
      outputs: {
        total: outAll.total,
        done: outAll.done,
        active: outAll.active,
        review: outAll.review,
        onTime: outAll.onTime,
        withDue: outAll.withDue,
        trend: {
          week: weekLabels.map((label, i) => ({ label, value: outputWeekTrend[i] })),
          month: monthStarts.slice(0, MONTHS).map((m, i) => ({ label: monthLabel(m), value: outputMonthTrend[i] })),
          quarter: quarterStarts.slice(0, QUARTERS).map((q, i) => ({ label: quarterLabel(q), value: outputQuarterTrend[i] })),
        },
      },
      deadlineProposals,
      attendance,
      viewer: {
        canRemind: can(user.role, 'notify:remind'),
        canMarkRead: READERS.includes(user.role),
        canDecideDeadline: decidesDeadline,
        // [F2-DIREKTUR]
        canComment: isWeeklyReader(user.role),
        canReview: isProjectOverseer(user.role),
        canNote: isProjectOverseer(user.role),
        canDecideApproval: isApprovalDecider(user.role),
      },
      approvalRequests,
      decisions,
      escalations: esc,
      activity: activity
        .map((a) => ({ id: a.id, who: a.actor?.name ?? 'Sistem', role: a.actor?.role ?? null, text: activityText(a.action), at: a.at }))
        .filter((a) => a.text)
        .slice(0, 6),
    })
  } catch (err) {
    // [F2-DIREKTUR] Jangan kirim err.message mentah ke klien.
    return serverError(err, 'Ringkasan belum bisa disusun. Coba lagi.', 'ringkasan')
  }
}
