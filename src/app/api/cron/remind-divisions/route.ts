import { NextRequest } from 'next/server'
import { refuseCron } from '@/lib/cron-auth'
import { runOperationalJob } from '@/lib/operational-health'
import { db } from '@/lib/db'
import { isWorkingDay } from '@/lib/lock'
import { remindUnreportedDivisions } from '@/lib/reminders'
import { REMINDER_DEFAULTS } from '@/lib/admin-meta'

/**
 * Cron Vercel (lihat vercel.json): tiap pagi hari kerja, ingatkan kepala divisi
 * yang laporan mingguannya belum diserahkan. Vercel mengirim
 * "Authorization: Bearer <CRON_SECRET>"; tanpa rahasia yang cocok tidak ada
 * yang dikirim, jadi endpoint ini tidak bisa dipicu orang luar.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Rahasia wajib & dibandingkan waktu-konstan (src/lib/cron-auth.ts).
  const refused = refuseCron(req)
  if (refused) return refused
  return runOperationalJob('remind-divisions', async () => {
    if (!isWorkingDay()) {
      return { ok: true, skipped: 'akhir pekan', sent: 0 }
    }

    // PT yang mematikan "Pengingat laporan mingguan" di Pengingat otomatis dilewati.
    // Strict lookup: the legacy helper swallows query errors and falls back to
    // all entities, which cannot be treated as a successful operational run.
    const overrides = await db.reminderRule.findMany({
      where: { kind: 'MINGGUAN' }, select: { entityId: true, enabled: true },
    })
    let entityIds: string[] | null
    if (REMINDER_DEFAULTS.MINGGUAN.enabled) {
      const disabled = overrides.filter(rule => !rule.enabled).map(rule => rule.entityId)
      entityIds = disabled.length === 0 ? null : (await db.entity.findMany({
        where: { isActive: true, id: { notIn: disabled } }, select: { id: true },
      })).map(entity => entity.id)
    } else {
      entityIds = overrides.filter(rule => rule.enabled).map(rule => rule.entityId)
    }
    const result = await remindUnreportedDivisions({ entityIds, source: 'CRON' })

    await db.auditLog.create({
      data: {
        actorId: null,
        action: 'CRON_DIVISION_REMINDERS',
        targetType: 'WEEKLY_REPORT',
        targetId: result.week.key,
        afterData: JSON.stringify({ sent: result.sent, unreported: result.results.length }),
        userAgent: req.headers.get('user-agent') || 'vercel-cron',
      },
    })

    return { ok: true, week: result.week, sent: result.sent, unreported: result.results.length }
  })
}
