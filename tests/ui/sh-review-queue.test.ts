import { describe, expect, it } from 'vitest'
import {
  ageLabel, commentWho, isResent, longWaitCount, longWaitLine, neighborId, oldestOf, positionText, queueFlag, queueGroups,
  reportDateLabel, sentLine, stampLabel, subLine, todayRecap, waitDays, waitingHeadline, type ShReport,
} from '@/components/views/sh-review/logic'

// Kamis 15 Okt 2026 10.00 WIB
const NOW = new Date('2026-10-15T03:00:00Z')

const base: ShReport = {
  id: 'r1', subholdingId: 'sh', subholdingName: 'Sentra', ptId: 'pt', ptName: 'PT Beton', reportDate: '2026-10-14',
  kegiatan: 'K', deskripsi: '', reporterName: 'A', reporterTitleKind: 'MANAJER', reporterTitleField: 'Proyek',
  reporterTitle: 'Manajer Proyek', status: 'MENUNGGU', submittedAt: '2026-10-15T01:00:00Z', decidedAt: null,
  decidedByName: null, evidenceCount: 1, evidence: [{ id: 'e', fileName: 'a.jpg', mime: 'image/jpeg' }], comments: [],
}
const rep = (o: Partial<ShReport>): ShReport => ({ ...base, ...o })

describe('umur antrean (WIB)', () => {
  it('waitDays menghitung hari kalender WIB, bukan 24 jam', () => {
    expect(waitDays('2026-10-15T01:00:00Z', NOW)).toBe(0)
    // Rabu 23.30 WIB → Kamis 10.00 WIB = 1 hari kalender walau < 24 jam.
    expect(waitDays('2026-10-14T16:30:00Z', NOW)).toBe(1)
    expect(waitDays('2026-10-13T10:00:00Z', NOW)).toBe(2)
    expect(waitDays(null, NOW)).toBe(0)
    expect(waitDays('2026-10-16T01:00:00Z', NOW)).toBe(0)
  })

  it('label umur, kepala, posisi', () => {
    expect(ageLabel(0)).toBe('Hari ini')
    expect(ageLabel(3)).toBe('3 hari')
    expect(waitingHeadline(6)).toBe('6 laporan menunggu')
    expect(waitingHeadline(0)).toBe('Antrean kosong')
    expect(positionText(1, 6)).toBe('2 dari 6')
    expect(positionText(-1, 6)).toBe('')
  })

  it('cap waktu & tanggal laporan', () => {
    expect(stampLabel('2026-10-14T09:20:00Z')).toBe('Rabu 14 Okt, 16.20')
    expect(reportDateLabel('2026-10-14')).toBe('Rabu, 14 Oktober 2026')
    expect(stampLabel(null)).toBe('')
  })
})

