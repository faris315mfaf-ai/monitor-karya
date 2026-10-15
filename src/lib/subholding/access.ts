import 'server-only'

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { can } from '@/lib/rbac'
import type { SessionUser } from '@/lib/auth'
import { SH_REPORT_SELECT, type ShReportRow } from '@/lib/subholding/report'
import { ownsSubholding } from '@/lib/subholding/scope'

type Client = Prisma.TransactionClient | typeof db

/**
 * Siapa boleh membaca satu laporan subholding:
 *  - Admin subholding pemiliknya,
 *  - peninjau (`shreport:review`: Supervisor, Super Admin) — semua,
 *  - `shreport:view-approved` (Superuser, Manajemen) — hanya DISETUJUI.
 */
export function canReadShReport(user: SessionUser, row: Pick<ShReportRow, 'subholdingId' | 'status'>): boolean {
  if (can(user.role, 'shreport:write') && ownsSubholding(user, row.subholdingId)) return true
  if (can(user.role, 'shreport:review')) return true
  return can(user.role, 'shreport:view-approved') && row.status === 'DISETUJUI'
}

/**
 * Laporan yang terlihat oleh akun ini, atau null (tidak ada ATAU di luar
 * cakupan — sengaja sama-sama 404 supaya id laporan subholding lain tidak
 * bisa ditebak keberadaannya).
 */
export async function visibleShReport(user: SessionUser, id: string, client: Client = db): Promise<ShReportRow | null> {
  if (!id || id.length > 64) return null
  const row = await client.subholdingReport.findUnique({ where: { id }, select: SH_REPORT_SELECT })
  if (!row || !canReadShReport(user, row)) return null
  return row
}
