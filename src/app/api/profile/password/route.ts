import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { hashPassword, verifyPassword } from '@/lib/password'
import { MIN_PASSWORD } from '@/lib/companies'

/**
 * Ganti kata sandi sendiri (15 Sep 2026).
 *
 *   POST { currentPassword, newPassword }
 *
 * Kata sandi lama wajib benar, jadi orang lain yang menemukan layar terbuka
 * tidak bisa mengunci pemiliknya. Super Admin tetap bisa menyetel ulang kata
 * sandi orang lain lewat meja Perusahaan & Akun — itu jalur yang berbeda.
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (newPassword.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Kata sandi baru minimal ${MIN_PASSWORD} karakter.` }, { status: 422 })
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: 'Kata sandi baru masih sama dengan yang lama.' }, { status: 422 })
  }

  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
  if (!row) return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })

  // Akun yang belum pernah punya kata sandi boleh menyetelnya tanpa yang lama.
  if (row.passwordHash && !(await verifyPassword(currentPassword, row.passwordHash))) {
    return NextResponse.json({ error: 'Kata sandi saat ini salah.' }, { status: 422 })
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CHANGE_OWN_PASSWORD',
        targetType: 'USER',
        targetId: user.id,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      },
    })
  })

  return NextResponse.json({ ok: true })
}
