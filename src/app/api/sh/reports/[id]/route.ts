import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { can } from '@/lib/rbac'
import { visibleShReport } from '@/lib/subholding/access'
import { removeStorageObjects, shEvidenceStorageKeys } from '@/lib/subholding/evidence'
import {
  notFound,
  readJsonObject,
  requireShUser,
  shHttpErrorResponse,
  ShHttpError,
  unprocessable,
} from '@/lib/subholding/http'
import { auditSh, notifyShReviewers } from '@/lib/subholding/notify'
import { hydrateShReports, SH_REPORT_SELECT } from '@/lib/subholding/report'
import {
  adminCanEdit,
  adminCanWithdraw,
  parseShReportInput,
  SH_EVIDENCE_TARGET,
  statusAfterAdminEdit,
} from '@/lib/subholding/rules'
import { ownsSubholding, ptInSubholding, refuseWithoutAnyCap } from '@/lib/subholding/scope'

type Ctx = { params: Promise<{ id: string }> }

const LOCKED_EDIT = 'Laporan yang sudah disetujui tidak dapat diubah.'
const LOCKED_WITHDRAW = 'Laporan hanya bisa ditarik selama masih menunggu persetujuan.'

/**
 * GET /api/sh/reports/:id → { report: ShReport }
 * Admin subholding pemilik; Supervisor/Super Admin semua; Ketua Umum/Manajemen
 * hanya DISETUJUI. Di luar cakupan = 404.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutAnyCap(user, ['shreport:write', 'shreport:review', 'shreport:view-approved'])
  if (refused) return refused
  const { id } = await params
  try {
    const row = await visibleShReport(user, id)
    if (!row) return notFound()
    const [report] = await hydrateShReports([row], user)
    return NextResponse.json({ report })
  } catch (err) {
    return serverError(err, 'Laporan belum termuat. Coba lagi.', 'sh/reports/[id] GET')
  }
}

/** Gerbang awal (sebelum baca DB): hanya pemegang shreport:write atau Super Admin. */
function refuseNonWriter(user: { role: string }): NextResponse | null {
  if (user.role === 'SUPERADMIN' || can(user.role, 'shreport:write')) return null
  return NextResponse.json({ error: 'Anda tidak dapat mengubah laporan subholding' }, { status: 403 })
}

/** Hanya Admin subholding pemilik atau Super Admin yang mengubah/menarik. */
function writerKind(user: { role: string; scopeEntityId: string | null }, subholdingId: string): 'admin' | 'superadmin' | null {
  if (user.role === 'SUPERADMIN') return 'superadmin'
  if (can(user.role, 'shreport:write') && ownsSubholding(user, subholdingId)) return 'admin'
  return null
}

