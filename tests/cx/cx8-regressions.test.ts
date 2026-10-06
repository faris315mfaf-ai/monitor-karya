import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ui = vi.hoisted(() => ({ role: 'TI', sheets: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('../api/admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('../api/admin-fake-db')
  return {
    cookies: async () => ({ get: () => cookie.value ? { value: cookie.value } : undefined }),
    headers: async () => new Headers(),
  }
})
vi.mock('@/components/app-provider', () => ({ useApp: () => ({ user: { role: ui.role } }) }))
vi.mock('@/components/admin/use-fetch', () => ({
  useFetch: () => ({ data: { items: [], pending: 0, canDecide: false }, loading: false, error: null, reload: vi.fn(), setData: vi.fn() }),
  send: vi.fn(),
}))
vi.mock('@/components/admin/access-request-sheet', () => ({ AccessRequestSheet: () => { ui.sheets(); return null } }))
vi.mock('@/components/mk', () => {
  const container = ({ children }: { children?: ReactNode }) => createElement('div', null, children)
  return {
    Card: ({ children, action }: { children?: ReactNode; action?: ReactNode }) => createElement('div', null, action, children),
    Button: ({ children }: { children?: ReactNode }) => createElement('button', null, children),
    EmptyNote: container, ErrorNote: container, StatusBadge: container,
    ApprovalItem: () => null, Skeleton: () => null,
  }
})

import { AUTH_SECRET_FOR_TESTS, cookie, db, one, rows, seed, world } from '../api/admin-fake-db'
import { createSessionToken } from '@/lib/auth'
import { startOfWibDay } from '@/lib/lock'
import type { AdminOverview } from '@/lib/admin-meta'
import type { ComplianceData } from '@/lib/admin-compliance'
import { AccessRequestsCard } from '@/components/admin/access-requests-card'
import { PATCH as unlock } from '@/app/api/unlock-requests/route'
import { GET as overview } from '@/app/api/admin/overview/route'
import { GET as compliance } from '@/app/api/admin/compliance/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS
const T0 = new Date('2026-10-06T03:00:00Z')
const get = (url: string) => new NextRequest(`http://localhost${url}`)
function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  ui.sheets.mockClear()
  cookie.value = undefined
  // The shared in-memory fixture only implements _count. Supply Prisma's
  // _max result locally without changing the real compliance calculations.
  const reportsDb = db.dailyProjectReport as { groupBy(args: { where?: Record<string, unknown> }): Promise<unknown[]> }
  vi.spyOn(reportsDb, 'groupBy').mockImplementation(async (args) => {
    const reports = rows('dailyProjectReport', args.where as Record<string, unknown>)
    const ids = [...new Set(reports.map((r) => r.projectId as string))]
    return ids.map((projectId) => ({ projectId, _max: {
      submittedAt: reports.filter((r) => r.projectId === projectId)
        .map((r) => r.submittedAt as Date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    } }))
  })
})
afterEach(() => vi.useRealTimers())

describe('CX8.2 — pengajuan akses sesuai hak meja akun', () => {
  it.each(['TI', 'AUDITOR'])('%s tidak melihat tombol atau formulir pengajuan meja akun', (role) => {
    ui.role = role
    const html = renderToStaticMarkup(createElement(AccessRequestsCard))
    expect(html).not.toContain('Ajukan permintaan')
    expect(ui.sheets).not.toHaveBeenCalled()
  })

  it.each(['ADMIN_PT', 'SUPERADMIN'])('%s tetap dapat membuka pengajuan', (role) => {
    ui.role = role
    expect(renderToStaticMarkup(createElement(AccessRequestsCard))).toContain('Ajukan permintaan')
    expect(ui.sheets).toHaveBeenCalledOnce()
  })
})

const actions = ['approve', 'reject', 'execute', 'relock'] as const
function unlockRequest(action: typeof actions[number], targetType: string) {
  seed('unlockRequest', [{ id: 'ur-1', targetType, targetId: 'missing', requestedById: 'u-admin-a', reason: 'Perbaiki laporan',
    status: action === 'execute' ? 'DISETUJUI' : action === 'relock' ? 'DIEKSEKUSI' : 'DIAJUKAN' }])
  return new NextRequest('http://localhost/api/unlock-requests', { method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'ur-1', action }) })
}

