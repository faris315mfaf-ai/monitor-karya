import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth'

/**
 * [F2-URUNGKAN] applyUndo: jendela 15 menit, hanya pelaku yang sama, sekali
 * pakai, pemulihan persis dari snapshot, dan penolakan bila keadaan sudah
 * diubah orang lain. Basis data di-mock; tidak ada koneksi keluar.
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

import { UNDO_WINDOW_MS, applyUndo, issueUndo } from '@/lib/undo'

const db = mocks.db

const ADMIN: SessionUser = {
  id: 'admin-1',
  name: 'Admin PT',
  email: 'admin@contoh.test',
  role: 'ADMIN_PT',
  scopeEntityId: 'pt-a',
  avatarColor: null,
  mustChangePassword: false,
}
const MANAJEMEN: SessionUser = { ...ADMIN, id: 'mgmt-1', name: 'Manajemen', role: 'MANAJEMEN', scopeEntityId: null }

const NOW = new Date('2026-10-06T08:00:00Z')
const ISSUED = new Date('2026-10-06T07:55:00Z')

function token(over: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    action: 'DECIDE_ESCALATION',
    targetType: 'ESCALATION',
    targetId: 'esc-1',
    entityId: 'pt-a',
    actorId: 'mgmt-1',
    snapshot: JSON.stringify({ status: 'DITINJAU', decidedById: null, decidedAt: null, decisionText: null }),
    stamp: JSON.stringify({ status: 'DIPUTUSKAN', updatedAt: '2026-10-06T07:55:00.000Z' }),
    expiresAt: new Date(ISSUED.getTime() + UNDO_WINDOW_MS),
    usedAt: null,
    createdAt: ISSUED,
    ...over,
  }
}

beforeEach(() => {
  mocks.reach.value = null
  for (const [k, group] of Object.entries(db)) {
    if (k === '$transaction') continue
    for (const m of Object.values(group as Record<string, ReturnType<typeof vi.fn>>)) m.mockReset().mockResolvedValue({ count: 1 })
  }
  db.unlockRequest.count.mockResolvedValue(0)
  db.task.count.mockResolvedValue(0)
  db.dailyProjectReport.count.mockResolvedValue(0)
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
})

describe('urungkan keputusan eskalasi', () => {
  it('memulihkan status & keputusan persis sebelumnya dan mencatat UNDO_DECIDE_ESCALATION', async () => {
    db.undoToken.findUnique.mockResolvedValue(token())

    const r = await applyUndo(MANAJEMEN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: true, action: 'DECIDE_ESCALATION', targetId: 'esc-1' })

    expect(db.undoToken.updateMany).toHaveBeenCalledWith({ where: { id: 'tok-1', usedAt: null }, data: { usedAt: NOW } })
    expect(db.escalation.updateMany).toHaveBeenCalledWith({
      where: { id: 'esc-1', status: 'DIPUTUSKAN', updatedAt: new Date('2026-10-06T07:55:00.000Z') },
      data: { status: 'DITINJAU', decidedById: null, decidedAt: null, decisionText: null },
    })
    const log = db.auditLog.create.mock.calls[0][0].data
    expect(log.action).toBe('UNDO_DECIDE_ESCALATION')
    expect(log.actorId).toBe('mgmt-1')
    expect(JSON.parse(log.afterData).undoTokenId).toBe('tok-1')
  })

  it('ditolak 409 bila eskalasi sudah diubah orang lain (updatedAt berbeda)', async () => {
    db.undoToken.findUnique.mockResolvedValue(token())
    db.escalation.updateMany.mockResolvedValue({ count: 0 })

    const r = await applyUndo(MANAJEMEN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })

  it('pelaku lain tidak bisa memakai tiket (404, anti-IDOR)', async () => {
    db.undoToken.findUnique.mockResolvedValue(token())
    const r = await applyUndo({ ...MANAJEMEN, id: 'mgmt-2' }, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: false, status: 404 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('lewat 15 menit ditolak', async () => {
    db.undoToken.findUnique.mockResolvedValue(token())
    const late = new Date(ISSUED.getTime() + UNDO_WINDOW_MS + 1000)
    const r = await applyUndo(MANAJEMEN, 'tok-1', undefined, late)
    expect(r).toMatchObject({ ok: false, status: 409, error: 'Batas urungkan 15 menit sudah lewat' })
  })

  it('tiket yang sudah dipakai ditolak', async () => {
    db.undoToken.findUnique.mockResolvedValue(token({ usedAt: ISSUED }))
    const r = await applyUndo(MANAJEMEN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: false, status: 409, error: 'Tindakan ini sudah diurungkan' })
  })

  it('PT di luar cakupan pelaku ditolak 403', async () => {
    db.undoToken.findUnique.mockResolvedValue(token())
    mocks.reach.value = ['pt-b']
    const r = await applyUndo(MANAJEMEN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: false, status: 403 })
  })
})

describe('urungkan penerusan laporan harian', () => {
  const dailyToken = () =>
    token({
      action: 'FORWARD_DAILY_REPORT',
      targetType: 'DAILY_REPORT',
      targetId: 'dr-1',
      actorId: 'admin-1',
      snapshot: JSON.stringify({ forwardedById: null, forwardedAt: null, isLocked: false, lockedAt: null }),
      stamp: JSON.stringify({ forwardedAt: '2026-10-06T07:55:00.000Z', updatedAt: '2026-10-06T07:55:00.010Z' }),
    })

  it('mencabut penerusan dan kunci yang ikut dipasang', async () => {
    db.undoToken.findUnique.mockResolvedValue(dailyToken())

    const r = await applyUndo(ADMIN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: true, message: 'Penerusan laporan harian diurungkan.' })
    expect(db.dailyProjectReport.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'dr-1',
        forwardedAt: new Date('2026-10-06T07:55:00.000Z'),
        updatedAt: new Date('2026-10-06T07:55:00.010Z'),
      },
      data: { forwardedById: null, forwardedAt: null, isLocked: false, lockedAt: null },
    })
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('UNDO_FORWARD_DAILY_REPORT')
  })

  it('ditolak bila PIC sudah mengajukan buka kunci sejak diteruskan', async () => {
    db.undoToken.findUnique.mockResolvedValue(dailyToken())
    db.unlockRequest.count.mockResolvedValue(1)

    const r = await applyUndo(ADMIN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(db.dailyProjectReport.updateMany).not.toHaveBeenCalled()
  })
})

describe('urungkan keputusan pengajuan proyek', () => {
  const stamp = { lifecycle: 'AKTIF', updatedAt: '2026-10-06T07:55:00.000Z', approvals: ['ADMIN_PT:DISETUJUI:2026-10-06T07:55:00.000Z'] }
  const approveToken = () =>
    token({
      action: 'APPROVE_PROJECT',
      targetType: 'PROJECT',
      targetId: 'pr-1',
      actorId: 'admin-1',
      snapshot: JSON.stringify({
        project: { lifecycle: 'DIUSULKAN', approvedAt: null, approvedByName: null },
        slot: { role: 'ADMIN_PT', before: null },
      }),
      stamp: JSON.stringify(stamp),
    })
  const currentProject = (over: Record<string, unknown> = {}) => ({
    lifecycle: 'AKTIF',
    updatedAt: new Date(stamp.updatedAt),
    approvals: [{ role: 'ADMIN_PT', decision: 'DISETUJUI', decidedAt: new Date('2026-10-06T07:55:00.000Z') }],
    ...over,
  })

  it('mengembalikan proyek ke pengajuan dan mengosongkan slot yang ditandatangani', async () => {
    db.undoToken.findUnique.mockResolvedValue(approveToken())
    db.project.findUnique.mockResolvedValue(currentProject())

    const r = await applyUndo(ADMIN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: true, action: 'APPROVE_PROJECT' })
    expect(db.project.updateMany).toHaveBeenCalledWith({
      where: { id: 'pr-1', updatedAt: new Date(stamp.updatedAt), lifecycle: 'AKTIF' },
      data: { lifecycle: 'DIUSULKAN', approvedAt: null, approvedByName: null },
    })
    expect(db.projectApproval.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'pr-1', role: 'ADMIN_PT' } })
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('UNDO_APPROVE_PROJECT')
  })

  it('ditolak bila slot berikutnya sudah ditandatangani orang lain', async () => {
    db.undoToken.findUnique.mockResolvedValue(approveToken())
    db.project.findUnique.mockResolvedValue(
      currentProject({
        approvals: [
          { role: 'ADMIN_PT', decision: 'DISETUJUI', decidedAt: new Date('2026-10-06T07:55:00.000Z') },
          { role: 'DIREKTUR_ENTITAS', decision: 'DISETUJUI', decidedAt: new Date('2026-10-06T07:58:00.000Z') },
        ],
      })
    )
    const r = await applyUndo(ADMIN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(db.project.updateMany).not.toHaveBeenCalled()
    expect(db.projectApproval.deleteMany).not.toHaveBeenCalled()
  })

  it('ditolak bila proyek yang baru aktif sudah mulai dilaporkan', async () => {
    db.undoToken.findUnique.mockResolvedValue(approveToken())
    db.project.findUnique.mockResolvedValue(currentProject())
    db.dailyProjectReport.count.mockResolvedValue(1)

    const r = await applyUndo(ADMIN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(db.project.updateMany).not.toHaveBeenCalled()
  })

  it('ajukan ulang: seluruh baris persetujuan lama dipulihkan', async () => {
    const prior = [{ role: 'ADMIN_PT', decision: 'DITOLAK', note: 'Anggaran belum jelas', decidedById: 'admin-1', decidedAt: '2026-10-05T03:00:00.000Z' }]
    db.undoToken.findUnique.mockResolvedValue(
      token({
        action: 'RESUBMIT_PROJECT',
        targetType: 'PROJECT',
        targetId: 'pr-1',
        actorId: 'admin-1',
        snapshot: JSON.stringify({
          project: { lifecycle: 'DITOLAK', approvedAt: null, approvedByName: null, proposedAt: '2026-10-01T03:00:00.000Z' },
          approvals: prior,
        }),
        stamp: JSON.stringify({ lifecycle: 'DIUSULKAN', updatedAt: stamp.updatedAt, approvals: [] }),
      })
    )
    db.project.findUnique.mockResolvedValue(currentProject({ lifecycle: 'DIUSULKAN', approvals: [] }))

    const r = await applyUndo(ADMIN, 'tok-1', undefined, NOW)
    expect(r).toMatchObject({ ok: true, action: 'RESUBMIT_PROJECT' })
    expect(db.project.updateMany.mock.calls[0][0].data).toEqual({
      lifecycle: 'DITOLAK',
      approvedAt: null,
      approvedByName: null,
      proposedAt: new Date('2026-10-01T03:00:00.000Z'),
    })
    expect(db.projectApproval.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'pr-1' } })
    expect(db.projectApproval.createMany).toHaveBeenCalledWith({
      data: [{ projectId: 'pr-1', role: 'ADMIN_PT', decision: 'DITOLAK', note: 'Anggaran belum jelas', decidedById: 'admin-1', decidedAt: new Date(prior[0].decidedAt) }],
    })
  })
})

describe('issueUndo', () => {
  it('tidak menggagalkan tindakan asal bila tabel belum ada', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.undoToken.create.mockRejectedValue(new Error('relation "UndoToken" does not exist'))
    const t = await issueUndo({
      action: 'CLOSE_ESCALATION',
      targetType: 'ESCALATION',
      targetId: 'esc-1',
      entityId: 'pt-a',
      actorId: 'mgmt-1',
      snapshot: { status: 'DIPUTUSKAN', decidedById: 'mgmt-1', decidedAt: null, decisionText: 'x' },
      stamp: { status: 'DITUTUP', updatedAt: NOW.toISOString() },
    })
    expect(t).toBeNull()
    spy.mockRestore()
  })

  it('tiket berlaku 15 menit sejak diterbitkan', async () => {
    db.undoToken.create.mockResolvedValue({ id: 'tok-9' })
    const t = await issueUndo(
      {
        action: 'FORWARD_WEEKLY_REPORT',
        targetType: 'WEEKLY_REPORT',
        targetId: 'wr-1',
        entityId: 'pt-a',
        actorId: 'admin-1',
        snapshot: { forwardedById: null, forwardedAt: null },
        stamp: { forwardedAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
      },
      NOW
    )
    expect(t).toBe('tok-9')
    expect(db.undoToken.create.mock.calls[0][0].data.expiresAt).toEqual(new Date(NOW.getTime() + 15 * 60_000))
  })
})
