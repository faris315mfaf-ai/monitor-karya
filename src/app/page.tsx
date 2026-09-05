import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'

// The session cookie has to be read per request.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <AppShell user={user} />
}
