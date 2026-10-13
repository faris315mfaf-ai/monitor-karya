import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ENTITIES, asUser, db, resetWorld, wib } from './pic-world'

/*
 * [T13] Sisa konversi jam batas / hari kerja ke ReportSettings per PT: isDue
 * (hari kerja PT), cron remind-divisions (per PT), kalimat tenggat pengingat
 * mingguan, konsol sistem TI (ringkasan lintas PT) dan lockAt daily-input.
 * Berjalan di atas fixture tests/api/pic-world.ts.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => ({
  ...(await import('./pic-world')).auth,
  isGlobalRole: (role: string) => ['SUPERADMIN', 'TI', 'MANAJEMEN'].includes(role),
}))
vi.mock('@/lib/storage', () => ({ removeEvidence: vi.fn(), storageConfigured: () => false }))
vi.mock('@/lib/system-status', () => ({ technicalStatus: async () => ({}), reminderMatrix: async () => ({}) }))
const remind = vi.hoisted(() => vi.fn())
vi.mock('@/lib/reminders', async (orig) => ({ ...(await orig<typeof import('@/lib/reminders')>()), remindUnreportedDivisions: remind }))

import { isDue } from '@/lib/reminder-rules'
import { deadlineSentence } from '@/lib/reminders'
import { weeklyLabelsWith } from '@/lib/lock'
import { GET as cronDivisions } from '@/app/api/cron/remind-divisions/route'
import { GET as systemGet } from '@/app/api/system/route'
import { GET as dailyInputGet } from '@/app/api/daily-input/route'
import type { ReminderRuleView } from '@/lib/admin-meta'

type Aturan = { dailyCutoffHour: number | null; workingDays: number[]; dailyOpen: boolean; weeklyCutoffHour: number | null; weeklyOpen: boolean }
const SEMUA_HARI: Aturan = { dailyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyCutoffHour: null, weeklyOpen: true }
const SENIN_JUMAT: Aturan = { dailyCutoffHour: 17, workingDays: [1, 2, 3, 4, 5], dailyOpen: true, weeklyCutoffHour: 17, weeklyOpen: true }

/** Aturan per PT: findUnique({ where: { entityId } }). Tanpa baris = bawaan kode. */
function settingsPerPt(map: Record<string, Aturan | null>) {
  db.reportSettings.findUnique.mockImplementation(async ({ where }: { where: { entityId: string } }) => map[where.entityId] ?? null)
}

const rule = (over: Partial<ReminderRuleView> = {}): ReminderRuleView => ({
  kind: 'HARIAN', enabled: true, time: '16:30', weekday: null, params: {}, lastRunAt: null, updatedAt: null, updatedBy: null, ...over,
} as ReminderRuleView)

