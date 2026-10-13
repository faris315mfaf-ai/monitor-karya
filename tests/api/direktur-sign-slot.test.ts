import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * E2E-2 BUG-01 (13 Okt 2026): Direktur entitas berlingkup SUB_HOLDING tidak
 * bisa menandatangani slot "Direktur entitas" usulan proyek PT di bawahnya,
 * karena `canSignSlot` menuntut scopeEntityId === PT proyek. Slot direktur
 * kini mengikuti cakupan `scopeEntityIds` (PT itu dan keturunannya), sama
 * dengan gerbang baca; slot Admin PT tetap PT yang sama persis.
 *
 * Pohon uji: sh-agro (SUB_HOLDING) → pt-1, pt-2; sh-energi → pt-9.
 */
const h = vi.hoisted(() => ({
  user: { id: 'dir', name: 'Direktur Agro', role: 'DIREKTUR_ENTITAS', scopeEntityId: 'sh-agro' } as {
    id: string; name: string; role: string; scopeEntityId: string | null
  },
  reach: ['sh-agro', 'pt-1', 'pt-2'] as string[] | null,
  project: {} as any,
  db: {
    project: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    projectApproval: { upsert: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn(),
  },
}))
vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: async () => h.user, scopeEntityIds: async () => h.reach }))
vi.mock('@/lib/undo', async (original) => ({
  ...(await original<typeof import('@/lib/undo')>()),
  issueUndo: vi.fn(async () => 'undo'),
  projectStamp: vi.fn(async () => null),
}))

import { canSignSlot } from '@/lib/rbac'
import { POST as approve } from '@/app/api/projects/approve/route'
import { GET as listProjects } from '@/app/api/projects/route'

const SUB_REACH = ['sh-agro', 'pt-1', 'pt-2']
const dirSub = { role: 'DIREKTUR_ENTITAS', scopeEntityId: 'sh-agro' }

describe('canSignSlot — slot Direktur entitas mengikuti cakupan', () => {
  it('direktur SUB_HOLDING menandatangani PT keturunannya', () => {
    expect(canSignSlot(dirSub, 'DIREKTUR_ENTITAS', 'pt-1', SUB_REACH)).toBe(true)
    expect(canSignSlot(dirSub, 'DIREKTUR_ENTITAS', 'pt-2', SUB_REACH)).toBe(true)
  })

  it('direktur SUB_HOLDING tidak menandatangani PT di luar sub-holdingnya', () => {
    expect(canSignSlot(dirSub, 'DIREKTUR_ENTITAS', 'pt-9', SUB_REACH)).toBe(false)
  })

  it('tanpa cakupan (reach tidak diberikan/null/kosong) gagal-tertutup ke PT yang sama', () => {
    expect(canSignSlot(dirSub, 'DIREKTUR_ENTITAS', 'pt-1')).toBe(false)
    expect(canSignSlot(dirSub, 'DIREKTUR_ENTITAS', 'pt-1', null)).toBe(false)
    expect(canSignSlot(dirSub, 'DIREKTUR_ENTITAS', 'pt-1', [])).toBe(false)
    const dirPt = { role: 'DIREKTUR_ENTITAS', scopeEntityId: 'pt-1' }
    expect(canSignSlot(dirPt, 'DIREKTUR_ENTITAS', 'pt-1')).toBe(true)
    expect(canSignSlot(dirPt, 'DIREKTUR_ENTITAS', 'pt-2', ['pt-1'])).toBe(false)
  })

  it('direktur tetap tidak bisa mengisi slot Admin PT atau Manajemen', () => {
    expect(canSignSlot(dirSub, 'ADMIN_PT', 'pt-1', SUB_REACH)).toBe(false)
    expect(canSignSlot(dirSub, 'MANAJEMEN', 'pt-1', SUB_REACH)).toBe(false)
  })

  it('Admin PT tetap terpaku pada PT-nya walau cakupannya memuat entitas lain', () => {
    const admin = { role: 'ADMIN_PT', scopeEntityId: 'pt-1' }
    expect(canSignSlot(admin, 'ADMIN_PT', 'pt-1', ['pt-1', 'pt-2'])).toBe(true)
    expect(canSignSlot(admin, 'ADMIN_PT', 'pt-2', ['pt-1', 'pt-2'])).toBe(false)
    expect(canSignSlot(admin, 'DIREKTUR_ENTITAS', 'pt-1', ['pt-1'])).toBe(false)
  })

  it('PIC dan kepala divisi tidak menandatangani apa pun; Manajemen & akun induk tidak berubah', () => {
    for (const role of ['PIC_PROYEK', 'KEPALA_DIVISI', 'AUDITOR']) {
      for (const slot of ['ADMIN_PT', 'DIREKTUR_ENTITAS', 'MANAJEMEN']) {
        expect(canSignSlot({ role, scopeEntityId: 'pt-1' }, slot, 'pt-1', ['pt-1'])).toBe(false)
      }
    }
    expect(canSignSlot({ role: 'MANAJEMEN', scopeEntityId: null }, 'MANAJEMEN', 'pt-9', null)).toBe(true)
    expect(canSignSlot({ role: 'MANAJEMEN', scopeEntityId: null }, 'DIREKTUR_ENTITAS', 'pt-9', null)).toBe(false)
    expect(canSignSlot({ role: 'SUPERADMIN', scopeEntityId: null }, 'DIREKTUR_ENTITAS', 'pt-9', null)).toBe(true)
  })
})

