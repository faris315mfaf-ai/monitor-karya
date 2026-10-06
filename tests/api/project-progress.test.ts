import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * GET /api/project-progress tanpa basis data [F2-PIC]: @/lib/db dan
 * @/lib/auth di-mock. Memeriksa anti-IDOR, bentuk jawaban, dan bahwa tabel
 * fitur P2 yang belum ada (migrasi belum diterapkan) tidak menggagalkan route.
 */

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    currentUser: { value: null as unknown },
    db: {
      project: { findUnique: fn() },
      dailyProjectReport: { findMany: fn() },
      projectStage: { findMany: fn() },
      output: { findMany: fn() },
      deadlineProposal: { findFirst: fn() },
      division: { findMany: fn(), count: fn() },
      user: { findUnique: fn() },
    },
  }
})

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/auth', () => ({
  requireApiUser: vi.fn(async () => mocks.currentUser.value),
  scopeEntityIds: vi.fn(async () => null),
}))

import { GET } from '@/app/api/project-progress/route'

const db = mocks.db
const d = (k: string) => new Date(`${k}T00:00:00+07:00`)
const at = (k: string, hh: number) => new Date(`${k}T${String(hh).padStart(2, '0')}:00:00+07:00`)

const PROJECT = { id: 'p1', name: 'Aplikasi Absensi', entityId: 'e1', picUserId: 'u-pic', targetEndDate: d('2026-10-24'), divisionId: null }

function asUser(u: Partial<SessionUser> & Pick<SessionUser, 'role'>) {
  mocks.currentUser.value = { id: 'u-pic', name: 'Rina', email: 'rina@contoh.test', scopeEntityId: 'e1', avatarColor: null, ...u }
}
const get = (projectId: string | null) =>
  GET(new NextRequest(`http://localhost/api/project-progress${projectId === null ? '' : `?projectId=${projectId}`}`))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(at('2026-10-06', 15)) // Selasa, sebelum tenggat 17.00
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db.project.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
    'picUserId' in select ? PROJECT : { startDate: d('2026-08-01'), targetEndDate: d('2026-10-24') }
  )
  db.dailyProjectReport.findMany.mockResolvedValue([
    { reportDate: d('2026-10-02'), progressPct: 58, status: 'ON_PROGRESS', submittedAt: at('2026-10-02', 16), forwardedAt: at('2026-10-02', 18), isLate: false },
    { reportDate: d('2026-10-05'), progressPct: 62, status: 'ON_PROGRESS', submittedAt: at('2026-10-05', 17), forwardedAt: null, isLate: true },
    { reportDate: d('2026-10-06'), progressPct: 64, status: 'TERKENDALA', submittedAt: at('2026-10-06', 14), forwardedAt: null, isLate: false },
  ])
  db.projectStage.findMany.mockResolvedValue([
    { id: 's1', name: 'Pengembangan', position: 0, startDate: d('2026-08-01'), dueDate: d('2026-09-30'), status: 'SELESAI', note: null },
    { id: 's2', name: 'Uji coba', position: 1, startDate: d('2026-10-01'), dueDate: d('2026-10-09'), status: 'TERTAHAN', note: 'Perangkat terlambat' },
  ])
  db.output.findMany.mockResolvedValue([{ id: 'o1', title: 'Panduan pengguna', status: 'PERLU_REVISI', dueDate: d('2026-10-08') }])
  db.deadlineProposal.findFirst.mockResolvedValue({ proposedDate: d('2026-10-31') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Object.values(db).forEach((m) => Object.values(m).forEach((f) => f.mockReset()))
})

describe('GET /api/project-progress', () => {
  it('menolak PIC proyek lain (403) dan proyek yang tidak ada (404)', async () => {
    asUser({ role: 'PIC_PROYEK', id: 'u-lain' })
    expect((await get('p1')).status).toBe(403)
    db.project.findUnique.mockResolvedValueOnce(null)
    expect((await get('p-x')).status).toBe(404)
    expect((await get(null)).status).toBe(400)
    expect(db.dailyProjectReport.findMany).not.toHaveBeenCalled()
  })

  it('mengembalikan jam kirim hari ini, rencana dari tahapan, tenggat, dan riwayat 6 hari kerja', async () => {
    asUser({ role: 'PIC_PROYEK' })
    const res = await get('p1')
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.today.submittedAt).toBe(at('2026-10-06', 14).toISOString())
    expect(j.plan.source).toBe('STAGES')
    expect(j.plan.weeks).toHaveLength(6)
    expect(j.plan.weeks.at(-1)).toMatchObject({ label: 'M41', actual: 64, reported: true })
    expect(j.deadlines.map((x: { id: string }) => x.id)).toEqual(['o1:output', 's2:due', 'project:target'])
    expect(j.deadlines[1]).toMatchObject({ state: 'risk', note: 'Perangkat terlambat' })
    expect(j.history.map((h: { state: string }) => h.state)).toEqual(['MISSING', 'MISSING', 'MISSING', 'FORWARDED', 'LATE', 'SENT'])
  })

  it('tetap menjawab bila tabel tahapan/output belum ada (migrasi belum diterapkan)', async () => {
    asUser({ role: 'PIC_PROYEK' })
    db.projectStage.findMany.mockRejectedValue(new Error('relation "ProjectStage" does not exist'))
    db.output.findMany.mockRejectedValue(new Error('relation "Output" does not exist'))
    db.deadlineProposal.findFirst.mockRejectedValue(new Error('relation "DeadlineProposal" does not exist'))
    const res = await get('p1')
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.plan.source).toBe('LINEAR')
    expect(j.deadlines.map((x: { id: string }) => x.id)).toEqual(['project:target'])
  })

  it('galat tak terduga menjadi 500 dengan pesan umum', async () => {
    asUser({ role: 'PIC_PROYEK' })
    db.dailyProjectReport.findMany.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432'))
    const res = await get('p1')
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/ECONN/)
  })
})
