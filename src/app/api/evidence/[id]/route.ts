import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rollupDailyReport } from '@/lib/daily-rollup'
import { startOfWibDay } from '@/lib/lock'
import { requireApiUser } from '@/lib/auth'
import { canReadEvidence, canWriteEvidence } from '@/lib/evidence-access'
import { removeEvidence, signedEvidenceUrl, storageConfigured } from '@/lib/storage'

export const runtime = 'nodejs'

async function syncCount(targetType: string, targetId: string) {
  const count = await db.evidence.count({ where: { targetType, targetId } })

  if (targetType === 'DAILY_REPORT') {
    const report = await db.dailyProjectReport.findUnique({
      where: { id: targetId },
      select: { projectId: true, reportDate: true },
    })
    // Recount through the roll-up so task attachments stay part of the total.
    if (report) await rollupDailyReport(report.projectId, startOfWibDay(report.reportDate))
    else await db.dailyProjectReport.updateMany({ where: { id: targetId }, data: { evidenceCount: count } })
  } else if (targetType === 'WEEKLY_ITEM') {
    await db.weeklyReportItem.updateMany({ where: { id: targetId }, data: { evidenceCount: count } })
  } else if (targetType === 'TASK') {
    const task = await db.task.findUnique({
      where: { id: targetId },
      select: { projectId: true, workDate: true },
    })
    if (task) await rollupDailyReport(task.projectId, startOfWibDay(task.workDate))
  }

  return count
}

/**
 * GET /api/evidence/[id] — hands back a way to open this piece of evidence.
 *
 * For an uploaded file that is a signed URL valid for a few minutes; for the
 * older link-style evidence it is simply the stored link. Either way the caller
 * is checked against the entity scope first.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const evidence = await db.evidence.findUnique({ where: { id } })
  if (!evidence) return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 })

  const guard = await canReadEvidence(user, evidence.targetType, evidence.targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // Link-style evidence predates file storage; hand back the link as-is.
  if (evidence.url) {
    return NextResponse.json({ url: evidence.url, kind: 'link' as const })
  }

  if (!storageConfigured()) {
    return NextResponse.json(
      { error: 'Penyimpanan berkas belum aktif di server ini', needsConfig: true },
      { status: 503 }
    )
  }

  try {
    const url = await signedEvidenceUrl(evidence.storageKey)
    return NextResponse.json({ url, kind: 'file' as const, expiresInSeconds: 300 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal membuat tautan' },
      { status: 502 }
    )
  }
}

/** DELETE /api/evidence/[id] — removes the row and, for uploads, the object. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const evidence = await db.evidence.findUnique({ where: { id } })
  if (!evidence) return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 })

  const guard = await canWriteEvidence(user, evidence.targetType, evidence.targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // Drop the object first; if that fails we keep the row rather than orphaning
  // a file nobody can reach.
  if (!evidence.url && storageConfigured()) {
    try {
      await removeEvidence(evidence.storageKey)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Gagal menghapus berkas' },
        { status: 502 }
      )
    }
  }

  await db.evidence.delete({ where: { id } })
  const count = await syncCount(evidence.targetType, evidence.targetId)

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'REMOVE_EVIDENCE',
      targetType: evidence.targetType,
      targetId: evidence.targetId,
      beforeData: JSON.stringify({ fileName: evidence.fileName, storageKey: evidence.storageKey }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  return NextResponse.json({ ok: true, evidenceCount: count })
}
