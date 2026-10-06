import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { isMasterRole } from '@/lib/rbac'
import { auditPic } from '@/lib/pic-access'
import { cleanText, contentMatchesMime, safeDisplayName } from '@/lib/security'
import {
  ALLOWED_EVIDENCE_MIME, MAX_EVIDENCE_BYTES, buildStorageKey, removeEvidence, signedEvidenceUrl, storageConfigured, uploadEvidence,
} from '@/lib/storage'
import { serverError } from '@/lib/api-error'
import { MIGRATION_PENDING_MESSAGE, isMissingTable } from '@/lib/oversight'
import { isApprovalDecider } from '@/lib/oversight-shared'

// Berkas dibaca ke memori sebelum dikirim ke Storage.
export const runtime = 'nodejs'

/**
 * [F2-DIREKTUR] Berkas pendukung permintaan persetujuan (materi video, rincian
 * anggaran, surat cuti). Disimpan di Supabase Storage (bucket evidence yang sama,
 * prefix APPROVAL_REQUEST/), dibaca lewat tautan bertanda tangan 5 menit.
 *
 *   POST multipart { id, file } — pengaju melampirkan/mengganti berkas selama DIAJUKAN
 *   GET  ?id=                    — tautan baca untuk pengaju dan pengawas dalam cakupan PT
 *
 * Aturan jenis & ukuran sama dengan /api/evidence/upload.
 */

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

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const id = cleanText(req.nextUrl.searchParams.get('id'), 64)
  try {
    const row = id
      ? await db.approvalRequest.findUnique({ where: { id }, select: { id: true, entityId: true, requestedById: true, fileKey: true, fileName: true } })
      : null
    const scope = await scopeEntityIds(user)
    const ok =
      row &&
      (row.requestedById === user.id ||
        isMasterRole(user.role) ||
        ((isApprovalDecider(user.role) || user.role === 'AUDITOR') && (scope === null || scope.includes(row.entityId))))
    if (!row || !ok || !row.fileKey) return NextResponse.json({ error: 'Berkas tidak ditemukan' }, { status: 404 })
    if (!storageConfigured()) return NextResponse.json({ error: 'Penyimpanan berkas belum aktif.' }, { status: 503 })
    const url = await signedEvidenceUrl(row.fileKey, req.nextUrl.searchParams.get('unduh') === '1' ? (row.fileName ?? undefined) : undefined)
    return NextResponse.json({ url })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 })
    return serverError(err, 'Tautan berkas belum bisa dibuat. Coba lagi.', 'approval-requests/berkas GET', 502)
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_EVIDENCE_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: `Ukuran berkas melebihi ${Math.round(MAX_EVIDENCE_BYTES / 1024 / 1024)} MB` }, { status: 413 })
  }
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Unggahan tidak valid' }, { status: 400 })
  }
  const id = cleanText(form.get('id'), 64)
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Berkas wajib dipilih' }, { status: 422 })

  try {
    const row = id
      ? await db.approvalRequest.findUnique({ where: { id }, select: { id: true, requestedById: true, status: true, fileKey: true } })
      : null
    if (!row || row.requestedById !== user.id) return NextResponse.json({ error: 'Permintaan tidak ditemukan' }, { status: 404 })
    if (row.status !== 'DIAJUKAN') return NextResponse.json({ error: 'Berkas hanya bisa diganti selama permintaan menunggu keputusan' }, { status: 409 })

    if (!storageConfigured()) {
      return NextResponse.json({ error: 'Penyimpanan berkas belum aktif. Hubungi Tim TI.', needsConfig: true }, { status: 503 })
    }
    if (file.size === 0) return NextResponse.json({ error: 'Berkas kosong' }, { status: 422 })
    if (file.size > MAX_EVIDENCE_BYTES) {
      return NextResponse.json({ error: `Ukuran berkas melebihi ${Math.round(MAX_EVIDENCE_BYTES / 1024 / 1024)} MB` }, { status: 413 })
    }
    const mime = file.type || 'application/octet-stream'
    if (!ALLOWED_EVIDENCE_MIME.has(mime)) {
      return NextResponse.json({ error: 'Jenis berkas tidak diizinkan. Gunakan gambar, PDF, dokumen Office, atau teks.' }, { status: 415 })
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!EXTENSIONS_FOR_MIME[mime]?.includes(ext)) {
      return NextResponse.json({ error: `Ekstensi .${ext || '?'} tidak sesuai dengan jenis berkasnya.` }, { status: 415 })
    }
    const bytes = await file.arrayBuffer()
    if (!contentMatchesMime(new Uint8Array(bytes), mime)) {
      return NextResponse.json({ error: 'Isi berkas tidak sesuai dengan jenisnya. Unggah berkas aslinya.' }, { status: 415 })
    }

    const name = safeDisplayName(file.name)
    const key = buildStorageKey('APPROVAL_REQUEST', row.id, file.name)
    await uploadEvidence(key, bytes, mime)
    const res = await db.approvalRequest.updateMany({
      where: { id: row.id, status: 'DIAJUKAN' },
      data: { fileKey: key, fileName: name, fileMime: mime, fileSize: file.size },
    })
    if (res.count === 0) {
      await removeEvidence(key).catch(() => {})
      return NextResponse.json({ error: 'Permintaan baru saja diputuskan' }, { status: 409 })
    }
    if (row.fileKey) await removeEvidence(row.fileKey).catch((e) => console.error('[approval-requests/berkas] hapus lama:', e))
    await auditPic(req, user, 'ATTACH_APPROVAL_FILE', 'APPROVAL_REQUEST', row.id, { fileName: name, size: file.size, mime })
    return NextResponse.json({ ok: true, file: { name, mime, size: file.size } })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 })
    return serverError(err, 'Berkas belum terunggah. Coba lagi.', 'approval-requests/berkas POST', 502)
  }
}
