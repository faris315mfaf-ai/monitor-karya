import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isGlobalRole, requireApiUser, scopeEntityIds } from '@/lib/auth'
import { isoWeekOf, startOfWibDay } from '@/lib/lock'
import { lastNMonthKeys, monthKeyNow } from '@/lib/wib'
import { serverError } from '@/lib/api-error' // [F3-D]

/**
 * The six series behind Management's charts. Each one answers a question a
 * director actually asks, so nothing here is decoration:
 *
 *   1. Are we improving?            -> six-month trend
 *   2. Which arm is lagging?        -> compliance ranked by sub-holding
 *   3. Where does today stand?      -> today's daily reports by status
 *   4. What is waiting on me?       -> open escalations bucketed by age vs SLA
 *   5. Who has not handed over?     -> this week's division reports by state
 *   6. Where do I intervene?        -> the ten weakest PTs
 */

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTH_LABELS[Number(m) - 1]} ${y.slice(2)}`
}

const DAILY_STATUS_LABEL: Record<string, string> = {
  SELESAI: 'Selesai',
  ON_PROGRESS: 'Berjalan',
  TERKENDALA: 'Terkendala',
  MENUNGGU_KEPUTUSAN: 'Menunggu keputusan',
  TIDAK_ADA_PERUBAHAN: 'Tidak ada perubahan',
}

const WEEKLY_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan',
  DISETUJUI: 'Disetujui',
  TERKUNCI: 'Terkunci',
}

export async function GET() {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  try {
    const monthKeys = lastNMonthKeys(6)
    const thisMonth = monthKeyNow()
    const today = startOfWibDay(new Date())
    const { isoYear, isoWeek } = isoWeekOf(new Date())

    // Management reads the whole group; a narrower role still gets its subtree.
    const allowedIds = await scopeEntityIds(user)
    const entityFilter = allowedIds ? { entityId: { in: allowedIds } } : {}

    const [entities, snapshots, dailyToday, escalations, weekly] = await Promise.all([
      db.entity.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, type: true, path: true, region: true },
      }),
      db.kpiSnapshot.findMany({
        where: { periodType: 'BULANAN', periodKey: { in: monthKeys }, ...entityFilter },
      }),
      db.dailyProjectReport.findMany({
        where: { reportDate: today, ...entityFilter },
        select: { status: true },
      }),
      db.escalation.findMany({
        where: { status: { in: ['DIAJUKAN', 'DITINJAU'] }, ...entityFilter },
        select: { raisedAt: true, slaDays: true },
      }),
      db.weeklyDivisionReport.findMany({
        where: { isoYear, isoWeek, ...entityFilter },
        select: { entityId: true, statusHeader: true },
      }),
    ])

    const byId = new Map(entities.map((e) => [e.id, e]))
    const subHoldings = entities.filter((e) => e.type === 'SUB_HOLDING')

    /**
     * Kelompok tempat sebuah PT dihitung: sub-holding di atasnya bila ada.
     * Pada struktur datar (holding -> PT, sejak 7 Sep 2026) tidak ada
     * sub-holding, jadi tiap PT menjadi kelompoknya sendiri — grafik
     * "per sub-holding" lalu terbaca "per anak perusahaan".
     */
    const groupOf = (entityId: string) => {
      const e = byId.get(entityId)
      if (!e) return null
      return subHoldings.find((sh) => e.path.startsWith(sh.path)) ?? (e.type === 'PT' ? e : null)
    }

    // ---- 1. Six-month trend ------------------------------------------------
    const trend = monthKeys.map((key) => {
      const rows = snapshots.filter((s) => s.periodKey === key)
      const avg = (pick: (r: (typeof rows)[number]) => number) =>
        rows.length ? Math.round((rows.reduce((sum, r) => sum + pick(r), 0) / rows.length) * 10) / 10 : 0
      return {
        label: monthLabel(key),
        kepatuhan: avg((r) => r.complianceScore),
        tepatWaktu: avg((r) => r.onTimeDailyPct),
        mingguan: avg((r) => r.weeklyCompletenessPct),
        bukti: avg((r) => r.evidenceCompletenessPct),
      }
    })

    // ---- 2. Compliance by sub-holding -------------------------------------
    const currentSnaps = snapshots.filter((s) => s.periodKey === thisMonth)
    const groupBuckets = new Map<string, { name: string; total: number; count: number }>()
    for (const snap of currentSnaps) {
      const group = groupOf(snap.entityId)
      if (!group) continue
      const bucket = groupBuckets.get(group.id) ?? { name: group.name, total: 0, count: 0 }
      bucket.total += snap.complianceScore
      bucket.count += 1
      groupBuckets.set(group.id, bucket)
    }
    const bySubHolding = [...groupBuckets.values()]
      .map((b) => ({ name: b.name, skor: Math.round((b.total / b.count) * 10) / 10, jumlahPt: b.count }))
      .sort((a, b) => b.skor - a.skor)

    // ---- 3. Today's daily reports by status --------------------------------
    const statusCounts = dailyToday.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {})
    const dailyStatus = Object.keys(DAILY_STATUS_LABEL).map((key) => ({
      status: key,
      label: DAILY_STATUS_LABEL[key],
      jumlah: statusCounts[key] ?? 0,
    }))

    // ---- 4. Open escalations by age against their SLA ----------------------
    const buckets = [
      { bucket: '0–3 hari', min: 0, max: 3 },
      { bucket: '4–7 hari', min: 4, max: 7 },
      { bucket: '8–14 hari', min: 8, max: 14 },
      { bucket: '> 14 hari', min: 15, max: Infinity },
    ]
    const escalationAging = buckets.map((b) => {
      const inRange = escalations.filter((e) => {
        const age = Math.floor((Date.now() - e.raisedAt.getTime()) / 86400000)
        return age >= b.min && age <= b.max
      })
      return {
        bucket: b.bucket,
        dalamSla: inRange.filter(
          (e) => Math.floor((Date.now() - e.raisedAt.getTime()) / 86400000) <= e.slaDays
        ).length,
        lewatSla: inRange.filter(
          (e) => Math.floor((Date.now() - e.raisedAt.getTime()) / 86400000) > e.slaDays
        ).length,
      }
    })

    // ---- 5. This week's division reports, per sub-holding ------------------
    const weeklyBuckets = new Map<string, Record<string, number | string>>()
    for (const w of weekly) {
      const group = groupOf(w.entityId)
      if (!group) continue
      const row = weeklyBuckets.get(group.id) ?? {
        name: group.name,
        Draft: 0,
        'Menunggu persetujuan': 0,
        Disetujui: 0,
        Terkunci: 0,
      }
      const label = WEEKLY_STATUS_LABEL[w.statusHeader]
      if (label) row[label] = (row[label] as number) + 1
      weeklyBuckets.set(group.id, row)
    }
    const weeklyByGroup = [...weeklyBuckets.values()]

    // ---- 6. The ten weakest PTs -------------------------------------------
    const lowestPt = currentSnaps
      .map((s) => {
        const e = byId.get(s.entityId)
        return {
          name: e?.name ?? '—',
          code: e?.code ?? '',
          region: e?.region ?? '',
          skor: Math.round(s.complianceScore * 10) / 10,
        }
      })
      .sort((a, b) => a.skor - b.skor)
      .slice(0, 10)

    const scores = currentSnaps.map((s) => s.complianceScore)
    return NextResponse.json({
      periode: { bulanIni: thisMonth, isoWeek, isoYear },
      ringkasan: {
        entitas: currentSnaps.length,
        rataKepatuhan: scores.length
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : 0,
        diBawahTarget: scores.filter((s) => s < 75).length,
        eskalasiTerbuka: escalations.length,
        eskalasiLewatSla: escalations.filter(
          (e) => Math.floor((Date.now() - e.raisedAt.getTime()) / 86400000) > e.slaDays
        ).length,
      },
      trend,
      bySubHolding,
      dailyStatus,
      escalationAging,
      weeklyByGroup,
      lowestPt,
    })
  } catch (err) {
    // [F3-D] Pesan umum ke klien; detail galat hanya ke log server.
    return serverError(err, 'Gagal menyusun data grafik. Coba lagi.', 'management-charts GET')
  }
}
