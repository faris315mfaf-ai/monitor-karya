import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/*
 * Idempotensi tulis (gelombang E, 13 Okt 2026): header Idempotency-Key pada
 * POST/PUT/DELETE /api/tasks, PUT /api/daily-input, POST /api/evidence/upload.
 *
 * Basis data tiruan di memori meniru yang penting dari PostgreSQL di sini:
 * transaksi dengan rollback, baris belum ter-commit tidak terlihat transaksi
 * lain, dan INSERT ke indeks unik (userId, key) MENUNGGU transaksi pemilik baris
 * yang belum selesai lalu gagal P2002 bila baris itu ter-commit.
 */

type Row = Record<string, any>

const h = vi.hoisted(() => {
  let seq = 0
  const state = { keys: [] as Row[], tasks: [] as Row[], evidence: [] as Row[], audits: [] as Row[] }
  const open = new Map<number, Promise<void>>()
  const p2002 = () => Object.assign(new Error('Unique constraint failed on the fields: (`userId`,`key`)'), { code: 'P2002' })

  type Undo = (() => void)[]
  const visibleTo = (tx: number | null) => (r: Row) => r.ownerTx == null || r.ownerTx === tx
  function insert(arr: Row[], row: Row, undo: Undo) {
    arr.push(row)
    undo.push(() => {
      const i = arr.indexOf(row)
      if (i >= 0) arr.splice(i, 1)
    })
  }
  function remove(arr: Row[], row: Row, undo: Undo) {
    const i = arr.indexOf(row)
    if (i >= 0) arr.splice(i, 1)
    undo.push(() => arr.push(row))
  }
  function patch(row: Row, data: Row, undo: Undo) {
    const before = { ...row }
    Object.assign(row, data)
    undo.push(() => {
      for (const k of Object.keys(row)) delete row[k]
      Object.assign(row, before)
    })
  }
  const byKey = (where: Row) => (r: Row) => r.userId === where.userId_key.userId && r.key === where.userId_key.key

  function client(tx: number | null, undo: Undo) {
    const vis = visibleTo(tx)
    return {
      idempotencyKey: {
        findUnique: vi.fn(async ({ where }: { where: Row }) => state.keys.filter(vis).find(byKey(where)) ?? null),
        create: vi.fn(async ({ data }: { data: Row }) => {
          for (;;) {
            const clash = state.keys.find((r) => r.userId === data.userId && r.key === data.key)
            if (!clash) break
            if (clash.ownerTx != null && clash.ownerTx !== tx) {
              await open.get(clash.ownerTx) // menunggu di indeks unik seperti PostgreSQL
              continue
            }
            throw p2002()
          }
          const row = { id: `k${++seq}`, responseStatus: null, responseBody: null, resourceId: null, createdAt: new Date(), ...data, ownerTx: tx }
          insert(state.keys, row, undo)
          return row
        }),
        update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
          const row = state.keys.filter(vis).find(byKey(where))
          if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' })
          patch(row, data, undo)
          return row
        }),
        delete: vi.fn(async ({ where }: { where: Row }) => {
          const row = state.keys.filter(vis).find(byKey(where))
          if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' })
          remove(state.keys, row, undo)
          return row
        }),
        deleteMany: vi.fn(async ({ where }: { where: Row }) => {
          const hit = state.keys.filter(vis).filter((r) =>
            (where.id === undefined || r.id === where.id) && (where.createdAt?.lt === undefined || r.createdAt < where.createdAt.lt))
          for (const r of hit) remove(state.keys, r, undo)
          return { count: hit.length }
        }),
      },
      project: {
        findUnique: vi.fn(async ({ where }: { where: Row }) =>
          ({ 'p-1': { id: 'p-1', entityId: 'e-1', picUserId: 'pic-1' }, 'p-2': { id: 'p-2', entityId: 'e-1', picUserId: 'pic-2' } } as Row)[where.id] ?? null),
      },
      task: {
        aggregate: vi.fn(async () => ({ _max: { sortOrder: null } })),
        create: vi.fn(async ({ data }: { data: Row }) => {
          const { subtasks, ...rest } = data
          const row = {
            id: `t${++seq}`, ...rest, subtasks: (subtasks?.create ?? []).map((s: Row, i: number) => ({ id: `s${seq}-${i}`, ...s })),
            picUser: null, escalation: null, escalationId: null, createdAt: new Date(), ownerTx: tx,
          }
          insert(state.tasks, row, undo)
          const { ownerTx: _o, ...out } = row
          return out
        }),
        findUnique: vi.fn(async ({ where }: { where: Row }) => {
          const row = state.tasks.filter(vis).find((t) => t.id === where.id)
          if (!row) return null
          const { ownerTx: _o, ...out } = row
          return out
        }),
        update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
          const row = state.tasks.filter(vis).find((t) => t.id === where.id)!
          const { subtasks, ...rest } = data
          patch(row, { ...rest, subtasks: subtasks?.create ?? [] }, undo)
          const { ownerTx: _o, ...out } = row
          return out
        }),
        delete: vi.fn(async ({ where }: { where: Row }) => {
          const row = state.tasks.filter(vis).find((t) => t.id === where.id)!
          remove(state.tasks, row, undo)
          return row
        }),
      },
      subtask: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      user: { findFirst: vi.fn(async () => null) },
      evidence: {
        create: vi.fn(async ({ data }: { data: Row }) => {
          const row = { id: `ev${++seq}`, ...data, createdAt: new Date(), ownerTx: tx }
          insert(state.evidence, row, undo)
          return row
        }),
        findMany: vi.fn(async ({ where }: { where: Row }) => state.evidence.filter(vis).filter((e) => e.targetId === where.targetId)),
        deleteMany: vi.fn(async ({ where }: { where: Row }) => {
          const hit = state.evidence.filter(vis).filter((e) => e.targetId === where.targetId)
          for (const r of hit) remove(state.evidence, r, undo)
          return { count: hit.length }
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: { data: Row }) => {
          insert(state.audits, { ...data, ownerTx: tx }, undo)
          return data
        }),
      },
    }
  }

  function commit(tx: number) {
    for (const arr of [state.keys, state.tasks, state.evidence, state.audits]) for (const r of arr) if (r.ownerTx === tx) r.ownerTx = null
  }

  const root = client(null, [])
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const id = ++seq
    let done!: () => void
    open.set(id, new Promise<void>((r) => (done = r)))
    const undo: Undo = []
    try {
      const out = await fn(client(id, undo))
      commit(id)
      return out
    } catch (err) {
      for (const u of undo.reverse()) u()
      throw err
    } finally {
      open.delete(id)
      done()
    }
  })
  const db = { ...root, $transaction }

  return {
    state,
    db,
    currentUser: { value: null as unknown },
    storage: { configured: false, uploaded: [] as string[], removed: [] as string[] },
    reset() {
      for (const arr of Object.values(state)) arr.length = 0
      $transaction.mockClear()
      for (const m of Object.values(root)) for (const f of Object.values(m)) (f as ReturnType<typeof vi.fn>).mockClear()
    },
  }
})

