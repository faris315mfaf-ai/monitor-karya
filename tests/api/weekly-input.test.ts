import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * /api/weekly-input — penyerahan & persetujuan capaian mingguan, buka kunci,
 * dan pembekuan setelah diteruskan. Basis data, sesi dan penyimpanan bukti
 * di-mock; tidak ada koneksi keluar.
 */

const mocks = vi.hoisted(() => ({
  currentUser: { value: null as unknown },
  db: {
    division: { findUnique: vi.fn() },
    weeklyDivisionReport: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    weeklyReportItem: { findMany: vi.fn(), findFirst: vi.fn() },
    evidence: { count: vi.fn() },
    unlockRequest: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: vi.fn(async () => mocks.currentUser.value) }))
vi.mock('@/lib/storage', () => ({ removeEvidence: vi.fn(), storageConfigured: vi.fn(() => false) }))

import { POST, PUT } from '@/app/api/weekly-input/route'
import { weekPeriodOf, weeklyWriteBlock } from '@/lib/lock'

const db = mocks.db
const wib = (isoLocal: string) => new Date(`${isoLocal}+07:00`)

const KADIV: SessionUser = {
  id: 'kadiv-1',
  name: 'Kepala Divisi',
  email: 'kadiv@contoh.test',
  role: 'KEPALA_DIVISI',
  scopeEntityId: 'pt-a',
  avatarColor: null,
  mustChangePassword: false,
}

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  weeklyReportId: 'wr-1',
  workItem: `Pekerjaan ${id}`,
  targetOutput: 'Dokumen final',
  picName: 'Budi',
  status: 'ON_PROGRESS',
  achievementThisWeek: 'Sudah 60%',
  obstacleFollowUp: null,
  evidenceCount: 0,
  ...over,
})

const request = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/weekly-input', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
  })
const post = (body: unknown) => POST(request('POST', body))
const put = (body: unknown) => PUT(request('PUT', body))

/** Buka kunci yang sedang berlaku (UnlockRequest DIEKSEKUSI) untuk laporan wr-1. */
function unlockActive() {
  db.unlockRequest.findFirst.mockResolvedValue({ id: 'ul-1', unlockUntil: wib('2026-10-12T10:00:00') })
}

/** Jumlah bukti per item, sebagaimana dihitung rute dari tabel evidence. */
let evidenceByItem: Record<string, number> = {}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-07T10:00:00')) // Rabu 2026-W41, minggu masih terbuka
  for (const model of Object.values(db)) for (const f of Object.values(model)) f.mockReset()
  mocks.currentUser.value = KADIV
  evidenceByItem = {}

  db.division.findUnique.mockResolvedValue({ id: 'div-1', entityId: 'pt-a', headUserId: 'kadiv-1', isActive: true })
  db.weeklyDivisionReport.findUnique.mockResolvedValue({ id: 'wr-1', statusHeader: 'DRAFT' })
  db.weeklyDivisionReport.update.mockImplementation(async ({ data }) => ({ id: 'wr-1', ...data }))
  db.evidence.count.mockImplementation(async ({ where }) => evidenceByItem[where.targetId] ?? 0)
  db.unlockRequest.findFirst.mockResolvedValue(null)
  db.auditLog.create.mockResolvedValue({})
})
afterEach(() => vi.useRealTimers())

