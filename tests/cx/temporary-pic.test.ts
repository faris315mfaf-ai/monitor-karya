import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('../api/admin-fake-db')).db }))

import { db } from '@/lib/db'
import { one, rows, seed, store, world } from '../api/admin-fake-db'
import { applyAccessRequest, decisionDesk, ensureTemporaryAccessCurrent, revertExpiredAccess } from '@/lib/access-requests'
import { guardProjectAccess, REVIEW_RELATIONS } from '@/lib/pic-access'

const start = new Date('2026-10-07T03:00:00Z')
const end = new Date(start.getTime() + 86400000)
const actor = { id: 'u-super', name: 'Super', role: 'SUPERADMIN', scopeEntityId: null }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(start)
  world()
  // The old PIC belongs to another division; the temporary PIC leads div-a1.
  one('user', 'u-pic-a').divisionId = 'div-a2'
  one('project', 'prj-a').divisionId = null
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

async function grant() {
  const row = {
    id: 'temporary-pic', type: 'AKSES_SEMENTARA', entityId: 'pt-a', status: 'DISETUJUI', requestedById: 'u-admin-a',
    payload: JSON.stringify({ userId: 'u-kadiv-a', role: 'PIC_PROYEK', projectId: 'prj-a', days: 1 }),
  }
  seed('accessRequest', [row])
  await db.$transaction(async (tx) => {
    const applied = await applyAccessRequest(tx, actor, decisionDesk(actor)!, row, null)
    const { effect: _effect, ...data } = applied
    await tx.accessRequest.update({ where: { id: row.id }, data })
  })
}
const expire = () => revertExpiredAccess(end)
const snapshot = () => JSON.parse(one('accessRequest', 'temporary-pic').appliedData as string)

