import 'server-only'

import { db } from '@/lib/db'
import { assignPosition, isKnownRole, type Tx } from '@/lib/companies'
import { canManageAccounts, canManageAllAccounts, manageableRoles } from '@/lib/rbac'

/**
 * Pagar meja akun (6 Okt 2026) — diekstrak dari /api/companies/users supaya
 * persetujuan permintaan akses (/api/access-requests) memakai aturan yang
 * sama persis: Admin PT hanya menyentuh akun di PT-nya dengan posisi
 * ADMIN_PT / KEPALA_DIVISI / PIC_PROYEK; Super Admin aktif terakhir tidak
 * bisa diturunkan; peran harus dikenal.
 */

export type Desk = { full: boolean; roles: readonly string[]; entityId: string | null }

/** Sejauh mana akun yang sedang masuk boleh memakai meja akun. */
export function accountDesk(user: { role: string; scopeEntityId: string | null }): Desk | null {
  if (!canManageAccounts(user.role)) return null
  if (canManageAllAccounts(user.role)) return { full: true, roles: manageableRoles(user.role), entityId: null }
  if (!user.scopeEntityId) return null
  return { full: false, roles: manageableRoles(user.role), entityId: user.scopeEntityId }
}

/** Pesan tunggal untuk posisi di luar wewenang meja terbatas. */
export function roleOutOfReachMessage(role: string): string {
  return `Posisi ${role === 'DIREKTUR_ENTITAS' ? 'Direktur Perusahaan' : role} hanya dapat dikelola Super Admin.`
}

/** Perusahaan (HOLDING/PT) untuk penempatan akun; galat bila tidak ada. */
export async function entityRef(id: string | null, client: Pick<Tx, 'entity'> = db) {
  if (!id) return null
  const e = await client.entity.findFirst({ where: { id, type: { in: ['HOLDING', 'PT'] } }, select: { id: true, code: true, name: true } })
  if (!e) throw new Error('Perusahaan tidak ditemukan.')
  return e
}

export async function isLastSuperadmin(excludeId: string, client: Pick<Tx, 'user'> = db): Promise<boolean> {
  const others = await client.user.count({ where: { role: 'SUPERADMIN', isActive: true, id: { not: excludeId } } })
  return others === 0
}

export type DeskRefusal = { status: number; error: string }

/**
 * Apakah meja terbatas boleh mengubah akun `existing` ke peran/perusahaan
 * yang diminta. Meja penuh selalu boleh (pagar Super Admin terakhir diperiksa
 * terpisah lewat `isLastSuperadmin`).
 */
export function deskReachError(
  desk: Desk,
  actorId: string,
  existing: { id: string; role: string; scopeEntityId: string | null },
  change: { role?: string; entityId?: string | null }
): DeskRefusal | null {
  if (desk.full) return null
  if (existing.scopeEntityId !== desk.entityId) return { status: 403, error: 'Akun ini bukan di perusahaan Anda.' }
  if (!desk.roles.includes(existing.role)) return { status: 403, error: roleOutOfReachMessage(existing.role) }
  if (typeof change.entityId === 'string' && change.entityId !== desk.entityId) {
    return { status: 403, error: 'Anda tidak dapat memindahkan akun ke perusahaan lain.' }
  }
  if (typeof change.role === 'string' && !desk.roles.includes(change.role)) {
    return { status: 403, error: roleOutOfReachMessage(change.role) }
  }
  if (existing.id === actorId && typeof change.role === 'string' && change.role !== existing.role) {
    return { status: 403, error: 'Anda tidak dapat mengubah posisi akun sendiri.' }
  }
  return null
}

/**
 * Mengganti peran satu akun dan menautkannya ke divisi/proyek bila perlu —
 * bagian "ubah peran" dari PATCH /api/companies/users, dipakai saat
 * permintaan pindah peran / akses sementara disetujui. Pemanggil sudah
 * memeriksa `deskReachError`.
 *
 * F1-C (6 Okt 2026): `headChanges` mencatat setiap Division.headUserId yang
 * diubah (nilai lama → baru) supaya akses sementara bisa dikembalikan utuh
 * oleh revertExpiredAccess (src/lib/access-requests.ts).
 */
export type HeadChange = { divisionId: string; from: string | null; to: string | null }

export async function applyRoleChange(
  tx: Tx,
  existing: { id: string; name: string; role: string; scopeEntityId: string | null },
  change: { role: string; divisionId?: string | null; projectId?: string | null; isActive?: boolean }
): Promise<{ role: string; divisionId?: string; projectId?: string; headChanges: HeadChange[] }> {
  if (!isKnownRole(change.role)) throw new Error('Peran tidak dikenali.')
  if (existing.role === 'SUPERADMIN' && change.role !== 'SUPERADMIN' && (await isLastSuperadmin(existing.id, tx))) {
    throw new Error('Ini Super Admin aktif terakhir; angkat Super Admin lain dulu.')
  }
  await tx.user.update({
    where: { id: existing.id },
    data: { role: change.role, ...(typeof change.isActive === 'boolean' ? { isActive: change.isActive } : {}) },
  })
  let link: { divisionId?: string; projectId?: string } = {}
  const heads = new Map<string, HeadChange>()
  if ((change.divisionId || change.projectId) && existing.scopeEntityId) {
    const entity = await tx.entity.findUnique({ where: { id: existing.scopeEntityId }, select: { id: true, code: true, name: true } })
    if (entity) {
      if (change.role === 'KEPALA_DIVISI') {
        // Nilai lama dicatat dulu: divisi yang dipimpin akun ini dilepas, lalu
        // divisi tujuan mengganti kepalanya (yang lama juga dicatat).
        const led = await tx.division.findMany({ where: { headUserId: existing.id }, select: { id: true } })
        for (const d of led) heads.set(d.id, { divisionId: d.id, from: existing.id, to: null })
        if (change.divisionId) {
          const target = await tx.division.findFirst({ where: { id: change.divisionId, entityId: entity.id }, select: { id: true, headUserId: true } })
          if (target && !heads.has(target.id)) heads.set(target.id, { divisionId: target.id, from: target.headUserId, to: null })
        }
        await tx.division.updateMany({ where: { headUserId: existing.id }, data: { headUserId: null } })
      }
      link = await assignPosition(tx, { id: existing.id, name: existing.name, role: change.role }, entity, {
        divisionId: change.divisionId ?? null,
        divisionName: null,
        projectId: change.projectId ?? null,
        projectName: null,
      })
      if (change.role === 'KEPALA_DIVISI' && link.divisionId) {
        const h = heads.get(link.divisionId)
        if (h) h.to = existing.id
      }
    }
  }
  // Hanya yang benar-benar berubah.
  const headChanges = [...heads.values()].filter((h) => h.from !== h.to)
  return { role: change.role, ...link, headChanges }
}
