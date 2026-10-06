import { describe, expect, it } from 'vitest'
import { draftPoints, lockedWorkdays, normalizePoints, onTimeDaily, summaryBlock, SUMMARY_POINT_MAX } from '@/lib/kadiv-math'

const H = 3600000
const D = 24 * H
/** Tengah malam WIB tanggal (UTC 17.00 hari sebelumnya). */
const wib = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - 7 * H)
const lockAt = (day: Date) => new Date(day.getTime() + 17 * H)

describe('kadiv-math [F2-KADIV]', () => {
  it('lockedWorkdays: hanya hari kerja yang tenggat 17.00-nya lewat', () => {
    // Selasa 6 Okt 2026 pukul 10.00 WIB, jendela 7 hari (30 Sep–6 Okt): hari ini belum terkunci.
    const now = new Date(wib(2026, 10, 6).getTime() + 10 * H)
    const days = lockedWorkdays(now, lockAt, 7)
    expect(days.map((d) => d.toISOString())).toEqual([wib(2026, 9, 30), wib(2026, 10, 1), wib(2026, 10, 2), wib(2026, 10, 5)].map((d) => d.toISOString()))
    // Pukul 17.30 WIB: hari ini ikut.
    const later = new Date(wib(2026, 10, 6).getTime() + 17.5 * H)
    expect(lockedWorkdays(later, lockAt, 7)).toHaveLength(5)
  })

  it('onTimeDaily: tepat waktu ÷ wajib, tanpa cuti, sejak tanggal mulai', () => {
    const days = [wib(2026, 10, 1), wib(2026, 10, 2), wib(2026, 10, 5)]
    const r = onTimeDaily({
      days,
      projects: [
        { id: 'a', picUserId: 'u1', startDate: null, createdAt: wib(2026, 9, 1) },
        { id: 'b', picUserId: 'u2', startDate: wib(2026, 10, 2), createdAt: wib(2026, 9, 1) },
        { id: 'c', picUserId: null, startDate: null, createdAt: wib(2026, 9, 1) },
      ],
      reports: [
        { projectId: 'a', reportDate: days[0], submittedAt: new Date(days[0].getTime() + 16 * H), isLate: false },
        // terlambat (lewat 17.00)
        { projectId: 'a', reportDate: days[1], submittedAt: new Date(days[1].getTime() + 18 * H), isLate: false },
        // ditandai terlambat walau jamnya sebelum tenggat (dibuka kunci)
        { projectId: 'b', reportDate: days[1], submittedAt: new Date(days[1].getTime() + 9 * H), isLate: true },
        { projectId: 'b', reportDate: days[2], submittedAt: new Date(days[2].getTime() + 9 * H), isLate: false },
      ],
      lockAt,
      // u1 cuti tanggal 5
      absent: (u, d) => u === 'u1' && d.getTime() === days[2].getTime(),
    })
    // a: 1 Okt (tepat), 2 Okt (telat), 5 Okt cuti → 2 wajib; b: 2 Okt (telat), 5 Okt (tepat) → 2 wajib; c tanpa PIC.
    expect(r).toEqual({ ok: 2, total: 4, pct: 50 })
    expect(onTimeDaily({ days: [], projects: [], reports: [], lockAt, absent: () => false }).pct).toBeNull()
  })

  it('draftPoints: tiga poin, menyebut proyek bermasalah dan kendala', () => {
    const pts = draftPoints({
      divisionName: 'Teknologi',
      outputsAccepted: 4, outputsTarget: 6, projectsOnTrack: 3, projectsTotal: 4, openObstacles: 1, pendingReview: 2,
      acceptedTitles: ['A', 'B', 'C', 'D'],
      offTrack: [{ name: 'Aplikasi Absensi', reason: 'Perangkat belum terpasang', status: 'risk' }],
      obstacles: ['Aplikasi Absensi: perangkat belum terpasang'],
    })
    expect(pts).toHaveLength(3)
    expect(pts[0]).toContain('4 output diterima minggu ini dari 6')
    expect(pts[0]).toContain('dan 1 lainnya')
    expect(pts[1]).toContain('3 dari 4 proyek sesuai jadwal')
    expect(pts[1]).toContain('Aplikasi Absensi perlu perhatian')
    expect(pts[2]).toContain('1 kendala terbuka')
    for (const p of pts) expect(p.length).toBeLessThanOrEqual(SUMMARY_POINT_MAX)
  })

  it('normalizePoints: 1–3 teks, dipangkas, batas panjang', () => {
    expect(normalizePoints(['  satu  ', '', 'dua'])).toEqual(['satu', 'dua'])
    expect(normalizePoints([])).toBeNull()
    expect(normalizePoints(['', ' '])).toBeNull()
    expect(normalizePoints(['a', 'b', 'c', 'd'])).toBeNull()
    expect(normalizePoints(['x'.repeat(SUMMARY_POINT_MAX + 1)])).toBeNull()
    expect(normalizePoints('teks')).toBeNull()
    expect(normalizePoints([1])).toBeNull()
  })

  it('summaryBlock: minggu berjalan, beku setelah diteruskan, kunci Jumat, konfirmasi review', () => {
    const weekStart = wib(2026, 10, 5) // Senin
    const handoverBy = new Date(wib(2026, 10, 8).getTime() + 17 * H) // Kamis 17.00
    const lock = new Date(wib(2026, 10, 9).getTime() + 17 * H) // Jumat 17.00
    const base = { weekStart, currentWeekStart: weekStart, handoverBy, lockAt: lock, forwarded: false, sending: true, pendingReview: 2, confirmPending: false }
    const tue = new Date(wib(2026, 10, 6).getTime() + 10 * H)
    expect(summaryBlock({ ...base, now: tue })?.code).toBe('PENDING_REVIEW')
    expect(summaryBlock({ ...base, now: tue, confirmPending: true })).toBeNull()
    expect(summaryBlock({ ...base, now: tue, sending: false })).toBeNull()
    // Setelah tenggat serah: tidak perlu konfirmasi lagi.
    expect(summaryBlock({ ...base, now: new Date(handoverBy.getTime() + H) })).toBeNull()
    expect(summaryBlock({ ...base, now: new Date(lock.getTime() + 1) })?.code).toBe('LOCKED')
    expect(summaryBlock({ ...base, now: tue, forwarded: true })?.code).toBe('FORWARDED')
    expect(summaryBlock({ ...base, now: tue, weekStart: new Date(weekStart.getTime() - 7 * D) })?.code).toBe('NOT_CURRENT_WEEK')
  })
})
