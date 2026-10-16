import { describe, expect, it } from 'vitest'
import { flatten, scoped, statusSummary, NO_FILTER, type V2Data, type WeekData } from '@/components/views/sh-overview/model'
import {
  THREE_PANE_MIN, allLine, contentKey, dayHeading, dayWord, fillHeight, heatCells, heatPct, joinNames, paneLayout,
  ptBlocks, ptNameOf, ptPanel, ptShort, reportMeta, scopeMeta, shortDay, statusCard, subCards, subRows, toDetail,
  weekHighlights, weekRangeLabel, weekRows,
} from '@/components/views/sh-overview/tablet/logic'

const rep = (id: string, extra: Partial<{ highlight: boolean; highlightNote: string; decidedAt: string; reporterName: string; reporterTitle: string }> = {}) => ({
  id, kegiatan: `K ${id}`, deskripsi: `D ${id}`, evidence: [], ...extra,
})

const data: V2Data = {
  date: '2026-10-15',
  subholdings: [
    {
      id: 'sentra', name: 'Subholding Sentra Multikarya', count: 4, ptCount: 2,
      pts: [
        { id: 'pt-b', name: 'PT BETON PERKASA', reports: [rep('b1'), rep('b2', { highlight: true, highlightNote: 'Perlu keputusan' })] },
        { id: 'pt-j', name: 'PT Jembatan', reports: [rep('j1')] },
        { id: 'pt-k', name: 'PT Kawat', reports: [rep('k1'), rep('k2'), rep('k3')] },
      ],
      allPts: [
        { id: 'pt-a', name: 'PT Aspal' }, { id: 'pt-b', name: 'PT BETON PERKASA' }, { id: 'pt-j', name: 'PT Jembatan' },
        { id: 'pt-k', name: 'PT Kawat' }, { id: 'pt-z', name: 'PT Zona' },
      ],
    },
    { id: 'tunas', name: 'Tunas Baru', count: 0, ptCount: 0, pts: [], allPts: [{ id: 'pt-t', name: 'PT Tunas Agro' }] },
  ],
}

const week: WeekData = {
  start: '2026-10-09',
  end: '2026-10-15',
  days: ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'],
  subholdings: [
    { id: 'sentra', name: 'Subholding Sentra Multikarya', counts: [2, 1, 0, 2, 3, 3, 3], pts: [
      { id: 'pt-b', name: 'PT Beton Perkasa', counts: [1, 0, 0, 1, 1, 2, 2] },
      { id: 'pt-z', name: 'PT Zona', counts: [0, 0, 0, 0, 0, 0, 0] },
    ] },
    { id: 'tunas', name: 'Tunas Baru', counts: [1, 0, 0, 1, 0, 0, 0] },
  ],
  highlights: [
    { id: 'h1', date: '2026-10-15', kegiatan: 'Retak', subholdingId: 'sentra', subholdingName: 'Subholding Sentra Multikarya', ptName: 'PT Beton Perkasa', highlightNote: 'n' },
    { id: 'h2', date: '2026-10-12', kegiatan: 'Listrik', subholdingId: 'tunas', subholdingName: 'Tunas Baru', ptName: 'PT Tunas Agro', highlightNote: null },
  ],
}

describe('paneLayout', () => {
  it('tiga panel mulai 1000px kontainer; panel subholding menyempit saat subholding dipilih', () => {
    expect(paneLayout(THREE_PANE_MIN, false)).toEqual({ mode: 'three', sideW: 300, ptW: 290 })
    expect(paneLayout(1180, true)).toEqual({ mode: 'three', sideW: 250, ptW: 290 })
  })
  it('dua panel di bawah 1000px, panel kiri menyempit di kontainer sempit', () => {
    expect(paneLayout(999, false)).toEqual({ mode: 'two', sideW: 268, ptW: 0 })
    expect(paneLayout(834, true).sideW).toBe(300)
    expect(paneLayout(700, true).sideW).toBe(264)
    expect(paneLayout(700, false).sideW).toBe(248)
    expect(paneLayout(Number.NaN, false).mode).toBe('two')
  })
})

describe('fillHeight', () => {
  it('sisa layar di bawah kontainer dikurangi padding bawah, tidak kurang dari batas', () => {
    expect(fillHeight(900, 92, 48)).toBe(760)
    expect(fillHeight(500, 92, 48)).toBe(480)
    expect(fillHeight(900, -40, 0, 300)).toBe(900)
  })
})

describe('contentKey', () => {
  it('berubah menurut rentang, subholding, dan PT', () => {
    expect(contentKey('today', NO_FILTER)).toBe('today|semua|')
    expect(contentKey('week', { sub: 's', pt: 'p' })).toBe('week|s|p')
    expect(contentKey('today', { sub: 's', pt: null })).not.toBe(contentKey('yesterday', { sub: 's', pt: null }))
  })
})

