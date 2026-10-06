import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/**
 * [F2-URUNGKAN] Alur ujung ke ujung dengan basis data di-mock: route tindakan
 * menerbitkan `undoToken` dengan snapshot keadaan sebelumnya, lalu
 * POST /api/undo memulihkannya.
 */

const mocks = vi.hoisted(() => ({
  user: { value: null as unknown },
  db: {
    escalation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    weeklyDivisionReport: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    unlockRequest: { count: vi.fn() },
    undoToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.user.value),
  scopeEntityIds: vi.fn(async () => null),
}))

import { POST as escalationAction } from '@/app/api/escalations/actions/route'
import { POST as inboxPost } from '@/app/api/inbox/route'
import { POST as undoPost } from '@/app/api/undo/route'

const db = mocks.db

const MANAJEMEN: SessionUser = {
  id: 'mgmt-1',
  name: 'Manajemen',
  email: 'm@contoh.test',
  role: 'MANAJEMEN',
  scopeEntityId: null,
  avatarColor: null,
  mustChangePassword: false,
}
const ADMIN: SessionUser = { ...MANAJEMEN, id: 'admin-1', name: 'Admin PT', role: 'ADMIN_PT', scopeEntityId: 'pt-a' }

const req = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

/** Simpan tiket yang diterbitkan agar bisa dibaca kembali oleh /api/undo. */
let issued: Record<string, unknown> | null = null

beforeEach(() => {
  for (const [k, g] of Object.entries(db)) {
    if (k === '$transaction') continue
    for (const f of Object.values(g as Record<string, ReturnType<typeof vi.fn>>)) f.mockReset()
  }
  issued = null
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  db.undoToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    issued = { id: 'tok-1', usedAt: null, createdAt: new Date(), ...data }
    return { id: 'tok-1' }
  })
  db.undoToken.findUnique.mockImplementation(async () => issued)
  db.undoToken.updateMany.mockResolvedValue({ count: 1 })
  db.unlockRequest.count.mockResolvedValue(0)
  db.auditLog.create.mockResolvedValue({})
})

describe('putuskan eskalasi lalu urungkan', () => {
  it('menerbitkan tiket dan memulihkan status DITINJAU tanpa keputusan', async () => {
    mocks.user.value = MANAJEMEN
    const before = {
      id: 'esc-1', entityId: 'pt-a', status: 'DITINJAU', raisedById: 'pic-1',
      decidedById: null, decidedAt: null, decisionText: null, updatedAt: new Date('2026-10-06T01:00:00Z'),
    }
    const after = {
      ...before, status: 'DIPUTUSKAN', decidedById: 'mgmt-1', decidedAt: new Date('2026-10-06T02:00:00Z'),
      decisionText: 'Anggaran disetujui untuk tahap dua', updatedAt: new Date('2026-10-06T02:00:00Z'),
    }
    db.escalation.findUnique.mockResolvedValue(before)
    db.escalation.update.mockResolvedValue(after)

    const res = await escalationAction(req('/api/escalations/actions', { action: 'decide', id: 'esc-1', decisionText: after.decisionText }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.undoToken).toBe('tok-1')
    expect(JSON.parse(String(issued!.snapshot))).toEqual({ status: 'DITINJAU', decidedById: null, decidedAt: null, decisionText: null })

    db.escalation.updateMany.mockResolvedValue({ count: 1 })
    const undo = await undoPost(req('/api/undo', { token: 'tok-1' }))
    expect(undo.status).toBe(200)
    expect((await undo.json()).message).toBe('Keputusan eskalasi diurungkan.')
    expect(db.escalation.updateMany).toHaveBeenCalledWith({
      where: { id: 'esc-1', status: 'DIPUTUSKAN', updatedAt: after.updatedAt },
      data: { status: 'DITINJAU', decidedById: null, decidedAt: null, decisionText: null },
    })
    expect(db.auditLog.create.mock.calls.at(-1)![0].data.action).toBe('UNDO_DECIDE_ESCALATION')
  })

  it('akun lain tidak bisa mengurungkan tiket itu', async () => {
    mocks.user.value = MANAJEMEN
    db.escalation.findUnique.mockResolvedValue({
      id: 'esc-1', entityId: 'pt-a', status: 'DIAJUKAN', raisedById: 'pic-1', decidedById: null, decidedAt: null, decisionText: null,
      updatedAt: new Date(),
    })
    db.escalation.update.mockResolvedValue({
      id: 'esc-1', entityId: 'pt-a', status: 'DITINJAU', decidedById: null, decidedAt: null, decisionText: null, updatedAt: new Date(),
    })
    await escalationAction(req('/api/escalations/actions', { action: 'review', id: 'esc-1' }))

    mocks.user.value = { ...MANAJEMEN, id: 'mgmt-2' }
    const undo = await undoPost(req('/api/undo', { token: 'tok-1' }))
    expect(undo.status).toBe(404)
    expect(db.escalation.updateMany).not.toHaveBeenCalled()
  })
})

describe('teruskan capaian mingguan lalu urungkan', () => {
  it('forwardedAt kembali kosong', async () => {
    mocks.user.value = ADMIN
    const forwardedAt = new Date('2026-10-06T03:00:00Z')
    db.weeklyDivisionReport.findUnique.mockResolvedValue({
      id: 'wr-1', entityId: 'pt-a', statusHeader: 'DISETUJUI', forwardedAt: null, forwardedById: null,
    })
    db.weeklyDivisionReport.update.mockResolvedValue({ id: 'wr-1', forwardedAt, forwardedById: 'admin-1', updatedAt: forwardedAt })

    const res = await inboxPost(req('/api/inbox', { kind: 'weekly', id: 'wr-1' }))
    expect((await res.json()).undoToken).toBe('tok-1')

    db.weeklyDivisionReport.updateMany.mockResolvedValue({ count: 1 })
    const undo = await undoPost(req('/api/undo', { token: 'tok-1' }))
    expect(undo.status).toBe(200)
    expect(db.weeklyDivisionReport.updateMany).toHaveBeenCalledWith({
      where: { id: 'wr-1', forwardedAt, updatedAt: forwardedAt },
      data: { forwardedById: null, forwardedAt: null },
    })
  })

  it('tiket yang tidak sah ditolak 400', async () => {
    mocks.user.value = ADMIN
    const undo = await undoPost(req('/api/undo', { token: 'x'.repeat(65) }))
    expect(undo.status).toBe(400)
  })
})
