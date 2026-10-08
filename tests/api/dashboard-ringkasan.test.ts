import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [T2-B6] Regresi kueri /api/dashboard dan /api/ringkasan:
 *   1. /api/dashboard tidak lagi mengambil count DailyProjectReport tanpa
 *      `isLate` (dulu diambil sebagai `todayReports` tetapi tidak pernah
 *      dipakai — `summary.reportsToday` berasal dari KpiSnapshot).
 *   2. Eskalasi diambil dengan select eksplisit, bukan `include` yang memuat
 *      seluruh skalar (decisionText, decidedById, dst.) — di kedua route.
 *   3. /api/dashboard?scopeEntityId= memuat Entity hanya kolom `path`.
 * Bentuk jawaban tidak berubah: objek eskalasi pada jawaban diperiksa utuh
 * terhadap fixture, termasuk kolom yang kini tidak diambil diberi nilai
 * iseng (bila route membutuhkannya, pemetaan akan menghasilkan undefined dan
 * tes ini gagal).
 *
 * [T3-A1] Tambahan: `projects[].escalations` pada /api/ringkasan memuat
 * eskalasi yang bersumber laporan harian proyek itu (sourceType DAILY_REPORT),
 * termasuk sourceId lama di luar jendela recentReports; proyek tanpa eskalasi
 * menerima array kosong; butir mingguan (WEEKLY_ITEM) tidak dipetakan ke proyek.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})

import { AUTH_SECRET_FOR_TESTS, cookie, db, one, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { GET as dashboardGET } from '@/app/api/dashboard/route'
import { GET as ringkasanGET } from '@/app/api/ringkasan/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const T0 = new Date('2026-10-06T03:00:00Z') // Selasa 10.00 WIB

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

const get = (url: string) => new NextRequest(`http://localhost${url}`)

/** Tampilan bertipe untuk memata-matai kueri (db tiruan bertipe unknown). */
type QueryFn = (args: Record<string, unknown>) => Promise<unknown>
const escDb = db.escalation as unknown as { findMany: QueryFn }
const reportCountDb = db.dailyProjectReport as unknown as { count: QueryFn }
const reportFindDb = db.dailyProjectReport as unknown as { findMany: QueryFn }
const entityDb = db.entity as unknown as { findUnique: QueryFn }

/** Satu eskalasi dengan semua kolom terisi (termasuk yang kini tidak di-select). */
function seedEscalation() {
  seed('escalation', [
    {
      id: 'esc-1', sourceType: 'DAILY_REPORT', sourceId: 'dpr-x', entityId: 'pt-a',
      raisedById: 'u-pic-a', raisedAt: new Date('2026-10-01T00:00:00Z'),
      summary: 'Perlu keputusan', needed: 'KEPUTUSAN', status: 'DIAJUKAN', slaDays: 7,
      decidedById: 'u-dir-a', decidedAt: new Date('2026-10-02T00:00:00Z'), decisionText: 'rahasia',
    },
  ])
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  one('entity', 'pt-a').region = 'Jawa Barat'
  seedEscalation()
})
afterEach(() => vi.useRealTimers())

/* ------------------------------------------------------------------ */
/* GET /api/dashboard                                                  */
/* ------------------------------------------------------------------ */

describe('GET /api/dashboard (kueri, T2-B6)', () => {
  it('hanya satu count DailyProjectReport (lateToday); count tanpa isLate yang dulu tak terpakai hilang', async () => {
    signIn('u-mgmt')
    const countSpy = vi.spyOn(reportCountDb, 'count')
    const res = await dashboardGET(get('/api/dashboard'))
    expect(res.status).toBe(200)

    expect(countSpy).toHaveBeenCalledTimes(1)
    expect((countSpy.mock.calls[0][0].where as { isLate?: boolean }).isLate).toBe(true)

    const body = await res.json()
    // Bentuk summary tetap; reportsToday tetap ada (dari KpiSnapshot), lateToday dihitung.
    expect(Object.keys(body.summary)).toEqual([
      'totalEntities', 'totalProjects', 'activeProjects', 'reportsToday', 'lateToday', 'weeklyPending',
      'pendingEscalations', 'pendingUnlocks', 'avgCompliance', 'avgOnTime', 'avgWeeklyCompleteness',
      'avgEvidenceCompleteness', 'avgHighPriorityCompletion',
    ])
    expect(body.summary.totalEntities).toBe(2)
  })

  it('eskalasi di-select eksplisit (tanpa include) dan objek jawaban tetap utuh', async () => {
    signIn('u-mgmt')
    const escSpy = vi.spyOn(escDb, 'findMany')
    const res = await dashboardGET(get('/api/dashboard'))
    expect(res.status).toBe(200)

    const arg = escSpy.mock.calls[0][0] as Record<string, unknown>
    expect(arg.include).toBeUndefined()
    expect(Object.keys(arg.select as object).sort()).toEqual(
      ['entity', 'id', 'needed', 'raisedAt', 'slaDays', 'status', 'summary'],
    )

    const body = await res.json()
    expect(body.pendingEscalations).toEqual([
      {
        id: 'esc-1', summary: 'Perlu keputusan', status: 'DIAJUKAN', needed: 'KEPUTUSAN',
        raisedAt: '2026-10-01T00:00:00.000Z', ageDays: 5, slaDays: 7, isOverdue: false,
        entityName: 'PT Alfa', entityCode: 'ALF', region: 'Jawa Barat',
      },
    ])
  })

  it('?scopeEntityId= memuat Entity hanya kolom path', async () => {
    signIn('u-mgmt')
    const findUniqueSpy = vi.spyOn(entityDb, 'findUnique')
    const res = await dashboardGET(get('/api/dashboard?scopeEntityId=pt-a'))
    expect(res.status).toBe(200)
    expect(findUniqueSpy).toHaveBeenCalledTimes(1)
    expect(findUniqueSpy.mock.calls[0][0]).toEqual({ where: { id: 'pt-a' }, select: { path: true } })

    const body = await res.json()
    expect(body.summary.totalEntities).toBe(1) // subtree pt-a saja
    expect(body.pendingEscalations).toHaveLength(1) // eskalasi pt-a tetap ikut
  })
})

