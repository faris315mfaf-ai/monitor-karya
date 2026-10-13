import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/** [T11-DB] PUT /api/admin/report-settings mencatat UPDATE_REPORT_SETTINGS (sebelum/sesudah). */

const mocks = vi.hoisted(() => ({
  user: { value: null as unknown },
  db: {
    reportSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.user.value),
  scopeEntityIds: vi.fn(async () => ['pt-a']),
  isGlobalRole: vi.fn(() => false),
  refuseUnscoped: vi.fn(),
}))

import { PUT } from '@/app/api/admin/report-settings/route'

const db = mocks.db
const ADMIN = { id: 'admin-1', name: 'Admin', email: 'a@x.test', role: 'ADMIN_PT', scopeEntityId: 'pt-a', avatarColor: null, mustChangePassword: false } as SessionUser
const put = (body: unknown) =>
  PUT(new NextRequest('http://localhost/api/admin/report-settings', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))

const lama = { dailyCutoffHour: 17, weeklyCutoffHour: 17, workingDays: [1, 2, 3, 4, 5], dailyOpen: true, weeklyOpen: true }

beforeEach(() => {
  for (const g of [db.reportSettings, db.auditLog]) for (const f of Object.values(g)) f.mockReset()
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  mocks.user.value = ADMIN
})

describe('PUT /api/admin/report-settings', () => {
  it('menulis audit dengan data sebelum dan sesudah dalam transaksi yang sama', async () => {
    db.reportSettings.findUnique.mockResolvedValue(lama)
    db.reportSettings.upsert.mockResolvedValue({ ...lama, dailyCutoffHour: null })
    const res = await put({ entityId: 'pt-a', dailyCutoffHour: null })
    expect(res.status).toBe(200)
    expect(db.$transaction).toHaveBeenCalled()
    const data = db.auditLog.create.mock.calls[0][0].data
    expect(data).toMatchObject({ actorId: 'admin-1', action: 'UPDATE_REPORT_SETTINGS', targetType: 'REPORT_SETTINGS', targetId: 'pt-a' })
    expect(JSON.parse(data.beforeData).dailyCutoffHour).toBe(17)
    expect(JSON.parse(data.afterData).dailyCutoffHour).toBeNull()
  })

  it('pembuatan pertama: beforeData kosong', async () => {
    db.reportSettings.findUnique.mockResolvedValue(null)
    db.reportSettings.upsert.mockResolvedValue({ ...lama, dailyOpen: false })
    await put({ entityId: 'pt-a', dailyOpen: false })
    expect(db.auditLog.create.mock.calls[0][0].data.beforeData).toBeNull()
  })
})

/**
 * [N-01] PUT parsial digabung ke aturan EFEKTIF saat ini. Upsert tiruan meniru Prisma:
 * `create` jatuh ke bawaan kolom schema (workingDays [], cutoff null) untuk medan yang
 * tidak diisi, `update` hanya menimpa medan yang dikirim.
 */
