import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { canReadEvidence, canWriteEvidence } from '@/lib/evidence-access'
import { syncEvidenceCount } from '@/lib/daily-rollup'
import { cleanText, clientIp, safeDisplayName } from '@/lib/security'

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

/** URL http(s) yang benar-benar bisa diurai, tanpa kredensial tertanam. */
function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password && !!u.hostname
  } catch {
    return false
  }
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

  const targetType = cleanText(body.targetType, 40)
  const targetId = cleanText(body.targetId, 64)
  const fileNameRaw = cleanText(body.fileName, 200)
  const fileName = fileNameRaw ? safeDisplayName(fileNameRaw) : ''
  // Tautan lebih dari 2.000 karakter ditolak, bukan dipotong diam-diam.
  const url = typeof body.url === 'string' && body.url.length <= 2000 ? cleanText(body.url, 2000) : ''

  const guard = await canWriteEvidence(user, targetType, targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  if (!fileName) {
    return NextResponse.json({ error: 'Nama/keterangan bukti wajib diisi' }, { status: 422 })
  }
  if (!/^https?:\/\/\S+$/i.test(url) || !isHttpUrl(url)) {
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

  const count = await syncEvidenceCount(targetType, targetId)

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'ATTACH_EVIDENCE',
      targetType,
      targetId,
      afterData: JSON.stringify({ fileName, url }),
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
    },
  })

  return NextResponse.json({ ok: true, evidence, evidenceCount: count })
}
