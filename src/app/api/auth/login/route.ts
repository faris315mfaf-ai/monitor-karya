import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, createSessionToken, verifyPassword } from '@/lib/auth'

// Same message for "no such account" and "wrong password" so the endpoint
// cannot be used to find out which usernames exist.
const INVALID = 'Username atau kata sandi salah'

/**
 * POST { identifier, password } — sign in with a username (10 Sep 2026) or,
 * for older accounts, an email address. `email`/`username` are still accepted
 * as field names so nothing that posted the old shape breaks.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const b = (body ?? {}) as { identifier?: unknown; username?: unknown; email?: unknown; password?: unknown }
  const raw = [b.identifier, b.username, b.email].find((v) => typeof v === 'string' && v.trim())
  const password = b.password
  if (typeof raw !== 'string' || typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Username dan kata sandi wajib diisi' }, { status: 400 })
  }
  const identifier = raw.trim().toLowerCase()

  let user
  try {
    user = await db.user.findFirst({
      where: identifier.includes('@') ? { email: identifier } : { username: identifier },
      select: { id: true, name: true, email: true, username: true, role: true, isActive: true, passwordHash: true },
    })
  } catch {
    return NextResponse.json({ error: 'Database tidak terjangkau dari server ini.' }, { status: 503 })
  }

  const ok = await verifyPassword(password, user?.passwordHash ?? null)
  if (!user || !ok) {
    return NextResponse.json({ error: INVALID }, { status: 401 })
  }
  if (!user.isActive) {
    return NextResponse.json({ error: 'Akun ini dinonaktifkan' }, { status: 403 })
  }

  const { token, maxAge } = createSessionToken(user.id)

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'LOGIN',
      targetType: 'USER',
      targetId: user.id,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role },
  })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  })
  return res
}
