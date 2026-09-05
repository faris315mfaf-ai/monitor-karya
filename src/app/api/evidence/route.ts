import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { canReadEvidence, canWriteEvidence } from '@/lib/evidence-access'

/**
 * Supporting evidence attached to a report line.
 *
 *   GET  — list what is attached to one target.
 *   POST — attach a labelled external link.
 *
 * Uploaded files go through /api/evidence/upload instead and live in Supabase
 * Storage; both kinds share these rows, so the "at least one piece of evidence"
 * validation counts them together.
 */

/** Recount and cache the evidence total on the parent row. */
async function syncCount(targetType: string, targetId: string) {
  const count = await db.evidence.count({ where: { targetType, targetId } })
  if (targetType === 'DAILY_REPORT') {
    await db.dailyProjectReport.updateMany({ where: { id: targetId }, data: { evidenceCount: count } })
  } else if (targetType === 'WEEKLY_ITEM') {
    await db.weeklyReportItem.updateMany({ where: { id: targetId }, data: { evidenceCount: count } })
  }
  return count
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const targetType = req.nextUrl.searchParams.get('targetType') || ''
  const targetId = req.nextUrl.searchParams.get('targetId') || ''
  const guard = await canReadEvidence(user, targetType, targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const items = await db.evidence.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ items, total: items.length })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const targetType = typeof body.targetType === 'string' ? body.targetType : ''
  const targetId = typeof body.targetId === 'string' ? body.targetId : ''
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''

  const guard = await canWriteEvidence(user, targetType, targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  if (!fileName) {
    return NextResponse.json({ error: 'Nama/keterangan bukti wajib diisi' }, { status: 422 })
  }
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return NextResponse.json(
      { error: 'Tautan bukti harus berupa URL yang diawali http:// atau https://' },
      { status: 422 }
    )
  }

  const evidence = await db.evidence.create({
    data: {
      targetType,
      targetId,
      storageKey: `link:${targetType}:${targetId}:${Date.now()}`,
      fileName,
      mime: 'text/uri-list',
      size: url.length,
      url,
      uploadedById: user.id,
    },
  })

  const count = await syncCount(targetType, targetId)

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'ATTACH_EVIDENCE',
      targetType,
      targetId,
      afterData: JSON.stringify({ fileName, url }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json({ ok: true, evidence, evidenceCount: count })
}
