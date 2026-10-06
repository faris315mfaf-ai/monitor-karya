import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { MUST_CHANGE_PASSWORD_CODE, MUST_CHANGE_PASSWORD_MESSAGE, blocksForPasswordChange } from '@/lib/password-policy'

const IS_PROD = process.env.NODE_ENV === 'production'

/**
 * Di produksi cookie memakai awalan `__Host-`: browser hanya menerimanya bila
 * Secure, Path=/ dan tanpa Domain, jadi subdomain lain tidak bisa menimpanya.
 * Di dev (http://localhost) awalan itu tidak bisa dipakai.
 */
export const SESSION_COOKIE = IS_PROD ? '__Host-mk_session' : 'mk_session'
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60 // one working day

function authSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short (need at least 32 chars). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"'
    )
  }
  return secret
}

// Password hashing lives in lib/password so that Node scripts can reuse it.
export { hashPassword, verifyPassword } from '@/lib/password'

// ------------------------------------------------------------------
// Session tokens — compact HMAC-signed payload, no external dependency
// ------------------------------------------------------------------

type SessionPayload = { sub: string; iat: number; exp: number; pv?: string }

function sign(data: string): string {
  return createHmac('sha256', authSecret()).update(data).digest('base64url')
}

/**
 * Sidik kata sandi di dalam token (6 Okt 2026): HMAC dari hash kata sandi saat
 * token dibuat. Begitu kata sandi diganti atau disetel ulang, semua sesi lama
 * otomatis tidak berlaku lagi tanpa tabel sesi. Hash-nya sendiri tidak pernah
 * keluar dari server.
 */
function passwordFingerprint(passwordHash: string | null): string {
  return sign(`pv:${passwordHash ?? ''}`).slice(0, 22)
}

export function createSessionToken(
  userId: string,
  passwordHash: string | null = null
): { token: string; maxAge: number } {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    sub: userId,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    pv: passwordFingerprint(passwordHash),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { token: `${body}.${sign(body)}`, maxAge: SESSION_MAX_AGE_SECONDS }
}

/** Opsi cookie sesi: httpOnly, SameSite=Lax, Secure di produksi. */
function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: IS_PROD, path: '/', maxAge, priority: 'high' as const }
}

/** Memasang cookie sesi baru pada respons (masuk, ganti kata sandi sendiri). */
export function setSessionCookie(res: NextResponse, userId: string, passwordHash: string | null) {
  const { token, maxAge } = createSessionToken(userId, passwordHash)
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge))
}

/** Menghapus cookie sesi (keluar). */
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0))
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  if (token.length > 2048) return null
  const expectedSig = Buffer.from(sign(body))
  const givenSig = Buffer.from(signature)
  if (expectedSig.length !== givenSig.length || !timingSafeEqual(expectedSig, givenSig)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (!payload.sub || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp * 1000 < Date.now()) return null
    // Token tanpa sidik kata sandi berasal dari sebelum 6 Okt 2026: masuk ulang.
    if (typeof payload.pv !== 'string') return null
    return payload
  } catch {
    return null
  }
}

// ------------------------------------------------------------------
// Current user
// ------------------------------------------------------------------

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
  scopeEntityId: string | null
  avatarColor: string | null
  /**
   * [F1-C] Akun dibuat/disetel ulang admin: wajib ganti kata sandi sebelum
   * memakai aplikasi. getSessionUser selalu mengisinya; opsional supaya objek
   * uji/pratinjau yang dibuat tangan tetap sah (tidak ada = false).
   */
  mustChangePassword?: boolean
}

const SESSION_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  scopeEntityId: true,
  avatarColor: true,
  isActive: true,
  passwordHash: true,
} as const

/** Galat Prisma "kolom tidak ada" (P2022): migrasi 0018 belum diterapkan. */
function isMissingColumn(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2022'
}
let warnedMissingColumn = false

/**
 * Membaca baris akun untuk sesi. Selama migrasi 0018_auth_password belum
 * diterapkan, kolom mustChangePassword belum ada; daripada mengeluarkan
 * semua orang, sesi dibaca tanpa kolom itu (dianggap false) dan diberi
 * peringatan sekali di log server.
 */
async function readSessionRow(id: string) {
  try {
    return await db.user.findUnique({ where: { id }, select: { ...SESSION_SELECT, mustChangePassword: true } })
  } catch (err) {
    if (!isMissingColumn(err)) throw err
    if (!warnedMissingColumn) {
      warnedMissingColumn = true
      console.warn('[auth] kolom User.mustChangePassword belum ada — terapkan migrasi 0018_auth_password.')
    }
    const row = await db.user.findUnique({ where: { id }, select: SESSION_SELECT })
    return row ? { ...row, mustChangePassword: false } : null
  }
}

/** [F1-C] Tanda wajib-ganti-kata-sandi satu akun; false bila kolomnya belum ada (migrasi 0018). */
export async function mustChangePasswordFor(userId: string): Promise<boolean> {
  try {
    const row = await db.user.findUnique({ where: { id: userId }, select: { mustChangePassword: true } })
    return Boolean(row?.mustChangePassword)
  } catch (err) {
    if (isMissingColumn(err)) return false
    throw err
  }
}

