import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { ENTITY_ROLES } from '@/lib/rbac'
import { accountDesk as desk, deskReachError, entityRef, isLastSuperadmin as lastSuperadmin, roleOutOfReachMessage } from '@/lib/account-desk'
import { passwordProblem } from '@/lib/password-policy'
import { USERNAME_RE, assignPosition, createAccount, isKnownRole, isValidEmail, readPosition } from '@/lib/companies'
import { clientErrorMessage } from '@/lib/api-error'

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

/** Pesan tunggal untuk posisi di luar wewenang meja terbatas. Aturan meja ada di src/lib/account-desk.ts. */
function roleOutOfReach(role: string) {
  return NextResponse.json({ error: roleOutOfReachMessage(role) }, { status: 403 })
}

/**
 * [F2-ADMIN] Keanggotaan divisi (User.divisionId) — dikirim sebagai
 * `memberDivisionId` karena `divisionId` di rute ini berarti divisi yang
 * DIPIMPIN kepala divisi. '' / null = lepas dari divisi. Divisi harus aktif
 * di PT akun itu. Mengembalikan id, null, atau pesan galat.
 */
async function readMemberDivision(raw: unknown, entityId: string | null): Promise<string | null | { error: string }> {
  if (raw === null || raw === '') return null
  if (typeof raw !== 'string' || raw.length > 64) return { error: 'Divisi tidak valid.' }
  if (!entityId) return { error: 'Akun tingkat grup tidak menjadi anggota divisi.' }
  const d = await db.division.findFirst({ where: { id: raw, entityId, isActive: true }, select: { id: true } })
  return d ? d.id : { error: 'Divisi itu bukan divisi aktif di perusahaan akun ini.' }
}

/** GET ?id= — [F2-ADMIN] keanggotaan divisi satu akun untuk sheet akun (meja akun saja). */
export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const access = desk(user)
  if (!access) return forbid()
  const id = (req.nextUrl.searchParams.get('id') || '').slice(0, 64)
  const row = id ? await db.user.findUnique({ where: { id }, select: { id: true, scopeEntityId: true, divisionId: true } }) : null
  if (!row || (!access.full && row.scopeEntityId !== access.entityId)) return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })
  return NextResponse.json({ id: row.id, memberDivisionId: row.divisionId })
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
    const member = body.memberDivisionId === undefined ? undefined : await readMemberDivision(body.memberDivisionId, entity?.id ?? null)
    if (member && typeof member === 'object') return NextResponse.json({ error: member.error }, { status: 422 })

    const account = await db.$transaction(async (tx) => {
      const created = await createAccount(tx, entity, p)
      if (typeof member === 'string') await tx.user.update({ where: { id: created.id }, data: { divisionId: member } }) // [F2-ADMIN]
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CREATE_ACCOUNT',
          targetType: 'USER',
          targetId: created.id,
          afterData: JSON.stringify({ username: created.username, role: created.role, entity: entity?.code ?? null, ...(typeof member === 'string' ? { memberDivisionId: member } : {}) }),
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        },
      })
      return created
    })
    return NextResponse.json({ ok: true, account })
  } catch (err) {
    return NextResponse.json({ error: clientErrorMessage(err, 'Gagal menambah akun. Coba lagi.', 'companies/users POST') }, { status: 422 })
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

  const refusal = deskReachError(access, user.id, existing, {
    role: typeof body.role === 'string' ? body.role : undefined,
    entityId: typeof body.entityId === 'string' ? body.entityId : undefined,
  })
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status })
  // Meja terbatas tidak boleh melepas akun dari PT-nya (entityId null/kosong
  // = tingkat holding, di luar jangkauan Admin PT) — 6 Okt 2026.
  if (!access.full && body.entityId !== undefined && body.entityId !== access.entityId) {
    return forbid('Anda tidak dapat memindahkan akun ke perusahaan lain.')
  }

  const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, 500) : undefined)
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
      return NextResponse.json({ error: clientErrorMessage(err, 'Perusahaan tidak ditemukan', 'companies/users PATCH') }, { status: 422 })
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
    const problem = passwordProblem(password)
    if (problem) return NextResponse.json({ error: problem }, { status: 422 })
    data.passwordHash = await hashPassword(password)
    // F1-C: kata sandi yang disetel admin untuk orang lain wajib diganti pemiliknya saat masuk.
    if (id !== user.id) data.mustChangePassword = true
    audit.passwordReset = true
  }

  const finalRole = (data.role as string | undefined) ?? existing.role
  const finalEntityId = (data.scopeEntityId as string | null | undefined) ?? existing.scopeEntityId
  // [F2-ADMIN] keanggotaan divisi; pindah PT melepas keanggotaan lama.
  if (body.memberDivisionId !== undefined) {
    const member = await readMemberDivision(body.memberDivisionId, data.scopeEntityId !== undefined ? (data.scopeEntityId as string | null) : existing.scopeEntityId)
    if (member && typeof member === 'object') return NextResponse.json({ error: member.error }, { status: 422 })
    if (member !== existing.divisionId) {
      data.divisionId = member
      audit.memberDivisionId = member
    }
  } else if (data.scopeEntityId !== undefined && data.scopeEntityId !== existing.scopeEntityId && existing.divisionId) {
    data.divisionId = null
    audit.memberDivisionId = null
  }
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
          beforeData: JSON.stringify({ name: existing.name, username: existing.username, role: existing.role, isActive: existing.isActive, memberDivisionId: existing.divisionId }),
          afterData: JSON.stringify(audit),
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        },
      })
      return { ...updated, ...link }
    })
    return NextResponse.json({ ok: true, account: result })
  } catch (err) {
    return NextResponse.json({ error: clientErrorMessage(err, 'Gagal mengubah akun. Coba lagi.', 'companies/users PATCH') }, { status: 422 })
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
