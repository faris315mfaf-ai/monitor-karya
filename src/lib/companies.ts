import 'server-only'

import type { Prisma } from '@prisma/client'
import { hashPassword } from '@/lib/password'
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, generatePassword } from '@/lib/password-policy'
import { ALL_ROLES, ENTITY_ROLES, HOLDING_ROLES } from '@/lib/rbac'

/**
 * Meja perusahaan & akun milik Super Admin (10 Sep 2026): aturan bersama untuk
 * membuat perusahaan, posisi, dan akunnya — dipakai /api/companies dan
 * /api/companies/users supaya validasinya satu.
 */

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
/** F1-C (6 Okt 2026): minimal 8 karakter — sumbernya src/lib/password-policy.ts. */
export const MIN_PASSWORD = MIN_PASSWORD_LENGTH
/*
 * Akun yang dibuat tanpa kata sandi tidak lagi memakai "1234" bawaan: diberi
 * kata sandi acak (generatePassword) dan mustChangePassword = true. Pemegang
 * meja memberi kata sandi awal lewat "Setel ulang kata sandi".
 */
/** Logo disimpan sebagai data URL; 400 KB sudah lebih dari cukup untuk 256 px. */
export const MAX_LOGO_CHARS = 400_000

export type Tx = Prisma.TransactionClient

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/** Data URL gambar kecil, null untuk menghapus, undefined bila tidak dikirim. */
export function parseLogo(raw: unknown): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined }
  if (raw === null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'Logo tidak valid.' }
  if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(raw)) {
    return { ok: false, error: 'Logo harus berupa gambar PNG, JPEG, WebP, atau SVG.' }
  }
  if (raw.length > MAX_LOGO_CHARS) return { ok: false, error: 'Logo terlalu besar. Gunakan gambar yang lebih kecil.' }
  return { ok: true, value: raw }
}

export type PositionInput = {
  role: string
  name: string
  username: string
  email: string | null
  password: string | null
  title: string | null
  phone: string | null
  divisionId: string | null
  divisionName: string | null
  projectId: string | null
  projectName: string | null
  avatarColor: string | null
}

const str = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '')

/** Membaca satu posisi dari badan permintaan; mengembalikan pesan galat bila tidak lengkap. */
export function readPosition(raw: unknown, opts: { holding: boolean; subholding?: boolean }): PositionInput | string {
  if (!raw || typeof raw !== 'object') return 'Posisi tidak valid.'
  const o = raw as Record<string, unknown>
  const role = str(o, 'role')
  const allowed = positionRolesFor(opts.subholding ? 'SUB_HOLDING' : opts.holding ? 'HOLDING' : 'PT')
  if (!allowed.includes(role)) return `Posisi "${role || '(kosong)'}" tidak dikenali.`
  const name = str(o, 'name')
  if (!name) return 'Nama pemegang posisi wajib diisi.'
  const username = str(o, 'username').toLowerCase() || slugify(name)
  if (!USERNAME_RE.test(username)) {
    return `Username "${username}" tidak valid: 3–32 huruf kecil/angka, boleh titik, garis bawah, atau strip.`
  }
  const email = str(o, 'email').toLowerCase() || `${username}@karya.co.id`
  if (!isValidEmail(email)) return `Email "${email}" tidak valid.`
  const password = str(o, 'password')
  if (password && password.length < MIN_PASSWORD) return `Kata sandi ${username} minimal ${MIN_PASSWORD} karakter.`
  if (password.length > MAX_PASSWORD_LENGTH) return `Kata sandi ${username} maksimal ${MAX_PASSWORD_LENGTH} karakter.`
  return {
    role,
    name,
    username,
    email,
    password: password || null,
    title: str(o, 'title') || null,
    phone: str(o, 'phone') || null,
    divisionId: str(o, 'divisionId') || null,
    divisionName: str(o, 'divisionName') || null,
    projectId: str(o, 'projectId') || null,
    projectName: str(o, 'projectName') || null,
    avatarColor: /^#[0-9a-f]{6}$/i.test(str(o, 'avatarColor')) ? str(o, 'avatarColor') : null,
  }
}