describe('penanda & kelompok', () => {
  it('queueFlag memilih satu penanda', () => {
    expect(queueFlag(rep({ evidenceCount: 0, evidence: [] }))).toBe('no-evidence')
    const resent = rep({ comments: [{ id: 'c', kind: 'PERBAIKAN', body: 'x', authorName: 'S', authorRole: 'SUPERVISOR', createdAt: '2026-10-14T01:00:00Z', mine: true }] })
    expect(isResent(resent)).toBe(true)
    expect(queueFlag(resent)).toBe('resent')
    expect(queueFlag(rep({ status: 'DISETUJUI', highlight: true }))).toBe('highlight')
    expect(queueFlag(rep({ status: 'DISETUJUI' }))).toBeNull()
    expect(queueFlag(base)).toBeNull()
  })

  it('queueGroups membagi lama/hari ini dan membuang kelompok kosong', () => {
    const items = [rep({ id: 'a', submittedAt: '2026-10-13T01:00:00Z' }), rep({ id: 'b' }), rep({ id: 'c' })]
    const g = queueGroups(items, 'MENUNGGU', NOW)
    expect(g.map((x) => [x.key, x.title, x.items.map((r) => r.id)])).toEqual([
      ['old', 'Lebih dari sehari · 1', ['a']],
      ['today', 'Masuk hari ini · 2', ['b', 'c']],
    ])
    expect(queueGroups([rep({ id: 'b' })], 'MENUNGGU', NOW).map((x) => x.key)).toEqual(['today'])
    expect(queueGroups(items, 'DISETUJUI', NOW)).toEqual([{ key: 'all', title: '3 laporan', warn: false, items }])
    expect(queueGroups([], 'DISETUJUI', NOW)).toEqual([])
  })

  it('antrean lama ≥2 hari', () => {
    const items = [rep({ submittedAt: '2026-10-12T01:00:00Z' }), rep({ submittedAt: '2026-10-14T01:00:00Z' })]
    expect(longWaitCount(items, NOW)).toBe(1)
    expect(longWaitLine(1)).toMatch(/^1 laporan sudah menunggu 2 hari atau lebih/)
    expect(longWaitLine(0)).toBeNull()
  })

  it('baris subholding & umur terlama', () => {
    expect(subLine({ waiting: 0, oldestAt: null }, NOW)).toEqual({ text: 'Tidak ada antrean', warn: false })
    expect(subLine({ waiting: 2, oldestAt: '2026-10-15T00:00:00Z' }, NOW)).toEqual({ text: 'Semua masuk hari ini', warn: false })
    expect(subLine({ waiting: 2, oldestAt: '2026-10-14T00:00:00Z' }, NOW)).toEqual({ text: 'Terlama 1 hari', warn: false })
    expect(subLine({ waiting: 1, oldestAt: '2026-10-12T00:00:00Z' }, NOW)).toEqual({ text: 'Terlama 3 hari', warn: true })
    expect(oldestOf([{ waiting: 1, oldestAt: '2026-10-14T00:00:00Z' }, { waiting: 0, oldestAt: null }, { waiting: 2, oldestAt: '2026-10-12T00:00:00Z' }])).toBe('2026-10-12T00:00:00Z')
    expect(oldestOf([])).toBeNull()
  })
})

describe('rincian', () => {
  it('sentLine per status', () => {
    expect(sentLine(rep({ submittedAt: '2026-10-13T09:20:00Z' }), NOW)).toEqual({ text: 'Dikirim Selasa 13 Okt, 16.20', wait: ' · menunggu 2 hari', warn: true })
    expect(sentLine(base, NOW)).toEqual({ text: 'Dikirim Kamis 15 Okt, 08.00', wait: '', warn: false })
    expect(sentLine(rep({ status: 'DISETUJUI', decidedAt: '2026-10-15T02:00:00Z', decidedByName: 'Bu Sari' }), NOW).text).toBe('Disetujui Kamis 15 Okt, 09.00 oleh Bu Sari')
    expect(sentLine(rep({ status: 'PERLU_PERBAIKAN', decidedAt: '2026-10-15T02:00:00Z' }), NOW).text).toBe('Diminta perbaikan Kamis 15 Okt, 09.00')
  })

  it('neighborId tidak memutar', () => {
    const q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(neighborId(q, 'b', 1)).toBe('c')
    expect(neighborId(q, 'c', 1)).toBeNull()
    expect(neighborId(q, 'a', -1)).toBeNull()
    expect(neighborId(q, 'x', 1)).toBeNull()
  })

  it('rekap hari ini & label komentar', () => {
    expect(todayRecap({ approved: 6, highlighted: 2, revised: 2 })?.line).toMatch(/^Hari ini Anda memutuskan 8 laporan/)
    expect(todayRecap({ approved: 0, highlighted: 0, revised: 0 })).toBeNull()
    expect(todayRecap(null)).toBeNull()
    expect(commentWho({ mine: true, authorName: 'X', kind: 'PERBAIKAN', createdAt: '2026-10-14T11:10:00Z' })).toBe('Anda · Minta perbaikan · Rabu 14 Okt, 18.10')
    expect(commentWho({ mine: false, authorName: 'Admin Sentra', kind: 'BALASAN', createdAt: '2026-10-15T01:40:00Z' })).toBe('Admin Sentra · Balasan admin · Kamis 15 Okt, 08.40')
  })
})
