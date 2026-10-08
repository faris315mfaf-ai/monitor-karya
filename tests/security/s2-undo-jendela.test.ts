import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth'

/**
 * T2-S2 — audit undo (src/lib/undo.ts): jendela 15 menit di nilai batas,
 * klaim tiket saat replay bersamaan, dan kapabilitas yang dicabut setelah
 * tiket terbit. Basis data di-mock; tanpa koneksi keluar.
 */

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    reach: { value: null as string[] | null },
    db: {
      undoToken: { findUnique: fn(), updateMany: fn(), create: fn() },
      escalation: { updateMany: fn() },
      dailyProjectReport: { updateMany: fn(), count: fn() },
      weeklyDivisionReport: { updateMany: fn() },
      unlockRequest: { count: fn() },
      project: { findUnique: fn(), updateMany: fn() },
      projectApproval: { deleteMany: fn(), createMany: fn(), update: fn() },
      task: { count: fn() },
      auditLog: { create: fn() },
      $transaction: fn(),
    },
  }
})
vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({ scopeEntityIds: vi.fn(async () => mocks.reach.value) }))

import { UNDO_WINDOW_MS, applyUndo } from '@/lib/undo'

const db = mocks.db

const ACTOR: SessionUser = {
  id: 'mgr-1',
  name: 'Manajer',
  email: 'mgr@contoh.test',
  role: 'MANAJEMEN',
  scopeEntityId: null,
  avatarColor: null,
  mustChangePassword: false,
}

const ISSUED = new Date('2026-10-08T07:55:00Z')

function token(over: Record<string, unknown> = {}) {
  return {
    id: 'tok-s2',
    action: 'DECIDE_ESCALATION',
    targetType: 'ESCALATION',
    targetId: 'esc-1',
    entityId: 'pt-a',
    actorId: 'mgr-1',
    snapshot: JSON.stringify({ status: 'DITINJAU', decidedById: null, decidedAt: null, decisionText: null }),
    stamp: JSON.stringify({ status: 'DIPUTUSKAN', updatedAt: '2026-10-08T07:55:00.000Z' }),
    expiresAt: new Date(ISSUED.getTime() + UNDO_WINDOW_MS),
    usedAt: null as Date | null,
    createdAt: ISSUED,
    ...over,
  }
}

let current: ReturnType<typeof token>

beforeEach(() => {
  mocks.reach.value = null
  for (const [k, group] of Object.entries(db)) {
    if (k === '$transaction') continue
    for (const m of Object.values(group as Record<string, ReturnType<typeof vi.fn>>)) m.mockReset().mockResolvedValue({ count: 1 })
  }
  db.unlockRequest.count.mockResolvedValue(0)
  db.task.count.mockResolvedValue(0)
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  current = token()
  db.undoToken.findUnique.mockImplementation(async () => current)
})

describe('S2 undo — jendela 15 menit di nilai batas', () => {
  it('menit ke-14 detik ke-59 masih boleh; tepat 15 menit ditolak 409', async () => {
    const justBefore = new Date(ISSUED.getTime() + UNDO_WINDOW_MS - 1_000)
    const atEdge = new Date(ISSUED.getTime() + UNDO_WINDOW_MS)
    const before = await applyUndo(ACTOR, 'tok-s2', undefined, justBefore)
    expect(before.ok).toBe(true)
    current = token() // tiket segar (sebelumnya sudah terpakai)
    const edge = await applyUndo(ACTOR, 'tok-s2', undefined, atEdge)
    expect(edge).toMatchObject({ ok: false, status: 409 })
  })
})

describe('S2 undo — klaim tiket dan replay', () => {
  it('dua applyUndo bersamaan pada tiket sama: tepat satu yang berhasil', async () => {
    // Transaksi tereksekusi seketika; klaim kedua kalah (count 0) seperti
    // updateMany bersyarat di PostgreSQL sungguhan.
    db.undoToken.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    const results = await Promise.all([
      applyUndo(ACTOR, 'tok-s2', undefined, new Date(ISSUED.getTime() + 60_000)),
      applyUndo(ACTOR, 'tok-s2', undefined, new Date(ISSUED.getTime() + 60_000)),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.status === 409)).toHaveLength(1)
    expect(db.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('replay setelah sukses ditolak dan tidak menulis audit kedua', async () => {
    db.undoToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 })
    expect((await applyUndo(ACTOR, 'tok-s2', undefined, new Date(ISSUED.getTime() + 60_000))).ok).toBe(true)
    current = { ...current, usedAt: new Date(ISSUED.getTime() + 120_000) }
    const replay = await applyUndo(ACTOR, 'tok-s2', undefined, new Date(ISSUED.getTime() + 180_000))
    expect(replay).toMatchObject({ ok: false, status: 409 })
    expect(db.auditLog.create).toHaveBeenCalledTimes(1)
  })
})

describe('S2 undo — kapabilitas dan cakupan diperiksa ulang saat urungkan', () => {
  it('peran yang kehilangan escalation:decide setelah tiket terbit ditolak 403', async () => {
    const demoted: SessionUser = { ...ACTOR, role: 'AUDITOR' }
    const refused = await applyUndo(demoted, 'tok-s2', undefined, new Date(ISSUED.getTime() + 60_000))
    expect(refused).toMatchObject({ ok: false, status: 403 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('PT sasaran di luar cakupan pelaku saat ini ditolak 403 sebelum transaksi', async () => {
    // Cakupan masih memuat pt-a: boleh.
    mocks.reach.value = ['pt-a', 'pt-b']
    const allowed = await applyUndo(ACTOR, 'tok-s2', undefined, new Date(ISSUED.getTime() + 60_000))
    expect(allowed.ok).toBe(true)
    // Cakupan menyempit ke PT lain: tiket pt-a tidak lagi boleh diurungkan.
    mocks.reach.value = ['pt-b']
    db.$transaction.mockClear()
    const refused = await applyUndo(ACTOR, 'tok-s2', undefined, new Date(ISSUED.getTime() + 60_000))
    expect(refused).toMatchObject({ ok: false, status: 403 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
