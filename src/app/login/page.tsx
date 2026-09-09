import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { LoginForm } from '@/components/login-form'
import { DemoAccountPicker, type DemoAccount } from '@/components/demo-account-picker'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_USERNAMES, demoLoginEnabled } from '@/lib/demo-accounts'

export const metadata: Metadata = {
  title: 'Masuk — MonitorKarya',
  description: 'Masuk ke sistem pemantauan bisnis holding MonitorKarya.',
}

// The session cookie has to be read per request.
export const dynamic = 'force-dynamic'

/** The static picker, built without touching the database. */
function baseAccounts(): DemoAccount[] {
  return DEMO_ACCOUNTS.map((a) => ({
    username: a.username,
    label: a.label,
    role: a.role,
    name: null,
    avatarColor: a.avatarColor,
    scope: a.role === 'DIREKTUR_SDM_GA' ? 'Holding' : 'PT contoh',
  }))
}

/**
 * The picker with each account's real name and entity filled in. Only the
 * display detail comes from the database, so a failure here degrades to the
 * static list rather than to an empty page.
 */
async function enrich(): Promise<DemoAccount[]> {
  const users = await db.user.findMany({
    where: { username: { in: DEMO_USERNAMES }, isActive: true },
    select: { name: true, username: true, role: true, avatarColor: true, scopeEntityId: true },
  })
  const scopeIds = users.map((u) => u.scopeEntityId).filter((id): id is string => Boolean(id))
  const entities = await db.entity.findMany({ where: { id: { in: scopeIds } }, select: { id: true, name: true } })
  const entityName = new Map(entities.map((e) => [e.id, e.name]))

  return baseAccounts().map((base) => {
    const u = users.find((x) => x.username === base.username)
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

  let accounts: DemoAccount[] = demoOn ? baseAccounts() : []
  let dbReachable = true
  if (demoOn) {
    try {
      accounts = await enrich()
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
      quickAccounts={demoOn ? DEMO_ACCOUNTS.map((a) => ({ username: a.username, label: a.label })) : []}
      dbReachable={dbReachable}
    >
      {demoOn ? <DemoAccountPicker accounts={accounts} /> : null}
    </LoginForm>
  )
}
