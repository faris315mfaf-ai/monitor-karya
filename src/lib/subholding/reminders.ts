import 'server-only'

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { isWorkingDay, startOfWibDay, wibDateKey } from '@/lib/lock'
import { formatDateLong } from '@/lib/format'
import { ptsOfSubholding, type ShSubholding } from '@/lib/subholding/scope'

type Client = Prisma.TransactionClient | typeof db

const DAY_MS = 86_400_000

/** Tengah malam WIB hari kerja (Senin–Jumat) terakhir SEBELUM hari `now`. */
export function previousWorkingDay(now: Date = new Date()): Date {
  let day = new Date(startOfWibDay(now).getTime() - DAY_MS)
  // Paling jauh 7 langkah; Senin → Jumat sebelumnya.
  for (let i = 0; i < 7 && !isWorkingDay(day); i++) day = new Date(day.getTime() - DAY_MS)
  return day
}

export type ShReminder = { id: string; text: string; createdAt: string }

/**
 * Pengingat kotak masuk Admin subholding: PT di subholding yang tidak punya
 * laporan (status apa pun) pada hari kerja sebelumnya.
 */
export async function missingReportReminders(
  sub: Pick<ShSubholding, 'id' | 'path'>,
  now: Date = new Date(),
  client: Client = db
): Promise<ShReminder[]> {
  const day = previousWorkingDay(now)
  const [pts, reported] = await Promise.all([
    ptsOfSubholding(sub, client),
    client.subholdingReport.findMany({
      where: { subholdingId: sub.id, reportDate: day },
      select: { ptId: true },
    }),
  ])
  const done = new Set(reported.map((r) => r.ptId))
  const key = wibDateKey(day)
  const createdAt = startOfWibDay(now).toISOString()
  const dayLabel = formatDateLong(day)
  return pts
    .filter((pt) => !done.has(pt.id))
    .map((pt) => ({
      id: `pengingat-${pt.id}-${key}`,
      text: `${pt.name} belum memiliki laporan pada ${dayLabel}.`,
      createdAt,
    }))
}
