import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asUser, db, jsonReq, resetWorld, wib } from './pic-world'
import { NextRequest } from 'next/server'

/*
 * [T12] Bug baru di rute API: IDOR baca detail entitas oleh peran pelaksana,
 * gerbang kunci 17.00 yang mengabaikan aturan PT (pengingat Meja kerja),
 * aktivasi proyek yang ditolak lewat ganti status, keputusan eskalasi ganda,
 * hapus akun/PT dengan riwayat (P2003), usulan tenggat ganda, tanggal WIB
 * dateFrom/dateTo, parameter halaman bukan-angka, dan insiden dasbor lintas bulan.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => ({
  ...(await import('./pic-world')).auth,
  refuseUnscoped: () => null,
  isGlobalRole: (r: string) => ['MANAJEMEN', 'SUPERADMIN', 'TI', 'AUDITOR'].includes(r),
  scopePathPrefix: async () => '/BIKE/PTA/',
  resolveScopeEntityId: () => null,
  scopeUserIds: async () => null,
}))

import * as entityDetail from '@/app/api/entities/[id]/route'
import * as workDesk from '@/app/api/work-desk/route'
import * as projects from '@/app/api/projects/route'
import * as escalationActions from '@/app/api/escalations/actions/route'
import * as escalationsList from '@/app/api/escalations/route'
import * as companyUsers from '@/app/api/companies/users/route'
import * as companies from '@/app/api/companies/route'
import * as deadlines from '@/app/api/deadline-proposals/route'
import * as dailyReports from '@/app/api/daily-reports/route'
import * as weeklyReports from '@/app/api/weekly-reports/route'
import * as dashboard from '@/app/api/dashboard/route'
import { intParam } from '@/app/api/_paging'

const getReq = (url: string) => new NextRequest(`http://localhost${url}`, { headers: { 'user-agent': 'vitest' } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-12T10:00:00'))
  resetWorld()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('GET /api/entities/[id] — peran pelaksana', () => {
  const call = () => entityDetail.GET(getReq('/api/entities/pt-a'), { params: Promise.resolve({ id: 'pt-a' }) })

  it.each(['pic-1', 'kadiv-1'])('%s ditolak 403 tanpa membaca entitas', async (who) => {
    asUser(who)
    const res = await call()
    expect(res.status).toBe(403)
    expect(db.entity.findUnique).not.toHaveBeenCalled()
    expect(db.dailyProjectReport.findMany).not.toHaveBeenCalled()
  })

  it('Admin PT di PT-nya tetap dapat membuka detail', async () => {
    asUser('admin-a')
    db.entity.findUnique.mockResolvedValue({ id: 'pt-a', name: 'PT A', code: 'PTA', type: 'PT', path: '/BIKE/PTA/', region: null, parentId: null, isActive: true, createdAt: new Date(), updatedAt: new Date() })
    db.entity.findMany.mockResolvedValue([])
    db.division.findMany.mockResolvedValue([])
    db.project.findMany.mockResolvedValue([])
    db.adminAppointment.findMany.mockResolvedValue([])
    db.kpiSnapshot.findUnique.mockResolvedValue(null)
    db.dailyProjectReport.findMany.mockResolvedValue([])
    db.weeklyDivisionReport.findMany.mockResolvedValue([])
    expect((await call()).status).toBe(200)
  })
})

describe('/api/work-desk POST — gerbang kunci mengikuti aturan PT', () => {
  const rule = (over: Record<string, unknown> = {}) => ({
    entityId: 'pt-a', dailyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyCutoffHour: null, weeklyOpen: true, ...over,
  })
  const remind = () => workDesk.POST(jsonReq('/api/work-desk', 'POST', { action: 'remind-pic', projectId: 'p-1' }))

  beforeEach(() => {
    asUser('admin-a')
    db.project.findUnique.mockResolvedValue({
      id: 'p-1', name: 'Gudang Timur', entityId: 'pt-a', lifecycle: 'AKTIF',
      picUser: { id: 'pic-1', name: 'Rina', email: 'pic-1@contoh.test', isActive: true },
    })
    db.dailyProjectReport.findUnique.mockResolvedValue(null)
    db.notificationLog.findFirst.mockResolvedValue(null)
  })

  it('PT 24/7: pengingat pukul 19.00 WIB masih terkirim (dulu 409 "dikunci 17.00")', async () => {
    vi.setSystemTime(wib('2026-10-12T19:00:00'))
    db.reportSettings.findUnique.mockResolvedValue(rule())
    expect((await remind()).status).toBe(200)
    expect(db.notificationLog.create).toHaveBeenCalledTimes(1)
  })

  it('jam batas kustom 21.00: 20.59 terbuka, 21.00 terkunci', async () => {
    db.reportSettings.findUnique.mockResolvedValue(rule({ dailyCutoffHour: 21 }))
    vi.setSystemTime(wib('2026-10-12T20:59:00'))
    expect((await remind()).status).toBe(200)
    vi.setSystemTime(wib('2026-10-12T21:00:00'))
    const res = await remind()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/21\.00 WIB/)
  })

  it('pelaporan ditutup (dailyOpen=false) menolak pengingat dengan pesan yang tepat', async () => {
    db.reportSettings.findUnique.mockResolvedValue(rule({ dailyOpen: false }))
    const res = await remind()
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ locked: true, error: expect.stringMatching(/ditutup/) })
  })

  it('GET meja Admin PT 24/7 pukul 19.00 tidak menandai laporan terkunci', async () => {
    vi.setSystemTime(wib('2026-10-12T19:00:00'))
    db.reportSettings.findUnique.mockResolvedValue(rule())
    db.entity.findUnique.mockResolvedValue({ id: 'pt-a', name: 'PT A', code: 'PTA', region: null })
    for (const m of [db.dailyProjectReport.findMany, db.task.findMany, db.division.findMany, db.weeklyDivisionReport.findMany, db.escalation.findMany, db.unlockRequest.findMany, db.notificationLog.findMany]) {
      m.mockResolvedValue([])
    }
    db.project.findMany.mockResolvedValue([])
    db.lateIncident.count.mockResolvedValue(0)
    const res = await workDesk.GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.locked).toBe(false)
    expect(body.countdown.passed).toBe(false)
  })
})

describe('PATCH /api/projects — ganti status', () => {
  const row = (lifecycle: string, approvals: { role: string; decision: string }[] = []) => ({
    id: 'p-9', name: 'Proyek Contoh', code: 'PTA-PRJ-09', phase: 'INISIASI', lifecycle, picName: null, picUserId: null, divisionId: null, division: null,
    description: 'x'.repeat(30), purpose: null, proposedBy: null, proposedById: 'pic-1', proposedAt: null, approvalChain: ['ADMIN_PT', 'DIREKTUR_ENTITAS'],
    approvals: approvals.map((a) => ({ ...a, note: null, decidedAt: null, decidedBy: null })), relatedEntities: [], startDate: null, targetEndDate: null,
    approvedByName: null, approvedAt: null, createdAt: new Date(), updatedAt: new Date(), entityId: 'pt-a',
    entity: { id: 'pt-a', name: 'PT A', code: 'PTA', region: null }, picUser: null, dailyReports: [],
  })
  const patch = (body: Record<string, unknown>) => projects.PATCH(jsonReq('/api/projects', 'PATCH', { id: 'p-9', ...body }))

  beforeEach(() => {
    asUser('admin-a')
    db.project.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row('AKTIF'), ...data }))
  })

  it('proyek DITOLAK tidak bisa diaktifkan langsung oleh Admin PT', async () => {
    db.project.findUnique.mockResolvedValue(row('DITOLAK', [{ role: 'ADMIN_PT', decision: 'DITOLAK' }]))
    const res = await patch({ lifecycle: 'AKTIF' })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/ditolak/i)
    expect(db.project.update).not.toHaveBeenCalled()
  })

  it('proyek yang pernah ditolak lalu diarsipkan tidak bisa diaktifkan lewat jalan memutar', async () => {
    db.project.findUnique.mockResolvedValue(row('DIARSIPKAN', [{ role: 'ADMIN_PT', decision: 'DITOLAK' }]))
    expect((await patch({ lifecycle: 'AKTIF' })).status).toBe(422)
    expect(db.project.update).not.toHaveBeenCalled()
  })

  it('proyek DITUTUP yang tak pernah ditolak tetap bisa diaktifkan kembali', async () => {
    db.project.findUnique.mockResolvedValue(row('DITUTUP', [{ role: 'ADMIN_PT', decision: 'DISETUJUI' }]))
    const res = await patch({ lifecycle: 'AKTIF' })
    expect(res.status).toBe(200)
    expect(db.project.update).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/escalations/actions', () => {
  const act = (body: Record<string, unknown>) => escalationActions.POST(jsonReq('/api/escalations/actions', 'POST', body))

  it('keputusan kedua atas eskalasi DIPUTUSKAN ditolak 409 (tidak menimpa keputusan awal)', async () => {
    asUser('mgmt')
    db.escalation.findUnique.mockResolvedValue({ id: 'esc-1', entityId: 'pt-a', status: 'DIPUTUSKAN', decidedById: 'mgmt', decidedAt: new Date(), decisionText: 'Disetujui', updatedAt: new Date() })
    const res = await act({ action: 'decide', id: 'esc-1', decisionText: 'Keputusan pengganti yang baru' })
    expect(res.status).toBe(409)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('DITINJAU masih bisa diputuskan', async () => {
    asUser('mgmt')
    const row = { id: 'esc-1', entityId: 'pt-a', status: 'DITINJAU', decidedById: null, decidedAt: null, decisionText: null, updatedAt: new Date() }
    db.escalation.findUnique.mockResolvedValue(row)
    db.escalation.update.mockResolvedValue({ ...row, status: 'DIPUTUSKAN', updatedAt: new Date() })
    db.undoTicket.create.mockResolvedValue({ id: 'u-1' })
    expect((await act({ action: 'decide', id: 'esc-1', decisionText: 'Disetujui dengan catatan' })).status).toBe(200)
  })

  describe('raise TASK', () => {
    const raise = () => act({ action: 'raise', sourceType: 'TASK', sourceId: 'tsk-1', summary: 'Vendor belum kirim material', needed: 'KEPUTUSAN' })
    beforeEach(() => {
      asUser('pic-1')
      db.escalation.findFirst.mockResolvedValue(null)
      db.escalation.create.mockResolvedValue({ id: 'esc-new' })
      db.task.update.mockResolvedValue({})
    })

    it('task yang eskalasi lamanya sudah DITUTUP boleh dieskalasi lagi', async () => {
      db.task.findUnique.mockResolvedValue({ entityId: 'pt-a', escalationId: 'esc-old', project: { picUserId: 'pic-1' } })
      db.escalation.findUnique.mockResolvedValue({ status: 'DITUTUP' })
      expect((await raise()).status).toBe(200)
      expect(db.task.update).toHaveBeenCalledWith({ where: { id: 'tsk-1' }, data: { escalationId: 'esc-new' } })
    })

    it('task dengan eskalasi masih berjalan tetap ditolak 409', async () => {
      db.task.findUnique.mockResolvedValue({ entityId: 'pt-a', escalationId: 'esc-old', project: { picUserId: 'pic-1' } })
      db.escalation.findUnique.mockResolvedValue({ status: 'DITINJAU' })
      expect((await raise()).status).toBe(409)
      expect(db.escalation.create).not.toHaveBeenCalled()
    })
  })
})

describe('hapus akun / perusahaan dengan riwayat (P2003)', () => {
  const p2003 = () => Object.assign(new Error('Foreign key constraint failed on the field: `ownerId`'), { code: 'P2003' })

  it('DELETE /api/companies/users: 409 dengan jalan keluar, bukan 500 mentah', async () => {
    asUser('sa')
    db.user.findUnique.mockResolvedValue({ id: 'pic-1', username: 'rina', name: 'Rina', role: 'PIC_PROYEK', scopeEntityId: 'pt-a' })
    db.$transaction.mockRejectedValueOnce(p2003())
    const res = await companyUsers.DELETE(jsonReq('/api/companies/users?id=pic-1', 'DELETE'))
    expect(res.status).toBe(409)
    const text = JSON.stringify(await res.json())
    expect(text).toMatch(/Nonaktifkan/)
    expect(text).not.toMatch(/Foreign key|ownerId/)
  })

  it('DELETE /api/companies: 409, bukan 500 mentah', async () => {
    asUser('sa')
    db.entity.findUnique.mockResolvedValue({ id: 'pt-a', name: 'PT A', code: 'PTA', type: 'PT' })
    db.entity.count.mockResolvedValue(0)
    for (const m of [db.dailyProjectReport.count, db.weeklyDivisionReport.count, db.projectProgressReport.count, db.task.count, db.escalation.count]) m.mockResolvedValue(0)
    db.$transaction.mockRejectedValueOnce(p2003())
    const res = await companies.DELETE(jsonReq('/api/companies?id=pt-a', 'DELETE'))
    expect(res.status).toBe(409)
    expect(JSON.stringify(await res.json())).not.toMatch(/Foreign key|ownerId/)
  })

  it('galat lain tetap 500 umum tanpa bocor detail', async () => {
    asUser('sa')
    db.user.findUnique.mockResolvedValue({ id: 'pic-1', username: 'rina', name: 'Rina', role: 'PIC_PROYEK', scopeEntityId: 'pt-a' })
    db.$transaction.mockRejectedValueOnce(new Error('Invalid prisma.user.delete() invocation'))
    const res = await companyUsers.DELETE(jsonReq('/api/companies/users?id=pic-1', 'DELETE'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/prisma|invocation/i)
  })
})

describe('/api/deadline-proposals — satu usulan terbuka per proyek', () => {
  it('POST: usulan terbuka yang ditemukan di bawah kunci proyek -> 409, tanpa membuat baris', async () => {
    asUser('pic-1')
    db.deadlineProposal.findFirst.mockResolvedValue({ id: 'dp-lain' })
    const res = await deadlines.POST(jsonReq('/api/deadline-proposals', 'POST', {
      projectId: 'p-1', proposedDate: '2026-11-30', reason: 'Material vendor terlambat dua minggu',
    }))
    expect(res.status).toBe(409)
    expect(db.deadlineProposal.create).not.toHaveBeenCalled()
    expect(db.$queryRaw).toBeDefined()
  })

  it('PATCH undo: keputusan lama tak bisa diurungkan bila sudah ada usulan baru yang terbuka', async () => {
    asUser('dir-a')
    db.deadlineProposal.findUnique.mockResolvedValue({
      id: 'dp-1', projectId: 'p-1', status: 'DISETUJUI', decidedById: 'dir-a', decidedAt: new Date(Date.now() - 60_000),
      proposedDate: new Date('2026-11-30T00:00:00+07:00'), previousDate: new Date('2026-10-24T00:00:00+07:00'), decisionNote: null,
    })
    db.deadlineProposal.findFirst.mockResolvedValue({ id: 'dp-baru' })
    const res = await deadlines.PATCH(jsonReq('/api/deadline-proposals', 'PATCH', { id: 'dp-1', action: 'undo' }))
    expect(res.status).toBe(409)
    expect(db.deadlineProposal.updateMany).not.toHaveBeenCalled()
    expect(db.project.updateMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/daily-reports — tanggal WIB & halaman', () => {
  beforeEach(() => {
    asUser('admin-a')
    db.dailyProjectReport.findMany.mockResolvedValue([])
    db.dailyProjectReport.count.mockResolvedValue(0)
  })

  it('dateFrom/dateTo "YYYY-MM-DD" = hari WIB (reportDate tersimpan tengah malam WIB)', async () => {
    await dailyReports.GET(getReq('/api/daily-reports?dateFrom=2026-10-10&dateTo=2026-10-10'))
    const where = db.dailyProjectReport.findMany.mock.calls[0][0].where
    expect(where.reportDate.gte.getTime()).toBe(wib('2026-10-10T00:00:00').getTime())
    expect(where.reportDate.lte.getTime()).toBe(wib('2026-10-10T00:00:00').getTime())
  })

  it('tanggal ISO lengkap tetap dipakai apa adanya (dipakai Meja kerja Admin PT)', async () => {
    const iso = wib('2026-10-12T00:00:00').toISOString()
    await dailyReports.GET(getReq(`/api/daily-reports?dateFrom=${encodeURIComponent(iso)}`))
    expect(db.dailyProjectReport.findMany.mock.calls[0][0].where.reportDate.gte.toISOString()).toBe(iso)
  })

  it('tanggal yang tidak ada (2026-02-31) ditolak 400', async () => {
    expect((await dailyReports.GET(getReq('/api/daily-reports?dateFrom=2026-02-31'))).status).toBe(400)
  })

  it('page/pageSize bukan angka tidak lagi menjadi 500 (skip NaN)', async () => {
    const res = await dailyReports.GET(getReq('/api/daily-reports?page=abc&pageSize=xyz'))
    expect(res.status).toBe(200)
    const args = db.dailyProjectReport.findMany.mock.calls[0][0]
    expect(args.skip).toBe(0)
    expect(args.take).toBe(20)
  })

  it('pencarian nama proyek tak peka huruf besar-kecil', async () => {
    await dailyReports.GET(getReq('/api/daily-reports?search=gudang'))
    expect(db.dailyProjectReport.findMany.mock.calls[0][0].where.project.name).toEqual({ contains: 'gudang', mode: 'insensitive' })
  })
})

describe('parameter halaman bukan-angka di rute daftar lain', () => {
  it('/api/escalations', async () => {
    asUser('mgmt')
    db.escalation.findMany.mockResolvedValue([])
    db.escalation.count.mockResolvedValue(0)
    expect((await escalationsList.GET(getReq('/api/escalations?page=-x&pageSize=NaN'))).status).toBe(200)
    const args = db.escalation.findMany.mock.calls[0][0]
    expect(args.skip).toBe(0)
    expect(args.take).toBe(50)
  })

  it('/api/weekly-reports: isoYear/isoWeek sampah diabaikan, bukan NaN ke Prisma', async () => {
    asUser('admin-a')
    db.weeklyDivisionReport.findMany.mockResolvedValue([])
    db.weeklyDivisionReport.count.mockResolvedValue(0)
    expect((await weeklyReports.GET(getReq('/api/weekly-reports?page=1e9x&isoYear=abc&isoWeek=zz'))).status).toBe(200)
    const where = db.weeklyDivisionReport.findMany.mock.calls[0][0].where
    expect('isoYear' in where).toBe(false)
    expect('isoWeek' in where).toBe(false)
  })

  it('intParam: pagar batas', () => {
    expect(intParam('abc', 5, 1, 10)).toBe(5)
    expect(intParam(null, 5, 1, 10)).toBe(5)
    expect(intParam('0', 5, 1, 10)).toBe(1)
    expect(intParam('999', 5, 1, 10)).toBe(10)
    expect(intParam('7', 5, 1, 10)).toBe(7)
  })
})

describe('GET /api/dashboard — lateEntitiesThisMonth', () => {
  it('insiden dibatasi bulan berjalan dan diurutkan dari yang paling sering', async () => {
    asUser('mgmt')
    db.entity.findMany.mockResolvedValue([])
    db.dailyProjectReport.count.mockResolvedValue(0)
    db.escalation.findMany.mockResolvedValue([])
    db.unlockRequest.count.mockResolvedValue(0)
    db.kpiSnapshot.findMany.mockResolvedValue([])
    db.weeklyDivisionReport.count.mockResolvedValue(0)
    db.lateIncident.findMany.mockResolvedValue([])
    const res = await dashboard.GET(getReq('/api/dashboard'))
    expect(res.status).toBe(200)
    const args = db.lateIncident.findMany.mock.calls[0][0]
    expect(args.where.period).toEqual({ startsWith: '2026-10' })
    expect(args.orderBy[0]).toEqual({ occurrenceInMonth: 'desc' })
  })
})
