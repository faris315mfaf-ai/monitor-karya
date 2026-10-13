import { describe, expect, it } from 'vitest'
import { deadlineText } from '@/components/views/role-dashboards'

/**
 * Hero PIC: label tenggat diturunkan dari lockAt kiriman API. Titik kunci tepat
 * tengah malam WIB bukan "jam 00.00": mode 24/7 mengunci di akhir hari (24.00),
 * sedangkan pengisian yang ditutup mengunci sejak awal hari (sudah lewat).
 */
describe('deadlineText', () => {
  it('jam batas biasa memakai jam WIB dari lockAt', () => {
    // 17.00 WIB = 10.00 UTC
    const text = deadlineText({ hours: 2, minutes: 40, passed: false }, '2026-10-12T10:00:00Z')
    expect(text).toBe('Tenggat 17.00 · 2 jam 40 menit lagi')
  })

  it('mode 24/7 (lockAt tengah malam WIB di depan) tampil 24.00, bukan 00.00', () => {
    // 00.00 WIB 13 Okt = 17.00 UTC 12 Okt
    const text = deadlineText({ hours: 5, minutes: 3, passed: false }, '2026-10-12T17:00:00Z')
    expect(text).toBe('Tenggat 24.00 · 5 jam 3 menit lagi')
  })

  it('pengisian ditutup (lockAt awal hari, sudah lewat) tidak menyebut jam 00.00', () => {
    const text = deadlineText({ hours: 0, minutes: 0, passed: true }, '2026-10-11T17:00:00Z')
    expect(text).toBe('Pengisian laporan sedang ditutup')
  })
})
