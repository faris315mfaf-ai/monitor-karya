import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { serverError } from '@/lib/api-error'
import { requireShUser } from '@/lib/subholding/http'
import { missingReportReminders } from '@/lib/subholding/reminders'
import { reporterTitle, SH_EVIDENCE_TARGET } from '@/lib/subholding/rules'
import { requireShAdmin } from '@/lib/subholding/scope'
import { inboxWhere } from '@/lib/subholding/inbox'

/**
 * GET /api/sh/inbox (ADMIN_SUBHOLDING) — kotak masuk: komentar, permintaan
 * perbaikan, dan catatan setuju dari Supervisor (100 terbaru), plus pengingat
 * PT yang belum punya laporan pada hari kerja sebelumnya.
 * → { items: [{ id, kind, body, createdAt, unread, authorName,
 *       report: { id, kegiatan, ptName, status, reporterName, reporterTitle, submittedAt, evidenceCount } }],
 *     reminders: [{ id, text, createdAt }], unreadCount }
 */
export async function GET() {
  const user = await requireShUser()
  if (user instanceof NextResponse) return user
  const sub = await requireShAdmin(user)
  if (sub instanceof NextResponse) return sub

  try {
    const where = inboxWhere(sub.id)
    const [comments, unreadCount, reminders] = await Promise.all([
      db.subholdingReportComment.findMany({
        where,
        select: { id: true, reportId: true, authorId: true, kind: true, body: true, createdAt: true, readAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.subholdingReportComment.count({ where: { ...where, readAt: null } }),
      missingReportReminders(sub),
    ])

    const reportIds = Array.from(new Set(comments.map((c) => c.reportId)))
    const authorIds = Array.from(new Set(comments.map((c) => c.authorId)))
    const [reports, authors, evidence] = await Promise.all([
      db.subholdingReport.findMany({
        where: { id: { in: reportIds }, subholdingId: sub.id },
        select: {
          id: true,
          ptId: true,
          kegiatan: true,
          status: true,
          reporterName: true,
          reporterTitleKind: true,
          reporterTitleField: true,
          submittedAt: true,
        },
      }),
      db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } }),
      db.evidence.findMany({
        where: { targetType: SH_EVIDENCE_TARGET, targetId: { in: reportIds } },
        select: { targetId: true },
      }),
    ])
    const ptIds = Array.from(new Set(reports.map((r) => r.ptId)))
    const pts = await db.entity.findMany({ where: { id: { in: ptIds } }, select: { id: true, name: true } })

    const ptName = new Map(pts.map((p) => [p.id, p.name]))
    const authorName = new Map(authors.map((a) => [a.id, a.name]))
    const evidenceCount = new Map<string, number>()
    for (const e of evidence) evidenceCount.set(e.targetId, (evidenceCount.get(e.targetId) ?? 0) + 1)
    const reportById = new Map(reports.map((r) => [r.id, r]))

    const items = comments.flatMap((c) => {
      const r = reportById.get(c.reportId)
      if (!r) return []
      return [
        {
          id: c.id,
          kind: c.kind,
          body: c.body,
          createdAt: c.createdAt,
          unread: c.readAt === null,
          authorName: authorName.get(c.authorId) ?? 'Akun dihapus',
          report: {
            id: r.id,
            kegiatan: r.kegiatan,
            ptName: ptName.get(r.ptId) ?? '',
            status: r.status,
            reporterName: r.reporterName,
            reporterTitle: reporterTitle(r.reporterTitleKind, r.reporterTitleField),
            submittedAt: r.submittedAt,
            evidenceCount: evidenceCount.get(r.id) ?? 0,
          },
        },
      ]
    })
    return NextResponse.json({ items, reminders, unreadCount })
  } catch (err) {
    return serverError(err, 'Kotak masuk belum termuat. Coba lagi.', 'sh/inbox GET')
  }
}