describe('temporary PIC assignment restoration', () => {
  it('captures the exact previous and granted PIC identity/name', async () => {
    await grant()
    expect(snapshot().pics).toEqual([{ projectId: 'prj-a', entityId: 'pt-a', from: 'u-pic-a', fromName: 'Putra PIC A', to: 'u-kadiv-a', toName: 'Kirana Kadiv A' }])
    expect(one('project', 'prj-a').picUserId).toBe('u-kadiv-a')
  })
  it.each(['membership', 'headed-fallback'])('restores the old PIC and removes residual KADIV review access (%s)', async (kind) => {
    if (kind === 'headed-fallback') one('user', 'u-kadiv-a').divisionId = null
    await grant()
    expect(await expire()).toBe(1)
    expect(one('project', 'prj-a')).toMatchObject({ picUserId: 'u-pic-a', picName: 'Putra PIC A' })
    expect(one('division', 'div-a1').headUserId).toBe('u-kadiv-a')
    expect(one('user', 'u-kadiv-a').role).toBe('KEPALA_DIVISI')
    const user = { id: 'u-kadiv-a', name: 'Kirana', email: 'k@example.test', role: 'KEPALA_DIVISI', scopeEntityId: 'pt-a', avatarColor: null }
    const guard = await guardProjectAccess(user, 'prj-a', REVIEW_RELATIONS)
    expect(guard.ok).toBe(false)
    if (!guard.ok) expect(guard.res.status).toBe(403)
    expect(rows('auditLog', { action: 'TEMP_ACCESS_EXPIRED' })).toHaveLength(1)
    expect(await expire()).toBe(0)
  })
  it('restores links independently when the current role was changed manually', async () => {
    await grant()
    one('user', 'u-kadiv-a').role = 'AUDITOR'
    await expire()
    expect(one('user', 'u-kadiv-a').role).toBe('AUDITOR')
    expect(one('project', 'prj-a').picUserId).toBe('u-pic-a')
    expect(one('division', 'div-a1').headUserId).toBeNull()
  })
  it('preserves a later manual PIC assignment', async () => {
    await grant()
    Object.assign(one('project', 'prj-a'), { picUserId: 'u-pic-a2', picName: 'Later owner' })
    await expire()
    expect(one('project', 'prj-a')).toMatchObject({ picUserId: 'u-pic-a2', picName: 'Later owner' })
  })
  it('preserves a manual name change even if PIC id is unchanged', async () => {
    await grant()
    one('project', 'prj-a').picName = 'Manual assignment marker'
    await expire()
    expect(one('project', 'prj-a')).toMatchObject({ picUserId: 'u-kadiv-a', picName: 'Manual assignment marker' })
  })
  it.each(['deleted', 'inactive', 'other-company', 'other-role'])('clears temporary ownership if the previous PIC is now %s', async (kind) => {
    await grant()
    if (kind === 'deleted') store.user = store.user.filter((u) => u.id !== 'u-pic-a')
    if (kind === 'inactive') one('user', 'u-pic-a').isActive = false
    if (kind === 'other-company') one('user', 'u-pic-a').scopeEntityId = 'pt-b'
    if (kind === 'other-role') one('user', 'u-pic-a').role = 'AUDITOR'
    expect(await expire()).toBe(1)
    expect(one('project', 'prj-a')).toMatchObject({ picUserId: null, picName: null })
  })
  it('restores the previous free-text PIC name when there was no linked account', async () => {
    Object.assign(one('project', 'prj-a'), { picUserId: null, picName: 'Petugas belum berakun' })
    await grant()
    await expire()
    expect(one('project', 'prj-a')).toMatchObject({ picUserId: null, picName: 'Petugas belum berakun' })
  })
  it('does not restore an old PIC into a project moved to another company', async () => {
    await grant()
    one('project', 'prj-a').entityId = 'pt-b'
    await expire()
    expect(one('project', 'prj-a')).toMatchObject({ picUserId: null, picName: null })
  })
  it('handles a deleted project', async () => {
    await grant()
    store.project = store.project.filter((p) => p.id !== 'prj-a')
    expect(await expire()).toBe(1)
  })
  it('uses a conditional write so a concurrent manual assignment wins', async () => {
    await grant()
    const original = db.project.updateMany.bind(db.project)
    vi.spyOn(db.project, 'updateMany').mockImplementationOnce((args) => {
      expect(args.where).toMatchObject({ id: 'prj-a', picUserId: 'u-kadiv-a', picName: 'Kirana Kadiv A' })
      Object.assign(one('project', 'prj-a'), { picUserId: 'u-pic-a2', picName: 'Concurrent owner' })
      return original(args)
    })
    await expire()
    expect(one('project', 'prj-a')).toMatchObject({ picUserId: 'u-pic-a2', picName: 'Concurrent owner' })
  })
  it.each([undefined, [{ projectId: 'broken' }]])('fails closed for legacy/malformed snapshots while ownership still remains', async (pics) => {
    await grant()
    const data = snapshot()
    if (pics === undefined) delete data.pics
    else data.pics = pics
    one('accessRequest', 'temporary-pic').appliedData = JSON.stringify(data)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(ensureTemporaryAccessCurrent('u-kadiv-a', end)).rejects.toMatchObject({ status: 503 })
    expect(one('accessRequest', 'temporary-pic').revertedAt).toBeNull()
    expect(one('project', 'prj-a').picUserId).toBe('u-kadiv-a')
    // An explicit admin correction lets expiry finish without inventing a former PIC.
    Object.assign(one('project', 'prj-a'), { picUserId: 'u-pic-a', picName: 'Putra PIC A' })
    await expect(ensureTemporaryAccessCurrent('u-kadiv-a', end)).resolves.toBeUndefined()
  })
  it('rolls back restored ownership together with role and expiry if audit fails', async () => {
    await grant()
    vi.spyOn(db.auditLog, 'create').mockRejectedValueOnce(new Error('audit unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await expire()).toBe(0)
    expect(one('project', 'prj-a').picUserId).toBe('u-kadiv-a')
    expect(one('user', 'u-kadiv-a').role).toBe('PIC_PROYEK')
    expect(one('accessRequest', 'temporary-pic').revertedAt).toBeNull()
  })
})
