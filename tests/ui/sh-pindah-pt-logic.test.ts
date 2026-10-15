import { describe, expect, it } from 'vitest'

/**
 * [SH-PINDAH-PT] Logika murni sheet "Pindahkan ke subholding": PT mana yang
 * bisa dipindah, pilihan induk tujuan, dan pesan sukses.
 */

import type { Company } from '@/lib/accounts'
import { canMoveCompany, moveSuccessText, moveTargets } from '@/components/companies/subholding'

const co = (id: string, type: string, parentId: string | null, extra: Partial<Company> = {}): Company =>
  ({
    id, code: id.toUpperCase(), name: `Nama ${id}`, type, parentId, parentName: null, logoData: null, address: null, phone: null, email: null,
    website: null, isActive: true, users: [], divisions: [], projects: [], counts: { users: 0, divisions: 0, projects: 0, dailyReports: 0, weeklyReports: 0 },
    ...extra,
  }) as unknown as Company

const list = [
  co('bike', 'HOLDING', null),
  co('energi', 'SUB_HOLDING', 'bike'),
  co('agro', 'SUB_HOLDING', 'bike', { name: 'Agro' } as Partial<Company>),
  co('mati', 'SUB_HOLDING', 'bike', { isActive: false }),
  co('pt-lama', 'PT', 'bike'),
  co('pt-e', 'PT', 'energi'),
]

describe('canMoveCompany', () => {
  it('hanya PT', () => {
    expect(canMoveCompany(co('x', 'PT', 'bike'))).toBe(true)
    expect(canMoveCompany(co('x', 'SUB_HOLDING', 'bike'))).toBe(false)
    expect(canMoveCompany(co('x', 'HOLDING', null))).toBe(false)
    expect(canMoveCompany(null)).toBe(false)
  })
})

describe('moveTargets', () => {
  it('PT langsung di holding: subholding aktif (urut nama) saja, holding sekarang tidak ditawarkan', () => {
    const t = moveTargets(list, list[4])
    expect(t.map((x) => x.id)).toEqual(['agro', 'energi'])
    expect(t.every((x) => x.kind === 'subholding')).toBe(true)
  })

  it('PT di subholding: subholding lain lalu holding; induk sekarang dan subholding nonaktif tidak ditawarkan', () => {
    const t = moveTargets(list, list[5])
    expect(t.map((x) => `${x.kind}:${x.id}`)).toEqual(['subholding:agro', 'holding:bike'])
  })
})

describe('moveSuccessText', () => {
  it('menyebut laporan terbuka yang tetap milik subholding lama', () => {
    expect(moveSuccessText({ pt: 'PT A', to: 'Agro' })).toBe('PT A dipindah ke Agro.')
    expect(moveSuccessText({ pt: 'PT A', to: 'Agro', open: 2 })).toBe('PT A dipindah ke Agro. 2 laporan yang masih terbuka tetap milik subholding lamanya.')
  })
})
