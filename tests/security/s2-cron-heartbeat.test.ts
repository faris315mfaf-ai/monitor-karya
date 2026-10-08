import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * T2-S2 — audit pagar cron (src/lib/cron-auth.ts), rahasia operasional
 * (src/lib/operational-health.ts) dan heartbeat job (startJob/finishJob).
 * Basis data di-mock; tanpa rahasia nyata.
 */

const mocks = vi.hoisted(() => ({
  db: { auditLog: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() }, $queryRaw: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/storage', () => ({ storageConfigured: () => false, EVIDENCE_BUCKET: 'evidence' }))
vi.mock('@/lib/storage-s3', () => ({ signedS3EvidenceUrl: vi.fn(() => '') }))

import { refuseCron } from '@/lib/cron-auth'
import { finishJob, refuseOperational, startJob } from '@/lib/operational-health'

const CRON = 'x'.repeat(24) // rahasia uji, bukan nilai nyata
const OPS = 'y'.repeat(40)
const BACKUP = 'z'.repeat(40)

const originalEnv = { ...process.env }
beforeEach(() => {
  process.env.CRON_SECRET = CRON
  process.env.OPS_HEALTH_SECRET = OPS
  process.env.BACKUP_REPORT_SECRET = BACKUP
  vi.clearAllMocks()
})
afterEach(() => {
  process.env = { ...originalEnv }
})

const call = (bearer?: string) => refuseCron(new NextRequest('http://localhost/api/cron/remind-divisions', {
  method: 'GET',
  headers: bearer === undefined ? {} : { authorization: bearer },
}))

describe('S2 refuseCron', () => {
  it('rahasia hilang atau terlalu pendek: 503 tanpa menyentuh nilai lain', () => {
    delete process.env.CRON_SECRET
    expect(call(`Bearer ${CRON}`)?.status).toBe(503)
    process.env.CRON_SECRET = 'pendek'
    expect(call(`Bearer ${CRON}`)?.status).toBe(503)
  })

  it('token salah, skema salah, atau kosong: 401', () => {
    expect(call(`Bearer ${'x'.repeat(24)}!`)?.status).toBe(401)
    expect(call(`Basic ${CRON}`)?.status).toBe(401)
    expect(call('')?.status).toBe(401)
    expect(call()?.status).toBe(401)
  })

  it('token tepat (Bearer + rahasia penuh) lolos', () => {
    expect(call(`Bearer ${CRON}`)).toBeNull()
  })
})

describe('S2 refuseOperational — rahasia terpisah', () => {
  const plain = (bearer?: string) => new NextRequest('http://localhost/api/admin/ops/backup/report', {
    method: 'POST',
    headers: bearer === undefined ? {} : { authorization: bearer },
  })

  it('kurang dari 32 karakter dianggap belum dikonfigurasi (503)', () => {
    process.env.BACKUP_REPORT_SECRET = 'pendek-sekali'
    expect(refuseOperational(plain(`Bearer pendek-sekali`), 'BACKUP_REPORT_SECRET')?.status).toBe(503)
  })

  it('rahasia satu layanan tidak berlaku untuk layanan lain', () => {
    expect(refuseOperational(plain(`Bearer ${OPS}`), 'BACKUP_REPORT_SECRET')?.status).toBe(401)
    expect(refuseOperational(plain(`Bearer ${BACKUP}`), 'BACKUP_REPORT_SECRET')).toBeNull()
    expect(refuseOperational(plain(`Bearer ${BACKUP}`), 'OPS_HEALTH_SECRET')?.status).toBe(401)
    expect(refuseOperational(plain(`Bearer ${OPS}`), 'OPS_HEALTH_SECRET')).toBeNull()
  })
})

describe('S2 heartbeat job', () => {
  it('dua startJob menghasilkan dua baris berbeda; finishJob hanya membarui baris running miliknya', async () => {
    const created: Record<string, unknown>[] = []
    mocks.db.auditLog.create.mockImplementation(async ({ data }) => {
      created.push(data)
      return data
    })
    const first = await startJob('backup', 'job-1')
    const second = await startJob('backup', 'job-2')
    expect(first).toBe('job-1')
    expect(second).toBe('job-2')
    expect(created).toHaveLength(2)

    const wheres: Record<string, unknown>[] = []
    mocks.db.auditLog.updateMany.mockImplementation(async ({ where, data }) => {
      wheres.push(where)
      return { count: where.id === 'job-1' ? 1 : 0 }
    })
    expect(await finishJob('backup', 'job-1', 'success')).toBe(true)
    expect(await finishJob('backup', 'job-2', 'success')).toBe(false)
    // Klaim bersyarat: hanya baris running milik id itu, dalam jendela maxRun.
    expect(wheres[0]).toMatchObject({ id: 'job-1', targetId: 'backup', action: 'OPS_RUNNING' })
    expect((wheres[0] as { at?: unknown }).at).toMatchObject({ gte: expect.any(Date), lte: expect.any(Date) })
  })

  it('replay finishJob tidak bisa mengubah hasil yang sudah final', async () => {
    mocks.db.auditLog.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 })
    expect(await finishJob('kpi-snapshot', 'job-x', 'failure')).toBe(true)
    // Penunda laporan sukses setelah run ditandai gagal: baris bukan running lagi.
    expect(await finishJob('kpi-snapshot', 'job-x', 'success')).toBe(false)
  })
})
