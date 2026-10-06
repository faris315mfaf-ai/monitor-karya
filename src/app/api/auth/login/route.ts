import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, mustChangePasswordFor, setSessionCookie, verifyPassword } from '@/lib/auth'
import { MAX_PASSWORD_LENGTH, clientIp, hit, peek, resetRate, tooManyRequests } from '@/lib/security'

// Same message for "no such account" and "wrong password" so the endpoint
// cannot be used to find out which usernames exist.
const INVALID = 'Username atau kata sandi salah'

/**
 * Pembatas laju masuk (6 Okt 2026, docs/KEAMANAN.md):
 *  - per akun (identifier): 5 kegagalan / 15 menit, lalu ditolak sampai jendela habis;
 *  - per IP: 30 percobaan / 15 menit (menahan penebakan banyak akun dari satu tempat).
 * Hitungan per instans server (di memori) — rem, bukan kuota global.
 */
const WINDOW_MS = 15 * 60_000
const MAX_FAILS_PER_ACCOUNT = 5
const MAX_ATTEMPTS_PER_IP = 30

/** Hash tiruan agar "akun tidak ada" memakan waktu yang sama dengan "sandi salah". */
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= hashPassword('mk-dummy-password-for-timing'))

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
  if (identifier.length > 254 || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: INVALID }, { status: 401 })
  }

  const ip = clientIp(req)
  const accountKey = `login:acct:${identifier}`
  const ipKey = `login:ip:${ip ?? 'unknown'}`
  const ipHit = hit(ipKey, MAX_ATTEMPTS_PER_IP, WINDOW_MS)
  if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec)
  const acct = peek(accountKey, MAX_FAILS_PER_ACCOUNT)
  if (!acct.ok) return tooManyRequests(acct.retryAfterSec)

  let user
  try {
    user = await db.user.findFirst({
      where: identifier.includes('@') ? { email: identifier } : { username: identifier },
      select: { id: true, name: true, email: true, username: true, role: true, isActive: true, passwordHash: true },
    })
  } catch {
    return NextResponse.json({ error: 'Database tidak terjangkau dari server ini.' }, { status: 503 })
  }

  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()))
  if (!user || !user.passwordHash || !ok) {
    hit(accountKey, MAX_FAILS_PER_ACCOUNT, WINDOW_MS)
    // Jejak percobaan gagal untuk pemantauan; gagal mencatat tidak mengubah jawaban.
    await db.auditLog
      .create({
        data: {
          actorId: user?.id ?? null,
          action: 'LOGIN_FAILED',
          targetType: 'USER',
          targetId: user?.id ?? identifier.slice(0, 64),
          ip,
          userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
        },
      })
      .catch(() => null)
    return NextResponse.json({ error: INVALID }, { status: 401 })
  }
  if (!user.isActive) {
    return NextResponse.json({ error: 'Akun ini dinonaktifkan' }, { status: 403 })
  }
  resetRate(accountKey)

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'LOGIN',
      targetType: 'USER',
      targetId: user.id,
      ip,
      userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
    },
  })

  // F1-C: akun buatan/setelan ulang admin diarahkan ke layar ganti kata sandi.
  const mustChangePassword = await mustChangePasswordFor(user.id).catch(() => false)
  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role },
    mustChangePassword,
  })
  setSessionCookie(res, user.id, user.passwordHash)
  return res
}