/**
 * Resolves the signed-in user from the session cookie. The row is re-read on
 * every call so a deactivated account or a changed role takes effect at once
 * rather than living on inside an already-issued token.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const payload = readSessionToken(store.get(SESSION_COOKIE)?.value)
  if (!payload) return null

  let user
  try {
    user = await readSessionRow(payload.sub)
  } catch (err) {
    // With the database unreachable nobody can be signed in. Treating that as
    // "no session" sends the browser to /login, which says what is wrong.
    console.error('[auth] session lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
  if (!user || !user.isActive) return null
  // Kata sandi sudah berganti sejak token dibuat: sesi lama dicabut.
  const pv = Buffer.from(passwordFingerprint(user.passwordHash))
  const given = Buffer.from(payload.pv ?? '')
  if (pv.length !== given.length || !timingSafeEqual(pv, given)) return null

  const { isActive: _isActive, passwordHash: _passwordHash, mustChangePassword, ...rest } = user
  return { ...rest, mustChangePassword: Boolean(mustChangePassword) }
}

/**
 * Guard for route handlers. Returns either the user or the 401 response to
 * return directly:
 *
 *   const auth = await requireApiUser()
 *   if (auth instanceof NextResponse) return auth
 *
 * [F1-C] Akun yang wajib mengganti kata sandi ditolak 403
 * { error: 'Ganti kata sandi dulu', code: 'MUST_CHANGE_PASSWORD' } di semua
 * rute, kecuali rute yang memanggil dengan `allowPendingPasswordChange`
 * (hanya /api/profile/password). /api/auth/logout & /api/auth/me memakai
 * getSessionUser langsung.
 */
export async function requireApiUser(
  opts: { allowPendingPasswordChange?: boolean } = {}
): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  if (blocksForPasswordChange(user, opts)) {
    return NextResponse.json(
      { error: MUST_CHANGE_PASSWORD_MESSAGE, code: MUST_CHANGE_PASSWORD_CODE },
      { status: 403 }
    )
  }
  return user
}

// ------------------------------------------------------------------
// Data scoping
// ------------------------------------------------------------------

/** Roles that may read the whole group, regardless of their own entity. */
const GLOBAL_ROLES = new Set(['MANAJEMEN', 'AUDITOR', 'TI', 'SUPERADMIN', 'DIREKTUR_SDM_GA'])

export function isGlobalRole(role: string): boolean {
  return GLOBAL_ROLES.has(role)
}

/**
 * Decides which entity subtree a request may read. A scoped role is always
 * pinned to its own entity — a `scopeEntityId` in the query string can narrow
 * a global role's view but can never widen a scoped one's.
 */
export function resolveScopeEntityId(
  user: SessionUser,
  requested: string | null
): string | null {
  if (isGlobalRole(user.role)) return requested
  return user.scopeEntityId
}

/**
 * The 403 to return when a scoped role has no entity to be scoped to, or null
 * when the account is fine. Subtree endpoints call this before resolving a
 * path prefix, because an empty prefix would otherwise mean "everything".
 */
export function refuseUnscoped(user: SessionUser): NextResponse | null {
  if (isGlobalRole(user.role) || user.scopeEntityId) return null
  return NextResponse.json(
    { error: 'Akun Anda belum ditautkan ke entitas mana pun. Hubungi Tim TI holding.' },
    { status: 403 }
  )
}

/**
 * Materialized-path prefix for the user's readable subtree, or null when the
 * user may read everything. Pair with `{ path: { startsWith: prefix } }`.
 */
export async function scopePathPrefix(scopeEntityId: string | null): Promise<string | null> {
  if (!scopeEntityId) return null
  const entity = await db.entity.findUnique({
    where: { id: scopeEntityId },
    select: { path: true },
  })
  return entity?.path ?? null
}

/**
 * Every entity id the user is allowed to read, or null when they may read the
 * whole group. List endpoints intersect this with the caller's own filters via
 * an `AND` clause, so a scoped role can still narrow but never widen.
 */
export async function scopeEntityIds(user: SessionUser): Promise<string[] | null> {
  if (isGlobalRole(user.role)) return null
  // A scoped account with no entity is misconfigured. Reading nothing is the
  // safe answer; reading the whole group would be a leak.
  if (!user.scopeEntityId) return []

  const prefix = await scopePathPrefix(user.scopeEntityId)
  if (!prefix) return [user.scopeEntityId]

  const rows = await db.entity.findMany({
    where: { path: { startsWith: prefix } },
    select: { id: true },
  })
  return rows.length ? rows.map((r) => r.id) : [user.scopeEntityId]
}

/**
 * Accounts attached to the user's readable subtree, for the tables that record
 * a person rather than an entity (audit log, unlock requests). The user is
 * always included so they can at least see their own trail.
 */
export async function scopeUserIds(user: SessionUser): Promise<string[] | null> {
  const entityIds = await scopeEntityIds(user)
  if (!entityIds) return null

  const rows = await db.user.findMany({
    where: { scopeEntityId: { in: entityIds } },
    select: { id: true },
  })
  return Array.from(new Set([user.id, ...rows.map((r) => r.id)]))
}
