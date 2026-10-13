import { describe, expect, it } from 'vitest'
import {
  COMPLIANCE_ATTENTION_MIN,
  COMPLIANCE_GOOD_MIN,
  COMPLIANCE_LEGEND,
  complianceBand,
} from '@/lib/compliance-band'
import { complianceColor } from '@/lib/constants'

describe('complianceBand — ambang tunggal skor kepatuhan (keputusan 13 Okt 2026, B15)', () => {
  it('batas: 90 Baik, 89,9 Perlu perhatian, 75 Perlu perhatian, 74,9 Kritis', () => {
    expect(complianceBand(90)).toEqual({ tone: 'on', label: 'Baik' })
    expect(complianceBand(89.9)).toEqual({ tone: 'risk', label: 'Perlu perhatian' })
    expect(complianceBand(75)).toEqual({ tone: 'risk', label: 'Perlu perhatian' })
    expect(complianceBand(74.9)).toEqual({ tone: 'late', label: 'Kritis' })
  })

  it('ujung skala dan kasus B15 (PT 80,8 = oranye di semua tampilan)', () => {
    expect(complianceBand(100).tone).toBe('on')
    expect(complianceBand(0).tone).toBe('late')
    expect(complianceBand(80.8)).toEqual({ tone: 'risk', label: 'Perlu perhatian' })
  })

  it('tidak memakai label status proyek', () => {
    for (const s of [0, 60, 74.9, 75, 85, 89.9, 90, 100]) {
      expect(['Selesai', 'Sesuai jadwal', 'Terlambat', 'Sesuai target']).not.toContain(complianceBand(s).label)
    }
  })

  it('legenda mengikuti konstanta ambang yang sama', () => {
    expect(COMPLIANCE_GOOD_MIN).toBe(90)
    expect(COMPLIANCE_ATTENTION_MIN).toBe(75)
    expect(COMPLIANCE_LEGEND).toEqual([
      { tone: 'on', label: 'Baik', range: '≥ 90' },
      { tone: 'risk', label: 'Perlu perhatian', range: '75–89' },
      { tone: 'late', label: 'Kritis', range: '< 75' },
    ])
  })

  it('complianceColor (kelas lama) memakai ambang yang sama', () => {
    expect(complianceColor(90).text).toBe('text-sukses')
    expect(complianceColor(89.9).text).toBe('text-waspada')
    expect(complianceColor(75).text).toBe('text-waspada')
    expect(complianceColor(74.9).text).toBe('text-bahaya')
  })
})
