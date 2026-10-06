import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { auditPic, notifyInApp, readJson } from '@/lib/pic-access'
import { canManageDivision } from '@/lib/kadiv'
import { cleanText, hit, tooManyRequests } from '@/lib/security'
import { serverError } from '@/lib/api-error'
import { COMMENT_MAX, UNDO_WINDOW_MINUTES } from '@/lib/oversight-shared'
import {
  MIGRATION_PENDING_MESSAGE, isMissingTable, loadWeeklyReport, namesOf, weeklyRelation, weeklySubmitted,
} from '@/lib/oversight'

/**
 * [F2-DIREKTUR] Tanggapan atas laporan mingguan divisi ("Beri tanggapan",
 * 02-direktur.md). Pengawas dalam cakupan PT menulis; kepala divisi pemilik
 * laporan membaca dan membalas; Admin PT di PT itu dan TI hanya membaca.
 *
 *   GET    ?weeklyReportId=  — percakapan satu laporan (lama → baru)
 *   GET    ?divisionId=      — tanggapan 8 minggu terakhir untuk divisi (kepala divisinya / Admin PT / TI)
 *   POST   { weeklyReportId, body }      — tulis tanggapan / balasan
 *   PATCH  { weeklyReportId }            — kepala divisi menandai tanggapan sudah dibaca
 *   DELETE { id }                        — Urungkan: hapus tanggapan sendiri ≤ 15 menit
 */

const UNDO_MS = UNDO_WINDOW_MINUTES * 60000

type CommentRow = { id: string; weeklyReportId: string; authorId: string; body: string; readAt: Date | null; createdAt: Date }

