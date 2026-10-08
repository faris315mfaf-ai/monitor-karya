import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { serverError } from '@/lib/api-error'
import { isDailyLocked } from '@/lib/lock'
import { formatDateShort } from '@/lib/format'
import { READ_RELATIONS, guardProjectAccess } from '@/lib/pic-access'
import { nearestDeadlines, reportHistory, weeklyProgress, wibMidnight, type OutputInput, type StageInput } from '@/lib/pic-progress'

/**
 * GET /api/project-progress?projectId= — data layar PIC proyek yang dihitung
 * dari beberapa tabel (05-pic-proyek.md) [F2-PIC]:
 *
 *   today     — laporan harian hari ini (jam terkirim untuk lencana header)
 *   plan      — progres aktual vs rencana 6 minggu ISO terakhir (rencana dari
 *               ProjectStage; tanpa tahapan: linear mulai → tenggat)
 *   deadlines — tenggat terdekat dari tahapan, output, dan tenggat proyek
 *   history   — riwayat laporan 6 hari kerja, termasuk hari yang tidak dikirim
 *
 * Hanya baca. Akses sama dengan tahapan/output: PIC proyek itu, kepala divisi
 * pelaksananya, Admin PT-nya, master, dan peran pantau dalam cakupan entitas.
 * Tabel fitur P2 (tahapan, output, usulan) dibaca terpisah: bila migrasinya
 * belum diterapkan, bagian itu kosong dan sisanya tetap jalan.
 */

const WEEKS = 6
const HISTORY_DAYS = 6

async function optional<T>(label: string, q: Promise<T>, empty: T): Promise<T> {
  try {
    return await q
  } catch (err) {
    console.error(`[project-progress] ${label} belum bisa dibaca:`, err instanceof Error ? err.message : err)
    return empty
  }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const raw = req.nextUrl.searchParams.get('projectId')
  const guard = await guardProjectAccess(user, raw ? raw.slice(0, 64) : raw, READ_RELATIONS)
  if (!guard.ok) return guard.res

  try {
    const now = new Date()
    const projectId = guard.project.id
    const since = new Date(wibMidnight(now).getTime() - (WEEKS * 7 + 7) * 86400000)

    const [project, reports, stages, outputs, proposal] = await Promise.all([
      db.project.findUnique({ where: { id: projectId }, select: { startDate: true, targetEndDate: true } }),
      db.dailyProjectReport.findMany({
        where: { projectId, reportDate: { gte: since } },
        orderBy: { reportDate: 'asc' },
        select: { reportDate: true, progressPct: true, status: true, submittedAt: true, forwardedAt: true, isLate: true },
      }),
      optional<StageInput[]>(
        'tahapan',
        db.projectStage.findMany({
          where: { projectId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true, position: true, startDate: true, dueDate: true, status: true, note: true },
        }),
        []
      ),
      optional<OutputInput[]>(
        'output',
        db.output.findMany({
          where: { projectId, status: { not: 'DITERIMA' }, dueDate: { not: null } },
          orderBy: { dueDate: 'asc' },
          take: 20,
          select: { id: true, title: true, status: true, dueDate: true },
        }),
        []
      ),
      optional(
        'usulan tenggat',
        db.deadlineProposal.findFirst({ where: { projectId, status: 'DIAJUKAN' }, select: { proposedDate: true } }),
        null
      ),
    ])
    const p = { startDate: project?.startDate ?? null, targetEndDate: project?.targetEndDate ?? null }
    const todayKey = wibMidnight(now).getTime()
    const today = reports.find((r) => r.reportDate.getTime() === todayKey) ?? null

    return NextResponse.json({
      projectId,
      today: today
        ? { submittedAt: today.submittedAt, forwardedAt: today.forwardedAt, isLate: today.isLate, progressPct: today.progressPct }
        : null,
      plan: weeklyProgress({ stages, project: p, reports, now, weeks: WEEKS }),
      deadlines: nearestDeadlines({ stages, outputs, project: p, proposal, now, formatDate: (d) => formatDateShort(d) }),
      history: reportHistory({ reports, now, days: HISTORY_DAYS, cutoffPassed: (d) => isDailyLocked(d, now) }),
    })
  } catch (err) {
    return serverError(err, 'Progres proyek belum bisa dimuat. Coba lagi.', 'project-progress')
  }
}
