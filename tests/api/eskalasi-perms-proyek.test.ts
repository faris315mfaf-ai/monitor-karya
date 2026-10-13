import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { asUser, db, matches, resetWorld, wib } from './pic-world'

/*
 * [B3] GET /api/escalations: kolom `perms` per item (izin tinjau/putuskan/tutup
 * akun ini, sumber yang sama dengan layar web), saringan `projectId` dengan cek
 * hubungan proyek, irisan PIC/kepala divisi tetap berlaku, dan saringan
 * lewat-SLA yang kini dihitung sebelum paginasi.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => ({ ...(await import('./pic-world')).auth }))

import { GET } from '@/app/api/escalations/route'
import { escalationPerms } from '@/lib/escalation-perms'
import { ROLE_CAPABILITIES } from '@/lib/rbac'

type Row = Record<string, unknown>
type Where = Record<string, unknown>

const REPORTS = [
  { id: 'r-1', projectId: 'p-1', entityId: 'pt-a' },
  { id: 'r-2', projectId: 'p-2', entityId: 'pt-a' },
  { id: 'r-3', projectId: 'p-3', entityId: 'pt-b' },
]
const TASKS = [
  { id: 't-1', projectId: 'p-1', escalationId: 'esc-t1' },
  // Eskalasi task lama (tautan balik sudah lepas) tetap milik proyek lewat sourceId.
  { id: 't-2', projectId: 'p-2', escalationId: null },
]

const esc = (id: string, sourceType: string, sourceId: string, entityId: string, status: string, raisedById: string, raisedAt: string) => ({
  id, sourceType, sourceId, entityId, status, raisedById, raisedAt: wib(raisedAt), slaDays: 7,
  summary: `Ringkasan ${id}`, needed: 'KEPUTUSAN', decidedById: null, decidedAt: null, decisionText: null,
  entity: { id: entityId, name: entityId, code: entityId.toUpperCase(), region: null },
  raisedBy: { id: raisedById, name: raisedById, email: `${raisedById}@contoh.test` },
  decidedBy: null,
})

const ESCALATIONS = [
  esc('esc-r1', 'DAILY_REPORT', 'r-1', 'pt-a', 'DIAJUKAN', 'pic-1', '2026-10-11T09:00:00'), // 0-1 hari
  esc('esc-t1', 'TASK', 't-1', 'pt-a', 'DITINJAU', 'pic-1', '2026-09-30T09:00:00'), // lewat SLA
  esc('esc-r2', 'DAILY_REPORT', 'r-2', 'pt-a', 'DIPUTUSKAN', 'pic-2', '2026-09-29T09:00:00'), // lewat SLA
  esc('esc-t2', 'TASK', 't-2', 'pt-a', 'DITUTUP', 'pic-2', '2026-09-20T09:00:00'), // lewat SLA
  esc('esc-wk', 'WEEKLY_ITEM', 'w-1', 'pt-a', 'DIAJUKAN', 'kadiv-1', '2026-10-10T09:00:00'),
  esc('esc-r3', 'DAILY_REPORT', 'r-3', 'pt-b', 'DIPUTUSKAN', 'pic-3', '2026-10-09T09:00:00'),
]

/** Saringan relasi `project: {...}` dievaluasi lewat db.project.findMany fixture. */
async function byProject<T extends Row>(rows: T[], where: Where = {}): Promise<T[]> {
  const { project, ...rest } = where
  let ids: Set<string> | null = null
  if (project) {
    const ps = (await db.project.findMany({ where: project })) as Row[]
    ids = new Set(ps.map((p) => p.id as string))
  }
  return rows.filter((r) => (ids ? ids.has(r.projectId as string) : true) && matches(r, rest))
}

const sorted = () => [...ESCALATIONS].sort((a, b) => b.raisedAt.getTime() - a.raisedAt.getTime() || (a.id < b.id ? 1 : -1))

const getReq = (url: string) => new NextRequest(`http://localhost${url}`, { headers: { 'user-agent': 'vitest' } })

