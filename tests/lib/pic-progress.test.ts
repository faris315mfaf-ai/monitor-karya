import { describe, expect, it } from 'vitest'
import {
  nearestDeadlines, plannedPctAt, reportHistory, stageSpans, weeklyProgress, workingDaysBack,
  type ReportInput, type StageInput,
} from '@/lib/pic-progress'

/** Tengah malam WIB "YYYY-MM-DD". */
const d = (k: string) => new Date(`${k}T00:00:00+07:00`)
const at = (k: string, hh: number, mm = 0) => new Date(`${k}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00`)

const S = (id: string, position: number, start: string | null, due: string | null, status = 'BELUM_MULAI', note: string | null = null): StageInput => ({
  id, name: `Tahap ${id}`, position, startDate: start ? d(start) : null, dueDate: due ? d(due) : null, status, note,
})
const R = (k: string, pct: number, o: Partial<ReportInput> = {}): ReportInput => ({
  reportDate: d(k), progressPct: pct, status: 'ON_PROGRESS', submittedAt: at(k, 16), forwardedAt: null, isLate: false, ...o,
})

describe('stageSpans / plannedPctAt', () => {
  const project = { startDate: d('2026-09-01'), targetEndDate: d('2026-10-30') }

  it('setiap tahap bernilai sama, linear di dalam tahap', () => {
    const spans = stageSpans([S('a', 0, '2026-09-01', '2026-09-10'), S('b', 1, '2026-09-11', '2026-09-30')], project)
    expect(spans).toHaveLength(2)
    // Tahap a selesai penuh (akhir hari 10 Sep), tahap b belum mulai: 50%.
    expect(plannedPctAt(spans, project, d('2026-09-11'))).toBe(50)
    // Sebelum mulai: 0; setelah semua selesai: 100.
    expect(plannedPctAt(spans, project, d('2026-08-01'))).toBe(0)
    expect(plannedPctAt(spans, project, d('2026-11-01'))).toBe(100)
  })

  it('tanggal yang kosong diisi dari tahap tetangga atau proyek', () => {
    const spans = stageSpans([S('a', 0, null, '2026-09-10'), S('b', 1, null, null)], project)
    expect(spans).toHaveLength(2)
    expect(spans[0].start).toBe(d('2026-09-01').getTime())
    expect(spans[1].start).toBe(d('2026-09-11').getTime())
    // Tahap terakhir tanpa tanggal selesai berakhir di tenggat proyek.
    expect(spans[1].end).toBe(d('2026-10-30').getTime())
  })

  it('tanpa tahapan: linear dari mulai proyek ke akhir hari tenggat', () => {
    const p = { startDate: d('2026-10-01'), targetEndDate: d('2026-10-10') }
    expect(plannedPctAt([], p, d('2026-10-06'))).toBe(50)
    expect(plannedPctAt([], { startDate: null, targetEndDate: null }, d('2026-10-06'))).toBeNull()
  })
})

describe('weeklyProgress', () => {
  it('memberi 6 minggu terakhir dengan aktual = laporan terkirim terakhir', () => {
    const now = at('2026-10-06', 15) // Selasa M41
    const res = weeklyProgress({
      stages: [],
      project: { startDate: d('2026-08-01'), targetEndDate: d('2026-10-30') },
      reports: [R('2026-09-01', 10), R('2026-09-24', 40), R('2026-10-05', 64), R('2026-10-06', 70, { submittedAt: null })],
      now,
    })
    expect(res.source).toBe('LINEAR')
    expect(res.weeks.map((w) => w.label)).toEqual(['M36', 'M37', 'M38', 'M39', 'M40', 'M41'])
    expect(res.weeks[0].actual).toBe(10)
    expect(res.weeks[3].actual).toBe(40) // M39 memuat 24 Sep
    // Draf hari ini tidak dihitung; minggu berjalan memakai laporan terkirim 5 Okt.
    expect(res.weeks[5].actual).toBe(64)
    expect(res.weeks[5].key).toBe('2026-W41')
    expect(res.weeks.every((w) => w.plan !== null)).toBe(true)
  })

  it('melewati minggu sebelum proyek mulai dan tanpa rencana bila tanggal kosong', () => {
    const res = weeklyProgress({ stages: [], project: { startDate: d('2026-09-29'), targetEndDate: null }, reports: [], now: at('2026-10-06', 9) })
    expect(res.source).toBe('NONE')
    expect(res.weeks.map((w) => w.label)).toEqual(['M40', 'M41'])
    expect(res.weeks[0].plan).toBeNull()
    expect(res.weeks[0].reported).toBe(false)
  })
})

describe('nearestDeadlines', () => {
  const now = at('2026-10-06', 10)
  it('urut terdekat, yang lewat di atas, tenggat proyek selalu ada', () => {
    const items = nearestDeadlines({
      now,
      stages: [
        S('done', 0, '2026-09-01', '2026-09-10', 'SELESAI'),
        S('hold', 1, '2026-09-28', '2026-10-05', 'TERTAHAN', 'Perangkat terlambat'),
        S('next', 2, '2026-10-12', '2026-10-18'),
      ],
      outputs: [
        { id: 'o1', title: 'Panduan pengguna', status: 'PERLU_REVISI', dueDate: d('2026-10-08') },
        { id: 'o2', title: 'Sudah diterima', status: 'DITERIMA', dueDate: d('2026-10-07') },
      ],
      project: { startDate: d('2026-08-01'), targetEndDate: d('2026-10-24') },
      proposal: { proposedDate: d('2026-10-31') },
      limit: 3,
    })
    expect(items.map((i) => i.id)).toEqual(['hold:due', 'o1:output', 'project:target'])
    expect(items[0]).toMatchObject({ state: 'late', badge: 'Lewat 1 hari', note: 'Perangkat terlambat' })
    expect(items[1]).toMatchObject({ daysLeft: 2, state: 'risk' })
    expect(items[2].note).toContain('2026-10-31')
  })

  it('tahap belum mulai memakai tanggal mulai', () => {
    const items = nearestDeadlines({ now, stages: [S('next', 0, '2026-10-12', '2026-10-18')], outputs: [], project: { startDate: null, targetEndDate: null }, proposal: null })
    expect(items).toEqual([expect.objectContaining({ id: 'next:start', title: 'Tahap next mulai', daysLeft: 6, state: 'neutral', badge: '6 hari lagi' })])
  })
})

describe('reportHistory', () => {
  it('6 hari kerja, akhir pekan dilewati, hari ini sebelum tenggat = PENDING', () => {
    const now = at('2026-10-06', 10) // Selasa
    expect(workingDaysBack(now, 6).map((x) => x.toISOString())).toEqual(
      ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'].map((k) => d(k).toISOString())
    )
    const h = reportHistory({
      now,
      reports: [R('2026-09-29', 50, { forwardedAt: at('2026-09-29', 18) }), R('2026-09-30', 52, { isLate: true }), R('2026-10-02', 58, { submittedAt: null })],
      cutoffPassed: (day) => day.getTime() < d('2026-10-06').getTime(),
    })
    expect(h.map((x) => x.state)).toEqual(['FORWARDED', 'LATE', 'MISSING', 'MISSING', 'MISSING', 'PENDING'])
    expect(h[0].progressPct).toBe(50)
  })

  it('hari Minggu mundur ke Jumat', () => {
    const days = workingDaysBack(at('2026-10-04', 12), 1)
    expect(days[0].toISOString()).toBe(d('2026-10-02').toISOString())
  })
})
