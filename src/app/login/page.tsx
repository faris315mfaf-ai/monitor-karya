import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser, isGlobalRole } from '@/lib/auth'
import { ROLE_TABS } from '@/lib/rbac'
import { ROLE_LABELS } from '@/lib/constants'
import { LoginForm } from '@/components/login-form'
import { DemoRolePicker, type DemoRole } from '@/components/demo-role-picker'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, demoLoginEnabled } from '@/lib/demo-accounts'

export const metadata: Metadata = {
  title: 'Masuk — MonitorKarya',
  description: 'Masuk ke sistem pemantauan bisnis holding MonitorKarya.',
}

// The session cookie has to be read per request.
export const dynamic = 'force-dynamic'

/** Shown until the database says which entity an account is actually pinned to. */
function fallbackScope(role: string): string {
  return isGlobalRole(role) ? 'Seluruh grup' : 'Entitas contoh'
}

/** The static picker, built without touching the database. */
function baseRoles(): DemoRole[] {
  return DEMO_ACCOUNTS.map((a) => ({
    role: a.role,
    name: a.name,
    email: a.email,
    avatarColor: a.avatarColor,
    scope: fallbackScope(a.role),
    moduleCount: ROLE_TABS[a.role]?.length ?? 0,
  }))
}

/**
 * The picker with each account's real name and entity filled in.
 *
 * Only the display detail comes from the database, so a failure here degrades
 * to the static list rather than to an empty page — a blank login screen gives
 * no clue that the database is the thing that is wrong.
 */
async function enrichRoles(): Promise<DemoRole[]> {
  const users = await db.user.findMany({
    where: { email: { in: DEMO_ACCOUNTS.map((a) => a.email) }, isActive: true },
    select: { name: true, email: true, role: true, avatarColor: true, scopeEntityId: true },
  })

  const scopeIds = users.map((u) => u.scopeEntityId).filter((id): id is string => Boolean(id))
  const entities = await db.entity.findMany({
    where: { id: { in: scopeIds } },
    select: { id: true, name: true },
  })
  const entityName = new Map(entities.map((e) => [e.id, e.name]))

  return baseRoles().map((base) => {
    const u = users.find((x) => x.email === base.email)
    if (!u) return base
    return {
      ...base,
      name: u.name,
      avatarColor: u.avatarColor ?? base.avatarColor,
      scope: u.scopeEntityId ? (entityName.get(u.scopeEntityId) ?? base.scope) : 'Seluruh grup',
    }
  })
}

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/')

  const demoOn = demoLoginEnabled()

  let roles: DemoRole[] = demoOn ? baseRoles() : []
  let dbReachable = true
  if (demoOn) {
    try {
      roles = await enrichRoles()
    } catch {
      // Keep the static list; the banner below explains why it may not work.
      dbReachable = false
    }
  } else {
    try {
      await db.user.count()
    } catch {
      dbReachable = false
    }
  }

  return (
    <LoginForm
      demoOn={demoOn}
      demoPassword={demoOn ? DEMO_PASSWORD : null}
      demoEmails={
        demoOn
          ? DEMO_ACCOUNTS.map((a) => ({
              email: a.email,
              roleLabel: ROLE_LABELS[a.role] ?? a.role,
            }))
          : []
      }
      dbReachable={dbReachable}
    >
      {demoOn ? <DemoRolePicker roles={roles} /> : null}
    </LoginForm>
  )
}
