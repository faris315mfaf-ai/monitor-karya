import 'server-only'

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/constants'

/**
 * Pengaju permintaan akses dari layar Kepala divisi dan PIC proyek [F2-ADMIN]
 * (04-admin-pt.md "Perubahan peran/akses selalu lewat permintaan yang
 * disetujui"). Pemutusnya tetap Admin PT / Super Admin / TI di
 * /api/access-requests; berkas ini hanya membatasi apa yang boleh diajukan
 * oleh peran pelapor supaya mereka tidak bisa menyasar akun di luar timnya.
 *
 *  - Kepala divisi: anggota & PIC proyek divisi yang ia pimpin, dan dirinya.
 *  - PIC proyek: dirinya dan anggota divisinya sendiri.
 *  - Peran yang boleh diminta: PIC proyek dan Kepala divisi (posisi yang
 *    berada dalam meja akun Admin PT).
 */

export const LIMITED_REQUESTERS = new Set(['KEPALA_DIVISI', 'PIC_PROYEK'])
export const REQUESTABLE_ROLES = ['PIC_PROYEK', 'KEPALA_DIVISI'] as const

export type RequesterOptions = {
  entity: { id: string; name: string } | null
  divisions: { id: string; name: string }[]
  /** Akun yang boleh disasar; hanya nama, label peran, divisi, dan status aktif. */
  users: { id: string; name: string; role: string; roleLabel: string; divisionName: string | null; isActive: boolean; isSelf: boolean }[]
  roles: { role: string; label: string }[]
}

export async function requesterOptions(user: SessionUser): Promise<RequesterOptions> {
  const entityId = user.scopeEntityId
  if (!entityId) return { entity: null, divisions: [], users: [], roles: [] }
  const entity = await db.entity.findUnique({ where: { id: entityId }, select: { id: true, name: true } })

  let divisions: { id: string; name: string }[]
  if (user.role === 'KEPALA_DIVISI') {
    divisions = await db.division.findMany({ where: { headUserId: user.id, isActive: true, entityId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  } else if (user.role === 'PIC_PROYEK') {
    const me = await db.user.findUnique({ where: { id: user.id }, select: { division: { select: { id: true, name: true, isActive: true, entityId: true } } } })
    divisions = me?.division && me.division.isActive && me.division.entityId === entityId ? [{ id: me.division.id, name: me.division.name }] : []
  } else {
    divisions = await db.division.findMany({ where: { isActive: true, entityId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  }
  const divIds = divisions.map((d) => d.id)

  const or: Prisma.UserWhereInput[] = [{ id: user.id }]
  if (divIds.length) {
    or.push({ divisionId: { in: divIds } })
    if (user.role === 'KEPALA_DIVISI') or.push({ projectsAsPic: { some: { divisionId: { in: divIds }, lifecycle: 'AKTIF' } } })
  }
  const rows = await db.user.findMany({
    where: LIMITED_REQUESTERS.has(user.role) ? { scopeEntityId: entityId, OR: or } : { scopeEntityId: entityId },
    select: { id: true, name: true, role: true, isActive: true, division: { select: { name: true } } },
    orderBy: { name: 'asc' },
    take: 300,
  })
  return {
    entity,
    divisions,
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      roleLabel: ROLE_LABELS[u.role] ?? u.role,
      divisionName: u.division?.name ?? null,
      isActive: u.isActive,
      isSelf: u.id === user.id,
    })),
    roles: REQUESTABLE_ROLES.map((r) => ({ role: r, label: ROLE_LABELS[r] ?? r })),
  }
}

/**
 * Penolakan untuk pengaju terbatas, atau null bila boleh. `payload` sudah
 * lolos readPayload (src/lib/access-requests.ts).
 */
export async function limitedRequestRefusal(
  user: SessionUser,
  type: string,
  payload: { role?: string; userId?: string; divisionId?: string; projectId?: string }
): Promise<string | null> {
  if (!LIMITED_REQUESTERS.has(user.role)) return null
  const opts = await requesterOptions(user)
  if (!opts.entity) return 'Akun Anda belum terikat pada perusahaan.'
  if (payload.role && !(REQUESTABLE_ROLES as readonly string[]).includes(payload.role)) {
    return 'Anda hanya dapat meminta posisi PIC proyek atau kepala divisi.'
  }
  if (payload.divisionId && !opts.divisions.some((d) => d.id === payload.divisionId)) return 'Divisi itu di luar tim Anda.'
  if (payload.projectId) return 'Penautan proyek diatur oleh Admin PT.'
  if (type !== 'AKUN_BARU' && (!payload.userId || !opts.users.some((u) => u.id === payload.userId))) {
    return 'Akun itu di luar tim Anda.'
  }
  return null
}
