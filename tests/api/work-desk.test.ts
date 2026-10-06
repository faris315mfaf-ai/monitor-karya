import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * /api/work-desk tanpa basis data: @/lib/db dan @/lib/auth di-mock. Catatan
 * pengingat (notificationLog) disimpan di memori agar uji "pengingat kedua"
 * menjalankan pemeriksaan duplikat milik rute itu sendiri, bukan jawaban palsu.
 */

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    currentUser: { value: null as unknown },
    notificationStore: [] as { userId: string; template: string; payload: string; createdAt: Date }[],
    db: {
      project: { findMany: fn(), findUnique: fn() },
      dailyProjectReport: { findMany: fn(), findUnique: fn() },
      task: { findMany: fn() },
      notificationLog: { findMany: fn(), findFirst: fn(), create: fn() },
      division: { findMany: fn() },
      weeklyDivisionReport: { findMany: fn() },
      entity: { findUnique: fn() },
      escalation: { findMany: fn() },
      unlockRequest: { findMany: fn() },
      lateIncident: { count: fn() },
      auditLog: { create: fn() },
    },
  }
})

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.currentUser.value),
}))

import { GET, POST } from '@/app/api/work-desk/route'

const db = mocks.db
const wib = (isoLocal: string) => new Date(`${isoLocal}+07:00`)

function asUser(u: Partial<SessionUser> & Pick<SessionUser, 'role'>) {
  const user: SessionUser = {
    id: 'u-1',
    name: 'Pengguna Tes',
    email: 'tes@contoh.test',
    scopeEntityId: null,
    avatarColor: null,
    ...u,
  }
  mocks.currentUser.value = user
  return user
}

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/work-desk', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  )
}

/** Semua pemanggilan baca default ke kosong; tes mengisi yang dibutuhkan. */
function resetDb() {
  for (const model of Object.values(db)) {
    for (const f of Object.values(model)) (f as ReturnType<typeof vi.fn>).mockReset()
  }
  db.project.findMany.mockResolvedValue([])
  db.dailyProjectReport.findMany.mockResolvedValue([])
  db.task.findMany.mockResolvedValue([])
  db.notificationLog.findMany.mockResolvedValue([])
  db.division.findMany.mockResolvedValue([])
  db.weeklyDivisionReport.findMany.mockResolvedValue([])
  db.escalation.findMany.mockResolvedValue([])
  db.unlockRequest.findMany.mockResolvedValue([])
  db.lateIncident.count.mockResolvedValue(0)
  db.auditLog.create.mockResolvedValue({})

  // notificationLog di memori — meniru filter yang dipakai remindOne.
  mocks.notificationStore.length = 0
  db.notificationLog.findFirst.mockImplementation(async ({ where }) => {
    const hit = mocks.notificationStore.find(
      (n) =>
        n.template === where.template &&
        n.userId === where.userId &&
        n.createdAt >= where.createdAt.gte &&
        n.payload.includes(where.payload.contains)
    )
    return hit ? { createdAt: hit.createdAt } : null
  })
  db.notificationLog.create.mockImplementation(async ({ data }) => {
    const row = { userId: data.userId, template: data.template, payload: data.payload, createdAt: new Date() }
    mocks.notificationStore.push(row)
    return { createdAt: row.createdAt }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-06T10:00:00')) // Selasa 10.00 WIB, sebelum tenggat
  resetDb()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/work-desk — cakupan per peran', () => {
  it('tanpa sesi: 401 dari requireApiUser diteruskan apa adanya', async () => {
    mocks.currentUser.value = NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(db.project.findMany).not.toHaveBeenCalled()
  })

  it('PIC hanya membaca proyek yang ia pegang dan pengingat untuk dirinya', async () => {
    const user = asUser({ id: 'pic-1', role: 'PIC_PROYEK', scopeEntityId: 'pt-a' })
    db.project.findMany.mockResolvedValue([
      {
        id: 'p-1', code: 'PRJ-01', name: 'Gudang Timur', phase: 'KONSTRUKSI',
        startDate: null, targetEndDate: null, entity: { name: 'PT A' },
      },
    ])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(db.project.findMany).toHaveBeenCalledTimes(1)
    expect(db.project.findMany.mock.calls[0][0].where).toEqual({ picUserId: user.id, lifecycle: 'AKTIF' })
    // Laporan & tugas dibatasi ke proyek miliknya.
    expect(db.dailyProjectReport.findMany.mock.calls[0][0].where.projectId).toEqual({ in: ['p-1'] })
    expect(db.task.findMany.mock.calls[0][0].where.projectId).toEqual({ in: ['p-1'] })
    expect(db.notificationLog.findMany.mock.calls[0][0].where.userId).toBe(user.id)
    // Tidak pernah menyentuh data tingkat PT.
    expect(db.entity.findUnique).not.toHaveBeenCalled()

    expect(body.kind).toBe('PIC')
    expect(body.projects.map((p: { id: string }) => p.id)).toEqual(['p-1'])
    expect(body.locked).toBe(false)
    expect(body.today).toBe('2026-10-05T17:00:00.000Z')
    expect(body.lockAt).toBe('2026-10-06T10:00:00.000Z')
    expect(body.days).toHaveLength(10)
  })

  it('PIC tanpa PT tetap mendapat meja (hanya bergantung pada picUserId)', async () => {
    asUser({ id: 'pic-2', role: 'PIC_PROYEK', scopeEntityId: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).projects).toEqual([])
  })

  it('kepala divisi membaca divisi yang ia pimpin saja', async () => {
    asUser({ id: 'kadiv-1', role: 'KEPALA_DIVISI', scopeEntityId: 'pt-a' })
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).kind).toBe('KADIV')
    expect(db.division.findMany.mock.calls[0][0].where).toEqual({ headUserId: 'kadiv-1', isActive: true })
  })

  it('Admin PT dibatasi pada PT-nya sendiri', async () => {
    asUser({ id: 'adm-1', role: 'ADMIN_PT', scopeEntityId: 'pt-a' })
    db.entity.findUnique.mockResolvedValue({ id: 'pt-a', name: 'PT A', code: 'PTA', region: null })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kind).toBe('ADMIN')
    expect(db.entity.findUnique.mock.calls[0][0].where).toEqual({ id: 'pt-a' })
    for (const call of db.project.findMany.mock.calls) expect(call[0].where.entityId).toBe('pt-a')
    expect(db.dailyProjectReport.findMany.mock.calls[0][0].where.entityId).toBe('pt-a')
    expect(db.division.findMany.mock.calls[0][0].where.entityId).toBe('pt-a')
    expect(db.weeklyDivisionReport.findMany.mock.calls[0][0].where.entityId).toBe('pt-a')
  })

  it.each(['ADMIN_PT', 'DIREKTUR_ENTITAS', 'MANAJEMEN', 'SUPERADMIN'])(
    'akun %s tanpa PT ditolak 400',
    async (role) => {
      asUser({ role, scopeEntityId: null })
      const res = await GET()
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/terikat pada satu PT/)
      expect(db.entity.findUnique).not.toHaveBeenCalled()
    }
  )

  it('PT yang tidak ada: 404', async () => {
    asUser({ role: 'ADMIN_PT', scopeEntityId: 'pt-hilang' })
    db.entity.findUnique.mockResolvedValue(null)
    expect((await GET()).status).toBe(404)
  })
})

