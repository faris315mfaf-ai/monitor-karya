import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/**
 * [T11-DB] Aksi eskalasi atomik: ubah status + audit satu transaksi, pembaruan
 * bersyarat pada status yang dibaca (tinjau vs putuskan bersamaan → 409), dan
 * pengajuan baru (cek duplikat + create + back-link task + audit) satu transaksi.
 */

const mocks = vi.hoisted(() => ({
  user: { value: null as unknown },
  db: {
    escalation: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    task: { findUnique: vi.fn(), update: vi.fn() },
    undoToken: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.user.value),
  scopeEntityIds: vi.fn(async () => null),
}))

import { POST } from '@/app/api/escalations/actions/route'

const db = mocks.db
const DIREKTUR = { id: 'dir-1', name: 'Direktur', email: 'd@x.test', role: 'DIREKTUR_ENTITAS', scopeEntityId: 'pt-a', avatarColor: null, mustChangePassword: false } as SessionUser
const PIC = { ...DIREKTUR, id: 'pic-1', role: 'PIC_PROYEK' } as SessionUser

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/escalations/actions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  for (const [k, g] of Object.entries(db)) {
    if (k.startsWith('$')) continue
    for (const f of Object.values(g as Record<string, ReturnType<typeof vi.fn>>)) f.mockReset()
  }
  db.$queryRaw.mockReset().mockResolvedValue([])
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  db.auditLog.create.mockResolvedValue({})
  db.undoToken.create.mockResolvedValue({ id: 'tok' })
})

describe('tinjau eskalasi', () => {
  const row = { id: 'esc-1', entityId: 'pt-a', status: 'DIAJUKAN', raisedById: 'pic-1', decidedById: null, decidedAt: null, decisionText: null, updatedAt: new Date() }

  it('pembaruan bersyarat pada status yang dibaca, audit dalam transaksi', async () => {
    mocks.user.value = DIREKTUR
    db.escalation.findUnique.mockResolvedValue(row)
    db.escalation.update.mockResolvedValue({ ...row, status: 'DITINJAU' })
    const res = await POST(req({ action: 'review', id: 'esc-1' }))
    expect(res.status).toBe(200)
    expect(db.$transaction).toHaveBeenCalled()
    expect(db.escalation.update).toHaveBeenCalledWith({ where: { id: 'esc-1', status: 'DIAJUKAN' }, data: { status: 'DITINJAU' } })
    expect(db.auditLog.create).toHaveBeenCalled()
  })

  it('status sudah diubah aksi lain (P2025): 409 dan tanpa audit', async () => {
    mocks.user.value = DIREKTUR
    db.escalation.findUnique.mockResolvedValue(row)
    db.escalation.update.mockRejectedValue(Object.assign(new Error('x'), { code: 'P2025' }))
    const res = await POST(req({ action: 'review', id: 'esc-1' }))
    expect(res.status).toBe(409)
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('ajukan eskalasi', () => {
  const body = { action: 'raise', sourceType: 'TASK', sourceId: 'tsk-1', summary: 'Besi tulangan belum datang dari pemasok', needed: 'KEPUTUSAN' }
  const task = { entityId: 'pt-a', escalationId: null, project: { picUserId: 'pic-1' } }

  it('cek duplikat, create, back-link task, dan audit dalam satu transaksi dengan kunci baris sumber', async () => {
    mocks.user.value = PIC
    db.task.findUnique.mockResolvedValue(task)
    db.escalation.findFirst.mockResolvedValue(null)
    db.escalation.create.mockResolvedValue({ id: 'esc-9' })
    db.task.update.mockResolvedValue({})
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.$queryRaw).toHaveBeenCalled()
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: 'tsk-1' }, data: { escalationId: 'esc-9' } })
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('CREATE_ESCALATION')
  })

  it('eskalasi berjalan sudah ada saat kunci didapat: 409 tanpa membuat baris', async () => {
    mocks.user.value = PIC
    db.task.findUnique.mockResolvedValue(task)
    db.escalation.findFirst.mockResolvedValue({ id: 'esc-lama' })
    const res = await POST(req(body))
    expect(res.status).toBe(409)
    expect(db.escalation.create).not.toHaveBeenCalled()
  })
})
