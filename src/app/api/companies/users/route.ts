import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { ENTITY_ROLES, canManageAccounts, canManageAllAccounts, manageableRoles } from '@/lib/rbac'
import { MIN_PASSWORD, USERNAME_RE, assignPosition, createAccount, isKnownRole, isValidEmail, readPosition } from '@/lib/companies'

/**
 * Akun & posisi — meja Super Admin (10 Sep 2026), dan sejak 5 Okt 2026 juga
 * Admin PT untuk PT-nya sendiri.
 *
 *   POST   — tambah akun untuk sebuah perusahaan (entityId) atau tingkat holding (null)
 *   PATCH  — ubah nama, username, email, jabatan, peran, perusahaan, status aktif,
 *            tautan divisi/proyek; `password` menyetel ulang kata sandi
 *   DELETE ?id= — hapus akun
 *
 * Pagarnya: akun sendiri tidak bisa dinonaktifkan/dihapus, Super Admin aktif
 * terakhir tidak bisa diturunkan/dinonaktifkan/dihapus, dan pemegang meja
 * terbatas (Admin PT) hanya menyentuh akun di PT-nya dengan posisi
 * ADMIN_PT / KEPALA_DIVISI / PIC_PROYEK — Direktur Entitas dan akun tingkat
 * grup tetap milik Super Admin, supaya tak seorang pun bisa membuat
 * penyetujunya sendiri.
 */

function forbid(message = 'Peran Anda tidak mengelola akun') {
  return NextResponse.json({ error: message }, { status: 403 })
}

type Desk = { full: boolean; roles: readonly string[]; entityId: string | null }

/** Sejauh mana akun yang sedang masuk boleh memakai meja akun. */
function desk(user: { role: string; scopeEntityId: string | null }): Desk | null {
  if (!canManageAccounts(user.role)) return null
  if (canManageAllAccounts(user.role)) return { full: true, roles: manageableRoles(user.role), entityId: null }
  if (!user.scopeEntityId) return null
  return { full: false, roles: manageableRoles(user.role), entityId: user.scopeEntityId }
}

/** Pesan tunggal untuk posisi di luar wewenang meja terbatas. */
function roleOutOfReach(role: string) {
  return NextResponse.json(
    { error: `Posisi ${role === 'DIREKTUR_ENTITAS' ? 'Direktur Perusahaan' : role} hanya dapat dikelola Super Admin.` },
    { status: 403 }
  )
}

async function entityRef(id: string | null) {
  if (!id) return null
  const e = await db.entity.findFirst({ where: { id, type: { in: ['HOLDING', 'PT'] } }, select: { id: true, code: true, name: true } })
  if (!e) throw new Error('Perusahaan tidak ditemukan.')
  return e
}