/* ------------------------------------------------------------------ */
/* GET /api/ringkasan                                                  */
/* ------------------------------------------------------------------ */

describe('GET /api/ringkasan (kueri, T2-B6)', () => {
  it('eskalasi di-select eksplisit (tanpa include) dan jawaban tetap utuh', async () => {
    signIn('u-mgmt')
    const escSpy = vi.spyOn(escDb, 'findMany')
    const res = await ringkasanGET()
    expect(res.status).toBe(200)

    const arg = escSpy.mock.calls[0][0] as Record<string, unknown>
    expect(arg.include).toBeUndefined()
    expect(Object.keys(arg.select as object).sort()).toEqual(
      ['entity', 'id', 'needed', 'raisedAt', 'raisedBy', 'slaDays', 'sourceId', 'sourceType', 'status', 'summary'],
    )

    const body = await res.json()
    // Kolom yang di-drop diberi nilai di fixture; objek utuh tetap terbentuk.
    expect(body.escalations).toEqual([
      {
        divisionId: null, id: 'esc-1', summary: 'Perlu keputusan', needed: 'KEPUTUSAN',
        status: 'DIAJUKAN', raisedAt: '2026-10-01T00:00:00.000Z', raisedBy: 'Putra PIC A',
        entityName: 'PT Alfa', entityCode: 'ALF', ageDays: 5, overdue: false,
      },
    ])
  })

  it('bentuk jawaban tingkat atas tidak berubah', async () => {
    signIn('u-mgmt')
    const res = await ringkasanGET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kind).toBe('RINGKASAN')
    expect(Object.keys(body)).toEqual([
      'kind', 'week', 'scope', 'projects', 'counts', 'progressComparison', 'daily', 'weekly',
      'trend', 'byEntity', 'reportWeek', 'divisions', 'outputs', 'deadlineProposals',
      'attendance', 'viewer', 'approvalRequests', 'decisions', 'escalations', 'activity',
    ])
    // Bagian yang sama-sama dibaca endpoint tetap terisi dari fixture.
    expect(body.scope).toEqual({ entities: 2, divisions: 3, global: true })
    expect(body.attendance).toEqual({ people: 13, present: 13, late: 0, leave: 0 })
  })
})

/* ------------------------------------------------------------------ */
/* GET /api/ringkasan — projects[].escalations (T3-A1)                 */
/* ------------------------------------------------------------------ */

/**
 * Laporan harian + eskalasi tambahan di atas world():
 * - dpr-a-baru (2026-10-05) berada DALAM jendela recentReports,
 * - dpr-a-lama (2026-07-15) berada DI LUAR jendela (jendela ± 7 minggu),
 * - prj-b mempunyai laporan tetapi tanpa eskalasi,
 * - esc-mingguan bersumber WEEKLY_ITEM — tidak boleh masuk proyek mana pun.
 */
