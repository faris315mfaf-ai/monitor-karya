import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { visibleShReport } from '@/lib/subholding/access'
import { notFound, readJsonObject, requireShUser, unprocessable } from '@/lib/subholding/http'
import { auditSh } from '@/lib/subholding/notify'
import { hydrateShReports } from '@/lib/subholding/report'
import { parseShComment } from '@/lib/subholding/rules'
import { refuseWithoutAnyCap } from '@/lib/subholding/scope'

type Ctx = { params: Promise<{ id: string; commentId: string }> }

const NOT_YOURS = 'Hanya penulis yang dapat mengubah komentar ini'
const COMMENT_GONE = 'Komentar tidak ditemukan'

/**
 * PATCH /api/sh/reports/:id/comments/:commentId { body } — penulis mengubah
 * isi komentarnya sendiri (semua jenis: KOMENTAR, BALASAN, PERBAIKAN, SETUJU),
 * pada status laporan apa pun. Jenis dan waktu kirim tetap; `editedAt` diisi.
 *  - Bukan penulis → 403; komentar bukan milik laporan ini → 404.
 *  - Isi sama persis → 200 tanpa menulis apa pun.
 *  - `readAt` dikosongkan supaya pihak lawan melihatnya lagi sebagai belum
 *    dibaca di kotak masuk (tanpa notifikasi baru).
 * Isi lama + baru dicatat di AuditLog (EDIT_SH_COMMENT).
 * → { comment: ShComment, report: ShReport }
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutAnyCap(user, ['shreport:write', 'shreport:review'])
  if (refused) return refused
  const { id, commentId } = await params

  const row = await visibleShReport(user, id)
  if (!row) return notFound()
  const current = await db.subholdingReportComment.findFirst({
    where: { id: commentId, reportId: id },
    select: { id: true, authorId: true, kind: true, body: true },
  })
  if (!current) return NextResponse.json({ error: COMMENT_GONE }, { status: 404 })
  if (current.authorId !== user.id) return NextResponse.json({ error: NOT_YOURS }, { status: 403 })

  const body = await readJsonObject(req)
  if (body instanceof NextResponse) return body
  const parsed = parseShComment(body)
  if (!parsed.ok) return unprocessable(parsed.error, parsed.field)
  const next = parsed.data.body

  try {
    if (next !== current.body) {
      await db.$transaction(async (tx) => {
        await tx.subholdingReportComment.update({
          where: { id: commentId },
          data: { body: next, editedAt: new Date(), readAt: null },
        })
        await auditSh(tx, req, user, 'EDIT_SH_COMMENT', id, {
          before: { commentId, kind: current.kind, body: current.body },
          after: { commentId, kind: current.kind, body: next },
        })
      }, { isolationLevel: 'ReadCommitted' })
    }
    const [report] = await hydrateShReports([row], user)
    const comment = report.comments.find((c) => c.id === commentId) ?? null
    return NextResponse.json({ comment, report })
  } catch (err) {
    return serverError(err, 'Komentar gagal diubah. Coba lagi.', 'sh/reports/[id]/comments/[commentId] PATCH')
  }
}
