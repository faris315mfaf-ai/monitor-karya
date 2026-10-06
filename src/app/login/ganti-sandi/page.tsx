import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy'
import { ForcedPasswordForm } from './forced-password-form'

export const metadata: Metadata = {
  title: 'Ganti kata sandi — Monitor Karya',
}

// Sesi dibaca per permintaan.
export const dynamic = 'force-dynamic'

/**
 * Layar wajib ganti kata sandi (F1-C, 6 Okt 2026). Akun yang dibuat atau
 * disetel ulang kata sandinya oleh admin (User.mustChangePassword) diarahkan
 * ke sini oleh / dan /login, dan semua API lain menolaknya 403 sampai kata
 * sandinya diganti. Layar ini tidak bisa dilewati: satu-satunya jalan keluar
 * selain mengganti kata sandi adalah keluar dari akun.
 */
export default async function ForcedPasswordPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!user.mustChangePassword) redirect('/')

  return <ForcedPasswordForm name={user.name} minLength={MIN_PASSWORD_LENGTH} />
}
