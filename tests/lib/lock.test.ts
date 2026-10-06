import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAILY_CUTOFF_LABEL,
  WEEKLY_HANDOVER_LABEL,
  WEEKLY_LOCK_LABEL,
  dailyCountdown,
  dailyLockAt,
  isDailyLocked,
  isWeeklyLocked,
  isWorkingDay,
  isoWeekOf,
  parseWeekKey,
  parseWibDateKey,
  startOfWibDay,
  validateWeeklyItem,
  weekPeriodOf,
  weeklyDeadlines,
  wibDateKey,
  wibIsoDay,
} from '@/lib/lock'

/** Instan UTC dari jam dinding WIB (UTC+7) — agar tes terbaca dalam jam bisnis. */
const wib = (isoLocal: string) => new Date(`${isoLocal}+07:00`)
const utc = (iso: string) => new Date(`${iso}Z`)

describe('label tenggat', () => {
  it('memakai jam bawaan 17.00 WIB, Kamis untuk serah terima, Jumat untuk kunci', () => {
    expect(DAILY_CUTOFF_LABEL).toBe('17.00 WIB')
    expect(WEEKLY_HANDOVER_LABEL).toBe('Kamis 17.00 WIB')
    expect(WEEKLY_LOCK_LABEL).toBe('Jumat 17.00 WIB')
  })
})

describe('batas hari WIB (startOfWibDay)', () => {
  it('00.30 WIB sudah hari baru walau di UTC masih kemarin', () => {
    const t = wib('2026-10-06T00:30:00') // = 2026-10-05T17:30Z
    expect(t.toISOString()).toBe('2026-10-05T17:30:00.000Z')
    expect(startOfWibDay(t).toISOString()).toBe('2026-10-05T17:00:00.000Z')
    expect(wibDateKey(t)).toBe('2026-10-06')
  })

  it('23.59 WIB masih hari yang sama walau di UTC jam 16.59', () => {
    const t = wib('2026-10-05T23:59:59')
    expect(startOfWibDay(t).toISOString()).toBe('2026-10-04T17:00:00.000Z')
    expect(wibDateKey(t)).toBe('2026-10-05')
  })

  it('tepat tengah malam WIB adalah awal hari itu sendiri', () => {
    const t = wib('2026-10-06T00:00:00')
    expect(startOfWibDay(t).getTime()).toBe(t.getTime())
  })

  it('07.00 WIB (00.00 UTC) tidak bergeser ke hari sebelumnya', () => {
    const t = utc('2026-10-06T00:00:00')
    expect(startOfWibDay(t).toISOString()).toBe('2026-10-05T17:00:00.000Z')
  })

  it('memakai jam sistem bila tanpa argumen', () => {
    vi.useFakeTimers()
    vi.setSystemTime(utc('2026-10-05T18:00:00')) // 01.00 WIB 6 Okt
    expect(startOfWibDay().toISOString()).toBe('2026-10-05T17:00:00.000Z')
    vi.useRealTimers()
  })

  it('parseWibDateKey mengembalikan tengah malam WIB, null untuk format salah', () => {
    expect(parseWibDateKey('2026-10-06')?.toISOString()).toBe('2026-10-05T17:00:00.000Z')
    expect(parseWibDateKey('06-10-2026')).toBeNull()
    expect(parseWibDateKey(20261006)).toBeNull()
    expect(parseWibDateKey('2026-02-31')).toBeNull()
    expect(parseWibDateKey('2026-13-01')).toBeNull()
  })
})

