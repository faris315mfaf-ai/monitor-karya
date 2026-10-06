import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, setSessionCookie } from '@/lib/auth'
import { hashPassword, verifyPassword } from '@/lib/password'
import { passwordProblem } from '@/lib/password-policy'
import { MAX_PASSWORD_LENGTH, clientIp, hit, peek, resetRate, tooManyRequests } from '@/lib/security'

/** Penebakan kata sandi lama dari layar yang tertinggal terbuka: 5 salah / 15 menit per akun. */
const FAIL_LIMIT = 5
const FAIL_WINDOW_MS = 15 * 60_000

/**
 * Ganti kata sandi sendiri (15 Sep 2026).
 *
 *   POST { currentPassword, newPassword }
 *
 * Kata sandi lama wajib benar, jadi orang lain yang menemukan layar terbuka
 * tidak bisa mengunci pemiliknya. Super Admin tetap bisa menyetel ulang kata
 * sandi orang lain lewat meja Perusahaan & Akun — itu jalur yang berbeda.
 *
 * F1-C (6 Okt 2026): minimal 8 karakter (src/lib/password-policy.ts). Rute ini
 * satu-satunya yang tetap terbuka bagi akun dengan mustChangePassword; begitu
 * berhasil, tanda itu dihapus dan aplikasi bisa dipakai.
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser({ allowPendingPasswordChange: true })
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (newPassword.length > MAX_PASSWORD_LENGTH || currentPassword.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Kata sandi maksimal ${MAX_PASSWORD_LENGTH} karakter.` }, { status: 422 })
  }
  const problem = passwordProblem(newPassword, { current: currentPassword, label: 'Kata sandi baru' })
  if (problem) return NextResponse.json({ error: problem }, { status: 422 })

  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
  if (!row) return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })

  const failKey = `pwchange:${user.id}`
  const blocked = peek(failKey, FAIL_LIMIT)
  if (!blocked.ok) return tooManyRequests(blocked.retryAfterSec)

  // Akun yang belum pernah punya kata sandi boleh menyetelnya tanpa yang lama.
  if (row.passwordHash && !(await verifyPassword(currentPassword, row.passwordHash))) {
    hit(failKey, FAIL_LIMIT, FAIL_WINDOW_MS)
    return NextResponse.json({ error: 'Kata sandi saat ini salah.' }, { status: 422 })
  }
  resetRate(failKey)

  const newHash = await hashPassword(newPassword)
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      // Hanya disentuh bila memang true, supaya rute tetap jalan sebelum migrasi 0018 diterapkan.
      data: { passwordHash: newHash, ...(user.mustChangePassword ? { mustChangePassword: false } : {}) },
    })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CHANGE_OWN_PASSWORD',
        targetType: 'USER',
        targetId: user.id,
        afterData: user.mustChangePassword ? JSON.stringify({ forced: true }) : null,
        ip: clientIp(req),
      },
    })
  })

  // Sesi lain (perangkat lain) tidak berlaku lagi karena sidik kata sandinya
  // berubah; sesi ini diberi token baru supaya pemiliknya tetap masuk.
  const res = NextResponse.json({ ok: true })
  setSessionCookie(res, user.id, newHash)
  return res
}
