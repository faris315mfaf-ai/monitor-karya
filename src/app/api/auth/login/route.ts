import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, createSessionToken, verifyPassword } from '@/lib/auth'

// Same message for "no such account" and "wrong password" so the endpoint
// cannot be used to find out which addresses exist.
const INVALID = 'Email atau kata sandi salah'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown }
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return NextResponse.json({ error: 'Email dan kata sandi wajib diisi' }, { status: 400 })
  }

  let user
  try {
    user = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, name: true, email: true, role: true, isActive: true, passwordHash: true },
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
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
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
