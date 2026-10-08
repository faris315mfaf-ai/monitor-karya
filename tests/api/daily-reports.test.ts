import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [T3-A1] Parameter `projectId` pada GET /api/daily-reports (drill-down
 * laporan per proyek untuk dashboard manajemen per perusahaan):
 *   1. menyaring exact-match tanpa mengubah perilaku parameter lain;
 *   2. cakupan entitas tetap diberlakukan — peran berlingkup tidak bisa
 *      memakai projectId untuk membaca laporan PT lain (anti-IDOR);
 *   3. nilai divalidasi: string ≤ 64 karakter.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})

import { AUTH_SECRET_FOR_TESTS, cookie, one, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { GET } from '@/app/api/daily-reports/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

const get = (url: string) => new NextRequest(`http://localhost${url}`)

beforeEach(() => {
  world()
  seed('dailyProjectReport', [
    { id: 'dpr-a1', projectId: 'prj-a', entityId: 'pt-a', reportDate: new Date('2026-10-05T00:00:00Z'), submittedAt: new Date('2026-10-05T02:00:00Z'), submittedById: 'u-pic-a', status: 'LANCAR', progressPct: 40 },
    { id: 'dpr-a2', projectId: 'prj-a', entityId: 'pt-a', reportDate: new Date('2026-10-04T00:00:00Z'), submittedAt: new Date('2026-10-04T02:00:00Z'), submittedById: 'u-pic-a', status: 'TERKENDALA', progressPct: 35 },
    { id: 'dpr-b1', projectId: 'prj-b', entityId: 'pt-b', reportDate: new Date('2026-10-05T00:00:00Z'), submittedAt: new Date('2026-10-05T02:00:00Z'), submittedById: 'u-pic-b', status: 'LANCAR', progressPct: 30 },
  ])
})

describe('GET /api/daily-reports?projectId= (T3-A1)', () => {
  it('menyaring laporan per proyek (exact match) untuk peran global', async () => {
    signIn('u-mgmt')
    const res = await GET(get('/api/daily-reports?projectId=prj-a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.items.map((i: { id: string }) => i.id).sort()).toEqual(['dpr-a1', 'dpr-a2'])
    expect(body.items.every((i: { project: { id: string } }) => i.project.id === 'prj-a')).toBe(true)
  })

  it('exact match: projectId yang hanya diawali id proyek tidak mencocokkan', async () => {
    signIn('u-mgmt')
    const res = await GET(get('/api/daily-reports?projectId=prj-a-2'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.items).toEqual([])
  })

  it('peran berlingkup tetap dibatasi cakupannya — projectId lintas PT tidak membocorkan laporan', async () => {
    signIn('u-dir-a') // DIREKTUR_ENTITAS pt-a meminta proyek pt-b
    const res = await GET(get('/api/daily-reports?projectId=prj-b'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.items).toEqual([])
  })

  it('peran berlingkup tetap melihat semua laporan entitasnya, dengan atau tanpa projectId', async () => {
    signIn('u-dir-a')
    const all = await (await GET(get('/api/daily-reports'))).json()
    expect(all.total).toBe(2)
    expect(all.items.every((i: { entity: { id: string } }) => i.entity.id === 'pt-a')).toBe(true)

    const mine = await (await GET(get('/api/daily-reports?projectId=prj-a'))).json()
    expect(mine.total).toBe(2)
    expect(mine.items.map((i: { id: string }) => i.id).sort()).toEqual(['dpr-a1', 'dpr-a2'])
  })

  it('projectId bekerja bersama saringan lain (status, entityId)', async () => {
    signIn('u-mgmt')
    const res = await GET(get('/api/daily-reports?projectId=prj-a&status=TERKENDALA&entityId=pt-a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.items[0].id).toBe('dpr-a2')
  })

  it('projectId lebih dari 64 karakter ditolak', async () => {
    signIn('u-mgmt')
    const res = await GET(get(`/api/daily-reports?projectId=${'x'.repeat(65)}`))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Parameter projectId tidak valid' })
  })

  it('projectId kosong diabaikan (perilaku tanpa parameter tetap)', async () => {
    signIn('u-mgmt')
    const res = await GET(get('/api/daily-reports?projectId='))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(3)
  })
})