export function isKnownRole(role: string): boolean {
  return (ALL_ROLES as readonly string[]).includes(role) || (NEW_MODEL_ROLES as readonly string[]).includes(role)
}

/* ------------------------------------------------------------------------
 * Model laporan SUBHOLDING (16 Okt 2026, docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md).
 * Peran baru ditulis sebagai string di sini supaya meja akun tetap benar
 * walau daftar peran di src/lib/rbac.ts belum/ sudah memuatnya.
 * ---------------------------------------------------------------------- */

/** Satu akun bersama per subholding; cakupannya = id subholding. */
export const ADMIN_SUBHOLDING_ROLE = 'ADMIN_SUBHOLDING'
/** Peran tingkat grup tanpa cakupan entitas (scopeEntityId null). */
export const UNSCOPED_GROUP_ROLES = ['SUPERVISOR', 'KETUA_UMUM', 'MANAJEMEN'] as const
/** Peran model baru yang mungkin belum ada di ALL_ROLES (rbac.ts). */
export const NEW_MODEL_ROLES = [ADMIN_SUBHOLDING_ROLE, 'SUPERVISOR', 'KETUA_UMUM'] as const
/** Sandi awal akun Admin subholding buatan otomatis; wajib diganti saat masuk pertama. */
export const SUBHOLDING_DEFAULT_PASSWORD = '12345678'
/** Jenis entitas tempat akun boleh ditempatkan. */
export const ACCOUNT_ENTITY_TYPES = ['HOLDING', 'SUB_HOLDING', 'PT'] as const

export function isUnscopedGroupRole(role: string): boolean {
  return (UNSCOPED_GROUP_ROLES as readonly string[]).includes(role)
}

const uniq = (xs: readonly string[]) => [...new Set(xs)]

/**
 * Posisi yang boleh dibuat di sebuah jenis entitas (null = tingkat grup).
 * Subholding hanya untuk Admin subholding (dan Direktur yang berlingkup
 * subholding); peran tingkat grup tidak pernah ditempatkan di PT/subholding.
 */
export function positionRolesFor(entityType: string | null): string[] {
  if (entityType === 'SUB_HOLDING') return [ADMIN_SUBHOLDING_ROLE, 'DIREKTUR_ENTITAS']
  const group = entityType === null || entityType === 'HOLDING'
  const base = group ? [...ENTITY_ROLES, ...HOLDING_ROLES, 'SUPERVISOR', 'KETUA_UMUM'] : [...ENTITY_ROLES]
  return uniq(base).filter((r) => r !== ADMIN_SUBHOLDING_ROLE && (group || !isUnscopedGroupRole(r)))
}

/** Peran yang dapat dikelola meja akun; meja penuh (Super Admin) ditambah peran model baru. */
export function deskRoles(desk: { full: boolean; roles: readonly string[] }): string[] {
  return desk.full ? uniq([...desk.roles, ...NEW_MODEL_ROLES]) : [...desk.roles]
}

/**
 * Pesan galat bila peran tidak cocok dengan tempatnya, null bila cocok.
 * - ADMIN_SUBHOLDING wajib di entitas bertipe SUB_HOLDING.
 * - SUPERVISOR / KETUA_UMUM / MANAJEMEN tanpa cakupan (holding dianggap tanpa cakupan).
 * - Subholding hanya menampung Admin subholding dan Direktur.
 */
export function roleScopeProblem(role: string, entity: { type: string } | null): string | null {
  if (role === ADMIN_SUBHOLDING_ROLE) {
    return entity?.type === 'SUB_HOLDING' ? null : 'Admin subholding wajib ditempatkan di sebuah subholding.'
  }
  if (isUnscopedGroupRole(role)) {
    return entity && entity.type !== 'HOLDING' ? 'Supervisor, Ketua Umum, dan Manajemen tidak ditempatkan di perusahaan mana pun.' : null
  }
  if (entity?.type === 'SUB_HOLDING' && role !== 'DIREKTUR_ENTITAS') {
    return 'Subholding hanya menampung akun Admin subholding atau Direktur.'
  }
  return null
}

export type AccountEntity = { id: string; code: string; name: string; type: string }

