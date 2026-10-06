import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WeeklySummaryView } from '@/components/kadiv/types'
import { asUser, auditsOf, db, jsonReq, matches, resetWorld, wib, world } from './pic-world'

/*
 * [F3-C] /api/kadiv/weekly-summary — ringkasan laporan mingguan kepala divisi
 * untuk Direktur, plus readDivisionSummaries (yang dibaca layar Direktur).
 * buildWeeklySummary (perhitungan angka) di-mock; aturan kunci/kirim/urungkan
 * dan cakupan dijalankan sungguhan. Baris WeeklyDivisionSummary di memori.
 * Minggu berjalan: 2026-W41 (Senin 5 Okt), serah Kamis 8 Okt 17.00, kunci Jumat 9 Okt 17.00 WIB.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => (await import('./pic-world')).auth)
vi.mock('@/lib/kadiv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/kadiv')>()),
  buildWeeklySummary: vi.fn(),
}))

import { GET, POST, PUT } from '@/app/api/kadiv/weekly-summary/route'
import { buildWeeklySummary, readDivisionSummaries } from '@/lib/kadiv'

const build = vi.mocked(buildWeeklySummary)

type Summary = Record<string, unknown> & { divisionId: string; isoYear: number; isoWeek: number; status: string; points: string[] }
let rows: Summary[] = []

const LIVE = {
  outputsAccepted: 4, outputsTarget: 6, projectsOnTrack: 1, projectsTotal: 1, openObstacles: 0, pendingReview: 0,
  points: ['4 output diterima', 'Semua proyek sesuai jadwal', 'Tanpa kendala terbuka'],
}

function view(over: Partial<WeeklySummaryView> = {}, live: Partial<typeof LIVE> = {}): WeeklySummaryView {
  return {
    division: { id: 'div-a1', name: 'Media' },
    week: { key: '2026-W41', isoYear: 2026, isoWeek: 41, start: '', handoverBy: '', lockAt: '' },
    live: { ...LIVE, ...live },
    saved: null,
    daily: { sent: 5, required: 5 },
    report: null,
    directors: [],
    blocked: null,
    undoMinutes: 15,
    ...over,
  }
}

const keyOf = (where: { divisionId_isoYear_isoWeek: { divisionId: string; isoYear: number; isoWeek: number } }) => where.divisionId_isoYear_isoWeek
const findRow = (k: { divisionId: string; isoYear: number; isoWeek: number }) =>
  rows.find((r) => r.divisionId === k.divisionId && r.isoYear === k.isoYear && r.isoWeek === k.isoWeek)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-06T10:00:00')) // Selasa minggu 41
  resetWorld()
  rows = []
  build.mockReset()
  build.mockResolvedValue(view())
  db.weeklyDivisionReport.findUnique.mockResolvedValue(null)
  db.weeklyDivisionSummary.findUnique.mockImplementation(async ({ where }) => findRow(keyOf(where)) ?? null)
  db.weeklyDivisionSummary.upsert.mockImplementation(async ({ where, create, update }) => {
    const hit = findRow(keyOf(where))
    if (hit) Object.assign(hit, update)
    else rows.push({ id: `ws-${rows.length + 1}`, status: 'DRAF', ...create })
    return { id: (hit ?? rows[rows.length - 1]).id, updatedAt: new Date() }
  })
  db.weeklyDivisionSummary.updateMany.mockImplementation(async ({ where, data }) => {
    const hit = rows.filter((r) => matches(r, where))
    for (const r of hit) Object.assign(r, data)
    return { count: hit.length }
  })
  db.weeklyDivisionSummary.findMany.mockImplementation(async ({ where }) => rows.filter((r) => matches(r, where)))
})
afterEach(() => vi.useRealTimers())

const put = (body: unknown) => PUT(jsonReq('/api/kadiv/weekly-summary', 'PUT', body))
const post = (body: unknown) => POST(jsonReq('/api/kadiv/weekly-summary', 'POST', body))
const POINTS = ['Video kampanye selesai', 'Rilis situs tetap 24 Okt']

describe('GET /api/kadiv/weekly-summary', () => {
  it('kepala divisi membaca divisinya; minggu tidak valid 422', async () => {
    asUser('kadiv-1')
    expect((await GET(jsonReq('/api/kadiv/weekly-summary?divisionId=div-a1', 'GET'))).status).toBe(200)
    expect(build.mock.calls[0][0]).toMatchObject({ id: 'div-a1' })
    build.mockResolvedValue(null)
    expect((await GET(jsonReq('/api/kadiv/weekly-summary?week=2026-W99', 'GET'))).status).toBe(422)
  })

  it.each(['kadiv-2', 'pic-1', 'dir-a', 'admin-a'])('%s tidak membaca ringkasan divisi div-a1 (403)', async (id) => {
    asUser(id)
    expect((await GET(jsonReq('/api/kadiv/weekly-summary?divisionId=div-a1', 'GET'))).status).toBe(403)
    expect(build).not.toHaveBeenCalled()
  })
})

describe('PUT /api/kadiv/weekly-summary — simpan draf', () => {
  it.each<[unknown, string]>([
    [[], 'kosong'],
    [['a', 'b', 'c', 'd'], 'lebih dari 3 poin'],
    [['x'.repeat(281)], 'poin lebih dari 280 huruf'],
    ['bukan larik', 'bukan larik'],
    [[1, 2], 'bukan teks'],
  ])('poin %j (%s) → 422 tanpa menyentuh basis data', async (points) => {
    asUser('kadiv-1')
    expect((await put({ divisionId: 'div-a1', points })).status).toBe(422)
    expect(db.weeklyDivisionSummary.upsert).not.toHaveBeenCalled()
  })

  it('kepala divisi lain: 403', async () => {
    asUser('kadiv-2')
    expect((await put({ divisionId: 'div-a1', points: POINTS })).status).toBe(403)
    expect(rows).toHaveLength(0)
  })

  it('simpan draf minggu berjalan + audit KADIV_SAVE_WEEKLY_SUMMARY', async () => {
    asUser('kadiv-1')
    const res = await put({ divisionId: 'div-a1', points: ['  Video   kampanye selesai ', 'Rilis situs tetap 24 Okt'] })
    expect(res.status).toBe(200)
    expect(rows).toEqual([expect.objectContaining({ divisionId: 'div-a1', isoYear: 2026, isoWeek: 41, status: 'DRAF', points: POINTS, updatedById: 'kadiv-1' })])
    const [a] = auditsOf('KADIV_SAVE_WEEKLY_SUMMARY')
    expect(a.after).toEqual({ divisionId: 'div-a1', week: '2026-W41', points: POINTS })
    expect(a.before).toBeNull()
  })

  it('ringkasan yang sudah terkirim tidak bisa disunting (409 SENT)', async () => {
    rows.push({ id: 'ws-1', divisionId: 'div-a1', isoYear: 2026, isoWeek: 41, status: 'TERKIRIM', points: POINTS })
    asUser('kadiv-1')
    const res = await put({ divisionId: 'div-a1', points: ['Ganti'] })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SENT')
    expect(rows[0].points).toEqual(POINTS)
  })

  it('sejak kunci Jumat 17.00: 409 LOCKED', async () => {
    vi.setSystemTime(wib('2026-10-09T17:00:00'))
    asUser('kadiv-1')
    const res = await put({ divisionId: 'div-a1', points: POINTS })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('LOCKED')
  })

  it('laporan mingguan sudah diteruskan ke holding: 409 FORWARDED', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue({ id: 'wr-1', forwardedAt: wib('2026-10-06T09:00:00') })
    asUser('kadiv-1')
    const res = await put({ divisionId: 'div-a1', points: POINTS })
    expect((await res.json()).code).toBe('FORWARDED')
  })

  it('migrasi 0021 belum diterapkan: 503 dengan pesan jelas', async () => {
    db.weeklyDivisionSummary.findUnique.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: 'P2021' }))
    asUser('kadiv-1')
    const res = await put({ divisionId: 'div-a1', points: POINTS })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/migrasi 0021/)
  })

  it('galat lain: 500 dengan pesan umum', async () => {
    db.weeklyDivisionSummary.upsert.mockRejectedValue(new Error('duplicate key token=abc'))
    asUser('kadiv-1')
    const res = await put({ divisionId: 'div-a1', points: POINTS })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Draf ringkasan belum tersimpan' })
  })
})

describe('POST /api/kadiv/weekly-summary — kirim ke Direktur & urungkan', () => {
  it('masih ada output menunggu review sebelum Kamis 17.00: 409 PENDING_REVIEW tanpa konfirmasi', async () => {
    build.mockResolvedValue(view({}, { pendingReview: 2 }))
    asUser('kadiv-1')
    const res = await post({ divisionId: 'div-a1', action: 'send' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'PENDING_REVIEW', pendingReview: 2 })
    expect(rows).toHaveLength(0)
    expect(world.notifications).toHaveLength(0)
  })

  it('kirim dengan konfirmasi: potret angka server, TERKIRIM, lonceng ke direktur PT, audit', async () => {
    build.mockResolvedValue(view({}, { pendingReview: 2 }))
    asUser('kadiv-1')
    const res = await post({ divisionId: 'div-a1', action: 'send', confirmPending: true, points: POINTS })
    expect(res.status).toBe(200)
    expect((await res.json()).directors).toEqual([{ id: 'dir-a', name: 'Hadi' }])
    expect(rows[0]).toMatchObject({ status: 'TERKIRIM', points: POINTS, outputsAccepted: 4, pendingReview: 2, sentById: 'kadiv-1' })
    expect(world.notifications.map((n) => [n.userId, n.template])).toEqual([['dir-a', 'RINGKASAN_MINGGUAN_DIVISI']])
    const [a] = auditsOf('KADIV_SEND_WEEKLY_SUMMARY')
    expect(a.after).toMatchObject({ divisionId: 'div-a1', week: '2026-W41', confirmedPending: true, directors: ['Hadi'] })
  })

  it('setelah tenggat serah Kamis 17.00 kirim tidak perlu konfirmasi', async () => {
    vi.setSystemTime(wib('2026-10-08T18:00:00'))
    build.mockResolvedValue(view({}, { pendingReview: 1 }))
    asUser('kadiv-1')
    expect((await post({ divisionId: 'div-a1', action: 'send' })).status).toBe(200)
  })

  it('tanpa poin di body: memakai draf tersimpan, lalu draf otomatis', async () => {
    asUser('kadiv-1')
    build.mockResolvedValue(view({ saved: { ...LIVE, status: 'DRAF', points: ['Draf saya'], sentAt: null, updatedAt: '' } }))
    await post({ divisionId: 'div-a1', action: 'send' })
    expect(rows[0].points).toEqual(['Draf saya'])
  })

  it('sudah terkirim: 409 SENT', async () => {
    build.mockResolvedValue(view({ saved: { ...LIVE, status: 'TERKIRIM', points: POINTS, sentAt: '', updatedAt: '' } }))
    asUser('kadiv-1')
    const res = await post({ divisionId: 'div-a1', action: 'send' })
    expect((await res.json()).code).toBe('SENT')
  })

  it('kepala divisi lain tidak bisa mengirim atas nama divisi ini', async () => {
    asUser('kadiv-2')
    expect((await post({ divisionId: 'div-a1', action: 'send' })).status).toBe(403)
    expect(build).not.toHaveBeenCalled()
  })

  it('poin tidak valid 422; aksi tak dikenal 400', async () => {
    asUser('kadiv-1')
    expect((await post({ divisionId: 'div-a1', action: 'send', points: [] })).status).toBe(422)
    expect((await post({ divisionId: 'div-a1', action: 'hapus' })).status).toBe(400)
  })

  it('urungkan kirim: kembali DRAF + audit; belum terkirim 409; setelah kunci 409', async () => {
    rows.push({ id: 'ws-1', divisionId: 'div-a1', isoYear: 2026, isoWeek: 41, status: 'TERKIRIM', points: POINTS, sentAt: new Date(), sentById: 'kadiv-1' })
    asUser('kadiv-1')
    expect((await post({ divisionId: 'div-a1', action: 'unsend' })).status).toBe(200)
    expect(rows[0]).toMatchObject({ status: 'DRAF', sentAt: null, sentById: null })
    expect(auditsOf('KADIV_UNSEND_WEEKLY_SUMMARY')).toHaveLength(1)
    expect((await post({ divisionId: 'div-a1', action: 'unsend' })).status).toBe(409)

    rows[0].status = 'TERKIRIM'
    vi.setSystemTime(wib('2026-10-09T17:30:00'))
    const res = await post({ divisionId: 'div-a1', action: 'unsend' })
    expect((await res.json()).code).toBe('LOCKED')
    expect(rows[0].status).toBe('TERKIRIM')
  })
})

describe('readDivisionSummaries — yang dibaca Direktur', () => {
  it('hanya ringkasan TERKIRIM pada divisi & minggu yang diminta', async () => {
    rows.push(
      { id: 'ws-1', divisionId: 'div-a1', isoYear: 2026, isoWeek: 41, status: 'TERKIRIM', ...LIVE, points: POINTS, sentAt: wib('2026-10-08T10:00:00'), sentById: 'kadiv-1' },
      { id: 'ws-2', divisionId: 'div-a2', isoYear: 2026, isoWeek: 41, status: 'DRAF', points: ['draf'] },
      { id: 'ws-3', divisionId: 'div-b1', isoYear: 2026, isoWeek: 41, status: 'TERKIRIM', points: ['PT lain'] },
    )
    const map = await readDivisionSummaries(['div-a1', 'div-a2'], 2026, 41)
    expect([...map.keys()]).toEqual(['div-a1'])
    expect(map.get('div-a1')).toMatchObject({ points: POINTS, outputsAccepted: 4, sentById: 'kadiv-1', sentAt: wib('2026-10-08T10:00:00').toISOString() })
    expect(db.weeklyDivisionSummary.findMany.mock.calls[0][0].where).toEqual({ divisionId: { in: ['div-a1', 'div-a2'] }, isoYear: 2026, isoWeek: 41, status: 'TERKIRIM' })
  })

  it('tanpa divisi: peta kosong tanpa kueri; tabel belum ada: peta kosong', async () => {
    expect((await readDivisionSummaries([], 2026, 41)).size).toBe(0)
    expect(db.weeklyDivisionSummary.findMany).not.toHaveBeenCalled()
    db.weeklyDivisionSummary.findMany.mockRejectedValue(Object.assign(new Error('x'), { code: 'P2021' }))
    expect((await readDivisionSummaries(['div-a1'], 2026, 41)).size).toBe(0)
  })
})
