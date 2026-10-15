import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { can } from '@/lib/rbac'
import { visibleShReport } from '@/lib/subholding/access'
import { notFound, readJsonObject, requireShUser, unprocessable } from '@/lib/subholding/http'
import { auditSh, notifyShAdmins, notifyShReviewers } from '@/lib/subholding/notify'
import { hydrateShReports } from '@/lib/subholding/report'
import { parseShComment } from '@/lib/subholding/rules'
import { ownsSubholding, refuseWithoutAnyCap } from '@/lib/subholding/scope'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/sh/reports/:id/comments { body } — boleh pada status apa pun.
 *  - Admin subholding pemilik → kind BALASAN (Supervisor diberi notifikasi)
 *  - Supervisor / Super Admin (`shreport:review`) → kind KOMENTAR (Admin
 *    subholding diberi notifikasi; muncul di kotak masuknya)
 * Superuser / Manajemen tidak berkomentar (403).
 * → 201 { comment: ShComment, report: ShReport }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const refused = refuseWithoutAnyCap(user, ['shreport:write', 'shreport:review'])
  if (refused) return refused
  const { id } = await params

  const row = await visibleShReport(user, id)
  if (!row) return notFound()
  const kind = can(user.role, 'shreport:write') && ownsSubholding(user, row.subholdingId)
    ? 'BALASAN'
    : can(user.role, 'shreport:review')
      ? 'KOMENTAR'
      : null
  if (!kind) return NextResponse.json({ error: 'Anda tidak dapat berkomentar pada laporan ini' }, { status: 403 })

  const body = await readJsonObject(req)
  if (body instanceof NextResponse) return body
  const parsed = parseShComment(body)
  if (!parsed.ok) return unprocessable(parsed.error, parsed.field)

  try {
    const created = await db.$transaction(async (tx) => {
      const c = await tx.subholdingReportComment.create({
        data: { reportId: id, authorId: user.id, kind, body: parsed.data.body },
        select: { id: true },
      })
      await auditSh(tx, req, user, 'COMMENT_SH_REPORT', id, { after: { commentId: c.id, kind, body: parsed.data.body } })
      return c
    }, { isolationLevel: 'ReadCommitted' })

    const [report] = await hydrateShReports([row], user)
    const comment = report.comments.find((c) => c.id === created.id) ?? null
    const preview = parsed.data.body.length > 140 ? `${parsed.data.body.slice(0, 139)}…` : parsed.data.body
    if (kind === 'KOMENTAR') {
      await notifyShAdmins(row.subholdingId, 'SH_KOMENTAR', {
        title: `Komentar supervisor: ${report.kegiatan}`,
        body: preview,
        tab: 'sh-inbox',
        reportId: id,
      }, user.id)
    } else {
      await notifyShReviewers('SH_KOMENTAR', {
        title: `Balasan ${report.subholdingName}: ${report.kegiatan}`,
        body: preview,
        tab: 'sh-review',
        reportId: id,
      }, user.id)
    }
    return NextResponse.json({ comment, report }, { status: 201 })
  } catch (err) {
    return serverError(err, 'Komentar gagal dikirim. Coba lagi.', 'sh/reports/[id]/comments POST')
  }
}
