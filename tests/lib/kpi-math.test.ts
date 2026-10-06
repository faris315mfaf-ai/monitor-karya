import { describe, expect, it } from 'vitest'
import { complianceScore, monthBounds, monthKeyOf, pct, previousMonthKey, workdaysBetween } from '@/lib/kpi-math'

describe('kpi-math [F1-D]', () => {
  it('pct: null tanpa penyebut, dibatasi 0–100, satu desimal', () => {
    expect(pct({ num: 0, den: 0 })).toBeNull()
    expect(pct({ num: 2, den: 3 })).toBe(66.7)
    expect(pct({ num: 5, den: 4 })).toBe(100)
  })

  it('complianceScore membagi ulang bobot komponen tanpa data', () => {
    expect(complianceScore({ onTimeDaily: 80, weekly: 60, evidence: 100, highPriority: 50 })).toBe(75)
    // Tanpa divisi (weekly null): (80*0.4 + 100*0.2 + 50*0.1) / 0.7
    expect(complianceScore({ onTimeDaily: 80, weekly: null, evidence: 100, highPriority: 50 })).toBe(81.4)
    expect(complianceScore({ onTimeDaily: null, weekly: null, evidence: null, highPriority: null })).toBe(0)
  })

  it('batas bulan memakai tengah malam WIB', () => {
    const { start, end } = monthBounds('2026-10')
    expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-31T17:00:00.000Z')
    // 30 Sep 18.00 UTC = 1 Okt 01.00 WIB
    expect(monthKeyOf(new Date('2026-09-30T18:00:00Z'))).toBe('2026-10')
    expect(previousMonthKey('2026-01')).toBe('2025-12')
  })

  it('workdaysBetween hanya Senin–Jumat WIB', () => {
    const { start } = monthBounds('2026-10') // Kamis 1 Okt 2026
    const end = new Date(start.getTime() + 6 * 86400000) // Rabu 7 Okt
    expect(workdaysBetween(start, end)).toHaveLength(5)
  })
})
