/**
 * [F3-D] Basis data tiruan di memori untuk tes route Admin, grup, dan
 * keamanan (tests/api/admin-*.test.ts, grup-*.test.ts, keamanan-*.test.ts).
 *
 * Meniru sebagian kecil API Prisma yang dipakai route itu: findUnique/First/
 * Many(+OrThrow), count, groupBy, create, update(Many), upsert, delete(Many),
 * $transaction (fungsi atau larik, dengan rollback bila fungsi melempar).
 * `where` mendukung kesetaraan, null, in/notIn/not, lt/lte/gt/gte,
 * contains/startsWith/endsWith (mode insensitive), AND/OR/NOT, kunci unik
 * gabungan (mis. projectId_reportDate), dan saringan relasi (to-one langsung
 * atau is/isNot; to-many some/none/every). `select`/`include` mengikuti
 * relasi yang terdaftar di REL_MODEL/MANY di bawah.
 *
 * Bukan Prisma: tidak ada validasi tipe atau kunci asing. Cukup untuk
 * memeriksa cakupan (anti-IDOR), transisi status, dan jejak AuditLog tanpa
 * menyentuh basis data sungguhan.
 */

type Row = Record<string, unknown>
type Where = Record<string, unknown>

export const store: Record<string, Row[]> = {}

/** Relasi to-one: nama relasi → model; kunci asing = `${nama}Id`. */
const REL_MODEL: Record<string, string> = {
  requestedBy: 'user',
  targetUser: 'user',
  decidedBy: 'user',
  approvedBy: 'user',
  executedBy: 'user',
  submittedBy: 'user',
  forwardedBy: 'user',
  headUser: 'user',
  picUser: 'user',
  actor: 'user',
  raisedBy: 'user',
  updatedBy: 'user',
  user: 'user',
  entity: 'entity',
  scopeEntity: 'entity',
  parent: 'entity',
  project: 'project',
  division: 'division',
  divisionType: 'divisionType',
  weeklyReport: 'weeklyDivisionReport',
}

/** Relasi to-many: `${model}.${nama}` → [model anak, kunci asing di anak]. */
const MANY: Record<string, [string, string]> = {
  'project.dailyReports': ['dailyProjectReport', 'projectId'],
  'division.members': ['user', 'divisionId'],
  'division.projects': ['project', 'divisionId'],
  'user.projectsAsPic': ['project', 'picUserId'],
  'user.divisionsAsHead': ['division', 'headUserId'],
  'weeklyDivisionReport.items': ['weeklyReportItem', 'weeklyReportId'],
  'entity.children': ['entity', 'parentId'],
  'entity.divisions': ['division', 'entityId'],
  'entity.projects': ['project', 'entityId'],
}

const DEFAULTS: Record<string, Row> = {
  authSession: { revokedAt: null },
  user: { isActive: true, mustChangePassword: false, divisionId: null, scopeEntityId: null, passwordHash: null, avatarColor: null, title: null, phone: null },
  entity: { isActive: true, parentId: null },
  division: { isActive: true, headUserId: null },
  project: { lifecycle: 'AKTIF', picUserId: null, divisionId: null, approvalChain: [] },
  dailyProjectReport: { isLocked: false, isLate: false, evidenceCount: 0, progressPct: 0, forwardedAt: null, forwardedById: null, submittedAt: null, submittedById: null, lockedAt: null },
  weeklyDivisionReport: { isLocked: false, isLate: false, statusHeader: 'DRAFT', forwardedAt: null, forwardedById: null, submittedAt: null, submittedById: null, approvedAt: null, approvedById: null, lockedAt: null },
  weeklyReportItem: { evidenceCount: 0, progressPct: 0, position: 0 },
  accessRequest: { status: 'DIAJUKAN', targetUserId: null, decidedById: null, decidedAt: null, decisionNote: null, expiresAt: null, revertedAt: null, appliedData: null, reason: null, entityId: null },
  unlockRequest: { approvedById: null, approvedAt: null, executedById: null, executedAt: null, unlockUntil: null, reLockedAt: null },
  auditLog: { actorId: null, beforeData: null, afterData: null, ip: null, userAgent: null },
  notificationLog: { readAt: null, userId: null },
  approvalRequest: { status: 'DIAJUKAN', decidedById: null, decidedAt: null, decisionNote: null, appliedData: null, amount: null, divisionId: null, projectId: null, startDate: null, endDate: null },
  weeklyReportComment: { readAt: null },
  reminderRule: { enabled: true, time: null, weekday: null, params: null, lastRunAt: null, updatedById: null },
}

