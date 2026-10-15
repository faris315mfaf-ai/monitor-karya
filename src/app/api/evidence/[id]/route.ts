import { clientIp, safeEvidenceUrl } from '@/lib/security'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncEvidenceCount } from '@/lib/daily-rollup'
import { requireApiUser } from '@/lib/auth'
import { canReadEvidence, canWriteEvidence } from '@/lib/evidence-access'
import { removeEvidence, signedEvidenceUrl, storageConfigured } from '@/lib/storage'
import { serverError } from '@/lib/api-error'
import { ShEvidenceRefusal, lockShReportForEvidence, removeStorageObjects } from '@/lib/subholding/evidence'
import { SH_EVIDENCE_TARGET } from '@/lib/subholding/rules'

export const runtime = 'nodejs'

/**
 * GET /api/evidence/[id] — hands back a way to open this piece of evidence.
 *
 * For an uploaded file that is a signed URL valid for a few minutes; for the
 * older link-style evidence it is simply the stored link. Either way the caller
 * is checked against the entity scope first.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser({ allowSubholdingRoles: true })
  if (user instanceof NextResponse) return user

  const { id } = await params
  const evidence = await db.evidence.findUnique({ where: { id } })
  if (!evidence) return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 })

  const guard = await canReadEvidence(user, evidence.targetType, evidence.targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // Link-style evidence predates file storage; hand back the link as-is.
  if (evidence.url) {
    // [T12] Baris warisan bisa memuat skema berbahaya (javascript:, data:) atau kredensial tertanam.
    const safe = safeEvidenceUrl(evidence.url)
    if (!safe) return NextResponse.json({ error: 'Tautan bukti ini tidak valid dan tidak dapat dibuka.' }, { status: 422 })
    return NextResponse.json({ url: safe, kind: 'link' as const })
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
    return serverError(err, 'Gagal membuat tautan berkas. Coba lagi.', 'evidence GET', 502)
  }
}

/** DELETE /api/evidence/[id] — removes the row and, for uploads, the object. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser({ allowSubholdingRoles: true })
  if (user instanceof NextResponse) return user

  const { id } = await params
  const evidence = await db.evidence.findUnique({ where: { id } })
  if (!evidence) return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 })

  const guard = await canWriteEvidence(user, evidence.targetType, evidence.targetId)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // Laporan subholding (16 Okt 2026): baris dihapus dulu dalam transaksi yang
  // mengunci laporannya dan memeriksa ulang statusnya (persetujuan wajib ≥1
  // bukti, jadi hapus tidak boleh menyalip keputusan); berkas dibuang setelah commit.
  if (evidence.targetType === SH_EVIDENCE_TARGET) {
    try {
      const count = await db.$transaction(async (tx) => {
        await lockShReportForEvidence(tx, evidence.targetId, { bypassLock: user.role === 'SUPERADMIN' })
        const gone = await tx.evidence.deleteMany({ where: { id } })
        if (gone.count === 0) return null
        const count = await tx.evidence.count({ where: { targetType: evidence.targetType, targetId: evidence.targetId } })
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'REMOVE_EVIDENCE',
            targetType: evidence.targetType,
            targetId: evidence.targetId,
            beforeData: JSON.stringify({ fileName: evidence.fileName, storageKey: evidence.storageKey }),
            ip: clientIp(req),
          },
        })
        return count
      }, { isolationLevel: 'ReadCommitted' })
      if (count === null) return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 })
      if (!evidence.url) await removeStorageObjects([evidence.storageKey])
      return NextResponse.json({ ok: true, evidenceCount: count })
    } catch (err) {
      if (err instanceof ShEvidenceRefusal) return NextResponse.json({ error: err.message }, { status: err.status })
      return serverError(err, 'Gagal menghapus bukti. Coba lagi.', 'evidence DELETE sh')
    }
  }

  // Drop the object first; if that fails we keep the row rather than orphaning
  // a file nobody can reach.
  if (!evidence.url && storageConfigured()) {
    try {
      await removeEvidence(evidence.storageKey)
    } catch (err) {
      return serverError(err, 'Gagal menghapus berkas. Coba lagi.', 'evidence DELETE', 502)
    }
  }

  // [T12] Hapus baris + hitung ulang cache + audit dalam satu transaksi.
  try {
    const count = await db.$transaction(async (tx) => {
      const gone = await tx.evidence.deleteMany({ where: { id } })
      if (gone.count === 0) return null // sudah dihapus permintaan lain
      const count = await syncEvidenceCount(evidence.targetType, evidence.targetId, tx)
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'REMOVE_EVIDENCE',
          targetType: evidence.targetType,
          targetId: evidence.targetId,
          beforeData: JSON.stringify({ fileName: evidence.fileName, storageKey: evidence.storageKey }),
          ip: clientIp(req),
        },
      })
      return count
    }, { isolationLevel: 'ReadCommitted' })
    if (count === null) return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 })
    return NextResponse.json({ ok: true, evidenceCount: count })
  } catch (err) {
    return serverError(err, 'Gagal menghapus bukti. Coba lagi.', 'evidence DELETE row')
  }
}