describe('tenggat harian 17.00 WIB', () => {
  it('dailyLockAt = 17.00 WIB (10.00 UTC) pada hari WIB tanggal laporan', () => {
    expect(dailyLockAt(wib('2026-10-06T00:00:00')).toISOString()).toBe('2026-10-06T10:00:00.000Z')
    // Jam berapa pun di hari WIB yang sama menghasilkan tenggat yang sama.
    expect(dailyLockAt(wib('2026-10-06T23:30:00')).toISOString()).toBe('2026-10-06T10:00:00.000Z')
  })

  it('dailyLockAt untuk 00.30 WIB mengikuti hari WIB, bukan hari UTC', () => {
    expect(dailyLockAt(utc('2026-10-05T17:30:00')).toISOString()).toBe('2026-10-06T10:00:00.000Z')
  })

  it('isDailyLocked: terbuka sampai 16.59.59, terkunci tepat 17.00', () => {
    const day = startOfWibDay(wib('2026-10-06T08:00:00'))
    expect(isDailyLocked(day, wib('2026-10-06T16:59:59.999'))).toBe(false)
    expect(isDailyLocked(day, wib('2026-10-06T17:00:00'))).toBe(true)
    expect(isDailyLocked(day, wib('2026-10-07T09:00:00'))).toBe(true)
  })

  it('laporan hari esok belum terkunci', () => {
    const tomorrow = startOfWibDay(wib('2026-10-07T08:00:00'))
    expect(isDailyLocked(tomorrow, wib('2026-10-06T18:00:00'))).toBe(false)
  })

  describe('dailyCountdown dengan jam palsu', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('14.30 WIB: sisa 2 jam 30 menit', () => {
      vi.setSystemTime(wib('2026-10-06T14:30:00'))
      expect(dailyCountdown()).toEqual({ hours: 2, minutes: 30, totalMs: 2.5 * 3600000, passed: false })
      expect(isDailyLocked(startOfWibDay())).toBe(false)
    })

    it('00.30 WIB (UTC masih kemarin): sisa 16 jam 30 menit menuju 17.00 hari ini', () => {
      vi.setSystemTime(utc('2026-10-05T17:30:00'))
      expect(dailyCountdown()).toMatchObject({ hours: 16, minutes: 30, passed: false })
    })

    it('16.59.30 WIB: 0 jam 0 menit tetapi belum lewat', () => {
      vi.setSystemTime(wib('2026-10-06T16:59:30'))
      expect(dailyCountdown()).toEqual({ hours: 0, minutes: 0, totalMs: 30000, passed: false })
    })

    it('tepat 17.00 WIB dan sesudahnya: lewat', () => {
      vi.setSystemTime(wib('2026-10-06T17:00:00'))
      expect(dailyCountdown()).toEqual({ hours: 0, minutes: 0, totalMs: 0, passed: true })
      expect(isDailyLocked(startOfWibDay())).toBe(true)
      vi.setSystemTime(wib('2026-10-06T23:59:00'))
      expect(dailyCountdown().passed).toBe(true)
    })
  })
})

describe('hari kerja (WIB)', () => {
  it('wibIsoDay: Senin = 1 … Minggu = 7', () => {
    expect(wibIsoDay(wib('2026-10-05T09:00:00'))).toBe(1)
    expect(wibIsoDay(wib('2026-10-09T09:00:00'))).toBe(5)
    expect(wibIsoDay(wib('2026-10-11T09:00:00'))).toBe(7)
  })

  it('Senin–Jumat hari kerja, Sabtu–Minggu bukan', () => {
    expect(isWorkingDay(wib('2026-10-05T09:00:00'))).toBe(true)
    expect(isWorkingDay(wib('2026-10-09T16:00:00'))).toBe(true)
    expect(isWorkingDay(wib('2026-10-10T09:00:00'))).toBe(false)
    expect(isWorkingDay(wib('2026-10-11T09:00:00'))).toBe(false)
  })

  it('Sabtu 00.30 WIB sudah libur walau di UTC masih Jumat', () => {
    const t = wib('2026-10-10T00:30:00')
    expect(t.getUTCDay()).toBe(5) // Jumat di UTC
    expect(isWorkingDay(t)).toBe(false)
  })

  it('Senin 00.00 WIB sudah hari kerja walau di UTC masih Minggu', () => {
    const t = wib('2026-10-12T00:00:00')
    expect(t.getUTCDay()).toBe(0) // Minggu di UTC
    expect(isWorkingDay(t)).toBe(true)
    expect(isWorkingDay(wib('2026-10-11T23:59:59'))).toBe(false)
  })
})

describe('minggu ISO (weekPeriodOf, isoWeekOf)', () => {
  it('Rabu 7 Okt 2026 berada di 2026-W41, Senin 00.00 sampai Minggu 00.00 WIB', () => {
    const p = weekPeriodOf(wib('2026-10-07T10:00:00'))
    expect(p.cadence).toBe('MINGGUAN')
    expect(p.key).toBe('2026-W41')
    expect(p.start.toISOString()).toBe(wib('2026-10-05T00:00:00').toISOString())
    expect(p.end.toISOString()).toBe(wib('2026-10-11T00:00:00').toISOString())
  })

  it('Minggu 23.59 WIB masih minggu lama; Senin 00.00 WIB minggu baru', () => {
    expect(weekPeriodOf(wib('2026-10-11T23:59:59')).key).toBe('2026-W41')
    expect(weekPeriodOf(wib('2026-10-12T00:00:00')).key).toBe('2026-W42')
  })

  it('pergantian tahun: 1–3 Jan 2027 masih 2026-W53, 4 Jan 2027 = 2027-W01', () => {
    expect(isoWeekOf(wib('2026-12-31T12:00:00'))).toEqual({ isoYear: 2026, isoWeek: 53 })
    expect(weekPeriodOf(wib('2027-01-01T12:00:00')).key).toBe('2026-W53')
    expect(weekPeriodOf(wib('2027-01-03T23:59:00')).key).toBe('2026-W53')
    expect(weekPeriodOf(wib('2027-01-04T00:00:00')).key).toBe('2027-W01')
  })

  it('29 Des 2025 sudah termasuk 2026-W01', () => {
    expect(weekPeriodOf(wib('2025-12-29T08:00:00')).key).toBe('2026-W01')
  })

  it('parseWeekKey bolak-balik dengan weekPeriodOf; menolak kunci tak dikenal', () => {
    for (const key of ['2026-W01', '2026-W41', '2026-W53', '2027-W01']) {
      expect(parseWeekKey(key)?.key).toBe(key)
    }
    expect(parseWeekKey('2027-W53')).toBeNull() // 2027 hanya punya 52 minggu
    expect(parseWeekKey('2026-41')).toBeNull()
    expect(parseWeekKey('2026-W00')).toBeNull()
  })
})

