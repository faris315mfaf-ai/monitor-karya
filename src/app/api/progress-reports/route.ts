import { clientIp, safeEvidenceUrl } from '@/lib/security'
import { serverError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { can, isMasterRole } from '@/lib/rbac'
import {
  DAILY_STATUSES,
  PROGRESS_CADENCES,
  isProgressLocked,
  periodOf,
  progressLockAt,
  validateProgressReport,
  type Period,
  type ProgressCadence,
} from '@/lib/lock'
import { removeEvidence, storageConfigured } from '@/lib/storage'
import { guardProjectAccess, READ_RELATIONS } from '@/lib/pic-access'

/**
 * Laporan kemajuan proyek per MINGGU dan per BULAN (7 Sep 2026) — pelengkap
 * laporan harian, ditulis oleh PIC proyek yang sama.
 *
 *   GET    ?projectId=&cadence=  — periode-periode terakhir beserta laporannya
 *   PUT    { projectId, cadence, periodKey?, action, ... } — simpan/kirim satu periode
 *   DELETE ?id=                  — hapus laporan yang belum terkunci
 *
 * Kepemilikan mengikuti aturan laporan harian: PIC proyeknya, Admin PT
 * entitasnya, atau TI. Periode yang sudah lewat kuncinya tidak bisa diubah.
 */

/** Berapa periode ke belakang yang ditampilkan. */
const PERIODS_SHOWN: Record<ProgressCadence, number> = { MINGGUAN: 8, BULANAN: 6 }

function parseCadence(raw: unknown): ProgressCadence | null {
  return PROGRESS_CADENCES.includes(raw as ProgressCadence) ? (raw as ProgressCadence) : null
}

/** Cari periode dengan kunci ini di antara periode yang ditampilkan; null bila di luar jangkauan. */
function periodByKey(cadence: ProgressCadence, key: string): Period | null {
  // Jangkauan dibuat sedikit lebih lebar dari yang ditampilkan agar kunci
  // yang baru saja bergeser (pergantian minggu/bulan saat halaman terbuka)
  // masih dikenali.
  for (let i = 0; i < PERIODS_SHOWN[cadence] + 2; i++) {
    const p = periodOf(cadence, i)
    if (p.key === key) return p
  }
  return null
}

type Guard =
  | { ok: true; project: { id: string; entityId: string; name: string; code: string } }
  | { ok: false; res: NextResponse }

async function guardProject(user: SessionUser, projectId: string, write: boolean): Promise<Guard> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, entityId: true, picUserId: true, name: true, code: true },
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
    return { ok: false, res: NextResponse.json({ error: 'Proyek ini bukan tanggung jawab Anda' }, { status: 403 }) }
  }
  if (write && !can(user.role, 'daily:input')) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Peran Anda tidak menulis laporan kemajuan' }, { status: 403 }),
    }
  }
  return { ok: true, project }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const projectId = req.nextUrl.searchParams.get('projectId') || ''
  const cadence = parseCadence(req.nextUrl.searchParams.get('cadence'))
  if (!cadence) return NextResponse.json({ error: 'Kadens tidak dikenali' }, { status: 400 })

  // [T10-FIX2, T-2] Baca memakai relasi penuh (guardProjectAccess) agar kepala
  // divisi hanya membaca laporan kemajuan proyek divisinya, bukan se-PT.
  const guard = await guardProjectAccess(user, projectId, READ_RELATIONS)
  if (!guard.ok) return guard.res

  const periods = Array.from({ length: PERIODS_SHOWN[cadence] }, (_, i) => periodOf(cadence, i))
  const reports = await db.projectProgressReport.findMany({
    where: { projectId, cadence, periodKey: { in: periods.map((p) => p.key) } },
  })
  const byKey = new Map(reports.map((r) => [r.periodKey, r]))

  const evidence = await db.evidence.findMany({
    where: { targetType: 'PROGRESS_REPORT', targetId: { in: reports.map((r) => r.id) } },
    select: { id: true, targetId: true, fileName: true, url: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    project: guard.project,
    cadence,
    periods: periods.map((p) => {
      const r = byKey.get(p.key) ?? null
      const locked = (r?.isLocked ?? false) || isProgressLocked(p)
      return {
        key: p.key,
        start: p.start.toISOString(),
        end: p.end.toISOString(),
        lockAt: progressLockAt(p).toISOString(),
        locked,
        current: p.key === periodOf(cadence, 0).key,
        report: r
          ? {
              id: r.id,
              status: r.status,
              progressPct: r.progressPct,
              summary: r.summary,
              obstacle: r.obstacle,
              followUp: r.followUp,
              evidenceCount: r.evidenceCount,
              submittedAt: r.submittedAt,
              isLocked: r.isLocked,
              updatedAt: r.updatedAt,
              evidence: evidence.filter((e) => e.targetId === r.id).map((e) => ({ ...e, url: safeEvidenceUrl(e.url) })),
            }
          : null,
      }
    }),
  })
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

  const projectId = typeof body.projectId === 'string' ? body.projectId.slice(0, 64) : ''
  const cadence = parseCadence(body.cadence)
  if (!cadence) return NextResponse.json({ error: 'Kadens tidak dikenali' }, { status: 400 })

  const guard = await guardProject(user, projectId, true)
  if (!guard.ok) return guard.res

  const period =
    typeof body.periodKey === 'string' && body.periodKey
      ? periodByKey(cadence, body.periodKey)
      : periodOf(cadence, 0)
  if (!period) return NextResponse.json({ error: 'Periode di luar jangkauan' }, { status: 400 })

  const existing = await db.projectProgressReport.findUnique({
    where: { projectId_cadence_periodKey: { projectId, cadence, periodKey: period.key } },
  })
  if (existing?.isLocked || isProgressLocked(period)) {
    return NextResponse.json(
      { error: 'Periode ini sudah dikunci. Ajukan permohonan buka kunci.', locked: true },
      { status: 409 }
    )
  }

  const action = body.action === 'submit' ? 'submit' : 'save'
  // [T11, S-2] Panjang field dipangkas seperti laporan harian/task agar badan
  // permintaan tidak bisa menyimpan string raksasa ke DB dan jejak audit.
  const status = typeof body.status === 'string' ? body.status.slice(0, 32) : ''
  const summary = typeof body.summary === 'string' ? body.summary.slice(0, 4000) : ''
  const obstacle =
    typeof body.obstacle === 'string' && body.obstacle.trim() ? body.obstacle.slice(0, 2000) : null
  const followUp =
    typeof body.followUp === 'string' && body.followUp.trim() ? body.followUp.slice(0, 2000) : null
  const progressPct = Math.max(0, Math.min(100, Number(body.progressPct) || 0))

  const evidenceCount = existing
    ? await db.evidence.count({ where: { targetType: 'PROGRESS_REPORT', targetId: existing.id } })
    : 0

  const errors =
    action === 'submit'
      ? validateProgressReport({ status, summary, evidenceCount, obstacle, followUp })
      : !DAILY_STATUSES.includes(status as (typeof DAILY_STATUSES)[number]) || !summary.trim()
        ? ['Status dan ringkasan capaian wajib diisi.']
        : []
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors, evidenceCount }, { status: 422 })
  }

  const data = {
    status,
    progressPct,
    summary,
    obstacle,
    followUp,
    evidenceCount,
    ...(action === 'submit' ? { submittedById: user.id, submittedAt: new Date() } : {}),
  }

  // [T11, S-3/R-6] Galat tulis tidak lagi lolos mentah: kiriman bersamaan untuk
  // periode yang sama (P2002) dibalas 409, galat lain 500 umum.
  let report: { id: string }
  try {
    report = existing
      ? await db.projectProgressReport.update({ where: { id: existing.id }, data })
      : await db.projectProgressReport.create({
          data: {
            ...data,
            projectId,
            entityId: guard.project.entityId,
            cadence,
            periodKey: period.key,
            periodStart: period.start,
            periodEnd: period.end,
          },
        })

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: action === 'submit' ? 'SUBMIT_PROGRESS_REPORT' : 'SAVE_PROGRESS_REPORT',
        targetType: 'PROGRESS_REPORT',
        targetId: report.id,
        beforeData: existing ? JSON.stringify({ status: existing.status, progressPct: existing.progressPct }) : null,
        afterData: JSON.stringify({ cadence, periodKey: period.key, status, progressPct }),
        ip: clientIp(req),
        userAgent: req.headers.get('user-agent') || null,
      },
    })
  } catch (err) {
    if ((err as { code?: unknown })?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Laporan periode ini sedang disimpan bersamaan. Muat ulang lalu kirim lagi.', locked: false },
        { status: 409 }
      )
    }
    return serverError(err, 'Laporan kemajuan gagal disimpan.', 'progress-reports PUT')
  }

  return NextResponse.json({ ok: true, reportId: report.id, periodKey: period.key, submitted: action === 'submit' })
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const id = (req.nextUrl.searchParams.get('id') || '').slice(0, 64)
  const existing = await db.projectProgressReport.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })

  const guard = await guardProject(user, existing.projectId, true)
  if (!guard.ok) return guard.res

  const period: Period = {
    cadence: existing.cadence as ProgressCadence,
    key: existing.periodKey,
    start: existing.periodStart,
    end: existing.periodEnd,
  }
  if (existing.isLocked || isProgressLocked(period)) {
    return NextResponse.json({ error: 'Laporan ini sudah dikunci dan tidak dapat dihapus.', locked: true }, { status: 409 })
  }

  // [T11, S-3] Penghapusan dibungkus agar galat tak terduga tidak bocor mentah.
  try {
    // Lampirannya ikut dihapus — dari penyimpanan dulu, lalu barisnya.
    const files = await db.evidence.findMany({ where: { targetType: 'PROGRESS_REPORT', targetId: id } })
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
    await db.evidence.deleteMany({ where: { targetType: 'PROGRESS_REPORT', targetId: id } })
    await db.projectProgressReport.delete({ where: { id } })

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'DELETE_PROGRESS_REPORT',
        targetType: 'PROGRESS_REPORT',
        targetId: id,
        beforeData: JSON.stringify({ cadence: existing.cadence, periodKey: existing.periodKey, status: existing.status }),
        ip: clientIp(req),
      },
    })

  } catch (err) {
    return serverError(err, 'Laporan kemajuan gagal dihapus.', 'progress-reports DELETE')
  }

  return NextResponse.json({ ok: true })
}