const SETTINGS = { entityId: 'e-1', dailyCutoffHour: null, workingDays: [], dailyOpen: true, weeklyCutoffHour: null, weeklyOpen: true }

vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/auth', () => ({ requireApiUser: vi.fn(async () => h.currentUser.value) }))
vi.mock('@/lib/daily-rollup', () => ({
  dailyGate: vi.fn(async () => ({ settings: SETTINGS, frozen: null, timeLocked: false, report: null, unlock: null })),
  frozenMessage: () => null,
  rollupDailyReport: vi.fn(async () => undefined),
  lockDailyProject: vi.fn(async () => undefined),
  lockDailyReport: vi.fn(async () => undefined),
  syncEvidenceCount: vi.fn(async (_type: string, targetId: string, tx: typeof h.db) => (await tx.evidence.findMany({ where: { targetId } })).length),
}))
vi.mock('@/lib/report-settings', () => ({ getReportSettings: vi.fn(async () => SETTINGS), isWorkingDayWith: () => true }))
vi.mock('@/lib/unlock-requests', () => ({ activeUnlockFor: vi.fn(async () => null) }))
vi.mock('@/lib/pic-access', () => ({ guardProjectAccess: vi.fn(), READ_RELATIONS: [] }))
vi.mock('@/lib/evidence-access', () => ({ canWriteEvidence: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/storage', () => ({
  ALLOWED_EVIDENCE_MIME: new Set(['text/plain']),
  MAX_EVIDENCE_BYTES: 20 * 1024 * 1024,
  buildStorageKey: vi.fn(() => `TASK/obj-${Math.random().toString(36).slice(2)}.txt`),
  storageConfigured: () => h.storage.configured,
  uploadEvidence: vi.fn(async (key: string) => { h.storage.uploaded.push(key) }),
  removeEvidence: vi.fn(async (key: string) => { h.storage.removed.push(key) }),
}))

