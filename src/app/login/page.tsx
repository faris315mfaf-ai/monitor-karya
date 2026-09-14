import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { loadPublicBranding } from '@/lib/branding'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = {
  title: 'Masuk — MonitorKarya',
  description: 'Masuk ke sistem pemantauan bisnis holding MonitorKarya.',
}

// The session cookie has to be read per request.
export const dynamic = 'force-dynamic'

/**
 * Satu-satunya jalan masuk adalah username + kata sandi (10 Sep 2026).
 * Tombol "masuk sebagai akun demo" beserta endpoint-nya sudah dihapus, jadi
 * tidak ada lagi jalur yang melewati kata sandi.
 */
export default async function LoginPage() {
  if (await getSessionUser()) redirect('/')

  // A blank sign-in screen gives no clue that the database is the thing that
  // is wrong, so the form says so instead of failing silently on submit.
  let dbReachable = true
  // Holding pemrakarsa sistem — logonya tampil di atas formulir masuk.
  let holding: { name: string; logoData: string | null } | null = null
  try {
    await db.user.count()
    const b = await loadPublicBranding()
    holding = b.holding ? { name: b.holding.name, logoData: b.holding.logoData } : null
  } catch {
    dbReachable = false
  }

  return <LoginForm dbReachable={dbReachable} holding={holding} />
}
