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
  removeEvidence,
  storageConfigured,
  uploadEvidence,
} from '@/lib/storage'
import { serverError } from '@/lib/api-error'
import { ShEvidenceRefusal, lockShReportForEvidence } from '@/lib/subholding/evidence'
import { SH_EVIDENCE_TARGET } from '@/lib/subholding/rules'
import { findIdempotentReplay, isUniqueViolation, readIdempotencyKey, recordIdempotentResponse } from '@/lib/idempotency'

const IDEMPOTENT_ROUTE = 'POST /api/evidence/upload'

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
 *
 * Header opsional `Idempotency-Key` (outbox Android UNGGAH_BUKTI, 13 Okt 2026):
 * ulangan berkunci sama dari pengguna yang sama dibalas respons pertama SEBELUM
 * berkas dibaca/diunggah, jadi tidak ada bukti ganda. Tanpa header: tidak berubah.
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser({ allowSubholdingRoles: true })
  if (user instanceof NextResponse) return user

  const idem = readIdempotencyKey(req)
  if (!idem.ok) return idem.res
  const idemKey = idem.key
  if (idemKey) {
    const replay = await findIdempotentReplay(db, user.id, idemKey, IDEMPOTENT_ROUTE)
    if (replay) return replay
  }

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
    const driver = process.env.STORAGE_DRIVER ?? 'supabase'
    const message = driver === 'supabase'
      ? 'Penyimpanan berkas belum aktif. Isi SUPABASE_SERVICE_ROLE_KEY di .env, lalu jalankan ulang server.'
      : driver === 's3'
        ? 'Penyimpanan S3 belum aktif. Periksa konfigurasi S3 di server, lalu jalankan ulang server.'
        : 'Penyimpanan berkas belum aktif. Periksa STORAGE_DRIVER di server: supabase atau s3.'
    return NextResponse.json(
      {
        error: message,
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

  // [T11-DB] Objek sudah di storage; bila transaksi DB gagal, objeknya dibuang supaya tidak
  // yatim di bucket. [T12] Baris + hitung ulang cache + audit satu transaksi.
  let payload
  try {
    payload = await db.$transaction(async (tx) => {
      // Laporan subholding: status diperiksa ulang dengan baris laporan terkunci.
      if (targetType === SH_EVIDENCE_TARGET) {
        await lockShReportForEvidence(tx, targetId, { bypassLock: user.role === 'SUPERADMIN' })
      }
      const created = await tx.evidence.create({
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
      const total = await syncEvidenceCount(targetType, targetId, tx)
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'UPLOAD_EVIDENCE',
          targetType,
          targetId,
          afterData: JSON.stringify({ fileName: created.fileName, size: file.size, mime }),
          ip: clientIp(req),
          userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
        },
      })
      const body = {
        ok: true,
        evidence: {
          id: created.id,
          fileName: created.fileName,
          mime: created.mime,
          size: created.size,
          storageKey: created.storageKey,
          url: null,
          createdAt: created.createdAt,
        },
        evidenceCount: total,
      }
      // Kunci dicatat di transaksi yang sama: ulangan bersamaan gagal P2002 di sini
      // dan seluruh barisnya batal (tanpa bukti ganda).
      if (idemKey) await recordIdempotentResponse(tx, user.id, idemKey, IDEMPOTENT_ROUTE, { status: 200, body })
      return body
    }, { isolationLevel: 'ReadCommitted' })
  } catch (err) {
    try { await removeEvidence(key) } catch { /* Sisa objek ditangani retensi bucket. */ }
    if (idemKey && isUniqueViolation(err)) {
      const winner = await findIdempotentReplay(db, user.id, idemKey, IDEMPOTENT_ROUTE)
      if (winner) return winner
    }
    if (err instanceof ShEvidenceRefusal) return NextResponse.json({ error: err.message }, { status: err.status })
    return serverError(err, 'Gagal menyimpan berkas. Coba lagi.', 'evidence/upload create', 500)
  }

  return NextResponse.json(payload)
}
