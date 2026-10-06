import 'server-only'

import { db } from '@/lib/db'
import { isMasterRole } from '@/lib/rbac'
import { isDailyLocked, isWorkingDay, isoWeekOf, startOfWibDay, wibIsoDay } from '@/lib/lock'
import { remindUnreportedDivisions } from '@/lib/reminders'
import { AUTO_ACTOR_NAME, DAILY_PIC_TEMPLATE, remindPicsDaily } from '@/lib/reminders-pic'
import {
  REMINDER_DEFAULTS, REMINDER_KINDS, REMINDER_LABELS, TIME_RE, type ReminderKind, type ReminderRuleView,
} from '@/lib/admin-meta'

/**
 * Pengingat otomatis per PT (6 Okt 2026, 04-admin-pt.md). Empat aturan; baris
 * yang belum ada di tabel ReminderRule berarti nilai bawaan (REMINDER_DEFAULTS).
 * Sakelar berlaku seketika (cron berikutnya membaca tabel ini) dan setiap
 * perubahan tercatat di AuditLog dengan kalimat "<nama> mematikan …".
 *
 * Pengingat otomatis memakai template & teks yang sama dengan tombol manual
 * di Meja kerja, jadi PIC yang sudah diingatkan manual hari itu tidak
 * diingatkan lagi oleh cron (dan sebaliknya).
 */

/** Template pengingat harian PIC — satu sumber di src/lib/reminders-pic.ts. */
export { DAILY_PIC_TEMPLATE }
export const ESCALATION_TEMPLATE = 'ESKALASI_KADIV_HARIAN'
export const SUMMARY_TEMPLATE = 'RINGKASAN_MANAJEMEN'
const AUTO_ACTOR = AUTO_ACTOR_NAME
const DAY = 86400000

/** Yang boleh mengubah sakelar: Admin PT untuk PT-nya, TI & Super Admin untuk PT mana pun. */
export function reminderDesk(user: { role: string; scopeEntityId: string | null }): { full: boolean; entityId: string | null } | null {
  if (isMasterRole(user.role)) return { full: true, entityId: null }
  if (user.role === 'ADMIN_PT' && user.scopeEntityId) return { full: false, entityId: user.scopeEntityId }
  return null
}

function parseParams(json: string | null): { days?: number } {
  try {
    const p = json ? (JSON.parse(json) as { days?: unknown }) : {}
    return typeof p.days === 'number' ? { days: p.days } : {}
  } catch {
    return {}
  }
}

type RuleRow = {
  kind: string
  enabled: boolean
  time: string | null
  weekday: number | null
  params: string | null
  lastRunAt: Date | null
  updatedAt: Date
  updatedBy: { name: string } | null
}

function view(kind: ReminderKind, row: RuleRow | undefined): ReminderRuleView {
  const d = REMINDER_DEFAULTS[kind]
  if (!row) return { kind, ...d, lastRunAt: null, updatedAt: null, updatedBy: null }
  return {
    kind,
    enabled: row.enabled,
    time: row.time && TIME_RE.test(row.time) ? row.time : d.time,
    weekday: row.weekday ?? d.weekday,
    params: { ...d.params, ...parseParams(row.params) },
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy?.name ?? null,
  }
}

export async function getRules(entityId: string): Promise<ReminderRuleView[]> {
  const rows = await db.reminderRule.findMany({
    where: { entityId },
    select: { kind: true, enabled: true, time: true, weekday: true, params: true, lastRunAt: true, updatedAt: true, updatedBy: { select: { name: true } } },
  })
  return REMINDER_KINDS.map((k) => view(k, rows.find((r) => r.kind === k)))
}

/** Kalimat log, mis. "Maya Lestari mematikan ringkasan untuk manajemen". */
export function ruleMessage(actorName: string, kind: ReminderKind, change: { enabled?: boolean; time?: string; weekday?: number | null; days?: number }): string {
  if (typeof change.enabled === 'boolean') return `${actorName} ${change.enabled ? 'menyalakan' : 'mematikan'} ${REMINDER_LABELS[kind]}`
  const parts = [change.time ? `pukul ${change.time.replace(':', '.')}` : null, change.days ? `${change.days} hari` : null].filter(Boolean)
  return `${actorName} mengubah ${REMINDER_LABELS[kind]}${parts.length ? ` menjadi ${parts.join(', ')}` : ''}`
}

