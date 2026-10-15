import 'server-only'

import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'
import { inboxWhere } from '@/lib/subholding/inbox'
import { subholdingOf } from '@/lib/subholding/scope'

/**
 * Angka kecil di navigasi peran subholding (dipakai /api/nav-badges):
 * Admin subholding → `sh-inbox` = pesan peninjau belum dibaca;
 * Supervisor → `sh-review` = laporan MENUNGGU seluruh subholding.
 */
export async function subholdingBadges(user: SessionUser): Promise<Record<string, number>> {
  const badges: Record<string, number> = {}
  try {
    if (user.role === 'ADMIN_SUBHOLDING') {
      const sub = await subholdingOf(user)
      if (sub) {
        const unread = await db.subholdingReportComment.count({ where: { ...inboxWhere(sub.id), readAt: null } })
        if (unread) badges['sh-inbox'] = unread
      }
    } else if (user.role === 'SUPERVISOR') {
      const waiting = await db.subholdingReport.count({ where: { status: 'MENUNGGU' } })
      if (waiting) badges['sh-review'] = waiting
    }
  } catch (err) {
    console.error('[subholding] badge gagal dihitung:', err instanceof Error ? err.message : err)
  }
  return badges
}
