import 'server-only'

import { db } from '@/lib/db'

/**
 * Buka kunci laporan (6 Okt 2026). Alurnya mengikuti src/lib/rbac.ts:
 * unlock:request (Admin PT, TI, Super Admin; PIC untuk laporan harian proyeknya) mengajukan → unlock:approve
 * (Direksi Holding, TI, Super Admin) menyetujui/menolak → unlock:execute
 * (TI, Super Admin) menjalankan: laporan dibuka sampai `unlockUntil`, lalu
 * dikunci lagi otomatis (cron) atau manual.
 *
 * Endpoint tulis laporan yang ingin menghormati buka kunci memanggil
 * `activeUnlockFor(targetType, targetId)` sebelum menolak karena terkunci.
 */

export const UNLOCK_TARGETS = ['DAILY_REPORT', 'WEEKLY_REPORT'] as const
export type UnlockTarget = (typeof UNLOCK_TARGETS)[number]

export const DEFAULT_UNLOCK_HOURS = 24
export const MAX_UNLOCK_HOURS = 72

const WIB = 'Asia/Jakarta'
const fmtDay = (d: Date) => new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: WIB }).format(d)

/** Normalisasi nama target lama ('WEEKLY'/'DAILY') ke nilai skema. */
export function normalizeTarget(t: string): UnlockTarget | null {
  if (t === 'DAILY_REPORT' || t === 'DAILY') return 'DAILY_REPORT'
  if (t === 'WEEKLY_REPORT' || t === 'WEEKLY') return 'WEEKLY_REPORT'
  return null
}

/** Laporan yang dituju: entitas pemiliknya, label tampilan, dan apakah sedang terkunci. */
export async function resolveTarget(
  type: UnlockTarget,
  id: string
): Promise<{ entityId: string; label: string; isLocked: boolean } | null> {
  if (type === 'DAILY_REPORT') {
    const r = await db.dailyProjectReport.findUnique({
      where: { id },
      select: { entityId: true, reportDate: true, isLocked: true, project: { select: { name: true } } },
    })
    return r ? { entityId: r.entityId, label: `Laporan harian ${r.project.name} · ${fmtDay(r.reportDate)}`, isLocked: r.isLocked } : null
  }
  const r = await db.weeklyDivisionReport.findUnique({
    where: { id },
    select: { entityId: true, isoWeek: true, isoYear: true, isLocked: true, statusHeader: true, division: { select: { name: true } } },
  })
  return r
    ? { entityId: r.entityId, label: `Laporan mingguan Divisi ${r.division.name} · M${r.isoWeek}/${r.isoYear}`, isLocked: r.isLocked || r.statusHeader === 'TERKUNCI' }
    : null
}

export async function targetLabels(rows: { targetType: string; targetId: string }[]): Promise<Map<string, string>> {
  const daily = rows.filter((r) => normalizeTarget(r.targetType) === 'DAILY_REPORT').map((r) => r.targetId)
  const weekly = rows.filter((r) => normalizeTarget(r.targetType) === 'WEEKLY_REPORT').map((r) => r.targetId)
  const [d, w] = await Promise.all([
    daily.length
      ? db.dailyProjectReport.findMany({ where: { id: { in: daily } }, select: { id: true, reportDate: true, project: { select: { name: true } } } })
      : Promise.resolve([]),
    weekly.length
      ? db.weeklyDivisionReport.findMany({ where: { id: { in: weekly } }, select: { id: true, isoWeek: true, isoYear: true, division: { select: { name: true } } } })
      : Promise.resolve([]),
  ])
  const m = new Map<string, string>()
  for (const r of d) m.set(r.id, `Laporan harian ${r.project.name} · ${fmtDay(r.reportDate)}`)
  for (const r of w) m.set(r.id, `Laporan mingguan Divisi ${r.division.name} · M${r.isoWeek}/${r.isoYear}`)
  return m
}

/** Membuka atau mengunci kembali laporan yang dituju. */
export async function setReportLock(
  tx: Pick<typeof db, 'dailyProjectReport' | 'weeklyDivisionReport'>,
  type: UnlockTarget,
  id: string,
  locked: boolean,
  now = new Date()
): Promise<void> {
  const data = locked ? { isLocked: true, lockedAt: now } : { isLocked: false }
  if (type === 'DAILY_REPORT') await tx.dailyProjectReport.updateMany({ where: { id }, data })
  else await tx.weeklyDivisionReport.updateMany({ where: { id }, data })
}

/** Buka kunci yang sedang berlaku untuk laporan ini, atau null. */
export async function activeUnlockFor(type: UnlockTarget, id: string, now = new Date()) {
  return db.unlockRequest.findFirst({
    where: { targetType: type, targetId: id, status: 'DIEKSEKUSI', reLockedAt: null, unlockUntil: { gt: now } },
    select: { id: true, unlockUntil: true },
  })
}

/** Mengunci kembali laporan yang masa bukanya sudah habis. Dipanggil cron. */
export async function relockExpiredUnlocks(now = new Date()): Promise<number> {
  const due = await db.unlockRequest.findMany({
    where: { status: 'DIEKSEKUSI', reLockedAt: null, unlockUntil: { lte: now } },
    select: { id: true, targetType: true, targetId: true },
    take: 200,
  })
  let n = 0
  for (const u of due) {
    const type = normalizeTarget(u.targetType)
    try {
      await db.$transaction(async (tx) => {
        if (type) await setReportLock(tx, type, u.targetId, true, now)
        await tx.unlockRequest.update({ where: { id: u.id }, data: { reLockedAt: now } })
        await tx.auditLog.create({
          data: { actorId: null, action: 'RELOCK_REPORT', targetType: 'UNLOCK_REQUEST', targetId: u.id, afterData: JSON.stringify({ auto: true }), userAgent: 'sistem' },
        })
      })
      n += 1
    } catch (err) {
      console.error('[unlock] gagal mengunci kembali', u.id, err instanceof Error ? err.message : err)
    }
  }
  return n
}
