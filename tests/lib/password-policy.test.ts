import { describe, expect, it, vi } from 'vitest'
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  blocksForPasswordChange,
  generatePassword,
  passwordProblem,
  resolveSeedPassword,
} from '@/lib/password-policy'
import { clientErrorMessage, isSafeClientMessage } from '@/lib/api-error'

/** Kebijakan kata sandi F1-C (src/lib/password-policy.ts) dan pesan galat aman (src/lib/api-error.ts). */

describe('passwordProblem', () => {
  it('minimal 8 karakter', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
    expect(passwordProblem('1234')).toMatch(/minimal 8/)
    expect(passwordProblem('1234567')).toMatch(/minimal 8/)
    expect(passwordProblem('12345678')).toBeNull()
  })

  it('maksimal 256 karakter', () => {
    expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull()
    expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toMatch(/maksimal 256/)
  })

  it('menolak yang hanya spasi dan yang sama dengan kata sandi lama', () => {
    expect(passwordProblem('         ')).toMatch(/spasi/)
    expect(passwordProblem('rahasia-lama', { current: 'rahasia-lama' })).toMatch(/sama/)
    expect(passwordProblem('rahasia-baru', { current: 'rahasia-lama' })).toBeNull()
  })

  it('label dipakai di pesan', () => {
    expect(passwordProblem('x', { label: 'Kata sandi baru' })).toBe('Kata sandi baru minimal 8 karakter.')
  })
})

describe('generatePassword', () => {
  it('acak, memenuhi kebijakan, tanpa karakter yang mudah tertukar', () => {
    const a = generatePassword()
    const b = generatePassword()
    expect(a).not.toBe(b)
    expect(passwordProblem(a)).toBeNull()
    expect(a).not.toMatch(/[0O1lI]/)
    expect(generatePassword(3).length).toBe(MIN_PASSWORD_LENGTH)
  })
})

describe('resolveSeedPassword', () => {
  it('tidak ada lagi "1234" bawaan: kosong = acak', () => {
    const r = resolveSeedPassword(undefined)
    expect(r.generated).toBe(true)
    expect(r.password).not.toBe('1234')
    expect(passwordProblem(r.password)).toBeNull()
    expect(resolveSeedPassword('   ').generated).toBe(true)
  })

  it('SEED_PASSWORD lemah menghentikan skrip', () => {
    expect(() => resolveSeedPassword('1234')).toThrow(/minimal 8/)
  })

  it('SEED_PASSWORD yang memenuhi dipakai apa adanya', () => {
    expect(resolveSeedPassword('kata-sandi-demo')).toEqual({ password: 'kata-sandi-demo', generated: false })
  })
})

describe('blocksForPasswordChange', () => {
  it('hanya menahan akun bertanda, kecuali rute ganti kata sandi', () => {
    expect(blocksForPasswordChange({ mustChangePassword: false })).toBe(false)
    expect(blocksForPasswordChange({})).toBe(false)
    expect(blocksForPasswordChange({ mustChangePassword: true })).toBe(true)
    expect(blocksForPasswordChange({ mustChangePassword: true }, { allowPendingPasswordChange: true })).toBe(false)
  })
})

describe('pesan galat untuk klien', () => {
  it('penolakan yang disengaja diteruskan, galat internal diganti pesan umum', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(clientErrorMessage(new Error('Username "rina" sudah dipakai.'), 'Gagal', 't')).toBe('Username "rina" sudah dipakai.')
    expect(spy).not.toHaveBeenCalled()

    class PrismaClientKnownRequestError extends Error {}
    expect(clientErrorMessage(new PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)'), 'Gagal', 't')).toBe('Gagal')
    expect(clientErrorMessage(new Error('Invalid `prisma.user.create()` invocation:\n...'), 'Gagal', 't')).toBe('Gagal')
    expect(clientErrorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"), 'Gagal', 't')).toBe('Gagal')
    expect(clientErrorMessage('bukan error', 'Gagal', 't')).toBe('Gagal')
    expect(spy).toHaveBeenCalledTimes(4)
    expect(isSafeClientMessage(new Error('Gagal mengunggah berkas: bucket "evidence" not found'))).toBe(false)
  })
})