/**
 * PATCH /api/sh/reports/:id — isian 1–5 (boleh sebagian; yang tidak dikirim
 * memakai nilai lama). Admin: hanya MENUNGGU/PERLU_PERBAIKAN; status kembali
 * MENUNGGU (PERLU_PERBAIKAN → MENUNGGU = kirim ulang: submittedAt baru,
 * keputusan lama dikosongkan). Super Admin: status apa pun, status tetap.
 * → { report: ShReport }
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseNonWriter(user)
  if (refused) return refused
  const { id } = await params

  const body = await readJsonObject(req)
  if (body instanceof NextResponse) return body

  const current = await visibleShReport(user, id)
  const kind = current ? writerKind(user, current.subholdingId) : null
  if (!current || !kind) {
    // Pembaca (supervisor/ketum) melihat laporannya tetapi tidak mengubahnya.
    return current ? NextResponse.json({ error: 'Anda tidak dapat mengubah laporan ini' }, { status: 403 }) : notFound()
  }
  if (kind === 'admin' && !adminCanEdit(current.status)) {
    return NextResponse.json({ error: LOCKED_EDIT }, { status: 409 })
  }

  const parsed = parseShReportInput({
    kegiatan: current.kegiatan,
    deskripsi: current.deskripsi,
    ptId: current.ptId,
    reporterName: current.reporterName,
    reporterTitleKind: current.reporterTitleKind,
    reporterTitleField: current.reporterTitleField,
    ...body,
  })
  if (!parsed.ok) return unprocessable(parsed.error, parsed.field)
  const input = parsed.data

  const sub = await db.entity.findUnique({ where: { id: current.subholdingId }, select: { id: true, path: true } })
  if (!sub?.path) return unprocessable('Subholding laporan ini tidak lagi aktif')

  const resubmit = kind === 'admin' && current.status === 'PERLU_PERBAIKAN'
  try {
    const row = await db.$transaction(async (tx) => {
      const pt = await ptInSubholding({ id: sub.id, path: sub.path }, input.ptId, tx)
      if (!pt) throw new ShHttpError('PT pelaksana harus PT aktif di subholding Anda', 422)
      const now = new Date()
      // Klaim bersyarat: status harus masih bisa diubah saat UPDATE berjalan
      // (keputusan supervisor yang menyalip → 409, bukan menimpa).
      const res = await tx.subholdingReport.updateMany({
        where: kind === 'admin' ? { id, status: { in: ['MENUNGGU', 'PERLU_PERBAIKAN'] } } : { id },
        data: {
          ...input,
          ...(kind === 'admin' ? { status: statusAfterAdminEdit() } : {}),
          ...(resubmit ? { submittedAt: now, decidedById: null, decidedAt: null } : {}),
        },
      })
      if (res.count === 0) return null // kalah balapan; belum ada yang ditulis
      const before = {
        kegiatan: current.kegiatan,
        deskripsi: current.deskripsi,
        ptId: current.ptId,
        reporterName: current.reporterName,
        reporterTitleKind: current.reporterTitleKind,
        reporterTitleField: current.reporterTitleField,
        status: current.status,
      }
      await auditSh(tx, req, user, resubmit ? 'RESUBMIT_SH_REPORT' : 'UPDATE_SH_REPORT', id, {
        before,
        after: { ...input, status: kind === 'admin' ? statusAfterAdminEdit() : current.status },
      })
      return tx.subholdingReport.findUniqueOrThrow({ where: { id }, select: SH_REPORT_SELECT })
    }, { isolationLevel: 'ReadCommitted' })
    if (!row) return NextResponse.json({ error: LOCKED_EDIT }, { status: 409 })

    const [report] = await hydrateShReports([row], user)
    if (resubmit) {
      await notifyShReviewers('SH_LAPORAN_KIRIM_ULANG', {
        title: `Laporan diperbaiki: ${report.subholdingName}`,
        body: `${report.ptName}: ${report.kegiatan}`,
        tab: 'sh-review',
        reportId: id,
      })
    }
    return NextResponse.json({ report })
  } catch (err) {
    return shHttpErrorResponse(err) ?? serverError(err, 'Laporan gagal disimpan. Coba lagi.', 'sh/reports/[id] PATCH')
  }
}

/**
 * DELETE /api/sh/reports/:id — tarik laporan. Admin: hanya MENUNGGU.
 * Super Admin: status apa pun. Komentar & baris bukti ikut terhapus dalam
 * satu transaksi; berkas storage dibuang SETELAH commit. → { ok: true }
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseNonWriter(user)
  if (refused) return refused
  const { id } = await params

  const current = await visibleShReport(user, id)
  const kind = current ? writerKind(user, current.subholdingId) : null
  if (!current || !kind) {
    return current ? NextResponse.json({ error: 'Anda tidak dapat menarik laporan ini' }, { status: 403 }) : notFound()
  }
  if (kind === 'admin' && !adminCanWithdraw(current.status)) {
    return NextResponse.json({ error: LOCKED_WITHDRAW }, { status: 409 })
  }

  try {
    const keys = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SubholdingReport" WHERE "id" = ${id} FOR UPDATE`
      const keys = await shEvidenceStorageKeys([id], tx)
      const evidenceCount = await tx.evidence.count({ where: { targetType: SH_EVIDENCE_TARGET, targetId: id } })
      const gone = await tx.subholdingReport.deleteMany({
        where: kind === 'admin' ? { id, status: 'MENUNGGU' } : { id },
      })
      if (gone.count === 0) return null // kalah balapan; belum ada yang ditulis
      // Basis data menghapus komentar lewat ON DELETE CASCADE; eksplisit juga di sini.
      await tx.subholdingReportComment.deleteMany({ where: { reportId: id } })
      await tx.evidence.deleteMany({ where: { targetType: SH_EVIDENCE_TARGET, targetId: id } })
      await auditSh(tx, req, user, 'WITHDRAW_SH_REPORT', id, {
        before: {
          subholdingId: current.subholdingId,
          ptId: current.ptId,
          kegiatan: current.kegiatan,
          reporterName: current.reporterName,
          status: current.status,
          evidenceCount,
        },
      })
      return keys
    }, { isolationLevel: 'ReadCommitted' })
    if (!keys) return NextResponse.json({ error: LOCKED_WITHDRAW }, { status: 409 })
    await removeStorageObjects(keys)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return shHttpErrorResponse(err) ?? serverError(err, 'Laporan gagal ditarik. Coba lagi.', 'sh/reports/[id] DELETE')
  }
}
