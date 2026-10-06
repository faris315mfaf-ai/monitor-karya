import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asUser, db, jsonReq, matches, resetWorld, wib } from '../api/pic-world'
import * as math from '@/lib/kpi-math'

vi.mock('@/lib/db', async () => ({ db: (await import('../api/pic-world')).db }))
vi.mock('@/lib/auth', async () => (await import('../api/pic-world')).auth)
import * as projectsApi from '@/app/api/projects/route'
import * as weeklyApi from '@/app/api/weekly-reports/route'
import { refreshKpiSnapshots } from '@/lib/kpi-snapshot'
import { buildTeam } from '@/lib/kadiv'

const day = (d: string) => wib(`${d}T00:00:00`)
const deadline = (d: Date) => new Date(+d + 17 * 3600000)
const days = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'].map(day)
const project = (extra: Record<string, unknown> = {}) => ({ id: 'p', picUserId: 'pic', lifecycle: 'AKTIF', startDate: day('2026-10-01'), createdAt: day('2026-09-01'), approvedAt: day('2026-10-01'), ...extra })
const audit = (at: string, before: string, after: string) => ({ targetId: 'p', at: wib(at), action: 'UPDATE_PROJECT', beforeData: JSON.stringify({ lifecycle: before }), afterData: JSON.stringify({ lifecycle: after }) })
const calc = (p: any, history: any[], reports: any[] = [], absent = () => false) => (math as any).historicalOnTimeDaily({ days, projects: [p], history, reports, lockAt: deadline, absent })

beforeEach(() => { resetWorld(); vi.useFakeTimers(); vi.setSystemTime(wib('2026-10-06T18:00:00')); asUser('admin-a') })
afterEach(() => vi.useRealTimers())

describe('CX9 kewajiban historis per hari WIB', () => {
  it('proyek ditutup tetap menyumbang hari aktifnya, updatedAt bukan tanggal tutup', () => {
    const p = project({ lifecycle: 'DITUTUP', updatedAt: day('2026-10-06') })
    const r = calc(p, [audit('2026-10-03T09:00:00', 'AKTIF', 'DITUTUP')])
    expect(r).toEqual({ ok: 0, total: 2, pct: 0, historyComplete: true, unknownProjects: 0 })
  })
  it('arsip lalu Urungkan menciptakan interval aktif yang terpisah', () => {
    const undo = { targetId: 'p', at: wib('2026-10-06T09:00:00'), action: 'UNDO_ARCHIVE_PROJECT', beforeData: JSON.stringify({ lifecycle: 'DIARSIPKAN' }), afterData: JSON.stringify({ restored: { project: { lifecycle: 'AKTIF' } } }) }
    expect(calc(project(), [audit('2026-10-02T00:00:00', 'AKTIF', 'DIARSIPKAN'), undo]).total).toBe(2)
  })
  it('hari sebelum persetujuan, pembuatan, atau mulai tidak wajib; aktivasi sesudah tenggat menunggu besok', () => {
    expect(calc(project({ approvedAt: wib('2026-10-02T18:00:00') }), []).total).toBe(2)
    expect(calc(project({ createdAt: day('2026-10-05') }), []).total).toBe(2)
    expect(calc(project({ startDate: day('2026-10-06') }), []).total).toBe(1)
  })
  it('aktivasi ulang tidak menghapus masa aktif sebelum ditutup; audit asing/tanpa transisi diabaikan', () => {
    const history = [audit('2026-10-02T00:00:00', 'AKTIF', 'DITUTUP'), audit('2026-10-06T09:00:00', 'DITUTUP', 'AKTIF'), { ...audit('2026-10-01T01:00:00', 'AKTIF', 'DIARSIPKAN'), targetId: 'asing' }]
    expect(calc(project({ approvedAt: wib('2026-10-06T09:00:00') }), history).total).toBe(2)
  })
  it('tanpa bukti tanggal penutupan tidak mengarang riwayat; JSON rusak aman', () => {
    expect(calc(project({ lifecycle: 'DITUTUP' }), [{ targetId: 'p', at: days[1], action: 'UPDATE_PROJECT', beforeData: '{rusak', afterData: null }]).total).toBe(0)
  })
  it('pembilang hanya laporan hari wajib, tanpa cuti/PIC kosong, dan tenggat tetap ditegakkan', () => {
    const reports = days.map((d, i) => ({ projectId: 'p', reportDate: d, submittedAt: new Date(+d + (i === 0 ? 18 : 16) * 3600000), isLate: false }))
    expect(calc(project(), [], reports, (_u?: string, d?: Date) => +d! === +days[1])).toEqual({ ok: 2, total: 3, pct: 67, historyComplete: true, unknownProjects: 0 })
    expect(calc(project({ picUserId: null }), [], reports).pct).toBeNull()
  })
  it('buildTeam membaca proyek historis dalam divisi, tetapi daftar proyek tetap hanya aktif', async () => {
    asUser('kadiv-1')
    const p = { ...project({ id: 'p-1', picUserId: 'pic-1', lifecycle: 'DITUTUP' }), code: 'P1', name: 'Proyek selesai', entityId: 'pt-a', divisionId: 'div-a1', targetEndDate: null, picUser: { name: 'Rina' } }
    db.project.findMany.mockImplementation(async ({ where }) => [p].filter((r) => matches(r, where)))
    for (const model of ['task', 'output', 'dailyProjectReport', 'attendance', 'dailyReportRead', 'projectStage']) db[model].findMany.mockResolvedValue([])
    db.output.groupBy.mockResolvedValue([])
    db.auditLog.findMany.mockResolvedValue([{ ...audit('2026-10-03T09:00:00', 'AKTIF', 'DITUTUP'), targetId: 'p-1' }])
    const result = await buildTeam(asUser('kadiv-1'))
    expect(result!.projects).toEqual([])
    expect(result!.onTime30).toMatchObject({ total: 2, ok: 0 })
    expect(db.project.findMany.mock.calls.some(([q]) => !q.where.lifecycle && q.where.OR.some((x: any) => x.divisionId === 'div-a1'))).toBe(true)
  })
})