async function list(query = '') {
  const res = await GET(getReq(`/api/escalations${query}`))
  return { status: res.status, body: await res.json() }
}
const ids = (body: { items: { id: string }[] }) => body.items.map((i) => i.id).sort()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-12T10:00:00'))
  resetWorld()
  vi.spyOn(console, 'error').mockImplementation(() => {})

  db.dailyProjectReport.findMany.mockImplementation(async ({ where }: { where?: Where } = {}) => byProject(REPORTS, where))
  db.task.findMany.mockImplementation(async ({ where }: { where?: Where } = {}) => byProject(TASKS, where))
  db.weeklyReportItem.findMany.mockImplementation(async ({ where }: { where: { weeklyReport: { division: Where } } }) =>
    // Butir w-1 milik divisi div-a1 (kepala kadiv-1).
    (where.weeklyReport.division as Where).headUserId === 'kadiv-1' ? [{ id: 'w-1' }] : []
  )
  db.escalation.findMany.mockImplementation(
    async ({ where, skip = 0, take, select }: { where?: Where; skip?: number; take?: number; select?: Row }) => {
      const rows = sorted().filter((e) => matches(e as unknown as Row, where))
      const page = rows.slice(skip, take === undefined ? undefined : skip + take)
      return select ? page.map((e) => Object.fromEntries(Object.keys(select).map((k) => [k, (e as Row)[k]]))) : page
    }
  )
  db.escalation.count.mockImplementation(async ({ where }: { where?: Where }) => sorted().filter((e) => matches(e as unknown as Row, where)).length)
})
afterEach(() => vi.useRealTimers())

describe('perms per item', () => {
  it('Manajemen: tinjau+putuskan saat diajukan, tutup saat diputuskan, tidak ada untuk ditutup', async () => {
    asUser('mgmt')
    const { status, body } = await list()
    expect(status).toBe(200)
    const p = Object.fromEntries(body.items.map((i: { id: string; perms: unknown }) => [i.id, i.perms]))
    expect(p['esc-r1']).toEqual({ mayReview: true, mayDecide: true, mayClose: false })
    expect(p['esc-t1']).toEqual({ mayReview: false, mayDecide: true, mayClose: false })
    expect(p['esc-r2']).toEqual({ mayReview: false, mayDecide: false, mayClose: true })
    expect(p['esc-t2']).toEqual({ mayReview: false, mayDecide: false, mayClose: false })
    expect(body.items).toHaveLength(ESCALATIONS.length)
  })

  it('Direktur entitas: hanya PT-nya, meninjau tanpa memutuskan', async () => {
    asUser('dir-a')
    const { body } = await list()
    expect(ids(body)).not.toContain('esc-r3')
    const r1 = body.items.find((i: { id: string }) => i.id === 'esc-r1')
    expect(r1.perms).toEqual({ mayReview: true, mayDecide: false, mayClose: false })
    const r2 = body.items.find((i: { id: string }) => i.id === 'esc-r2')
    expect(r2.perms).toEqual({ mayReview: false, mayDecide: false, mayClose: true })
  })

  it('Admin PT: tanpa aksi apa pun', async () => {
    asUser('admin-a')
    const { body } = await list()
    expect(body.items.length).toBeGreaterThan(0)
    for (const i of body.items) expect(i.perms).toEqual({ mayReview: false, mayDecide: false, mayClose: false })
  })

  it('PIC: hanya cakupan proyeknya; pengaju boleh menutup eskalasinya yang sudah diputuskan', async () => {
    asUser('pic-1')
    const a = await list()
    expect(ids(a.body)).toEqual(['esc-r1', 'esc-t1'])
    for (const i of a.body.items) expect(i.perms).toEqual({ mayReview: false, mayDecide: false, mayClose: false })

    asUser('pic-2')
    const b = await list()
    expect(ids(b.body)).toEqual(['esc-r2'])
    expect(b.body.items[0].perms).toEqual({ mayReview: false, mayDecide: false, mayClose: true })
  })

  it('kepala divisi: proyek divisinya + butir mingguan divisinya', async () => {
    asUser('kadiv-1')
    const { body } = await list()
    expect(ids(body)).toEqual(['esc-r1', 'esc-t1', 'esc-wk'])
  })

  it('escalationPerms sesuai ROLE_CAPABILITIES untuk tiap peran × status', () => {
    for (const role of Object.keys(ROLE_CAPABILITIES)) {
      const caps = ROLE_CAPABILITIES[role]
      const follow = caps.includes('escalation:followup')
      const decide = caps.includes('escalation:decide')
      for (const status of ['DIAJUKAN', 'DITINJAU', 'DIPUTUSKAN', 'DITUTUP']) {
        const lain = escalationPerms({ id: 'u', role }, { status, raisedById: 'x' })
        expect(lain).toEqual({
          mayReview: follow && status === 'DIAJUKAN',
          mayDecide: decide && (status === 'DIAJUKAN' || status === 'DITINJAU'),
          mayClose: status === 'DIPUTUSKAN' && (follow || decide),
        })
        const sendiri = escalationPerms({ id: 'u', role }, { status, raisedById: 'u' })
        expect(sendiri.mayClose).toBe(status === 'DIPUTUSKAN')
      }
    }
  })
})

