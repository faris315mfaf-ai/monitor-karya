import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isWorkingDay } from '@/lib/lock'
import { remindUnreportedDivisions } from '@/lib/reminders'

/**
 * Cron Vercel (lihat vercel.json): tiap pagi hari kerja, ingatkan kepala divisi
 * yang laporan mingguannya belum diserahkan. Vercel mengirim
 * "Authorization: Bearer <CRON_SECRET>"; tanpa rahasia yang cocok tidak ada
 * yang dikirim, jadi endpoint ini tidak bisa dipicu orang luar.
 */

export const dynamic = 'force-dynamic'

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET belum diatur di lingkungan ini' }, { status: 503 })
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  }
  if (!isWorkingDay()) {
    return NextResponse.json({ ok: true, skipped: 'akhir pekan', sent: 0 })
  }

  const result = await remindUnreportedDivisions({ entityIds: null, source: 'CRON' })

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
