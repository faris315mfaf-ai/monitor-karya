import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// This harness models transaction-held row locks and rollback, not PostgreSQL.
// Real SQL interleavings are the parent's isolated local DB integration gate.
const h = vi.hoisted(() => ({
  state: { project: {} as any, report: null as any, tasks: [] as any[], audits: [] as any[] },
  user: { id: 'admin', name: 'Admin', role: 'SUPERADMIN', scopeEntityId: null },
  onLock: undefined as (() => void) | undefined, queries: [] as string[], tail: Promise.resolve(), failAudit: false,
  db: {
    project: { findUnique: vi.fn(), update: vi.fn() },
    projectApproval: { upsert: vi.fn(), findMany: vi.fn() },
    task: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
    subtask: { deleteMany: vi.fn() }, user: { findFirst: vi.fn() },
    evidence: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    dailyProjectReport: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    unlockRequest: { findFirst: vi.fn() }, auditLog: { create: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn(),
  },
}))
vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: async () => h.user, scopeEntityIds: async () => null }))
vi.mock('@/lib/storage', () => ({ storageConfigured: () => false, removeEvidence: vi.fn() }))
vi.mock('@/lib/undo', async (original) => ({ ...(await original<typeof import('@/lib/undo')>()), issueUndo: vi.fn(async () => 'undo') }))
import { rollupDailyReport } from '@/lib/daily-rollup'
import { POST as approve } from '@/app/api/projects/approve/route'
import { PUT as dailyPut, DELETE as dailyDelete } from '@/app/api/daily-input/route'
import { POST as taskPost, PUT as taskPut, PATCH as taskPatch, DELETE as taskDelete } from '@/app/api/tasks/route'
import { POST as forward } from '@/app/api/inbox/route'

const day = new Date('2026-10-05T17:00:00Z')
const req = (path: string, method: string, body?: unknown) => new NextRequest(`http://localhost${path}`, {
  method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const report = () => ({ id: 'r', projectId: 'p', entityId: 'e', reportDate: day, status: 'ON_PROGRESS', progressPct: 10,
  phase: 'PELAKSANAAN', achievementToday: 'Uji modul', obstacle: null, followUp: null, evidenceCount: 1,
  submittedAt: new Date(), forwardedAt: null, isLocked: false, lockedAt: null, updatedAt: new Date(),
})
const saveDaily = () => dailyPut(req('/api/daily-input', 'PUT', { projectId: 'p', status: 'ON_PROGRESS', achievementToday: 'Uji lanjutan', progressPct: 70 }))
const forwardDaily = () => forward(req('/api/inbox', 'POST', { kind: 'daily', id: 'r' }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T03:00:00Z'))
  h.onLock = undefined; h.queries = []; h.tail = Promise.resolve(); h.failAudit = false
  h.state = { project: { id: 'p', entityId: 'e', phase: 'PELAKSANAAN', picUserId: 'pic', lifecycle: 'DIUSULKAN',
    approvalChain: ['ADMIN_PT', 'MANAJEMEN'], approvedAt: null, approvedByName: null, updatedAt: new Date(), approvals: [] }, report: report(), tasks: [], audits: [] }
  const db = h.db
  // Each transaction retains its first lock until commit/rollback. Subsequent SQL
  // on that client reuses the lock. If production omits SQL, races stay exposed.
  db.$transaction.mockImplementation(async (fn) => {
    let release: (() => void) | undefined
    let snapshot = structuredClone(h.state)
    const tx = new Proxy(db, { get(target, key) {
      if (key !== '$queryRaw') return Reflect.get(target, key)
      return async (sql: TemplateStringsArray) => {
        h.queries.push(sql.join('?'))
        if (!release) {
          const previous = h.tail
          h.tail = new Promise<void>((resolve) => { release = resolve })
          await previous
          snapshot = structuredClone(h.state)
          h.onLock?.(); h.onLock = undefined
        }
        return []
      }
    } })
    try { return await fn(tx) } catch (err) { h.state = snapshot; throw err } finally { release?.() }
  })
  db.$queryRaw.mockResolvedValue([])
  db.project.findUnique.mockImplementation(async () => structuredClone(h.state.project))
  db.project.update.mockImplementation(async ({ data }) => Object.assign(h.state.project, data))
  db.projectApproval.upsert.mockImplementation(async ({ create, update }) => {
    const hit = h.state.project.approvals.find((a: any) => a.role === create.role)
    if (hit) Object.assign(hit, update)
    else h.state.project.approvals.push({ ...create, decidedAt: new Date() })
  })
  db.projectApproval.findMany.mockImplementation(async () => structuredClone(h.state.project.approvals))
  db.dailyProjectReport.findUnique.mockImplementation(async () => structuredClone(h.state.report))
  db.dailyProjectReport.update.mockImplementation(async ({ data }) => Object.assign(h.state.report, data))
  db.dailyProjectReport.create.mockImplementation(async ({ data }) => h.state.report = { ...report(), ...data })
  db.dailyProjectReport.updateMany.mockImplementation(async () => {
    if (!h.state.report || h.state.report.forwardedAt || !h.state.report.submittedAt) return { count: 0 }
    Object.assign(h.state.report, { forwardedAt: new Date(), isLocked: true, lockedAt: new Date() })
    return { count: 1 }
  })
  db.dailyProjectReport.delete.mockImplementation(async () => { h.state.report = null })
  db.task.findMany.mockImplementation(async () => structuredClone(h.state.tasks))
  db.task.findUnique.mockImplementation(async ({ where }) => structuredClone(h.state.tasks.find((t) => t.id === where.id) ?? null))
  db.task.create.mockImplementation(async ({ data }) => { const t = { id: 't', ...data }; h.state.tasks.push(t); return t })
  db.task.update.mockImplementation(async ({ where, data }) => Object.assign(h.state.tasks.find((t) => t.id === where.id), data))
  db.task.delete.mockImplementation(async () => { h.state.tasks = [] })
  db.task.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } })
  db.subtask.deleteMany.mockResolvedValue({ count: 0 })
  db.user.findFirst.mockResolvedValue({ id: 'pic' })
  db.evidence.count.mockResolvedValue(0); db.evidence.findMany.mockResolvedValue([]); db.evidence.deleteMany.mockResolvedValue({ count: 0 })
  db.unlockRequest.findFirst.mockResolvedValue(null)
  db.auditLog.create.mockImplementation(async ({ data }) => { if (h.failAudit) throw new Error('audit unavailable'); h.state.audits.push(data); return data })
})
afterEach(() => vi.useRealTimers())

