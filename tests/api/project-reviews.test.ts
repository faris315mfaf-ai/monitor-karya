import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F2-DIREKTUR] /api/project-reviews — "Tandai sudah ditinjau" di detail proyek.
 * Hanya pengawas (Manajemen, Direktur entitas, Direksi holding, Super Admin, TI)
 * yang menandai; proyek di luar cakupan ditolak oleh guard; Urungkan hanya untuk
 * tinjauan sendiri dan paling lama 15 menit.
 */

const mocks = vi.hoisted(() => ({
  currentUser: { value: null as unknown },
  guard: { value: null as unknown },
  db: {
    projectReview: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: vi.fn(async () => mocks.currentUser.value) }))
vi.mock('@/lib/pic-access', async (orig) => ({
  ...(await orig<typeof import('@/lib/pic-access')>()),
  guardProjectAccess: vi.fn(async () => mocks.guard.value),
}))

import { DELETE, POST } from '@/app/api/project-reviews/route'

const db = mocks.db
const user = (id: string, role: string): SessionUser => ({
  id, name: id, email: `${id}@contoh.test`, role, scopeEntityId: 'pt-a', avatarColor: null, mustChangePassword: false,
})

const req = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/project-reviews', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
  })

beforeEach(() => {
  for (const model of Object.values(db)) for (const f of Object.values(model)) f.mockReset()
  mocks.currentUser.value = user('dir-1', 'DIREKTUR_ENTITAS')
  mocks.guard.value = { ok: true, relation: 'VIEWER', project: { id: 'p-1', entityId: 'pt-a' } }
  db.projectReview.create.mockImplementation(async ({ data }) => ({ id: 'rv-1', reviewedAt: new Date(), ...data }))
  db.auditLog.create.mockResolvedValue({})
})
afterEach(() => vi.useRealTimers())

describe('POST /api/project-reviews', () => {
  it('direktur dalam cakupan menandai proyek dan tercatat di log', async () => {
    const res = await POST(req('POST', { projectId: 'p-1' }))
    expect(res.status).toBe(201)
    expect(db.projectReview.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p-1', reviewerId: 'dir-1' })
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'REVIEW_PROJECT', targetId: 'p-1' })
  })

  it('kepala divisi dan PIC tidak menandai tinjauan', async () => {
    for (const role of ['KEPALA_DIVISI', 'PIC_PROYEK', 'ADMIN_PT', 'AUDITOR']) {
      mocks.currentUser.value = user('u-1', role)
      const res = await POST(req('POST', { projectId: 'p-1' }))
      expect(res.status).toBe(403)
    }
    expect(db.projectReview.create).not.toHaveBeenCalled()
  })

  it('proyek di luar cakupan ditolak guard', async () => {
    mocks.guard.value = { ok: false, res: NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 }) }
    const res = await POST(req('POST', { projectId: 'p-lain' }))
    expect(res.status).toBe(404)
    expect(db.projectReview.create).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/project-reviews (Urungkan)', () => {
  it('menghapus tinjauan sendiri dalam 15 menit', async () => {
    db.projectReview.findUnique.mockResolvedValue({ id: 'rv-1', projectId: 'p-1', reviewerId: 'dir-1', reviewedAt: new Date() })
    const res = await DELETE(req('DELETE', { id: 'rv-1' }))
    expect(res.status).toBe(200)
    expect(db.projectReview.delete).toHaveBeenCalledWith({ where: { id: 'rv-1' } })
  })

  it('tinjauan orang lain dijawab 404', async () => {
    db.projectReview.findUnique.mockResolvedValue({ id: 'rv-1', projectId: 'p-1', reviewerId: 'mgr-1', reviewedAt: new Date() })
    const res = await DELETE(req('DELETE', { id: 'rv-1' }))
    expect(res.status).toBe(404)
    expect(db.projectReview.delete).not.toHaveBeenCalled()
  })

  it('lewat 15 menit tidak bisa diurungkan', async () => {
    db.projectReview.findUnique.mockResolvedValue({ id: 'rv-1', projectId: 'p-1', reviewerId: 'dir-1', reviewedAt: new Date(Date.now() - 16 * 60000) })
    const res = await DELETE(req('DELETE', { id: 'rv-1' }))
    expect(res.status).toBe(409)
    expect(db.projectReview.delete).not.toHaveBeenCalled()
  })
})
