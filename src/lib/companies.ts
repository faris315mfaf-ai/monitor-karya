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
export function readPosition(raw: unknown, opts: { holding: boolean }): PositionInput | string {
  if (!raw || typeof raw !== 'object') return 'Posisi tidak valid.'
  const o = raw as Record<string, unknown>
  const role = str(o, 'role')
  const allowed = opts.holding ? [...ENTITY_ROLES, ...HOLDING_ROLES] : [...ENTITY_ROLES]
  if (!(allowed as string[]).includes(role)) return `Posisi "${role || '(kosong)'}" tidak dikenali.`
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
  return (ALL_ROLES as readonly string[]).includes(role)
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

  const scoped = (ENTITY_ROLES as readonly string[]).includes(p.role)
  const user = await tx.user.create({
    data: {
      username: p.username,
      email: p.email!,
      name: p.name,
      role: p.role,
      title: p.title,
      phone: p.phone,
      scopeEntityId: scoped ? (entity?.id ?? null) : entity?.id ?? null,
      avatarColor: p.avatarColor ?? pickColor(p.username),
      passwordHash: await hashPassword(p.password || generatePassword()),
      mustChangePassword: true,
    },
    select: { id: true, name: true, role: true, username: true, email: true },
  })
  const link = await assignPosition(tx, user, entity, p)
  return { ...user, ...link }
}