async function firstLocked(first: () => Promise<Response>, second: () => Promise<Response>) {
  const acquired = new Promise<void>((resolve) => { h.onLock = resolve })
  const firstResponse = first()
  await acquired
  return Promise.all([firstResponse, second()])
}

it('menghapus task terakhir tidak mengubah evidenceCount laporan yang diteruskan', async () => {
  Object.assign(h.state.report, { forwardedAt: new Date(), isLocked: true })
  await rollupDailyReport('p', day)
  expect(h.db.dailyProjectReport.update).not.toHaveBeenCalled()
})

it('rollup tanpa laporan setelah tenggat tidak membuat laporan lampau', async () => {
  h.state.report = null; h.state.tasks = [{ id: 't', title: 'Uji', status: 'BERJALAN', progressPct: 50 }]
  await rollupDailyReport('p', new Date('2026-10-04T17:00:00Z'))
  expect(h.db.dailyProjectReport.create).not.toHaveBeenCalled()
})

it('approve/reject bersamaan mempertahankan keputusan pemenang dan hanya satu audit', async () => {
  const responses = await Promise.all(['DISETUJUI', 'DITOLAK'].map((decision) => approve(req('/api/projects/approve', 'POST', { projectId: 'p', decision, note: 'Periksa kembali' }))))
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
  expect(h.state.project.approvals).toHaveLength(1)
  expect(h.state.project.approvals[0].decision).toBe('DISETUJUI')
  expect(h.state.project.lifecycle).toBe('DIUSULKAN')
  expect(h.state.audits).toHaveLength(1)
})

it('gagal audit approval mengembalikan slot dan lifecycle', async () => {
  h.failAudit = true
  await expect(approve(req('/api/projects/approve', 'POST', { projectId: 'p', decision: 'DITOLAK', note: 'Periksa kembali' }))).rejects.toThrow('audit unavailable')
  expect(h.state.project.approvals).toHaveLength(0)
  expect(h.state.project.lifecycle).toBe('DIUSULKAN')
})

it('penerusan menang atas daily save yang menunggu kunci; laporan beku tidak ditimpa', async () => {
  const [sent, saved] = await firstLocked(forwardDaily, saveDaily)
  expect(sent.status).toBe(200); expect(saved.status).toBe(409)
  expect(h.state.report.progressPct).toBe(10)
  expect(h.queries.some((sql) => sql.includes('"Project"') && sql.includes('FOR UPDATE'))).toBe(true)
  expect(h.queries.some((sql) => sql.includes('"DailyProjectReport"') && sql.includes('FOR UPDATE'))).toBe(true)
})

it('daily save menang sebelum forward; forward membaca angka yang sudah commit', async () => {
  const [saved, sent] = await firstLocked(saveDaily, forwardDaily)
  expect(saved.status).toBe(200); expect(sent.status).toBe(200)
  expect(h.state.report).toMatchObject({ progressPct: 70, isLocked: true })
})

