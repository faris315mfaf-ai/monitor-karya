import 'server-only'

import { db } from '@/lib/db'
import { scopeEntityIds, type SessionUser } from '@/lib/auth'
import { canSeeTab, canSignSlot, pendingSlot } from '@/lib/rbac'
import { canDecideDeadline } from '@/lib/pic-access'
import { isWeeklyReader } from '@/lib/oversight-shared'
import { decidableWhere, isMissingTable, reportWeekOf } from '@/lib/oversight'

/**
 * [F2-DIREKTUR] Badge nav pengawas (01-manajemen.md, 02-direktur.md), dipakai
 * /api/nav-badges:
 *   escalations — "Eskalasi n": eskalasi terbuka (DIAJUKAN/DITINJAU) dalam cakupan.
 *   divisions   — "Laporan mingguan n": laporan minggu laporan yang sudah masuk
 *                 tetapi belum Anda tandai sudah dibaca. Modul Divisi adalah
 *                 modul laporan mingguan divisi, jadi angkanya menempel di sana.
 *   approvals   — "Persetujuan n": permintaan materi/anggaran/cuti, usulan
 *                 tenggat, dan pengajuan proyek yang menunggu keputusan Anda.
 * Setiap bagian berdiri sendiri: tabel yang belum dimigrasi dilewati.
 */

const OVERSIGHT_BADGE_ROLES = ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN']

async function safe(label: string, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn()
  } catch (err) {
    if (!isMissingTable(err)) console.error(`[nav-badges] ${label}:`, err instanceof Error ? err.message : err)
    return 0
  }
}

export async function oversightBadges(user: SessionUser): Promise<Record<string, number>> {
  if (!OVERSIGHT_BADGE_ROLES.includes(user.role)) return {}
  const scope = await scopeEntityIds(user)
  const inScope = scope ? { entityId: { in: scope } } : {}
  const out: Record<string, number> = {}

  const [escalations, weekly, approvals] = await Promise.all([
    canSeeTab(user.role, 'escalations')
      ? safe('eskalasi', () => db.escalation.count({ where: { ...inScope, status: { in: ['DIAJUKAN', 'DITINJAU'] } } }))
      : Promise.resolve(0),
    isWeeklyReader(user.role) && canSeeTab(user.role, 'divisions')
      ? safe('laporan mingguan', async () => {
          const wk = reportWeekOf()
          const reports = await db.weeklyDivisionReport.findMany({
            where: {
              ...inScope,
              isoYear: wk.isoYear,
              isoWeek: wk.isoWeek,
              division: { isActive: true },
              OR: [{ submittedAt: { not: null } }, { statusHeader: { not: 'DRAFT' } }],
            },
            select: { id: true },
          })
          if (reports.length === 0) return 0
          const read = await db.weeklyReportRead.count({ where: { userId: user.id, weeklyReportId: { in: reports.map((r) => r.id) } } })
          return Math.max(0, reports.length - read)
        })
      : Promise.resolve(0),
    canSeeTab(user.role, 'approvals')
      ? Promise.all([
          safe('persetujuan', async () => {
            const where = await decidableWhere(user)
            return where ? db.approvalRequest.count({ where: { ...where, status: 'DIAJUKAN' } }) : 0
          }),
          safe('usulan tenggat', () =>
            canDecideDeadline(user.role)
              ? db.deadlineProposal.count({ where: { status: 'DIAJUKAN', proposedById: { not: user.id }, project: { ...inScope } } })
              : Promise.resolve(0)
          ),
          safe('pengajuan proyek', async () => {
            const rows = await db.project.findMany({
              where: { ...inScope, lifecycle: 'DIUSULKAN' },
              select: { entityId: true, approvalChain: true, approvals: { select: { role: true, decision: true } } },
              take: 200,
            })
            return rows.filter((p) => {
              if (p.approvals.some((a) => a.decision === 'DITOLAK')) return false
              const slot = pendingSlot(p.approvalChain, p.approvals.filter((a) => a.decision === 'DISETUJUI').map((a) => a.role))
              return slot !== null && canSignSlot(user, slot, p.entityId)
            }).length
          }),
        ]).then((n) => n.reduce((a, b) => a + b, 0))
      : Promise.resolve(0),
  ])

  if (escalations) out.escalations = escalations
  if (weekly) out.divisions = weekly
  if (approvals) out.approvals = approvals
  return out
}
