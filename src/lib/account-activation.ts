import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Tx } from '@/lib/companies'
import type { SessionUser } from '@/lib/auth'
import { decisionDesk } from '@/lib/access-requests'
import { hashPassword } from '@/lib/password'
import { passwordProblem } from '@/lib/password-policy'
import { hit, tooManyRequests } from '@/lib/security'

export const ACTIVATION_TTL_MS = 24 * 60 * 60_000
const INVALID_LINK = 'Tautan aktivasi tidak berlaku. Minta pengelola menerbitkan tautan baru.'
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
type Actor = Pick<SessionUser, 'id' | 'role' | 'scopeEntityId'>

export class ActivationRefusal extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

/** No raw errors: Prisma diagnostics may include credentials from mutation arguments. */
export function activationError(err: unknown): NextResponse {
  if (err instanceof ActivationRefusal) {
    return NextResponse.json({ error: err.message }, { status: err.status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('[account-activation] operasi gagal')
  return NextResponse.json({ error: 'Aktivasi belum dapat diproses. Coba lagi.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

export function activationIssueLimit(actorId: string, userId?: string): NextResponse | null {
  const keys: [string, number][] = [[`activation:issue:${actorId}`, 20]]
  if (userId) keys.push([`activation:target:${userId}`, 5])
  for (const [key, limit] of keys) {
    const r = hit(key, limit, 15 * 60_000)
    if (!r.ok) return tooManyRequests(r.retryAfterSec)
  }
  return null
}

export function activationConsumeLimit(ip: string | null, token?: string): NextResponse | null {
  const keys: [string, number][] = token === undefined ? [['activation:global', 300], [`activation:ip:${ip ?? 'unknown'}`, 20]] : []
  if (token && TOKEN_RE.test(token)) keys.push([`activation:token:${digest(token)}`, 10])
  for (const [key, limit] of keys) {
    const r = hit(key, limit, 15 * 60_000)
    if (!r.ok) return tooManyRequests(r.retryAfterSec)
  }
  return null
}

async function eligibleAccount(tx: Tx, actor: Actor, userId: string) {
  const desk = decisionDesk(actor)
  if (!desk) throw new ActivationRefusal('Peran Anda tidak mengelola aktivasi akun.', 403)
  const user = await tx.user.findUnique({ where: { id: userId } })
  if (!user || !desk.roles.includes(user.role) || (!desk.full && user.scopeEntityId !== desk.entityId)) {
    throw new ActivationRefusal('Akun tidak ditemukan dalam jangkauan Anda.', 404)
  }
  if (user.id === actor.id) throw new ActivationRefusal('Aktivasi akun sendiri tidak dapat diterbitkan.', 403)
  const approved = await tx.accessRequest.findFirst({
    where: { targetUserId: user.id, type: 'AKUN_BARU', status: 'DISETUJUI' }, select: { id: true },
  })
  if (!approved || !user.isActive || !user.mustChangePassword || user.lastLoginAt || !user.passwordHash) {
    throw new ActivationRefusal('Akun ini tidak menunggu aktivasi dari persetujuan akun baru.')
  }
  const existing = await tx.accountActivation.findUnique({ where: { userId } })
  if (existing && (existing.consumedAt || existing.credentialDigest !== digest(user.passwordHash))) {
    throw new ActivationRefusal('Kredensial akun ini sudah berubah. Gunakan pengaturan kata sandi.')
  }
  return user
}

/** Metadata only; token material is never readable after issuance. */
export async function activationAvailability(actor: Actor, userId: string) {
  await eligibleAccount(db, actor, userId)
  return { canActivate: true }
}

/** Caller uses one transaction for approval + issuance. Always lock User before AccountActivation. */
export async function issueAccountActivation(tx: Tx, actor: Actor, userId: string, ip: string | null) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
  const user = await eligibleAccount(tx, actor, userId)
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ACTIVATION_TTL_MS)
  const data = { tokenHash: digest(token), credentialDigest: digest(user.passwordHash!), expiresAt, consumedAt: null, createdAt: now }
  await tx.accountActivation.upsert({ where: { userId }, create: { userId, ...data }, update: data })
  await tx.auditLog.create({ data: {
    actorId: actor.id, action: 'ISSUE_ACCOUNT_ACTIVATION', targetType: 'USER', targetId: userId,
    afterData: JSON.stringify({ expiresAt: expiresAt.toISOString() }), ip,
  } })
  return { userId, username: user.username ?? user.email, path: `/login/aktivasi#token=${token}`, expiresAt: expiresAt.toISOString() }
}

/** Possession of a valid link grants only password setup, never a session. */
export async function consumeAccountActivation(token: string, password: string, ip: string | null) {
  if (!TOKEN_RE.test(token)) throw new ActivationRefusal(INVALID_LINK, 400)
  const problem = passwordProblem(password)
  if (problem) throw new ActivationRefusal(problem, 422)
  const tokenHash = digest(token)
  const candidate = await db.accountActivation.findUnique({ where: { tokenHash }, select: { userId: true } })
  if (!candidate) throw new ActivationRefusal(INVALID_LINK, 400)
  const passwordHash = await hashPassword(password)
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidate.userId} FOR UPDATE`
    const user = await tx.user.findUnique({ where: { id: candidate.userId } })
    const link = await tx.accountActivation.findUnique({ where: { userId: candidate.userId } })
    const now = new Date()
    if (!user || !user.isActive || !user.mustChangePassword || user.lastLoginAt || !user.passwordHash ||
        !link || link.tokenHash !== tokenHash || link.consumedAt || link.expiresAt <= now ||
        link.credentialDigest !== digest(user.passwordHash)) {
      throw new ActivationRefusal(INVALID_LINK, 400)
    }
    const claimed = await tx.accountActivation.updateMany({
      where: { userId: user.id, tokenHash, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now },
    })
    if (claimed.count !== 1) throw new ActivationRefusal(INVALID_LINK, 400)
    const changed = await tx.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash, isActive: true, mustChangePassword: true, lastLoginAt: null },
      data: { passwordHash, mustChangePassword: false },
    })
    if (changed.count !== 1) throw new ActivationRefusal(INVALID_LINK, 400)
    await tx.auditLog.create({ data: { actorId: user.id, action: 'ACTIVATE_ACCOUNT', targetType: 'USER', targetId: user.id, ip } })
    return { username: user.username ?? user.email }
  })
}
