import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * F1-C: revertExpiredAccess mengembalikan Division.headUserId yang diubah
 * applyRoleChange saat akses sementara disetujui (appliedData.heads).
 */

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    db: {
      accessRequest: { findMany: fn(), update: fn() },
      user: { findUnique: fn(), update: fn(), count: fn() },
      division: { findUnique: fn(), update: fn() },
      auditLog: { create: fn() },
      $transaction: fn(),
    },
  }
})
vi.mock('@/lib/db', () => ({ db: mocks.db }))

import { readHeads, revertExpiredAccess } from '@/lib/access-requests'

const db = mocks.db

beforeEach(() => {
  for (const group of [db.accessRequest, db.user, db.division, db.auditLog]) {
    for (const m of Object.values(group)) m.mockReset().mockResolvedValue({})
  }
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
})

function due(applied: Record<string, unknown>) {
  db.accessRequest.findMany.mockResolvedValue([{ id: 'ar-1', targetUserId: 'u-temp', appliedData: JSON.stringify(applied) }])
}

describe('revertExpiredAccess', () => {
  it('mengembalikan peran dan kepala divisi lama', async () => {
    due({ role: 'PIC_PROYEK', isActive: true, grantedRole: 'KEPALA_DIVISI', heads: [{ divisionId: 'div-a', from: 'u-kadiv-lama', to: 'u-temp' }] })
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'u-temp'
        ? { id: 'u-temp', name: 'Temp', role: 'KEPALA_DIVISI', scopeEntityId: 'pt-a', isActive: true }
        : { id: where.id }
    )
    db.division.findUnique.mockResolvedValue({ headUserId: 'u-temp' })

    expect(await revertExpiredAccess(new Date('2026-10-06T10:00:00Z'))).toBe(1)
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u-temp' }, data: { role: 'PIC_PROYEK' } })
    expect(db.division.update).toHaveBeenCalledWith({ where: { id: 'div-a' }, data: { headUserId: 'u-kadiv-lama' } })
    const after = JSON.parse(db.auditLog.create.mock.calls[0][0].data.afterData)
    expect(after.heads).toEqual([{ divisionId: 'div-a', from: 'u-temp', to: 'u-kadiv-lama' }])
  })

  it('divisi yang sudah diubah orang lain sejak itu dibiarkan', async () => {
    due({ role: 'PIC_PROYEK', grantedRole: 'KEPALA_DIVISI', heads: [{ divisionId: 'div-a', from: 'u-kadiv-lama', to: 'u-temp' }] })
    db.user.findUnique.mockResolvedValue({ id: 'u-temp', name: 'Temp', role: 'KEPALA_DIVISI', scopeEntityId: 'pt-a', isActive: true })
    db.division.findUnique.mockResolvedValue({ headUserId: 'u-orang-lain' })

    await revertExpiredAccess()
    expect(db.division.update).not.toHaveBeenCalled()
  })

  it('kepala lama yang sudah dihapus tidak dipasang kembali', async () => {
    due({ role: 'PIC_PROYEK', grantedRole: 'KEPALA_DIVISI', heads: [{ divisionId: 'div-a', from: 'u-hilang', to: 'u-temp' }] })
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'u-temp' ? { id: 'u-temp', name: 'Temp', role: 'KEPALA_DIVISI', scopeEntityId: 'pt-a', isActive: true } : null
    )
    db.division.findUnique.mockResolvedValue({ headUserId: 'u-temp' })

    await revertExpiredAccess()
    expect(db.division.update).not.toHaveBeenCalled()
  })

  it('baris lama tanpa heads tetap dicabut seperti sebelumnya', async () => {
    due({ role: 'PIC_PROYEK', isActive: false, grantedRole: null })
    db.user.findUnique.mockResolvedValue({ id: 'u-temp', name: 'Temp', role: 'PIC_PROYEK', scopeEntityId: 'pt-a', isActive: true })

    expect(await revertExpiredAccess()).toBe(1)
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u-temp' }, data: { isActive: false } })
    expect(db.division.findUnique).not.toHaveBeenCalled()
  })
})

describe('readHeads', () => {
  it('hanya entri utuh yang dipakai', () => {
    expect(readHeads(undefined)).toEqual([])
    expect(readHeads('x')).toEqual([])
    expect(readHeads([{ divisionId: 'd', from: null, to: 'u' }, { divisionId: 1 }, null])).toEqual([{ divisionId: 'd', from: null, to: 'u' }])
  })
})
