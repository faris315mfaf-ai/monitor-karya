import { describe, expect, it } from 'vitest'
import { isSameWibDay } from '@/lib/format'

describe('isSameWibDay', () => {
  it('membandingkan hari kalender WIB, bukan UTC atau zona peramban', () => {
    // 23.30 WIB 10 Okt = 16.30 UTC 10 Okt; 00.30 WIB 11 Okt = 17.30 UTC 10 Okt.
    expect(isSameWibDay('2026-10-10T16:30:00Z', '2026-10-10T10:00:00Z')).toBe(true)
    expect(isSameWibDay('2026-10-10T17:30:00Z', '2026-10-10T16:30:00Z')).toBe(false)
    expect(isSameWibDay('2026-10-10T17:30:00Z', '2026-10-11T10:00:00Z')).toBe(true)
  })
  it('tanggal tak valid tidak dianggap sama', () => {
    expect(isSameWibDay('bukan-tanggal', '2026-10-10T10:00:00Z')).toBe(false)
  })
})
