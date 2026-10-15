import { describe, expect, it } from 'vitest'

/**
 * Meja Super Admin untuk model subholding (kontrak 16 Okt 2026, papan 10):
 * pohon PT BIKE Tbk → subholding → PT, posisi per penempatan (cermin
 * roleScopeProblem di API), dan teks kredensial Admin subholding.
 */

import type { Company, UserRow } from '@/lib/accounts'
import {
  credentialText, entityKindLabel, placementProblem, positionsForPlacement, previewAdminUsername, subholdingTree,
} from '@/components/companies/subholding'

const user = (id: string, role: string, extra: Partial<UserRow> = {}): UserRow => ({
  id, name: id, username: id, email: `${id}@x`, role, title: null, phone: null, isActive: true, lastLoginAt: null, avatarColor: null,
  hasPassword: true, scopeEntityId: null, divisionId: null, divisionName: null, projectId: null, projectName: null, ...extra,
})

const co = (id: string, type: string, parentId: string | null, users: UserRow[] = []): Company =>
  ({
    id, code: id.toUpperCase(), name: `Nama ${id}`, type, parentId, parentName: null, logoData: null, address: null, phone: null, email: null,
    website: null, isActive: true, users, divisions: [], projects: [], counts: { users: users.length, divisions: 0, projects: 0, dailyReports: 0, weeklyReports: 0 },
  }) as unknown as Company

describe('subholdingTree', () => {
  const list = [
    co('bike', 'HOLDING', null),
    co('energi', 'SUB_HOLDING', 'bike', [user('admin.energi', 'ADMIN_SUBHOLDING')]),
    co('agro', 'SUB_HOLDING', 'bike'),
    co('pt1', 'PT', 'energi'),
    co('pt2', 'PT', 'energi'),
    co('pt3', 'PT', 'agro'),
    co('pt4', 'PT', 'bike'),
  ]
  it('PT bersarang di subholding-nya, PT langsung di holding terpisah', () => {
    const [h] = subholdingTree(list)
    expect(h.holding.id).toBe('bike')
    expect(h.subholdings.map((s) => s.subholding.id)).toEqual(['agro', 'energi'])
    expect(h.subholdings[1].pts.map((p) => p.id)).toEqual(['pt1', 'pt2'])
    expect(h.subholdings[1].admins.map((u) => u.id)).toEqual(['admin.energi'])
    expect(h.directPts.map((p) => p.id)).toEqual(['pt4'])
  })
  it('label jenis entitas', () => {
    expect(entityKindLabel({ type: 'HOLDING' })).toBe('Holding')
    expect(entityKindLabel({ type: 'SUB_HOLDING' })).toBe('Subholding')
    expect(entityKindLabel({ type: 'PT' })).toBe('Anak perusahaan')
  })
})

describe('positionsForPlacement', () => {
  const roles = (c: { type: string } | null) => positionsForPlacement(c).map((o) => o.role)
  it('subholding hanya menampung Admin subholding (dan Direktur)', () => {
    expect(roles({ type: 'SUB_HOLDING' })).toEqual(['ADMIN_SUBHOLDING', 'DIREKTUR_ENTITAS'])
  })
  it('tingkat grup memuat Supervisor, Superuser, Manajemen berlabel Indonesia', () => {
    const opts = positionsForPlacement(null)
    for (const [role, label] of [['SUPERVISOR', 'Supervisor'], ['SUPERUSER', 'Superuser'], ['MANAJEMEN', 'Manajemen']]) {
      expect(opts.find((o) => o.role === role)?.label).toBe(label)
    }
    expect(opts.some((o) => o.role === 'ADMIN_SUBHOLDING')).toBe(false)
  })
  it('PT tidak menawarkan peran tingkat grup', () => {
    expect(roles({ type: 'PT' })).not.toContain('SUPERVISOR')
    expect(roles({ type: 'PT' })).not.toContain('ADMIN_SUBHOLDING')
  })
  it('daftar peran yang diizinkan meja tetap dihormati', () => {
    expect(positionsForPlacement({ type: 'SUB_HOLDING' }, ['ADMIN_PT']).map((o) => o.role)).toEqual([])
  })
  it('placementProblem: Admin subholding wajib di subholding, peran grup tanpa perusahaan', () => {
    expect(placementProblem('ADMIN_SUBHOLDING', null)).toMatch(/subholding/)
    expect(placementProblem('ADMIN_SUBHOLDING', { type: 'SUB_HOLDING' })).toBeNull()
    expect(placementProblem('SUPERVISOR', { type: 'PT' })).toMatch(/tidak ditempatkan/)
    expect(placementProblem('SUPERVISOR', null)).toBeNull()
  })
})

describe('kredensial Admin subholding', () => {
  it('teks salin memuat username, sandi awal, dan catatan wajib ganti sandi', () => {
    const t = credentialText({ subholding: 'Subholding Energi', username: 'admin.energi', password: '12345678' })
    expect(t).toContain('admin.energi')
    expect(t).toContain('12345678')
    expect(t).toMatch(/Wajib ganti sandi/)
  })
  it('pratinjau username mengikuti pola admin.<slug>', () => {
    expect(previewAdminUsername('Subholding Energi')).toBe('admin.energi')
    expect(previewAdminUsername('PT Agro Lestari')).toBe('admin.agrolestari')
    expect(previewAdminUsername('')).toBe('admin.<nama>')
  })
})
