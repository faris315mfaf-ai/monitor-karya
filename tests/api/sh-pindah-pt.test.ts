import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/*
 * [SH-PINDAH-PT] PATCH /api/companies { id, parentId } — Super Admin memindah PT
 * (atau SECTOR/REGION) ke subholding / keturunannya / holding. Path entitas dan
 * SEMUA keturunannya ditulis ulang (ganti awalan) dalam satu transaksi; siklus
 * dan tipe induk tidak sah ditolak 422; AuditLog MOVE_COMPANY; non-Super Admin 403.
 * Basis data palsu di memori; tidak ada koneksi DB.
 */

type Row = Record<string, unknown>
const store = vi.hoisted(() => ({
  entity: [] as Row[],
  auditLog: [] as Row[],
  subholdingReport: [] as Row[],
  me: {} as Row,
  seq: 0,
  locks: 0,
  txCount: 0,
}))

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
function table(name: 'entity' | 'auditLog' | 'subholdingReport') {
  const rows = () => store[name]
  return {
    findUnique: vi.fn(async ({ where, select }: { where: Row; select?: Row }) => pick(rows().find((r) => matches(r, where)), select)),
    findFirst: vi.fn(async ({ where, select }: { where: Row; select?: Row }) => pick(rows().find((r) => matches(r, where)), select)),
    findMany: vi.fn(async ({ where, select }: { where?: Row; select?: Row } = {}) => rows().filter((r) => matches(r, where)).map((r) => pick(r, select))),
    count: vi.fn(async ({ where }: { where?: Row } = {}) => rows().filter((r) => matches(r, where)).length),
    create: vi.fn(async ({ data, select }: { data: Row; select?: Row }) => {
      const row = { id: `${name}-${++store.seq}`, ...data }
      rows().push(row)
      return pick(row, select)
    }),
    update: vi.fn(async ({ where, data, select }: { where: Row; data: Row; select?: Row }) => {
      const row = rows().find((r) => matches(r, where))!
      Object.assign(row, data)
      return pick(row, select)
    }),
  }
}

const db = vi.hoisted(() => ({}) as Record<string, unknown>)
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: async () => store.me }))
vi.mock('@/lib/password', () => ({ hashPassword: async (p: string) => `hash:${p}` }))

import * as companies from '@/app/api/companies/route'
import { childPath, lastPathSegment, rebasePath } from '@/lib/companies'

const patch = (body: unknown) =>
  companies.PATCH(
    new NextRequest('http://localhost/api/companies', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
      body: JSON.stringify(body),
    })
  )

const ent = (id: string) => store.entity.find((e) => e.id === id)!

beforeEach(() => {
  store.seq = 0
  store.locks = 0
  store.txCount = 0
  store.entity = [
    { id: 'holding', type: 'HOLDING', code: 'HOLDING-01', name: 'PT BIKE Tbk', path: '/holding/', parentId: null, isActive: true },
    { id: 'sh-energi', type: 'SUB_HOLDING', code: 'SH-ENERGI', name: 'Karya Energi', path: '/holding/SH-ENERGI/', parentId: 'holding', isActive: true },
    { id: 'sh-agro', type: 'SUB_HOLDING', code: 'SH-AGRO', name: 'Karya Agro', path: '/holding/SH-AGRO/', parentId: 'holding', isActive: true },
    { id: 'sh-mati', type: 'SUB_HOLDING', code: 'SH-MATI', name: 'Subholding Lama', path: '/holding/SH-MATI/', parentId: 'holding', isActive: false },
    { id: 'sector-1', type: 'SECTOR', code: 'S-MIGAS', name: 'Sektor Migas', path: '/holding/SH-ENERGI/S-MIGAS/', parentId: 'sh-energi', isActive: true },
    // PT lama langsung di bawah holding, punya keturunan (UNIT) dua tingkat.
    { id: 'pt-lama', type: 'PT', code: 'PT-LAMA', name: 'PT Lama', path: '/holding/PT-LAMA/', parentId: 'holding', isActive: true },
    { id: 'unit-1', type: 'UNIT', code: 'U-1', name: 'Unit 1', path: '/holding/PT-LAMA/U-1/', parentId: 'pt-lama', isActive: true },
    { id: 'unit-2', type: 'UNIT', code: 'U-2', name: 'Unit 2', path: '/holding/PT-LAMA/U-1/U-2/', parentId: 'unit-1', isActive: true },
    // Path mirip awalan tetapi BUKAN keturunan ("PT-LAMA2" diawali "PT-LAMA" tanpa "/").
    { id: 'pt-lama2', type: 'PT', code: 'PT-LAMA2', name: 'PT Lama 2', path: '/holding/PT-LAMA2/', parentId: 'holding', isActive: true },
    { id: 'pt-energi', type: 'PT', code: 'PT-E', name: 'PT E', path: '/holding/SH-ENERGI/PT-E/', parentId: 'sh-energi', isActive: true },
  ]
  store.auditLog = []
  store.subholdingReport = [
    { id: 'r1', subholdingId: 'sh-energi', ptId: 'pt-energi', status: 'DISETUJUI' },
    { id: 'r2', subholdingId: 'sh-energi', ptId: 'pt-energi', status: 'MENUNGGU' },
  ]
  store.me = { id: 'sa', role: 'SUPERADMIN', scopeEntityId: null }
  Object.assign(db, {
    entity: table('entity'),
    auditLog: table('auditLog'),
    subholdingReport: table('subholdingReport'),
    $queryRaw: vi.fn(async () => {
      store.locks++
      return []
    }),
  })
  // Transaksi: salinan data dipulihkan bila callback melempar (meniru rollback).
  ;(db as Record<string, unknown>).$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    store.txCount++
    const snapshot = JSON.parse(JSON.stringify({ entity: store.entity, auditLog: store.auditLog }))
    try {
      return await fn(db)
    } catch (err) {
      store.entity = snapshot.entity
      store.auditLog = snapshot.auditLog
      throw err
    }
  })
})

