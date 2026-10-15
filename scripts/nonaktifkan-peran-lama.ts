/**
 * Menonaktifkan akun peran lama (model laporan SUBHOLDING, 16 Okt 2026 —
 * docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md): semua akun PIC_PROYEK dan
 * KEPALA_DIVISI dijadikan isActive=false dan seluruh sesi AuthSession-nya
 * dicabut (revokedAt). Data lama (laporan, proyek, riwayat) TIDAK dihapus.
 *
 *   Uji (hanya hitung, tidak menulis):
 *     DATABASE_URL=... npx tsx scripts/nonaktifkan-peran-lama.ts --uji
 *   Jalankan sungguhan (dipakai saat deploy):
 *     DATABASE_URL=... npx tsx scripts/nonaktifkan-peran-lama.ts --saya-yakin
 *
 * Pagar:
 *  - Tanpa flag apa pun / flag tak dikenal → berhenti sebelum membuka koneksi.
 *  - `--uji` menampilkan jumlah akun & sesi yang akan terdampak saja.
 *  - Penulisan wajib `--saya-yakin`; host basis data dicetak lebih dulu.
 *  - Satu transaksi: nonaktifkan akun + cabut sesi + satu baris AuditLog
 *    (DEACTIVATE_LEGACY_ROLES, tanpa data pribadi selain id/username).
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '@prisma/client'

export const PERAN_LAMA = ['PIC_PROYEK', 'KEPALA_DIVISI'] as const

export type Opsi = { uji: boolean; yakin: boolean }

/** Membaca argumen; melempar galat bila tidak aman untuk dilanjutkan. */
export function bacaArgumen(argv: readonly string[]): Opsi {
  const dikenal = new Set(['--uji', '--saya-yakin'])
  const asing = argv.filter((a) => !dikenal.has(a))
  if (asing.length) throw new Error(`Argumen tidak dikenal: ${asing.join(' ')}. Pakai --uji atau --saya-yakin.`)
  const uji = argv.includes('--uji')
  const yakin = argv.includes('--saya-yakin')
  if (uji && yakin) throw new Error('Pilih salah satu: --uji (hitung saja) atau --saya-yakin (jalankan).')
  if (!uji && !yakin) {
    throw new Error(
      'Skrip ini menonaktifkan SEMUA akun PIC_PROYEK dan KEPALA_DIVISI. ' +
        'Jalankan dengan --uji untuk melihat jumlahnya, atau --saya-yakin untuk menjalankannya.'
    )
  }
  return { uji, yakin }
}

export function hostBasisData(url: string | undefined): string {
  try {
    return new URL(url ?? '').hostname
  } catch {
    return ''
  }
}

type Klien = Pick<PrismaClient, 'user' | 'authSession' | 'auditLog' | '$transaction'>

export type Hasil = {
  uji: boolean
  akun: number
  perPeran: Record<string, number>
  sesi: number
  dinonaktifkan: number
  sesiDicabut: number
}

/**
 * Inti skrip. Mode uji hanya membaca; mode sungguhan menulis dalam satu
 * transaksi. `now` disuntikkan agar tes deterministik.
 */
export async function nonaktifkanPeranLama(client: Klien, opsi: Opsi, now = new Date()): Promise<Hasil> {
  if (!opsi.uji && !opsi.yakin) throw new Error('Penulisan wajib --saya-yakin.')
  const where = { role: { in: [...PERAN_LAMA] }, isActive: true }
  const targets = await client.user.findMany({ where, select: { id: true, username: true, role: true } })
  const ids = targets.map((t) => t.id)
  const perPeran: Record<string, number> = Object.fromEntries(PERAN_LAMA.map((r) => [r, 0]))
  for (const t of targets) perPeran[t.role] = (perPeran[t.role] ?? 0) + 1
  const sesiWhere = { userId: { in: ids }, revokedAt: null }
  const sesi = ids.length ? await client.authSession.count({ where: sesiWhere }) : 0

  const dasar = { akun: ids.length, perPeran, sesi }
  if (opsi.uji || ids.length === 0) return { uji: opsi.uji, ...dasar, dinonaktifkan: 0, sesiDicabut: 0 }

  return client.$transaction(async (tx) => {
    // Bersyarat ulang pada peran & status: akun yang berubah di antara baca dan tulis tidak ikut.
    const off = await tx.user.updateMany({ where: { id: { in: ids }, ...where }, data: { isActive: false } })
    const revoked = await tx.authSession.updateMany({ where: sesiWhere, data: { revokedAt: now } })
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'DEACTIVATE_LEGACY_ROLES',
        targetType: 'USER',
        targetId: 'PERAN_LAMA',
        beforeData: JSON.stringify({ roles: PERAN_LAMA, perPeran }),
        afterData: JSON.stringify({
          dinonaktifkan: off.count,
          sesiDicabut: revoked.count,
          akun: targets.map((t) => ({ id: t.id, username: t.username, role: t.role })),
        }),
        userAgent: 'scripts/nonaktifkan-peran-lama.ts',
        at: now,
      },
    })
    return { uji: false, ...dasar, dinonaktifkan: off.count, sesiDicabut: revoked.count }
  })
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<Hasil> {
  const opsi = bacaArgumen(argv)
  const url = env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL wajib diisi.')
  const host = hostBasisData(url)
  console.log(`Basis data: ${host || 'tidak dikenal'} — mode ${opsi.uji ? 'UJI (tidak menulis)' : 'SUNGGUHAN'}.`)
  const { PrismaClient } = await import('@prisma/client')
  const client = new PrismaClient({ datasources: { db: { url } } })
  try {
    const hasil = await nonaktifkanPeranLama(client, opsi)
    const rinci = Object.entries(hasil.perPeran).map(([r, n]) => `${r} ${n}`).join(', ')
    if (hasil.uji) {
      console.log(`Akan dinonaktifkan: ${hasil.akun} akun (${rinci}); sesi aktif yang dicabut: ${hasil.sesi}.`)
    } else {
      console.log(`Dinonaktifkan: ${hasil.dinonaktifkan} akun (${rinci}); sesi dicabut: ${hasil.sesiDicabut}.`)
    }
    return hasil
  } finally {
    await client.$disconnect()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
}
