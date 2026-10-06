import 'server-only'

import type { Prisma } from '@prisma/client'
import { scopeEntityIds, scopeUserIds, type SessionUser } from '@/lib/auth'
import { can } from '@/lib/rbac'

/**
 * Cakupan baca log aktivitas untuk Ringkasan Admin dan "Unduh log" [F2-ADMIN].
 *
 *  - Peran `audit:read` (Direktur entitas, SDM GA, Manajemen, TI, Auditor,
 *    Super Admin): sama dengan GET /api/audit-logs — akun dalam cakupannya,
 *    atau seluruh grup.
 *  - Admin PT: akun di PT-nya (subtree) — dibuka khusus untuk log aktivitas
 *    & unduhan, tanpa memberi `audit:read` (tab Audit tetap tertutup).
 *  - Selain itu: tidak boleh (null).
 *
 * Pekerjaan terjadwal (actorId kosong) ikut bila sasarannya PT dalam cakupan
 * (targetId "<entityId>:<jenis>", mis. AUTO_REMINDER).
 */
export async function auditScopeWhere(user: SessionUser): Promise<{ where: Prisma.AuditLogWhereInput; full: boolean } | null> {
  const auditor = can(user.role, 'audit:read')
  if (!auditor && user.role !== 'ADMIN_PT') return null
  if (!auditor && !user.scopeEntityId) return null
  const [userIds, entityIds] = await Promise.all([scopeUserIds(user), scopeEntityIds(user)])
  if (userIds === null) return { where: {}, full: auditor }
  const auto: Prisma.AuditLogWhereInput[] = (entityIds ?? []).slice(0, 200).map((id) => ({ actorId: null, targetId: { startsWith: `${id}:` } }))
  return { where: { OR: [{ actorId: { in: userIds } }, ...auto] }, full: auditor }
}
