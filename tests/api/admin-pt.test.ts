import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F2-ADMIN] Rute Admin PT tanpa basis data: unduh log (cakupan, kolom,
 * CSV injection), pengingat per orang (anti-IDOR, kunci 17.00), dan batas
 * permintaan akses untuk Kepala divisi/PIC.
 */

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    user: { value: null as unknown },
    scopeUsers: { value: null as string[] | null },
    scopeEntities: { value: null as string[] | null },
    db: {
      auditLog: { findMany: fn(), count: fn(), create: fn() },
      project: { findMany: fn(), findUnique: fn() },
      division: { findMany: fn() },
      attendance: { findMany: fn() },
      notificationLog: { findFirst: fn(), create: fn() },
      dailyProjectReport: { findUnique: fn() },
      entity: { findUnique: fn() },
      user: { findMany: fn(), findUnique: fn() },
    },
  }
})

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.user.value),
  scopeUserIds: vi.fn(async () => mocks.scopeUsers.value),
  scopeEntityIds: vi.fn(async () => mocks.scopeEntities.value),
  refuseUnscoped: vi.fn(() => null),
  isGlobalRole: vi.fn((r: string) => ['MANAJEMEN', 'SUPERADMIN', 'TI', 'AUDITOR', 'DIREKTUR_SDM_GA'].includes(r)),
}))

import { GET as exportGET } from '@/app/api/audit-logs/export/route'
import { POST as remindPOST } from '@/app/api/admin/compliance/remind/route'
import { limitedRequestRefusal } from '@/lib/access-requesters'

function asUser(u: Partial<SessionUser> & Pick<SessionUser, 'role'>) {
  const user = { id: 'u-admin', name: 'Maya Lestari', email: 'maya@contoh.test', scopeEntityId: 'pt-a', avatarColor: null, ...u } as SessionUser
  mocks.user.value = user
  return user
}

beforeEach(() => {
  for (const model of Object.values(mocks.db)) for (const f of Object.values(model)) (f as ReturnType<typeof vi.fn>).mockReset()
  mocks.db.auditLog.create.mockResolvedValue({})
  mocks.db.attendance.findMany.mockResolvedValue([])
  mocks.scopeUsers.value = ['u-admin', 'u-pic']
  mocks.scopeEntities.value = ['pt-a']
})

describe('GET /api/audit-logs/export', () => {
  const req = (q = '') => exportGET(new NextRequest(`http://localhost/api/audit-logs/export${q}`))

  it('menolak PIC proyek', async () => {
    asUser({ role: 'PIC_PROYEK' })
    expect((await req()).status).toBe(403)
  })

  it('Admin PT: hanya akun PT-nya, tanpa kolom IP, aman dari CSV injection, tercatat di log', async () => {
    asUser({ id: 'u-admin-csv', role: 'ADMIN_PT' })
    mocks.db.auditLog.findMany.mockResolvedValue([
      { at: new Date('2026-10-06T03:00:00Z'), action: 'REMIND_PIC', targetType: 'PROJECT', targetId: 'p1', afterData: JSON.stringify({ pic: '=cmd|calc' }), ip: '10.0.0.1', userAgent: 'x', actor: { name: 'Maya', role: 'ADMIN_PT' } },
    ])
    mocks.db.auditLog.count.mockResolvedValue(1)
    const res = await req('?dateFrom=2026-10-01&dateTo=2026-10-06')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const text = await res.text()
    expect(text).not.toContain('10.0.0.1')
    expect(text).not.toContain('"IP"')
    expect(text).toContain('"PIC =cmd|calc"')
    const where = mocks.db.auditLog.findMany.mock.calls[0][0].where
    expect(JSON.stringify(where)).toContain('"actorId":{"in":["u-admin","u-pic"]}')
    expect(mocks.db.auditLog.create.mock.calls[0][0].data.action).toBe('EXPORT_AUDIT_LOG')
  })

  it('sel yang diawali = diberi awalan petik', async () => {
    asUser({ id: 'u-admin-inj', role: 'ADMIN_PT' })
    mocks.db.auditLog.findMany.mockResolvedValue([
      { at: new Date(), action: 'X', targetType: 'USER', targetId: '=1+1', afterData: null, ip: null, userAgent: null, actor: { name: '@jahat', role: 'PIC_PROYEK' } },
    ])
    mocks.db.auditLog.count.mockResolvedValue(1)
    const text = await (await req()).text()
    expect(text).toContain(`"'=1+1"`)
    expect(text).toContain(`"'@jahat"`)
  })

  it('peran audit:read mendapat kolom IP', async () => {
    asUser({ id: 'u-aud', role: 'AUDITOR', scopeEntityId: null })
    mocks.scopeUsers.value = null
    mocks.scopeEntities.value = null
    mocks.db.auditLog.findMany.mockResolvedValue([])
    mocks.db.auditLog.count.mockResolvedValue(0)
    const text = await (await req()).text()
    expect(text).toContain('"IP"')
  })

  it('menolak rentang lebih dari 366 hari dan tanggal rusak', async () => {
    asUser({ id: 'u-admin-range', role: 'ADMIN_PT' })
    expect((await req('?dateFrom=2024-01-01&dateTo=2026-01-01')).status).toBe(422)
    expect((await req('?dateFrom=kemarin')).status).toBe(400)
  })
})