let seq = 0

export function resetDb(): void {
  for (const k of Object.keys(store)) delete store[k]
  seq = 0
}

function table(model: string): Row[] {
  return (store[model] ??= [])
}

/** Menambah baris dengan bawaan model; mengembalikan baris yang tersimpan. */
export function seed(model: string, rows: Row[]): Row[] {
  return rows.map((r) => insert(model, r))
}

function insert(model: string, data: Row): Row {
  const now = new Date()
  const row: Row = {
    id: `${model}-${++seq}`,
    createdAt: now,
    updatedAt: now,
    ...(model === 'auditLog' ? { at: now } : {}),
    ...(model === 'projectReview' ? { reviewedAt: now } : {}),
    ...(DEFAULTS[model] ?? {}),
    ...stripRelations(data),
  }
  table(model).push(row)
  return row
}

/** Data tulis: nilai skalar saja; objek operasi (set/increment) diterapkan. */
function stripRelations(data: Row, current: Row = {}): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    if (isPlain(v)) {
      const op = v as Row
      if ('set' in op) out[k] = op.set
      else if ('increment' in op) out[k] = Number(current[k] ?? 0) + Number(op.increment)
      else if ('decrement' in op) out[k] = Number(current[k] ?? 0) - Number(op.decrement)
      else if ('push' in op) out[k] = [...((current[k] as unknown[]) ?? []), op.push]
      // connect/create bertingkat tidak didukung — diabaikan.
      continue
    }
    out[k] = v
  }
  return out
}

function isPlain(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v)
}

const norm = (v: unknown) => (v === undefined ? null : v instanceof Date ? v.getTime() : v)

const OPS = new Set(['equals', 'in', 'notIn', 'not', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'endsWith', 'mode', 'has', 'hasSome', 'isEmpty'])

function matchScalar(value: unknown, filter: unknown): boolean {
  if (!isPlain(filter) || !Object.keys(filter).every((k) => OPS.has(k))) {
    if (Array.isArray(filter)) return JSON.stringify(value) === JSON.stringify(filter)
    return norm(value) === norm(filter)
  }
  const f = filter as Row
  const insensitive = f.mode === 'insensitive'
  const s = (x: unknown) => (insensitive ? String(x ?? '').toLowerCase() : String(x ?? ''))
  for (const [op, arg] of Object.entries(f)) {
    const v = norm(value)
    const a = norm(arg)
    switch (op) {
      case 'equals':
        if (v !== a) return false
        break
      case 'in':
        if (!(arg as unknown[]).map(norm).includes(v)) return false
        break
      case 'notIn':
        if ((arg as unknown[]).map(norm).includes(v)) return false
        break
      case 'not':
        if (isPlain(arg) ? matchScalar(value, arg) : v === a) return false
        break
      case 'lt':
        if (v === null || !((v as number) < (a as number))) return false
        break
      case 'lte':
        if (v === null || !((v as number) <= (a as number))) return false
        break
      case 'gt':
        if (v === null || !((v as number) > (a as number))) return false
        break
      case 'gte':
        if (v === null || !((v as number) >= (a as number))) return false
        break
      case 'contains':
        if (value === null || value === undefined || !s(value).includes(s(arg))) return false
        break
      case 'startsWith':
        if (value === null || value === undefined || !s(value).startsWith(s(arg))) return false
        break
      case 'endsWith':
        if (value === null || value === undefined || !s(value).endsWith(s(arg))) return false
        break
      case 'has':
        if (!Array.isArray(value) || !value.includes(arg)) return false
        break
      case 'hasSome':
        if (!Array.isArray(value) || !(arg as unknown[]).some((x) => value.includes(x))) return false
        break
      case 'isEmpty':
        if (!Array.isArray(value) || (value.length === 0) !== arg) return false
        break
    }
  }
  return true
}

function related(model: string, row: Row, rel: string): Row | null {
  const target = REL_MODEL[rel]
  const fk = row[`${rel}Id`]
  if (!target || fk === null || fk === undefined) return null
  return table(target).find((r) => r.id === fk) ?? null
}

function children(model: string, row: Row, rel: string): Row[] | null {
  const def = MANY[`${model}.${rel}`]
  if (!def) return null
  return table(def[0]).filter((r) => r[def[1]] === row.id)
}