it('task create + rollup commit bersama sebelum penerusan', async () => {
  const [created, sent] = await Promise.all([taskPost(req('/api/tasks', 'POST', { projectId: 'p', title: 'Uji', status: 'BERJALAN', progressPct: 60 })), forwardDaily()])
  expect(created.status).toBe(200); expect(sent.status).toBe(200)
  expect(h.state.report).toMatchObject({ progressPct: 60, isLocked: true })
})

it.each(['create', 'update', 'delete', 'reorder'])('penerusan menang atas task %s tanpa mutasi task', async (operation) => {
  h.state.tasks = [{ id: 't', projectId: 'p', entityId: 'e', workDate: day, scope: 'HARIAN', title: 'Uji', status: 'BERJALAN', progressPct: 20, subtasks: [], escalationId: null }]
  const mutate = () => operation === 'create' ? taskPost(req('/api/tasks', 'POST', { projectId: 'p', title: 'Baru' }))
    : operation === 'update' ? taskPut(req('/api/tasks', 'PUT', { id: 't', title: 'Berubah', progressPct: 90 }))
    : operation === 'delete' ? taskDelete(req('/api/tasks?id=t', 'DELETE'))
    : taskPatch(req('/api/tasks', 'PATCH', { projectId: 'p', week: '2026-W41', moves: [{ id: 't', lane: '2026-10-06', sortOrder: 2 }] }))
  const [sent, changed] = await firstLocked(forwardDaily, mutate)
  expect(sent.status).toBe(200); expect(changed.status).toBe(409)
  expect(h.state.tasks).toHaveLength(1); expect(h.state.tasks[0].title).toBe('Uji')
})

it('penerusan menang atas hapus laporan; berkas dan laporan tetap ada', async () => {
  const [sent, removed] = await firstLocked(forwardDaily, () => dailyDelete(req('/api/daily-input?projectId=p', 'DELETE')))
  expect(sent.status).toBe(200); expect(removed.status).toBe(409)
  expect(h.state.report).not.toBeNull(); expect(h.db.evidence.deleteMany).not.toHaveBeenCalled()
})

it('gagal audit daily save membatalkan perubahan angka', async () => {
  h.failAudit = true
  await expect(saveDaily()).rejects.toThrow('audit unavailable')
  expect(h.state.report.progressPct).toBe(10)
})

it('gagal audit task create membatalkan task dan rollup', async () => {
  h.failAudit = true
  await expect(taskPost(req('/api/tasks', 'POST', { projectId: 'p', title: 'Uji' }))).rejects.toThrow('audit unavailable')
  expect(h.state.tasks).toHaveLength(0); expect(h.state.report.progressPct).toBe(10)
})


it('dua pembuatan task tanpa laporan hanya membentuk satu laporan dan rollup lengkap', async () => {
  h.state.report = null
  const create = (progressPct: number) => taskPost(req('/api/tasks', 'POST', { projectId: 'p', title: 'Uji', status: 'BERJALAN', progressPct }))
  const responses = await Promise.all([create(20), create(80)])
  expect(responses.map((r) => r.status)).toEqual([200, 200])
  expect(h.db.dailyProjectReport.create).toHaveBeenCalledTimes(1)
  expect(h.state.report.progressPct).toBe(50)
})

it.each(['2026-10-05', '2026-10-07', '2026-10-10'])('papan mingguan tidak melewati invariant hari %s tanpa laporan', async (workDate) => {
  h.state.report = null
  const response = await taskPost(req('/api/tasks', 'POST', { projectId: 'p', title: 'Uji', context: 'MINGGUAN', week: '2026-W41', scope: 'HARIAN', workDate }))
  expect([409, 422]).toContain(response.status)
  expect(h.state.tasks).toHaveLength(0)
  expect(h.db.dailyProjectReport.create).not.toHaveBeenCalled()
})

it('papan mingguan tetap boleh memperbaiki hari lampau yang dibuka secara sah', async () => {
  h.state.report.reportDate = new Date('2026-10-04T17:00:00Z')
  h.db.unlockRequest.findFirst.mockResolvedValue({ id: 'unlock', unlockUntil: new Date('2026-10-07T03:00:00Z') })
  const response = await taskPost(req('/api/tasks', 'POST', { projectId: 'p', title: 'Uji', context: 'MINGGUAN', week: '2026-W41', scope: 'HARIAN', workDate: '2026-10-05' }))
  expect(response.status).toBe(200)
  expect(h.state.tasks).toHaveLength(1)
})

it('tanggal default laporan tidak melewati larangan akhir pekan', async () => {
  vi.setSystemTime(new Date('2026-10-10T03:00:00Z'))
  expect((await saveDaily()).status).toBe(422)
  expect(h.db.dailyProjectReport.update).not.toHaveBeenCalled()
})
