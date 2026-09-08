import 'server-only'

import { db } from '@/lib/db'
import { isGlobalRole, scopeEntityIds, type SessionUser } from '@/lib/auth'
import { isDailyLocked, isProgressLocked, isWeeklyLocked, type ProgressCadence } from '@/lib/lock'

/**
 * Who may attach evidence to a report line, and who may read it back.
 *
 * Writing is tied to owning the underlying work: the PIC of the project, the
 * head of the division, or the Admin PT of the entity. Reading follows the same
 * entity scoping as every other list endpoint, so a signed URL is only ever
 * minted for a file inside the caller's own subtree.
 */

export const EVIDENCE_TARGETS = new Set(['DAILY_REPORT', 'WEEKLY_ITEM', 'PROJECT_CLOSING', 'TASK', 'PROGRESS_REPORT'])

type Result = { ok: true; entityId: string } | { ok: false; status: number; error: string }

/** Resolves the entity a piece of evidence belongs to, via its parent record. */
async function targetEntity(
  targetType: string,
  targetId: string
): Promise<{
  entityId: string
  picUserId?: string | null
  headUserId?: string | null
  locked?: boolean
} | null> {
  if (targetType === 'DAILY_REPORT') {
    const r = await db.dailyProjectReport.findUnique({
      where: { id: targetId },
      select: {
        entityId: true,
        reportDate: true,
        isLocked: true,
        project: { select: { picUserId: true } },
      },
    })
    return r
      ? {
          entityId: r.entityId,
          picUserId: r.project.picUserId,
          locked: r.isLocked || isDailyLocked(r.reportDate),
        }
      : null
  }

  if (targetType === 'WEEKLY_ITEM') {
    const item = await db.weeklyReportItem.findUnique({
      where: { id: targetId },
      select: {
        weeklyReport: {
          select: {
            entityId: true,
            periodStart: true,
            isLocked: true,
            statusHeader: true,
            division: { select: { headUserId: true } },
          },
        },
      },
    })
    return item
      ? {
          entityId: item.weeklyReport.entityId,
          headUserId: item.weeklyReport.division.headUserId,
          locked:
            item.weeklyReport.isLocked ||
            item.weeklyReport.statusHeader === 'TERKUNCI' ||
            isWeeklyLocked(item.weeklyReport.periodStart),
        }
      : null
  }

  if (targetType === 'TASK') {
    const t = await db.task.findUnique({
      where: { id: targetId },
      select: {
        entityId: true,
        workDate: true,
        project: { select: { picUserId: true } },
      },
    })
    return t
      ? {
          entityId: t.entityId,
          picUserId: t.project.picUserId,
          locked: isDailyLocked(t.workDate),
        }
      : null
  }

  if (targetType === 'PROGRESS_REPORT') {
    const p = await db.projectProgressReport.findUnique({
      where: { id: targetId },
      select: {
        entityId: true,
        cadence: true,
        periodKey: true,
        periodStart: true,
        periodEnd: true,
        isLocked: true,
        project: { select: { picUserId: true } },
      },
    })
    return p
      ? {
          entityId: p.entityId,
          picUserId: p.project.picUserId,
          locked:
            p.isLocked ||
            isProgressLocked({
              cadence: p.cadence as ProgressCadence,
              key: p.periodKey,
              start: p.periodStart,
              end: p.periodEnd,
            }),
        }
      : null
  }

  if (targetType === 'PROJECT_CLOSING') {
    const p = await db.project.findUnique({
      where: { id: targetId },
      select: { entityId: true, picUserId: true },
    })
    return p ? { entityId: p.entityId, picUserId: p.picUserId } : null
  }

  return null
}

/** May this account attach or remove evidence on this target? */
export async function canWriteEvidence(
  user: SessionUser,
  targetType: string,
  targetId: string
): Promise<Result> {
  if (!EVIDENCE_TARGETS.has(targetType)) {
    return { ok: false, status: 400, error: 'Target bukti tidak valid' }
  }

  const target = await targetEntity(targetType, targetId)
  if (!target) return { ok: false, status: 404, error: 'Data induk bukti tidak ditemukan' }

  const owns =
    user.role === 'PIC_PROYEK'
      ? target.picUserId === user.id
      : user.role === 'KEPALA_DIVISI'
        ? target.headUserId === user.id
        : user.role === 'TI'
          ? true
          : target.entityId === user.scopeEntityId

  if (!owns) {
    return { ok: false, status: 403, error: 'Bukti ini di luar tanggung jawab Anda' }
  }

  // Once the record is locked its evidence is frozen too — otherwise the
  // attachment count of a sealed report could still be changed after the fact.
  if (target.locked) {
    return {
      ok: false,
      status: 409,
      error: 'Laporan ini sudah dikunci, bukti tidak dapat diubah. Ajukan permohonan buka kunci.',
    }
  }

  return { ok: true, entityId: target.entityId }
}

/** May this account read evidence on this target? */
export async function canReadEvidence(
  user: SessionUser,
  targetType: string,
  targetId: string
): Promise<Result> {
  if (!EVIDENCE_TARGETS.has(targetType)) {
    return { ok: false, status: 400, error: 'Target bukti tidak valid' }
  }

  const target = await targetEntity(targetType, targetId)
  if (!target) return { ok: false, status: 404, error: 'Data induk bukti tidak ditemukan' }

  if (isGlobalRole(user.role)) return { ok: true, entityId: target.entityId }

  const allowed = await scopeEntityIds(user)
  if (allowed && !allowed.includes(target.entityId)) {
    return { ok: false, status: 403, error: 'Bukti ini di luar cakupan Anda' }
  }
  return { ok: true, entityId: target.entityId }
}
