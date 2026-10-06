import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { readJson, str } from '@/lib/pic-access'
import { buildWeeklySummary, entityDirectors, isMissingTable, pickLedDivision, type LedDivision } from '@/lib/kadiv'
import { normalizePoints, summaryBlock } from '@/lib/kadiv-math'
import { isoWeekOf, isoWeekStart, weekPeriodOf, weeklyDeadlines } from '@/lib/lock'

/**
 * Ringkasan laporan mingguan kepala divisi untuk Direktur [F2-KADIV]
 * (03-kepala-divisi.md §8, bentuk data di docs/fitur/peran-kadiv.md).
 * Hanya kepala divisi untuk divisi yang ia pimpin.
 *
 *   GET  ?divisionId=&week=2026-W41                 — draf otomatis + baris tersimpan + status laporan mingguan
 *   PUT  { divisionId, points: string[] }           — simpan draf (1–3 poin, ≤ 280 huruf); minggu berjalan saja
 *   POST { divisionId, action: 'send', points?, confirmPending? }
 *                                                   — "Kirim ke Direktur": potret angka + poin, status TERKIRIM,
 *                                                     notifikasi lonceng ke direktur PT. Bila masih ada output
 *                                                     menunggu review sebelum tenggat serah: 409 PENDING_REVIEW
 *                                                     kecuali confirmPending = true.
 *   POST { divisionId, action: 'unsend' }           — tarik kembali ke draf (dipakai toast "Urungkan");
 *                                                     oleh pengirim selama 15 menit, sebelum minggu dikunci atau diteruskan.
 *
 * Ringkasan ikut alur laporan mingguan: capaian tetap diserahkan ke Admin PT
 * (Kamis 17.00) lalu diteruskan ke holding; Direktur membaca ringkasan yang
 * sudah TERKIRIM lewat /api/ringkasan (src/lib/kadiv.ts → readDivisionSummaries).
 */

const NOT_READY = 'Ringkasan mingguan belum aktif. Minta TI menjalankan migrasi 0021.'
const TEMPLATE = 'RINGKASAN_MINGGUAN_DIVISI'

async function division(user: SessionUser, divisionId: string | null) {
  const { current } = await pickLedDivision(user, divisionId)
  return current
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const sp = req.nextUrl.searchParams
  const week = (sp.get('week') || '').slice(0, 10) || null
  try {
    const div = await division(user, (sp.get('divisionId') || '').slice(0, 64) || null)
    if (!div) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    const view = await buildWeeklySummary(div, week)
    if (!view) return NextResponse.json({ error: 'Minggu tidak valid' }, { status: 422 })
    return NextResponse.json(view)
  } catch (err) {
    console.error('[kadiv/weekly-summary] GET:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Ringkasan mingguan belum termuat' }, { status: 500 })
  }
}

/** Kunci minggu berjalan + pemeriksaan bersama untuk PUT/POST. */
async function writeContext(div: LedDivision, now: Date, client: Prisma.TransactionClient) {
  const period = weekPeriodOf(now)
  const dl = weeklyDeadlines(now)
  const { isoYear, isoWeek } = isoWeekOf(now)
  await client.$queryRaw`SELECT "id" FROM "Division" WHERE "id" = ${div.id} FOR UPDATE`
  await client.$queryRaw`SELECT "id" FROM "WeeklyDivisionReport" WHERE "divisionId" = ${div.id} AND "isoYear" = ${isoYear} AND "isoWeek" = ${isoWeek} FOR UPDATE`
  const report = await client.weeklyDivisionReport.findUnique({
    where: { divisionId_isoYear_isoWeek: { divisionId: div.id, isoYear, isoWeek } },
    select: { id: true, forwardedAt: true },
  })
  return { period, dl, isoYear, isoWeek, report }
}

async function auditSummary(client: Prisma.TransactionClient, req: Request, user: SessionUser, action: string, targetType: string, targetId: string, after?: unknown, before?: unknown) {
  await client.auditLog.create({ data: {
    actorId: user.id, action, targetType, targetId,
    beforeData: before === undefined ? null : JSON.stringify(before),
    afterData: after === undefined ? null : JSON.stringify(after),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: req.headers.get('user-agent') || null,
  } })
}

