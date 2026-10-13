import { describe, expect, it } from 'vitest'
import { randomBytes, scryptSync } from 'node:crypto'
import { hashPassword, verifyPassword } from '@/lib/password'

/** Hash gaya lama (N=16384) persis seperti yang tersimpan di produksi sebelum N dinaikkan. */
function hashLama(password: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(password.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$${salt.toString('base64url')}$${key.toString('base64url')}`
}

describe('password scrypt', () => {
  it('hash baru memakai N lebih besar dan lolos verifikasi', async () => {
    const h = await hashPassword('Sandi-Rahasia-123')
    expect(h.startsWith('scrypt$65536$')).toBe(true)
    expect(await verifyPassword('Sandi-Rahasia-123', h)).toBe(true)
    expect(await verifyPassword('salah', h)).toBe(false)
  })

  it('hash lama N=16384 tetap valid (N dibaca dari string hash)', async () => {
    const lama = hashLama('Sandi-Lama-456')
    expect(await verifyPassword('Sandi-Lama-456', lama)).toBe(true)
    expect(await verifyPassword('Sandi-Lama-457', lama)).toBe(false)
  })

  it('N di luar batas atau bukan pangkat dua jatuh ke bawaan lama, bukan alokasi besar', async () => {
    const lama = hashLama('abc12345')
    const rusak = lama.replace('scrypt$16384$', 'scrypt$999999999$')
    // Dibaca sebagai N lama → cocok karena hash aslinya memang N=16384.
    expect(await verifyPassword('abc12345', rusak)).toBe(true)
    expect(await verifyPassword('abc12345', lama.replace('scrypt$16384$', 'scrypt$abc$'))).toBe(true)
  })
})
