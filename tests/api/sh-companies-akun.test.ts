import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/*
 * [SH-SV2] Model laporan SUBHOLDING (16 Okt 2026, docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md):
 *  - POST /api/companies type SUB_HOLDING → akun ADMIN_SUBHOLDING otomatis (admin.<slug>,
 *    sandi awal 12345678, wajib ganti), bentrok username/email → akhiran angka, AuditLog tanpa sandi.
 *  - PT baru TIDAK membuat akun Admin PT otomatis; PT boleh di bawah subholding/keturunannya.
 *  - Meja akun Super Admin: SUPERVISOR / SUPERUSER / MANAJEMEN tanpa cakupan,
 *    ADMIN_SUBHOLDING wajib cakupan SUB_HOLDING (satu akun aktif per subholding).
 * Basis data palsu di memori; tidak ada koneksi DB.
 */

type Row = Record<string, unknown>
const store = vi.hoisted(() => ({ entity: [] as Row[], user: [] as Row[], auditLog: [] as Row[], me: {} as Row, seq: 0 }))

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k]
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row
      if ('in' in c) return (c.in as unknown[]).includes(v)
      if ('not' in c) return v !== c.not
      if ('startsWith' in c) return typeof v === 'string' && v.startsWith(c.startsWith as string)
      return false
    }
    return (v ?? null) === (cond ?? null)
  })
}
function pick(row: Row | undefined, select?: Row) {
  if (!row) return null
  if (!select) return { ...row }
  return Object.fromEntries(Object.keys(select).map((k) => [k, row[k] ?? null]))
}
function table(name: 'entity' | 'user' | 'auditLog') {
  const rows = () => store[name]
  return {
    findUnique: vi.fn(async ({ where, select }: { where: Row; select?: Row }) => pick(rows().find((r) => matches(r, where)), select)),
    findFirst: vi.fn(async ({ where, select }: { where: Row; select?: Row }) => pick(rows().find((r) => matches(r, where)), select)),
    findMany: vi.fn(async ({ where }: { where?: Row } = {}) => rows().filter((r) => matches(r, where))),
    count: vi.fn(async ({ where }: { where?: Row } = {}) => rows().filter((r) => matches(r, where)).length),
    create: vi.fn(async ({ data, select }: { data: Row; select?: Row }) => {
      const row = { id: `${name}-${++store.seq}`, isActive: true, ...data }
      rows().push(row)
      return pick(row, select)
    }),
    update: vi.fn(async ({ where, data, select }: { where: Row; data: Row; select?: Row }) => {
      const row = rows().find((r) => matches(r, where))!
      Object.assign(row, data)
      return pick(row, select)
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  }
}

const db = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: async () => store.me }))
vi.mock('@/lib/password', () => ({ hashPassword: async (p: string) => `hash:${p}` }))

