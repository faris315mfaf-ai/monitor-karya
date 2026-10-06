import { vi, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F3-C] Dunia kecil di memori untuk tes route PIC & kepala divisi
 * (tests/api/pic-*.test.ts, tests/api/kadiv-*.test.ts). Bukan berkas tes:
 * diimpor lewat `vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))`.
 *
 * Dua PT (pt-a, pt-b), tiga divisi, tiga proyek AKTIF:
 *   p-1  pt-a · div-a1 (kepala kadiv-1) · PIC pic-1
 *   p-2  pt-a · div-a2 (kepala kadiv-2) · PIC pic-2
 *   p-3  pt-b · div-b1 (kepala kadiv-3) · PIC pic-3
 *
 * `db` adalah Proxy: setiap `db.<model>.<metode>` otomatis vi.fn yang stabil.
 * resetWorld() mengosongkan semuanya lalu memasang perilaku bawaan untuk
 * project/division/user/entity (dibaca dari fixture lewat `matches`) serta
 * auditLog/notificationLog (ditampung di `world.audits` / `world.notifications`).
 * Tidak ada yang menyentuh basis data sungguhan.
 */

type Row = Record<string, unknown>
type Where = Record<string, unknown>

const OPERATORS = ['in', 'notIn', 'gte', 'gt', 'lte', 'lt', 'not', 'contains', 'startsWith']

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b

/**
 * Pencocok `where` Prisma yang sengaja sederhana: kesetaraan, null, Date,
 * operator umum, OR/AND. Kunci relasi bertingkat (mis. `picUser: {...}`,
 * `reads: { none }`) dilewati, jadi tes yang bergantung padanya memeriksa
 * argumen kueri secara langsung.
 */
export function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue
    if (k === 'OR') {
      if (!(v as Where[]).some((w) => matches(row, w))) return false
      continue
    }
    if (k === 'AND') {
      if (!(v as Where[]).every((w) => matches(row, w))) return false
      continue
    }
    const val = row[k]
    if (v === null) {
      if (val != null) return false
      continue
    }
    if (v instanceof Date || typeof v !== 'object') {
      if (!same(val, v)) return false
      continue
    }
    const op = v as Record<string, unknown>
    if (!Object.keys(op).some((key) => OPERATORS.includes(key))) continue // relasi bertingkat: dilewati
    if ('in' in op && !(op.in as unknown[]).some((x) => same(x, val))) return false
    if ('notIn' in op && (op.notIn as unknown[]).some((x) => same(x, val))) return false
    if ('gte' in op && !((val as number) >= (op.gte as number))) return false
    if ('gt' in op && !((val as number) > (op.gt as number))) return false
    if ('lte' in op && !((val as number) <= (op.lte as number))) return false
    if ('lt' in op && !((val as number) < (op.lt as number))) return false
    if ('not' in op) {
      if (op.not === null ? val == null : same(val, op.not)) return false
    }
    if ('contains' in op && !String(val ?? '').includes(String(op.contains))) return false
    if ('startsWith' in op && !String(val ?? '').startsWith(String(op.startsWith))) return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

export const ENTITIES = [
  { id: 'pt-a', name: 'PT A', code: 'PTA', path: '/BIKE/PTA' },
  { id: 'pt-b', name: 'PT B', code: 'PTB', path: '/BIKE/PTB' },
]

const u = (id: string, name: string, role: string, scopeEntityId: string | null, divisionId: string | null = null) => ({
  id, name, role, scopeEntityId, divisionId, email: `${id}@contoh.test`, isActive: true,
})

