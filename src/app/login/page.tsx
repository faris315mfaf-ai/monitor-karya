import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/constants'
import { ROLE_TABS } from '@/lib/rbac'
import { LoginForm } from '@/components/login-form'
import { DemoRolePicker, type DemoRole } from '@/components/demo-role-picker'
import { demoLoginEnabled } from '@/app/api/auth/demo/route'

export const metadata: Metadata = {
  title: 'Masuk — MonitorKarya',
  description: 'Masuk ke sistem pemantauan bisnis holding MonitorKarya.',
}

// The session cookie has to be read per request.
export const dynamic = 'force-dynamic'

const DEMO_EMAILS: Record<string, string> = {
  PIC_PROYEK: 'pic@karya.co.id',
  KEPALA_DIVISI: 'kadiv@karya.co.id',
  ADMIN_PT: 'adminpt@karya.co.id',
  DIREKTUR_ENTITAS: 'direktur@karya.co.id',
  DIREKTUR_SDM_GA: 'sdmga@karya.co.id',
  TI: 'it@karya.co.id',
  MANAJEMEN: 'manajemen@karya.co.id',
}

/** The roles offered for one-click entry, ordered along the reporting chain. */
async function demoRoles(): Promise<DemoRole[]> {
  const users = await db.user.findMany({
    where: { email: { in: Object.values(DEMO_EMAILS) }, isActive: true },
    select: { name: true, email: true, role: true, avatarColor: true, scopeEntityId: true },
  })

  const scopeIds = users.map((u) => u.scopeEntityId).filter((id): id is string => Boolean(id))
  const entities = await db.entity.findMany({
    where: { id: { in: scopeIds } },
    select: { id: true, name: true },
  })
  const entityName = new Map(entities.map((e) => [e.id, e.name]))

  return Object.keys(DEMO_EMAILS)
    .map((role) => {
      const u = users.find((x) => x.role === role)
      if (!u) return null
      return {
        role,
        name: u.name,
        email: u.email,
        avatarColor: u.avatarColor,
        scope: u.scopeEntityId ? (entityName.get(u.scopeEntityId) ?? 'Entitas') : 'Seluruh grup',
        moduleCount: ROLE_TABS[role]?.length ?? 0,
      }
    })
    .filter((r): r is DemoRole => r !== null)
}

/** One representative account per role, so every permission level can be tried. */
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

  const demoOn = demoLoginEnabled()
  let accounts: { email: string; name: string; roleLabel: string }[] = []
  let roles: DemoRole[] = []
  try {
    // The sign-in form must still render if the database is unreachable.
    ;[accounts, roles] = await Promise.all([
      demoAccounts(),
      demoOn ? demoRoles() : Promise.resolve<DemoRole[]>([]),
    ])
  } catch {
    accounts = []
    roles = []
  }

  return (
    <LoginForm demoAccounts={demoOn ? [] : accounts}>
      {demoOn ? <DemoRolePicker roles={roles} /> : null}
    </LoginForm>
  )
}
