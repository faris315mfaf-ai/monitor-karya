import { describe, expect, it, vi } from 'vitest'
import { bacaArgumen, main, nonaktifkanPeranLama } from '../../scripts/nonaktifkan-peran-lama'

/*
 * [SH-SV2] scripts/nonaktifkan-peran-lama.ts — tanpa koneksi DB: klien palsu.
 * Pagar flag, mode uji (hanya hitung), dan penulisan satu transaksi + AuditLog.
 */

function fakeClient() {
  const users = [
    { id: 'p1', username: 'pic.1', role: 'PIC_PROYEK' },
    { id: 'p2', username: 'pic.2', role: 'PIC_PROYEK' },
    { id: 'k1', username: 'kadiv.1', role: 'KEPALA_DIVISI' },
  ]
  const client = {
    user: {
      findMany: vi.fn(async (_args: { where: unknown }) => users),
      updateMany: vi.fn(async () => ({ count: users.length })),
    },
    authSession: {
      count: vi.fn(async () => 5),
      updateMany: vi.fn(async () => ({ count: 5 })),
    },
    auditLog: { create: vi.fn(async (_args: { data: Record<string, string> }) => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(client)),
  }
  return client
}

describe('bacaArgumen', () => {
  it('tanpa flag ditolak: wajib --saya-yakin atau --uji', () => {
    expect(() => bacaArgumen([])).toThrow('--saya-yakin')
  })
  it('flag asing dan gabungan --uji + --saya-yakin ditolak', () => {
    expect(() => bacaArgumen(['--yakin'])).toThrow('tidak dikenal')
    expect(() => bacaArgumen(['--uji', '--saya-yakin'])).toThrow('salah satu')
  })
  it('--uji dan --saya-yakin diterima', () => {
    expect(bacaArgumen(['--uji'])).toEqual({ uji: true, yakin: false })
    expect(bacaArgumen(['--saya-yakin'])).toEqual({ uji: false, yakin: true })
  })
})

describe('nonaktifkanPeranLama', () => {
  it('mode uji hanya menghitung, tidak menulis', async () => {
    const c = fakeClient()
    const hasil = await nonaktifkanPeranLama(c as never, { uji: true, yakin: false })
    expect(hasil).toMatchObject({ uji: true, akun: 3, sesi: 5, dinonaktifkan: 0, sesiDicabut: 0, perPeran: { PIC_PROYEK: 2, KEPALA_DIVISI: 1 } })
    expect(c.user.findMany.mock.calls[0]![0].where).toEqual({ role: { in: ['PIC_PROYEK', 'KEPALA_DIVISI'] }, isActive: true })
    expect(c.$transaction).not.toHaveBeenCalled()
    expect(c.user.updateMany).not.toHaveBeenCalled()
    expect(c.authSession.updateMany).not.toHaveBeenCalled()
    expect(c.auditLog.create).not.toHaveBeenCalled()
  })

  it('tanpa --saya-yakin tidak menulis', async () => {
    await expect(nonaktifkanPeranLama(fakeClient() as never, { uji: false, yakin: false })).rejects.toThrow('--saya-yakin')
  })

  it('--saya-yakin: nonaktifkan, cabut sesi, AuditLog — satu transaksi', async () => {
    const c = fakeClient()
    const now = new Date('2026-10-16T01:00:00Z')
    const hasil = await nonaktifkanPeranLama(c as never, { uji: false, yakin: true }, now)
    expect(hasil).toMatchObject({ uji: false, dinonaktifkan: 3, sesiDicabut: 5 })
    expect(c.$transaction).toHaveBeenCalledTimes(1)
    expect(c.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2', 'k1'] }, role: { in: ['PIC_PROYEK', 'KEPALA_DIVISI'] }, isActive: true },
      data: { isActive: false },
    })
    expect(c.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: { in: ['p1', 'p2', 'k1'] }, revokedAt: null },
      data: { revokedAt: now },
    })
    const audit = c.auditLog.create.mock.calls[0]![0].data
    expect(audit).toMatchObject({ action: 'DEACTIVATE_LEGACY_ROLES', targetType: 'USER', actorId: null })
    expect(JSON.parse(audit.afterData)).toMatchObject({ dinonaktifkan: 3, sesiDicabut: 5 })
  })
})

describe('main — pagar sebelum koneksi', () => {
  it('tanpa flag atau tanpa DATABASE_URL berhenti sebelum Prisma dimuat', async () => {
    await expect(main([], { DATABASE_URL: 'postgresql://x:y@127.0.0.1:1/db' } as unknown as NodeJS.ProcessEnv)).rejects.toThrow('--saya-yakin')
    await expect(main(['--uji'], {} as NodeJS.ProcessEnv)).rejects.toThrow('DATABASE_URL')
  })
})
