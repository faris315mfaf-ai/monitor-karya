/**
 * Menanam ulang akun-akun contoh (bila terhapus) dan menautkannya ke data
 * struktur yang ada, tanpa menyentuh akun lain:
 *
 *   superadmin, owner      -> SUPERADMIN (seluruh grup)
 *   manajemen              -> MANAJEMEN
 *   holding                -> DIREKTUR_SDM_GA di Holding PT Bike
 *   adminptcontoh          -> ADMIN_PT PT Sigma
 *   kepaladivisi           -> KEPALA_DIVISI divisi pertama PT Sigma
 *   manager                -> PIC_PROYEK proyek pertama PT Sigma
 *   direkturentitas        -> DIREKTUR_ENTITAS PT Sigma
 *
 * Kata sandi dari SEED_PASSWORD di .env (1234 untuk demo). Sejak seed 10 Sep
 * 2026 akun-akun ini sudah ditanam oleh seed itu sendiri; skrip ini tinggal
 * alat perbaikan. Jalankan: npm run db:demo
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'

const PASSWORD = process.env.SEED_PASSWORD

type Spec = { username: string; email: string; name: string; role: string; title: string; avatarColor: string; scope: 'GROUP' | 'HOLDING' | 'PT' }

const SPECS: Spec[] = [
  { username: 'superadmin', email: 'deckemr@gmail.com', name: 'Super Admin', role: 'SUPERADMIN', title: 'Super Admin', avatarColor: '#0f172a', scope: 'GROUP' },
  { username: 'owner', email: 'owner@bike.co.id', name: 'Owner Holding PT Bike', role: 'SUPERADMIN', title: 'Pemilik', avatarColor: '#1d4ed8', scope: 'GROUP' },
  { username: 'manajemen', email: 'manajemen@bike.co.id', name: 'Manajemen Holding', role: 'MANAJEMEN', title: 'Manajemen Holding', avatarColor: '#16a34a', scope: 'GROUP' },
  { username: 'holding', email: 'holding@bike.co.id', name: 'Direksi Holding PT Bike', role: 'DIREKTUR_SDM_GA', title: 'Direktur SDM & GA Holding', avatarColor: '#0d9488', scope: 'HOLDING' },
  { username: 'adminptcontoh', email: 'adminptcontoh@karya.co.id', name: 'Admin PT Sigma (contoh)', role: 'ADMIN_PT', title: 'Admin PT', avatarColor: '#2563eb', scope: 'PT' },
  { username: 'kepaladivisi', email: 'kepaladivisi@karya.co.id', name: 'Kepala Divisi (contoh)', role: 'KEPALA_DIVISI', title: 'Kepala Divisi', avatarColor: '#7c3aed', scope: 'PT' },
  { username: 'manager', email: 'manager@karya.co.id', name: 'Manager Proyek (contoh)', role: 'PIC_PROYEK', title: 'Manager Proyek', avatarColor: '#0d9488', scope: 'PT' },
  { username: 'direkturentitas', email: 'direkturentitas@karya.co.id', name: 'Direktur PT Sigma (contoh)', role: 'DIREKTUR_ENTITAS', title: 'Direktur Perusahaan', avatarColor: '#ea580c', scope: 'PT' },
]

async function main() {
  if (!PASSWORD || PASSWORD.length < 4) {
    throw new Error('SEED_PASSWORD is missing or shorter than 4 characters — set it in .env')
  }

  const pt = await db.entity.findUnique({ where: { code: 'PT-SIGMA' } })
  if (!pt) throw new Error('Entitas PT-SIGMA tidak ditemukan — jalankan seed terlebih dahulu.')
  const holding = await db.entity.findFirst({ where: { type: 'HOLDING', isActive: true }, orderBy: { createdAt: 'asc' } })

  const passwordHash = await hashPassword(PASSWORD)
  const ids: Record<string, string> = {}

  for (const spec of SPECS) {
    const data = {
      name: spec.name,
      role: spec.role,
      title: spec.title,
      avatarColor: spec.avatarColor,
      scopeEntityId: spec.scope === 'PT' ? pt.id : spec.scope === 'HOLDING' ? (holding?.id ?? null) : null,
      isActive: true,
      passwordHash,
    }
    const user = await db.user.upsert({
      where: { username: spec.username },
      update: { ...data, email: spec.email },
      create: { username: spec.username, email: spec.email, ...data },
    })
    ids[spec.username] = user.id
  }

  const division = await db.division.findFirst({ where: { entityId: pt.id, isActive: true }, orderBy: { name: 'asc' } })
  if (division) await db.division.update({ where: { id: division.id }, data: { headUserId: ids.kepaladivisi } })
  const project = await db.project.findFirst({ where: { entityId: pt.id, lifecycle: 'AKTIF' }, orderBy: { code: 'asc' } })
  if (project) await db.project.update({ where: { id: project.id }, data: { picUserId: ids.manager, picName: SPECS[6].name } })

  console.log('✅ Akun contoh siap (kata sandi = SEED_PASSWORD):')
  for (const s of SPECS) console.log(`   ${s.username.padEnd(16)} ${s.role}`)
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error('❌ Gagal:', e instanceof Error ? e.message : e)
    await db.$disconnect()
    process.exit(1)
  })
