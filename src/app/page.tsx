import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { EMPTY_BRANDING, loadBranding, type Branding } from '@/lib/branding'
import { AppShell } from '@/components/app-shell'

// The session cookie has to be read per request.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // F1-C: akun buatan/setelan ulang admin mengganti kata sandi dulu.
  if (user.mustChangePassword) redirect('/login/ganti-sandi')

  // Logo holding & perusahaan hanya hiasan: gagal memuatnya tidak boleh
  // menahan seluruh aplikasi.
  let branding: Branding = EMPTY_BRANDING
  try {
    branding = await loadBranding(user)
  } catch {}

  return <AppShell user={user} branding={branding} />
}
