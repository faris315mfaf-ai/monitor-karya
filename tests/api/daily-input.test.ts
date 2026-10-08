import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * Pembekuan laporan harian dan buka kunci (6 Okt 2026), tanpa basis data:
 * @/lib/db dan @/lib/auth di-mock. Laporan dan buka kunci disimpan di memori
 * supaya `dailyGate` dan `activeUnlockFor` menjalankan pemeriksaan aslinya.
 */

type Report = {
  id: string
  projectId: string
  entityId: string
  reportDate: Date
  status: string
  progressPct: number
  achievementToday: string
  obstacle: string | null
  followUp: string | null
  submittedAt: Date | null
  forwardedAt: Date | null
  isLocked: boolean
}
type Unlock = { id: string; targetType: string; targetId: string; status: string; unlockUntil: Date | null; reLockedAt: Date | null }

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    currentUser: { value: null as unknown },
    reports: [] as Report[],
    unlocks: [] as Unlock[],
    db: {
      project: { findUnique: fn() },
      dailyProjectReport: { findUnique: fn(), update: fn(), create: fn(), delete: fn(), updateMany: fn() },
      unlockRequest: { findFirst: fn() },
      evidence: { count: fn(), findMany: fn(), deleteMany: fn() },
      task: { findMany: fn(), findUnique: fn(), create: fn(), aggregate: fn(), update: fn(), delete: fn() },
      subtask: { deleteMany: fn() },
      user: { findFirst: fn() },
      auditLog: { create: fn() },
      $transaction: fn(),
      $queryRaw: fn(),
    },
  }
})

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: vi.fn(async () => mocks.currentUser.value) }))
vi.mock('@/lib/storage', () => ({ removeEvidence: vi.fn(), storageConfigured: () => false }))

import { DELETE as DAILY_DELETE, PUT as DAILY_PUT } from '@/app/api/daily-input/route'
import { DELETE as TASK_DELETE, POST as TASK_POST, PUT as TASK_PUT } from '@/app/api/tasks/route'
import { FORWARDED_FROZEN_MESSAGE } from '@/lib/daily-rollup'

const db = mocks.db
const wib = (isoLocal: string) => new Date(`${isoLocal}+07:00`)

// Selasa 6 Okt 2026 pukul 10.00 WIB: hari kerja, sebelum tenggat 17.00.
const NOW = wib('2026-10-06T10:00:00')
const TODAY = wib('2026-10-06T00:00:00')
const MONDAY = wib('2026-10-05T00:00:00')

const PROJECT = { id: 'p-1', entityId: 'e-1', picUserId: 'pic-1', phase: 'PELAKSANAAN', code: 'PRJ-1', name: 'Aplikasi Absensi' }

function asPic() {
  const user: SessionUser = { id: 'pic-1', name: 'Rina Kartika', email: 'rina@contoh.test', role: 'PIC_PROYEK', scopeEntityId: 'e-1', avatarColor: null }
  mocks.currentUser.value = user
  return user
}

function addReport(over: Partial<Report> = {}): Report {
  const r: Report = {
    id: `r-${mocks.reports.length + 1}`,
    projectId: PROJECT.id,
    entityId: PROJECT.entityId,
    reportDate: TODAY,
    status: 'ON_PROGRESS',
    progressPct: 40,
    achievementToday: 'Modul izin selesai diuji',
    obstacle: null,
    followUp: null,
    submittedAt: wib('2026-10-06T09:00:00'),
    forwardedAt: null,
    isLocked: false,
    ...over,
  }
  mocks.reports.push(r)
  return r
}

function unlock(reportId: string, over: Partial<Unlock> = {}): Unlock {
  const u: Unlock = {
    id: `u-${mocks.unlocks.length + 1}`,
    targetType: 'DAILY_REPORT',
    targetId: reportId,
    status: 'DIEKSEKUSI',
    unlockUntil: new Date(NOW.getTime() + 24 * 3600000),
    reLockedAt: null,
    ...over,
  }
  mocks.unlocks.push(u)
  return u
}

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const putDaily = (body: Record<string, unknown>) =>
  DAILY_PUT(jsonReq('/api/daily-input', 'PUT', { projectId: PROJECT.id, action: 'submit', status: 'ON_PROGRESS', achievementToday: 'Uji modul cuti', progressPct: 50, ...body }))

