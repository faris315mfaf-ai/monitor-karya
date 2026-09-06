/**
 * The seven demo accounts, in reporting-chain order: field executor first,
 * management last.
 *
 * This list is static on purpose. The login page has to render its role picker
 * even when the database is unreachable, so the names and colours shown there
 * cannot come from a query. The database is still the authority on whether an
 * account exists — /api/auth/demo looks the user up before starting a session,
 * and refuses if it is missing — this list only decides which accounts may ever
 * be offered.
 *
 * scripts/demo-accounts.ts seeds exactly these rows; keep the two in step.
 */

export type DemoAccountSpec = {
  role: string
  email: string
  name: string
  avatarColor: string
}

export const DEMO_ACCOUNTS: DemoAccountSpec[] = [
  { role: 'PIC_PROYEK', email: 'pic@karya.co.id', name: 'Bpk. Rangga Prasetya', avatarColor: '#0d9488' },
  { role: 'KEPALA_DIVISI', email: 'kadiv@karya.co.id', name: 'Ibu Mira Anggraini', avatarColor: '#7c3aed' },
  { role: 'ADMIN_PT', email: 'adminpt@karya.co.id', name: 'Bpk. Budi Santoso', avatarColor: '#2563eb' },
  { role: 'DIREKTUR_ENTITAS', email: 'direktur@karya.co.id', name: 'Bpk. Andi Kurniawan', avatarColor: '#ea580c' },
  { role: 'DIREKTUR_SDM_GA', email: 'sdmga@karya.co.id', name: 'Ibu Ratna Sari', avatarColor: '#db2777' },
  { role: 'TI', email: 'it@karya.co.id', name: 'Bpk. Rudi Santoso', avatarColor: '#4f46e5' },
  { role: 'MANAJEMEN', email: 'manajemen@karya.co.id', name: 'Bpk. Hartono Wijaya', avatarColor: '#16a34a' },
]

/** role -> email, the allow-list /api/auth/demo checks a request against. */
export const DEMO_EMAILS: Record<string, string> = Object.fromEntries(
  DEMO_ACCOUNTS.map((a) => [a.role, a.email])
)

/**
 * The shared password for the seeded accounts, shown on the login page so the
 * demo can be entered by hand as well as by one click. It is a demo credential
 * and is already published in .env.example and SUPABASE_SETUP.md; never point
 * this at a password that guards real data.
 */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'MonitorKarya#2026'

/** Whether one-click demo sign-in is switched on for this server. */
export function demoLoginEnabled(): boolean {
  const flag = process.env.DEMO_LOGIN
  return flag === '1' || flag === 'true'
}
