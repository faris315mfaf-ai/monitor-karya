import 'server-only'

import { db } from '@/lib/db'
import { isMasterRole } from '@/lib/rbac'
import { isGlobalRole, scopeEntityIds, type SessionUser } from '@/lib/auth'
import {
  isDailyLocked,
  isProgressLocked,
  startOfWibDay,
  weekPeriodOf,
  weeklyWriteBlock,
  type ProgressCadence,
} from '@/lib/lock'
import { dailyGate, frozenMessage, FORWARDED_FROZEN_MESSAGE } from '@/lib/daily-rollup'
import { activeUnlockFor } from '@/lib/unlock-requests'

/**
 * Who may attach evidence to a report line, and who may read it back.
 *
 * Writing is tied to owning the underlying work: the PIC of the project, the
 * head of the division, or the Admin PT of the entity. Reading follows the same
 * entity scoping as every other list endpoint, so a signed URL is only ever
 * minted for a file inside the caller's own subtree.
 */

export const EVIDENCE_TARGETS = new Set(['DAILY_REPORT', 'WEEKLY_ITEM', 'PROJECT_CLOSING', 'TASK', 'PROGRESS_REPORT', 'OUTPUT'])

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
  lockMessage?: string
} | null> {
  // [INTEGRASI] Kunci bukti mengikuti kunci laporannya (F1-A/F1-B): laporan
  // yang diteruskan/dikunci atau lewat 17.00 dibekukan, kecuali ada buka kunci
  // yang sedang berlaku (activeUnlockFor) untuk laporan itu.
  if (targetType === 'DAILY_REPORT') {
    const r = await db.dailyProjectReport.findUnique({
      where: { id: targetId },
      select: {
        entityId: true,
        reportDate: true,
        isLocked: true,
        forwardedAt: true,
        project: { select: { picUserId: true } },
      },
    })
    if (!r) return null
    const blocked = r.isLocked || Boolean(r.forwardedAt) || isDailyLocked(r.reportDate)
    const unlocked = blocked ? Boolean(await activeUnlockFor('DAILY_REPORT', targetId)) : false
    return {
      entityId: r.entityId,
      picUserId: r.project.picUserId,
      locked: blocked && !unlocked,
      lockMessage: r.forwardedAt ? FORWARDED_FROZEN_MESSAGE : undefined,
    }
  }

  if (targetType === 'WEEKLY_ITEM') {
    const item = await db.weeklyReportItem.findUnique({
      where: { id: targetId },
      select: {
        weeklyReport: {
          select: {
            id: true,
            entityId: true,
            forwardedAt: true,
            periodStart: true,
            isLocked: true,
            statusHeader: true,
            division: { select: { headUserId: true } },
          },
        },
      },
    })
    if (!item) return null
    const report = item.weeklyReport
    const unlocked = Boolean(await activeUnlockFor('WEEKLY_REPORT', report.id))
    const block = weeklyWriteBlock({ period: weekPeriodOf(report.periodStart), report, unlocked })
    return {
      entityId: report.entityId,
      headUserId: report.division.headUserId,
      locked: Boolean(block),
      lockMessage: block?.message,
    }
  }

  if (targetType === 'TASK') {
    const t = await db.task.findUnique({
      where: { id: targetId },
      select: {
        entityId: true,
        projectId: true,
        workDate: true,
        scope: true,
        project: { select: { picUserId: true } },
      },
    })
    if (!t) return null
    // Task HARIAN ikut laporan hariannya (beku/buka kunci); task MINGGUAN
    // tetap memakai kunci 17.00 hari kerjanya seperti sebelumnya.
    if (t.scope === 'MINGGUAN') {
      return { entityId: t.entityId, picUserId: t.project.picUserId, locked: isDailyLocked(t.workDate) }
    }
    const gate = await dailyGate(t.projectId, startOfWibDay(t.workDate))
    return {
      entityId: t.entityId,
      picUserId: t.project.picUserId,
      locked: Boolean(gate.frozen) || gate.timeLocked,
      lockMessage: frozenMessage(gate) ?? undefined,
    }
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

  // Output proyek (6 Okt 2026): bukti dibekukan selama menunggu review dan
  // setelah diterima, supaya yang direview sama dengan yang dikirim.
  if (targetType === 'OUTPUT') {
    const o = await db.output.findUnique({
      where: { id: targetId },
      select: { status: true, project: { select: { entityId: true, picUserId: true } } },
    })
    return o
      ? {
          entityId: o.project.entityId,
          picUserId: o.project.picUserId,
          locked: o.status === 'MENUNGGU_REVIEW' || o.status === 'DITERIMA',
          lockMessage:
            o.status === 'DITERIMA'
              ? 'Output ini sudah diterima; buktinya tidak dapat diubah.'
              : 'Output ini sedang direview; batalkan pengiriman dulu untuk mengubah bukti.',
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

  // Hanya pemilik pekerjaan yang menulis bukti: PIC proyeknya, kepala
  // divisinya, Admin PT di PT itu, atau akun induk. Peran pantau (Direktur,
  // Manajemen, Auditor) membaca saja walau berada di PT yang sama (6 Okt 2026).
  const owns =
    user.role === 'PIC_PROYEK'
      ? target.picUserId === user.id
      : user.role === 'KEPALA_DIVISI'
        ? target.headUserId === user.id
        : isMasterRole(user.role)
          ? true
          : user.role === 'ADMIN_PT' && !!user.scopeEntityId && target.entityId === user.scopeEntityId

  if (!owns) {
    return { ok: false, status: 403, error: 'Bukti ini di luar tanggung jawab Anda' }
  }

  // Once the record is locked its evidence is frozen too — otherwise the
  // attachment count of a sealed report could still be changed after the fact.
  if (target.locked) {
    return {
      ok: false,
      status: 409,
      error: target.lockMessage ?? 'Laporan ini sudah dikunci, bukti tidak dapat diubah. Ajukan permohonan buka kunci.',
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
