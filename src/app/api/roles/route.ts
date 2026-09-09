import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isGlobalRole, requireApiUser } from '@/lib/auth'

// Role display labels
const ROLE_LABELS: Record<string, string> = {
  ADMIN_PT: 'Admin PT',
  KEPALA_DIVISI: 'Kepala Divisi',
  PIC_PROYEK: 'PIC Proyek',
  DIREKTUR_ENTITAS: 'Direktur Entitas',
  DIREKTUR_SDM_GA: 'Direktur SDM & GA',
  MANAJEMEN: 'Manajemen',
  TI: 'TI',
  SUPERADMIN: 'Super Admin',
  AUDITOR: 'Auditor',
}

// Preferred ordering of roles in the response
const ROLE_ORDER = [
  'ADMIN_PT',
  'KEPALA_DIVISI',
  'PIC_PROYEK',
  'DIREKTUR_ENTITAS',
  'DIREKTUR_SDM_GA',
  'MANAJEMEN',
  'TI',
  'SUPERADMIN',
  'AUDITOR',
]

// GET /api/roles - users grouped by role (user directory; global roles only)
export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    // The directory lists every account's name and email, so keep it to the
    // roles that are meant to see the whole group.
    if (!isGlobalRole(user.role)) {
      return NextResponse.json({ error: 'Tidak diizinkan' }, { status: 403 })
    }
    const users = await db.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        scopeEntityId: true,
        avatarColor: true,
        lastLoginAt: true,
      },
      orderBy: { name: 'asc' },
    })

    const byRole = new Map<string, typeof users>()
    for (const u of users) {
      const arr = byRole.get(u.role) ?? []
      arr.push(u)
      byRole.set(u.role, arr)
    }

    const rolesPresent = Array.from(byRole.keys())
    const orderedRoles = [
      ...ROLE_ORDER.filter((r) => rolesPresent.includes(r)),
      ...rolesPresent.filter((r) => !ROLE_ORDER.includes(r)),
    ]

    const roles = orderedRoles.map((role) => ({
      role,
      label: ROLE_LABELS[role] ?? role,
      users: byRole.get(role) ?? [],
    }))

    return NextResponse.json({ roles })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