import { DELETE as TASK_DELETE, POST as TASK_POST, PUT as TASK_PUT } from '@/app/api/tasks/route'
import { POST as UPLOAD } from '@/app/api/evidence/upload/route'
import { IDEMPOTENCY_REPLAY_HEADER, purgeExpiredIdempotencyKeys, storableBody } from '@/lib/idempotency'

const KEY = '3f1c2a9e-7b4d-4c1e-9a2f-5d6e7f8a9b0c'

function asUser(id: string) {
  h.currentUser.value = { id, name: id, email: `${id}@contoh.test`, role: 'PIC_PROYEK', scopeEntityId: 'e-1', avatarColor: null }
}
function req(url: string, method: string, body?: unknown, key?: string) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
  })
}
const postTask = (body: Row, key?: string) => TASK_POST(req('/api/tasks', 'POST', { projectId: 'p-1', title: 'Uji modul cuti', ...body }, key))
const committedTasks = () => h.state.tasks.filter((t) => t.ownerTx == null)

beforeEach(() => {
  h.reset()
  h.storage.configured = false
  h.storage.uploaded.length = 0
  h.storage.removed.length = 0
  asUser('pic-1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('POST /api/tasks — Idempotency-Key', () => {
  it('ulangan dengan kunci sama mengembalikan objek yang sama tanpa duplikat', async () => {
    const first = await postTask({}, KEY)
    expect(first.status).toBe(200)
    expect(first.headers.get(IDEMPOTENCY_REPLAY_HEADER)).toBeNull()
    const firstBody = await first.json()

    const again = await postTask({}, KEY)
    expect(again.status).toBe(200)
    expect(again.headers.get(IDEMPOTENCY_REPLAY_HEADER)).toBe('true')
    expect(await again.json()).toEqual(firstBody)

    expect(committedTasks()).toHaveLength(1)
    expect(h.state.audits.filter((a) => a.action === 'CREATE_TASK')).toHaveLength(1)
    expect(h.state.keys).toHaveLength(1)
    expect(h.state.keys[0]).toMatchObject({ userId: 'pic-1', key: KEY, route: 'POST /api/tasks', responseStatus: 200, resourceId: firstBody.task.id })
  })

  it('kunci yang sama dari pengguna lain tidak bentrok dan tidak membocorkan respons', async () => {
    const mine = await (await postTask({ title: 'Milik Rina' }, KEY)).json()

    asUser('pic-2')
    const theirs = await TASK_POST(req('/api/tasks', 'POST', { projectId: 'p-2', title: 'Milik Bayu' }, KEY))
    expect(theirs.status).toBe(200)
    expect(theirs.headers.get(IDEMPOTENCY_REPLAY_HEADER)).toBeNull()
    const theirsBody = await theirs.json()
    expect(theirsBody.task.id).not.toBe(mine.task.id)
    expect(theirsBody.task.title).toBe('Milik Bayu')
    expect(JSON.stringify(theirsBody)).not.toContain('Milik Rina')

    expect(committedTasks()).toHaveLength(2)
    expect(h.state.keys.map((k) => k.userId).sort()).toEqual(['pic-1', 'pic-2'])
  })

  it('dua permintaan bersamaan berkunci sama: hanya satu yang membuat objek (P2002 → respons pemenang)', async () => {
    const [a, b] = await Promise.all([postTask({}, KEY), postTask({}, KEY)])
    expect([a.status, b.status]).toEqual([200, 200])
    const [ja, jb] = [await a.json(), await b.json()]
    expect(ja.task.id).toBe(jb.task.id)
    expect([a, b].filter((r) => r.headers.get(IDEMPOTENCY_REPLAY_HEADER) === 'true')).toHaveLength(1)
    expect(committedTasks()).toHaveLength(1)
    expect(h.state.audits.filter((x) => x.action === 'CREATE_TASK')).toHaveLength(1)
    expect(h.state.keys).toHaveLength(1)
  })

  it('tanpa header: perilaku lama persis — dua POST = dua entri, tabel kunci tidak disentuh', async () => {
    expect((await postTask({})).status).toBe(200)
    expect((await postTask({})).status).toBe(200)
    expect(committedTasks()).toHaveLength(2)
    expect(h.db.idempotencyKey.findUnique).not.toHaveBeenCalled()
    expect(h.state.keys).toHaveLength(0)
    expect(h.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'ReadCommitted' })
  })

  it('respons non-2xx tidak dicatat: ulangan berkunci sama setelah diperbaiki tetap diproses', async () => {
    const bad = await postTask({ title: '' }, KEY)
    expect(bad.status).toBe(422)
    expect(h.state.keys).toHaveLength(0)
    const good = await postTask({}, KEY)
    expect(good.status).toBe(200)
    expect(good.headers.get(IDEMPOTENCY_REPLAY_HEADER)).toBeNull()
    expect(committedTasks()).toHaveLength(1)
  })

  it('header tidak sah → 400 tanpa menulis', async () => {
    const res = await postTask({}, 'pendek')
    expect(res.status).toBe(400)
    expect(committedTasks()).toHaveLength(0)
    expect(h.db.$transaction).not.toHaveBeenCalled()
  })

  it('kunci yang sama untuk rute lain → 422, tidak menjalankan aksi kedua', async () => {
    const created = await (await postTask({}, KEY)).json()
    const res = await TASK_DELETE(req(`/api/tasks?id=${created.task.id}`, 'DELETE', undefined, KEY))
    expect(res.status).toBe(422)
    expect(committedTasks()).toHaveLength(1)
  })

  it('kunci kedaluwarsa (> 7 hari) dibuang dan permintaan diproses ulang', async () => {
    await postTask({}, KEY)
    h.state.keys[0].createdAt = new Date(Date.now() - 8 * 86_400_000)
    const res = await postTask({}, KEY)
    expect(res.headers.get(IDEMPOTENCY_REPLAY_HEADER)).toBeNull()
    expect(committedTasks()).toHaveLength(2)
    expect(h.state.keys).toHaveLength(1)
  })
})