/** Entitas tempat akun (HOLDING/SUB_HOLDING/PT); galat bila tidak ada. */
export async function accountEntity(client: Pick<Tx, 'entity'>, id: string | null): Promise<AccountEntity | null> {
  if (!id) return null
  const e = await client.entity.findFirst({
    where: { id, type: { in: [...ACCOUNT_ENTITY_TYPES] } },
    select: { id: true, code: true, name: true, type: true },
  })
  if (!e) throw new Error('Perusahaan tidak ditemukan.')
  return e
}

/** Satu akun Admin subholding aktif per subholding (kontrak 16 Okt). */
export async function assertSingleSubholdingAdmin(client: Pick<Tx, 'user'>, subholdingId: string, excludeUserId?: string) {
  const other = await client.user.findFirst({
    where: {
      role: ADMIN_SUBHOLDING_ROLE,
      scopeEntityId: subholdingId,
      isActive: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { username: true },
  })
  if (other) throw new Error(`Subholding ini sudah punya akun Admin subholding (${other.username ?? 'aktif'}).`)
}

/** Slug nama subholding untuk username admin: tanpa awalan PT/Holding/Subholding. */
export function subholdingSlug(name: string): string {
  return slugify(name.replace(/^(pt|sub[\s-]?holding|holding)\s+/i, '')) || slugify(name) || 'subholding'
}

/**
 * Username + email unik dari `base`: bentrok salah satunya → akhiran angka
 * (admin.energi, admin.energi2, admin.energi3, ...). Panjang tetap ≤ 32.
 */
export async function uniqueAccountHandle(tx: Pick<Tx, 'user'>, base: string): Promise<{ username: string; email: string }> {
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? '' : String(n)
    const username = `${base.slice(0, 32 - suffix.length)}${suffix}`
    const email = `${username}@karya.co.id`
    const [u, e] = await Promise.all([
      tx.user.findUnique({ where: { username }, select: { id: true } }),
      tx.user.findUnique({ where: { email }, select: { id: true } }),
    ])
    if (!u && !e) return { username, email }
  }
  throw new Error('Tidak dapat membuat username yang unik.')
}

/**
 * Akun Admin subholding utama untuk subholding baru: `admin.<slug>`,
 * "Admin <nama>", sandi awal 12345678, wajib ganti sandi saat masuk pertama.
 * Sandi awal dikembalikan SEKALI ke pemanggil (bukan untuk AuditLog).
 */
export async function createSubholdingAdmin(tx: Tx, subholding: { id: string; name: string }) {
  const { username, email } = await uniqueAccountHandle(tx, `admin.${subholdingSlug(subholding.name)}`)
  const user = await tx.user.create({
    data: {
      username,
      email,
      name: `Admin ${subholding.name}`.slice(0, 120),
      role: ADMIN_SUBHOLDING_ROLE,
      title: 'Admin subholding',
      scopeEntityId: subholding.id,
      avatarColor: pickColor(username),
      passwordHash: await hashPassword(SUBHOLDING_DEFAULT_PASSWORD),
      mustChangePassword: true,
    },
    select: { id: true, username: true, name: true, role: true, email: true },
  })
  return { ...user, username: user.username ?? username, defaultPassword: SUBHOLDING_DEFAULT_PASSWORD }
}

/* ------------------------------------------------------------------------
 * Memindah induk entitas (SH-PINDAH-PT, 16 Okt 2026).
 * Di produksi PT lama berada langsung di bawah holding (PT BIKE Tbk); model
 * subholding butuh PT di bawah SUB_HOLDING. Pemindahan mengganti `parentId`
 * entitas itu dan menulis ulang materialized `path` entitas beserta SEMUA
 * keturunannya (ganti awalan) dalam satu transaksi.
 * ---------------------------------------------------------------------- */

/** Jenis entitas yang boleh dipindah induknya. Holding/subholding tidak. */
export const MOVABLE_ENTITY_TYPES = ['PT', 'SECTOR', 'REGION'] as const
/** Induk tujuan yang sah: holding, subholding, atau keturunan struktural (SECTOR/REGION). */
export const MOVE_PARENT_TYPES = ['HOLDING', 'SUB_HOLDING', 'SECTOR', 'REGION'] as const
/** Batas penelusuran rantai induk (jaga-jaga data lama yang berputar). */
const MAX_TREE_DEPTH = 32

