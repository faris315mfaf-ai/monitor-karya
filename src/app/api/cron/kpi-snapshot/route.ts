import { NextRequest } from 'next/server'
import { runOperationalJob } from '@/lib/operational-health'
import { db } from '@/lib/db'
import { refuseCron } from '@/lib/cron-auth'
import { refreshKpiSnapshots } from '@/lib/kpi-snapshot'
import { purgeExpiredIdempotencyKeys } from '@/lib/idempotency'

/**
 * Cron KPI harian [F1-D]: memperbarui KpiSnapshot BULANAN bulan berjalan per
 * entitas pelapor (PT, serta UNIT/SUB_HOLDING yang punya proyek atau divisi).
 * Rumus di src/lib/kpi-math.ts. Jalankan sekali sehari setelah laporan harian
 * terkunci (17.00 WIB), mis. 17.30 — lihat deploy/app-vps/cron.sh.
 * Dilindungi CRON_SECRET seperti cron lain.
 *
 * Sekalian menyapu IdempotencyKey > 7 hari (gelombang E, 13 Okt 2026). Gagal
 * menyapu tidak menggagalkan KPI; dicatat sebagai `idempotencyPurged: null`.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const refused = refuseCron(req)
  if (refused) return refused
  return runOperationalJob('kpi-snapshot', async () => {
    const now = new Date()
    const { updated, failed } = await refreshKpiSnapshots(now)
    let idempotencyPurged: number | null = null
    try {
      idempotencyPurged = await purgeExpiredIdempotencyKeys(now)
    } catch {
      /* Tabel belum termigrasi/DB sibuk: dicoba lagi besok. */
    }
    await db.auditLog.create({
      data: {
        actorId: null,
        action: 'KPI_SNAPSHOT',
        targetType: 'KPI_SNAPSHOT',
        targetId: now.toISOString().slice(0, 10),
        afterData: JSON.stringify({ updated: updated.length, failed, idempotencyPurged }),
        userAgent: 'cron',
      },
    })
    return { ok: failed.length === 0, updated: updated.length, failed: failed.length, idempotencyPurged }
  })
}