describe('CX8.4 — target unlock hilang harus menutup semua aksi', () => {
  it.each(actions.flatMap((action) => ['DAILY_REPORT', 'WEEKLY_REPORT', 'UNKNOWN'].map((type) => [action, type] as const)))(
    '%s pada %s yang hilang/tidak dikenal → 404 tanpa perubahan', async (action, type) => {
      signIn('u-ti')
      const request = unlockRequest(action, type)
      const before = structuredClone(one('unlockRequest', 'ur-1'))
      const res = await unlock(request)
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: expect.stringMatching(/laporan.*tidak ada/i) })
      expect(one('unlockRequest', 'ur-1')).toEqual(before)
      expect(rows('auditLog')).toHaveLength(0)
      expect(rows('notificationLog')).toHaveLength(0)
    }
  )

  it.each(actions)('%s tetap memeriksa kapabilitas sebelum target', async (action) => {
    signIn('u-admin-b')
    expect((await unlock(unlockRequest(action, 'DAILY_REPORT'))).status).toBe(403)
    expect(rows('auditLog')).toHaveLength(0)
  })
})

async function both(as = 'u-admin-a', query = '') {
  signIn(as)
  const detailed = await compliance(get(`/api/admin/compliance${query}`))
  expect(detailed.status).toBe(200)
  const source = await detailed.json() as ComplianceData
  const summary = await overview(get(`/api/admin/overview${query}`))
  expect(summary.status).toBe(200)
  const body = await summary.json() as AdminOverview
  const expected = source.divisions.map((d) => ({
    id: d.id, name: d.name, head: d.head?.name ?? null, expected: d.expected, reported: d.reported, onLeave: d.onLeave,
    missing: d.missing.map(({ id, name, role, lastReportAt }) => ({ id, name, role, lastReportAt })),
  }))
  expect(body.compliance.divisions).toEqual(expected)
  return body.compliance
}

describe('CX8.5 — overview memakai sumber kompliansi yang sama', () => {
  it('PIC tanpa keanggotaan tetap dihitung lewat divisi proyek', async () => {
    one('user', 'u-pic-a').divisionId = null
    const result = await both()
    expect(result.divisions.find((d) => d.id === 'div-a1')).toMatchObject({ expected: 1, reported: 0 })
  })

  it('proyek yang belum mulai tidak menambah penyebut', async () => {
    one('project', 'prj-a').startDate = new Date('2026-10-06T17:00:00Z')
    const result = await both()
    expect(result.divisions.find((d) => d.id === 'div-a1')).toMatchObject({ expected: 0, missing: [] })
  })

  it('proyek PT lain milik PIC yang sama tidak mengubah angka PT terpilih', async () => {
    one('project', 'prj-b').picUserId = 'u-pic-a'
    seed('dailyProjectReport', [{ projectId: 'prj-a', entityId: 'pt-a', reportDate: startOfWibDay(T0), submittedAt: T0 }])
    const result = await both('u-admin-a', '?entityId=pt-b')
    expect(result.divisions.find((d) => d.id === 'div-a1')).toMatchObject({ expected: 1, reported: 1, missing: [] })
    expect(result.divisions.map((d) => d.id).sort()).toEqual(['div-a1', 'div-a2'])
  })

  it('kepala divisi yang memegang proyek memakai fallback divisi yang dipimpin', async () => {
    one('project', 'prj-a').divisionId = null
    one('project', 'prj-a').picUserId = 'u-kadiv-a'
    one('user', 'u-kadiv-a').divisionId = null
    const result = await both('u-ti', '?entityId=pt-a')
    expect(result.divisions.find((d) => d.id === 'div-a1')).toMatchObject({ expected: 1, missing: [{ id: 'u-kadiv-a' }] })
  })

  it.each(['CUTI', 'SAKIT', 'IZIN'])('%s keluar dari penyebut kedua endpoint', async (status) => {
    seed('attendance', [{ userId: 'u-pic-a', date: startOfWibDay(T0), status }])
    const result = await both()
    expect(result.divisions.find((d) => d.id === 'div-a1')).toMatchObject({ expected: 0, reported: 0, onLeave: 1 })
  })

  it('seluruh proyek aktif orang itu harus terkirim; kiriman terakhir sama di kedua endpoint', async () => {
    seed('project', [{ id: 'prj-a2', name: 'Proyek kedua', entityId: 'pt-a', divisionId: 'div-a1', picUserId: 'u-pic-a' }])
    seed('dailyProjectReport', [{ projectId: 'prj-a', entityId: 'pt-a', reportDate: startOfWibDay(T0), submittedAt: T0 }])
    const result = await both()
    expect(result.divisions.find((d) => d.id === 'div-a1')).toMatchObject({ expected: 1, reported: 0,
      missing: [{ id: 'u-pic-a', lastReportAt: T0.toISOString() }] })
  })

  it('PIC nonaktif tidak dihitung dan penanda keanggotaan lama tetap tersedia', async () => {
    one('user', 'u-pic-a').isActive = false
    const result = await both()
    expect(result.hasMembership).toBe(true)
    expect(result.divisions.find((d) => d.id === 'div-a1')).toMatchObject({ expected: 0 })
  })
})
