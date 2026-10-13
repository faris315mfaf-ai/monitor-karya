import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { asUser, db, jsonReq, resetWorld, world, wib } from './pic-world'

/*
 * [T12] Jam batas & hari kerja mengikuti ReportSettings PT (bukan env / Sen–Jum
 * tetap) di my-dashboard, kadiv/team, nav-badges, KPI; tautan bukti warisan
 * disaring; bukti + hitung ulang + audit satu transaksi; GET report-settings
 * bergerbang peran. Berjalan di atas fixture tests/api/pic-world.ts.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => ({
  ...(await import('./pic-world')).auth,
  isGlobalRole: (role: string) => ['SUPERADMIN', 'TI', 'MANAJEMEN'].includes(role),
}))
vi.mock('@/lib/evidence-access', () => ({
  canReadEvidence: async () => ({ ok: true }),
  canWriteEvidence: async () => ({ ok: true }),
}))
vi.mock('@/lib/storage', () => ({ removeEvidence: vi.fn(), storageConfigured: () => false }))

import * as team from '@/app/api/kadiv/team/route'
import { GET as navBadges } from '@/app/api/nav-badges/route'
import { GET as myDashboard } from '@/app/api/my-dashboard/route'
import { GET as settingsGet } from '@/app/api/admin/report-settings/route'
import * as evidence from '@/app/api/evidence/route'
import * as evidenceId from '@/app/api/evidence/[id]/route'
import { dailyCountdownWith, dailyCutoffLabelWith, dailyDeadlineWith, dailyLockInstantWith } from '@/lib/report-settings'
import { safeEvidenceUrl } from '@/lib/security'
import { workdaysBetween } from '@/lib/kpi-math'
import { lockedWorkdays } from '@/lib/kadiv-math'

const SETTINGS_24_7 = { dailyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyCutoffHour: null, weeklyOpen: true }

beforeEach(() => {
  vi.useFakeTimers()
  resetWorld()
})
afterEach(() => vi.useRealTimers())

describe('helper jam batas menurut settings', () => {
  const day = wib('2026-10-06T00:00:00')
  it('tenggat: jam entitas, atau akhir hari WIB pada mode 24/7', () => {
    expect(dailyDeadlineWith(17, day)).toEqual(wib('2026-10-06T17:00:00'))
    expect(dailyDeadlineWith(null, day)).toEqual(wib('2026-10-07T00:00:00'))
  })
  it('titik kunci tampilan: ditutup = awal hari', () => {
    expect(dailyLockInstantWith({ dailyCutoffHour: 17, dailyOpen: false }, day)).toEqual(day)
    expect(dailyLockInstantWith({ dailyCutoffHour: 15, dailyOpen: true }, day)).toEqual(wib('2026-10-06T15:00:00'))
    expect(dailyLockInstantWith({ dailyCutoffHour: null, dailyOpen: true }, day)).toEqual(wib('2026-10-07T00:00:00'))
  })
  it('hitung mundur: jam entitas, 24/7 tidak pernah lewat sebelum tengah malam', () => {
    const at18 = wib('2026-10-06T18:00:00')
    expect(dailyCountdownWith({ dailyCutoffHour: 17, dailyOpen: true }, at18).passed).toBe(true)
    expect(dailyCountdownWith({ dailyCutoffHour: null, dailyOpen: true }, at18)).toMatchObject({ passed: false, hours: 6, minutes: 0 })
  })
  it('label pesan mengikuti jam entitas', () => {
    expect(dailyCutoffLabelWith({ dailyCutoffHour: 15 })).toBe('15.00 WIB')
    expect(dailyCutoffLabelWith({ dailyCutoffHour: null })).toBe('24.00 WIB')
  })
  it('safeEvidenceUrl: hanya http(s) tanpa kredensial', () => {
    expect(safeEvidenceUrl('https://contoh.id/b')).toBe('https://contoh.id/b')
    expect(safeEvidenceUrl('javascript:alert(1)')).toBeNull()
    expect(safeEvidenceUrl('https://u:p@contoh.id')).toBeNull()
    expect(safeEvidenceUrl('bukan url')).toBeNull()
    expect(safeEvidenceUrl(null)).toBeNull()
  })
  it('hari kerja KPI mengikuti workingDays (kosong = setiap hari)', () => {
    const senin = wib('2026-10-05T00:00:00')
    const minggu = wib('2026-10-11T00:00:00')
    expect(workdaysBetween(senin, minggu)).toHaveLength(5)
    expect(workdaysBetween(senin, minggu, [])).toHaveLength(7)
    expect(workdaysBetween(senin, minggu, [1, 3])).toHaveLength(2)
    const now = wib('2026-10-11T23:00:00')
    const lock = (d: Date) => dailyDeadlineWith(null, d)
    expect(lockedWorkdays(now, lock, 7)).toHaveLength(5)
    expect(lockedWorkdays(now, lock, 7, [])).toHaveLength(6) // Minggu 23.00: akhir hari belum lewat
  })
})

describe('/api/nav-badges mengikuti aturan PT', () => {
  const setup = () => {
    asUser('pic-1')
    db.dailyProjectReport.count.mockResolvedValue(0)
  }
  it('Sabtu: PT 7 hari tetap diingatkan, PT bawaan (Sen–Jum) tidak', async () => {
    vi.setSystemTime(wib('2026-10-10T09:00:00'))
    setup()
    expect(((await (await navBadges()).json()).badges)['daily-input']).toBeUndefined()
    db.reportSettings.findUnique.mockResolvedValue({ ...SETTINGS_24_7, dailyCutoffHour: 17 })
    expect(((await (await navBadges()).json()).badges)['daily-input']).toBe(1)
  })
  it('setelah 17.00: PT 24/7 masih diingatkan, PT bawaan tidak', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    setup()
    expect(((await (await navBadges()).json()).badges)['daily-input']).toBeUndefined()
    db.reportSettings.findUnique.mockResolvedValue(SETTINGS_24_7)
    expect(((await (await navBadges()).json()).badges)['daily-input']).toBe(1)
  })
})

describe('/api/kadiv/team mengikuti aturan PT', () => {
  beforeEach(() => {
    db.dailyProjectReport.findMany.mockResolvedValue([])
    db.attendance.findMany.mockResolvedValue([])
    db.dailyReportRead.findMany.mockResolvedValue([])
    for (const m of ['task', 'output', 'auditLog', 'notificationLog', 'projectStage']) db[m].findMany.mockResolvedValue([])
    db.output.count.mockResolvedValue(0)
    db.output.groupBy.mockResolvedValue([])
  })
  const post = () => team.POST(jsonReq('/api/kadiv/team', 'POST', { action: 'remind' }))
  it('PT 24/7: pengingat 18.00 tidak ditolak 409', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    asUser('kadiv-1')
    expect((await post()).status).toBe(409)
    db.reportSettings.findUnique.mockResolvedValue(SETTINGS_24_7)
    expect((await post()).status).toBe(200)
  })
  it('PT berjam batas 15.00: 16.00 sudah terkunci, pesan memuat jam PT', async () => {
    vi.setSystemTime(wib('2026-10-06T16:00:00'))
    asUser('kadiv-1')
    db.reportSettings.findUnique.mockResolvedValue({ ...SETTINGS_24_7, dailyCutoffHour: 15 })
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('15.00 WIB')
  })
  it('GET: lockAt/locked/cutoffLabel dari settings PT', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    asUser('kadiv-1')
    db.reportSettings.findUnique.mockResolvedValue(SETTINGS_24_7)
    const body = await (await team.GET(jsonReq('/api/kadiv/team', 'GET'))).json()
    expect(body).toMatchObject({ locked: false, cutoffLabel: '24.00 WIB', lockAt: wib('2026-10-07T00:00:00').toISOString() })
  })
})

describe('/api/my-dashboard PIC memakai jam batas PT', () => {
  const proyek = {
    id: 'p-1', code: 'PRJ-01', name: 'Gudang Timur', phase: 'PELAKSANAAN', lifecycle: 'AKTIF', startDate: null, targetEndDate: null,
    entityId: 'pt-a', entity: { name: 'PT A' }, dailyReports: [],
  }
  it('24/7: tenggat akhir hari dan hitung mundur belum lewat pada 18.00', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    asUser('pic-1')
    db.project.findMany.mockResolvedValue([proyek])
    db.dailyProjectReport.findMany.mockResolvedValue([])
    db.reportSettings.findUnique.mockResolvedValue(SETTINGS_24_7)
    const body = await (await myDashboard()).json()
    expect(body.lockAt).toBe(wib('2026-10-07T00:00:00').toISOString())
    expect(body.countdown).toMatchObject({ passed: false, hours: 6 })
  })
  it('jam batas 15.00: lockAt 15.00 dan sudah lewat pada 16.00', async () => {
    vi.setSystemTime(wib('2026-10-06T16:00:00'))
    asUser('pic-1')
    db.project.findMany.mockResolvedValue([proyek])
    db.dailyProjectReport.findMany.mockResolvedValue([])
    db.reportSettings.findUnique.mockResolvedValue({ ...SETTINGS_24_7, dailyCutoffHour: 15 })
    const body = await (await myDashboard()).json()
    expect(body.lockAt).toBe(wib('2026-10-06T15:00:00').toISOString())
    expect(body.countdown.passed).toBe(true)
  })
})

describe('GET /api/admin/report-settings bergerbang peran', () => {
  const get = () => settingsGet(new NextRequest('http://localhost/api/admin/report-settings'))
  it.each(['pic-1', 'kadiv-1'])('%s ditolak 403', async (id) => {
    asUser(id)
    expect((await get()).status).toBe(403)
    expect(db.reportSettings.findUnique).not.toHaveBeenCalled()
  })
  it('Admin PT boleh membaca PT-nya', async () => {
    asUser('admin-a')
    db.reportSettings.findUnique.mockResolvedValue(null)
    expect((await get()).status).toBe(200)
  })
})

describe('bukti: tautan warisan disaring', () => {
  it('GET /api/evidence menolkan tautan berbahaya', async () => {
    asUser('admin-a')
    const lama = { id: 'e1', targetType: 'DAILY_REPORT', targetId: 'dr-1', fileName: 'x', storageKey: 'k', url: 'javascript:alert(1)' }
    db.evidence.findMany.mockResolvedValue([lama, { ...lama, id: 'e2', url: 'https://contoh.id/b' }, { ...lama, id: 'e3', url: null }])
    const res = await evidence.GET(jsonReq('/api/evidence?targetType=DAILY_REPORT&targetId=dr-1', 'GET'))
    expect(res.status).toBe(200)
    const { items } = await res.json()
    expect(items.map((i: { url: string | null }) => i.url)).toEqual([null, 'https://contoh.id/b', null])
  })
  it('GET /api/evidence/[id] untuk tautan tak valid → 422; tautan sah diteruskan', async () => {
    asUser('admin-a')
    const call = () => evidenceId.GET(jsonReq('/api/evidence/e1', 'GET'), { params: Promise.resolve({ id: 'e1' }) })
    db.evidence.findUnique.mockResolvedValue({ id: 'e1', targetType: 'PROGRESS_REPORT', targetId: 'pr-1', url: 'data:text/html,x', storageKey: 'k', fileName: 'x' })
    expect((await call()).status).toBe(422)
    db.evidence.findUnique.mockResolvedValue({ id: 'e1', targetType: 'PROGRESS_REPORT', targetId: 'pr-1', url: 'https://contoh.id/b', storageKey: 'k', fileName: 'x' })
    expect(await (await call()).json()).toEqual({ url: 'https://contoh.id/b', kind: 'link' })
  })
})

describe('bukti: buat/hapus + hitung ulang + audit dalam satu transaksi', () => {
  const post = (body: unknown) => evidence.POST(jsonReq('/api/evidence', 'POST', body))
  const isiAkses = () => {
    asUser('pic-1')
    db.weeklyReportItem.findUnique.mockResolvedValue(null)
  }

  it('POST: create, hitung ulang, dan audit berjalan di klien transaksi yang sama', async () => {
    isiAkses()
    db.evidence.create.mockResolvedValue({ id: 'e-new' })
    db.evidence.count.mockResolvedValue(2)
    db.weeklyReportItem.updateMany.mockResolvedValue({ count: 1 })
    const res = await post({ targetType: 'WEEKLY_ITEM', targetId: 'wi-1', fileName: 'Foto', url: 'https://contoh.id/foto' })
    expect(res.status).toBe(200)
    expect((await res.json()).evidenceCount).toBe(2)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(world.audits.map((a) => a.action)).toContain('ATTACH_EVIDENCE')
    expect(db.weeklyReportItem.updateMany).toHaveBeenCalledWith({ where: { id: 'wi-1' }, data: { evidenceCount: 2 } })
  })

  it('POST: audit gagal → 500 bersih (transaksi dibatalkan, tanpa bocor galat)', async () => {
    isiAkses()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.evidence.create.mockResolvedValue({ id: 'e-new' })
    db.evidence.count.mockResolvedValue(1)
    db.weeklyReportItem.updateMany.mockResolvedValue({ count: 1 })
    db.auditLog.create.mockRejectedValue(new Error('rahasia: koneksi putus'))
    const res = await post({ targetType: 'WEEKLY_ITEM', targetId: 'wi-1', fileName: 'Foto', url: 'https://contoh.id/foto' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('rahasia')
  })

  it('DELETE: hapus + hitung ulang + audit dalam transaksi; sudah terhapus → 404', async () => {
    isiAkses()
    const row = { id: 'e1', targetType: 'WEEKLY_ITEM', targetId: 'wi-1', url: 'https://contoh.id/b', storageKey: 'link:x', fileName: 'x' }
    db.evidence.findUnique.mockResolvedValue(row)
    db.evidence.deleteMany.mockResolvedValue({ count: 1 })
    db.evidence.count.mockResolvedValue(0)
    db.weeklyReportItem.updateMany.mockResolvedValue({ count: 1 })
    const call = () => evidenceId.DELETE(jsonReq('/api/evidence/e1', 'DELETE'), { params: Promise.resolve({ id: 'e1' }) })
    const ok = await call()
    expect(ok.status).toBe(200)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(world.audits.map((a) => a.action)).toContain('REMOVE_EVIDENCE')
    db.evidence.deleteMany.mockResolvedValue({ count: 0 })
    expect((await call()).status).toBe(404)
  })
})

describe('KPI tepat waktu mengikuti aturan PT', () => {
  // Proyek aktif sejak lama, PIC tetap; laporan Sabtu 10 Okt dikirim 10.00 WIB.
  const proyek = { id: 'p-1', lifecycle: 'AKTIF', picUserId: 'pic-1', startDate: null, createdAt: wib('2026-09-01T00:00:00'), approvedAt: null }
  const jalankan = async (settings: unknown) => {
    vi.setSystemTime(wib('2026-10-12T10:00:00')) // Senin pagi: Sabtu & Minggu sudah lewat tenggat
    db.entity.findMany.mockResolvedValue([{ id: 'pt-a' }])
    db.project.findMany.mockResolvedValue([proyek])
    db.project.count.mockResolvedValue(1)
    db.division.count.mockResolvedValue(0)
    db.dailyProjectReport.findMany.mockImplementation(async (a: { where?: { submittedAt?: unknown; reportDate?: { in?: Date[] } } }) =>
      a.where?.reportDate?.in ? [{ projectId: 'p-1', reportDate: wib('2026-10-10T00:00:00'), submittedAt: wib('2026-10-10T10:00:00'), isLate: false }] : [])
    db.auditLog.findMany.mockResolvedValue([])
    db.attendance.findMany.mockResolvedValue([])
    db.weeklyDivisionReport.findMany.mockResolvedValue([])
    db.task.count.mockResolvedValue(0)
    db.escalation.findMany.mockResolvedValue([])
    db.reportSettings.findUnique.mockResolvedValue(settings)
    db.kpiSnapshot.upsert.mockResolvedValue({})
    const { refreshKpiSnapshots } = await import('@/lib/kpi-snapshot')
    const out = await refreshKpiSnapshots(new Date())
    expect(out.failed).toEqual([])
    const call = db.kpiSnapshot.upsert.mock.calls.find((c) => c[0].create.periodKey === '2026-10')!
    return call[0].create as { onTimeDailyPct: number }
  }
  it('PT 7 hari: hari kerja Sabtu/Minggu ikut dihitung; pelaporan Sabtu tepat waktu', async () => {
    const hasil = await jalankan(SETTINGS_24_7)
    // Okt 1–11 = 11 hari; hanya 10 Okt berlaporan => 1/11 = 9,1%.
    expect(hasil.onTimeDailyPct).toBe(9.1)
  })
  it('PT bawaan Sen–Jum: Sabtu tidak dihitung (laporannya tak masuk penyebut)', async () => {
    const hasil = await jalankan(null)
    // Hanya hari kerja Sen–Jum yang dihitung; laporan Sabtu tidak menolong => 0%.
    expect(hasil.onTimeDailyPct).toBe(0)
  })
})