describe('PUT/DELETE /api/tasks — ulangan', () => {
  it('PUT berkunci: ulangan dibalas respons pertama tanpa menulis ulang', async () => {
    const created = await (await postTask({})).json()
    const body = { id: created.task.id, title: 'Diubah', status: 'SELESAI', progressPct: 100 }
    const first = await TASK_PUT(req('/api/tasks', 'PUT', body, KEY))
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    const updates = h.db.$transaction.mock.calls.length
    const again = await TASK_PUT(req('/api/tasks', 'PUT', body, KEY))
    expect(again.headers.get(IDEMPOTENCY_REPLAY_HEADER)).toBe('true')
    expect(await again.json()).toEqual(firstBody)
    expect(h.db.$transaction.mock.calls.length).toBe(updates) // tidak ada transaksi baru
  })

  it('DELETE berkunci: ulangan setelah sukses dibalas { ok: true }, bukan 404', async () => {
    const created = await (await postTask({})).json()
    const url = `/api/tasks?id=${created.task.id}&context=HARIAN`
    expect((await TASK_DELETE(req(url, 'DELETE', undefined, KEY))).status).toBe(200)
    const again = await TASK_DELETE(req(url, 'DELETE', undefined, KEY))
    expect(again.status).toBe(200)
    expect(again.headers.get(IDEMPOTENCY_REPLAY_HEADER)).toBe('true')
    expect(await again.json()).toEqual({ ok: true })
    // Tanpa kunci perilaku lama: 404.
    expect((await TASK_DELETE(req(url, 'DELETE'))).status).toBe(404)
  })
})

