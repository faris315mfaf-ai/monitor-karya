import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { auditPic, notifyInApp, readJson, str } from '@/lib/pic-access'
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
 *                                                     selama minggu belum dikunci dan belum diteruskan.
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
async function writeContext(div: LedDivision, now: Date) {
  const period = weekPeriodOf(now)
  const dl = weeklyDeadlines(now)
  const { isoYear, isoWeek } = isoWeekOf(now)
  const report = await db.weeklyDivisionReport.findUnique({
    where: { divisionId_isoYear_isoWeek: { divisionId: div.id, isoYear, isoWeek } },
    select: { id: true, forwardedAt: true },
  })
  return { period, dl, isoYear, isoWeek, report }
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
    const now = new Date()
    const ctx = await writeContext(div, now)
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
    await auditPic(req, user, 'KADIV_SAVE_WEEKLY_SUMMARY', 'WEEKLY_SUMMARY', row.id, { divisionId: div.id, week: ctx.period.key, points }, before ? { points: before.points } : undefined)
    return NextResponse.json({ ok: true, updatedAt: row.updatedAt.toISOString() })
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
    const now = new Date()
    const ctx = await writeContext(div, now)
    const key = { divisionId_isoYear_isoWeek: { divisionId: div.id, isoYear: ctx.isoYear, isoWeek: ctx.isoWeek } }

    if (action === 'unsend') {
      const block = summaryBlock({
        now, weekStart: ctx.period.start, currentWeekStart: isoWeekStart(now), handoverBy: ctx.dl.handoverBy, lockAt: ctx.dl.lockAt,
        forwarded: Boolean(ctx.report?.forwardedAt), sending: false, pendingReview: 0, confirmPending: true,
      })
      if (block) return NextResponse.json({ error: block.message, code: block.code }, { status: 409 })
      const r = await db.weeklyDivisionSummary.updateMany({
        where: { divisionId: div.id, isoYear: ctx.isoYear, isoWeek: ctx.isoWeek, status: 'TERKIRIM' },
        data: { status: 'DRAF', sentAt: null, sentById: null, updatedById: user.id },
      })
      if (r.count === 0) return NextResponse.json({ error: 'Ringkasan ini belum dikirim' }, { status: 409 })
      await auditPic(req, user, 'KADIV_UNSEND_WEEKLY_SUMMARY', 'WEEKLY_SUMMARY', `${div.id}:${ctx.period.key}`, { divisionId: div.id, week: ctx.period.key })
      return NextResponse.json({ ok: true })
    }

    // Kirim: angka dihitung ulang di server saat ini juga (potret yang dibaca Direktur).
    const view = await buildWeeklySummary(div, ctx.period.key, now)
    if (!view) return NextResponse.json({ error: 'Minggu tidak valid' }, { status: 422 })
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
    if (view.saved?.status === 'TERKIRIM') return NextResponse.json({ error: 'Ringkasan minggu ini sudah dikirim', code: 'SENT' }, { status: 409 })

    const finalPoints = points ?? (view.saved?.points.length ? view.saved.points : view.live.points)
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
      create: {
        divisionId: div.id, isoYear: ctx.isoYear, isoWeek: ctx.isoWeek, weeklyReportId: ctx.report?.id ?? null,
        ...stats, points: finalPoints, status: 'TERKIRIM', sentAt: now, sentById: user.id, updatedById: user.id,
      },
      update: { ...stats, points: finalPoints, status: 'TERKIRIM', sentAt: now, sentById: user.id, updatedById: user.id, weeklyReportId: ctx.report?.id ?? undefined },
      select: { id: true },
    })
    const directors = await entityDirectors(div.entityId)
    await notifyInApp(directors, TEMPLATE, {
      title: `Ringkasan mingguan ${div.name} M${ctx.isoWeek}`,
      body: `${stats.outputsAccepted} output diterima, ${stats.projectsOnTrack} dari ${stats.projectsTotal} proyek sesuai jadwal, ${stats.openObstacles} kendala terbuka. Dikirim oleh ${user.name}.`,
      tab: 'dashboard',
      actorName: user.name,
    })
    await auditPic(req, user, 'KADIV_SEND_WEEKLY_SUMMARY', 'WEEKLY_SUMMARY', row.id, {
      divisionId: div.id, week: ctx.period.key, ...stats, points: finalPoints, confirmedPending: stats.pendingReview > 0, directors: directors.map((d) => d.name),
    })
    return NextResponse.json({ ok: true, sentAt: now.toISOString(), directors: directors.map((d) => ({ id: d.id, name: d.name })) })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NOT_READY }, { status: 503 })
    console.error('[kadiv/weekly-summary] POST:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Ringkasan belum terkirim' }, { status: 500 })
  }
}
