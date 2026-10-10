import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, setSessionCookie, clearSessionCookie, SESSION_COOKIE, type SessionUser } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { clientIp } from '@/lib/security'

export const dynamic = 'force-dynamic'

/**
 * [BERALIH] Modul pengujian Super Admin: berpindah ke akun lain untuk mencoba
 * seluruh fitur per peran (keputusan pemilik 10 Okt 2026). Hanya SUPERADMIN.
 *
 * GET  → daftar entitas + akun aktif (dikelompokkan per peran).
 * POST → { userId } beralih ke akun itu (cookie sesi baru, sesi admin tetap sah).
 * DELETE → kembali ke akun Super Admin (cookie admin dipulihkan dari mk_asli).
 *
 * Sesi admin asli disimpan dalam cookie kedua "mk_asli" (HMAC sama dengan sesi
 * utama, hanya penanda). Semua peralihan tercatat AuditLog SWITCH_ACCOUNT.
 */

const IS_PROD = process.env.NODE_ENV === 'production'
const COOKIE_ASLI = IS_PROD ? '__Host-mk_asli' : 'mk_asli'

const PERAN_BERALIH = ['PIC_PROYEK', 'KEPALA_DIVISI', 'ADMIN_PT', 'DIREKTUR_ENTITAS', 'MANAJEMEN'] as const

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang dapat memakai modul beralih akun.' }, { status: 403 })
  }

  const [entities, users] = await Promise.all([
    db.entity.findMany({
      where: { type: { in: ['PT', 'SUB_HOLDING', 'HOLDING'] }, isActive: true },
      select: { id: true, name: true, code: true, type: true },
      orderBy: { name: 'asc' },
    }),
    db.user.findMany({
      where: { isActive: true, role: { in: [...PERAN_BERALIH] } },
      select: { id: true, name: true, email: true, role: true, scopeEntityId: true, username: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    }),
  ])

  return NextResponse.json({
    entities: entities.map(e => ({ id: e.id, name: e.name, code: e.code, type: e.type })),
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role,
      entityId: u.scopeEntityId,
    })),
    peran: PERAN_BERALIH,
  })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang dapat memakai modul beralih akun.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
  }
  const targetId = typeof body.userId === 'string' ? body.userId : ''
  if (!targetId) return NextResponse.json({ error: 'userId wajib diisi.' }, { status: 400 })

  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, email: true, role: true, isActive: true, passwordHash: true, mustChangePassword: true, scopeEntityId: true },
  })
  if (!target || !target.isActive || !target.passwordHash) {
    return NextResponse.json({ error: 'Akun tidak ditemukan atau tidak aktif.' }, { status: 404 })
  }

  const ip = clientIp(req)

  // Simpan cookie admin asli + catat audit + buat sesi baru untuk target.
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'SWITCH_ACCOUNT',
      targetType: 'USER',
      targetId: target.id,
      afterData: JSON.stringify({ targetRole: target.role, targetName: target.name }),
      ip,
    },
  })

  const res = NextResponse.json({
    ok: true,
    user: { id: target.id, name: target.name, role: target.role, scopeEntityId: target.scopeEntityId },
  })
  // Cookie sesi admin asli — untuk tombol "Kembali ke Super Admin".
  const cookieAsli = req.cookies.get(SESSION_COOKIE)?.value
  if (cookieAsli && !req.cookies.get(COOKIE_ASLI)?.value) {
    res.cookies.set(COOKIE_ASLI, cookieAsli, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/', maxAge: 8 * 3600 })
  }
  setSessionCookie(res, target.id, target.passwordHash)
  return res
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const cookieAsli = req.cookies.get(COOKIE_ASLI)?.value
  if (!cookieAsli) {
    return NextResponse.json({ error: 'Tidak ada sesi Super Admin tersimpan untuk dipulihkan.' }, { status: 404 })
  }

  // Verifikasi cookie asli masih sah.
  const { readSessionToken } = await import('@/lib/auth')
  const payload = readSessionToken(cookieAsli)
  if (!payload) {
    return NextResponse.json({ error: 'Sesi Super Admin sudah kedaluwarsa. Masuk ulang sebagai Super Admin.' }, { status: 401 })
  }

  const admin = await db.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, role: true, isActive: true, passwordHash: true },
  })
  if (!admin || !admin.isActive || admin.role !== 'SUPERADMIN' || !admin.passwordHash) {
    return NextResponse.json({ error: 'Sesi Super Admin tidak sah.' }, { status: 401 })
  }

  const ip = clientIp(req)
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      action: 'SWITCH_BACK',
      targetType: 'USER',
      targetId: admin.id,
      afterData: JSON.stringify({ fromRole: user.role, fromName: user.name }),
      ip,
    },
  })

  const res = NextResponse.json({ ok: true, user: { id: admin.id, name: admin.name, role: admin.role } })
  // Pulihkan cookie admin + hapus penanda.
  res.cookies.set(SESSION_COOKIE, cookieAsli, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/', maxAge: 8 * 3600, priority: 'high' })
  res.cookies.set(COOKIE_ASLI, '', { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/', maxAge: 0 })
  return res
}