export function matches(model: string, row: Row, where: Where | undefined): boolean {
  if (!where) return true
  for (const [k, cond] of Object.entries(where)) {
    if (cond === undefined) continue
    if (k === 'AND') {
      const list = Array.isArray(cond) ? cond : [cond]
      if (!list.every((w) => matches(model, row, w as Where))) return false
      continue
    }
    if (k === 'OR') {
      if (!(cond as Where[]).some((w) => matches(model, row, w))) return false
      continue
    }
    if (k === 'NOT') {
      const list = Array.isArray(cond) ? cond : [cond]
      if (list.some((w) => matches(model, row, w as Where))) return false
      continue
    }
    const many = MANY[`${model}.${k}`]
    if (many) {
      const kids = children(model, row, k)!
      const c = cond as Row
      if (c.some !== undefined && !kids.some((x) => matches(many[0], x, c.some as Where))) return false
      if (c.none !== undefined && kids.some((x) => matches(many[0], x, c.none as Where))) return false
      if (c.every !== undefined && !kids.every((x) => matches(many[0], x, c.every as Where))) return false
      continue
    }
    if (REL_MODEL[k] && !(k in row)) {
      const target = REL_MODEL[k]
      const r = related(model, row, k)
      if (cond === null) {
        if (r) return false
        continue
      }
      const c = cond as Row
      if ('is' in c || 'isNot' in c) {
        if ('is' in c && (c.is === null ? r !== null : !r || !matches(target, r, c.is as Where))) return false
        if ('isNot' in c && (c.isNot === null ? r === null : r !== null && matches(target, r, c.isNot as Where))) return false
        continue
      }
      if (!r || !matches(target, r, c)) return false
      continue
    }
    // Kunci unik gabungan, mis. projectId_reportDate: { projectId, reportDate }.
    if (k.includes('_') && !(k in row) && isPlain(cond) && !Object.keys(cond).some((x) => OPS.has(x))) {
      if (!matches(model, row, cond as Where)) return false
      continue
    }
    if (!matchScalar(row[k], cond)) return false
  }
  return true
}

function sortRows(rows: Row[], orderBy: unknown): Row[] {
  const list = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Row[]
  if (!list.length) return rows
  return [...rows].sort((a, b) => {
    for (const o of list) {
      for (const [k, dirRaw] of Object.entries(o)) {
        if (isPlain(dirRaw) && !('sort' in dirRaw)) continue // urut relasi: tidak didukung
        const dir = isPlain(dirRaw) ? (dirRaw.sort as string) : (dirRaw as string)
        const x = norm(a[k])
        const y = norm(b[k])
        if (x === y) continue
        if (x === null) return 1
        if (y === null) return -1
        const c = (x as number) < (y as number) ? -1 : 1
        return dir === 'desc' ? -c : c
      }
    }
    return 0
  })
}

function shape(model: string, row: Row, args: { select?: unknown; include?: unknown } = {}): Row {
  const sel = args.select as Row | undefined
  const inc = args.include as Row | undefined
  const base: Row = sel ? {} : structuredClone(row)
  const spec = sel ?? inc ?? {}
  for (const [k, v] of Object.entries(spec)) {
    if (!v) continue
    if (k === '_count') {
      const counts: Row = {}
      const s = (isPlain(v) ? (v.select as Row) : null) ?? {}
      for (const rel of Object.keys(s)) counts[rel] = children(model, row, rel)?.length ?? 0
      base._count = counts
      continue
    }
    const many = MANY[`${model}.${k}`]
    if (many) {
      const opts = (isPlain(v) ? v : {}) as Row
      let kids = children(model, row, k)!.filter((x) => matches(many[0], x, opts.where as Where))
      kids = sortRows(kids, opts.orderBy)
      if (typeof opts.skip === 'number') kids = kids.slice(opts.skip)
      if (typeof opts.take === 'number') kids = kids.slice(0, opts.take)
      base[k] = kids.map((x) => shape(many[0], x, opts))
      continue
    }
    if (REL_MODEL[k] && `${k}Id` in row) {
      const r = related(model, row, k)
      base[k] = r ? shape(REL_MODEL[k], r, isPlain(v) ? v : {}) : null
      continue
    }
    if (sel) base[k] = structuredClone(row[k] ?? null)
  }
  return base
}

class NotFound extends Error {
  code = 'P2025'
  constructor(model: string) {
    super(`No ${model} found`)
  }
}

function findAll(model: string, args: Row = {}): Row[] {
  let rows = table(model).filter((r) => matches(model, r, args.where as Where))
  rows = sortRows(rows, args.orderBy)
  if (typeof args.skip === 'number') rows = rows.slice(args.skip)
  if (typeof args.take === 'number') rows = rows.slice(0, args.take)
  return rows
}