describe('saringan projectId', () => {
  it('Manajemen: eskalasi laporan + task proyek (termasuk task tanpa tautan balik)', async () => {
    asUser('mgmt')
    expect(ids((await list('?projectId=p-1')).body)).toEqual(['esc-r1', 'esc-t1'])
    expect(ids((await list('?projectId=p-2')).body)).toEqual(['esc-r2', 'esc-t2'])
    const p3 = await list('?projectId=p-3')
    expect(ids(p3.body)).toEqual(['esc-r3'])
    expect(p3.body.total).toBe(1)
  })

  it('proyek tidak ada → 404 tanpa membaca eskalasi', async () => {
    asUser('mgmt')
    expect((await list('?projectId=tidak-ada')).status).toBe(404)
    expect(db.escalation.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['pic-1', 'p-2'],
    ['pic-3', 'p-1'],
    ['kadiv-1', 'p-2'],
    ['kadiv-3', 'p-1'],
    ['admin-a', 'p-3'],
    ['dir-b', 'p-1'],
  ])('%s membuka %s di luar cakupan → 403 tanpa membaca eskalasi', async (who, project) => {
    asUser(who)
    const res = await list(`?projectId=${project}`)
    expect(res.status).toBe(403)
    expect(db.escalation.findMany).not.toHaveBeenCalled()
    expect(db.escalation.count).not.toHaveBeenCalled()
  })

  it('PIC dan kepala divisi proyeknya: tetap diiris cakupan pelaksana', async () => {
    asUser('pic-1')
    expect(ids((await list('?projectId=p-1')).body)).toEqual(['esc-r1', 'esc-t1'])
    asUser('kadiv-1')
    const k = await list('?projectId=p-1')
    expect(ids(k.body)).toEqual(['esc-r1', 'esc-t1']) // butir mingguan tidak ikut saringan proyek
    expect(k.body.items.every((i: { perms?: unknown }) => i.perms)).toBe(true)
  })

  it('Admin PT dan Direktur PT pemilik proyek boleh', async () => {
    asUser('admin-a')
    expect(ids((await list('?projectId=p-2')).body)).toEqual(['esc-r2', 'esc-t2'])
    asUser('dir-b')
    expect(ids((await list('?projectId=p-3')).body)).toEqual(['esc-r3'])
  })
})

describe('saringan lewat SLA sebelum paginasi', () => {
  it('total dan halaman dihitung dari baris yang cocok', async () => {
    asUser('mgmt')
    const a = await list('?overdue=true&pageSize=2&page=1')
    expect(a.body.total).toBe(3)
    expect(a.body.items.map((i: { id: string }) => i.id)).toEqual(['esc-t1', 'esc-r2'])
    expect(a.body.items.every((i: { isOverdue: boolean }) => i.isOverdue)).toBe(true)
    const b = await list('?overdue=true&pageSize=2&page=2')
    expect(b.body.items.map((i: { id: string }) => i.id)).toEqual(['esc-t2'])

    const c = await list('?overdue=false')
    expect(c.body.total).toBe(3)
    expect(ids(c.body)).toEqual(['esc-r1', 'esc-r3', 'esc-wk'])
  })

  it('digabung dengan projectId dan status', async () => {
    asUser('mgmt')
    const r = await list('?projectId=p-2&overdue=true&status=DIPUTUSKAN')
    expect(ids(r.body)).toEqual(['esc-r2'])
    expect(r.body.total).toBe(1)
  })

  it('tanpa saringan lewat SLA: satu findMany berhalaman + count (perilaku lama)', async () => {
    asUser('mgmt')
    await list('?page=2&pageSize=2')
    expect(db.escalation.findMany).toHaveBeenCalledTimes(1)
    const args = db.escalation.findMany.mock.calls[0][0]
    expect(args.skip).toBe(2)
    expect(args.take).toBe(2)
    expect(db.escalation.count).toHaveBeenCalledTimes(1)
  })
})
