import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F2-DIREKTUR] /api/search — palet ⌘K. Pencarian dibatasi cakupan akun:
 * PIC tidak mencari orang/divisi, kontak hanya untuk peran yang boleh
 * menghubungi, kueri pendek tidak menyentuh basis data.
 */

const mocks = vi.hoisted(() => ({
  currentUser: { value: null as unknown },
  db: {
    project: { findMany: vi.fn() },
    division: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    weeklyDivisionReport: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.currentUser.value),
  scopeEntityIds: vi.fn(async () => ['pt-a']),
  scopeUserIds: vi.fn(async () => ['u-1', 'u-2']),
}))
vi.mock('@/lib/pic-access', () => ({ projectScopeWhere: vi.fn(async () => ({ entityId: { in: ['pt-a'] } })) }))
vi.mock('@/lib/kadiv', () => ({ ledDivisions: vi.fn(async () => []), teamUserIds: vi.fn(async () => []) }))

import { GET } from '@/app/api/search/route'

const db = mocks.db
let n = 0
const user = (role: string): SessionUser => ({
  // id berbeda per uji supaya batas laju per akun tidak saling memengaruhi
  id: `u-${role}-${n++}`, name: 'Uji', email: 'uji@contoh.test', role, scopeEntityId: 'pt-a', avatarColor: null, mustChangePassword: false,
})
const get = (q: string) => GET(new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`))

beforeEach(() => {
  for (const model of Object.values(db)) for (const f of Object.values(model)) f.mockReset()
  db.project.findMany.mockResolvedValue([
    { id: 'p-1', name: 'Renovasi Ruang IT', code: 'PRJ-1', lifecycle: 'AKTIF', entity: { code: 'RTK' }, picUser: { name: 'Dimas' }, picName: null },
  ])
  db.division.findMany.mockResolvedValue([{ id: 'd-1', name: 'Teknologi', entity: { name: 'PT A' }, headUser: { name: 'Andi' } }])
  db.user.findMany.mockResolvedValue([{ id: 'u-1', name: 'Rena', role: 'PIC_PROYEK', title: null, email: 'rena@contoh.test', phone: '0812' }])
  db.weeklyDivisionReport.findMany.mockResolvedValue([])
})

describe('GET /api/search', () => {
  it('kueri kurang dari 2 huruf tidak mencari', async () => {
    mocks.currentUser.value = user('DIREKTUR_ENTITAS')
    const res = await get('r')
    expect((await res.json()).hits).toEqual([])
    expect(db.project.findMany).not.toHaveBeenCalled()
  })

  it('direktur mendapat proyek, divisi, dan orang beserta kontaknya', async () => {
    mocks.currentUser.value = user('DIREKTUR_ENTITAS')
    const body = await (await get('ren')).json()
    const kinds = body.hits.map((h: { kind: string }) => h.kind)
    expect(kinds).toEqual(expect.arrayContaining(['project', 'division', 'user']))
    expect(body.hits.find((h: { kind: string }) => h.kind === 'user').email).toBe('rena@contoh.test')
    // proyek dicari di dalam cakupan PT
    expect(JSON.stringify(db.project.findMany.mock.calls[0][0].where)).toContain('pt-a')
  })

  it('PIC hanya mencari proyeknya, tanpa orang dan divisi', async () => {
    mocks.currentUser.value = user('PIC_PROYEK')
    const body = await (await get('ren')).json()
    expect(body.hits.every((h: { kind: string }) => h.kind === 'project')).toBe(true)
    expect(db.user.findMany).not.toHaveBeenCalled()
    expect(db.division.findMany).not.toHaveBeenCalled()
  })

  it('auditor mencari orang tanpa kontak', async () => {
    mocks.currentUser.value = user('AUDITOR')
    const body = await (await get('ren')).json()
    const person = body.hits.find((h: { kind: string }) => h.kind === 'user')
    expect(person.email).toBeNull()
    expect(person.phone).toBeNull()
  })
})
