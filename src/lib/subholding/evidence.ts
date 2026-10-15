import 'server-only'

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { removeEvidence, storageConfigured } from '@/lib/storage'
import { evidenceWritable, SH_EVIDENCE_TARGET } from '@/lib/subholding/rules'

/**
 * Bukti laporan subholding (Evidence targetType SUBHOLDING_REPORT).
 *
 * Gerbang izin ada di src/lib/evidence-access.ts; modul ini menangani
 * keadaan balapan: status laporan diperiksa ULANG di dalam transaksi tulis
 * bukti dengan baris laporan dikunci (FOR UPDATE), jadi bukti tidak bisa
 * dihapus tepat saat supervisor menyetujui (persetujuan wajib ≥1 bukti) dan
 * tidak bisa ditambah setelah laporan disetujui.
 */

export class ShEvidenceRefusal extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export const SH_EVIDENCE_LOCKED_MESSAGE = 'Laporan ini sudah disetujui; buktinya tidak dapat diubah.'

/**
 * Di dalam transaksi tulis bukti: kunci baris laporan lalu pastikan bukti
 * masih boleh diubah. Melempar ShEvidenceRefusal (404/409) bila tidak.
 * `bypassLock` untuk Super Admin (laporan DISETUJUI hanya bisa diubah olehnya).
 */
export async function lockShReportForEvidence(
  tx: Prisma.TransactionClient,
  reportId: string,
  opts: { bypassLock?: boolean } = {}
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "SubholdingReport" WHERE "id" = ${reportId} FOR UPDATE`
  const report = await tx.subholdingReport.findUnique({ where: { id: reportId }, select: { status: true } })
  if (!report) throw new ShEvidenceRefusal('Laporan tidak ditemukan', 404)
  if (!opts.bypassLock && !evidenceWritable(report.status)) {
    throw new ShEvidenceRefusal(SH_EVIDENCE_LOCKED_MESSAGE, 409)
  }
}

/** Kunci storage bukti berkas (bukan tautan) milik laporan-laporan ini. */
export async function shEvidenceStorageKeys(
  reportIds: string[],
  client: Prisma.TransactionClient | typeof db = db
): Promise<string[]> {
  if (!reportIds.length) return []
  const rows = await client.evidence.findMany({
    where: { targetType: SH_EVIDENCE_TARGET, targetId: { in: reportIds } },
    select: { storageKey: true, url: true },
  })
  return rows.filter((r) => !r.url && r.storageKey).map((r) => r.storageKey)
}

/**
 * Membuang berkas storage SETELAH transaksi hapus commit. Upaya-terbaik:
 * kegagalan dicatat di log, baris basis data sudah terhapus.
 */
export async function removeStorageObjects(keys: string[]): Promise<number> {
  if (!keys.length || !storageConfigured()) return 0
  let removed = 0
  for (const key of keys) {
    try {
      await removeEvidence(key)
      removed++
    } catch (err) {
      console.error('[subholding] berkas bukti gagal dihapus:', key, err instanceof Error ? err.message : err)
    }
  }
  return removed
}
