import { NextRequest, NextResponse } from 'next/server'
import { refuseCron } from '@/lib/cron-auth'
import { runDueRules } from '@/lib/reminder-rules'
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
  const now = new Date()
  const ran = await runDueRules(now)
  const [expiredAccess, relocked] = await Promise.all([revertExpiredAccess(now), relockExpiredUnlocks(now)])
  return NextResponse.json({ ok: true, ran, expiredAccess, relocked })
}