async function shape(rows: CommentRow[], meId: string) {
  const names = await namesOf(rows.map((r) => r.authorId))
  return rows.map((r) => ({
    id: r.id,
    weeklyReportId: r.weeklyReportId,
    body: r.body,
    createdAt: r.createdAt,
    readAt: r.readAt,
    authorId: r.authorId,
    authorName: names.get(r.authorId)?.name ?? 'Pengguna',
    authorRole: names.get(r.authorId)?.role ?? null,
    mine: r.authorId === meId,
  }))
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const sp = req.nextUrl.searchParams
  try {
    const divisionId = cleanText(sp.get('divisionId'), 64)
    if (divisionId) {
      const div = await canManageDivision(user, divisionId)
      if (!div) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
      const reports = await db.weeklyDivisionReport.findMany({
        where: { divisionId: div.id },
        orderBy: [{ isoYear: 'desc' }, { isoWeek: 'desc' }],
        take: 8,
        select: { id: true, isoYear: true, isoWeek: true },
      })
      const rows = reports.length
        ? await db.weeklyReportComment.findMany({
            where: { weeklyReportId: { in: reports.map((r) => r.id) } },
            orderBy: { createdAt: 'asc' },
            take: 200,
          })
        : []
      const items = await shape(rows, user.id)
      const isHead = div.headUserId === user.id
      return NextResponse.json({
        divisionId: div.id,
        divisionName: div.name,
        canReply: isHead,
        unread: isHead ? rows.filter((r) => r.authorId !== user.id && !r.readAt).length : 0,
        reports: reports
          .map((r) => ({
            weeklyReportId: r.id,
            label: `M${r.isoWeek}`,
            isoYear: r.isoYear,
            isoWeek: r.isoWeek,
            comments: items.filter((c) => c.weeklyReportId === r.id),
          }))
          .filter((r) => r.comments.length > 0),
      })
    }

    const report = await loadWeeklyReport(sp.get('weeklyReportId'))
    const rel = report ? await weeklyRelation(user, report) : null
    if (!report || !rel) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
    const rows = await db.weeklyReportComment.findMany({
      where: { weeklyReportId: report.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    return NextResponse.json({
      weeklyReportId: report.id,
      canComment: (rel === 'READER' || rel === 'HEAD') && weeklySubmitted(report),
      undoMinutes: UNDO_WINDOW_MINUTES,
      unread: rel === 'HEAD' ? rows.filter((r) => r.authorId !== user.id && !r.readAt).length : 0,
      items: await shape(rows, user.id),
    })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ items: [], reports: [], unread: 0, canComment: false, pendingMigration: true })
    return serverError(err, 'Tanggapan belum termuat. Coba lagi.', 'weekly-comments GET')
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const rate = hit(`weekly-comment:${user.id}`, 30, 10 * 60000)
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec, 'Terlalu banyak tanggapan dalam waktu singkat. Coba lagi sebentar lagi.')
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const text = cleanText(body.body, COMMENT_MAX)
  if (text.length < 2) return NextResponse.json({ error: 'Tulis tanggapan Anda dulu' }, { status: 422 })

  try {
    const report = await loadWeeklyReport(body.weeklyReportId)
    const rel = report ? await weeklyRelation(user, report) : null
    if (!report || !rel) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
    if (rel !== 'READER' && rel !== 'HEAD') {
      return NextResponse.json({ error: 'Peran Anda hanya membaca tanggapan laporan ini' }, { status: 403 })
    }
    if (!weeklySubmitted(report)) return NextResponse.json({ error: 'Laporan ini belum diserahkan' }, { status: 409 })

    const row = await db.weeklyReportComment.create({
      data: { weeklyReportId: report.id, authorId: user.id, body: text },
    })
    await auditPic(req, user, 'COMMENT_WEEKLY_REPORT', 'WEEKLY_REPORT', report.id, { commentId: row.id, length: text.length })

    const division = await db.division.findUnique({
      where: { id: report.divisionId },
      select: { name: true, headUser: { select: { id: true, email: true, isActive: true } } },
    })
    const preview = text.length > 140 ? text.slice(0, 137) + '…' : text
    if (rel === 'READER') {
      const head = division?.headUser
      if (head && head.isActive && head.id !== user.id) {
        await notifyInApp([{ id: head.id, email: head.email }], 'WEEKLY_COMMENT', {
          title: `Tanggapan laporan mingguan M${report.isoWeek}`,
          body: `${user.name}: ${preview}`,
          tab: 'work-desk',
          actorName: user.name,
        })
      }
    } else {
      // Balasan kepala divisi: kabari pengawas yang sudah menanggapi laporan ini.
      const authors = await db.weeklyReportComment.findMany({
        where: { weeklyReportId: report.id, authorId: { not: user.id } },
        select: { authorId: true },
        distinct: ['authorId'],
      })
      const to = authors.length
        ? await db.user.findMany({ where: { id: { in: authors.map((a) => a.authorId) }, isActive: true }, select: { id: true, email: true } })
        : []
      await notifyInApp(to, 'WEEKLY_COMMENT_REPLY', {
        title: `Balasan Divisi ${division?.name ?? ''} · M${report.isoWeek}`.trim(),
        body: `${user.name}: ${preview}`,
        tab: 'dashboard',
        actorName: user.name,
      })
    }

    const [item] = await shape([row], user.id)
    return NextResponse.json({ ok: true, item, undoMinutes: UNDO_WINDOW_MINUTES }, { status: 201 })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 })
    return serverError(err, 'Tanggapan belum terkirim. Coba lagi.', 'weekly-comments POST')
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  try {
    const report = await loadWeeklyReport(body.weeklyReportId)
    const rel = report ? await weeklyRelation(user, report) : null
    if (!report || !rel) return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
    if (rel !== 'HEAD') return NextResponse.json({ ok: true, marked: 0 })
    const res = await db.weeklyReportComment.updateMany({
      where: { weeklyReportId: report.id, authorId: { not: user.id }, readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json({ ok: true, marked: res.count })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ ok: true, marked: 0 })
    return serverError(err, 'Tanda dibaca belum tersimpan.', 'weekly-comments PATCH')
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  const id = body ? cleanText(body.id, 64) : ''
  if (!id) return NextResponse.json({ error: 'Tanggapan tidak dikenali' }, { status: 400 })
  try {
    const row = await db.weeklyReportComment.findUnique({ where: { id } })
    if (!row || row.authorId !== user.id) return NextResponse.json({ error: 'Tanggapan tidak ditemukan' }, { status: 404 })
    if (Date.now() - row.createdAt.getTime() > UNDO_MS) {
      return NextResponse.json({ error: `Tanggapan hanya bisa ditarik dalam ${UNDO_WINDOW_MINUTES} menit` }, { status: 409 })
    }
    await db.weeklyReportComment.delete({ where: { id } })
    await auditPic(req, user, 'UNDO_WEEKLY_COMMENT', 'WEEKLY_REPORT', row.weeklyReportId, undefined, { commentId: row.id, body: row.body })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 })
    return serverError(err, 'Tanggapan belum ditarik. Coba lagi.', 'weekly-comments DELETE')
  }
}