describe('GET /api/ringkasan (eskalasi per proyek, T3-A1)', () => {
  const report = { status: 'LANCAR', progressPct: 40, obstacle: null, needsEscalation: false, achievementToday: 'Pengecoran lantai' }

  beforeEach(() => {
    seed('dailyProjectReport', [
      { id: 'dpr-a-baru', projectId: 'prj-a', entityId: 'pt-a', reportDate: new Date('2026-10-05T00:00:00Z'), submittedAt: new Date('2026-10-05T02:00:00Z'), submittedById: 'u-pic-a', ...report },
      { id: 'dpr-a-lama', projectId: 'prj-a', entityId: 'pt-a', reportDate: new Date('2026-07-15T00:00:00Z'), submittedAt: new Date('2026-07-15T02:00:00Z'), submittedById: 'u-pic-a', ...report, achievementToday: null },
      { id: 'dpr-b-1', projectId: 'prj-b', entityId: 'pt-b', reportDate: new Date('2026-10-05T00:00:00Z'), submittedAt: new Date('2026-10-05T02:00:00Z'), submittedById: 'u-pic-b', ...report, achievementToday: null },
    ])
    seed('escalation', [
      { id: 'esc-lama', sourceType: 'DAILY_REPORT', sourceId: 'dpr-a-lama', entityId: 'pt-a', raisedById: 'u-pic-a', raisedAt: new Date('2026-08-20T00:00:00Z'), summary: 'Kendala lama belum selesai', needed: 'BANTUAN', status: 'DITINJAU', slaDays: 5 },
      { id: 'esc-baru', sourceType: 'DAILY_REPORT', sourceId: 'dpr-a-baru', entityId: 'pt-a', raisedById: 'u-pic-a', raisedAt: new Date('2026-10-04T00:00:00Z'), summary: 'Material telat', needed: 'KEPUTUSAN', status: 'DIAJUKAN', slaDays: 7 },
      { id: 'esc-mingguan', sourceType: 'WEEKLY_ITEM', sourceId: 'wri-1', entityId: 'pt-a', raisedById: 'u-kadiv-a', raisedAt: new Date('2026-10-03T00:00:00Z'), summary: 'Butir mingguan', needed: 'KEPUTUSAN', status: 'DIAJUKAN', slaDays: 7 },
    ])
  })

  it('memuat eskalasi laporan harian proyek itu, termasuk sourceId lama di luar recentReports', async () => {
    signIn('u-mgmt')
    const findManySpy = vi.spyOn(reportFindDb, 'findMany')
    const res = await ringkasanGET()
    expect(res.status).toBe(200)

    const body = await res.json()
    const prjA = body.projects.find((p: { id: string }) => p.id === 'prj-a')
    // Urutan mengikuti raisedAt asc pada kueri eskalasi.
    expect(prjA.escalations).toEqual([
      {
        id: 'esc-lama', summary: 'Kendala lama belum selesai', needed: 'BANTUAN', status: 'DITINJAU',
        raisedAt: '2026-08-20T00:00:00.000Z', raisedBy: 'Putra PIC A', ageDays: 47, overdue: true,
      },
      {
        id: 'esc-baru', summary: 'Material telat', needed: 'KEPUTUSAN', status: 'DIAJUKAN',
        raisedAt: '2026-10-04T00:00:00.000Z', raisedBy: 'Putra PIC A', ageDays: 2, overdue: false,
      },
    ])

    // Mekanisme: sourceId → projectId lewat findMany kecil per id (pola srcDaily),
    // bukan lewat jendela recentReports — dpr-a-lama memang di luar jendela itu.
    const calls = findManySpy.mock.calls.map((c) => c[0])
    const byId = calls.find((a) => (a.where as { id?: { in?: string[] } })?.id?.in?.includes('dpr-a-lama'))
    expect(byId?.select).toEqual({ id: true, projectId: true })
    const windowed = calls.find((a) => (a.where as { reportDate?: { gte?: Date } })?.reportDate?.gte)
    expect(
      (windowed!.where as { reportDate: { gte: Date } }).reportDate.gte.getTime(),
    ).toBeGreaterThan(new Date('2026-07-15T00:00:00Z').getTime())
  })

  it('butir mingguan (WEEKLY_ITEM) tidak dipetakan ke proyek mana pun', async () => {
    signIn('u-mgmt')
    const res = await ringkasanGET()
    const body = await res.json()
    expect(body.projects.some((p: { escalations: { id: string }[] }) => p.escalations.some((e) => e.id === 'esc-mingguan'))).toBe(false)
    // Tetap tampil di daftar eskalasi tingkat atas.
    expect(body.escalations.some((e: { id: string }) => e.id === 'esc-mingguan')).toBe(true)
  })

  it('proyek tanpa eskalasi menerima array kosong, bukan undefined', async () => {
    signIn('u-mgmt')
    const res = await ringkasanGET()
    const body = await res.json()
    const prjB = body.projects.find((p: { id: string }) => p.id === 'prj-b')
    expect(prjB.escalations).toEqual([])
    // Semua baris proyek memuat bidang ini.
    expect(body.projects.every((p: { escalations: unknown[] }) => Array.isArray(p.escalations))).toBe(true)
  })

  it('peran berlingkup hanya melihat eskalasi per proyek pada entitasnya sendiri', async () => {
    signIn('u-dir-b') // DIREKTUR_ENTITAS pt-b
    const res = await ringkasanGET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projects.map((p: { id: string }) => p.id)).toEqual(['prj-b'])
    expect(body.projects[0].escalations).toEqual([]) // eskalasi pt-a tidak bocor
    expect(body.escalations).toEqual([])
  })
})