describe('tanggal', () => {
  it('kepala hari, tanggal pendek, dan rentang 7 hari', () => {
    expect(dayHeading('2026-10-15')).toBe('Kamis, 15 Oktober')
    expect(dayHeading('')).toBe('')
    expect(shortDay('2026-10-15')).toBe('Kam 15 Okt')
    expect(weekRangeLabel(week.days)).toBe('9–15 Oktober 2026')
    expect(weekRangeLabel(['2026-09-28', '2026-10-04'])).toBe('28 September – 4 Oktober 2026')
    expect(weekRangeLabel(['2025-12-29', '2026-01-04'])).toBe('29 Desember 2025 – 4 Januari 2026')
    expect(weekRangeLabel(null)).toBe('')
    expect(dayWord('yesterday')).toBe('kemarin')
    expect(dayWord('week')).toBe('hari ini')
  })
})

describe('nama', () => {
  it('PT ringkas tanpa awalan, kapital dirapikan', () => {
    expect(ptShort('PT BETON PERKASA')).toBe('Beton Perkasa')
    expect(ptShort('PT. Jaya')).toBe('Jaya')
    expect(ptShort('PT')).toBe('PT')
  })
  it('gabung nama dengan "dan n lainnya"', () => {
    expect(joinNames(['A', 'B'])).toBe('A, B')
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C dan 2 lainnya')
  })
})

describe('subRows & allLine', () => {
  it('hari: "n/total PT · n laporan", sorotan, dan belum melapor', () => {
    const [s, t] = subRows(data, null, 'today')
    expect(s).toMatchObject({ id: 'sentra', name: 'Sentra Multikarya', reports: 6, highlights: 1, line: '3/5 PT · 6 laporan', warn: false })
    expect(t).toMatchObject({ id: 'tunas', reports: 0, line: '1 PT · belum melapor', warn: true })
    expect(allLine(data, null, 'today')).toBe('6 laporan')
  })
  it('7 hari: jumlah 7 hari atau peringatan hari kerja kosong', () => {
    const [s, t] = subRows(data, week, 'week')
    expect(s).toMatchObject({ reports: 14, line: '14 laporan · 7 hari', warn: false })
    expect(t).toMatchObject({ line: '3 hari kerja belum melapor', warn: true })
    expect(allLine(data, week, 'week')).toBe('9–15 Oktober 2026')
    expect(subRows(data, null, 'week')[0].line).toBe('Pola 7 hari')
  })
  it('tanpa data hari memakai daftar subholding 7 hari', () => {
    expect(subRows(null, week, 'week').map((r) => r.id)).toEqual(['sentra', 'tunas'])
    expect(subRows(null, null, 'today')).toEqual([])
  })
})

describe('statusCard', () => {
  it('ringkasan melapor dan siapa yang belum', () => {
    expect(statusCard(statusSummary(data, NO_FILTER))).toEqual({ line: '1 dari 2 melapor', sub: 'Tunas Baru belum melapor', tone: 'warn' })
    expect(statusCard({ level: 'sub', done: 2, total: 2, reports: 3, missing: [] })).toEqual({
      line: '2 dari 2 melapor', sub: 'Semua subholding sudah melapor', tone: 'ok',
    })
    expect(statusCard({ level: 'pt', done: 0, total: 4, reports: 0, missing: ['PT A', 'PT B', 'PT C', 'PT D'] }).sub).toBe(
      'A, B, C dan 1 lainnya belum melapor'
    )
  })
})

describe('ptPanel', () => {
  const sub = data.subholdings[0]
  it('membagi Melapor/Belum melapor dengan judul jumlah penuh', () => {
    const p = ptPanel(sub, '', 'today')
    expect(p.status).toBe('3 dari 5 melapor')
    expect(p.reportingTitle).toBe('Melapor hari ini · 3')
    expect(p.silentTitle).toBe('Belum melapor · 2')
    expect(p.total).toBe(6)
    expect(p.showAll).toBe(true)
    expect(p.reporting.map((x) => x.id)).toEqual(['pt-k', 'pt-b', 'pt-j'])
    expect(p.reporting[1]).toMatchObject({ count: 2, highlights: 1 })
    expect(p.silent.map((x) => x.id)).toEqual(['pt-a', 'pt-z'])
  })
  it('pencarian menyaring kedua bagian, judul tetap jumlah penuh', () => {
    const p = ptPanel(sub, 'beton', 'yesterday')
    expect(p.reportingTitle).toBe('Melapor kemarin · 3')
    expect(p.showAll).toBe(false)
    expect(p.reporting.map((x) => x.id)).toEqual(['pt-b'])
    expect(p.silent).toEqual([])
    expect(ptPanel(sub, 'semua', 'today').showAll).toBe(true)
  })
  it('tanpa subholding kosong', () => {
    expect(ptPanel(null, '', 'today')).toMatchObject({ status: '0 dari 0 melapor', reporting: [], silent: [] })
  })
  it('nama PT dari id melapor atau PT aktif', () => {
    expect(ptNameOf(sub, 'pt-b')).toBe('PT BETON PERKASA')
    expect(ptNameOf(sub, 'pt-z')).toBe('PT Zona')
    expect(ptNameOf(sub, null)).toBe('')
    expect(ptNameOf(sub, 'tidak-ada')).toBe('')
  })
})