export const USERS = [
  u('pic-1', 'Rina', 'PIC_PROYEK', 'pt-a', 'div-a1'),
  u('pic-2', 'Bayu', 'PIC_PROYEK', 'pt-a', 'div-a2'),
  u('pic-3', 'Sari', 'PIC_PROYEK', 'pt-b', 'div-b1'),
  u('pic-4', 'Joko', 'PIC_PROYEK', 'pt-a', null), // PIC tanpa divisi di PT A
  u('kadiv-1', 'Andi', 'KEPALA_DIVISI', 'pt-a'),
  u('kadiv-2', 'Dewi', 'KEPALA_DIVISI', 'pt-a'),
  u('kadiv-3', 'Eko', 'KEPALA_DIVISI', 'pt-b'),
  u('admin-a', 'Admin A', 'ADMIN_PT', 'pt-a'),
  u('admin-b', 'Admin B', 'ADMIN_PT', 'pt-b'),
  u('dir-a', 'Hadi', 'DIREKTUR_ENTITAS', 'pt-a'),
  u('dir-b', 'Wati', 'DIREKTUR_ENTITAS', 'pt-b'),
  u('mgmt', 'Manajemen', 'MANAJEMEN', null),
  u('sa', 'Super Admin', 'SUPERADMIN', null),
]

export const DIVISIONS = [
  { id: 'div-a1', name: 'Media', entityId: 'pt-a', headUserId: 'kadiv-1', isActive: true },
  { id: 'div-a2', name: 'Teknik', entityId: 'pt-a', headUserId: 'kadiv-2', isActive: true },
  { id: 'div-b1', name: 'Riset', entityId: 'pt-b', headUserId: 'kadiv-3', isActive: true },
]

export const PROJECTS = [
  { id: 'p-1', code: 'PRJ-01', name: 'Gudang Timur', entityId: 'pt-a', divisionId: 'div-a1', picUserId: 'pic-1' },
  { id: 'p-2', code: 'PRJ-02', name: 'Kanal Media', entityId: 'pt-a', divisionId: 'div-a2', picUserId: 'pic-2' },
  { id: 'p-3', code: 'PRJ-03', name: 'Riset Pasar', entityId: 'pt-b', divisionId: 'div-b1', picUserId: 'pic-3' },
]

/* ------------------------------------------------------------------ */
/* db Proxy                                                            */
/* ------------------------------------------------------------------ */

const models = new Map<string, Map<string, Mock>>()

function model(name: string) {
  let m = models.get(name)
  if (!m) {
    m = new Map()
    models.set(name, m)
  }
  const fns = m
  return new Proxy({} as Record<string, Mock>, {
    get(_t, key) {
      if (typeof key !== 'string' || key === 'then') return undefined
      let f = fns.get(key)
      if (!f) {
        f = vi.fn()
        fns.set(key, f)
      }
      return f
    },
  })
}

const modelProxies = new Map<string, Record<string, Mock>>()

export const db: Record<string, Record<string, Mock>> & { $transaction: Mock } = new Proxy({} as any, {
  get(_t, key) {
    if (typeof key !== 'string' || key === 'then') return undefined
    if (key === '$transaction') return transaction
    let p = modelProxies.get(key)
    if (!p) {
      p = model(key)
      modelProxies.set(key, p)
    }
    return p
  },
})

const transaction = vi.fn(async (arg: unknown) => {
  if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(db)
  return Promise.all(arg as Promise<unknown>[])
})

/* ------------------------------------------------------------------ */
/* Keadaan & auth                                                      */
/* ------------------------------------------------------------------ */

export const world = {
  current: null as unknown,
  audits: [] as Row[],
  notifications: [] as Row[],
}

export function userById(id: string) {
  return USERS.find((x) => x.id === id)
}

/** Sesi aktif dari fixture USERS. */
export function asUser(id: string): SessionUser {
  const f = userById(id)
  if (!f) throw new Error(`pengguna tidak ada: ${id}`)
  const s: SessionUser = {
    id: f.id, name: f.name, email: f.email, role: f.role, scopeEntityId: f.scopeEntityId, avatarColor: null, mustChangePassword: false,
  }
  world.current = s
  return s
}

const GLOBAL = new Set(['MANAJEMEN', 'SUPERADMIN', 'TI', 'AUDITOR'])

export const auth = {
  requireApiUser: vi.fn(async () => world.current),
  scopeEntityIds: vi.fn(async (s: SessionUser) => (GLOBAL.has(s.role) ? null : s.scopeEntityId ? [s.scopeEntityId] : [])),
}

const pick = (row: Row, select?: Row) => {
  if (!select) return { ...row }
  const out: Row = {}
  for (const k of Object.keys(select)) if (k in row) out[k] = row[k]
  return out
}

