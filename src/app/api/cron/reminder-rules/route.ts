import { NextRequest } from 'next/server'
import { refuseCron } from '@/lib/cron-auth'
import { runOperationalJob } from '@/lib/operational-health'
import { runDueRules, reportingEntities, getRules, isDue } from '@/lib/reminder-rules'
import { revertExpiredAccess } from '@/lib/access-requests'
import { relockExpiredUnlocks } from '@/lib/unlock-requests'

/**
 * Cron pengingat otomatis (6 Okt 2026, 04-admin-pt.md). Menjalankan aturan
 * ReminderRule yang jatuh tempo per PT (harian 16.30, mingguan Jumat 13.00,
 * eskalasi ke kepala divisi, ringkasan manajemen Senin 08.00), lalu merapikan
 * akses sementara dan buka kunci yang sudah habis masanya.
 *
 * Aturan "jatuh tempo" bersifat menyusul: jalankan cron ini sesering mungkin
 * (mis. tiap 30 menit pada jam kerja WIB); setiap aturan tetap paling banyak
 * sekali sehari per PT. Dilindungi CRON_SECRET seperti /api/cron/remind-divisions.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const refused = refuseCron(req)
  if (refused) return refused
  return runOperationalJob('reminder-rules', async () => {
    const now = new Date()
    // runDueRules catches per-rule errors internally. Compare its results with
    // the due set so a partial failure cannot publish a successful heartbeat.
    const expected = new Set<string>()
    for (const entity of await reportingEntities()) {
      for (const rule of await getRules(entity.id)) {
        if (isDue(rule, now)) expected.add(`${entity.id}:${rule.kind}`)
      }
    }
    const ran = await runDueRules(now)
    for (const result of ran) expected.delete(`${result.entityId}:${result.kind}`)
    const [expiredAccess, relocked] = await Promise.all([revertExpiredAccess(now), relockExpiredUnlocks(now)])
    return { ok: expected.size === 0, ran, expiredAccess, relocked, failed: expected.size }
  })
}