describe('POST /api/admin/compliance/remind', () => {
  const post = (body: unknown) =>
    remindPOST(new NextRequest('http://localhost/api/admin/compliance/remind', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T09:00:00+07:00'))
  })

  it('orang di luar PT Anda → 404 (anti-IDOR)', async () => {
    asUser({ id: 'u-r1', role: 'ADMIN_PT' })
    mocks.db.project.findMany.mockResolvedValue([])
    const res = await post({ userId: 'u-pt-lain' })
    expect(res.status).toBe(404)
    expect(mocks.db.project.findMany.mock.calls[0][0].where.entityId).toEqual({ in: ['pt-a'] })
    vi.useRealTimers()
  })

  it('setelah 17.00 WIB ditolak 409', async () => {
    vi.setSystemTime(new Date('2026-10-06T17:30:00+07:00'))
    asUser({ id: 'u-r2', role: 'ADMIN_PT' })
    expect((await post({ all: true })).status).toBe(409)
    vi.useRealTimers()
  })

  it('peran tanpa hak pengingat → 403; badan ganda → 400', async () => {
    asUser({ id: 'u-r3', role: 'PIC_PROYEK' })
    expect((await post({ all: true })).status).toBe(403)
    asUser({ id: 'u-r4', role: 'ADMIN_PT' })
    expect((await post({ all: true, userId: 'x' })).status).toBe(400)
    vi.useRealTimers()
  })
})

describe('limitedRequestRefusal (permintaan akses Kepala divisi / PIC)', () => {
  beforeEach(() => {
    mocks.db.entity.findUnique.mockResolvedValue({ id: 'pt-a', name: 'PT A' })
  })

  it('kepala divisi tidak boleh menyasar akun di luar timnya', async () => {
    const u = asUser({ id: 'u-kadiv', role: 'KEPALA_DIVISI' })
    mocks.db.division.findMany.mockResolvedValue([{ id: 'd-tek', name: 'Teknologi' }])
    mocks.db.user.findMany.mockResolvedValue([{ id: 'u-yoga', name: 'Yoga', role: 'PIC_PROYEK', isActive: true, division: { name: 'Teknologi' } }])
    expect(await limitedRequestRefusal(u, 'PINDAH_PERAN', { userId: 'u-orang-lain', role: 'PIC_PROYEK' })).toMatch(/di luar tim/)
    expect(await limitedRequestRefusal(u, 'PINDAH_PERAN', { userId: 'u-yoga', role: 'PIC_PROYEK' })).toBeNull()
  })

  it('posisi di luar PIC/kepala divisi ditolak', async () => {
    const u = asUser({ id: 'u-kadiv2', role: 'KEPALA_DIVISI' })
    mocks.db.division.findMany.mockResolvedValue([{ id: 'd-tek', name: 'Teknologi' }])
    mocks.db.user.findMany.mockResolvedValue([])
    expect(await limitedRequestRefusal(u, 'AKUN_BARU', { role: 'DIREKTUR_ENTITAS' })).toMatch(/hanya dapat meminta/)
    expect(await limitedRequestRefusal(u, 'AKUN_BARU', { role: 'PIC_PROYEK', divisionId: 'd-lain' })).toMatch(/Divisi itu/)
  })

  it('Admin PT tidak dibatasi di sini', async () => {
    const u = asUser({ role: 'ADMIN_PT' })
    expect(await limitedRequestRefusal(u, 'PINDAH_PERAN', { userId: 'siapa-saja', role: 'ADMIN_PT' })).toBeNull()
  })
})
