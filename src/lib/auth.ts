import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'mk_session'
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

type SessionPayload = { sub: string; iat: number; exp: number }

function sign(data: string): string {
  return createHmac('sha256', authSecret()).update(data).digest('base64url')
}

export function createSessionToken(userId: string): { token: string; maxAge: number } {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = { sub: userId, iat: now, exp: now + SESSION_MAX_AGE_SECONDS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { token: `${body}.${sign(body)}`, maxAge: SESSION_MAX_AGE_SECONDS }
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expectedSig = Buffer.from(sign(body))
  const givenSig = Buffer.from(signature)
  if (expectedSig.length !== givenSig.length || !timingSafeEqual(expectedSig, givenSig)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (!payload.sub || typeof payload.exp !== 'number') return null
    if (payload.exp * 1000 < Date.now()) return null
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
    user = await db.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        scopeEntityId: true,
        avatarColor: true,
        isActive: true,
      },
    })
  } catch (err) {
    // With the database unreachable nobody can be signed in. Treating that as
    // "no session" sends the browser to /login, which says what is wrong.
    console.error('[auth] session lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
  if (!user || !user.isActive) return null

  const { isActive: _isActive, ...sessionUser } = user
  return sessionUser
}

/**
 * Guard for route handlers. Returns either the user or the 401 response to
 * return directly:
 *
 *   const auth = await requireApiUser()
 *   if (auth instanceof NextResponse) return auth
 */
export async function requireApiUser(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  return user
}

// ------------------------------------------------------------------
// Data scoping
// ------------------------------------------------------------------

/** Roles that may read the whole group, regardless of their own entity. */
const GLOBAL_ROLES = new Set(['MANAJEMEN', 'AUDITOR', 'TI', 'DIREKTUR_SDM_GA'])

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
