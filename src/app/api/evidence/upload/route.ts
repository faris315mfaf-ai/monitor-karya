import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncEvidenceCount } from '@/lib/daily-rollup'
import { requireApiUser } from '@/lib/auth'
import { canWriteEvidence } from '@/lib/evidence-access'
import { clientIp, cleanText, contentMatchesMime, safeDisplayName } from '@/lib/security'
import {
  ALLOWED_EVIDENCE_MIME,
  MAX_EVIDENCE_BYTES,
  buildStorageKey,
  storageConfigured,
  uploadEvidence,
} from '@/lib/storage'
import { serverError } from '@/lib/api-error'

// Files are buffered in memory before going to Storage, so this must run on
// the Node runtime rather than the edge.
export const runtime = 'nodejs'

/** The extensions each accepted MIME type may arrive with. The browser sets the
 *  type from the extension, so a mismatch means the request was hand-made. */
const EXTENSIONS_FOR_MIME: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
}

/**
 * POST /api/evidence/upload — multipart upload of one supporting file.
 *
 * Fields: file, targetType, targetId, and an optional label.
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  // Tolak sebelum badan dibaca ke memori: berkas 20 MB + pembungkus multipart.
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_EVIDENCE_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { error: `Ukuran berkas melebihi ${Math.round(MAX_EVIDENCE_BYTES / 1024 / 1024)} MB` },
      { status: 413 }
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Unggahan tidak valid' }, { status: 400 })
  }

  const targetType = cleanText(form.get('targetType'), 40)
  const targetId = cleanText(form.get('targetId'), 64)
  const label = cleanText(form.get('label'), 200)
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
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!EXTENSIONS_FOR_MIME[mime]?.includes(ext)) {
    return NextResponse.json(
      { error: `Ekstensi .${ext || '?'} tidak sesuai dengan jenis berkas ${mime}.` },
      { status: 415 }
    )
  }

  // Isi berkas harus cocok dengan jenisnya (tanda tangan byte awal), jadi
  // HTML/skrip yang dinamai .png ditolak.
  const bytes = await file.arrayBuffer()
  if (!contentMatchesMime(new Uint8Array(bytes), mime)) {
    return NextResponse.json(
      { error: `Isi berkas tidak sesuai dengan jenis ${mime}. Unggah berkas aslinya.` },
      { status: 415 }
    )
  }

  const displayName = safeDisplayName(label || file.name)
  const key = buildStorageKey(targetType, targetId, file.name)
  try {
    await uploadEvidence(key, bytes, mime)
  } catch (err) {
    return serverError(err, 'Gagal mengunggah berkas. Coba lagi.', 'evidence/upload', 502)
  }

  const evidence = await db.evidence.create({
    data: {
      targetType,
      targetId,
      storageKey: key,
      fileName: displayName,
      mime,
      size: file.size,
      url: null, // read through a signed URL; never a permanent link
      uploadedById: user.id,
    },
  })

  const count = await syncEvidenceCount(targetType, targetId)

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'UPLOAD_EVIDENCE',
      targetType,
      targetId,
      afterData: JSON.stringify({ fileName: evidence.fileName, size: file.size, mime }),
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
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
