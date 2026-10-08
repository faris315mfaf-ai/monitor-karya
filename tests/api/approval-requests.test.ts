import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F2-DIREKTUR] /api/approval-requests — persetujuan materi/anggaran/cuti.
 * Pengaju kepala divisi/PIC; pemutus Direktur entitas (PT-nya) atau peran grup;
 * cuti yang disetujui dicatat di Attendance; Urungkan ≤ 15 menit. DB & sesi di-mock.
 */

const mocks = vi.hoisted(() => ({
  currentUser: { value: null as unknown },
  scope: { value: ['pt-a'] as string[] | null },
  db: {
    approvalRequest: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    attendance: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    project: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    division: { findMany: vi.fn(), findUnique: vi.fn() },
    entity: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    notificationLog: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
  kadiv: { ledDivisions: vi.fn(), entityDirectors: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.currentUser.value),
  scopeEntityIds: vi.fn(async () => mocks.scope.value),
  scopeUserIds: vi.fn(async () => null),
}))
vi.mock('@/lib/kadiv', () => ({ ledDivisions: mocks.kadiv.ledDivisions, entityDirectors: mocks.kadiv.entityDirectors }))

import { PATCH, POST } from '@/app/api/approval-requests/route'

const db = mocks.db
const wib = (isoLocal: string) => new Date(`${isoLocal}+07:00`)

const user = (id: string, role: string, scopeEntityId: string | null = 'pt-a'): SessionUser => ({
  id, name: id, email: `${id}@contoh.test`, role, scopeEntityId, avatarColor: null, mustChangePassword: false,
})
const PIC = user('pic-1', 'PIC_PROYEK')
const KADIV = user('kadiv-1', 'KEPALA_DIVISI')
const DIREKTUR = user('dir-1', 'DIREKTUR_ENTITAS')
const MANAJEMEN = user('man-1', 'MANAJEMEN', null)

const req = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/approval-requests', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
  })

const ROW = {
  id: 'ar-1', type: 'ANGGARAN', title: 'Revisi anggaran ruang IT', description: null, amount: BigInt(48_500_000),
  entityId: 'pt-a', divisionId: 'div-1', projectId: null, requestedById: 'kadiv-1', startDate: null, endDate: null,
  status: 'DIAJUKAN', decidedById: null, decidedAt: null, decisionNote: null, fileName: null, fileMime: null, fileSize: null,
  createdAt: new Date(), appliedData: null, updatedAt: new Date(),
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-07T09:00:00')) // Rabu
  for (const model of Object.values(db)) {
    if (typeof model === 'function') model.mockReset()
    else for (const f of Object.values(model)) f.mockReset()
  }
  mocks.kadiv.ledDivisions.mockReset()
  mocks.kadiv.entityDirectors.mockReset()
  mocks.scope.value = ['pt-a']
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  db.approvalRequest.count.mockResolvedValue(0)
  db.approvalRequest.create.mockImplementation(async ({ data }) => ({ ...ROW, ...data, id: 'new-1', createdAt: new Date() }))
  db.approvalRequest.updateMany.mockResolvedValue({ count: 1 })
  db.approvalRequest.update.mockResolvedValue({})
  db.user.findUnique.mockResolvedValue({ id: 'x', email: 'x@contoh.test', isActive: true, scopeEntityId: 'pt-a', divisionId: 'div-1' })
  db.user.findMany.mockResolvedValue([])
  db.entity.findMany.mockResolvedValue([{ id: 'pt-a', name: 'PT A', code: 'PTA' }])
  db.division.findMany.mockResolvedValue([])
  db.project.findMany.mockResolvedValue([])
  db.auditLog.create.mockResolvedValue({})
  db.notificationLog.createMany.mockResolvedValue({ count: 1 })
  db.attendance.findMany.mockResolvedValue([])
  db.attendance.createMany.mockResolvedValue({ count: 0 })
  db.attendance.deleteMany.mockResolvedValue({ count: 0 })
  mocks.kadiv.entityDirectors.mockResolvedValue([{ id: 'dir-1', name: 'Hadi', email: 'hadi@contoh.test' }])
})
afterEach(() => vi.useRealTimers())

