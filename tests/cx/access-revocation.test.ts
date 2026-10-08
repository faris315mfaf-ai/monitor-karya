import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'
import type { Tx } from '@/lib/companies'

const mocks = vi.hoisted(() => ({
  actor: null as unknown,
  reach: null as string[] | null,
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    division: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    undoToken: { findUnique: vi.fn(), updateMany: vi.fn() },
    dailyProjectReport: { updateMany: vi.fn() },
    weeklyDivisionReport: { updateMany: vi.fn() },
    unlockRequest: { count: vi.fn() },
    project: { findUnique: vi.fn(), updateMany: vi.fn() },
    projectApproval: { deleteMany: vi.fn() },
    escalation: { findUnique: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.actor),
  scopeEntityIds: vi.fn(async () => mocks.reach),
}))

import { canManageDivision } from '@/lib/kadiv'
import { applyRoleChange } from '@/lib/account-desk'
import { PATCH as changeAccount } from '@/app/api/companies/users/route'
import { POST as undo } from '@/app/api/undo/route'
import { applyUndo, UNDO_ACTIONS } from '@/lib/undo'

const db = mocks.db
const user = (role: string): SessionUser => ({
  id: 'user-1', name: 'Pengguna', email: 'user@example.test', role,
  scopeEntityId: 'pt-a', avatarColor: null, mustChangePassword: false,
})
const now = new Date('2026-10-06T08:00:00Z')
const stamp = { forwardedAt: now.toISOString(), updatedAt: now.toISOString() }
const ticket = (action = 'FORWARD_DAILY_REPORT') => {
  const project = action.endsWith('_PROJECT')
  const escalation = action.endsWith('_ESCALATION')
  return {
    id: 'ticket-1', actorId: 'user-1', entityId: 'pt-a', action,
    targetType: project ? 'PROJECT' : escalation ? 'ESCALATION' : action === 'FORWARD_WEEKLY_REPORT' ? 'WEEKLY_REPORT' : 'DAILY_REPORT',
    targetId: project ? 'project-1' : escalation ? 'escalation-1' : 'report-1',
    createdAt: now, expiresAt: new Date(now.getTime() + 900_000), usedAt: null,
    snapshot: JSON.stringify(project
      ? { project: { lifecycle: 'DIUSULKAN', approvedAt: null, approvedByName: null }, slot: { role: 'ADMIN_PT', before: null } }
      : escalation ? { status: 'DITINJAU', decidedById: null, decidedAt: null, decisionText: null }
      : { forwardedById: null, forwardedAt: null, isLocked: false, lockedAt: null }),
    stamp: JSON.stringify(project ? { lifecycle: 'DIUSULKAN', updatedAt: now.toISOString(), approvals: [] } : escalation ? { status: 'DIPUTUSKAN', updatedAt: now.toISOString() } : stamp),
  }
}
const request = (path: string, method: string, body: unknown) => new NextRequest(`http://localhost${path}`, {
  method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.reach = ['pt-a']
  mocks.actor = user('SUPERADMIN')
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  db.division.findUnique.mockResolvedValue({ id: 'division-1', name: 'Divisi', entityId: 'pt-a', headUserId: 'user-1', isActive: true, entity: { name: 'PT A' } })
  db.division.findMany.mockResolvedValue([{ id: 'division-1' }])
  db.division.updateMany.mockResolvedValue({ count: 1 })
  db.undoToken.findUnique.mockResolvedValue(ticket())
  db.undoToken.updateMany.mockResolvedValue({ count: 1 })
  db.dailyProjectReport.updateMany.mockResolvedValue({ count: 1 })
  db.weeklyDivisionReport.updateMany.mockResolvedValue({ count: 1 })
  db.unlockRequest.count.mockResolvedValue(0)
  db.project.findUnique.mockResolvedValue({ lifecycle: 'DIUSULKAN', updatedAt: now, approvals: [], proposedById: 'user-1' })
  db.project.updateMany.mockResolvedValue({ count: 1 })
  db.projectApproval.deleteMany.mockResolvedValue({ count: 1 })
  db.escalation.findUnique.mockResolvedValue({ raisedById: 'user-1' })
  db.escalation.updateMany.mockResolvedValue({ count: 1 })
})