beforeEach(() => {
  vi.useFakeTimers()
  resetWorld()
  remind.mockReset()
  // Fixture ENTITIES tak punya isActive: tiruan findMany di sini memperlakukan semuanya aktif.
  db.entity.findMany.mockImplementation(async () => ENTITIES.map((e) => ({ ...e, isActive: true })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('isDue memakai hari kerja PT', () => {
  const minggu = wib('2026-10-11T17:00:00')
  const selasa = wib('2026-10-06T17:00:00')
  it('tanpa argumen ketiga: Sen–Jum seperti dulu (pemanggil lama tak berubah)', () => {
    expect(isDue(rule(), minggu)).toBe(false)
    expect(isDue(rule(), selasa)).toBe(true)
  })
  it('workingDays kosong = setiap hari: Minggu jatuh tempo', () => {
    expect(isDue(rule(), minggu, [])).toBe(true)
  })
  it('hari kerja kustom: Minggu hanya bila 7 termasuk; Selasa gugur bila 2 tak termasuk', () => {
    expect(isDue(rule(), minggu, [7])).toBe(true)
    expect(isDue(rule(), selasa, [1, 3, 5])).toBe(false)
  })
  it('aturan bertanggal-pekan tak terpengaruh hari kerja PT', () => {
    const jumat = wib('2026-10-09T13:30:00')
    expect(isDue(rule({ kind: 'MINGGUAN', time: '13:00', weekday: 5 }), jumat, [])).toBe(true)
    expect(isDue(rule({ kind: 'MINGGUAN', time: '13:00', weekday: 5 }), selasa, [])).toBe(false)
  })
  it('sudah berjalan hari ini atau dimatikan: tidak jatuh tempo', () => {
    expect(isDue(rule({ lastRunAt: wib('2026-10-11T16:31:00').toISOString() }), minggu, [])).toBe(false)
    expect(isDue(rule({ enabled: false }), minggu, [])).toBe(false)
  })
})

describe('kalimat tenggat pengingat mingguan mengikuti jam PT', () => {
  const periode = { key: '2026-W41', start: wib('2026-10-05T00:00:00'), end: wib('2026-10-11T00:00:00') } as never
  it('label serah/kunci memakai jam entitas', () => {
    expect(weeklyLabelsWith(15)).toEqual({ handover: 'Kamis 15.00 WIB', lock: 'Jumat 15.00 WIB' })
  })
  it('sebelum serah: jam PT disebut', () => {
    const s = deadlineSentence(periode, wib('2026-10-06T10:00:00'), { weeklyCutoffHour: 15, weeklyOpen: true })
    expect(s).toBe('Serahkan paling lambat Kamis 15.00 WIB.')
  })
  it('sesudah serah sebelum kunci, lalu sesudah kunci', () => {
    const rpt = { weeklyCutoffHour: 15, weeklyOpen: true }
    expect(deadlineSentence(periode, wib('2026-10-08T16:00:00'), rpt)).toContain('Kamis 15.00 WIB sudah lewat')
    expect(deadlineSentence(periode, wib('2026-10-09T16:00:00'), rpt)).toContain('dikunci sejak Jumat 15.00 WIB')
  })
  it('mode tanpa batas jam (24/7) tidak menyebut jam 17.00; ditutup disebut apa adanya', () => {
    const s24 = deadlineSentence(periode, wib('2026-10-10T20:00:00'), { weeklyCutoffHour: null, weeklyOpen: true })
    expect(s24).not.toContain('17.00')
    expect(s24).toContain('tidak dibatasi')
    expect(deadlineSentence(periode, wib('2026-10-06T10:00:00'), { weeklyCutoffHour: 17, weeklyOpen: false })).toContain('ditutup')
  })
})

describe('/api/cron/remind-divisions per PT', () => {
  const req = () => new NextRequest('http://localhost/api/cron/remind-divisions', { headers: { authorization: 'Bearer rahasia-uji-cron-32-karakter-minimal' } })
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'rahasia-uji-cron-32-karakter-minimal')
    vi.stubEnv('OPS_HEALTH_SECRET', 'rahasia-uji-cron-32-karakter-minimal')
    db.auditLog.create.mockResolvedValue({ id: 'run-1' })
    db.auditLog.updateMany.mockResolvedValue({ count: 1 })
    db.auditLog.findFirst.mockResolvedValue(null)
    db.reminderRule.findMany.mockResolvedValue([])
    remind.mockResolvedValue({ sent: 0, results: [], week: { key: '2026-W41' } })
  })
  it('Minggu: hanya PT berhari kerja setiap hari yang diingatkan', async () => {
    vi.setSystemTime(wib('2026-10-11T08:00:00'))
    settingsPerPt({ 'pt-a': SEMUA_HARI, 'pt-b': SENIN_JUMAT })
    const res = await cronDivisions(req())
    expect(res.status).toBe(200)
    expect(remind).toHaveBeenCalledWith({ entityIds: ['pt-a'], source: 'CRON' })
  })
  it('Minggu dan semua PT Sen–Jum: dilewati', async () => {
    vi.setSystemTime(wib('2026-10-11T08:00:00'))
    settingsPerPt({ 'pt-a': SENIN_JUMAT, 'pt-b': null })
    const res = await cronDivisions(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ skipped: 'bukan hari kerja', sent: 0 })
    expect(remind).not.toHaveBeenCalled()
  })
  it('Selasa: PT berhari kerja kustom (Sabtu saja) tidak diingatkan, PT lain ya', async () => {
    vi.setSystemTime(wib('2026-10-06T08:00:00'))
    settingsPerPt({ 'pt-a': { ...SEMUA_HARI, workingDays: [6] }, 'pt-b': SENIN_JUMAT })
    await cronDivisions(req())
    expect(remind).toHaveBeenCalledWith({ entityIds: ['pt-b'], source: 'CRON' })
  })
})