export async function setRule(
  entityId: string,
  kind: ReminderKind,
  patch: { enabled?: boolean; time?: string; weekday?: number | null; days?: number },
  actor: { id: string; name: string },
  ip: string | null
): Promise<{ rule: ReminderRuleView; message: string }> {
  const current = (await getRules(entityId)).find((r) => r.kind === kind)!
  const next = {
    enabled: patch.enabled ?? current.enabled,
    time: patch.time ?? current.time,
    weekday: patch.weekday !== undefined ? patch.weekday : current.weekday,
    params: JSON.stringify(patch.days ? { ...current.params, days: patch.days } : current.params),
  }
  const message = ruleMessage(actor.name, kind, patch)
  await db.$transaction([
    db.reminderRule.upsert({
      where: { entityId_kind: { entityId, kind } },
      create: { entityId, kind, ...next, updatedById: actor.id },
      update: { ...next, updatedById: actor.id },
    }),
    db.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'UPDATE_REMINDER_RULE',
        targetType: 'REMINDER_RULE',
        targetId: `${entityId}:${kind}`,
        beforeData: JSON.stringify({ enabled: current.enabled, time: current.time, weekday: current.weekday, params: current.params }),
        afterData: JSON.stringify({ ...next, params: JSON.parse(next.params), message }),
        ip,
      },
    }),
  ])
  const rule = (await getRules(entityId)).find((r) => r.kind === kind)!
  return { rule, message }
}

/** PT yang aturan `kind`-nya aktif; null bila tak satu pun dimatikan (= semua). */
export async function entitiesWithRuleEnabled(kind: ReminderKind): Promise<string[] | null> {
  const defaultOn = REMINDER_DEFAULTS[kind].enabled
  // Tabel ReminderRule belum dimigrasi (0016) → perilaku lama: semua PT (bila bawaannya aktif).
  const off = await db.reminderRule
    .findMany({ where: { kind, enabled: false }, select: { entityId: true } })
    .catch((err: unknown) => {
      console.error('[reminder-rules] tabel aturan tidak terbaca:', err instanceof Error ? err.message : err)
      return null
    })
  if (off === null) return defaultOn ? null : []
  if (defaultOn && off.length === 0) return null
  // Semua entitas aktif (bukan hanya tipe PT): divisi juga ada di UNIT/SUB_HOLDING,
  // dan tanpa sakelar yang dimatikan mereka tetap diingatkan seperti sebelumnya.
  const pts = await db.entity.findMany({ where: { isActive: true }, select: { id: true } })
  if (defaultOn) {
    const offIds = new Set(off.map((o) => o.entityId))
    return pts.map((p) => p.id).filter((id) => !offIds.has(id))
  }
  const on = await db.reminderRule.findMany({ where: { kind, enabled: true }, select: { entityId: true } })
  return on.map((o) => o.entityId)
}

function wibMinutes(now: Date): number {
  const w = new Date(now.getTime() + 7 * 3600000)
  return w.getUTCHours() * 60 + w.getUTCMinutes()
}

/** Jatuh tempo: hari cocok, jam sudah lewat, dan belum berjalan hari ini. */
export function isDue(rule: ReminderRuleView, now = new Date()): boolean {
  if (!rule.enabled) return false
  if (rule.weekday ? wibIsoDay(now) !== rule.weekday : !isWorkingDay(now)) return false
  const [h, m] = rule.time.split(':').map(Number)
  if (wibMinutes(now) < h * 60 + m) return false
  return !rule.lastRunAt || new Date(rule.lastRunAt) < startOfWibDay(now)
}

// ------------------------------------------------------------------
// Pelaksana tiap jenis
// ------------------------------------------------------------------

async function runDaily(entityId: string, now: Date): Promise<number> {
  const today = startOfWibDay(now)
  if (isDailyLocked(today, now)) return 0
  const projects = await db.project.findMany({
    where: { entityId, lifecycle: 'AKTIF', picUserId: { not: null } },
    select: { id: true },
  })
  // Pengingat yang sama dengan tombol "Ingatkan" Admin PT (src/lib/reminders-pic.ts):
  // proyek yang sudah lapor atau sudah diingatkan hari ini dilewati di sana.
  const { sent } = await remindPicsDaily({ kind: 'auto' }, projects.map((p) => p.id), today)
  return sent.length
}

