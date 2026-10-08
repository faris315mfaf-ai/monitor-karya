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
