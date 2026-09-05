import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

// Kept free of `server-only` and of any Next.js import so that plain Node
// scripts (scripts/set-passwords.ts) can reuse the exact same hashing as the
// login route. Never import this from a Client Component.

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>

// N=16384 keeps sign-in well under ~100ms while staying expensive enough that
// offline guessing is impractical.
const SCRYPT_N = 16384
const SCRYPT_KEYLEN = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN)
  return `scrypt$${SCRYPT_N}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false

  const salt = Buffer.from(parts[2], 'base64url')
  const expected = Buffer.from(parts[3], 'base64url')
  const actual = await scrypt(password.normalize('NFKC'), salt, expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
