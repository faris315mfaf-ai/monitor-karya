import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rollupDailyReport } from '@/lib/daily-rollup'
import { startOfWibDay } from '@/lib/lock'
import { requireApiUser } from '@/lib/auth'
import { canWriteEvidence } from '@/lib/evidence-access'
import {
  ALLOWED_EVIDENCE_MIME,
  MAX_EVIDENCE_BYTES,
  buildStorageKey,
  storageConfigured,
  uploadEvidence,
} from '@/lib/storage'

// Files are buffered in memory before going to Storage, so this must run on
// the Node runtime rather than the edge.
export const runtime = 'nodejs'

/** Recount and cache the evidence total on the parent row. */
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
 * POST /api/evidence/upload — multipart upload of one supporting file.
 *
 * Fields: file, targetType, targetId, and an optional label.
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Unggahan tidak valid' }, { status: 400 })
  }

  const targetType = String(form.get('targetType') ?? '')
  const targetId = String(form.get('targetId') ?? '')
  const label = String(form.get('label') ?? '').trim()
  const file = form.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Berkas wajib dipilih' }, { status: 422 })
  }

  const guard = await canWriteEvidence(user, targetType, targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // Checked only after authorisation, so an unauthorised caller learns nothing
  // about how this server is configured.
  if (!storageConfigured()) {
    return NextResponse.json(
      {
        error:
          'Penyimpanan berkas belum aktif. Isi SUPABASE_SERVICE_ROLE_KEY di .env, lalu jalankan ulang server.',
        needsConfig: true,
      },
      { status: 503 }
    )
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Berkas kosong' }, { status: 422 })
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    return NextResponse.json(
      { error: `Ukuran berkas melebihi ${Math.round(MAX_EVIDENCE_BYTES / 1024 / 1024)} MB` },
      { status: 413 }
    )
  }
  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_EVIDENCE_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Jenis berkas ${mime} tidak diizinkan. Gunakan gambar, PDF, dokumen Office, atau teks.` },
      { status: 415 }
    )
  }

  const key = buildStorageKey(targetType, targetId, file.name)
  try {
    await uploadEvidence(key, await file.arrayBuffer(), mime)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal mengunggah berkas' },
      { status: 502 }
    )
  }

  const evidence = await db.evidence.create({
    data: {
      targetType,
      targetId,
      storageKey: key,
      fileName: label || file.name,
      mime,
      size: file.size,
      url: null, // read through a signed URL; never a permanent link
      uploadedById: user.id,
    },
  })

  const count = await syncCount(targetType, targetId)

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'UPLOAD_EVIDENCE',
      targetType,
      targetId,
      afterData: JSON.stringify({ fileName: evidence.fileName, size: file.size, mime }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json({
    ok: true,
    evidence: {
      id: evidence.id,
      fileName: evidence.fileName,
      mime: evidence.mime,
      size: evidence.size,
      storageKey: evidence.storageKey,
      url: null,
      createdAt: evidence.createdAt,
    },
    evidenceCount: count,
  })
}