function findReport(where: { id?: string; projectId_reportDate?: { projectId: string; reportDate: Date } }) {
  if (where.id) return mocks.reports.find((r) => r.id === where.id) ?? null
  const k = where.projectId_reportDate!
  return mocks.reports.find((r) => r.projectId === k.projectId && r.reportDate.getTime() === k.reportDate.getTime()) ?? null
}

function resetDb() {
  mocks.reports.length = 0
  mocks.unlocks.length = 0
  for (const [name, model] of Object.entries(db)) {
    if (name === '$transaction' || name === '$queryRaw') continue
    for (const f of Object.values(model as Record<string, ReturnType<typeof vi.fn>>)) f.mockReset()
  }
  db.$transaction.mockReset()
  db.$queryRaw.mockReset()
  db.$queryRaw.mockResolvedValue([])
  db.project.findUnique.mockImplementation(async () => PROJECT)
  db.dailyProjectReport.findUnique.mockImplementation(async ({ where }: { where: Parameters<typeof findReport>[0] }) => findReport(where))
  db.dailyProjectReport.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Report> }) => {
    const r = findReport(where)!
    Object.assign(r, data)
    return r
  })
  db.dailyProjectReport.create.mockImplementation(async ({ data }: { data: Partial<Report> }) => addReport({ ...data, submittedAt: data.submittedAt ?? null }))
  db.dailyProjectReport.delete.mockResolvedValue({})
  db.unlockRequest.findFirst.mockImplementation(
    async ({ where }: { where: { targetType: string; targetId: string; status: string; unlockUntil: { gt: Date } } }) =>
      mocks.unlocks.find(
        (u) =>
          u.targetType === where.targetType &&
          u.targetId === where.targetId &&
          u.status === where.status &&
          u.reLockedAt === null &&
          u.unlockUntil !== null &&
          u.unlockUntil > where.unlockUntil.gt
      ) ?? null
  )
  db.evidence.count.mockResolvedValue(1)
  db.evidence.findMany.mockResolvedValue([])
  db.evidence.deleteMany.mockResolvedValue({ count: 0 })
  db.task.findMany.mockResolvedValue([])
  db.task.aggregate.mockResolvedValue({ _max: { sortOrder: null } })
  db.task.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 't-new', ...data }))
  db.task.delete.mockResolvedValue({})
  db.user.findFirst.mockResolvedValue({ id: 'pic-1' })
  db.auditLog.create.mockResolvedValue({})
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: typeof db) => unknown)(db) : Promise.all(arg as unknown[])
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetDb()
  asPic()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PUT /api/daily-input — pembekuan setelah diteruskan', () => {
  it('menolak 409 bila laporan hari ini sudah diteruskan ke holding', async () => {
    addReport({ forwardedAt: wib('2026-10-06T09:30:00'), isLocked: true })
    const res = await putDaily({})
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe(FORWARDED_FROZEN_MESSAGE)
    expect(json.frozen).toBe('FORWARDED')
    expect(db.dailyProjectReport.update).not.toHaveBeenCalled()
  })

  it('tetap membekukan data lama yang diteruskan tanpa isLocked', async () => {
    addReport({ forwardedAt: wib('2026-10-06T09:30:00'), isLocked: false })
    const res = await putDaily({ action: 'save' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(FORWARDED_FROZEN_MESSAGE)
  })

  it('mengizinkan perubahan selama buka kunci berlaku dan mencatatnya', async () => {
    const r = addReport({ forwardedAt: wib('2026-10-06T09:30:00'), isLocked: false })
    const u = unlock(r.id)
    const res = await putDaily({ progressPct: 64 })
    expect(res.status).toBe(200)
    expect(db.dailyProjectReport.update).toHaveBeenCalledTimes(1)
    const audit = JSON.parse(db.auditLog.create.mock.calls[0][0].data.afterData)
    expect(audit.unlockRequestId).toBe(u.id)
    expect(audit.afterForward).toBe(true)
  })

  it('buka kunci yang sudah lewat masanya tidak berlaku', async () => {
    const r = addReport({ forwardedAt: wib('2026-10-06T09:30:00') })
    unlock(r.id, { unlockUntil: wib('2026-10-06T09:59:00') })
    expect((await putDaily({})).status).toBe(409)
  })

  it('buka kunci yang dikunci kembali lebih awal tidak berlaku', async () => {
    const r = addReport({ forwardedAt: wib('2026-10-06T09:30:00') })
    unlock(r.id, { reLockedAt: wib('2026-10-06T09:45:00') })
    expect((await putDaily({})).status).toBe(409)
  })

  it('laporan yang belum diteruskan tetap bisa dikirim ulang sebelum 17.00', async () => {
    addReport()
    expect((await putDaily({})).status).toBe(200)
  })
})