/** Penolakan pemindahan yang aman untuk klien, membawa status HTTP-nya. */
export class EntityMoveError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422
  ) {
    super(message)
    this.name = 'EntityMoveError'
  }
}

/** Segmen terakhir path ("/holding/SH-X/PT-A/" → "PT-A"); kosong bila path rusak. */
export function lastPathSegment(path: string | null | undefined): string {
  return (path ?? '').split('/').filter(Boolean).pop() ?? ''
}

/** Path entitas di bawah induk baru: `<path induk>/<segmen>/`. */
export function childPath(parentPath: string, segment: string): string {
  const base = parentPath.endsWith('/') ? parentPath : `${parentPath}/`
  return `${base}${segment}/`
}

/** Ganti awalan `oldPrefix` → `newPrefix`; path di luar subpohon dikembalikan apa adanya. */
export function rebasePath(path: string, oldPrefix: string, newPrefix: string): string {
  return path.startsWith(oldPrefix) ? `${newPrefix}${path.slice(oldPrefix.length)}` : path
}

type MoveEntityRow = { id: string; type: string; code: string; name: string; path: string; parentId: string | null; isActive: boolean }

export type EntityMoveResult = {
  moved: boolean
  entity: { id: string; code: string; name: string; type: string }
  from: { parentId: string | null; parentName: string | null; parentType: string | null; path: string }
  to: { parentId: string; parentName: string; parentType: string; path: string }
  /** Jumlah keturunan yang path-nya ikut ditulis ulang. */
  descendants: number
}

const MOVE_SELECT = { id: true, type: true, code: true, name: true, path: true, parentId: true, isActive: true } as const

/**
 * Pindahkan entitas `id` ke bawah `parentId` (harus dipanggil di dalam
 * transaksi). Menolak:
 *  - entitas bukan PT/SECTOR/REGION (422) atau tidak ada (404);
 *  - induk tidak ada / bukan HOLDING, SUB_HOLDING, SECTOR, REGION / nonaktif (422);
 *  - siklus: induk = diri sendiri atau keturunannya (422);
 *  - path tujuan sudah dipakai entitas lain (409).
 * Induk sama dengan induk sekarang → `moved: false`, tidak menulis apa pun.
 *
 * Konsistensi: semua pembaca cakupan (scopeEntityIds, scopePathPrefix,
 * subholding/scope.ts, dashboard, compliance-map) membaca `path` langsung dari
 * DB, jadi begitu transaksi selesai cakupan mengikuti struktur baru. Baris
 * akar (parentId null) dikunci FOR UPDATE supaya dua pemindahan bersamaan
 * berjalan berurutan dan tidak saling menimpa path / membentuk siklus.
 */
