import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureTemporaryAccessCurrent } from '@/lib/access-requests'
import { isKnownDevice, mustChangePasswordFor, setDeviceCookie, setSessionCookie, DEVICE_COOKIE } from '@/lib/auth'
import { hashPassword, verifyPasswordUniformCost } from '@/lib/password'
import { MAX_PASSWORD_LENGTH, clientIp, hit, peek, resetRate, tooManyRequests } from '@/lib/security'

// Same message for "no such account" and "wrong password" so the endpoint
// cannot be used to find out which usernames exist.
const INVALID = 'Username atau kata sandi salah'

/**
 * Pembatas laju masuk (6 Okt 2026, docs/KEAMANAN.md):
 *  - per (IP, akun): 5 kegagalan / 15 menit, lalu ditolak sampai jendela habis.
 *    [T11] Kuncinya menyertakan IP supaya orang lain yang sengaja salah sandi
 *    atas nama korban tidak mengunci pemilik sah dari jaringan berbeda (DoS);
 *  - per akun (lintas IP): 30 kegagalan / 15 menit. [T13] Plafon ini TIDAK
 *    mengunci pemilik sah: setelah melewatinya, hanya perangkat yang membawa
 *    cookie "perangkat dikenal" (dipasang HMAC saat masuk berhasil, terikat ke
 *    kata sandi akun) yang masih diproses; perangkat tak dikenal ditolak 429
 *    SEBELUM kata sandi diperiksa, jadi penyerang terdistribusi tak mendapat
 *    sinyal benar/salah, sedangkan pemilik di perangkat biasanya tetap masuk.
 *    Klien tanpa cookie (aplikasi Android) bisa tertahan selama serangan
 *    berlangsung — jendela habis sendiri dalam 15 menit. Sukses tidak menghapus
 *    hitungan lintas-IP (kalau tidak, satu login sah memberi penyerang 30 tebakan baru);
 *  - per IP: 30 percobaan / 15 menit (menahan penebakan banyak akun dari satu tempat).
 *    IP tak diketahui (proxy tak memasang header) tidak dibagi satu ember
 *    "unknown" untuk semua klien — itu akan mengunci semua orang; batas per-IP
 *    dilewati dan batas per-akun tetap berlaku (peringatan dicatat sekali).
 * Hitungan per instans server (di memori) — rem, bukan kuota global.
 */
const WINDOW_MS = 15 * 60_000
const MAX_FAILS_PER_ACCOUNT = 5
const MAX_FAILS_PER_ACCOUNT_ANY_IP = 30
const MAX_ATTEMPTS_PER_IP = 30

let warnedNoIp = false

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
  if (!ip && !warnedNoIp) {
    warnedNoIp = true
    console.warn('[login] IP klien tidak terbaca (x-real-ip/x-forwarded-for kosong): pembatas per-IP dilewati. Periksa konfigurasi proxy.')
  }
  const accountKey = `login:acct:${ip ?? 'tanpa-ip'}:${identifier}`
  const accountAnyIpKey = `login:acct-any:${identifier}`
  if (ip) {
    const ipHit = hit(`login:ip:${ip}`, MAX_ATTEMPTS_PER_IP, WINDOW_MS)
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec)
  }
  const acct = peek(accountKey, MAX_FAILS_PER_ACCOUNT)
  if (!acct.ok) return tooManyRequests(acct.retryAfterSec)
  const acctAny = peek(accountAnyIpKey, MAX_FAILS_PER_ACCOUNT_ANY_IP)

  let user
  try {
    user = await db.user.findFirst({
      where: identifier.includes('@') ? { email: identifier } : { username: identifier },
      select: { id: true, name: true, email: true, username: true, role: true, isActive: true, passwordHash: true },
    })
  } catch {
    return NextResponse.json({ error: 'Database tidak terjangkau dari server ini.' }, { status: 503 })
  }

  // Plafon lintas-IP terlampaui: hanya perangkat dikenal milik akun ini yang diproses.
  // Akun tak ada (user null) selalu "tak dikenal" → jawaban 429 sama dengan akun ada.
  if (!acctAny.ok && !(user && isKnownDevice(req.cookies.get(DEVICE_COOKIE)?.value, user.id, user.passwordHash))) {
    return tooManyRequests(acctAny.retryAfterSec)
  }

  const ok = await verifyPasswordUniformCost(password, user?.passwordHash ?? (await getDummyHash()))
  if (!user || !user.passwordHash || !ok) {
    hit(accountKey, MAX_FAILS_PER_ACCOUNT, WINDOW_MS)
    hit(accountAnyIpKey, MAX_FAILS_PER_ACCOUNT_ANY_IP, WINDOW_MS)
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
  try {
    await ensureTemporaryAccessCurrent(user.id)
    const current = await db.user.findUnique({ where: { id: user.id }, select: { isActive: true } })
    if (!current?.isActive) return NextResponse.json({ error: 'Akun ini dinonaktifkan' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Akses akun belum dapat diperiksa. Coba lagi.' }, { status: 503 })
  }
  if (!user.isActive) {
    return NextResponse.json({ error: 'Akun ini dinonaktifkan' }, { status: 403 })
  }
  // Hanya hitungan (IP, akun) yang dihapus; hitungan lintas-IP dibiarkan habis sendiri.
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
  await setSessionCookie(res, user.id, user.passwordHash)
  setDeviceCookie(res, user.id, user.passwordHash)
  return res
}