import * as companies from '@/app/api/companies/route'
import * as companyUsers from '@/app/api/companies/users/route'
import { positionRolesFor, roleScopeProblem } from '@/lib/companies'

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  store.seq = 0
  store.entity = [
    { id: 'holding', type: 'HOLDING', code: 'HOLDING-01', name: 'PT BIKE Tbk', path: '/holding/', isActive: true, createdAt: new Date(0) },
    { id: 'sh-energi', type: 'SUB_HOLDING', code: 'SH-ENERGI', name: 'Karya Energi', path: '/holding/SH-ENERGI/', parentId: 'holding', isActive: true },
    { id: 'sector-1', type: 'SECTOR', code: 'S-MIGAS', name: 'Sektor Migas', path: '/holding/SH-ENERGI/S-MIGAS/', parentId: 'sh-energi', isActive: true },
    { id: 'pt-a', type: 'PT', code: 'PT-A', name: 'PT A', path: '/holding/SH-ENERGI/S-MIGAS/PT-A/', parentId: 'sector-1', isActive: true },
  ]
  store.user = [{ id: 'sa', username: 'superadmin', email: 'sa@karya.co.id', role: 'SUPERADMIN', scopeEntityId: null, isActive: true }]
  store.auditLog = []
  store.me = { id: 'sa', role: 'SUPERADMIN', scopeEntityId: null, name: 'Super Admin' }
  const tables = { entity: table('entity'), user: table('user'), auditLog: table('auditLog') }
  Object.assign(db, tables, {
    division: { updateMany: vi.fn(async () => ({ count: 0 })), findFirst: vi.fn(async () => null) },
    project: { updateMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/companies — subholding', () => {
  it('membuat subholding di bawah holding + akun Admin subholding otomatis', async () => {
    const res = await companies.POST(req('/api/companies', 'POST', { type: 'SUB_HOLDING', name: 'Subholding Bike Logistik' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entity).toMatchObject({ name: 'Subholding Bike Logistik' })
    expect(body.adminAccount).toEqual({ id: expect.any(String), username: 'admin.bikelogistik', defaultPassword: '12345678' })

    const sh = store.entity.find((e) => e.id === body.entity.id)!
    expect(sh).toMatchObject({ type: 'SUB_HOLDING', parentId: 'holding', code: 'SH-BIKELOGISTIK', path: '/holding/SH-BIKELOGISTIK/' })
    const admin = store.user.find((u) => u.id === body.adminAccount.id)!
    expect(admin).toMatchObject({
      role: 'ADMIN_SUBHOLDING',
      name: 'Admin Subholding Bike Logistik',
      scopeEntityId: sh.id,
      mustChangePassword: true,
      passwordHash: 'hash:12345678',
      email: 'admin.bikelogistik@karya.co.id',
    })
    expect(store.auditLog).toHaveLength(1)
    const audit = JSON.stringify(store.auditLog[0])
    expect(audit).toContain('admin.bikelogistik')
    expect(audit).not.toContain('12345678')
  })

  it('bentrok username atau email → akhiran angka', async () => {
    store.user.push(
      { id: 'u1', username: 'admin.agro', email: 'lain@karya.co.id', role: 'ADMIN_PT', isActive: true },
      { id: 'u2', username: 'orang.lain', email: 'admin.agro2@karya.co.id', role: 'ADMIN_PT', isActive: true }
    )
    const res = await companies.POST(req('/api/companies', 'POST', { type: 'SUB_HOLDING', name: 'Agro' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.adminAccount.username).toBe('admin.agro3')
  })

  it('subholding menolak daftar posisi (akunnya otomatis) dan induk non-holding', async () => {
    let res = await companies.POST(req('/api/companies', 'POST', { type: 'SUB_HOLDING', name: 'Agro', positions: [{ role: 'ADMIN_PT', name: 'X' }] }))
    expect(res.status).toBe(422)
    res = await companies.POST(req('/api/companies', 'POST', { type: 'SUB_HOLDING', name: 'Agro', parentId: 'pt-a' }))
    expect(res.status).toBe(422)
    expect(store.user.filter((u) => u.role === 'ADMIN_SUBHOLDING')).toHaveLength(0)
  })
})

describe('POST /api/companies — PT', () => {
  it('PT baru di bawah subholding tidak membuat akun apa pun', async () => {
    const before = store.user.length
    const res = await companies.POST(req('/api/companies', 'POST', { name: 'PT Baru Jaya', parentId: 'sh-energi' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accounts).toEqual([])
    expect(body.adminAccount).toBeUndefined()
    expect(store.user.length).toBe(before)
    expect(store.entity.find((e) => e.id === body.entity.id)).toMatchObject({ type: 'PT', parentId: 'sh-energi', path: '/holding/SH-ENERGI/PT-BARUJAYA/' })
  })

  it('PT boleh di bawah keturunan subholding (SECTOR), bukan di bawah PT', async () => {
    expect((await companies.POST(req('/api/companies', 'POST', { name: 'PT Dua', parentId: 'sector-1' }))).status).toBe(200)
    expect((await companies.POST(req('/api/companies', 'POST', { name: 'PT Tiga', parentId: 'pt-a' }))).status).toBe(422)
  })

  it('PT menolak posisi Admin subholding atau Supervisor', async () => {
    for (const role of ['ADMIN_SUBHOLDING', 'SUPERVISOR']) {
      const res = await companies.POST(req('/api/companies', 'POST', { name: 'PT Empat', positions: [{ role, name: 'Orang' }] }))
      expect(res.status).toBe(422)
    }
  })
})

describe('/api/companies/users — akun peran baru oleh Super Admin', () => {
  it.each(['SUPERVISOR', 'SUPERUSER', 'MANAJEMEN'])('membuat %s tanpa cakupan', async (role) => {
    const res = await companyUsers.POST(req('/api/companies/users', 'POST', { role, name: 'Bapak Uji', username: `uji.${role.toLowerCase()}`, entityId: null }))
    expect(res.status).toBe(200)
    const { account } = await res.json()
    expect(store.user.find((u) => u.id === account.id)).toMatchObject({ role, scopeEntityId: null, mustChangePassword: true })
  })

  it('SUPERVISOR yang dikirim dengan holding tetap tanpa cakupan; dengan PT/subholding ditolak', async () => {
    let res = await companyUsers.POST(req('/api/companies/users', 'POST', { role: 'SUPERVISOR', name: 'Sup', username: 'sup.satu', entityId: 'holding' }))
    expect(res.status).toBe(200)
    expect(store.user.find((u) => u.username === 'sup.satu')!.scopeEntityId).toBeNull()
    for (const entityId of ['pt-a', 'sh-energi']) {
      res = await companyUsers.POST(req('/api/companies/users', 'POST', { role: 'SUPERUSER', name: 'Superuser', username: `superuser.${entityId}`, entityId }))
      expect(res.status).toBe(422)
    }
  })

  it('ADMIN_SUBHOLDING wajib cakupan SUB_HOLDING', async () => {
    for (const entityId of [null, 'holding', 'pt-a']) {
      const res = await companyUsers.POST(req('/api/companies/users', 'POST', { role: 'ADMIN_SUBHOLDING', name: 'Adm', username: 'adm.salah', entityId }))
      expect(res.status).toBe(422)
      expect((await res.json()).error).toContain('subholding')
    }
    const ok = await companyUsers.POST(req('/api/companies/users', 'POST', { role: 'ADMIN_SUBHOLDING', name: 'Adm', username: 'admin.energi', entityId: 'sh-energi' }))
    expect(ok.status).toBe(200)
    expect(store.user.find((u) => u.username === 'admin.energi')).toMatchObject({ role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-energi' })
  })

  it('satu akun Admin subholding aktif per subholding', async () => {
    store.user.push({ id: 'adm-1', username: 'admin.energi', email: 'a@karya.co.id', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-energi', isActive: true })
    const res = await companyUsers.POST(req('/api/companies/users', 'POST', { role: 'ADMIN_SUBHOLDING', name: 'Adm 2', username: 'admin.energi.dua', entityId: 'sh-energi' }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('sudah punya akun Admin subholding')
  })

  it('PATCH: ubah ke ADMIN_SUBHOLDING di PT ditolak; pindah ke subholding diterima', async () => {
    store.user.push({ id: 'u-pt', username: 'admin.pta', email: 'admin.pta@karya.co.id', name: 'Admin A', role: 'ADMIN_PT', scopeEntityId: 'pt-a', isActive: true, phone: null })
    let res = await companyUsers.PATCH(req('/api/companies/users', 'PATCH', { id: 'u-pt', role: 'ADMIN_SUBHOLDING' }))
    expect(res.status).toBe(422)
    res = await companyUsers.PATCH(req('/api/companies/users', 'PATCH', { id: 'u-pt', role: 'ADMIN_SUBHOLDING', entityId: 'sh-energi' }))
    expect(res.status).toBe(200)
    expect(store.user.find((u) => u.id === 'u-pt')).toMatchObject({ role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-energi' })
  })

  it('PATCH: ubah ke SUPERVISOR melepas cakupan PT; memaksa PT ditolak', async () => {
    store.user.push({ id: 'u-x', username: 'admin.ptx', email: 'x@karya.co.id', name: 'X', role: 'ADMIN_PT', scopeEntityId: 'pt-a', isActive: true, phone: null })
    let res = await companyUsers.PATCH(req('/api/companies/users', 'PATCH', { id: 'u-x', role: 'SUPERVISOR', entityId: 'pt-a' }))
    expect(res.status).toBe(422)
    res = await companyUsers.PATCH(req('/api/companies/users', 'PATCH', { id: 'u-x', role: 'SUPERVISOR' }))
    expect(res.status).toBe(200)
    expect(store.user.find((u) => u.id === 'u-x')).toMatchObject({ role: 'SUPERVISOR', scopeEntityId: null })
  })
})

describe('aturan peran–tempat (lib)', () => {
  it('positionRolesFor & roleScopeProblem', () => {
    expect(positionRolesFor('SUB_HOLDING')).toEqual(['ADMIN_SUBHOLDING', 'DIREKTUR_ENTITAS'])
    expect(positionRolesFor(null)).toEqual(expect.arrayContaining(['SUPERVISOR', 'SUPERUSER', 'MANAJEMEN']))
    expect(positionRolesFor('PT')).not.toContain('SUPERVISOR')
    expect(positionRolesFor('PT')).not.toContain('ADMIN_SUBHOLDING')
    expect(roleScopeProblem('ADMIN_SUBHOLDING', { type: 'SUB_HOLDING' })).toBeNull()
    expect(roleScopeProblem('ADMIN_SUBHOLDING', { type: 'PT' })).not.toBeNull()
    expect(roleScopeProblem('MANAJEMEN', null)).toBeNull()
    expect(roleScopeProblem('MANAJEMEN', { type: 'PT' })).not.toBeNull()
    expect(roleScopeProblem('ADMIN_PT', { type: 'SUB_HOLDING' })).not.toBeNull()
  })
})