describe('POST /api/evidence/upload — Idempotency-Key', () => {
  function upload(key?: string) {
    const form = new FormData()
    form.set('targetType', 'TASK')
    form.set('targetId', 't-x')
    form.set('file', new File(['catatan lapangan'], 'catatan.txt', { type: 'text/plain' }))
    return UPLOAD(new NextRequest('http://localhost/api/evidence/upload', { method: 'POST', body: form, headers: key ? { 'Idempotency-Key': key } : {} }))
  }
  beforeEach(() => { h.storage.configured = true })

  it('ulangan dibalas bukti yang sama tanpa mengunggah ulang', async () => {
    const first = await upload(KEY)
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    const again = await upload(KEY)
    expect(again.headers.get(IDEMPOTENCY_REPLAY_HEADER)).toBe('true')
    expect(await again.json()).toEqual(firstBody)
    expect(h.storage.uploaded).toHaveLength(1)
    expect(h.state.evidence).toHaveLength(1)
  })

  it('unggahan bersamaan berkunci sama: satu baris bukti, objek yang kalah dibuang dari storage', async () => {
    const [a, b] = await Promise.all([upload(KEY), upload(KEY)])
    expect([a.status, b.status]).toEqual([200, 200])
    const [ja, jb] = [await a.json(), await b.json()]
    expect(ja.evidence.id).toBe(jb.evidence.id)
    expect(h.state.evidence.filter((e) => e.ownerTx == null)).toHaveLength(1)
    expect(h.storage.uploaded).toHaveLength(2)
    expect(h.storage.removed).toEqual(h.storage.uploaded.filter((k) => k !== ja.evidence.storageKey))
  })

  it('tanpa header: dua unggahan = dua bukti (perilaku lama)', async () => {
    expect((await upload()).status).toBe(200)
    expect((await upload()).status).toBe(200)
    expect(h.state.evidence).toHaveLength(2)
    expect(h.db.idempotencyKey.findUnique).not.toHaveBeenCalled()
  })
})

describe('pembersihan & batas ukuran', () => {
  it('purgeExpiredIdempotencyKeys hanya menghapus kunci > 7 hari', async () => {
    const now = new Date('2026-10-13T10:00:00+07:00')
    h.state.keys.push(
      { id: 'lama', userId: 'u', key: 'kunci-lama-1', route: 'POST /api/tasks', createdAt: new Date(now.getTime() - 8 * 86_400_000), ownerTx: null },
      { id: 'baru', userId: 'u', key: 'kunci-baru-1', route: 'POST /api/tasks', createdAt: new Date(now.getTime() - 6 * 86_400_000), ownerTx: null },
    )
    expect(await purgeExpiredIdempotencyKeys(now)).toBe(1)
    expect(h.state.keys.map((k) => k.id)).toEqual(['baru'])
  })

  it('badan respons > 64 KiB disimpan sebagai ringkasan + resourceId', () => {
    const big = { ok: true, task: { id: 't-9', description: 'x'.repeat(70 * 1024) } }
    expect(storableBody(big, 't-9')).toEqual({ ok: true, idempotentSummary: true, resourceId: 't-9' })
    const small = { ok: true, at: new Date('2026-10-13T03:00:00Z') }
    expect(storableBody(small, null)).toEqual({ ok: true, at: '2026-10-13T03:00:00.000Z' })
  })
})