describe('konten', () => {
  it('kartu ringkas: 3 teratas dengan sorotan dulu, kosong di akhir', () => {
    const cards = subCards({ ...data, subholdings: [data.subholdings[1], data.subholdings[0]] }, flatten(data))
    expect(cards.map((c) => c.id)).toEqual(['sentra', 'tunas'])
    expect(cards[0].count).toBe(6)
    expect(cards[0].top.map((r) => r.id)).toEqual(['b2', 'b1', 'j1'])
    expect(cards[1]).toMatchObject({ empty: true, top: [] })
  })
  it('blok per PT: terbanyak dulu, sorotan dulu di dalam PT', () => {
    const blocks = ptBlocks(scoped(data, { sub: 'sentra', pt: null }))
    expect(blocks.map((b) => b.ptId)).toEqual(['pt-k', 'pt-b', 'pt-j'])
    expect(blocks[1].reports.map((r) => r.id)).toEqual(['b2', 'b1'])
  })
  it('meta kepala subholding dan PT', () => {
    expect(scopeMeta({ reports: 6, highlights: 1, ptDone: 3, ptTotal: 5, range: 'today' })).toBe('6 laporan · 3 dari 5 PT melapor · 1 sorotan')
    expect(scopeMeta({ reports: 0, highlights: 0, ptDone: 0, ptTotal: 25, range: 'today' })).toBe('25 PT · belum melapor hari ini')
    expect(scopeMeta({ reports: 2, highlights: 0, range: 'yesterday' })).toBe('2 laporan kemarin')
    expect(scopeMeta({ reports: 0, highlights: 0, range: 'today' })).toBe('Belum melapor hari ini')
  })
  it('meta baris laporan: jam WIB · pelapor, jabatan', () => {
    expect(reportMeta({ decidedAt: '2026-10-15T03:15:00.000Z', reporterName: 'Hendra', reporterTitle: 'Manajer Proyek' })).toBe(
      '10.15 · Hendra, Manajer Proyek'
    )
    expect(reportMeta({ reporterName: ' ' })).toBe('')
  })
  it('laporan → rincian membawa catatan sorotan', () => {
    const r = flatten(data).find((x) => x.id === 'b2')!
    const d = toDetail(r)
    expect(d).toMatchObject({
      id: 'b2', ptName: 'PT Beton Perkasa', subholdingName: 'Sentra Multikarya', highlight: true, highlightNote: 'Perlu keputusan',
    })
    expect(d.tone).toBeGreaterThanOrEqual(1)
    expect(toDetail(flatten(data)[0])).toMatchObject({ highlight: false, highlightNote: null })
  })
})

describe('7 hari', () => {
  it('intensitas sel naik per laporan dan dibatasi', () => {
    expect(heatPct(0)).toBe(0)
    expect(heatPct(1)).toBe(30)
    expect(heatPct(3)).toBe(54)
    expect(heatPct(10)).toBe(60)
    expect(heatPct(Number.NaN)).toBe(0)
  })
  it('sel: terisi, hari kerja kosong, akhir pekan', () => {
    const cells = heatCells(week.days, [2, 0, 0, 0, 1, 0, 3])
    expect(cells.map((c) => c.kind)).toEqual(['filled', 'weekend', 'weekend', 'gap', 'filled', 'gap', 'filled'])
    expect(cells[0].aria).toBe('Jum 9: 2 laporan')
    expect(cells[3].aria).toBe('Sen 12: tidak ada laporan')
  })
  it('baris: subholding, PT bila subholding dipilih, satu PT bila PT dipilih', () => {
    expect(weekRows(week, NO_FILTER)).toMatchObject({ level: 'sub', rows: [{ id: 'sentra', name: 'Sentra Multikarya' }, { id: 'tunas' }] })
    const pt = weekRows(week, { sub: 'sentra', pt: null })
    expect(pt.level).toBe('pt')
    expect(pt.rows.map((r) => r.name)).toEqual(['Beton Perkasa', 'Zona'])
    expect(pt.rows[1].note.tone).toBe('strong-warn')
    expect(weekRows(week, { sub: 'sentra', pt: 'pt-z' }).rows.map((r) => r.id)).toEqual(['pt-z'])
    expect(weekRows(week, { sub: 'tunas', pt: null })).toMatchObject({ level: 'sub', rows: [{ id: 'tunas' }] })
    expect(weekRows(null, NO_FILTER)).toEqual({ level: 'sub', rows: [] })
  })
  it('sorotan 7 hari disaring subholding dan nama PT', () => {
    expect(weekHighlights(week, NO_FILTER).map((h) => h.id)).toEqual(['h1', 'h2'])
    expect(weekHighlights(week, NO_FILTER)[0]).toMatchObject({ day: 'Kam 15 Okt', subShort: 'Sentra Multikarya' })
    expect(weekHighlights(week, { sub: 'sentra', pt: null }).map((h) => h.id)).toEqual(['h1'])
    expect(weekHighlights(week, { sub: 'sentra', pt: 'pt-z' }, 'PT Zona')).toEqual([])
    expect(weekHighlights(null, NO_FILTER)).toEqual([])
  })
})
