import { randomInt } from 'node:crypto'

/**
 * Kebijakan kata sandi (F1-C, 6 Okt 2026, docs/KEAMANAN.md).
 *
 *  - Minimal 8 karakter, maksimal 256 di SEMUA jalur set/ganti/reset:
 *    ganti sendiri (/api/profile/password), reset & buat akun oleh admin
 *    (/api/companies, /api/companies/users), dan skrip seed.
 *  - Akun yang dibuat atau disetel ulang oleh admin diberi
 *    `User.mustChangePassword = true`; pemiliknya dipaksa ke /login/ganti-sandi
 *    dan semua API selain ganti kata sandi, keluar, dan /api/auth/me
 *    menolak 403 "Ganti kata sandi dulu" (src/lib/auth.ts → requireApiUser).
 *
 * Bebas `server-only` dan impor Next.js supaya skrip Node (scripts/seed.ts)
 * dan tes bisa memakainya. Jangan diimpor dari Client Component (node:crypto);
 * klien cukup memakai angka MIN_PASSWORD_LENGTH yang sama di teksnya.
 */

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 256

/** Pesan 403 untuk akun yang wajib mengganti kata sandi dulu. */
export const MUST_CHANGE_PASSWORD_MESSAGE = 'Ganti kata sandi dulu'
/** Kode mesin di badan 403 supaya klien bisa mengarahkan ke layar ganti kata sandi. */
export const MUST_CHANGE_PASSWORD_CODE = 'MUST_CHANGE_PASSWORD'
/** Layar wajib ganti kata sandi. */
export const CHANGE_PASSWORD_PATH = '/login/ganti-sandi'

/**
 * Pesan galat untuk kata sandi baru, atau null bila diterima.
 * `current` diisi saat pemilik mengganti kata sandinya sendiri.
 */
export function passwordProblem(
  password: string,
  opts: { current?: string; label?: string } = {}
): string | null {
  const label = opts.label ?? 'Kata sandi'
  if (password.length < MIN_PASSWORD_LENGTH) return `${label} minimal ${MIN_PASSWORD_LENGTH} karakter.`
  if (password.length > MAX_PASSWORD_LENGTH) return `${label} maksimal ${MAX_PASSWORD_LENGTH} karakter.`
  if (!password.trim()) return `${label} tidak boleh hanya spasi.`
  if (opts.current !== undefined && password === opts.current) return `${label} masih sama dengan yang lama.`
  return null
}

// Tanpa huruf/angka yang mudah tertukar (0/O, 1/l/I) supaya bisa dibacakan.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Kata sandi acak untuk akun baru tanpa kata sandi & seed tanpa SEED_PASSWORD. */
export function generatePassword(length = 14): string {
  const n = Math.max(MIN_PASSWORD_LENGTH, Math.min(64, Math.floor(length)))
  let out = ''
  for (let i = 0; i < n; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

/**
 * Apakah akun ini harus ditahan di layar ganti kata sandi? Rute yang memang
 * melayani penggantian kata sandi (/api/profile/password) memanggil
 * requireApiUser({ allowPendingPasswordChange: true }); /api/auth/logout dan
 * /api/auth/me tidak memakai requireApiUser sehingga selalu terbuka.
 */
export function blocksForPasswordChange(
  user: { mustChangePassword?: boolean | null },
  opts: { allowPendingPasswordChange?: boolean } = {}
): boolean {
  return Boolean(user.mustChangePassword) && !opts.allowPendingPasswordChange
}

/**
 * Kata sandi untuk skrip seed (scripts/seed.ts, set-passwords.ts,
 * demo-accounts.ts). Tidak ada lagi "1234" bawaan: SEED_PASSWORD wajib
 * memenuhi kebijakan, atau — bila kosong — dibuat acak dan dicetak sekali
 * oleh skripnya. SEED_PASSWORD yang terisi tapi lemah adalah galat.
 */
export function resolveSeedPassword(env: string | undefined): { password: string; generated: boolean } {
  const given = env?.trim() ?? ''
  if (!given) return { password: generatePassword(16), generated: true }
  const problem = passwordProblem(given, { label: 'SEED_PASSWORD' })
  if (problem) throw new Error(`${problem} Kosongkan untuk dibuatkan acak, atau isi minimal ${MIN_PASSWORD_LENGTH} karakter di .env.`)
  return { password: given, generated: false }
}