describe('POST /api/weekly-input — serahkan', () => {
  it('ditolak 422 dengan daftar errors bila ada item tanpa bukti', async () => {
    db.weeklyReportItem.findMany.mockResolvedValue([
      item('a'), // berjalan, tanpa bukti -> gagal
      item('b'), // berjalan, ada bukti -> lolos
      item('c', { status: 'BELUM_MULAI' }), // tidak perlu bukti
      item('d', { status: 'SELESAI' }), // selesai, tanpa bukti -> gagal
    ])
    evidenceByItem = { b: 2 }

    const res = await post({ divisionId: 'div-1', action: 'submit', week: '2026-W41' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('2 item belum lolos validasi')
    expect(body.errors).toEqual([
      'Pekerjaan a: Bukti pendukung wajib dilampirkan minimal 1 untuk status ini.',
      'Pekerjaan d: Bukti pendukung wajib dilampirkan minimal 1 untuk status ini.',
    ])
    expect(db.weeklyDivisionReport.update).not.toHaveBeenCalled()
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })

  it('jumlah bukti diambil dari tabel evidence, bukan dari kolom evidenceCount item', async () => {
    // Kolom evidenceCount di baris item bilang 3, tetapi tidak ada bukti nyata.
    db.weeklyReportItem.findMany.mockResolvedValue([item('a', { evidenceCount: 3 })])
    const res = await post({ divisionId: 'div-1', action: 'submit' })
    expect(res.status).toBe(422)
    expect((await res.json()).errors).toHaveLength(1)
    expect(db.evidence.count).toHaveBeenCalledWith({ where: { targetType: 'WEEKLY_ITEM', targetId: 'a' } })
  })

  it('lolos bila semua item yang perlu bukti sudah berbukti', async () => {
    db.weeklyReportItem.findMany.mockResolvedValue([item('a'), item('c', { status: 'NA' })])
    evidenceByItem = { a: 1 }

    const res = await post({ divisionId: 'div-1', action: 'submit' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, statusHeader: 'MENUNGGU_PERSETUJUAN' })
    expect(db.weeklyDivisionReport.update.mock.calls[0][0].data).toMatchObject({
      statusHeader: 'MENUNGGU_PERSETUJUAN',
      submittedById: 'kadiv-1',
    })
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('SUBMIT_WEEKLY_REPORT')
  })

  it('tanpa item sama sekali: 422', async () => {
    db.weeklyReportItem.findMany.mockResolvedValue([])
    const res = await post({ divisionId: 'div-1', action: 'submit' })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/Belum ada item/)
  })

  it('setelah Jumat 17.00 WIB minggu terkunci: 409 sebelum validasi', async () => {
    vi.setSystemTime(wib('2026-10-09T17:00:00'))
    db.weeklyReportItem.findMany.mockResolvedValue([item('a')])
    const res = await post({ divisionId: 'div-1', action: 'submit' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ locked: true })
    expect(db.weeklyReportItem.findMany).not.toHaveBeenCalled()
  })

  it('minggu selain minggu berjalan hanya dibaca: 409', async () => {
    const res = await post({ divisionId: 'div-1', action: 'submit', week: '2026-W40' })
    expect(res.status).toBe(409)
  })

  it('divisi milik kepala divisi lain: 403', async () => {
    db.division.findUnique.mockResolvedValue({ id: 'div-2', entityId: 'pt-a', headUserId: 'kadiv-lain' })
    const res = await post({ divisionId: 'div-2', action: 'submit' })
    expect(res.status).toBe(403)
  })

  it('PIC proyek tidak menyerahkan capaian mingguan: 403', async () => {
    mocks.currentUser.value = { ...KADIV, id: 'pic-1', role: 'PIC_PROYEK' }
    const res = await post({ divisionId: 'div-1', action: 'submit' })
    expect(res.status).toBe(403)
    expect(db.division.findUnique).not.toHaveBeenCalled()
  })

  it('badan permintaan bukan JSON: 400', async () => {
    const res = await POST(new NextRequest('http://localhost/api/weekly-input', { method: 'POST', body: 'bukan json' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/weekly-input — setujui', () => {
  it('laporan masih draf: 422 dengan pesan jelas, tanpa mengubah apa pun', async () => {
    db.weeklyReportItem.findMany.mockResolvedValue([item('a')])
    evidenceByItem = { a: 1 }
    const res = await post({ divisionId: 'div-1', action: 'approve' })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/masih draf/)
    expect(db.weeklyDivisionReport.update).not.toHaveBeenCalled()
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })

  it('laporan menunggu persetujuan: disetujui, bersyarat pada status lama', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue({ id: 'wr-1', statusHeader: 'MENUNGGU_PERSETUJUAN' })
    db.weeklyReportItem.findMany.mockResolvedValue([item('a')])
    evidenceByItem = { a: 1 }
    const res = await post({ divisionId: 'div-1', action: 'approve', week: '2026-W41' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, statusHeader: 'DISETUJUI' })
    const call = db.weeklyDivisionReport.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'wr-1', statusHeader: 'MENUNGGU_PERSETUJUAN' })
    expect(call.data).toMatchObject({ statusHeader: 'DISETUJUI', approvedById: 'kadiv-1' })
    expect(call.data.approvalHash).toMatch(/^sha256:[0-9a-f]{32}$/)
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('APPROVE_WEEKLY')
  })

  it('laporan yang sudah disetujui: 409', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue({ id: 'wr-1', statusHeader: 'DISETUJUI' })
    const res = await post({ divisionId: 'div-1', action: 'approve' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/sudah disetujui/)
    expect(db.weeklyReportItem.findMany).not.toHaveBeenCalled()
  })

  it('Admin PT tidak menyetujui: 403', async () => {
    mocks.currentUser.value = { ...KADIV, id: 'admin-1', role: 'ADMIN_PT' }
    const res = await post({ divisionId: 'div-1', action: 'approve' })
    expect(res.status).toBe(403)
  })

  it('serah ulang laporan yang menunggu persetujuan: 409', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue({ id: 'wr-1', statusHeader: 'MENUNGGU_PERSETUJUAN' })
    const res = await post({ divisionId: 'div-1', action: 'submit' })
    expect(res.status).toBe(409)
    expect(db.weeklyDivisionReport.update).not.toHaveBeenCalled()
  })
})

describe('/api/weekly-input — buka kunci & pembekuan', () => {
  const forwarded = { id: 'wr-1', statusHeader: 'DISETUJUI', forwardedAt: wib('2026-10-08T09:00:00'), isLocked: false }

  it('laporan yang sudah diteruskan dibekukan: PUT 409 frozen', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue(forwarded)
    const res = await put({ divisionId: 'div-1', workItem: 'x', status: 'ON_PROGRESS', aspectCategoryId: 'a', priorityId: 'p' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ locked: true, frozen: true, reason: 'FORWARDED' })
    expect(db.unlockRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ targetType: 'WEEKLY_REPORT', targetId: 'wr-1' }) })
    )
  })

  it('laporan diteruskan dengan buka kunci berlaku: PUT lolos ke validasi isian', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue(forwarded)
    unlockActive()
    // Tanpa aspek/prioritas — 422 membuktikan kunci sudah terangkat.
    const res = await put({ divisionId: 'div-1', workItem: 'x', status: 'ON_PROGRESS' })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/Aspek dan prioritas/)
  })

  it('laporan diteruskan dengan buka kunci: tidak diserahkan ulang (409)', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue(forwarded)
    unlockActive()
    const res = await post({ divisionId: 'div-1', action: 'submit' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/sudah diteruskan ke holding/)
  })

  it('setelah Jumat 17.00 WIB dengan buka kunci berlaku: serah diterima', async () => {
    vi.setSystemTime(wib('2026-10-09T18:00:00'))
    unlockActive()
    db.weeklyReportItem.findMany.mockResolvedValue([item('a')])
    evidenceByItem = { a: 1 }
    const res = await post({ divisionId: 'div-1', action: 'submit' })
    expect(res.status).toBe(200)
    expect(db.auditLog.create.mock.calls[0][0].data.afterData).toContain('"unlocked":true')
  })

  it('minggu lalu dengan buka kunci berlaku: bisa diserahkan', async () => {
    unlockActive()
    db.weeklyReportItem.findMany.mockResolvedValue([item('a', { status: 'NA' })])
    const res = await post({ divisionId: 'div-1', action: 'submit', week: '2026-W40' })
    expect(res.status).toBe(200)
    expect(db.weeklyDivisionReport.findUnique.mock.calls[0][0].where).toEqual({
      divisionId_isoYear_isoWeek: { divisionId: 'div-1', isoYear: 2026, isoWeek: 40 },
    })
  })

  it('minggu lalu tanpa baris laporan: 409, tidak dibuatkan baris', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue(null)
    const res = await post({ divisionId: 'div-1', action: 'submit', week: '2026-W40' })
    expect(res.status).toBe(409)
    expect(db.weeklyDivisionReport.create).not.toHaveBeenCalled()
  })

  it('minggu yang belum berjalan: 409', async () => {
    const res = await post({ divisionId: 'div-1', action: 'submit', week: '2026-W42' })
    expect(res.status).toBe(409)
    expect((await res.json()).reason).toBe('FUTURE_WEEK')
  })

  it('kunci minggu tidak dikenali: 400', async () => {
    const res = await post({ divisionId: 'div-1', action: 'submit', week: 'minggu-lalu' })
    expect(res.status).toBe(400)
  })
})