describe('POST /api/approval-requests', () => {
  it('hanya kepala divisi dan PIC yang mengajukan', async () => {
    mocks.currentUser.value = user('adm-1', 'ADMIN_PT')
    const res = await POST(req('POST', { type: 'MATERI', title: 'Materi video kampanye' }))
    expect(res.status).toBe(403)
    expect(db.approvalRequest.create).not.toHaveBeenCalled()
  })

  it('anggaran wajib bernominal', async () => {
    mocks.currentUser.value = PIC
    const res = await POST(req('POST', { type: 'ANGGARAN', title: 'Revisi anggaran ruang IT' }))
    expect(res.status).toBe(422)
  })

  it('cuti PIC: PT dari akun, tanggal tersimpan, direktur PT diberi tahu', async () => {
    mocks.currentUser.value = PIC
    const res = await POST(req('POST', { type: 'CUTI', startDate: '2026-10-12', endDate: '2026-10-14' }))
    expect(res.status).toBe(201)
    const data = db.approvalRequest.create.mock.calls[0][0].data
    expect(data).toMatchObject({ type: 'CUTI', entityId: 'pt-a', requestedById: 'pic-1', title: 'Cuti 3 hari' })
    expect(data.startDate.toISOString()).toBe(wib('2026-10-12T00:00:00').toISOString())
    expect(db.notificationLog.createMany).toHaveBeenCalledTimes(1)
    expect(db.notificationLog.createMany.mock.calls[0][0].data[0].userId).toBe('dir-1')
  })

  it('cuti lebih dari 30 hari ditolak', async () => {
    mocks.currentUser.value = PIC
    const res = await POST(req('POST', { type: 'CUTI', startDate: '2026-10-12', endDate: '2026-11-20' }))
    expect(res.status).toBe(422)
  })

  it('kepala divisi tidak bisa mengajukan atas nama divisi lain (anti-IDOR)', async () => {
    mocks.currentUser.value = KADIV
    mocks.kadiv.ledDivisions.mockResolvedValue([{ id: 'div-1', name: 'Teknologi', entityId: 'pt-a', entityName: 'PT A', headUserId: 'kadiv-1' }])
    const res = await POST(req('POST', { type: 'MATERI', title: 'Materi video kampanye', divisionId: 'div-lain' }))
    expect(res.status).toBe(403)
  })

  it('proyek di luar tanggung jawab PIC ditolak', async () => {
    mocks.currentUser.value = PIC
    db.project.findFirst.mockResolvedValue(null)
    const res = await POST(req('POST', { type: 'MATERI', title: 'Materi video kampanye', projectId: 'prj-lain' }))
    expect(res.status).toBe(403)
    expect(db.project.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'prj-lain', picUserId: 'pic-1' })
  })
})

describe('PATCH /api/approval-requests', () => {
  it('direktur PT lain tidak bisa memutuskan (404, tidak bocor)', async () => {
    mocks.currentUser.value = DIREKTUR
    mocks.scope.value = ['pt-b']
    db.approvalRequest.findUnique.mockResolvedValue({ ...ROW })
    const res = await PATCH(req('PATCH', { id: 'ar-1', action: 'approve' }))
    expect(res.status).toBe(404)
    expect(db.approvalRequest.updateMany).not.toHaveBeenCalled()
  })

  it('pengaju tidak memutuskan permintaannya sendiri', async () => {
    mocks.currentUser.value = { ...MANAJEMEN, id: 'kadiv-1' }
    mocks.scope.value = null
    db.approvalRequest.findUnique.mockResolvedValue({ ...ROW })
    const res = await PATCH(req('PATCH', { id: 'ar-1', action: 'approve' }))
    expect(res.status).toBe(403)
  })

  it('menolak wajib beralasan', async () => {
    mocks.currentUser.value = DIREKTUR
    db.approvalRequest.findUnique.mockResolvedValue({ ...ROW })
    const res = await PATCH(req('PATCH', { id: 'ar-1', action: 'reject' }))
    expect(res.status).toBe(422)
  })

  it('menyetujui cuti mencatat Attendance CUTI hanya di hari kerja', async () => {
    mocks.currentUser.value = DIREKTUR
    db.approvalRequest.findUnique.mockResolvedValue({
      ...ROW, type: 'CUTI', amount: null, requestedById: 'pic-1',
      startDate: wib('2026-10-09T00:00:00'), endDate: wib('2026-10-12T00:00:00'), // Jumat–Senin
    })
    const res = await PATCH(req('PATCH', { id: 'ar-1', action: 'approve' }))
    expect(res.status).toBe(200)
    const rows = db.attendance.createMany.mock.calls[0][0].data
    expect(rows.map((r: { date: Date }) => r.date.toISOString())).toEqual([
      wib('2026-10-09T00:00:00').toISOString(),
      wib('2026-10-12T00:00:00').toISOString(),
    ])
    expect(rows[0]).toMatchObject({ userId: 'pic-1', status: 'CUTI', recordedById: 'dir-1' })
    expect(JSON.parse(db.approvalRequest.update.mock.calls[0][0].data.appliedData)).toEqual({ attendance: ['2026-10-09', '2026-10-12'] })
  })

  it('urungkan lewat 15 menit ditolak; dalam 15 menit mengembalikan DIAJUKAN', async () => {
    mocks.currentUser.value = DIREKTUR
    const decided = { ...ROW, status: 'DISETUJUI', decidedById: 'dir-1', decidedAt: new Date(Date.now() - 16 * 60000), appliedData: JSON.stringify({ attendance: ['2026-10-09'] }) }
    db.approvalRequest.findUnique.mockResolvedValue(decided)
    expect((await PATCH(req('PATCH', { id: 'ar-1', action: 'undo' }))).status).toBe(409)

    db.approvalRequest.findUnique.mockResolvedValue({ ...decided, decidedAt: new Date(Date.now() - 5 * 60000) })
    const res = await PATCH(req('PATCH', { id: 'ar-1', action: 'undo' }))
    expect(res.status).toBe(200)
    expect(db.approvalRequest.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'DIAJUKAN', decidedById: null })
    expect(db.attendance.deleteMany).toHaveBeenCalledTimes(1)
  })
})
