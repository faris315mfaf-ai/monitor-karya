import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth'
import { ROLE_TABS } from '@/lib/rbac'
import { DEMO_ACCOUNTS, DEMO_USERNAMES, demoLoginEnabled } from '@/lib/demo-accounts'

/**
 * One-click sign-in as a demo account (by username since 10 Sep 2026).
 *
 * This deliberately bypasses the password, so it is a back door by design and
 * must never be live by accident: it answers only while DEMO_LOGIN is switched
 * on, and it will only ever hand out the accounts listed in DEMO_ACCOUNTS.
 * Leave DEMO_LOGIN unset in any environment holding real data.
 */

/** GET — which accounts the login page may offer, or an empty list when off. */
export async function GET() {
  if (!demoLoginEnabled()) return NextResponse.json({ enabled: false, accounts: [] })

  let users: { name: string; username: string | null; role: string; avatarColor: string | null; scopeEntityId: string | null }[]
  let entities: { id: string; name: string }[]
  try {
    users = await db.user.findMany({
      where: { username: { in: DEMO_USERNAMES }, isActive: true },
      select: { name: true, username: true, role: true, avatarColor: true, scopeEntityId: true },
    })
    const scopeIds = users.map((u) => u.scopeEntityId).filter((id): id is string => Boolean(id))
    entities = await db.entity.findMany({
      where: { id: { in: scopeIds } },
      select: { id: true, name: true },
    })
  } catch {
    return NextResponse.json({ error: 'Database tidak terjangkau dari server ini.' }, { status: 503 })
  }
  const entityName = new Map(entities.map((e) => [e.id, e.name]))

  // Keep the on-screen order of DEMO_ACCOUNTS: bottom of the chain first.
  const accounts = DEMO_ACCOUNTS.map((spec) => {
    const u = users.find((x) => x.username === spec.username)
    if (!u) return null
    return {
      username: spec.username,
      label: spec.label,
      role: u.role,
      name: u.name,
      avatarColor: u.avatarColor ?? spec.avatarColor,
      scope: u.scopeEntityId ? (entityName.get(u.scopeEntityId) ?? 'Entitas') : 'Seluruh grup',
      moduleCount: ROLE_TABS[u.role]?.length ?? 0,
    }
  }).filter((r): r is NonNullable<typeof r> => r !== null)

  return NextResponse.json({ enabled: true, accounts })
}

/** POST { username } — start a session as the requested demo account. */
export async function POST(req: NextRequest) {
  if (!demoLoginEnabled()) {
    return NextResponse.json({ error: 'Mode demo tidak aktif di server ini' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  // Bentuk lama { role } masih diterima: dipetakan ke username contoh peran itu.
  const requested =
    typeof body.username === 'string'
      ? body.username.trim().toLowerCase()
      : typeof body.role === 'string'
        ? (DEMO_ACCOUNTS.find((a) => a.role === body.role)?.username ?? '')
        : ''
  if (!DEMO_USERNAMES.includes(requested)) {
    return NextResponse.json({ error: 'Akun demo tidak dikenali' }, { status: 400 })
  }

  let user: { id: string; name: string; role: string; isActive: boolean } | null
  try {
    user = await db.user.findUnique({
      where: { username: requested },
      select: { id: true, name: true, role: true, isActive: true },
    })
  } catch {
    // Almost always a missing or wrong DATABASE_URL rather than a bad request.
    return NextResponse.json({ error: 'Database tidak terjangkau dari server ini.' }, { status: 503 })
  }
  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: 'Akun demo belum tersedia. Jalankan: npm run db:seed:sql lalu npm run db:passwords -- --all' },
      { status: 404 }
    )
  }

  const { token, maxAge } = createSessionToken(user.id)

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'LOGIN_DEMO',
      targetType: 'USER',
      targetId: user.id,
      afterData: JSON.stringify({ role: user.role, username: requested, via: 'demo' }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  const res = NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  })
  return res
}