function divisionRow(d: (typeof DIVISIONS)[number]) {
  const head = d.headUserId ? userById(d.headUserId) : null
  const entity = ENTITIES.find((e) => e.id === d.entityId)!
  return { ...d, entity: { name: entity.name }, headUser: head ? { id: head.id, name: head.name, email: head.email, isActive: head.isActive } : null }
}

function projectRow(p: (typeof PROJECTS)[number]) {
  const pic = p.picUserId ? userById(p.picUserId) : null
  return {
    ...p, lifecycle: 'AKTIF', phase: 'KONSTRUKSI', picName: pic?.name ?? null, startDate: null,
    targetEndDate: new Date('2026-10-24T00:00:00+07:00'), createdAt: new Date('2026-09-01T00:00:00+07:00'),
    picUser: pic ? { name: pic.name, divisionId: pic.divisionId } : null,
  }
}

/** Perilaku bawaan; tes mengganti yang ia butuhkan setelah memanggil ini. */
export function resetWorld() {
  for (const fns of models.values()) for (const f of fns.values()) f.mockReset()
  transaction.mockClear()
  auth.requireApiUser.mockClear()
  auth.scopeEntityIds.mockClear()
  world.current = null
  world.audits.length = 0
  world.notifications.length = 0

  const projects = () => PROJECTS.map(projectRow)
  db.project.findUnique.mockImplementation(async ({ where, select }: { where: Row; select?: Row }) => {
    const p = projects().find((x) => x.id === where.id)
    return p ? pick(p, select) : null
  })
  db.project.findMany.mockImplementation(async ({ where }: { where?: Where } = {}) => projects().filter((p) => matches(p, where)))
  db.project.update.mockImplementation(async ({ where, data }: { where: Row; data: Row }) => ({ ...projects().find((x) => x.id === where.id), ...data }))
  db.project.updateMany.mockResolvedValue({ count: 1 })

  const divisions = () => DIVISIONS.map(divisionRow)
  db.division.findMany.mockImplementation(async ({ where }: { where?: Where } = {}) => divisions().filter((d) => matches(d, where)))
  db.division.findUnique.mockImplementation(async ({ where }: { where: Row }) => divisions().find((d) => d.id === where.id) ?? null)
  db.division.count.mockImplementation(async ({ where }: { where?: Where } = {}) => divisions().filter((d) => matches(d, where)).length)

  db.user.findUnique.mockImplementation(async ({ where, select }: { where: Row; select?: Row }) => {
    const f = userById(where.id as string)
    return f ? pick(f, select) : null
  })
  db.user.findMany.mockImplementation(async ({ where }: { where?: Where } = {}) => USERS.filter((x) => matches(x, where)))

  db.entity.findUnique.mockImplementation(async ({ where }: { where: Row }) => ENTITIES.find((e) => e.id === where.id) ?? null)
  db.entity.findMany.mockImplementation(async ({ where }: { where?: Where } = {}) => ENTITIES.filter((e) => matches(e, where)))

  db.auditLog.create.mockImplementation(async ({ data }: { data: Row }) => {
    world.audits.push(data)
    return data
  })
  db.notificationLog.createMany.mockImplementation(async ({ data }: { data: Row[] }) => {
    world.notifications.push(...data)
    return { count: data.length }
  })
  db.notificationLog.create.mockImplementation(async ({ data }: { data: Row }) => {
    world.notifications.push(data)
    return data
  })
  db.notificationLog.findMany.mockResolvedValue([])
}

/** Audit yang tercatat untuk satu aksi, dengan before/after sudah di-parse. */
type ParsedAudit = Row & { after: any; before: any }
export function auditsOf(action: string): ParsedAudit[] {
  return world.audits
    .filter((a) => a.action === action)
    .map((a) => ({
      ...a,
      after: a.afterData ? JSON.parse(a.afterData as string) : null,
      before: a.beforeData ? JSON.parse(a.beforeData as string) : null,
    }))
}

export function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest', 'x-forwarded-for': '10.0.0.9, 10.0.0.1' },
  })
}

export const wib = (isoLocal: string) => new Date(`${isoLocal}+07:00`)
