import 'server-only'

import { db } from '@/lib/db'
import { REMINDER_DEFAULTS, REMINDER_KINDS, type ReminderKind } from '@/lib/admin-meta'
import {
  CRON_JOBS, cronHealth, type CronStatus, type ReminderMatrixRow, type TechnicalStatus,
} from '@/lib/group-panel'

/**
 * [F2-GRUP] Status teknis untuk Tim TI & Super Admin (07-ti.md): antrean buka
 * kunci, permintaan akses, proses otomatis terakhir, pengingat per PT, dan
 * kesehatan akun. Dipakai /api/system (konsol) dan /api/system/grup (kartu
 * ringkas di Ringkasan). Tabel dari migrasi yang mungkin belum diterapkan
 * (AccessRequest/ReminderRule 0016, kolom mustChangePassword 0018) dibaca
 * lewat `optional`, sehingga konsol tetap tampil dengan angka null.
 */

async function optional<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch (err) {
    console.warn('[system-status] data opsional tidak terbaca:', err instanceof Error ? err.message.split('\n')[0] : err)
    return fallback
  }
}

const DAY = 86400000

export async function technicalStatus(now: Date = new Date()): Promise<TechnicalStatus> {
  const since7 = new Date(now.getTime() - 7 * DAY)
  const [
    unlockGroups,
    activeNow,
    accessPending,
    cronRows,
    ruleRows,
    ptCount,
    active,
    inactive,
    neverLoggedIn,
    noPassword,
    mustChange,
    failed7d,
  ] = await Promise.all([
    db.unlockRequest.groupBy({ by: ['status'], where: { status: { in: ['DIAJUKAN', 'DISETUJUI'] } }, _count: { _all: true } }),
    db.unlockRequest.count({ where: { status: 'DIEKSEKUSI', reLockedAt: null, unlockUntil: { gt: now } } }),
    optional<number | null>(db.accessRequest.count({ where: { status: 'DIAJUKAN' } }), null),
    Promise.all(
      CRON_JOBS.map((j) =>
        db.auditLog.findFirst({ where: { action: j.action }, orderBy: { at: 'desc' }, select: { at: true } })
      )
    ),
    optional<{ kind: string; enabled: boolean; lastRunAt: Date | null }[] | null>(
      db.reminderRule.findMany({ select: { kind: true, enabled: true, lastRunAt: true } }),
      null
    ),
    db.entity.count({ where: { isActive: true, type: 'PT' } }),
    db.user.count({ where: { isActive: true } }),
    db.user.count({ where: { isActive: false } }),
    db.user.count({ where: { isActive: true, lastLoginAt: null } }),
    db.user.count({ where: { isActive: true, passwordHash: null } }),
    optional<number | null>(db.user.count({ where: { isActive: true, mustChangePassword: true } }), null),
    db.notificationLog.count({ where: { status: 'FAILED', createdAt: { gte: since7 } } }),
  ])

  const waiting = (s: string) => unlockGroups.find((g) => g.status === s)?._count._all ?? 0

  // Jalan terakhir pengingat otomatis: AUTO_REMINDER di log, atau lastRunAt aturan mana pun.
  const ruleLast = (ruleRows ?? []).reduce<Date | null>((m, r) => (r.lastRunAt && (!m || r.lastRunAt > m) ? r.lastRunAt : m), null)
  const cron: CronStatus[] = CRON_JOBS.map((j, i) => {
    let last = cronRows[i]?.at ?? null
    if (j.job === 'reminder-rules' && ruleLast && (!last || ruleLast > last)) last = ruleLast
    return { job: j.job, label: j.label, schedule: j.schedule, lastAt: last ? last.toISOString() : null, health: cronHealth(last, j.maxGapHours, now) }
  })

  // Sakelar aktif = baris yang menyala + baris yang belum ada dengan bawaan menyala.
  let reminders: TechnicalStatus['reminders'] = null
  if (ruleRows) {
    const total = ptCount * REMINDER_KINDS.length
    const explicitOff = ruleRows.filter((r) => !r.enabled && REMINDER_DEFAULTS[r.kind as ReminderKind]?.enabled).length
    const explicitOn = ruleRows.filter((r) => r.enabled && !REMINDER_DEFAULTS[r.kind as ReminderKind]?.enabled).length
    const defaultOn = REMINDER_KINDS.filter((k) => REMINDER_DEFAULTS[k].enabled).length * ptCount
    reminders = {
      enabled: Math.max(0, Math.min(total, defaultOn - explicitOff + explicitOn)),
      total,
      lastRunAt: ruleLast ? ruleLast.toISOString() : null,
    }
  }

  return {
    unlocks: { waitingApproval: waiting('DIAJUKAN'), waitingExecution: waiting('DISETUJUI'), activeNow },
    accessPending,
    cron,
    reminders,
    accounts: { active, inactive, neverLoggedIn, noPassword, mustChange },
    notifications: { failed7d },
  }
}

/** Sakelar pengingat tiap PT aktif (baris yang belum ada = bawaan). null bila tabelnya belum dimigrasi. */
export async function reminderMatrix(): Promise<ReminderMatrixRow[] | null> {
  const [pts, rows] = await Promise.all([
    db.entity.findMany({ where: { isActive: true, type: 'PT' }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
    optional<
      { entityId: string; kind: string; enabled: boolean; time: string | null; weekday: number | null; params: string | null; lastRunAt: Date | null }[] | null
    >(
      db.reminderRule.findMany({ select: { entityId: true, kind: true, enabled: true, time: true, weekday: true, params: true, lastRunAt: true } }),
      null
    ),
  ])
  if (!rows) return null
  return pts.map((pt) => ({
    entityId: pt.id,
    entityName: pt.name,
    entityCode: pt.code,
    rules: REMINDER_KINDS.map((kind) => {
      const r = rows.find((x) => x.entityId === pt.id && x.kind === kind)
      const d = REMINDER_DEFAULTS[kind]
      return {
        kind,
        enabled: r ? r.enabled : d.enabled,
        time: r?.time ?? d.time,
        weekday: r ? r.weekday : d.weekday,
        days: daysParam(r?.params ?? null) ?? (typeof d.params.days === 'number' ? d.params.days : null),
        lastRunAt: r?.lastRunAt ? r.lastRunAt.toISOString() : null,
      }
    }),
  }))
}

function daysParam(json: string | null): number | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as { days?: unknown }
    return typeof v.days === 'number' ? v.days : null
  } catch {
    return null
  }
}