describe('PUT /api/admin/report-settings — penggabungan parsial (N-01)', () => {
  const BAWAAN_SCHEMA = { dailyCutoffHour: null, weeklyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyOpen: true }
  let baris: Record<string, unknown> | null

  beforeEach(() => {
    baris = null
    db.reportSettings.findUnique.mockImplementation(async () => baris)
    db.reportSettings.upsert.mockImplementation(
      async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        baris = baris ? { ...baris, ...update } : { ...BAWAAN_SCHEMA, ...create }
        return baris
      },
    )
  })

  it('entitas tanpa baris: {dailyCutoffHour: 15} → hari kerja tetap Sen–Jum, mingguan tetap 17', async () => {
    const res = await put({ entityId: 'pt-a', dailyCutoffHour: 15 })
    expect(res.status).toBe(200)
    const { settings } = await res.json()
    expect(settings).toMatchObject({ dailyCutoffHour: 15, workingDays: [1, 2, 3, 4, 5], weeklyCutoffHour: 17, dailyOpen: true, weeklyOpen: true })
    expect(db.reportSettings.upsert.mock.calls[0][0].create).toMatchObject({
      entityId: 'pt-a', dailyCutoffHour: 15, workingDays: [1, 2, 3, 4, 5], weeklyCutoffHour: 17, dailyOpen: true, weeklyOpen: true,
    })
    // `update` tetap hanya berisi medan yang dikirim.
    expect(db.reportSettings.upsert.mock.calls[0][0].update).toEqual({ dailyCutoffHour: 15 })
  })

  it('entitas tanpa baris: "Tutup pengisian" tidak mengubah jam harian ke 24/7', async () => {
    const { settings } = await (await put({ entityId: 'pt-a', dailyOpen: false })).json()
    expect(settings).toMatchObject({ dailyOpen: false, dailyCutoffHour: 17, workingDays: [1, 2, 3, 4, 5], weeklyCutoffHour: 17 })
  })

  it('entitas tanpa baris: nilai null/kosong yang dikirim eksplisit tetap dihormati', async () => {
    const { settings } = await (await put({ entityId: 'pt-a', dailyCutoffHour: null, workingDays: [] })).json()
    expect(settings).toMatchObject({ dailyCutoffHour: null, workingDays: [], weeklyCutoffHour: 17 })
  })

  it('bawaan kode tidak ikut termutasi oleh simpanan', async () => {
    await put({ entityId: 'pt-a', dailyCutoffHour: 9 })
    const { DEFAULT_SETTINGS } = await import('@/lib/report-settings')
    const arr = db.reportSettings.upsert.mock.calls[0][0].create.workingDays
    expect(arr).not.toBe(DEFAULT_SETTINGS.workingDays)
    expect(DEFAULT_SETTINGS).toEqual({ dailyCutoffHour: 17, workingDays: [1, 2, 3, 4, 5], dailyOpen: true, weeklyCutoffHour: 17, weeklyOpen: true })
  })

  it('entitas dengan baris (24/7, setiap hari): PUT parsial hanya mengubah medan yang dikirim', async () => {
    baris = { entityId: 'pt-a', dailyCutoffHour: null, weeklyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyOpen: true }
    const { settings } = await (await put({ entityId: 'pt-a', weeklyOpen: false })).json()
    expect(settings).toMatchObject({ dailyCutoffHour: null, weeklyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyOpen: false })
    expect(db.reportSettings.upsert.mock.calls[0][0].update).toEqual({ weeklyOpen: false })
  })

  it('entitas dengan baris: hari kerja diubah, jam harian & mingguan tetap', async () => {
    baris = { entityId: 'pt-a', dailyCutoffHour: 20, weeklyCutoffHour: 15, workingDays: [1, 2, 3, 4, 5], dailyOpen: true, weeklyOpen: true }
    const { settings } = await (await put({ entityId: 'pt-a', workingDays: [1, 2, 3, 4, 5, 6] })).json()
    expect(settings).toMatchObject({ dailyCutoffHour: 20, weeklyCutoffHour: 15, workingDays: [1, 2, 3, 4, 5, 6] })
  })

  it('audit simpan pertama: beforeData kosong, afterData berisi aturan lengkap hasil penggabungan', async () => {
    await put({ entityId: 'pt-a', dailyCutoffHour: 15 })
    const data = db.auditLog.create.mock.calls[0][0].data
    expect(data).toMatchObject({ action: 'UPDATE_REPORT_SETTINGS', targetId: 'pt-a', beforeData: null })
    expect(JSON.parse(data.afterData)).toEqual({ dailyCutoffHour: 15, weeklyCutoffHour: 17, workingDays: [1, 2, 3, 4, 5], dailyOpen: true, weeklyOpen: true })
  })

  it('audit baris yang ada: sebelum/sesudah hanya berbeda pada medan yang dikirim', async () => {
    baris = { entityId: 'pt-a', dailyCutoffHour: 17, weeklyCutoffHour: 17, workingDays: [1, 2, 3, 4, 5], dailyOpen: true, weeklyOpen: true }
    await put({ entityId: 'pt-a', weeklyCutoffHour: null })
    const data = db.auditLog.create.mock.calls[0][0].data
    const before = JSON.parse(data.beforeData)
    const after = JSON.parse(data.afterData)
    expect(after).toEqual({ ...before, weeklyCutoffHour: null })
    expect(before.weeklyCutoffHour).toBe(17)
  })
})
