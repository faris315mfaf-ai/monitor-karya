import { NextRequest, NextResponse } from 'next/server'
import { refuseCron } from '@/lib/cron-auth'
import { db } from '@/lib/db'
import { isWorkingDay } from '@/lib/lock'
import { remindUnreportedDivisions } from '@/lib/reminders'
import { entitiesWithRuleEnabled } from '@/lib/reminder-rules'

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
  if (!isWorkingDay()) {
    return NextResponse.json({ ok: true, skipped: 'akhir pekan', sent: 0 })
  }

  // PT yang mematikan "Pengingat laporan mingguan" di Pengingat otomatis dilewati.
  const result = await remindUnreportedDivisions({ entityIds: await entitiesWithRuleEnabled('MINGGUAN'), source: 'CRON' })

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

  return NextResponse.json({ ok: true, week: result.week, sent: result.sent, unreported: result.results.length })
}
