/**
 * Sets a password on seeded accounts so they can actually sign in.
 *
 *   npm run db:passwords              # every account without a password
 *   npm run db:passwords -- --all     # reset every account
 *   npm run db:passwords -- a@b.co    # just one account
 *
 * The password comes from SEED_PASSWORD in .env. These are demo accounts on
 * demo data — do not run this against real user records.
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'

async function main() {
  const password = process.env.SEED_PASSWORD
  if (!password || password.length < 8) {
    throw new Error('SEED_PASSWORD is missing or shorter than 8 characters — set it in .env')
  }

  const args = process.argv.slice(2)
  const resetAll = args.includes('--all')
  const emails = args.filter((a) => !a.startsWith('--'))

  const where = emails.length
    ? { email: { in: emails.map((e) => e.toLowerCase()) } }
    : resetAll
      ? {}
      : { passwordHash: null }

  const users = await db.user.findMany({ where, select: { id: true, email: true, role: true } })
  if (users.length === 0) {
    console.log('Tidak ada akun yang perlu diperbarui.')
    return
  }

  // One hash for one password — scrypt is deliberately slow, so hashing once
  // and reusing it keeps this from taking a minute across 50+ accounts.
  // Each account still gets its own salt below.
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
  console.log('\nContoh akun untuk masuk:')
  for (const role of ['MANAJEMEN', 'ADMIN_PT', 'DIREKTUR_ENTITAS', 'AUDITOR']) {
    const u = users.find((x) => x.role === role)
    if (u) console.log(`   ${role.padEnd(18)} ${u.email}`)
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error('❌ Gagal:', e instanceof Error ? e.message : e)
    await db.$disconnect()
    process.exit(1)
  })