function modelApi(model: string) {
  return {
    findMany: async (args: Row = {}) => findAll(model, args).map((r) => shape(model, r, args)),
    findFirst: async (args: Row = {}) => {
      const r = findAll(model, { ...args, take: 1 })[0]
      return r ? shape(model, r, args) : null
    },
    findUnique: async (args: Row) => {
      const r = table(model).find((x) => matches(model, x, args.where as Where))
      return r ? shape(model, r, args) : null
    },
    findFirstOrThrow: async (args: Row = {}) => {
      const r = findAll(model, { ...args, take: 1 })[0]
      if (!r) throw new NotFound(model)
      return shape(model, r, args)
    },
    findUniqueOrThrow: async (args: Row) => {
      const r = table(model).find((x) => matches(model, x, args.where as Where))
      if (!r) throw new NotFound(model)
      return shape(model, r, args)
    },
    count: async (args: Row = {}) => table(model).filter((r) => matches(model, r, args.where as Where)).length,
    groupBy: async (args: Row) => {
      const by = args.by as string[]
      const groups = new Map<string, Row[]>()
      for (const r of table(model).filter((x) => matches(model, x, args.where as Where))) {
        const key = JSON.stringify(by.map((b) => r[b]))
        groups.set(key, [...(groups.get(key) ?? []), r])
      }
      return [...groups.values()].map((rows) => ({
        ...Object.fromEntries(by.map((b) => [b, rows[0][b]])),
        _count: { _all: rows.length },
      }))
    },
    create: async (args: Row) => shape(model, insert(model, args.data as Row), args),
    createMany: async (args: Row) => {
      const list = (Array.isArray(args.data) ? args.data : [args.data]) as Row[]
      for (const d of list) insert(model, d)
      return { count: list.length }
    },
    update: async (args: Row) => {
      const r = table(model).find((x) => matches(model, x, args.where as Where))
      if (!r) throw new NotFound(model)
      Object.assign(r, stripRelations(args.data as Row, r), { updatedAt: new Date() })
      return shape(model, r, args)
    },
    updateMany: async (args: Row) => {
      const rows = table(model).filter((x) => matches(model, x, args.where as Where))
      for (const r of rows) Object.assign(r, stripRelations(args.data as Row, r), { updatedAt: new Date() })
      return { count: rows.length }
    },
    upsert: async (args: Row) => {
      const r = table(model).find((x) => matches(model, x, args.where as Where))
      if (r) {
        Object.assign(r, stripRelations(args.update as Row, r), { updatedAt: new Date() })
        return shape(model, r, args)
      }
      return shape(model, insert(model, args.create as Row), args)
    },
    delete: async (args: Row) => {
      const t = table(model)
      const i = t.findIndex((x) => matches(model, x, args.where as Where))
      if (i < 0) throw new NotFound(model)
      const [r] = t.splice(i, 1)
      return shape(model, r, args)
    },
    deleteMany: async (args: Row = {}) => {
      const t = table(model)
      const keep = t.filter((x) => !matches(model, x, args.where as Where))
      const n = t.length - keep.length
      store[model] = keep
      return { count: n }
    },
  }
}

const apis = new Map<string, ReturnType<typeof modelApi>>()

export const db: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, key: string | symbol) {
      if (typeof key !== 'string' || key === 'then') return undefined
      if (key === '$transaction') {
        return async (arg: unknown) => {
          if (typeof arg !== 'function') return Promise.all(arg as Promise<unknown>[])
          const snapshot = structuredClone(store)
          try {
            return await (arg as (tx: unknown) => unknown)(db)
          } catch (err) {
            for (const k of Object.keys(store)) delete store[k]
            Object.assign(store, snapshot)
            throw err
          }
        }
      }
      if (key === '$queryRaw' || key === '$queryRawUnsafe') return async () => []
      if (key === '$executeRaw' || key === '$executeRawUnsafe') return async () => 0
      if (key.startsWith('$')) return async () => undefined
      let api = apis.get(key)
      if (!api) {
        api = modelApi(key)
        apis.set(key, api)
      }
      return api
    },
  }
)

/** Baris tersimpan (bukan salinan) — untuk memeriksa hasil di tes. */
export function rows(model: string, where?: Where): Row[] {
  return table(model).filter((r) => matches(model, r, where))
}

export function one(model: string, id: string): Row {
  const r = table(model).find((x) => x.id === id)
  if (!r) throw new Error(`${model} ${id} tidak ada`)
  return r
}

/** Aksi AuditLog yang tercatat, berurutan. */
export function auditActions(): string[] {
  return table('auditLog').map((r) => String(r.action))
}