describe('PUT /api/daily-input — reportDate', () => {
  it('menolak tanggal lampau yang tidak sedang dibuka', async () => {
    addReport({ reportDate: MONDAY })
    const res = await putDaily({ reportDate: '2026-10-05' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/tidak sedang dibuka/)
  })

  it('menolak tanggal lampau tanpa laporan (tidak ada yang bisa dibuka)', async () => {
    expect((await putDaily({ reportDate: '2026-10-02' })).status).toBe(409)
    expect(db.dailyProjectReport.create).not.toHaveBeenCalled()
  })

  it('menulis laporan tanggal lampau yang dibuka', async () => {
    const r = addReport({ reportDate: MONDAY, submittedAt: null, isLocked: false })
    unlock(r.id)
    const res = await putDaily({ reportDate: '2026-10-05', progressPct: 70 })
    expect(res.status).toBe(200)
    expect(db.dailyProjectReport.update.mock.calls[0][0].where).toEqual({ id: r.id })
    // Dikirim setelah tenggat lewat buka kunci: tercatat terlambat.
    expect(db.dailyProjectReport.update.mock.calls[0][0].data.isLate).toBe(true)
  })

  it('menolak tanggal masa depan, akhir pekan, dan tanggal mustahil', async () => {
    expect((await putDaily({ reportDate: '2026-10-07' })).status).toBe(422)
    expect((await putDaily({ reportDate: '2026-10-04' })).status).toBe(422) // Minggu
    expect((await putDaily({ reportDate: '2026-02-31' })).status).toBe(400)
  })

  it('menolak status yang tidak dikenal', async () => {
    expect((await putDaily({ status: 'BEBAS' })).status).toBe(422)
  })

  it('menolak PIC lain (anti-IDOR)', async () => {
    db.project.findUnique.mockImplementation(async () => ({ ...PROJECT, picUserId: 'pic-lain' }))
    expect((await putDaily({})).status).toBe(403)
  })
})

describe('DELETE /api/daily-input', () => {
  it('menolak menghapus laporan yang sudah diteruskan', async () => {
    addReport({ forwardedAt: wib('2026-10-06T09:30:00'), isLocked: true })
    const res = await DAILY_DELETE(jsonReq(`/api/daily-input?projectId=${PROJECT.id}`, 'DELETE'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(FORWARDED_FROZEN_MESSAGE)
    expect(db.dailyProjectReport.delete).not.toHaveBeenCalled()
  })

  it('tetap menolak walau sedang dibuka: holding sudah menerimanya', async () => {
    const r = addReport({ forwardedAt: wib('2026-10-06T09:30:00') })
    unlock(r.id)
    const res = await DAILY_DELETE(jsonReq(`/api/daily-input?projectId=${PROJECT.id}`, 'DELETE'))
    expect(res.status).toBe(409)
    expect(db.dailyProjectReport.delete).not.toHaveBeenCalled()
  })

  it('menghapus draf yang belum diteruskan', async () => {
    addReport({ submittedAt: null })
    const res = await DAILY_DELETE(jsonReq(`/api/daily-input?projectId=${PROJECT.id}`, 'DELETE'))
    expect(res.status).toBe(200)
    expect(db.dailyProjectReport.delete).toHaveBeenCalledTimes(1)
  })
})

describe('/api/tasks — task ikut dibekukan', () => {
  const task = (over: Record<string, unknown> = {}) => ({
    id: 't-1',
    projectId: PROJECT.id,
    entityId: PROJECT.entityId,
    workDate: TODAY,
    scope: 'HARIAN',
    status: 'BERJALAN',
    progressPct: 30,
    picUserId: null,
    sortOrder: 0,
    escalationId: null,
    subtasks: [],
    ...over,
  })

  it('POST ditolak 409 bila laporan hari ini sudah diteruskan', async () => {
    addReport({ forwardedAt: wib('2026-10-06T09:30:00'), isLocked: true })
    const res = await TASK_POST(jsonReq('/api/tasks', 'POST', { projectId: PROJECT.id, title: 'Uji modul cuti' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(FORWARDED_FROZEN_MESSAGE)
    expect(db.task.create).not.toHaveBeenCalled()
  })

  it('PUT dan DELETE ditolak 409 untuk task hari yang dibekukan', async () => {
    addReport({ forwardedAt: wib('2026-10-06T09:30:00'), isLocked: true })
    db.task.findUnique.mockResolvedValue(task())
    const put = await TASK_PUT(jsonReq('/api/tasks', 'PUT', { id: 't-1', title: 'Uji modul cuti', status: 'SELESAI' }))
    expect(put.status).toBe(409)
    const del = await TASK_DELETE(jsonReq('/api/tasks?id=t-1', 'DELETE'))
    expect(del.status).toBe(409)
    expect(db.task.delete).not.toHaveBeenCalled()
  })

  it('POST ke tanggal lampau diterima hanya selama laporannya dibuka', async () => {
    const r = addReport({ reportDate: MONDAY, forwardedAt: wib('2026-10-05T16:00:00'), isLocked: false })
    const body = { projectId: PROJECT.id, title: 'Perbaikan catatan uji', workDate: '2026-10-05' }

    expect((await TASK_POST(jsonReq('/api/tasks', 'POST', body))).status).toBe(409)

    unlock(r.id)
    const res = await TASK_POST(jsonReq('/api/tasks', 'POST', body))
    expect(res.status).toBe(200)
    expect(db.task.create.mock.calls[0][0].data.workDate.getTime()).toBe(MONDAY.getTime())
  })

  it('POST menolak tanggal masa depan', async () => {
    const res = await TASK_POST(jsonReq('/api/tasks', 'POST', { projectId: PROJECT.id, title: 'Besok', workDate: '2026-10-07' }))
    expect(res.status).toBe(422)
  })

  it('task bercakupan MINGGUAN tidak ikut beku', async () => {
    addReport({ forwardedAt: wib('2026-10-06T09:30:00'), isLocked: true })
    db.task.findUnique.mockResolvedValue(task({ scope: 'MINGGUAN', escalationId: null }))
    const res = await TASK_DELETE(jsonReq('/api/tasks?id=t-1&context=MINGGUAN', 'DELETE'))
    expect(res.status).toBe(200)
  })
})

describe('PUT /api/daily-input — tabrakan pembuat pertama bersamaan (P2002)', () => {
  it('menerjemahkan P2002 dari constraint unik menjadi 409 coba-lagi, bukan 500', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed on the fields: (`projectId`,`reportDate`)'), { code: 'P2002' })
    db.$transaction.mockImplementationOnce(() => Promise.reject(p2002))
    const res = await putDaily({})
    expect(res.status).toBe(409)
    const json = (await res.json()) as { error: string; locked: boolean }
    expect(json.error).toContain('bersamaan')
    expect(json.error).toContain('kirim lagi')
    expect(json.locked).toBe(false)
  })

  it('galat non-P2002 tetap diteruskan (bukan ditelan)', async () => {
    db.$transaction.mockImplementationOnce(() => Promise.reject(new Error('db hilang')))
    await expect(putDaily({})).rejects.toThrow('db hilang')
  })
})