describe('helper path', () => {
  it('rebasePath mengganti awalan hanya untuk subpohon', () => {
    expect(rebasePath('/h/PT-A/U/', '/h/PT-A/', '/h/SH/PT-A/')).toBe('/h/SH/PT-A/U/')
    expect(rebasePath('/h/PT-B/', '/h/PT-A/', '/h/SH/PT-A/')).toBe('/h/PT-B/')
    expect(lastPathSegment('/h/SH/PT-A/')).toBe('PT-A')
    expect(lastPathSegment('')).toBe('')
    expect(childPath('/h/SH', 'PT-A')).toBe('/h/SH/PT-A/')
  })
})

describe('PATCH /api/companies — pindah induk', () => {
  it('memindah PT dari holding ke subholding beserta seluruh keturunannya', async () => {
    const res = await patch({ id: 'pt-lama', parentId: 'sh-agro' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, moved: true, descendants: 2, from: { parentId: 'holding' }, to: { parentId: 'sh-agro', parentName: 'Karya Agro' } })

    expect(ent('pt-lama')).toMatchObject({ parentId: 'sh-agro', path: '/holding/SH-AGRO/PT-LAMA/' })
    expect(ent('unit-1').path).toBe('/holding/SH-AGRO/PT-LAMA/U-1/')
    expect(ent('unit-2').path).toBe('/holding/SH-AGRO/PT-LAMA/U-1/U-2/')
    // parentId keturunan tidak berubah; tetangga berawalan mirip tidak tersentuh.
    expect(ent('unit-1').parentId).toBe('pt-lama')
    expect(ent('pt-lama2').path).toBe('/holding/PT-LAMA2/')

    const audit = store.auditLog.filter((a) => a.action === 'MOVE_COMPANY')
    expect(audit).toHaveLength(1)
    expect(JSON.parse(audit[0].beforeData as string)).toMatchObject({ parentId: 'holding', parentName: 'PT BIKE Tbk', path: '/holding/PT-LAMA/' })
    expect(JSON.parse(audit[0].afterData as string)).toMatchObject({ parentId: 'sh-agro', parentName: 'Karya Agro', path: '/holding/SH-AGRO/PT-LAMA/', descendants: 2 })
    expect(store.auditLog.some((a) => a.action === 'UPDATE_COMPANY')).toBe(false)
    // Satu transaksi + kunci akar pohon.
    expect(store.txCount).toBe(1)
    expect(store.locks).toBe(1)
  })

  it('boleh memindah ke keturunan subholding (SECTOR) dan kembali ke holding', async () => {
    const a = await patch({ id: 'pt-lama', parentId: 'sector-1' })
    expect(a.status).toBe(200)
    expect(ent('pt-lama').path).toBe('/holding/SH-ENERGI/S-MIGAS/PT-LAMA/')
    expect(ent('unit-2').path).toBe('/holding/SH-ENERGI/S-MIGAS/PT-LAMA/U-1/U-2/')

    const b = await patch({ id: 'pt-lama', parentId: 'holding' })
    expect(b.status).toBe(200)
    expect(ent('pt-lama')).toMatchObject({ parentId: 'holding', path: '/holding/PT-LAMA/' })
    expect(ent('unit-2').path).toBe('/holding/PT-LAMA/U-1/U-2/')
  })

  it('SECTOR bisa dipindah beserta PT di bawahnya', async () => {
    const res = await patch({ id: 'sector-1', parentId: 'sh-agro' })
    expect(res.status).toBe(200)
    expect(ent('sector-1').path).toBe('/holding/SH-AGRO/S-MIGAS/')
  })

  it('laporan subholding lama tetap milik subholding lamanya (ptId tetap sah)', async () => {
    const res = await patch({ id: 'pt-energi', parentId: 'sh-agro' })
    expect(res.status).toBe(200)
    expect((await res.json()).subholdingReports).toEqual({ kept: 2, open: 1 })
    expect(store.subholdingReport.every((r) => r.subholdingId === 'sh-energi' && r.ptId === 'pt-energi')).toBe(true)
  })

  it('induk sama = tanpa perubahan dan tanpa AuditLog', async () => {
    const res = await patch({ id: 'pt-lama', parentId: 'holding' })
    expect(res.status).toBe(200)
    expect((await res.json()).moved).toBe(false)
    expect(ent('pt-lama').path).toBe('/holding/PT-LAMA/')
    expect(store.auditLog).toHaveLength(0)
  })

  it('pindah sekaligus ubah nama dalam satu transaksi', async () => {
    const res = await patch({ id: 'pt-lama', parentId: 'sh-agro', name: 'PT Lama Baru' })
    expect(res.status).toBe(200)
    expect(ent('pt-lama')).toMatchObject({ name: 'PT Lama Baru', parentId: 'sh-agro' })
    expect(store.auditLog.map((a) => a.action).sort()).toEqual(['MOVE_COMPANY', 'UPDATE_COMPANY'])
  })

  it('menolak siklus: induk = diri sendiri atau keturunannya (422), tanpa menulis apa pun', async () => {
    const before = JSON.stringify(store.entity)
    const self = await patch({ id: 'sector-1', parentId: 'sector-1' })
    expect(self.status).toBe(422)

    // Keturunan SECTOR yang juga SECTOR/REGION.
    store.entity.push({ id: 'region-x', type: 'REGION', code: 'R-X', name: 'Wilayah X', path: '/holding/SH-ENERGI/S-MIGAS/R-X/', parentId: 'sector-1', isActive: true })
    const desc = await patch({ id: 'sector-1', parentId: 'region-x' })
    expect(desc.status).toBe(422)
    expect((await desc.json()).error).toMatch(/di bawah perusahaan ini/)

    // Path tidak konsisten (data lama): siklus tetap tertangkap lewat rantai parentId.
    store.entity.push({ id: 'region-y', type: 'REGION', code: 'R-Y', name: 'Wilayah Y', path: '/lain/R-Y/', parentId: 'region-x', isActive: true })
    const chain = await patch({ id: 'sector-1', parentId: 'region-y' })
    expect(chain.status).toBe(422)

    store.entity = store.entity.filter((e) => e.id !== 'region-x' && e.id !== 'region-y')
    expect(JSON.stringify(store.entity)).toBe(before)
    expect(store.auditLog).toHaveLength(0)
  })

  it('menolak tipe induk tidak sah (PT/UNIT), induk tak dikenal, dan induk nonaktif (422)', async () => {
    for (const parentId of ['pt-energi', 'unit-1', 'tidak-ada', 'sh-mati']) {
      const res = await patch({ id: 'pt-lama', parentId })
      expect(res.status, parentId).toBe(422)
    }
    const empty = await patch({ id: 'pt-lama', parentId: '' })
    expect(empty.status).toBe(422)
    expect(ent('pt-lama').path).toBe('/holding/PT-LAMA/')
    expect(store.auditLog).toHaveLength(0)
  })

  it('subholding/holding tidak bisa dipindah (422); entitas tak dikenal 404', async () => {
    expect((await patch({ id: 'sh-energi', parentId: 'holding' })).status).toBe(422)
    expect((await patch({ id: 'holding', parentId: 'sh-energi' })).status).toBe(422)
    expect((await patch({ id: 'tidak-ada', parentId: 'sh-agro' })).status).toBe(404)
    // UNIT tidak termasuk jenis yang dikelola meja perusahaan.
    expect((await patch({ id: 'unit-1', parentId: 'sh-agro' })).status).toBe(404)
  })

  it('path tujuan bentrok dengan entitas lain → 409', async () => {
    store.entity.push({ id: 'pt-hantu', type: 'PT', code: 'PT-HANTU', name: 'Hantu', path: '/holding/SH-AGRO/PT-LAMA/', parentId: 'sh-agro', isActive: true })
    const res = await patch({ id: 'pt-lama', parentId: 'sh-agro' })
    expect(res.status).toBe(409)
    expect(ent('pt-lama').path).toBe('/holding/PT-LAMA/')
  })

  it.each(['ADMIN_PT', 'ADMIN_SUBHOLDING', 'SUPERVISOR', 'TI', 'DIREKTUR_ENTITAS'])('%s ditolak 403', async (role) => {
    store.me = { id: 'x', role, scopeEntityId: role === 'ADMIN_PT' ? 'pt-lama' : null }
    const res = await patch({ id: 'pt-lama', parentId: 'sh-agro' })
    expect(res.status).toBe(403)
    expect(ent('pt-lama').path).toBe('/holding/PT-LAMA/')
    expect(store.txCount).toBe(0)
  })
})
