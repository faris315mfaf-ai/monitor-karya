import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { visibleShReport } from '@/lib/subholding/access'
import {
  notFound,
  readJsonObject,
  requireShUser,
  shHttpErrorResponse,
  ShHttpError,
  unprocessable,
} from '@/lib/subholding/http'
import { auditSh, notifyShAdmins } from '@/lib/subholding/notify'
import { hydrateShReports, SH_REPORT_SELECT } from '@/lib/subholding/report'
import { canDecide, parseShDecision, SH_EVIDENCE_TARGET } from '@/lib/subholding/rules'
import { refuseWithoutCap } from '@/lib/subholding/scope'

type Ctx = { params: Promise<{ id: string }> }

const ALREADY_DECIDED = 'Laporan ini sudah diputuskan atau sedang diperbaiki. Muat ulang untuk melihat statusnya.'
const NO_EVIDENCE = 'Laporan belum memiliki bukti. Persetujuan membutuhkan minimal satu bukti.'

/**
 * POST /api/sh/reports/:id/decision (`shreport:review`: Supervisor, Super Admin)
 * { action: 'approve' | 'revise', note?, highlight?: boolean, highlightNote?: string }
 *  - revise: note wajib ≥5 huruf → status PERLU_PERBAIKAN + komentar PERBAIKAN.
 *    `highlight`/`highlightNote` diabaikan.
 *  - approve: note opsional (komentar SETUJU); wajib ≥1 bukti (409 bila tidak)
 *    → status DISETUJUI (terkunci). `highlight: true` → `highlightNote` wajib
 *    ≥5 huruf dan ≤280 karakter (422 bila tidak); sorotan + catatan +
 *    `highlightedAt` disimpan di UPDATE klaim yang sama (satu transaksi) dan
 *    dicatat di AuditLog. Catatan sorotan TIDAK dikirim ke Admin subholding
 *    (notifikasi hanya memuat `note`).
 * Klaim bersyarat `status = MENUNGGU` di dalam transaksi: dua klik / dua
 * supervisor bersamaan → satu berhasil, yang lain 409. Bukti dihitung SETELAH
 * baris laporan terkunci oleh UPDATE, dan hapus bukti mengunci baris yang sama
 * (src/lib/subholding/evidence.ts), jadi persetujuan tanpa bukti tidak lolos.
 * → { report: ShReport }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutCap(user, 'shreport:review')
  if (refused) return refused
  const { id } = await params

  const body = await readJsonObject(req)
  if (body instanceof NextResponse) return body
  const parsed = parseShDecision(body)
  if (!parsed.ok) return unprocessable(parsed.error, parsed.field)
  const { action, note, highlight, highlightNote } = parsed.data

  const current = await visibleShReport(user, id)
  if (!current) return notFound()
  if (!canDecide(current.status)) return NextResponse.json({ error: ALREADY_DECIDED }, { status: 409 })

  const status = action === 'approve' ? 'DISETUJUI' : 'PERLU_PERBAIKAN'
  try {
    const row = await db.$transaction(async (tx) => {
      const now = new Date()
      const claim = await tx.subholdingReport.updateMany({
        where: { id, status: 'MENUNGGU' },
        data: {
          status,
          decidedById: user.id,
          decidedAt: now,
          ...(highlight ? { highlight: true, highlightNote, highlightedAt: now } : {}),
        },
      })
      // Kalah balapan: belum ada yang ditulis, cukup kembalikan null (→ 409).
      if (claim.count === 0) return null
      if (action === 'approve') {
        const evidence = await tx.evidence.count({ where: { targetType: SH_EVIDENCE_TARGET, targetId: id } })
        if (evidence === 0) throw new ShHttpError(NO_EVIDENCE, 409)
      }
      if (note) {
        await tx.subholdingReportComment.create({
          data: { reportId: id, authorId: user.id, kind: action === 'approve' ? 'SETUJU' : 'PERBAIKAN', body: note },
        })
      }
      await auditSh(tx, req, user, action === 'approve' ? 'APPROVE_SH_REPORT' : 'REVISE_SH_REPORT', id, {
        before: { status: current.status },
        after: {
          status,
          note: note || null,
          ...(action === 'approve' ? { highlight, highlightNote } : {}),
        },
      })
      return tx.subholdingReport.findUniqueOrThrow({ where: { id }, select: SH_REPORT_SELECT })
    }, { isolationLevel: 'ReadCommitted' })
    if (!row) return NextResponse.json({ error: ALREADY_DECIDED }, { status: 409 })

    const [report] = await hydrateShReports([row], user)
    await notifyShAdmins(row.subholdingId, 'SH_KEPUTUSAN', {
      title: action === 'approve' ? `Laporan disetujui: ${report.kegiatan}` : `Perlu perbaikan: ${report.kegiatan}`,
      body: note || (action === 'approve' ? 'Laporan Anda sudah disetujui.' : ''),
      tab: 'sh-inbox',
      reportId: id,
    })
    return NextResponse.json({ report })
  } catch (err) {
    return shHttpErrorResponse(err) ?? serverError(err, 'Keputusan gagal disimpan. Coba lagi.', 'sh/decision POST')
  }
}
