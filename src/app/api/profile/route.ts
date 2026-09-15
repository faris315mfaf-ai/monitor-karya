import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/constants'

/**
 * Profil akun yang sedang masuk, untuk panel Pengaturan (7 Sep 2026):
 * siapa saya, peran apa, di PT / proyek / divisi mana.
 *
 *   GET   — profil + penempatan
 *   PATCH { name?, phone? } — hanya nama tampilan dan nomor telepon; peran
 *           dan penempatan diatur TI, bukan oleh pemilik akun.
 */
export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const [row, entity, projects, divisions] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { phone: true, lastLoginAt: true, createdAt: true },
    }),
    user.scopeEntityId
      ? db.entity.findUnique({
          where: { id: user.scopeEntityId },
          select: { id: true, name: true, code: true, type: true, logoData: true },
        })
      : Promise.resolve(null),
    user.role === 'PIC_PROYEK'
      ? db.project.findMany({
          where: { picUserId: user.id, lifecycle: 'AKTIF' },
          select: { id: true, code: true, name: true, phase: true },
          orderBy: { code: 'asc' },
        })
      : Promise.resolve([]),
    user.role === 'KEPALA_DIVISI'
      ? db.division.findMany({
          where: { headUserId: user.id, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ])

  // Holding di atas PT (inisiator sistem), supaya panel bisa menunjukkan
  // "PT Sigma · PT. BIKE Tbk" lengkap dengan logonya. Akun yang ditempatkan
  // langsung di holding memakai entitasnya sendiri.
  const holding =
    entity?.type === 'HOLDING'
      ? entity
      : await db.entity.findFirst({
          where: { type: 'HOLDING', isActive: true },
          select: { id: true, name: true, code: true, type: true, logoData: true },
          orderBy: { createdAt: 'asc' },
        })

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: row?.phone ?? null,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] ?? user.role,
    avatarColor: user.avatarColor,
    entity,
    holding: holding?.name ?? null,
    holdingBrand: holding ? { id: holding.id, name: holding.name, logoData: holding.logoData } : null,
    projects,
    divisions,
    lastLoginAt: row?.lastLoginAt ?? null,
    memberSince: row?.createdAt ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const data: { name?: string; phone?: string | null } = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: 'Nama harus 2–80 karakter' }, { status: 422 })
    }
    data.name = name
  }
  if (typeof body.phone === 'string') {
    const phone = body.phone.trim()
    if (phone && !/^\+?[0-9\s-]{8,20}$/.test(phone)) {
      return NextResponse.json({ error: 'Nomor telepon tidak valid' }, { status: 422 })
    }
    data.phone = phone || null
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada yang diubah' }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: { name: true, phone: true },
  })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'UPDATE_PROFILE',
      targetType: 'USER',
      targetId: user.id,
      beforeData: JSON.stringify({ name: user.name }),
      afterData: JSON.stringify(data),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  return NextResponse.json({ ok: true, ...updated })
}