export async function moveEntity(tx: Tx, input: { id: string; parentId: string }): Promise<EntityMoveResult> {
  await tx.$queryRaw`SELECT "id" FROM "Entity" WHERE "parentId" IS NULL ORDER BY "id" FOR UPDATE`

  const entity = (await tx.entity.findUnique({ where: { id: input.id }, select: MOVE_SELECT })) as MoveEntityRow | null
  if (!entity) throw new EntityMoveError('Perusahaan tidak ditemukan', 404)
  if (!(MOVABLE_ENTITY_TYPES as readonly string[]).includes(entity.type)) {
    throw new EntityMoveError('Hanya PT (atau sektor/wilayah) yang bisa dipindah ke induk lain.', 422)
  }
  if (input.parentId === entity.id) throw new EntityMoveError('Perusahaan tidak bisa menjadi induk dirinya sendiri.', 422)

  const target = (await tx.entity.findUnique({ where: { id: input.parentId }, select: MOVE_SELECT })) as MoveEntityRow | null
  if (!target) throw new EntityMoveError('Induk tujuan tidak ditemukan.', 422)
  if (!(MOVE_PARENT_TYPES as readonly string[]).includes(target.type)) {
    throw new EntityMoveError('Induk tujuan harus holding, subholding, atau bagian di bawah subholding.', 422)
  }

  const oldPath = entity.path ?? ''
  const segment = lastPathSegment(oldPath) || entity.code
  const current = entity.parentId
    ? ((await tx.entity.findUnique({ where: { id: entity.parentId }, select: MOVE_SELECT })) as MoveEntityRow | null)
    : null
  const from = { parentId: entity.parentId, parentName: current?.name ?? null, parentType: current?.type ?? null, path: oldPath }
  const summary = { id: entity.id, code: entity.code, name: entity.name, type: entity.type }

  if (target.id === entity.parentId) {
    return {
      moved: false,
      entity: summary,
      from,
      to: { parentId: target.id, parentName: target.name, parentType: target.type, path: oldPath },
      descendants: 0,
    }
  }
  if (!target.isActive) throw new EntityMoveError('Induk tujuan sedang nonaktif. Aktifkan dulu atau pilih induk lain.', 422)

  // Siklus: lewat path (cepat) dan lewat rantai parentId (tahan path lama yang tidak konsisten).
  if (oldPath && target.path?.startsWith(oldPath)) {
    throw new EntityMoveError('Induk tujuan berada di bawah perusahaan ini. Pilih induk lain.', 422)
  }
  let cursor: string | null = target.parentId
  for (let depth = 0; cursor && depth < MAX_TREE_DEPTH; depth++) {
    if (cursor === entity.id) throw new EntityMoveError('Induk tujuan berada di bawah perusahaan ini. Pilih induk lain.', 422)
    const up = (await tx.entity.findUnique({ where: { id: cursor }, select: { parentId: true } })) as { parentId: string | null } | null
    cursor = up?.parentId ?? null
  }

  if (!target.path) throw new EntityMoveError('Struktur induk tujuan belum lengkap. Hubungi tim TI.', 409)
  if (!oldPath.endsWith('/') || !oldPath.startsWith('/')) {
    throw new EntityMoveError('Struktur perusahaan ini belum lengkap. Hubungi tim TI.', 409)
  }
  const newPath = childPath(target.path, segment)
  const clash = await tx.entity.findFirst({ where: { path: newPath, id: { not: entity.id } }, select: { id: true } })
  if (clash) throw new EntityMoveError('Sudah ada entitas lain dengan posisi yang sama di induk tujuan.', 409)

  const descendants = (await tx.entity.findMany({
    where: { path: { startsWith: oldPath }, id: { not: entity.id } },
    select: { id: true, path: true },
  })) as { id: string; path: string }[]

  await tx.entity.update({ where: { id: entity.id }, data: { parentId: target.id, path: newPath } })
  for (const d of descendants) {
    await tx.entity.update({ where: { id: d.id }, data: { path: rebasePath(d.path, oldPath, newPath) } })
  }

  return {
    moved: true,
    entity: summary,
    from,
    to: { parentId: target.id, parentName: target.name, parentType: target.type, path: newPath },
    descendants: descendants.length,
  }
}

const PALETTE = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#16a34a', '#ea580c', '#0d9488', '#4f46e5']

export function pickColor(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/** Kode entitas unik: PT-<SLUG> atau HOLDING-<SLUG>, ditambah angka bila bentrok. */
export async function uniqueEntityCode(tx: Tx, base: string): Promise<string> {
  let code = base
  for (let n = 2; n < 100; n++) {
    const clash = await tx.entity.findUnique({ where: { code }, select: { id: true } })
    if (!clash) return code
    code = `${base}-${n}`
  }
  throw new Error('Tidak dapat membuat kode entitas yang unik.')
}

export async function nextProjectCode(tx: Tx, entityCode: string): Promise<string> {
  const prefix = `${entityCode}-PRJ-`
  const count = await tx.project.count({ where: { code: { startsWith: prefix } } })
  for (let n = count + 1; n < count + 100; n++) {
    const code = `${prefix}${String(n).padStart(2, '0')}`
    const clash = await tx.project.findUnique({ where: { code }, select: { id: true } })
    if (!clash) return code
  }
  throw new Error('Tidak dapat membuat kode proyek yang unik.')
}

async function divisionTypeFor(tx: Tx, name: string): Promise<string> {
  const byName = await tx.divisionType.findFirst({
    where: { isActive: true, name: { contains: name.split(' ')[0], mode: 'insensitive' } },
    select: { id: true },
  })
  if (byName) return byName.id
  const any = await tx.divisionType.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true } })
  if (any) return any.id
  const created = await tx.divisionType.create({ data: { code: 'UMUM', name: 'Umum' }, select: { id: true } })
  return created.id
}