export async function PUT(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const points = normalizePoints(body.points)
  if (!points) return NextResponse.json({ error: 'Tulis 1 sampai 3 poin, masing-masing paling banyak 280 huruf' }, { status: 422 })
  try {
    const div = await division(user, str(body, 'divisionId', 64) || null)
    if (!div) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    return await db.$transaction(async (tx) => {
      const db = tx
      let now = new Date()
      const ctx = await writeContext(div, now, db)
      now = new Date()
      const block = summaryBlock({
        now, weekStart: ctx.period.start, currentWeekStart: isoWeekStart(now), handoverBy: ctx.dl.handoverBy, lockAt: ctx.dl.lockAt,
        forwarded: Boolean(ctx.report?.forwardedAt), sending: false, pendingReview: 0, confirmPending: true,
      })
      if (block) return NextResponse.json({ error: block.message, code: block.code }, { status: 409 })

      const key = { divisionId_isoYear_isoWeek: { divisionId: div.id, isoYear: ctx.isoYear, isoWeek: ctx.isoWeek } }
      const before = await db.weeklyDivisionSummary.findUnique({ where: key, select: { status: true, points: true } })
      if (before?.status === 'TERKIRIM') {
        return NextResponse.json({ error: 'Ringkasan sudah dikirim ke Direktur. Tarik kembali dulu untuk menyuntingnya.', code: 'SENT' }, { status: 409 })
      }
      const row = await db.weeklyDivisionSummary.upsert({
        where: key,
        create: { divisionId: div.id, isoYear: ctx.isoYear, isoWeek: ctx.isoWeek, weeklyReportId: ctx.report?.id ?? null, points, updatedById: user.id },
        update: { points, updatedById: user.id, weeklyReportId: ctx.report?.id ?? undefined },
        select: { id: true, updatedAt: true },
      })
      await auditSummary(db, req, user, 'KADIV_SAVE_WEEKLY_SUMMARY', 'WEEKLY_SUMMARY', row.id, { divisionId: div.id, week: ctx.period.key, points }, before ? { points: before.points } : undefined)
      return NextResponse.json({ ok: true, updatedAt: row.updatedAt.toISOString() })
    }, { isolationLevel: 'ReadCommitted' })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NOT_READY }, { status: 503 })
    console.error('[kadiv/weekly-summary] PUT:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Draf ringkasan belum tersimpan' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const action = str(body, 'action', 20)
  if (action !== 'send' && action !== 'unsend') return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 })
  let points: string[] | null = null
  if (action === 'send' && body.points !== undefined) {
    points = normalizePoints(body.points)
    if (!points) return NextResponse.json({ error: 'Tulis 1 sampai 3 poin, masing-masing paling banyak 280 huruf' }, { status: 422 })
  }
  try {
    const div = await division(user, str(body, 'divisionId', 64) || null)
    if (!div) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    const snapshotAt = new Date()
    const view = action === 'send' ? await buildWeeklySummary(div, weekPeriodOf(snapshotAt).key, snapshotAt) : null
    const directors = action === 'send' ? await entityDirectors(div.entityId) : []
    return await db.$transaction(async (tx) => {
      const db = tx
      let now = new Date()
      const ctx = await writeContext(div, now, db)
      now = new Date()
      const key = { divisionId_isoYear_isoWeek: { divisionId: div.id, isoYear: ctx.isoYear, isoWeek: ctx.isoWeek } }

      if (action === 'unsend') {
        const block = summaryBlock({
          now, weekStart: ctx.period.start, currentWeekStart: isoWeekStart(now), handoverBy: ctx.dl.handoverBy, lockAt: ctx.dl.lockAt,
          forwarded: Boolean(ctx.report?.forwardedAt), sending: false, pendingReview: 0, confirmPending: true,
        })
        if (block) return NextResponse.json({ error: block.message, code: block.code }, { status: 409 })
        const r = await db.weeklyDivisionSummary.updateMany({
          where: { divisionId: div.id, isoYear: ctx.isoYear, isoWeek: ctx.isoWeek, status: 'TERKIRIM', sentById: user.id, sentAt: { gt: new Date(now.getTime() - 15 * 60_000), lte: now } },
          data: { status: 'DRAF', sentAt: null, sentById: null, updatedById: user.id },
        })
        if (r.count === 0) return NextResponse.json({ error: 'Ringkasan belum dikirim oleh Anda atau jendela urungkan 15 menit sudah berakhir' }, { status: 409 })
        await auditSummary(db, req, user, 'KADIV_UNSEND_WEEKLY_SUMMARY', 'WEEKLY_SUMMARY', `${div.id}:${ctx.period.key}`, { divisionId: div.id, week: ctx.period.key })
        return NextResponse.json({ ok: true })
      }

      // Potret live dibaca di server sebelum transaksi; status tersimpan dan
      // penerusan diperiksa ulang di bawah kunci sebelum potret diklaim.
      if (!view) return NextResponse.json({ error: 'Minggu tidak valid' }, { status: 422 })
      if (view.week.key !== ctx.period.key) return NextResponse.json({ error: 'Minggu sudah berubah. Muat ulang ringkasan.' }, { status: 409 })
      const saved = await db.weeklyDivisionSummary.findUnique({ where: key })
      if (saved?.status === 'TERKIRIM') return NextResponse.json({ error: 'Ringkasan minggu ini sudah dikirim', code: 'SENT' }, { status: 409 })
      const block = summaryBlock({
        now, weekStart: ctx.period.start, currentWeekStart: isoWeekStart(now), handoverBy: ctx.dl.handoverBy, lockAt: ctx.dl.lockAt,
        forwarded: Boolean(ctx.report?.forwardedAt), sending: true, pendingReview: view.live.pendingReview, confirmPending: body.confirmPending === true,
      })
      if (block) {
        return NextResponse.json(
          { error: block.message, code: block.code, ...(block.code === 'PENDING_REVIEW' ? { pendingReview: block.pendingReview } : {}) },
          { status: 409 },
        )
      }

      const finalPoints = points ?? (saved?.points.length ? saved.points : view.live.points)
      const stats = {
        outputsAccepted: view.live.outputsAccepted,
        outputsTarget: view.live.outputsTarget,
        projectsOnTrack: view.live.projectsOnTrack,
        projectsTotal: view.live.projectsTotal,
        openObstacles: view.live.openObstacles,
        pendingReview: view.live.pendingReview,
      }
      const row = await db.weeklyDivisionSummary.upsert({
        where: key,
        create: { divisionId: div.id, isoYear: ctx.isoYear, isoWeek: ctx.isoWeek, status: 'DRAF', points: finalPoints, updatedById: user.id },
        update: {},
        select: { id: true },
      })
      const claimed = await db.weeklyDivisionSummary.updateMany({
        where: { id: row.id, status: 'DRAF' },
        data: { ...stats, points: finalPoints, status: 'TERKIRIM', sentAt: now, sentById: user.id, updatedById: user.id, weeklyReportId: ctx.report?.id ?? null },
      })
      if (claimed.count !== 1) return NextResponse.json({ error: 'Ringkasan minggu ini sudah dikirim', code: 'SENT' }, { status: 409 })
      const payload = {
        title: `Ringkasan mingguan ${div.name} M${ctx.isoWeek}`,
        body: `${stats.outputsAccepted} output diterima, ${stats.projectsOnTrack} dari ${stats.projectsTotal} proyek sesuai jadwal, ${stats.openObstacles} kendala terbuka. Dikirim oleh ${user.name}.`,
        tab: 'dashboard',
        actorName: user.name,
      }
      if (directors.length) await db.notificationLog.createMany({
        data: directors.map((d) => ({ userId: d.id, channel: 'APLIKASI', recipient: d.email, template: TEMPLATE, status: 'SENT', sentAt: now, payload: JSON.stringify(payload) })),
      })
      await auditSummary(db, req, user, 'KADIV_SEND_WEEKLY_SUMMARY', 'WEEKLY_SUMMARY', row.id, {
        divisionId: div.id, week: ctx.period.key, ...stats, points: finalPoints, confirmedPending: stats.pendingReview > 0, directors: directors.map((d) => d.name),
      })
      return NextResponse.json({ ok: true, sentAt: now.toISOString(), directors: directors.map((d) => ({ id: d.id, name: d.name })) })
    }, { isolationLevel: 'ReadCommitted' })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NOT_READY }, { status: 503 })
    console.error('[kadiv/weekly-summary] POST:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Ringkasan belum terkirim' }, { status: 500 })
  }
}