/** Hari kerja ke-1…n sebelum `today` (tengah malam WIB). */
function previousWorkingDays(today: Date, n: number): Date[] {
  const out: Date[] = []
  for (let d = new Date(today.getTime() - DAY); out.length < n && today.getTime() - d.getTime() < 30 * DAY; d = new Date(d.getTime() - DAY)) {
    if (isWorkingDay(d)) out.push(startOfWibDay(d))
  }
  return out
}

async function runEscalation(entityId: string, days: number, now: Date): Promise<number> {
  const today = startOfWibDay(now)
  const window = previousWorkingDays(today, Math.max(1, Math.min(10, days)))
  if (window.length === 0) return 0
  const projects = await db.project.findMany({
    where: { entityId, lifecycle: 'AKTIF', picUserId: { not: null }, OR: [{ startDate: null }, { startDate: { lte: window[window.length - 1] } }] },
    select: {
      id: true,
      name: true,
      // Kepala divisi proyek dulu (Project.divisionId), baru divisi PIC [F1-D] —
      // urutan yang sama dengan src/lib/pic-access.ts → projectDivisionIds.
      division: { select: { id: true, name: true, isActive: true, headUser: { select: { id: true, name: true, email: true, isActive: true } } } },
      picUser: { select: { id: true, name: true, isActive: true, division: { select: { id: true, name: true, isActive: true, headUser: { select: { id: true, name: true, email: true, isActive: true } } } } } },
    },
  })
  const reported = await db.dailyProjectReport.findMany({
    where: { entityId, reportDate: { in: window }, submittedAt: { not: null } },
    select: { projectId: true },
  })
  const has = new Set(reported.map((r) => r.projectId))
  // Kelompokkan per kepala divisi supaya satu orang menerima satu pesan.
  const byHead = new Map<string, { head: { id: string; name: string; email: string }; division: string; items: string[] }>()
  for (const p of projects) {
    if (has.has(p.id) || !p.picUser?.isActive) continue
    const div = p.division?.isActive && p.division.headUser ? p.division : p.picUser.division?.isActive ? p.picUser.division : null
    const head = div?.headUser
    if (!div || !head || !head.isActive || head.id === p.picUser.id) continue
    const g = byHead.get(head.id) ?? { head, division: div.name, items: [] }
    g.items.push(`${p.picUser.name} (${p.name})`)
    byHead.set(head.id, g)
  }
  if (byHead.size === 0) return 0
  const already = await db.notificationLog.findMany({
    where: { template: ESCALATION_TEMPLATE, createdAt: { gte: today }, userId: { in: Array.from(byHead.keys()) } },
    select: { userId: true },
  })
  const done = new Set(already.map((a) => a.userId))
  let sent = 0
  for (const [headId, g] of byHead) {
    if (done.has(headId)) continue
    await db.notificationLog.create({
      data: {
        userId: headId,
        channel: 'APLIKASI',
        recipient: g.head.email,
        template: ESCALATION_TEMPLATE,
        status: 'SENT',
        sentAt: now,
        payload: JSON.stringify({
          title: `${g.items.length} anggota Divisi ${g.division} tidak lapor ${days} hari`,
          body: `${g.items.join(', ')} belum mengirim laporan harian ${days} hari kerja terakhir. Diingatkan oleh ${AUTO_ACTOR}.`,
          tab: 'work-desk',
          entityId,
          source: 'CRON',
        }),
      },
    })
    sent += 1
  }
  return sent
}

