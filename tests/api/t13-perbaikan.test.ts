import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { asUser, db, jsonReq, resetWorld, wib } from './pic-world'
import { NextRequest } from 'next/server'

/*
 * [T13] Perbaikan temuan tinjauan regresi & keamanan: telepon warisan tidak
 * memblokir PATCH akun, rollup tidak mereset laporan terkirim, urutan kunci
 * (Project -> DailyProjectReport; User menurut id), validasi report-settings,
 * dan kunci mingguan papan task mengikuti aturan PT.
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

import * as companyUsers from '@/app/api/companies/users/route'
import * as reportSettings from '@/app/api/admin/report-settings/route'
import * as tasks from '@/app/api/tasks/route'
import { rollupDailyReport } from '@/lib/daily-rollup'
import { lockRequestRows } from '@/lib/access-requests'
import { weeklyDeadlinesWith, weeklyLockedMessage } from '@/lib/lock'

const rule = (over: Record<string, unknown> = {}) => ({
  entityId: 'pt-a', dailyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyCutoffHour: 17, weeklyOpen: true, ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-12T10:00:00'))
  resetWorld()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('PATCH /api/companies/users — telepon warisan', () => {
  const existing = (phone: string | null) => ({
    id: 'pic-1', name: 'Rina', username: 'rina', email: 'pic-1@contoh.test', role: 'PIC_PROYEK', title: null, phone,
    isActive: true, scopeEntityId: 'pt-a', divisionId: null, avatarColor: null,
  })
  const patch = (body: Record<string, unknown>) => companyUsers.PATCH(jsonReq('/api/companies/users', 'PATCH', { id: 'pic-1', ...body }))

  beforeEach(() => {
    asUser('sa')
    db.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...existing('x'), ...data }))
  })

  it('telepon warisan yang dikirim ulang TANPA diubah tidak memblokir perubahan lain', async () => {
    db.user.findUnique.mockResolvedValue(existing('0812.3456.789'))
    const res = await patch({ phone: '0812.3456.789', isActive: false })
    expect(res.status).toBe(200)
    const data = db.user.update.mock.calls[0][0].data
    expect(data.isActive).toBe(false)
    expect('phone' in data).toBe(false) // nilai lama tak disentuh
  })

  it('telepon yang DIUBAH ke format tak sah tetap 422', async () => {
    db.user.findUnique.mockResolvedValue(existing('0812.3456.789'))
    const res = await patch({ phone: '(021) 555-1234' })
    expect(res.status).toBe(422)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('telepon yang diubah ke format sah disimpan; dikosongkan menjadi null', async () => {
    db.user.findUnique.mockResolvedValue(existing('0812.3456.789'))
    expect((await patch({ phone: '+62 812 3456 789' })).status).toBe(200)
    expect(db.user.update.mock.calls[0][0].data.phone).toBe('+62 812 3456 789')
    db.user.update.mockClear()
    expect((await patch({ phone: '' })).status).toBe(200)
    expect(db.user.update.mock.calls[0][0].data.phone).toBeNull()
  })
})

describe('rollupDailyReport resetBilaKosong', () => {
  const day = wib('2026-10-12T00:00:00')
  const setup = (existing: Record<string, unknown>, openEscalations = 0) => {
    db.reportSettings.findUnique.mockResolvedValue(rule())
    db.task.findMany.mockResolvedValue([]) // task terakhir sudah tiada
    db.dailyProjectReport.findUnique.mockResolvedValue({ id: 'r-1', entityId: 'pt-a', forwardedAt: null, isLocked: false, ...existing })
    db.evidence.count.mockResolvedValue(2)
    db.escalation.count.mockResolvedValue(openEscalations)
    db.dailyProjectReport.update.mockResolvedValue({})
  }
  const run = () => db.$transaction((tx: never) => rollupDailyReport('p-1', day, tx, { resetBilaKosong: true }))

  it('draf yang belum dikirim di-reset (angka turunan tak lagi milik task yang hilang)', async () => {
    setup({ submittedAt: null })
    await run()
    expect(db.dailyProjectReport.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { evidenceCount: 2, status: 'TIDAK_ADA_PERUBAHAN', progressPct: 0, needsEscalation: false },
    })
  })

  it('draf dengan eskalasi terbuka: flag eskalasi tidak dipadamkan', async () => {
    setup({ submittedAt: null }, 1)
    await run()
    const data = db.dailyProjectReport.update.mock.calls[0][0].data
    expect(data).toMatchObject({ status: 'TIDAK_ADA_PERUBAHAN', progressPct: 0 })
    expect('needsEscalation' in data).toBe(false)
  })

  it('laporan yang SUDAH terkirim tidak ditimpa 0%; hanya evidenceCount yang dihitung ulang', async () => {
    setup({ submittedAt: wib('2026-10-12T09:00:00') })
    await run()
    expect(db.dailyProjectReport.update).toHaveBeenCalledWith({ where: { id: 'r-1' }, data: { evidenceCount: 2 } })
    expect(db.escalation.count).not.toHaveBeenCalled()
  })
})

describe('urutan kunci', () => {
  const raw = db.$queryRaw as unknown as Mock
  const locks = () => (raw.mock.calls as unknown as [TemplateStringsArray, ...unknown[]][]).map(([sql, ...v]) => ({
    table: /FROM "(\w+)"/.exec(sql.join('?'))?.[1], values: v, mode: /FOR (NO KEY UPDATE|UPDATE)/.exec(sql.join('?'))?.[1],
  }))

  it('rollup mengunci Project lebih dulu, baru DailyProjectReport', async () => {
    db.reportSettings.findUnique.mockResolvedValue(rule())
    db.task.findMany.mockResolvedValue([])
    db.dailyProjectReport.findUnique.mockResolvedValue(null)
    await rollupDailyReport('p-1', wib('2026-10-12T00:00:00'))
    expect(locks().map((l) => l.table)).toEqual(['Project', 'DailyProjectReport'])
  })

  it('pengajuan akses mengunci dua User menurut id, apa pun siapa pengaju dan sasarannya', async () => {
    const tx = { $queryRaw: raw } as never
    await lockRequestRows(tx, { requesterId: 'u-z', targetUserId: 'u-a', entityId: 'pt-a' })
    const first = locks().map((l) => l.values[0])
    raw.mockClear()
    await lockRequestRows(tx, { requesterId: 'u-a', targetUserId: 'u-z', entityId: 'pt-a' })
    const second = locks().map((l) => l.values[0])
    expect(first).toEqual(['u-a', 'u-z'])
    expect(second).toEqual(first) // pengajuan silang: urutan kunci identik -> tak ada siklus
    expect(locks().every((l) => l.mode === 'NO KEY UPDATE')).toBe(true)
  })

  it('tanpa sasaran: kunci pengaju lalu Entity (NO KEY UPDATE); sasaran = pengaju tidak mengunci dua kali', async () => {
    const tx = { $queryRaw: raw } as never
    await lockRequestRows(tx, { requesterId: 'u-a', targetUserId: null, entityId: 'pt-a' })
    expect(locks().map((l) => [l.table, l.values[0], l.mode])).toEqual([['User', 'u-a', 'NO KEY UPDATE'], ['Entity', 'pt-a', 'NO KEY UPDATE']])
    raw.mockClear()
    await lockRequestRows(tx, { requesterId: 'u-a', targetUserId: 'u-a', entityId: 'pt-a' })
    expect(locks().map((l) => l.table)).toEqual(['User'])
  })
})

describe('PUT /api/admin/report-settings — validasi', () => {
  const put = (body: Record<string, unknown>) => reportSettings.PUT(jsonReq('/api/admin/report-settings', 'PUT', body))
  beforeEach(() => {
    db.reportSettings.findUnique.mockResolvedValue(null)
    db.reportSettings.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ ...rule(), ...create }))
  })

  it.each([
    [[1.5, 2]],
    [[0, 1]],
    [[8]],
    [[1, 1, 2]],
    [[1, 2, 3, 4, 5, 6, 7, 7]],
    [['1']],
    ['1,2,3'],
  ])('workingDays %j ditolak 422 tanpa menyentuh basis data', async (workingDays) => {
    asUser('admin-a')
    const res = await put({ entityId: 'pt-a', workingDays })
    expect(res.status).toBe(422)
    expect(db.reportSettings.upsert).not.toHaveBeenCalled()
  })

  it('workingDays sah (tak berurutan) disimpan terurut; kosong tetap sah (= setiap hari)', async () => {
    asUser('admin-a')
    expect((await put({ entityId: 'pt-a', workingDays: [5, 1, 3] })).status).toBe(200)
    expect(db.reportSettings.upsert.mock.calls[0][0].update.workingDays).toEqual([1, 3, 5])
    expect((await put({ entityId: 'pt-a', workingDays: [] })).status).toBe(200)
    expect(db.reportSettings.upsert.mock.calls[1][0].update.workingDays).toEqual([])
  })

  it('peran global dengan entityId yang tidak ada: 404, bukan 500 setelah transaksi', async () => {
    asUser('sa')
    const res = await put({ entityId: 'pt-hantu', dailyOpen: false })
    expect(res.status).toBe(404)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('/api/tasks — kunci mingguan mengikuti aturan PT', () => {
  const FRIDAY_1630 = wib('2026-10-16T16:30:00')
  const getBoard = () => tasks.GET(new NextRequest('http://localhost/api/tasks?projectId=p-1&week=2026-W42', { headers: { 'user-agent': 'vitest' } }))
  const patchBoard = () => tasks.PATCH(jsonReq('/api/tasks', 'PATCH', { projectId: 'p-1', week: '2026-W42', moves: [{ id: 't-1', lane: 'MINGGUAN', position: 0 }] }))

  beforeEach(() => {
    asUser('pic-1')
    db.task.findMany.mockResolvedValue([])
    db.dailyProjectReport.findMany.mockResolvedValue([])
    db.evidence.findMany.mockResolvedValue([])
  })

  it('jam mingguan kustom 18.00: Jumat 16.30 masih terbuka; lockAt memakai jam PT', async () => {
    vi.setSystemTime(FRIDAY_1630)
    db.reportSettings.findUnique.mockResolvedValue(rule({ weeklyCutoffHour: 18 }))
    const body = await (await getBoard()).json()
    expect(body.locked).toBe(false)
    expect(new Date(body.period.lockAt).getTime()).toBe(wib('2026-10-16T18:00:00').getTime())
  })

  it('bawaan 17.00: Jumat 17.30 terkunci', async () => {
    vi.setSystemTime(wib('2026-10-16T17:30:00'))
    db.reportSettings.findUnique.mockResolvedValue(rule({ weeklyCutoffHour: 17 }))
    expect((await (await getBoard()).json()).locked).toBe(true)
  })

  it('capaian mingguan ditutup (weeklyOpen=false): papan terkunci sejak awal dan PATCH ditolak 409 dengan pesan penutupan', async () => {
    db.reportSettings.findUnique.mockResolvedValue(rule({ weeklyOpen: false }))
    expect((await (await getBoard()).json()).locked).toBe(true)
    const res = await patchBoard()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/ditutup sementara/)
  })

  it('tanpa batas jam (weeklyCutoffHour=null): Jumat malam tetap terbuka, PATCH lolos gerbang kunci', async () => {
    vi.setSystemTime(wib('2026-10-16T22:00:00'))
    db.reportSettings.findUnique.mockResolvedValue(rule({ weeklyCutoffHour: null }))
    expect((await (await getBoard()).json()).locked).toBe(false)
    const res = await patchBoard()
    expect(res.status).not.toBe(409) // lanjut ke validasi kartu (422: kartu tak ada), bukan kunci
  })

  it('pesan terkunci memuat jam PT (Jumat 15.00 WIB), bukan jam env', async () => {
    vi.setSystemTime(FRIDAY_1630)
    db.reportSettings.findUnique.mockResolvedValue(rule({ weeklyCutoffHour: 15 }))
    const res = await patchBoard()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Jumat 15\.00 WIB/)
  })
})

describe('tenggat mingguan per PT (helper bersama kadiv/tasks)', () => {
  const week = wib('2026-10-12T00:00:00')

  it('jam kustom menggeser serah dan kunci; null = baru berakhir di pergantian minggu; ditutup = terkunci sejak awal', () => {
    const custom = weeklyDeadlinesWith(week, { weeklyCutoffHour: 15, weeklyOpen: true })
    expect(custom.effectiveLockAt.getTime()).toBe(wib('2026-10-16T15:00:00').getTime())
    expect(custom.handoverBy.getTime()).toBe(wib('2026-10-15T15:00:00').getTime())
    const open = weeklyDeadlinesWith(week, { weeklyCutoffHour: null, weeklyOpen: true })
    expect(open.effectiveLockAt.getTime()).toBe(wib('2026-10-19T00:00:00').getTime())
    const closed = weeklyDeadlinesWith(week, { weeklyCutoffHour: 17, weeklyOpen: false })
    expect(closed.effectiveLockAt.getTime()).toBe(week.getTime())
  })

  it('tanpa settings tetap jam env (perilaku lama)', () => {
    expect(weeklyDeadlinesWith(week).effectiveLockAt.getTime()).toBe(wib('2026-10-16T17:00:00').getTime())
  })

  it('weeklyLockedMessage: ditutup, jam PT, dan cadangan env', () => {
    expect(weeklyLockedMessage({ weeklyCutoffHour: 17, weeklyOpen: false })).toMatch(/ditutup sementara/)
    expect(weeklyLockedMessage({ weeklyCutoffHour: 14, weeklyOpen: true })).toMatch(/Jumat 14\.00 WIB/)
    expect(weeklyLockedMessage(undefined)).toMatch(/Jumat 17\.00 WIB/)
  })
})