describe('weeklyWriteBlock — tenggat serah Kamis 17.00, kunci Jumat 17.00 WIB', () => {
  const now = wib('2026-10-08T17:30:00') // Kamis, lewat tenggat serah, belum terkunci
  const period = weekPeriodOf(now)
  const draft = { isLocked: false, statusHeader: 'DRAFT', forwardedAt: null }

  it('lewat tenggat serah Kamis 17.00 masih bisa ditulis sampai Jumat 17.00', () => {
    expect(weeklyWriteBlock({ period, report: draft, unlocked: false, now })).toBeNull()
    expect(
      weeklyWriteBlock({ period, report: draft, unlocked: false, now: wib('2026-10-09T16:59:00') })
    ).toBeNull()
    expect(
      weeklyWriteBlock({ period, report: draft, unlocked: false, now: wib('2026-10-09T17:00:00') })?.reason
    ).toBe('TIME_LOCKED')
  })

  it('pesan kunci memakai label Jumat 17.00 WIB', () => {
    const block = weeklyWriteBlock({ period, report: null, unlocked: false, now: wib('2026-10-09T17:00:00') })
    expect(block?.message).toContain('Jumat 17.00 WIB')
  })

  it('buka kunci tanpa baris laporan tidak membuka apa pun', () => {
    expect(
      weeklyWriteBlock({ period, report: null, unlocked: true, now: wib('2026-10-09T18:00:00') })?.reason
    ).toBe('TIME_LOCKED')
  })

  it('baris TERKUNCI tetap terkunci kecuali dibuka', () => {
    const locked = { ...draft, statusHeader: 'TERKUNCI' }
    expect(weeklyWriteBlock({ period, report: locked, unlocked: false, now })?.reason).toBe('REPORT_LOCKED')
    expect(weeklyWriteBlock({ period, report: locked, unlocked: true, now })).toBeNull()
  })
})
