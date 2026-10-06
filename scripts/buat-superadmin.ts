/**
 * Membuat (atau memperbarui) akun Super Admin yang bisa melihat semuanya.
 *
 *   SUPERADMIN_PASSWORD='kata-sandi-kuat' npx tsx scripts/buat-superadmin.ts admin
 *
 * - Username dari argumen pertama (bawaan: admin).
 * - Kata sandi dari SUPERADMIN_PASSWORD. Wajib lolos kebijakan (minimal 8
 *   karakter, src/lib/password-policy.ts) untuk basis data sungguhan.
 * - Kata sandi lemah (mis. "1") HANYA diterima bila DATABASE_URL menunjuk ke
 *   basis data lokal (localhost / 127.0.0.1 / ::1 / host.docker.internal) DAN
 *   flag --izinkan-lemah diberikan. Super Admin melihat dan mengubah semua data,
 *   jadi kata sandi lemah di server sungguhan sama dengan membuka pintu.
 * - Akun sudah ada (username sama): peran dijadikan SUPERADMIN, diaktifkan,
 *   kata sandinya diganti.
 *
 * Skrip ini menulis ke basis data di DATABASE_URL. Pastikan Anda tahu basis
 * data mana yang dituju sebelum menjalankannya.
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'
import { passwordProblem } from '../src/lib/password-policy'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'])

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname
  } catch {
    return ''
  }
}

async function main() {
  const args = process.argv.slice(2)
  const allowWeak = args.includes('--izinkan-lemah')
  const username = (args.find((a) => !a.startsWith('--')) ?? 'admin').trim().toLowerCase()
  const password = process.env.SUPERADMIN_PASSWORD ?? ''

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error('Username hanya huruf kecil, angka, titik, garis bawah, atau strip (3–32 karakter).')
  }
  if (!password) throw new Error('Isi SUPERADMIN_PASSWORD di lingkungan, jangan di argumen (agar tidak tercatat di riwayat shell).')

  const host = dbHost()
  const local = LOCAL_HOSTS.has(host)
  const problem = passwordProblem(password)
  if (problem) {
    if (!(allowWeak && local)) {
      throw new Error(
        `${problem} Kata sandi lemah hanya diizinkan untuk basis data lokal dengan --izinkan-lemah (basis data sekarang: ${host || 'tidak dikenal'}).`
      )
    }
    console.warn(`⚠ Kata sandi lemah dipakai untuk basis data lokal (${host}). Jangan pakai di server sungguhan.`)
  }

  const passwordHash = await hashPassword(password)
  const existing = await db.user.findFirst({ where: { username }, select: { id: true } })

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { role: 'SUPERADMIN', scopeEntityId: null, isActive: true, passwordHash },
      select: { id: true },
    })
    console.log(`✅ Akun ${username} diperbarui menjadi Super Admin aktif.`)
  } else {
    await db.user.create({
      data: {
        username,
        email: `${username}@monitor-karya.local`,
        name: 'Super Admin',
        title: 'Super Admin',
        role: 'SUPERADMIN',
        scopeEntityId: null,
        isActive: true,
        passwordHash,
      },
      select: { id: true },
    })
    console.log(`✅ Akun Super Admin ${username} dibuat.`)
  }
  console.log(`   Basis data: ${host || 'tidak dikenal'}. Masuk di /login dengan username "${username}".`)
}

main()
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
