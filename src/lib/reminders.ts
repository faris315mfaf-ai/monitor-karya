import 'server-only'

import { db } from '@/lib/db'
import { WEEKLY_HANDOVER_LABEL, isoWeekOf, startOfWibDay, weekPeriodOf } from '@/lib/lock'

/**
 * Pengingat ke divisi yang belum melapor (8 Sep 2026).
 *
 * "Belum melapor" berarti laporan minggu berjalan belum diserahkan: belum ada
 * barisnya, atau masih DRAFT. Pesannya masuk ke lonceng aplikasi kepala
 * divisi yang bersangkutan (NotificationLog kanal APLIKASI). Satu divisi
 * paling banyak diingatkan sekali per hari, jadi cron pagi dan tombol manual
 * tidak saling menumpuk.
 */

export const REMINDER_TEMPLATE = 'PENGINGAT_MINGGUAN_DIVISI'

export type UnreportedDivision = {
  divisionId: string
  divisionName: string
  entityId: string
  entityName: string
  entityCode: string
  statusHeader: string | null
  head: { id: string; name: string; email: string } | null
}

/** Divisions in scope whose report for this week has not been handed over yet. */
export async function listUnreportedDivisions(entityIds: string[] | null): Promise<{
  week: { key: string; isoYear: number; isoWeek: number }
  divisions: UnreportedDivision[]
}> {
  const now = new Date()
  const period = weekPeriodOf(now)
  const { isoYear, isoWeek } = isoWeekOf(now)

  const divisions = await db.division.findMany({
    where: { isActive: true, ...(entityIds ? { entityId: { in: entityIds } } : {}) },
    select: {
      id: true,
      name: true,
      entity: { select: { id: true, name: true, code: true } },
      headUser: { select: { id: true, name: true, email: true, isActive: true } },
    },
    orderBy: [{ entity: { name: 'asc' } }, { name: 'asc' }],
  })
  const reports = await db.weeklyDivisionReport.findMany({
    where: { divisionId: { in: divisions.map((d) => d.id) }, isoYear, isoWeek },
    select: { divisionId: true, statusHeader: true },
  })
  const byDivision = new Map(reports.map((r) => [r.divisionId, r.statusHeader]))

  return {
    week: { key: period.key, isoYear, isoWeek },
    divisions: divisions
      .filter((d) => (byDivision.get(d.id) ?? 'DRAFT') === 'DRAFT')
      .map((d) => ({
        divisionId: d.id,
        divisionName: d.name,
        entityId: d.entity.id,
        entityName: d.entity.name,
        entityCode: d.entity.code,
        statusHeader: byDivision.get(d.id) ?? null,
        head:
          d.headUser && d.headUser.isActive
            ? { id: d.headUser.id, name: d.headUser.name, email: d.headUser.email }
            : null,
      })),
  }
}

export type ReminderResult = {
  week: { key: string; isoYear: number; isoWeek: number }
  sent: number
  results: (UnreportedDivision & { outcome: 'TERKIRIM' | 'SUDAH_HARI_INI' | 'TANPA_KEPALA' })[]
}

export async function remindUnreportedDivisions(opts: {
  entityIds: string[] | null
  source: 'MANUAL' | 'CRON'
  actorName?: string | null
}): Promise<ReminderResult> {
  const { week, divisions } = await listUnreportedDivisions(opts.entityIds)
  const today = startOfWibDay(new Date())

  // Yang sudah diingatkan hari ini dilewati — payload menyimpan divisionId.
  const sentToday = await db.notificationLog.findMany({
    where: { template: REMINDER_TEMPLATE, createdAt: { gte: today } },
    select: { userId: true, payload: true },
  })
  const alreadyKey = new Set(
    sentToday.map((n) => {
      try {
        const p = JSON.parse(n.payload) as { divisionId?: string }
        return `${n.userId}:${p.divisionId ?? ''}`
      } catch {
        return ''
      }
    })
  )

  const results: ReminderResult['results'] = []
  let sent = 0
  for (const d of divisions) {
    if (!d.head) {
      results.push({ ...d, outcome: 'TANPA_KEPALA' })
      continue
    }
    if (alreadyKey.has(`${d.head.id}:${d.divisionId}`)) {
      results.push({ ...d, outcome: 'SUDAH_HARI_INI' })
      continue
    }
    const title = `Laporan mingguan ${d.divisionName} belum diserahkan`
    const body =
      `Minggu ${week.isoWeek}/${week.isoYear} untuk ${d.entityName} ` +
      `${d.statusHeader ? 'masih berstatus draft' : 'belum diisi'}. ` +
      `Serahkan paling lambat ${WEEKLY_HANDOVER_LABEL}.` +
      (opts.source === 'MANUAL' && opts.actorName ? ` Diingatkan oleh ${opts.actorName}.` : '')
    await db.notificationLog.create({
      data: {
        userId: d.head.id,
        channel: 'APLIKASI',
        recipient: d.head.email,
        template: REMINDER_TEMPLATE,
        payload: JSON.stringify({
          title,
          body,
          tab: 'weekly-input',
          divisionId: d.divisionId,
          divisionName: d.divisionName,
          entityId: d.entityId,
          entityName: d.entityName,
          weekKey: week.key,
          source: opts.source,
        }),
        status: 'SENT',
        sentAt: new Date(),
      },
    })
    sent += 1
    results.push({ ...d, outcome: 'TERKIRIM' })
  }

  return { week, sent, results }
}