describe('POST /api/projects/approve — direktur SUB_HOLDING', () => {
  const req = (body: unknown) => new NextRequest('http://localhost/api/projects/approve', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    h.user = { id: 'dir', name: 'Direktur Agro', role: 'DIREKTUR_ENTITAS', scopeEntityId: 'sh-agro' }
    h.reach = [...SUB_REACH]
    h.project = { id: 'p', name: 'Usulan', entityId: 'pt-1', lifecycle: 'DIUSULKAN', approvalChain: ['DIREKTUR_ENTITAS'],
      approvedAt: null, approvedByName: null, approvals: [] }
    h.db.$transaction.mockImplementation(async (fn: (tx: typeof h.db) => unknown) => fn(h.db))
    h.db.$queryRaw.mockResolvedValue([])
    h.db.project.findUnique.mockImplementation(async () => structuredClone(h.project))
    h.db.project.update.mockImplementation(async ({ data }: { data: object }) => Object.assign(h.project, data))
    h.db.projectApproval.upsert.mockImplementation(async ({ create }: { create: object }) => { h.project.approvals.push({ ...create, decidedAt: new Date() }) })
    h.db.projectApproval.findMany.mockImplementation(async () => structuredClone(h.project.approvals))
    h.db.auditLog.create.mockResolvedValue({})
  })

  it('menyetujui usulan PT keturunan → proyek AKTIF', async () => {
    const res = await approve(req({ projectId: 'p', decision: 'DISETUJUI' }))
    expect(res.status).toBe(200)
    expect((await res.json()).lifecycle).toBe('AKTIF')
    expect(h.project.lifecycle).toBe('AKTIF')
  })

  it('menolak menandatangani usulan PT di luar sub-holdingnya (403)', async () => {
    h.project.entityId = 'pt-9'
    const res = await approve(req({ projectId: 'p', decision: 'DISETUJUI' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain('membawahi PT pemilik proyek')
    expect(h.db.projectApproval.upsert).not.toHaveBeenCalled()
  })

  it('Admin PT di PT lain tetap ditolak untuk slot Admin PT', async () => {
    h.user = { id: 'adm', name: 'Admin', role: 'ADMIN_PT', scopeEntityId: 'pt-2' }
    h.reach = ['pt-2']
    h.project.approvalChain = ['ADMIN_PT', 'DIREKTUR_ENTITAS']
    const res = await approve(req({ projectId: 'p', decision: 'DISETUJUI' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain('di PT pemilik proyek')
  })
})

describe('GET /api/projects — permissions.approve dan summary.waiting untuk direktur SUB_HOLDING', () => {
  const row = (id: string, entityId: string) => ({
    id, name: id, code: id, phase: 'INISIASI', lifecycle: 'DIUSULKAN', entityId, picName: null, picUserId: null, divisionId: null,
    division: null, description: null, purpose: null, proposedById: 'adm', proposedBy: { id: 'adm', name: 'Admin', role: 'ADMIN_PT' },
    proposedAt: new Date(), approvalChain: ['DIREKTUR_ENTITAS'], approvals: [], relatedEntities: [], startDate: null, targetEndDate: null,
    approvedByName: null, approvedAt: null, createdAt: new Date(), updatedAt: new Date(),
    entity: { id: entityId, name: entityId, code: entityId, region: null }, picUser: null, dailyReports: [],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    h.user = { id: 'dir', name: 'Direktur Agro', role: 'DIREKTUR_ENTITAS', scopeEntityId: 'sh-agro' }
    h.reach = [...SUB_REACH]
    // Baris PT luar ikut dikembalikan supaya penanda izin, bukan saringan, yang diuji.
    const rows = [row('p-1', 'pt-1'), row('p-9', 'pt-9')]
    h.db.project.findMany.mockResolvedValue(rows)
    h.db.project.count.mockResolvedValue(rows.length)
  })

  it('tombol Setujui hanya untuk PT keturunan; hitungan menunggu Anda cocok', async () => {
    const res = await listProjects(new NextRequest('http://localhost/api/projects?lifecycle=DIUSULKAN'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const approveOf = (id: string) => body.items.find((p: { id: string }) => p.id === id).permissions.approve
    expect(approveOf('p-1')).toBe(true)
    expect(approveOf('p-9')).toBe(false)
    expect(body.summary.waiting).toBe(1)
  })
})
