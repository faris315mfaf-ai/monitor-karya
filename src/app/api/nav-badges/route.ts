import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { startOfWibDay } from '@/lib/lock'
import { getReportSettings, isDailyLockedWith, isWorkingDayWith } from '@/lib/report-settings'
import { oversightBadges } from '@/lib/oversight-badges' // [F2-DIREKTUR]
import { isSubholdingOnlyRole } from '@/lib/rbac'
import { subholdingBadges } from '@/lib/subholding/badges'

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
  const user = await requireApiUser({ allowSubholdingRoles: true })
  if (user instanceof NextResponse) return user

  // Model subholding (16 Okt 2026): angka tab sh-inbox (pesan belum dibaca)
  // dan sh-review (laporan menunggu); peran ini tidak memakai badge lama.
  if (isSubholdingOnlyRole(user.role)) return NextResponse.json({ badges: await subholdingBadges(user) })

  const badges: Record<string, number> = {}
  const now = new Date()

  if (user.role === 'PIC_PROYEK') {
    // [T12] Hari kerja & tenggat mengikuti aturan PT (ReportSettings), bukan Sen–Jum / jam env.
    // PIC terpaku ke proyek (scopeEntityId null): entitas diambil dari proyek aktif pertamanya.
    const mine = await db.project.findMany({ where: { picUserId: user.id, lifecycle: 'AKTIF' }, select: { entityId: true } })
    const rpt = await getReportSettings(mine[0]?.entityId ?? user.scopeEntityId ?? null)
    const today = startOfWibDay(now)
    if (mine.length && isWorkingDayWith(rpt.workingDays, now) && !isDailyLockedWith(rpt.dailyCutoffHour, rpt.dailyOpen, today, now)) {
      const submitted = await db.dailyProjectReport.count({
        where: { reportDate: today, submittedAt: { not: null }, project: { picUserId: user.id, lifecycle: 'AKTIF' } },
      })
      const outstanding = Math.max(0, mine.length - submitted)
      if (outstanding) badges['daily-input'] = outstanding
    }
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
