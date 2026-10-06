import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * POST /api/notifications/remind — "Ingatkan" mingguan. Tanpa divisionId/week
 * perilakunya tetap seperti dulu (semua divisi dalam lingkup, minggu berjalan);
 * dengan keduanya Direktur mengingatkan satu divisi untuk minggu yang tampil.
 * Basis data dan sesi di-mock.
 */

const mocks = vi.hoisted(() => ({
  currentUser: { value: null as unknown },
  scope: { value: ['pt-a'] as string[] | null },
  db: {
    division: { findUnique: vi.fn(), findMany: vi.fn() },
    weeklyDivisionReport: { findMany: vi.fn() },
    notificationLog: { findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.currentUser.value),
  scopeEntityIds: vi.fn(async () => mocks.scope.value),
  refuseUnscoped: vi.fn(() => null),
}))

import { POST } from '@/app/api/notifications/remind/route'

const db = mocks.db
const wib = (isoLocal: string) => new Date(`${isoLocal}+07:00`)

const DIREKTUR: SessionUser = {
  id: 'dir-1',
  name: 'Hadi Santoso',
  email: 'hadi@contoh.test',
  role: 'DIREKTUR_ENTITAS',
  scopeEntityId: 'pt-a',
  avatarColor: null,
  mustChangePassword: false,
}

const DIVISIONS = [
  { id: 'div-ops', name: 'Operasional', entity: { id: 'pt-a', name: 'PT A', code: 'PTA' }, headUser: { id: 'kadiv-ops', name: 'Wahyu', email: 'w@contoh.test', isActive: true } },
  { id: 'div-med', name: 'Media', entity: { id: 'pt-a', name: 'PT A', code: 'PTA' }, headUser: { id: 'kadiv-med', name: 'Lina', email: 'l@contoh.test', isActive: true } },
]

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/notifications/remind', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
    })
  )

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-12T09:00:00')) // Senin 2026-W42
  for (const model of Object.values(db)) for (const f of Object.values(model)) f.mockReset()
  mocks.currentUser.value = DIREKTUR
  mocks.scope.value = ['pt-a']
  db.division.findMany.mockImplementation(async ({ where }) => DIVISIONS.filter((d) => !where.id || d.id === where.id))
  db.weeklyDivisionReport.findMany.mockResolvedValue([])
  db.notificationLog.findMany.mockResolvedValue([])
  db.notificationLog.create.mockResolvedValue({})
  db.auditLog.create.mockResolvedValue({})
})
afterEach(() => vi.useRealTimers())

describe('POST /api/notifications/remind', () => {
  it('tanpa parameter: semua divisi dalam lingkup, minggu berjalan', async () => {
    const res = await post({})
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.week).toEqual({ key: '2026-W42', isoYear: 2026, isoWeek: 42 })
    expect(body.sent).toBe(2)
    expect(db.division.findMany.mock.calls[0][0].where).not.toHaveProperty('id')
    expect(db.weeklyDivisionReport.findMany.mock.calls[0][0].where).toMatchObject({ isoYear: 2026, isoWeek: 42 })
  })

  it('satu divisi untuk minggu yang tampil (minggu lalu)', async () => {
    db.division.findUnique.mockResolvedValue({ id: 'div-ops', entityId: 'pt-a' })
    const res = await post({ divisionId: 'div-ops', week: '2026-W41' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.week.key).toBe('2026-W41')
    expect(body.sent).toBe(1)
    expect(db.division.findMany.mock.calls[0][0].where).toMatchObject({ id: 'div-ops', entityId: { in: ['pt-a'] } })
    expect(db.weeklyDivisionReport.findMany.mock.calls[0][0].where).toMatchObject({ isoYear: 2026, isoWeek: 41 })
    const payload = JSON.parse(db.notificationLog.create.mock.calls[0][0].data.payload)
    expect(payload).toMatchObject({ divisionId: 'div-ops', weekKey: '2026-W41' })
    // Minggu lalu sudah terkunci Jumat 17.00 WIB: pesannya tidak meminta "serahkan paling lambat".
    expect(payload.body).toContain('sudah dikunci sejak Jumat 17.00 WIB')
    expect(payload.body).toContain('Diingatkan oleh Hadi Santoso')
  })

  it('pengingat minggu berjalan hari ini tidak menghalangi pengingat minggu lalu', async () => {
    db.division.findUnique.mockResolvedValue({ id: 'div-ops', entityId: 'pt-a' })
    db.notificationLog.findMany.mockResolvedValue([
      { userId: 'kadiv-ops', payload: JSON.stringify({ divisionId: 'div-ops', weekKey: '2026-W42' }) },
    ])
    const lalu = await (await post({ divisionId: 'div-ops', week: '2026-W41' })).json()
    expect(lalu.results[0].outcome).toBe('TERKIRIM')
    const kini = await (await post({ divisionId: 'div-ops' })).json()
    expect(kini.results[0].outcome).toBe('SUDAH_HARI_INI')
  })

  it('divisi di luar lingkup dijawab 404, tanpa pengingat', async () => {
    db.division.findUnique.mockResolvedValue({ id: 'div-x', entityId: 'pt-lain' })
    const res = await post({ divisionId: 'div-x' })
    expect(res.status).toBe(404)
    expect(db.notificationLog.create).not.toHaveBeenCalled()
  })

  it('minggu depan ditolak 422, kunci minggu rusak 400', async () => {
    expect((await post({ week: '2026-W43' })).status).toBe(422)
    expect((await post({ week: 'kemarin' })).status).toBe(400)
  })

  it('Kepala divisi tidak mengirim pengingat: 403', async () => {
    mocks.currentUser.value = { ...DIREKTUR, role: 'KEPALA_DIVISI' }
    expect((await post({})).status).toBe(403)
  })
})
