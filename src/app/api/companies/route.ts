import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { can, canManageAccounts, canManageAllAccounts, manageableRoles } from '@/lib/rbac'
import { createAccount, isValidEmail, parseLogo, readPosition, slugify, uniqueEntityCode, type PositionInput } from '@/lib/companies'
import { clientErrorMessage } from '@/lib/api-error'

/**
 * Perusahaan & akun — meja Super Admin (10 Sep 2026); sejak 5 Okt 2026 Admin PT
 * membuka versi terbatasnya: hanya PT-nya sendiri dan akun di dalamnya.
 * Menambah/mengubah perusahaan tetap milik Super Admin.
 *
 *   GET            — holding & anak perusahaan beserta akun, divisi, proyek, dan jumlah datanya
 *   POST           — tambah perusahaan (identitas, logo) sekaligus posisi/akun pertamanya
 *   PATCH  { id }  — ubah identitas, logo, induk, atau status aktif
 *   DELETE ?id=    — hapus perusahaan yang belum punya data laporan
 */

function forbid(message = 'Hanya Super Admin yang mengelola perusahaan & akun') {
  return NextResponse.json({ error: message }, { status: 403 })
}

const USER_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  title: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  avatarColor: true,
  passwordHash: true,
  scopeEntityId: true,
} as const

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!canManageAccounts(user.role)) return forbid('Peran Anda tidak mengelola akun')

  // Admin PT hanya melihat PT-nya sendiri; Super Admin melihat seluruh grup.
  const full = canManageAllAccounts(user.role)
  if (!full && !user.scopeEntityId) return forbid('Akun Anda belum ditempatkan di sebuah perusahaan')
  const entityScope = full ? {} : { entityId: user.scopeEntityId! }

  const [entities, users, divisions, projects, daily, weekly] = await Promise.all([
    db.entity.findMany({
      where: full ? { type: { in: ['HOLDING', 'PT'] } } : { id: user.scopeEntityId! },
      select: {
        id: true, code: true, name: true, type: true, parentId: true, logoData: true, address: true, phone: true,
        email: true, website: true, isActive: true, createdAt: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    }),
    db.user.findMany({
      where: full ? {} : { scopeEntityId: user.scopeEntityId! },
      select: USER_SELECT,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    }),
    db.division.findMany({
      where: { isActive: true, ...entityScope },
      select: { id: true, entityId: true, name: true, headUserId: true, headUser: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    db.project.findMany({
      where: { lifecycle: { in: ['DIUSULKAN', 'AKTIF'] }, ...entityScope },
      select: { id: true, entityId: true, code: true, name: true, lifecycle: true, picUserId: true, picUser: { select: { name: true } } },
      orderBy: { code: 'asc' },
    }),
    db.dailyProjectReport.groupBy({ by: ['entityId'], _count: { _all: true } }),
    db.weeklyDivisionReport.groupBy({ by: ['entityId'], _count: { _all: true } }),
  ])

  const dailyBy = new Map(daily.map((d) => [d.entityId, d._count._all]))
  const weeklyBy = new Map(weekly.map((w) => [w.entityId, w._count._all]))
  const nameOf = new Map(entities.map((e) => [e.id, e.name]))

  const shape = (u: (typeof users)[number]) => {
    const { passwordHash, ...rest } = u
    const division = divisions.find((d) => d.headUserId === u.id)
    const project = projects.find((p) => p.picUserId === u.id)
    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
      divisionId: division?.id ?? null,
      divisionName: division?.name ?? null,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
    }
  }

  // Holding-order first, then the subsidiaries by name.
  const sorted = [...entities].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'HOLDING' ? -1 : 1))

  return NextResponse.json({
    companies: sorted.map((e) => ({
      ...e,
      parentName: e.parentId ? (nameOf.get(e.parentId) ?? null) : null,
      users: users.filter((u) => u.scopeEntityId === e.id).map(shape),
      divisions: divisions.filter((d) => d.entityId === e.id).map((d) => ({ id: d.id, name: d.name, headUserId: d.headUserId, headName: d.headUser?.name ?? null })),
      projects: projects.filter((p) => p.entityId === e.id).map((p) => ({ id: p.id, code: p.code, name: p.name, lifecycle: p.lifecycle, picUserId: p.picUserId, picName: p.picUser?.name ?? null })),
      counts: {
        users: users.filter((u) => u.scopeEntityId === e.id).length,
        divisions: divisions.filter((d) => d.entityId === e.id).length,
        projects: projects.filter((p) => p.entityId === e.id).length,
        dailyReports: dailyBy.get(e.id) ?? 0,
        weeklyReports: weeklyBy.get(e.id) ?? 0,
      },
    })),
    holdingUsers: full ? users.filter((u) => !u.scopeEntityId).map(shape) : [],
    totals: { companies: entities.length, users: users.length, divisions: divisions.length, projects: projects.length },
    me: user.id,
    // Seberapa jauh meja ini boleh dipakai pemiliknya.
    scope: full ? 'ALL' : 'ENTITY',
    canManageCompanies: full,
    manageableRoles: [...manageableRoles(user.role)],
  })
}

