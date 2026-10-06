import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F2-DIREKTUR] /api/weekly-comments — "Beri tanggapan" laporan mingguan.
 * Pengawas dalam cakupan PT menulis; kepala divisi pemilik membalas; Admin PT
 * hanya membaca; laporan draf belum bisa ditanggapi; tarik tanggapan ≤ 15 menit.
 */

const mocks = vi.hoisted(() => ({
  currentUser: { value: null as unknown },
  scope: { value: ['pt-a'] as string[] | null },
  db: {
    weeklyDivisionReport: { findUnique: vi.fn(), findMany: vi.fn() },
    weeklyReportComment: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), updateMany: vi.fn() },
    division: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    notificationLog: { createMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.currentUser.value),
  scopeEntityIds: vi.fn(async () => mocks.scope.value),
}))
vi.mock('@/lib/kadiv', () => ({ canManageDivision: vi.fn(async () => null) }))

import { DELETE, POST } from '@/app/api/weekly-comments/route'

const db = mocks.db
const user = (id: string, role: string, scopeEntityId: string | null = 'pt-a'): SessionUser => ({
  id, name: id, email: `${id}@contoh.test`, role, scopeEntityId, avatarColor: null, mustChangePassword: false,
})
const DIREKTUR = user('dir-1', 'DIREKTUR_ENTITAS')

const req = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/weekly-comments', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
  })

const REPORT = { id: 'wr-1', entityId: 'pt-a', divisionId: 'div-1', statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: new Date(), isoYear: 2026, isoWeek: 41 }

beforeEach(() => {
  for (const model of Object.values(db)) for (const f of Object.values(model)) f.mockReset()
  mocks.currentUser.value = DIREKTUR
  mocks.scope.value = ['pt-a']
  db.weeklyDivisionReport.findUnique.mockResolvedValue({ ...REPORT })
  db.weeklyReportComment.create.mockImplementation(async ({ data }) => ({ id: 'c-1', readAt: null, createdAt: new Date(), ...data }))
  db.division.findUnique.mockResolvedValue({ name: 'Teknologi', headUserId: 'kadiv-1', headUser: { id: 'kadiv-1', email: 'k@contoh.test', isActive: true } })
  db.user.findMany.mockResolvedValue([{ id: 'dir-1', name: 'Hadi', role: 'DIREKTUR_ENTITAS' }])
  db.auditLog.create.mockResolvedValue({})
  db.notificationLog.createMany.mockResolvedValue({ count: 1 })
})
afterEach(() => vi.useRealTimers())

describe('POST /api/weekly-comments', () => {
  it('direktur dalam cakupan menanggapi; kepala divisi diberi tahu', async () => {
    const res = await POST(req('POST', { weeklyReportId: 'wr-1', body: 'Bagus, lanjutkan.' }))
    expect(res.status).toBe(201)
    expect(db.weeklyReportComment.create.mock.calls[0][0].data).toMatchObject({ weeklyReportId: 'wr-1', authorId: 'dir-1' })
    expect(db.notificationLog.createMany.mock.calls[0][0].data[0].userId).toBe('kadiv-1')
  })

  it('laporan PT lain dijawab 404', async () => {
    mocks.scope.value = ['pt-b']
    const res = await POST(req('POST', { weeklyReportId: 'wr-1', body: 'Bagus.' }))
    expect(res.status).toBe(404)
    expect(db.weeklyReportComment.create).not.toHaveBeenCalled()
  })

  it('laporan draf belum bisa ditanggapi', async () => {
    db.weeklyDivisionReport.findUnique.mockResolvedValue({ ...REPORT, statusHeader: 'DRAFT', submittedAt: null })
    const res = await POST(req('POST', { weeklyReportId: 'wr-1', body: 'Bagus.' }))
    expect(res.status).toBe(409)
  })

  it('Admin PT hanya membaca', async () => {
    mocks.currentUser.value = user('adm-1', 'ADMIN_PT')
    const res = await POST(req('POST', { weeklyReportId: 'wr-1', body: 'Bagus.' }))
    expect(res.status).toBe(403)
  })

  it('kepala divisi divisi lain tidak bisa membalas', async () => {
    mocks.currentUser.value = user('kadiv-2', 'KEPALA_DIVISI')
    const res = await POST(req('POST', { weeklyReportId: 'wr-1', body: 'Balasan.' }))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/weekly-comments', () => {
  it('tanggapan hanya bisa ditarik penulisnya dalam 15 menit', async () => {
    db.weeklyReportComment.findUnique.mockResolvedValue({ id: 'c-1', authorId: 'dir-1', weeklyReportId: 'wr-1', body: 'x', createdAt: new Date(Date.now() - 20 * 60000) })
    expect((await DELETE(req('DELETE', { id: 'c-1' }))).status).toBe(409)
    db.weeklyReportComment.findUnique.mockResolvedValue({ id: 'c-1', authorId: 'orang-lain', weeklyReportId: 'wr-1', body: 'x', createdAt: new Date() })
    expect((await DELETE(req('DELETE', { id: 'c-1' }))).status).toBe(404)
    db.weeklyReportComment.findUnique.mockResolvedValue({ id: 'c-1', authorId: 'dir-1', weeklyReportId: 'wr-1', body: 'x', createdAt: new Date() })
    expect((await DELETE(req('DELETE', { id: 'c-1' }))).status).toBe(200)
    expect(db.weeklyReportComment.delete).toHaveBeenCalledTimes(1)
  })
})
