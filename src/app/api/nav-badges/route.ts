import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { isDailyLocked, isWorkingDay, startOfWibDay } from '@/lib/lock'
import { oversightBadges } from '@/lib/oversight-badges' // [F2-DIREKTUR]

/**
 * GET /api/nav-badges — angka kecil di samping item navigasi (6 Okt 2026).
 *
 * PIC proyek: "Laporan harian 1" (aksen) = jumlah proyek aktif yang laporan
 * hari ininya belum terkirim. Hilang setelah semuanya terkirim, setelah
 * tenggat lewat (laporan terkunci), dan di hari libur.
 *
 * [F2-PIC] "Catatan kepala divisi 1" (aksen) = catatan pihak lain yang belum
 * dibaca di proyek aktif PIC ini. Catatan tampil di Ringkasan ("Hari ini"),
 * jadi angkanya menempel di tab `dashboard`. Bila tabel catatan belum ada
 * (migrasi 0014/0019 belum diterapkan) angka ini dilewati tanpa menggagalkan
 * badge lain.
 */
export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const badges: Record<string, number> = {}
  const now = new Date()

  if (user.role === 'PIC_PROYEK' && isWorkingDay(now) && !isDailyLocked(now, now)) {
    const today = startOfWibDay(now)
    const [projects, submitted] = await Promise.all([
      db.project.count({ where: { picUserId: user.id, lifecycle: 'AKTIF' } }),
      db.dailyProjectReport.count({
        where: { reportDate: today, submittedAt: { not: null }, project: { picUserId: user.id, lifecycle: 'AKTIF' } },
      }),
    ])
    const outstanding = Math.max(0, projects - submitted)
    if (outstanding) badges['daily-input'] = outstanding
  }

  if (user.role === 'PIC_PROYEK') {
    try {
      const unread = await db.projectNote.count({
        where: {
          authorId: { not: user.id },
          readAt: null,
          reads: { none: { userId: user.id } },
          project: { picUserId: user.id, lifecycle: 'AKTIF' },
        },
      })
      if (unread) badges.dashboard = unread
    } catch (err) {
      console.error('[nav-badges] catatan belum bisa dihitung:', err instanceof Error ? err.message : err)
    }
  }

  // [F2-DIREKTUR] Pengawas: "Eskalasi n", "Laporan mingguan n" (tab Divisi), "Persetujuan n".
  Object.assign(badges, await oversightBadges(user))

  return NextResponse.json({ badges })
}