describe('pencabutan peran kepala divisi', () => {
  it('Auditor dengan headUserId lama tidak boleh mengatur divisi', async () => {
    expect(await canManageDivision(user('AUDITOR'), 'division-1')).toBeNull()
  })
  it.each(['KEPALA_DIVISI', 'ADMIN_PT', 'TI', 'SUPERADMIN'])('hak %s tetap berlaku', async (role) => {
    expect(await canManageDivision(user(role), 'division-1')).toMatchObject({ id: 'division-1' })
  })
  it('account desk melepas kepala dan mencatat headChanges saat menjadi Auditor tanpa penempatan baru', async () => {
    const result = await applyRoleChange(db as unknown as Tx, user('KEPALA_DIVISI'), { role: 'AUDITOR' })
    expect(db.division.updateMany).toHaveBeenCalledWith({ where: { headUserId: 'user-1' }, data: { headUserId: null } })
    expect(result.headChanges).toEqual([{ divisionId: 'division-1', from: 'user-1', to: null }])
  })
  it('PATCH akun melepas kepala saat menjadi Auditor tanpa field tautan divisi', async () => {
    const existing = { ...user('KEPALA_DIVISI'), username: 'pengguna', divisionId: null, isActive: true }
    db.user.findUnique.mockResolvedValue(existing)
    db.user.update.mockResolvedValue({ ...existing, role: 'AUDITOR' })
    const response = await changeAccount(request('/api/companies/users', 'PATCH', { id: existing.id, role: 'AUDITOR' }))
    expect(response.status).toBe(200)
    expect(db.division.updateMany).toHaveBeenCalledWith({ where: { headUserId: existing.id }, data: { headUserId: null } })
  })
  it('perubahan nama kepala tidak melepas kepemimpinannya', async () => {
    const existing = { ...user('KEPALA_DIVISI'), username: 'pengguna', divisionId: null, isActive: true }
    db.user.findUnique.mockResolvedValue(existing)
    db.user.update.mockResolvedValue({ ...existing, name: 'Nama baru' })
    expect((await changeAccount(request('/api/companies/users', 'PATCH', { id: existing.id, name: 'Nama baru' }))).status).toBe(200)
    expect(db.division.updateMany).not.toHaveBeenCalled()
  })
})

describe('undo memakai hak sekarang', () => {
  it.each(UNDO_ACTIONS)('Auditor ditolak untuk %s sebelum klaim tiket', async (action) => {
    db.undoToken.findUnique.mockResolvedValue(ticket(action))
    expect(await applyUndo(user('AUDITOR'), 'ticket-1', undefined, now)).toMatchObject({ ok: false, status: 403 })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.undoToken.updateMany).not.toHaveBeenCalled()
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })
  it.each([
    ['APPROVE_PROJECT', 'ADMIN_PT'], ['REJECT_PROJECT', 'ADMIN_PT'],
    ['RESUBMIT_PROJECT', 'ADMIN_PT'], ['RESUBMIT_PROJECT', 'PIC_PROYEK'],
    ['ARCHIVE_PROJECT', 'ADMIN_PT'], ['REVIEW_ESCALATION', 'DIREKTUR_ENTITAS'],
    ['DECIDE_ESCALATION', 'MANAJEMEN'], ['CLOSE_ESCALATION', 'MANAJEMEN'],
    ['CLOSE_ESCALATION', 'PIC_PROYEK'], ['FORWARD_DAILY_REPORT', 'TI'],
    ['FORWARD_WEEKLY_REPORT', 'SUPERADMIN'],
  ])('hak sah %s oleh %s tetap bisa digunakan', async (action, role) => {
    db.undoToken.findUnique.mockResolvedValue(ticket(action))
    expect(await applyUndo(user(role), 'ticket-1', undefined, now)).toMatchObject({ ok: true, action })
  })
  it('Admin tetap boleh mengurungkan aktivasi data lama tanpa slot', async () => {
    db.undoToken.findUnique.mockResolvedValue({ ...ticket('APPROVE_PROJECT'), snapshot: JSON.stringify({ project: { lifecycle: 'DIUSULKAN', approvedAt: null, approvedByName: null }, slot: null }) })
    expect(await applyUndo(user('ADMIN_PT'), 'ticket-1', undefined, now)).toMatchObject({ ok: true })
  })
  it('mantan Admin yang menjadi Direktur tidak boleh memulihkan slot Admin', async () => {
    db.undoToken.findUnique.mockResolvedValue(ticket('APPROVE_PROJECT'))
    expect(await applyUndo(user('DIREKTUR_ENTITAS'), 'ticket-1', undefined, now)).toMatchObject({ ok: false, status: 403 })
    expect(db.undoToken.updateMany).not.toHaveBeenCalled()
  })
  it.each(['RESUBMIT_PROJECT', 'CLOSE_ESCALATION'])('hak pengaju %s tidak berlaku pada milik orang lain', async (action) => {
    db.undoToken.findUnique.mockResolvedValue(ticket(action))
    db.project.findUnique.mockResolvedValue({ proposedById: 'other-user' })
    db.escalation.findUnique.mockResolvedValue({ raisedById: 'other-user' })
    expect(await applyUndo(user('PIC_PROYEK'), 'ticket-1', undefined, now)).toMatchObject({ ok: false, status: 403 })
    expect(db.undoToken.updateMany).not.toHaveBeenCalled()
  })
  it('mantan Admin dengan tiket valid ditolak melalui endpoint undo', async () => {
    mocks.actor = user('AUDITOR')
    db.undoToken.findUnique.mockResolvedValue({ ...ticket(), expiresAt: new Date(Date.now() + 900_000) })
    expect((await undo(request('/api/undo', 'POST', { token: 'ticket-1' }))).status).toBe(403)
    expect(db.dailyProjectReport.updateMany).not.toHaveBeenCalled()
    expect(db.undoToken.updateMany).not.toHaveBeenCalled()
  })
  it.each(['FORWARD_DAILY_REPORT', 'FORWARD_WEEKLY_REPORT'])('Admin tetap boleh %s', async (action) => {
    db.undoToken.findUnique.mockResolvedValue(ticket(action))
    expect(await applyUndo(user('ADMIN_PT'), 'ticket-1', undefined, now)).toMatchObject({ ok: true, action })
    expect(db.undoToken.updateMany).toHaveBeenCalledOnce()
    expect(db.auditLog.create).toHaveBeenCalledOnce()
  })
})