async function lastSuperadmin(excludeId: string): Promise<boolean> {
  const others = await db.user.count({ where: { role: 'SUPERADMIN', isActive: true, id: { not: excludeId } } })
  return others === 0
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const access = desk(user)
  if (!access) return forbid()

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  // Meja terbatas selalu menempatkan akun baru di PT pemiliknya.
  const entityId = access.full ? (typeof body.entityId === 'string' && body.entityId ? body.entityId : null) : access.entityId
  if (!access.full && typeof body.entityId === 'string' && body.entityId && body.entityId !== access.entityId) {
    return forbid('Anda hanya dapat menambah akun di perusahaan Anda sendiri.')
  }
  try {
    const entity = await entityRef(entityId)
    const p = readPosition(body, { holding: entity === null || (await db.entity.count({ where: { id: entityId!, type: 'HOLDING' } })) > 0 })
    if (typeof p === 'string') return NextResponse.json({ error: p }, { status: 422 })
    if (!entity && (ENTITY_ROLES as readonly string[]).includes(p.role)) {
      return NextResponse.json({ error: 'Posisi ini harus ditempatkan di sebuah perusahaan.' }, { status: 422 })
    }
    if (!access.roles.includes(p.role)) return roleOutOfReach(p.role)

    const account = await db.$transaction(async (tx) => {
      const created = await createAccount(tx, entity, p)
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CREATE_ACCOUNT',
          targetType: 'USER',
          targetId: created.id,
          afterData: JSON.stringify({ username: created.username, role: created.role, entity: entity?.code ?? null }),
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        },
      })
      return created
    })
    return NextResponse.json({ ok: true, account })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal menambah akun' }, { status: 422 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const access = desk(user)
  if (!access) return forbid()

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })

  if (!access.full) {
    if (existing.scopeEntityId !== access.entityId) return forbid('Akun ini bukan di perusahaan Anda.')
    if (!access.roles.includes(existing.role)) return roleOutOfReach(existing.role)
    if (typeof body.entityId === 'string' && body.entityId !== access.entityId) {
      return forbid('Anda tidak dapat memindahkan akun ke perusahaan lain.')
    }
    if (typeof body.role === 'string' && !access.roles.includes(body.role)) return roleOutOfReach(body.role)
    if (id === user.id && typeof body.role === 'string' && body.role !== existing.role) {
      return forbid('Anda tidak dapat mengubah posisi akun sendiri.')
    }
  }

  const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : undefined)
  const data: Record<string, unknown> = {}
  const audit: Record<string, unknown> = {}

  const name = s('name')
  if (name !== undefined) {
    if (!name) return NextResponse.json({ error: 'Nama wajib diisi.' }, { status: 422 })
    data.name = name
    audit.name = name
  }
  const username = s('username')?.toLowerCase()
  if (username !== undefined && username !== existing.username) {
    if (!USERNAME_RE.test(username)) return NextResponse.json({ error: 'Username tidak valid: 3–32 huruf kecil/angka, boleh titik, garis bawah, atau strip.' }, { status: 422 })
    const clash = await db.user.findUnique({ where: { username }, select: { id: true } })
    if (clash) return NextResponse.json({ error: `Username "${username}" sudah dipakai.` }, { status: 422 })
    data.username = username
    audit.username = username
  }
  const email = s('email')?.toLowerCase()
  if (email !== undefined && email !== existing.email) {
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Email tidak valid.' }, { status: 422 })
    const clash = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (clash) return NextResponse.json({ error: `Email "${email}" sudah dipakai.` }, { status: 422 })
    data.email = email
    audit.email = email
  }
  if (body.title !== undefined) data.title = s('title') || null
  if (body.phone !== undefined) data.phone = s('phone') || null
  if (typeof body.avatarColor === 'string' && /^#[0-9a-f]{6}$/i.test(body.avatarColor)) data.avatarColor = body.avatarColor

  const role = s('role')
  if (role !== undefined && role !== existing.role) {
    if (!isKnownRole(role)) return NextResponse.json({ error: 'Peran tidak dikenali.' }, { status: 422 })
    if (existing.role === 'SUPERADMIN' && (await lastSuperadmin(id))) {
      return NextResponse.json({ error: 'Ini Super Admin aktif terakhir; angkat Super Admin lain dulu.' }, { status: 409 })
    }
    data.role = role
    audit.role = role
  }

  if (body.entityId !== undefined) {
    const entityId = typeof body.entityId === 'string' && body.entityId ? body.entityId : null
    try {
      await entityRef(entityId)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Perusahaan tidak ditemukan' }, { status: 422 })
    }
    data.scopeEntityId = entityId
    audit.entityId = entityId
  }

  if (typeof body.isActive === 'boolean' && body.isActive !== existing.isActive) {
    if (!body.isActive) {
      if (id === user.id) return NextResponse.json({ error: 'Anda tidak bisa menonaktifkan akun sendiri.' }, { status: 409 })
      if (existing.role === 'SUPERADMIN' && (await lastSuperadmin(id))) {
        return NextResponse.json({ error: 'Ini Super Admin aktif terakhir; angkat Super Admin lain dulu.' }, { status: 409 })
      }
    }
    data.isActive = body.isActive
    audit.isActive = body.isActive
  }

  const password = s('password')
  if (password !== undefined && password !== '') {
    if (password.length < MIN_PASSWORD) return NextResponse.json({ error: `Kata sandi minimal ${MIN_PASSWORD} karakter.` }, { status: 422 })
    data.passwordHash = await hashPassword(password)
    audit.passwordReset = true
  }

  const finalRole = (data.role as string | undefined) ?? existing.role
  const finalEntityId = (data.scopeEntityId as string | null | undefined) ?? existing.scopeEntityId
  const wantsLink = body.divisionId !== undefined || body.divisionName !== undefined || body.projectId !== undefined || body.projectName !== undefined

  try {
    const result = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: { id: true, name: true, username: true, email: true, role: true, title: true, isActive: true, scopeEntityId: true },
      })
      let link: { divisionId?: string; projectId?: string } = {}
      if (wantsLink && finalEntityId) {
        const entity = await tx.entity.findUnique({ where: { id: finalEntityId }, select: { id: true, code: true, name: true } })
        if (entity) {
          // Lepas tautan lama dulu supaya satu orang tidak memimpin dua divisi tanpa sengaja.
          if (finalRole === 'KEPALA_DIVISI') await tx.division.updateMany({ where: { headUserId: id }, data: { headUserId: null } })
          link = await assignPosition(tx, { id, name: updated.name, role: finalRole }, entity, {
            divisionId: s('divisionId') || null,
            divisionName: s('divisionName') || null,
            projectId: s('projectId') || null,
            projectName: s('projectName') || null,
          })
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: audit.passwordReset && Object.keys(audit).length === 1 ? 'RESET_PASSWORD' : 'UPDATE_ACCOUNT',
          targetType: 'USER',
          targetId: id,
          beforeData: JSON.stringify({ name: existing.name, username: existing.username, role: existing.role, isActive: existing.isActive }),
          afterData: JSON.stringify(audit),
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        },
      })
      return { ...updated, ...link }
    })
    return NextResponse.json({ ok: true, account: result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal mengubah akun' }, { status: 422 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const access = desk(user)
  if (!access) return forbid()

  const id = req.nextUrl.searchParams.get('id') || ''
  const existing = await db.user.findUnique({
    where: { id },
    select: { id: true, username: true, name: true, role: true, scopeEntityId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })
  if (!access.full) {
    if (existing.scopeEntityId !== access.entityId) return forbid('Akun ini bukan di perusahaan Anda.')
    if (!access.roles.includes(existing.role)) return roleOutOfReach(existing.role)
  }
  if (id === user.id) return NextResponse.json({ error: 'Anda tidak bisa menghapus akun sendiri.' }, { status: 409 })
  if (existing.role === 'SUPERADMIN' && (await lastSuperadmin(id))) {
    return NextResponse.json({ error: 'Ini Super Admin aktif terakhir; angkat Super Admin lain dulu.' }, { status: 409 })
  }

  await db.$transaction(async (tx) => {
    // Relasi ke akun ini bersifat opsional di skema, jadi baris laporannya
    // tetap ada dengan penulis kosong; hanya tautan pimpinannya yang dilepas.
    await tx.division.updateMany({ where: { headUserId: id }, data: { headUserId: null } })
    await tx.project.updateMany({ where: { picUserId: id }, data: { picUserId: null } })
    await tx.user.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'DELETE_ACCOUNT',
        targetType: 'USER',
        targetId: id,
        beforeData: JSON.stringify({ username: existing.username, name: existing.name, role: existing.role }),
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      },
    })
  })

  return NextResponse.json({ ok: true })
}
