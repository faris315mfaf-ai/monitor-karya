import 'server-only'

import { db } from '@/lib/db'
import {
  WEEKLY_HANDOVER_LABEL,
  WEEKLY_LOCK_LABEL,
  isoWeekOf,
  isWeeklyLocked,
  startOfWibDay,
  weekPeriodOf,
  weeklyDeadlines,
  type Period,
} from '@/lib/lock'

/**
 * Pengingat ke divisi yang belum melapor (8 Sep 2026).
 *
 * "Belum melapor" berarti laporan minggu berjalan belum diserahkan: belum ada
 * barisnya, atau masih DRAFT. Pesannya masuk ke lonceng aplikasi kepala
 * divisi yang bersangkutan (NotificationLog kanal APLIKASI). Satu divisi
 * paling banyak diingatkan sekali per hari untuk minggu yang sama, jadi cron
 * pagi dan tombol manual tidak saling menumpuk.
 *
 * Sejak 6 Okt 2026 pemanggil boleh mempersempit ke satu divisi (`divisionId`)
 * dan memilih minggunya (`period`), misalnya Direktur yang mengingatkan satu
 * divisi untuk minggu laporan yang sedang tampil. Tanpa keduanya perilakunya
 * sama seperti dulu: semua divisi dalam cakupan, minggu berjalan.
 */

export type ReminderTarget = {
  /** Hanya divisi ini (harus berada di dalam `entityIds`). */
  divisionId?: string | null
  /** Minggu yang ditagih; bawaan minggu berjalan. */
  period?: Period | null
}

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

/** Divisions in scope whose report for the given week (default: this week) has not been handed over yet. */
export async function listUnreportedDivisions(
  entityIds: string[] | null,
  target: ReminderTarget = {}
): Promise<{
  week: { key: string; isoYear: number; isoWeek: number }
  divisions: UnreportedDivision[]
}> {
  const period = target.period ?? weekPeriodOf(new Date())
  const { isoYear, isoWeek } = isoWeekOf(period.start)

  const divisions = await db.division.findMany({
    where: {
      isActive: true,
      ...(entityIds ? { entityId: { in: entityIds } } : {}),
      ...(target.divisionId ? { id: target.divisionId } : {}),
    },
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

/** Kalimat tenggat untuk minggu yang ditagih, mengikuti jam sekarang. */
function deadlineSentence(period: Period, now: Date): string {
  if (isWeeklyLocked(period.start, now)) {
    return `Minggu itu sudah dikunci sejak ${WEEKLY_LOCK_LABEL}; hubungi Admin PT untuk permohonan buka kunci.`
  }
  if (now >= weeklyDeadlines(period.start).handoverBy) {
    return `Tenggat serah ${WEEKLY_HANDOVER_LABEL} sudah lewat; serahkan sebelum dikunci ${WEEKLY_LOCK_LABEL}.`
  }
  return `Serahkan paling lambat ${WEEKLY_HANDOVER_LABEL}.`
}

export async function remindUnreportedDivisions(
  opts: {
    entityIds: string[] | null
    source: 'MANUAL' | 'CRON'
    actorName?: string | null
  } & ReminderTarget
): Promise<ReminderResult> {
  const now = new Date()
  const period = opts.period ?? weekPeriodOf(now)
  const { week, divisions } = await listUnreportedDivisions(opts.entityIds, { divisionId: opts.divisionId, period })
  const today = startOfWibDay(now)

  // Yang sudah diingatkan hari ini untuk minggu yang sama dilewati — payload
  // menyimpan divisionId dan weekKey. Catatan lama tanpa weekKey dianggap
  // minggu berjalan, minggu yang dulu selalu mereka tagih.
  const currentKey = weekPeriodOf(now).key
  const sentToday = await db.notificationLog.findMany({
    where: { template: REMINDER_TEMPLATE, createdAt: { gte: today } },
    select: { userId: true, payload: true },
  })
  const alreadyKey = new Set(
    sentToday.map((n) => {
      try {
        const p = JSON.parse(n.payload) as { divisionId?: string; weekKey?: string }
        return `${n.userId}:${p.divisionId ?? ''}:${p.weekKey ?? currentKey}`
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
    if (alreadyKey.has(`${d.head.id}:${d.divisionId}:${week.key}`)) {
      results.push({ ...d, outcome: 'SUDAH_HARI_INI' })
      continue
    }
    const title = `Laporan mingguan ${d.divisionName} belum diserahkan`
    const body =
      `Minggu ${week.isoWeek}/${week.isoYear} untuk ${d.entityName} ` +
      `${d.statusHeader ? 'masih berupa draf' : 'belum diisi'}. ` +
      deadlineSentence(period, now) +
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
