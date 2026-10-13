import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

// Kept free of `server-only` and of any Next.js import so that plain Node
// scripts (scripts/set-passwords.ts) can reuse the exact same hashing as the
// login route. Never import this from a Client Component.

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>

// [T11-DB] N=2^16 (64 MiB, r=8, p=1) menggantikan 2^14. Verifikasi MEMBACA N dari
// string hash (`scrypt$<N>$...`), jadi hash lama bernilai 16384 tetap valid; hash
// baru memakai N di bawah. Perlu maxmem > 128*N*r (bawaan Node hanya 32 MiB).
const SCRYPT_N = 65536
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 32
const SCRYPT_N_LEGACY = 16384
// Batas wajar N pada hash tersimpan: cegah string hash rusak/jahat memicu alokasi besar.
const SCRYPT_N_MIN = 1024
const SCRYPT_N_MAX = 1 << 18

const maxmemFor = (n: number) => 128 * n * SCRYPT_R + 16 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: maxmemFor(SCRYPT_N),
  })
  return `scrypt$${SCRYPT_N}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

/** N efektif dari string hash (nilai tak terbaca/di luar batas → bawaan lama 16384). */
function storedN(parts: string[]): number {
  const parsedN = Number(parts[1])
  return Number.isInteger(parsedN) && parsedN >= SCRYPT_N_MIN && parsedN <= SCRYPT_N_MAX && (parsedN & (parsedN - 1)) === 0
    ? parsedN
    : SCRYPT_N_LEGACY
}

/** N hash tersimpan, atau null bila bukan format scrypt kita. */
export function hashCostN(stored: string | null): number | null {
  if (!stored) return null
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return null
  return storedN(parts)
}

/** N yang dipakai hash baru (untuk pembanding/tes). */
export const CURRENT_SCRYPT_N = SCRYPT_N

/**
 * [T13] Memverifikasi kata sandi dengan BIAYA WAKTU SERAGAM. Hash lama (N=16384)
 * ~4x lebih murah dari hash baru (N=65536) sementara semua akun produksi masih
 * berhash lama; tanpa penyamaan, "akun tidak ada" (hash tiruan N baru) terukur
 * lebih lambat dari "akun ada, sandi salah" dan membocorkan daftar username.
 * Setelah verifikasi, hash bernilai N kecil ditambah beberapa putaran scrypt
 * pembuang sehingga total kerja ≈ satu hash N sekarang. Sengaja TIDAK menulis
 * ulang hash saat masuk: sidik kata sandi di token sesi (`pv`) berasal dari hash,
 * jadi rehash akan memutus semua sesi lain pemilik akun (web dan Android).
 */
export async function verifyPasswordUniformCost(password: string, stored: string | null): Promise<boolean> {
  const ok = await verifyPassword(password, stored)
  const n = hashCostN(stored)
  if (n !== null && n < SCRYPT_N) {
    // scrypt linear terhadap N; batasi putaran agar hash rusak tak memicu kerja berlebihan.
    const rounds = Math.min(16, Math.max(0, SCRYPT_N / n - 1))
    const salt = randomBytes(16)
    for (let i = 0; i < rounds; i++) {
      await scrypt('mk-pembuang-waktu', salt, SCRYPT_KEYLEN, { N: n, r: SCRYPT_R, p: SCRYPT_P, maxmem: maxmemFor(n) })
    }
  }
  return ok
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false

  // N dari string hash; nilai tak terbaca → bawaan lama (16384) seperti sebelum ada parameter.
  const n = storedN(parts)

  const salt = Buffer.from(parts[2], 'base64url')
  const expected = Buffer.from(parts[3], 'base64url')
  const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: n,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: maxmemFor(n),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
