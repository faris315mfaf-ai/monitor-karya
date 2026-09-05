import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/constants'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = {
  title: 'Masuk — MonitorKarya',
  description: 'Masuk ke sistem pemantauan bisnis holding MonitorKarya.',
}

// The session cookie has to be read per request.
export const dynamic = 'force-dynamic'

// One representative account per role, so every permission level can be tried.
async function demoAccounts() {
  const wanted = ['MANAJEMEN', 'ADMIN_PT', 'DIREKTUR_ENTITAS', 'AUDITOR']
  const users = await db.user.findMany({
    where: { isActive: true, role: { in: wanted }, passwordHash: { not: null } },
    select: { name: true, email: true, role: true },
    orderBy: { email: 'asc' },
  })

  return wanted
    .map((role) => {
      const u = users.find((x) => x.role === role)
      return u ? { email: u.email, name: u.name, roleLabel: ROLE_LABELS[role] ?? role } : null
    })
    .filter((x): x is { email: string; name: string; roleLabel: string } => x !== null)
}

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/')

  let accounts: { email: string; name: string; roleLabel: string }[] = []
  try {
    accounts = await demoAccounts()
  } catch {
    // The sign-in form must still render if the database is unreachable.
    accounts = []
  }

  return <LoginForm demoAccounts={accounts} />
}