type EntityRef = { id: string; code: string; name: string }

/**
 * Menautkan sebuah akun ke divisi (Kepala Divisi) atau proyek (Manager Proyek)
 * di perusahaannya — memakai yang sudah ada bila diberi id, atau membuat baru
 * dari namanya. Posisi lain tidak butuh tautan.
 */
export async function assignPosition(
  tx: Tx,
  user: { id: string; name: string; role: string },
  entity: EntityRef | null,
  p: Pick<PositionInput, 'divisionId' | 'divisionName' | 'projectId' | 'projectName'>
): Promise<{ divisionId?: string; projectId?: string }> {
  if (!entity) return {}

  if (user.role === 'KEPALA_DIVISI') {
    if (p.divisionId) {
      const d = await tx.division.findFirst({ where: { id: p.divisionId, entityId: entity.id }, select: { id: true } })
      if (!d) throw new Error('Divisi tidak ditemukan di perusahaan ini.')
      await tx.division.update({ where: { id: d.id }, data: { headUserId: user.id } })
      return { divisionId: d.id }
    }
    if (p.divisionName) {
      const existing = await tx.division.findFirst({ where: { entityId: entity.id, name: p.divisionName }, select: { id: true } })
      const d =
        existing ??
        (await tx.division.create({
          data: { entityId: entity.id, name: p.divisionName, divisionTypeId: await divisionTypeFor(tx, p.divisionName) },
          select: { id: true },
        }))
      await tx.division.update({ where: { id: d.id }, data: { headUserId: user.id } })
      return { divisionId: d.id }
    }
    return {}
  }

  if (user.role === 'PIC_PROYEK') {
    if (p.projectId) {
      const pr = await tx.project.findFirst({ where: { id: p.projectId, entityId: entity.id }, select: { id: true } })
      if (!pr) throw new Error('Proyek tidak ditemukan di perusahaan ini.')
      await tx.project.update({ where: { id: pr.id }, data: { picUserId: user.id, picName: user.name } })
      return { projectId: pr.id }
    }
    if (p.projectName) {
      const pr = await tx.project.create({
        data: {
          entityId: entity.id,
          code: await nextProjectCode(tx, entity.code),
          name: p.projectName,
          phase: 'PELAKSANAAN',
          lifecycle: 'AKTIF',
          picUserId: user.id,
          picName: user.name,
          startDate: new Date(),
        },
        select: { id: true },
      })
      return { projectId: pr.id }
    }
  }
  return {}
}

/**
 * Membuat akun untuk satu posisi, lalu menautkannya. Kata sandi kosong = acak.
 * Akun buatan admin selalu wajib ganti kata sandi saat masuk pertama (F1-C).
 */
export async function createAccount(tx: Tx, entity: EntityRef | null, p: PositionInput) {
  const [userClash, emailClash] = await Promise.all([
    tx.user.findUnique({ where: { username: p.username }, select: { id: true } }),
    tx.user.findUnique({ where: { email: p.email! }, select: { id: true } }),
  ])
  if (userClash) throw new Error(`Username "${p.username}" sudah dipakai.`)
  if (emailClash) throw new Error(`Email "${p.email}" sudah dipakai.`)

  // Peran tingkat grup (Supervisor/Ketua Umum/Manajemen) selalu tanpa cakupan.
  const scopeEntityId = isUnscopedGroupRole(p.role) ? null : (entity?.id ?? null)
  const user = await tx.user.create({
    data: {
      username: p.username,
      email: p.email!,
      name: p.name,
      role: p.role,
      title: p.title,
      phone: p.phone,
      scopeEntityId,
      avatarColor: p.avatarColor ?? pickColor(p.username),
      passwordHash: await hashPassword(p.password || generatePassword()),
      mustChangePassword: true,
    },
    select: { id: true, name: true, role: true, username: true, email: true },
  })
  const link = await assignPosition(tx, user, entity, p)
  return { ...user, ...link }
}
