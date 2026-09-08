/**
 * Creates the seven demo accounts, one per role in the reporting chain, and
 * wires them to real data so the whole flow can be walked end to end:
 *
 *   PIC Proyek  -> owns the 4 projects of PT-001
 *   Kepala Div. -> heads the first division of PT-001
 *   Admin PT    -> scoped to PT-001, receives and forwards both streams
 *   Direktur PT -> scoped to the sub-holding above PT-001
 *   Dir SDM&GA / Pengelola IT / Manajemen -> group-wide
 *
 * Existing accounts with the same email are overwritten. Run after seeding:
 *   npm run db:demo
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/password'

const PASSWORD = process.env.SEED_PASSWORD

type Spec = {
  email: string
  name: string
  role: string
  phone: string
  avatarColor: string
}

const SPECS: Spec[] = [
  { email: 'pic@karya.co.id', name: 'Bpk. Rangga Prasetya', role: 'PIC_PROYEK', phone: '+628110000001', avatarColor: '#0d9488' },
  { email: 'kadiv@karya.co.id', name: 'Ibu Mira Anggraini', role: 'KEPALA_DIVISI', phone: '+628110000002', avatarColor: '#7c3aed' },
  { email: 'adminpt@karya.co.id', name: 'Bpk. Budi Santoso', role: 'ADMIN_PT', phone: '+628110000003', avatarColor: '#2563eb' },
  { email: 'direktur@karya.co.id', name: 'Bpk. Andi Kurniawan', role: 'DIREKTUR_ENTITAS', phone: '+628110000004', avatarColor: '#ea580c' },
  { email: 'sdmga@karya.co.id', name: 'Ibu Ratna Sari', role: 'DIREKTUR_SDM_GA', phone: '+628110000005', avatarColor: '#db2777' },
  { email: 'it@karya.co.id', name: 'Bpk. Rudi Santoso', role: 'TI', phone: '+628110000006', avatarColor: '#4f46e5' },
  { email: 'manajemen@karya.co.id', name: 'Bpk. Hartono Wijaya', role: 'MANAJEMEN', phone: '+628110000007', avatarColor: '#16a34a' },
]

async function main() {
  if (!PASSWORD || PASSWORD.length < 8) {
    throw new Error('SEED_PASSWORD is missing or shorter than 8 characters — set it in .env')
  }

  // Sejak seed 7 Sep 2026 akun demo sudah ditanam oleh seed itu sendiri; skrip
  // ini tinggal alat perbaikan bila akunnya terhapus. Rumahnya PT Sigma.
  const pt = await db.entity.findUnique({ where: { code: 'PT-SIGMA' } })
  if (!pt) throw new Error('Entitas PT-SIGMA tidak ditemukan — jalankan seed terlebih dahulu.')

  // Walk up to the sub-holding so the Direktur account covers several PTs.
  let subHolding = pt
  while (subHolding.parentId && subHolding.type !== 'SUB_HOLDING') {
    const parent = await db.entity.findUnique({ where: { id: subHolding.parentId } })
    if (!parent) break
    subHolding = parent
  }

  const scopeFor = (role: string) => {
    if (role === 'PIC_PROYEK' || role === 'KEPALA_DIVISI' || role === 'ADMIN_PT') return pt.id
    if (role === 'DIREKTUR_ENTITAS') return subHolding.id
    return null // group-wide roles
  }

  const passwordHash = await hashPassword(PASSWORD)
  const created: Record<string, string> = {}

  for (const spec of SPECS) {
    const data = {
      name: spec.name,
      role: spec.role,
      phone: spec.phone,
      avatarColor: spec.avatarColor,
      scopeEntityId: scopeFor(spec.role),
      isActive: true,
      passwordHash,
    }
    const user = await db.user.upsert({
      where: { email: spec.email },
      update: data,
      create: { email: spec.email, ...data },
    })
    created[spec.role] = user.id
  }

  // The PIC owns every active project of PT-001.
  const projects = await db.project.findMany({ where: { entityId: pt.id }, select: { id: true } })
  await db.project.updateMany({
    where: { id: { in: projects.map((p) => p.id) } },
    data: { picUserId: created.PIC_PROYEK, picName: SPECS[0].name },
  })

  // The head of division takes the first division of PT-001.
  const division = await db.division.findFirst({
    where: { entityId: pt.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
  if (division) {
    await db.division.update({
      where: { id: division.id },
      data: { headUserId: created.KEPALA_DIVISI },
    })
  }

  await db.auditLog.create({
    data: {
      actorId: created.TI,
      action: 'SEED_DEMO_ACCOUNTS',
      targetType: 'USER',
      targetId: 'demo',
      afterData: JSON.stringify({ roles: SPECS.map((s) => s.role) }),
    },
  })

  console.log('✅ Akun demo siap (kata sandi: SEED_PASSWORD di .env)\n')
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(pad('PERAN', 20), pad('EMAIL', 26), 'CAKUPAN')
  for (const spec of SPECS) {
    const scope =
      scopeFor(spec.role) === pt.id
        ? pt.name
        : scopeFor(spec.role) === subHolding.id
          ? subHolding.name
          : 'Seluruh grup'
    console.log(pad(spec.role, 20), pad(spec.email, 26), scope)
  }
  console.log(`\nPIC memegang ${projects.length} proyek di ${pt.name}.`)
  if (division) console.log(`Kepala Divisi memimpin divisi "${division.name}".`)
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error('❌ Gagal:', e instanceof Error ? e.message : e)
    await db.$disconnect()
    process.exit(1)
  })