async function runManagementSummary(entityId: string, now: Date): Promise<number> {
  const today = startOfWibDay(now)
  const from = new Date(today.getTime() - 7 * DAY)
  const workdays = Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * DAY)).filter((d) => isWorkingDay(d)).length
  const prev = isoWeekOf(from)
  const [entity, activeProjects, submitted, late, divisions, weekly, recipients] = await Promise.all([
    db.entity.findUnique({ where: { id: entityId }, select: { name: true } }),
    db.project.count({ where: { entityId, lifecycle: 'AKTIF' } }),
    db.dailyProjectReport.count({ where: { entityId, reportDate: { gte: from, lt: today }, submittedAt: { not: null } } }),
    db.dailyProjectReport.count({ where: { entityId, reportDate: { gte: from, lt: today }, isLate: true } }),
    db.division.count({ where: { entityId, isActive: true } }),
    db.weeklyDivisionReport.count({ where: { entityId, isoYear: prev.isoYear, isoWeek: prev.isoWeek, submittedAt: { not: null } } }),
    db.user.findMany({ where: { role: 'MANAJEMEN', isActive: true }, select: { id: true, email: true } }),
  ])
  if (!entity || recipients.length === 0) return 0
  const expected = activeProjects * workdays
  const pctDaily = expected ? Math.round((submitted / expected) * 100) : 0
  const already = await db.notificationLog.findMany({
    where: { template: SUMMARY_TEMPLATE, createdAt: { gte: today }, payload: { contains: `"entityId":"${entityId}"` } },
    select: { userId: true },
  })
  const done = new Set(already.map((a) => a.userId))
  let sent = 0
  for (const r of recipients) {
    if (done.has(r.id)) continue
    await db.notificationLog.create({
      data: {
        userId: r.id,
        channel: 'APLIKASI',
        recipient: r.email,
        template: SUMMARY_TEMPLATE,
        status: 'SENT',
        sentAt: now,
        payload: JSON.stringify({
          title: `Ringkasan pekan lalu ${entity.name}: ${pctDaily}% laporan harian masuk`,
          body: `${submitted} dari ${expected} laporan harian masuk, ${late} terlambat. Laporan mingguan M${prev.isoWeek}: ${weekly} dari ${divisions} divisi.`,
          tab: 'dashboard',
          entityId,
          source: 'CRON',
        }),
      },
    })
    sent += 1
  }
  return sent
}

/**
 * Entitas pelapor (dipakai aturan pengingat dan KpiSnapshot): semua PT aktif, ditambah UNIT/SUB_HOLDING
 * aktif yang punya proyek atau divisi aktif [F1-D] (divisi dan proyek juga ada
 * di sana, dan pengingat mingguan sudah menjangkau mereka).
 */
export async function reportingEntities(): Promise<{ id: string }[]> {
  return db.entity.findMany({
    where: {
      isActive: true,
      OR: [
        { type: 'PT' },
        {
          type: { in: ['UNIT', 'SUB_HOLDING'] },
          OR: [{ projects: { some: { lifecycle: 'AKTIF' } } }, { divisions: { some: { isActive: true } } }],
        },
      ],
    },
    select: { id: true },
  })
}

/**
 * Menjalankan semua aturan yang jatuh tempo di seluruh entitas pelapor. Dipanggil
 * /api/cron/reminder-rules; aman dipanggil berulang (lastRunAt + pencegah
 * dobel per penerima per hari).
 */
export async function runDueRules(now = new Date()): Promise<{ entityId: string; kind: ReminderKind; sent: number }[]> {
  const pts = await reportingEntities()
  const out: { entityId: string; kind: ReminderKind; sent: number }[] = []
  for (const pt of pts) {
    const rules = await getRules(pt.id)
    for (const rule of rules) {
      if (!isDue(rule, now)) continue
      let sent = 0
      try {
        if (rule.kind === 'HARIAN') sent = await runDaily(pt.id, now)
        else if (rule.kind === 'MINGGUAN') sent = (await remindUnreportedDivisions({ entityIds: [pt.id], source: 'CRON' })).sent
        else if (rule.kind === 'ESKALASI_KADIV') sent = await runEscalation(pt.id, rule.params.days ?? 2, now)
        else sent = await runManagementSummary(pt.id, now)
      } catch (err) {
        console.error('[reminder-rules]', pt.id, rule.kind, err instanceof Error ? err.message : err)
        continue
      }
      await db.reminderRule.upsert({
        where: { entityId_kind: { entityId: pt.id, kind: rule.kind } },
        create: {
          entityId: pt.id,
          kind: rule.kind,
          enabled: rule.enabled,
          time: rule.time,
          weekday: rule.weekday,
          params: JSON.stringify(rule.params),
          lastRunAt: now,
        },
        update: { lastRunAt: now },
      })
      await db.auditLog.create({
        data: {
          actorId: null,
          action: 'AUTO_REMINDER',
          targetType: 'REMINDER_RULE',
          targetId: `${pt.id}:${rule.kind}`,
          afterData: JSON.stringify({ kind: rule.kind, sent, message: `${AUTO_ACTOR} mengirim ${REMINDER_LABELS[rule.kind]} ke ${sent} orang` }),
          userAgent: 'cron',
        },
      })
      out.push({ entityId: pt.id, kind: rule.kind, sent })
    }
  }
  return out
}