describe('POST /api/work-desk — remind-pic', () => {
  const project = (over: Record<string, unknown> = {}) => ({
    id: 'p-1',
    name: 'Gudang Timur',
    entityId: 'pt-a',
    lifecycle: 'AKTIF',
    picUser: { id: 'pic-1', name: 'Sari', email: 'sari@contoh.test', isActive: true },
    ...over,
  })

  beforeEach(() => {
    asUser({ id: 'adm-1', name: 'Admin A', role: 'ADMIN_PT', scopeEntityId: 'pt-a' })
    db.project.findUnique.mockResolvedValue(project())
    db.dailyProjectReport.findUnique.mockResolvedValue(null)
  })

  it('pengingat pertama terkirim, pengingat kedua di hari yang sama ditolak 409', async () => {
    const first = await post({ action: 'remind-pic', projectId: 'p-1' })
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ ok: true, projectId: 'p-1', picName: 'Sari' })
    expect(db.notificationLog.create).toHaveBeenCalledTimes(1)
    expect(db.auditLog.create).toHaveBeenCalledTimes(1)

    vi.setSystemTime(wib('2026-10-06T11:00:00'))
    const second = await post({ action: 'remind-pic', projectId: 'p-1' })
    expect(second.status).toBe(409)
    const body = await second.json()
    expect(body.error).toBe('Sari sudah diingatkan hari ini')
    expect(body.remindedAt).toBeTruthy()
    expect(db.notificationLog.create).toHaveBeenCalledTimes(1)
  })

  // Regresi: DAILY_CUTOFF_LABEL sudah berisi "17.00 WIB"; isi notifikasi
  // tidak boleh menambah " WIB" lagi.
  it('isi notifikasi pengingat tidak menulis "WIB" dua kali', async () => {
    expect((await post({ action: 'remind-pic', projectId: 'p-1' })).status).toBe(200)
    const payload = JSON.parse(db.notificationLog.create.mock.calls[0][0].data.payload)
    expect(payload.body).toBe('Tenggat pukul 17.00 WIB. Diingatkan oleh Admin A.')
  })

  it('pengingat kemarin tidak menghalangi pengingat hari ini', async () => {
    vi.setSystemTime(wib('2026-10-05T10:00:00'))
    expect((await post({ action: 'remind-pic', projectId: 'p-1' })).status).toBe(200)
    vi.setSystemTime(wib('2026-10-06T10:00:00'))
    expect((await post({ action: 'remind-pic', projectId: 'p-1' })).status).toBe(200)
    expect(db.notificationLog.create).toHaveBeenCalledTimes(2)
  })

  it('proyek di luar PT akun ditolak 403 tanpa mengirim apa pun', async () => {
    db.project.findUnique.mockResolvedValue(project({ entityId: 'pt-b' }))
    const res = await post({ action: 'remind-pic', projectId: 'p-1' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Proyek ini di luar perusahaan Anda')
    expect(db.notificationLog.create).not.toHaveBeenCalled()
  })

  it('setelah 17.00 WIB ditolak 409 (terkunci) sebelum menyentuh proyek', async () => {
    vi.setSystemTime(wib('2026-10-06T17:00:00'))
    const res = await post({ action: 'remind-pic', projectId: 'p-1' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ locked: true })
    expect(db.project.findUnique).not.toHaveBeenCalled()
    expect(db.notificationLog.create).not.toHaveBeenCalled()
  })

  it('00.30 WIB (UTC masih kemarin sore) belum terkunci', async () => {
    vi.setSystemTime(wib('2026-10-07T00:30:00'))
    expect((await post({ action: 'remind-pic', projectId: 'p-1' })).status).toBe(200)
  })

  it('laporan yang sudah terkirim tidak perlu diingatkan (409)', async () => {
    db.dailyProjectReport.findUnique.mockResolvedValue({ submittedAt: new Date() })
    const res = await post({ action: 'remind-pic', projectId: 'p-1' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/sudah terkirim/)
  })

  it('proyek tanpa PIC aktif: 422', async () => {
    db.project.findUnique.mockResolvedValue(project({ picUser: { id: 'x', name: 'X', email: 'x@contoh.test', isActive: false } }))
    expect((await post({ action: 'remind-pic', projectId: 'p-1' })).status).toBe(422)
  })

  it('proyek tidak ditemukan atau tidak aktif: 404', async () => {
    db.project.findUnique.mockResolvedValue(null)
    expect((await post({ action: 'remind-pic', projectId: 'p-x' })).status).toBe(404)
    db.project.findUnique.mockResolvedValue(project({ lifecycle: 'DITUTUP' }))
    expect((await post({ action: 'remind-pic', projectId: 'p-1' })).status).toBe(404)
  })

  it.each(['PIC_PROYEK', 'KEPALA_DIVISI', 'MANAJEMEN', 'AUDITOR'])('peran %s tidak boleh mengingatkan (403)', async (role) => {
    asUser({ role, scopeEntityId: 'pt-a' })
    const res = await post({ action: 'remind-pic', projectId: 'p-1' })
    expect(res.status).toBe(403)
    expect(db.project.findUnique).not.toHaveBeenCalled()
  })

  it('aksi tak dikenal: 400', async () => {
    expect((await post({ action: 'hapus-semua' })).status).toBe(400)
  })
})

describe('POST /api/work-desk — remind-all-pics', () => {
  it('akun tanpa PT ditolak 400', async () => {
    asUser({ role: 'DIREKTUR_SDM_GA', scopeEntityId: null })
    const res = await post({ action: 'remind-all-pics' })
    expect(res.status).toBe(400)
  })

  it('mengirim ke yang belum diingatkan dan melewati yang sudah', async () => {
    asUser({ id: 'adm-1', name: 'Admin A', role: 'ADMIN_PT', scopeEntityId: 'pt-a' })
    db.project.findMany.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }])
    db.project.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      name: `Proyek ${where.id}`,
      entityId: 'pt-a',
      lifecycle: 'AKTIF',
      picUser: { id: `pic-${where.id}`, name: `PIC ${where.id}`, email: `${where.id}@contoh.test`, isActive: true },
    }))
    db.dailyProjectReport.findUnique.mockResolvedValue(null)

    expect((await post({ action: 'remind-pic', projectId: 'p-1' })).status).toBe(200)
    const res = await post({ action: 'remind-all-pics' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent.map((s: { projectId: string }) => s.projectId)).toEqual(['p-2'])
    expect(body.skipped).toBe(1)
    expect(db.project.findMany.mock.calls[0][0].where).toMatchObject({ entityId: 'pt-a', lifecycle: 'AKTIF' })
  })
})
