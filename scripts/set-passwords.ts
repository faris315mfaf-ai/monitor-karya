/**
 * Sets a password on seeded accounts so they can actually sign in.
 *
 *   npm run db:passwords                  # every account without a password
 *   npm run db:passwords -- --all         # reset every account
 *   npm run db:passwords -- superadmin    # just one account (username or email)
 *
 * The password comes from SEED_PASSWORD in .env ("1234" for the sample
 * accounts since 10 Sep 2026). These are demo accounts on demo data — do not
 * run this against real user records.
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'

const MIN_LENGTH = 4

async function main() {
  const password = process.env.SEED_PASSWORD
  if (!password || password.length < MIN_LENGTH) {
    throw new Error(`SEED_PASSWORD is missing or shorter than ${MIN_LENGTH} characters — set it in .env`)
  }

  const args = process.argv.slice(2)
  const resetAll = args.includes('--all')
  const targets = args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase())

  const where = targets.length
    ? { OR: [{ email: { in: targets } }, { username: { in: targets } }] }
    : resetAll
      ? {}
      : { passwordHash: null }

  const users = await db.user.findMany({ where, select: { id: true, email: true, username: true, role: true } })
  if (users.length === 0) {
    console.log('Tidak ada akun yang perlu diperbarui.')
    return
  }

  // scrypt is deliberately slow; each account still gets its own salt.
  let updated = 0
  for (const u of users) {
    await db.user.update({
      where: { id: u.id },
      data: { passwordHash: await hashPassword(password) },
    })
    updated++
  }

  console.log(`✅ ${updated} akun diperbarui.`)
  const byRole = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1
    return acc
  }, {})
  for (const [role, n] of Object.entries(byRole).sort()) {
    console.log(`   ${role}: ${n}`)
  }
  console.log('\nContoh akun untuk masuk (username):')
  for (const role of ['SUPERADMIN', 'ADMIN_PT', 'KEPALA_DIVISI', 'PIC_PROYEK', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'MANAJEMEN']) {
    const u = users.find((x) => x.role === role)
    if (u) console.log(`   ${role.padEnd(18)} ${u.username ?? u.email}`)
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error('❌ Gagal:', e instanceof Error ? e.message : e)
    await db.$disconnect()
    process.exit(1)
  })