describe('tenggat mingguan (weeklyDeadlines, isWeeklyLocked)', () => {
  it('serah terima Kamis 17.00 WIB, kunci Jumat 17.00 WIB', () => {
    const d = weeklyDeadlines(wib('2026-10-07T10:00:00'))
    expect(d.periodStart.toISOString()).toBe('2026-10-04T17:00:00.000Z')
    expect(d.periodEnd.toISOString()).toBe('2026-10-10T17:00:00.000Z')
    expect(d.handoverBy.toISOString()).toBe('2026-10-08T10:00:00.000Z')
    expect(d.lockAt.toISOString()).toBe('2026-10-09T10:00:00.000Z')
  })

  it('tenggat sama untuk setiap hari dalam minggu yang sama, termasuk Minggu malam', () => {
    const a = weeklyDeadlines(wib('2026-10-05T00:00:00'))
    const b = weeklyDeadlines(wib('2026-10-11T23:59:59'))
    expect(b.lockAt.getTime()).toBe(a.lockAt.getTime())
  })

  it('isWeeklyLocked: terbuka sampai Jumat 16.59.59, terkunci Jumat 17.00', () => {
    const start = weekPeriodOf(wib('2026-10-07T10:00:00')).start
    expect(isWeeklyLocked(start, wib('2026-10-08T17:30:00'))).toBe(false) // lewat serah terima, belum kunci
    expect(isWeeklyLocked(start, wib('2026-10-09T16:59:59.999'))).toBe(false)
    expect(isWeeklyLocked(start, wib('2026-10-09T17:00:00'))).toBe(true)
    expect(isWeeklyLocked(start, wib('2026-10-10T09:00:00'))).toBe(true)
  })

  it('minggu berikutnya belum terkunci di Sabtu minggu ini', () => {
    const next = weekPeriodOf(wib('2026-10-12T09:00:00')).start
    expect(isWeeklyLocked(next, wib('2026-10-10T09:00:00'))).toBe(false)
  })

  it('memakai jam sistem bila tanpa argumen now', () => {
    vi.useFakeTimers()
    try {
      const start = weekPeriodOf(wib('2026-10-07T10:00:00')).start
      vi.setSystemTime(wib('2026-10-09T16:00:00'))
      expect(isWeeklyLocked(start)).toBe(false)
      vi.setSystemTime(wib('2026-10-09T17:00:01'))
      expect(isWeeklyLocked(start)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('validateWeeklyItem (bukti wajib)', () => {
  const base = {
    workItem: 'Rekap absensi',
    targetOutput: 'Rekap lengkap',
    picName: 'Budi',
    achievementThisWeek: 'Selesai 80%',
  }

  it('status berjalan tanpa bukti ditolak', () => {
    expect(validateWeeklyItem({ ...base, status: 'ON_PROGRESS', evidenceCount: 0 })).toContain(
      'Bukti pendukung wajib dilampirkan minimal 1 untuk status ini.'
    )
  })

  it('BELUM_MULAI dan NA tidak perlu bukti', () => {
    expect(validateWeeklyItem({ ...base, status: 'BELUM_MULAI', evidenceCount: 0 })).toEqual([])
    expect(validateWeeklyItem({ ...base, status: 'NA', evidenceCount: 0 })).toEqual([])
  })

  it('TERKENDALA wajib kendala & tindak lanjut', () => {
    expect(validateWeeklyItem({ ...base, status: 'TERKENDALA', evidenceCount: 1 })).toEqual([
      'Kendala dan tindak lanjut wajib diisi untuk status Terkendala.',
    ])
  })
})