// ------------------------------------------------------------------
// Sesi & dunia contoh
// ------------------------------------------------------------------

/** Nilai cookie sesi yang dibaca tiruan `next/headers` di tiap berkas tes. */
export const cookie: { value: string | undefined } = { value: undefined }

export const AUTH_SECRET_FOR_TESTS = 'tes-rahasia-auth-f3d-yang-panjangnya-lebih-dari-32-karakter'

type UserSeed = { id: string; name: string; role: string; scopeEntityId: string | null; divisionId?: string | null }

export const USERS: UserSeed[] = [
  { id: 'u-admin-a', name: 'Maya Admin A', role: 'ADMIN_PT', scopeEntityId: 'pt-a' },
  { id: 'u-admin-b', name: 'Budi Admin B', role: 'ADMIN_PT', scopeEntityId: 'pt-b' },
  { id: 'u-dir-a', name: 'Dian Direktur A', role: 'DIREKTUR_ENTITAS', scopeEntityId: 'pt-a' },
  { id: 'u-dir-b', name: 'Rudi Direktur B', role: 'DIREKTUR_ENTITAS', scopeEntityId: 'pt-b' },
  { id: 'u-kadiv-a', name: 'Kirana Kadiv A', role: 'KEPALA_DIVISI', scopeEntityId: 'pt-a', divisionId: 'div-a1' },
  { id: 'u-pic-a', name: 'Putra PIC A', role: 'PIC_PROYEK', scopeEntityId: 'pt-a', divisionId: 'div-a1' },
  { id: 'u-pic-a2', name: 'Sari PIC A2', role: 'PIC_PROYEK', scopeEntityId: 'pt-a', divisionId: 'div-a1' },
  { id: 'u-pic-b', name: 'Bayu PIC B', role: 'PIC_PROYEK', scopeEntityId: 'pt-b', divisionId: 'div-b1' },
  { id: 'u-sdm', name: 'Sinta SDM GA', role: 'DIREKTUR_SDM_GA', scopeEntityId: null },
  { id: 'u-ti', name: 'Tono TI', role: 'TI', scopeEntityId: null },
  { id: 'u-super', name: 'Sule Super', role: 'SUPERADMIN', scopeEntityId: null },
  { id: 'u-auditor', name: 'Yusuf Auditor', role: 'AUDITOR', scopeEntityId: null },
  { id: 'u-mgmt', name: 'Mira Manajemen', role: 'MANAJEMEN', scopeEntityId: null },
]

/**
 * Holding + dua PT (pt-a, pt-b), divisi, proyek, dan akun semua peran.
 * Kata sandi tiap akun "hash-<id>" (bukan hash sungguhan; cukup untuk sidik sesi).
 */
export function world(): void {
  resetDb()
  seed('entity', [
    { id: 'h', name: 'PT. BIKE Tbk', code: 'BIKE', type: 'HOLDING', path: '/h/' },
    { id: 'pt-a', name: 'PT Alfa', code: 'ALF', type: 'PT', path: '/h/pt-a/', parentId: 'h' },
    { id: 'pt-b', name: 'PT Beta', code: 'BET', type: 'PT', path: '/h/pt-b/', parentId: 'h' },
  ])
  seed('divisionType', [{ id: 'dt-1', name: 'Operasional', isActive: true }])
  seed('division', [
    { id: 'div-a1', name: 'Teknik', entityId: 'pt-a', headUserId: 'u-kadiv-a', divisionTypeId: 'dt-1' },
    { id: 'div-a2', name: 'Keuangan', entityId: 'pt-a', headUserId: null, divisionTypeId: 'dt-1' },
    { id: 'div-b1', name: 'Teknik', entityId: 'pt-b', headUserId: null, divisionTypeId: 'dt-1' },
  ])
  seed(
    'user',
    USERS.map((u) => ({
      ...u,
      email: `${u.id}@contoh.test`,
      username: u.id.replace(/^u-/, ''),
      passwordHash: `hash-${u.id}`,
      divisionId: u.divisionId ?? null,
    }))
  )
  seed('project', [
    { id: 'prj-a', name: 'Gudang Alfa', code: 'ALF-001', entityId: 'pt-a', picUserId: 'u-pic-a', picName: 'Putra PIC A', divisionId: 'div-a1', startDate: new Date('2026-09-01T00:00:00Z') },
    { id: 'prj-b', name: 'Gudang Beta', code: 'BET-001', entityId: 'pt-b', picUserId: 'u-pic-b', picName: 'Bayu PIC B', divisionId: 'div-b1', startDate: new Date('2026-09-01T00:00:00Z') },
  ])
}