describe('CX9 agregat seluruh hasil API', () => {
  const row = (i: number, entityId = 'pt-a') => ({ ...project({ id: `p-${i}` }), entityId, phase: 'PELAKSANAAN', code: `P${i}`, name: `Proyek ${i}`, proposedById: null, approvals: [], approvalChain: [], relatedEntities: [], entity: { id: entityId, name: entityId }, dailyReports: [], targetEndDate: day('2026-10-01') })
  it('hero proyek menghitung seluruh hasil tersaring, tanpa mengambil halaman atau PT lain', async () => {
    const rows = [...Array.from({ length: 15 }, (_, i) => row(i)), row(99, 'pt-b')]
    const scoped = (q: any) => rows.filter((r) => r.entityId === 'pt-a' && (!q.search || r.name.includes(q.search)))
    db.project.findMany.mockImplementation(async (q) => scoped(q).slice(q.skip ?? 0, q.take ? (q.skip ?? 0) + q.take : undefined))
    db.project.count.mockResolvedValue(15)
    const res = await projectsApi.GET(jsonReq('/api/projects?pageSize=12&page=2&phase=PELAKSANAAN&search=Proyek', 'GET'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.items).toHaveLength(3)
    expect(body.summary).toMatchObject({ running: 15, late: 15, silent: 15, waiting: 0, resubmit: 0 })
    const all = db.project.findMany.mock.calls.map(([q]) => q).find((q) => q.skip === undefined)
    expect(all.where).toEqual(db.project.count.mock.calls[0][0].where)
    expect(all.where).toMatchObject({ phase: 'PELAKSANAAN', name: { contains: 'Proyek' }, AND: [{ OR: [{ entityId: { in: ['pt-a'] } }, { relatedEntities: { some: { entityId: { in: ['pt-a'] } } } }] }] })
  })
  it('agregat mingguan menambah status tanpa menimpa filter pengguna dan menerapkan pencarian', async () => {
    db.weeklyDivisionReport.findMany.mockResolvedValue([{ id: 'r1' }])
    db.weeklyDivisionReport.count.mockImplementation(async ({ where }) => where.AND?.some((x: any) => x.isLate === true) ? 4 : where.AND?.some((x: any) => x.statusHeader === 'MENUNGGU_PERSETUJUAN') ? 13 : 25)
    const res = await weeklyApi.GET(jsonReq('/api/weekly-reports?page=3&pageSize=10&statusHeader=MENUNGGU_PERSETUJUAN&search=Teknik&isoYear=2026&isoWeek=41', 'GET'))
    const body = await res.json()
    expect(body.summary).toEqual({ waiting: 13, late: 4 })
    const main = db.weeklyDivisionReport.findMany.mock.calls[0][0].where
    expect(main).toMatchObject({ statusHeader: 'MENUNGGU_PERSETUJUAN', isoYear: 2026, isoWeek: 41, AND: [{ entityId: { in: ['pt-a'] } }], OR: expect.arrayContaining([{ division: { name: { contains: 'Teknik', mode: 'insensitive' } } }]) })
    expect(db.weeklyDivisionReport.count.mock.calls[1][0].where.AND[0]).toEqual(main)
  })
})


describe('CX9 snapshot bulanan', () => {
  it('proyek yang sudah ditutup tetap masuk rasio historis, tanpa mengubah hitungan proyek aktif hari ini', async () => {
    db.entity.findMany.mockResolvedValue([{ id: 'pt-a' }])
    db.project.findMany.mockResolvedValue([project({ lifecycle: 'DITUTUP', entityId: 'pt-a' })])
    db.project.count.mockResolvedValue(1); db.division.count.mockResolvedValue(0)
    db.auditLog.findMany.mockResolvedValue([audit('2026-10-03T09:00:00', 'AKTIF', 'DITUTUP')])
    db.attendance.findMany.mockResolvedValue([]); db.weeklyDivisionReport.findMany.mockResolvedValue([])
    db.task.count.mockResolvedValue(0); db.escalation.findMany.mockResolvedValue([])
    db.kpiSnapshot.upsert.mockResolvedValue({})
    db.dailyProjectReport.findMany.mockImplementation(async ({ where }) => where.reportDate?.in?.some((d: Date) => +d === +days[0]) ? [{ projectId: 'p', reportDate: days[0], submittedAt: new Date(+days[0] + 16 * 3600000), isLate: false }] : [])
    const result = await refreshKpiSnapshots(wib('2026-10-08T18:00:00'))
    expect(result.failed).toEqual([])
    expect(db.kpiSnapshot.upsert.mock.calls[0][0].create).toMatchObject({ entityId: 'pt-a', periodKey: '2026-10', onTimeDailyPct: 50, activeProjects: 0, pendingReports: 0 })
    expect(db.project.findMany.mock.calls[0][0].where).toEqual({ entityId: 'pt-a' })
    expect(db.auditLog.findMany.mock.calls[0][0].where).toMatchObject({ targetType: 'PROJECT', targetId: { in: ['p'] } })
  })
})

describe('CX9 hak keputusan agregat', () => {
  it('pengajuan hanya dihitung menunggu Anda bila slot dan PT dapat ditandatangani', async () => {
    const rows = [
      { lifecycle: 'DIUSULKAN', entityId: 'pt-a', proposedById: null, approvalChain: ['ADMIN_PT'], approvals: [], dailyReports: [] },
      { lifecycle: 'DIUSULKAN', entityId: 'pt-a', proposedById: null, approvalChain: ['DIREKTUR_ENTITAS'], approvals: [], dailyReports: [] },
      { lifecycle: 'DIUSULKAN', entityId: 'pt-b', proposedById: null, approvalChain: ['ADMIN_PT'], approvals: [], dailyReports: [] },
    ]
    db.project.findMany.mockImplementation(async (q) => q.skip === undefined ? rows : [])
    db.project.count.mockResolvedValue(3)
    const body = await (await projectsApi.GET(jsonReq('/api/projects?lifecycle=ALL', 'GET'))).json()
    expect(body.summary.waiting).toBe(1)
  })
})


it('CX15 lookup ID proyek tetap memotong cakupan akun', async () => {
  db.project.findMany.mockResolvedValue([]); db.project.count.mockResolvedValue(0)
  await projectsApi.GET(jsonReq('/api/projects?id=asing&lifecycle=ALL&pageSize=1', 'GET'))
  expect(db.project.findMany.mock.calls[0][0].where).toEqual({ id: 'asing', AND: [{ OR: [{ entityId: { in: ['pt-a'] } }, { relatedEntities: { some: { entityId: { in: ['pt-a'] } } } }] }] })
})


it('CX9 riwayat tutup hilang tidak menjadi persentase optimistis', () => {
  const known = project({ id: 'known' })
  const unknown = project({ lifecycle: 'DITUTUP', updatedAt: day('2026-10-06') })
  const reports = days.map((d) => ({ projectId: 'known', reportDate: d, submittedAt: new Date(+d + 16 * 3600000), isLate: false }))
  const result = (math as any).historicalOnTimeDaily({ days, projects: [known, unknown], history: [], reports, lockAt: deadline, absent: () => false })
  expect(result).toMatchObject({ pct: null, historyComplete: false, unknownProjects: 1, ok: 4, total: 4 })
})


it('CX9 snapshot tidak menerbitkan KPI bila riwayat lifecycle belum lengkap', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db.entity.findMany.mockResolvedValue([{ id: 'pt-a' }])
  db.project.findMany.mockResolvedValue([project({ lifecycle: 'DITUTUP' })])
  db.project.count.mockResolvedValue(1); db.division.count.mockResolvedValue(0)
  db.auditLog.findMany.mockResolvedValue([]); db.attendance.findMany.mockResolvedValue([]); db.dailyProjectReport.findMany.mockResolvedValue([])
  const result = await refreshKpiSnapshots(wib('2026-10-08T18:00:00'))
  expect(result).toEqual({ updated: [], failed: ['pt-a:2026-10'] })
  expect(db.kpiSnapshot.upsert).not.toHaveBeenCalled()
})

it('CX9 transisi tutup yang hilang setelah audit aktivasi tetap tidak lengkap', () => {
  const result = calc(project({ lifecycle: 'DITUTUP' }), [{ targetId: 'p', at: days[0], action: 'APPROVE_PROJECT', beforeData: null, afterData: JSON.stringify({ lifecycle: 'AKTIF' }) }])
  expect(result).toMatchObject({ pct: null, historyComplete: false, unknownProjects: 1 })
})
