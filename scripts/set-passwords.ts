/**
 * Sets a password on seeded accounts so they can actually sign in.
 *
 *   npm run db:passwords                  # every account without a password
 *   npm run db:passwords -- --all         # reset every account
 *   npm run db:passwords -- superadmin    # just one account (username or email)
 *
 * The password comes from SEED_PASSWORD in the process environment (minimal 8 karakter sejak
 * F1-C, 6 Okt 2026). Bila kosong, kata sandi acak dibuat dan dicetak sekali.
 * These are demo accounts on demo data — do not run this against real user
 * records.
 */
import type { PrismaClient } from '@prisma/client'
import { requireLocalDatabase } from './guard-db-lokal'

import { hashPassword } from '../src/lib/password'
import { resolveSeedPassword } from '../src/lib/password-policy'

let db: PrismaClient | undefined

async function main() {
  const databaseUrl = requireLocalDatabase(process.env, 'Akun contoh')
  const { password, generated } = resolveSeedPassword(process.env.SEED_PASSWORD)
  const { PrismaClient } = await import('@prisma/client')
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  db = client

  const args = process.argv.slice(2)
  const resetAll = args.includes('--all')
  const targets = args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase())

  const where = targets.length
    ? { OR: [{ email: { in: targets } }, { username: { in: targets } }] }
    : resetAll
      ? {}
      : { passwordHash: null }

  const users = await client.user.findMany({ where, select: { id: true, email: true, username: true, role: true } })
  if (users.length === 0) {
    console.log('Tidak ada akun yang perlu diperbarui.')
    return
  }

  // scrypt is deliberately slow; each account still gets its own salt.
  let updated = 0
  for (const u of users) {
    await client.user.update({
      where: { id: u.id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true },
    })
    updated++
  }

  console.log(`✅ ${updated} akun diperbarui.`)
  if (generated) console.log(`   SEED_PASSWORD kosong — kata sandi acak untuk semua akun ini: ${password}`)
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
  .then(() => db?.$disconnect())
  .catch(async (e) => {
    console.error('❌ Gagal:', e instanceof Error ? e.message : e)
    await db?.$disconnect()
    process.exit(1)
  })