function readIdentity(body: Record<string, unknown>) {
  const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, 500) : '')
  const email = s('email')
  if (email && !isValidEmail(email)) return { error: 'Email perusahaan tidak valid.' }
  const website = s('website')
  return {
    value: {
      address: s('address') || null,
      phone: s('phone') || null,
      email: email || null,
      website: website ? (/^https?:\/\//.test(website) ? website : `https://${website}`) : null,
    },
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'companies:manage')) return forbid()

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 2) return NextResponse.json({ error: 'Nama perusahaan wajib diisi.' }, { status: 422 })
  const isHolding = body.isHolding === true
  const identity = readIdentity(body)
  if ('error' in identity) return NextResponse.json({ error: identity.error }, { status: 422 })
  const logo = parseLogo(body.logoData)
  if (!logo.ok) return NextResponse.json({ error: logo.error }, { status: 422 })

  const positionsRaw = Array.isArray(body.positions) ? body.positions : []
  const positions: PositionInput[] = []
  for (const raw of positionsRaw) {
    const p = readPosition(raw, { holding: isHolding })
    if (typeof p === 'string') return NextResponse.json({ error: p }, { status: 422 })
    positions.push(p)
  }
  const usernames = positions.map((p) => p.username)
  if (new Set(usernames).size !== usernames.length) {
    return NextResponse.json({ error: 'Ada username yang sama di daftar posisi.' }, { status: 422 })
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // Induk: holding yang dipilih, atau holding pertama yang aktif.
      let parent: { id: string; path: string } | null = null
      if (!isHolding) {
        const requested = typeof body.parentId === 'string' && body.parentId ? body.parentId : null
        parent = requested
          ? await tx.entity.findFirst({ where: { id: requested, type: 'HOLDING' }, select: { id: true, path: true } })
          : await tx.entity.findFirst({ where: { type: 'HOLDING', isActive: true }, select: { id: true, path: true }, orderBy: { createdAt: 'asc' } })
        if (!parent) throw new Error('Holding induk tidak ditemukan. Buat holding terlebih dahulu.')
      }

      const slug = slugify(name.replace(/^(pt|holding)\s+/i, '')) || slugify(name) || 'baru'
      const requestedCode = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
      const base = requestedCode && /^[A-Z0-9-]{2,32}$/.test(requestedCode)
        ? requestedCode
        : isHolding
          ? `HOLDING-${slug.toUpperCase()}`
          : `PT-${slug.toUpperCase()}`
      const code = await uniqueEntityCode(tx, base)
      const path = isHolding ? `/${slug}/` : `${parent!.path}${code}/`

      const entity = await tx.entity.create({
        data: {
          type: isHolding ? 'HOLDING' : 'PT',
          parentId: parent?.id ?? null,
          code,
          name,
          path,
          ...identity.value,
          logoData: logo.value ?? null,
        },
        select: { id: true, code: true, name: true },
      })

      const accounts: Awaited<ReturnType<typeof createAccount>>[] = []
      for (const p of positions) accounts.push(await createAccount(tx, entity, p))

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CREATE_COMPANY',
          targetType: 'ENTITY',
          targetId: entity.id,
          afterData: JSON.stringify({ code, name, type: isHolding ? 'HOLDING' : 'PT', accounts: accounts.map((a) => a.username) }),
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        },
      })
      return { entity, accounts }
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: clientErrorMessage(err, 'Gagal menambah perusahaan. Coba lagi.', 'companies POST') }, { status: 422 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'companies:manage')) return forbid()

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id : ''
  const existing = await db.entity.findUnique({ where: { id } })
  if (!existing || !['HOLDING', 'PT'].includes(existing.type)) {
    return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (name.length < 2) return NextResponse.json({ error: 'Nama perusahaan wajib diisi.' }, { status: 422 })
    data.name = name
  }
  const identity = readIdentity({ ...body })
  if ('error' in identity) return NextResponse.json({ error: identity.error }, { status: 422 })
  for (const k of ['address', 'phone', 'email', 'website'] as const) {
    if (body[k] !== undefined) data[k] = identity.value[k]
  }
  const logo = parseLogo(body.logoData)
  if (!logo.ok) return NextResponse.json({ error: logo.error }, { status: 422 })
  if (logo.value !== undefined) data.logoData = logo.value
  if (typeof body.region === 'string') data.region = body.region.trim() || null
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive

  const updated = await db.entity.update({ where: { id }, data, select: { id: true, name: true, code: true, isActive: true } })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'UPDATE_COMPANY',
      targetType: 'ENTITY',
      targetId: id,
      beforeData: JSON.stringify({ name: existing.name, isActive: existing.isActive }),
      afterData: JSON.stringify({ ...data, logoData: data.logoData === undefined ? undefined : data.logoData ? '(logo)' : null }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  return NextResponse.json({ ok: true, entity: updated })
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'companies:manage')) return forbid()

  const id = req.nextUrl.searchParams.get('id') || ''
  const existing = await db.entity.findUnique({ where: { id }, select: { id: true, name: true, code: true, type: true } })
  if (!existing || !['HOLDING', 'PT'].includes(existing.type)) {
    return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })
  }
  if (user.scopeEntityId === id) {
    return NextResponse.json({ error: 'Anda tidak bisa menghapus perusahaan tempat akun Anda sendiri terdaftar.' }, { status: 409 })
  }

  const [children, daily, weekly, progress, tasks, escalations] = await Promise.all([
    db.entity.count({ where: { parentId: id } }),
    db.dailyProjectReport.count({ where: { entityId: id } }),
    db.weeklyDivisionReport.count({ where: { entityId: id } }),
    db.projectProgressReport.count({ where: { entityId: id } }),
    db.task.count({ where: { entityId: id } }),
    db.escalation.count({ where: { entityId: id } }),
  ])
  if (children > 0) {
    return NextResponse.json({ error: 'Holding ini masih punya anak perusahaan. Pindahkan atau hapus dulu anak perusahaannya.' }, { status: 409 })
  }
  const activity = daily + weekly + progress + tasks + escalations
  if (activity > 0) {
    return NextResponse.json(
      { error: `Perusahaan ini sudah punya ${activity} data laporan/task. Nonaktifkan saja agar riwayatnya tetap utuh.` },
      { status: 409 }
    )
  }

  await db.$transaction(async (tx) => {
    await tx.adminAppointment.deleteMany({ where: { entityId: id } })
    await tx.kpiSnapshot.deleteMany({ where: { entityId: id } })
    await tx.project.deleteMany({ where: { entityId: id } })
    await tx.division.deleteMany({ where: { entityId: id } })
    await tx.user.deleteMany({ where: { scopeEntityId: id, role: { not: 'SUPERADMIN' } } })
    await tx.user.updateMany({ where: { scopeEntityId: id }, data: { scopeEntityId: null } })
    await tx.entity.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'DELETE_COMPANY',
        targetType: 'ENTITY',
        targetId: id,
        beforeData: JSON.stringify({ code: existing.code, name: existing.name }),
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      },
    })
  })

  return NextResponse.json({ ok: true })
}