describe('/api/system ringkasan kunci lintas PT', () => {
  beforeEach(() => {
    db.user.groupBy.mockResolvedValue([])
    db.user.count.mockResolvedValue(0)
    db.user.findMany.mockResolvedValue([])
    for (const m of ['entity', 'project', 'division', 'dailyProjectReport', 'weeklyDivisionReport', 'evidence', 'auditLog', 'notificationLog', 'unlockRequest']) db[m].count.mockResolvedValue(0)
    db.auditLog.findMany.mockResolvedValue([])
  })
  const ambil = async () => {
    asUser('sa')
    const res = await systemGet()
    expect(res.status).toBe(200)
    return (await res.json()).locking
  }
  it('aturan seragam 24/7: label 24.00 WIB, tidak terkunci pukul 18.00', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    settingsPerPt({ 'pt-a': SEMUA_HARI, 'pt-b': SEMUA_HARI })
    const locking = await ambil()
    expect(locking).toMatchObject({ dailyCutoff: '24.00 WIB', dailyLocked: false, dailyLockAt: wib('2026-10-07T00:00:00').toISOString() })
    expect(locking.dailyCountdown).toMatchObject({ passed: false, hours: 6 })
  })
  it('aturan beragam: label beragam, terkunci hanya bila semua PT terkunci, rincian per PT', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    settingsPerPt({ 'pt-a': SEMUA_HARI, 'pt-b': SENIN_JUMAT })
    const locking = await ambil()
    expect(locking.dailyCutoff).toBe('beragam per PT')
    expect(locking.dailyLocked).toBe(false) // PT A masih terbuka
    expect(locking.perEntity.map((e: { entityId: string; dailyLocked: boolean; dailyCutoff: string }) => [e.entityId, e.dailyLocked, e.dailyCutoff]))
      .toEqual([['pt-a', false, '24.00 WIB'], ['pt-b', true, '17.00 WIB']])
  })
  it('semua PT berjam 17.00 dan sudah lewat: terkunci', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    settingsPerPt({ 'pt-a': SENIN_JUMAT, 'pt-b': SENIN_JUMAT })
    const locking = await ambil()
    expect(locking).toMatchObject({ dailyCutoff: '17.00 WIB', dailyLocked: true })
  })
})

describe('/api/daily-input lockAt mengikuti aturan PT', () => {
  const panggil = async () => {
    asUser('pic-1')
    db.dailyProjectReport.findMany.mockResolvedValue([])
    db.task.groupBy.mockResolvedValue([])
    db.evidence.findMany.mockResolvedValue([])
    db.unlockRequest.findMany.mockResolvedValue([])
    const res = await dailyInputGet(new NextRequest('http://localhost/api/daily-input'))
    expect(res.status).toBe(200)
    return res.json()
  }
  it('24/7: lockAt akhir hari WIB (bukan 17.00) dan tidak terkunci pukul 18.00', async () => {
    vi.setSystemTime(wib('2026-10-06T18:00:00'))
    settingsPerPt({ 'pt-a': SEMUA_HARI })
    const body = await panggil()
    expect(body.lockAt).toBe(wib('2026-10-07T00:00:00').toISOString())
    expect(body.locked).toBe(false)
  })
  it('jam batas 15.00: lockAt 15.00 WIB hari itu', async () => {
    vi.setSystemTime(wib('2026-10-06T10:00:00'))
    settingsPerPt({ 'pt-a': { ...SENIN_JUMAT, dailyCutoffHour: 15 } })
    expect((await panggil()).lockAt).toBe(wib('2026-10-06T15:00:00').toISOString())
  })
  it('pengisian ditutup: lockAt awal hari dan terkunci', async () => {
    vi.setSystemTime(wib('2026-10-06T10:00:00'))
    settingsPerPt({ 'pt-a': { ...SENIN_JUMAT, dailyOpen: false } })
    const body = await panggil()
    expect(body.lockAt).toBe(wib('2026-10-06T00:00:00').toISOString())
    expect(body.locked).toBe(true)
  })
})
