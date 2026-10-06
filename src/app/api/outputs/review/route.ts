import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, type SessionUser } from '@/lib/auth'
import { auditPic, notifyInApp, readJson, str } from '@/lib/pic-access'
import { divisionProjects, pickLedDivision, type LedDivision } from '@/lib/kadiv'
import { initials } from '@/lib/format'
import { recordRevision, undoLatestRevision } from '@/lib/output-revisions'
import type { ReviewOutput, ReviewQueue } from '@/components/kadiv/types'

/**
 * Review output oleh kepala divisi (03-kepala-divisi.md "Output menunggu review").
 * Cakupan: hanya output pada proyek divisi yang dipimpin akun ini
 * (lihat src/lib/kadiv.ts → divisionProjects).
 *
 *   GET  ?divisionId=                     — antrean MENUNGGU_REVIEW + keputusan Anda 24 jam terakhir
 *   POST { action: 'accept', id }         — terima; output dihitung selesai
 *   POST { action: 'revise', id, note }   — minta revisi dengan catatan (wajib, min. 5 huruf)
 *   POST { action: 'accept-all', ids?, projectId?, divisionId? }
 *                                         — terima semua di antrean (atau id/proyek tertentu)
 *   POST { action: 'undo', ids }          — urungkan keputusan Anda sendiri dalam 15 menit
 *                                           (dipakai toast "Urungkan"); output kembali menunggu review.
 *                                           Urungkan "minta revisi" memulihkan catatan putaran
 *                                           sebelumnya dari riwayat OutputRevision [F1-D].
 */

const UNDO_MINUTES = 15
const DAY = 86400000

const SELECT = {
  id: true, title: true, description: true, status: true, dueDate: true, submittedAt: true, reviewedAt: true,
  revisionNote: true, reviewerId: true, ownerId: true, projectId: true,
  project: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, name: true, email: true } },
} as const

type Row = {
  id: string; title: string; description: string | null; status: string; dueDate: Date | null; submittedAt: Date | null
  reviewedAt: Date | null; revisionNote: string | null; reviewerId: string | null; ownerId: string; projectId: string
  project: { id: string; code: string; name: string }; owner: { id: string; name: string; email: string }
}

async function evidenceCounts(ids: string[]) {
  if (!ids.length) return new Map<string, number>()
  const rows = await db.evidence.groupBy({ by: ['targetId'], where: { targetType: 'OUTPUT', targetId: { in: ids } }, _count: { _all: true } })
  return new Map(rows.map((r) => [r.targetId, r._count._all]))
}

function shape(o: Row, ev: Map<string, number>): ReviewOutput {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    status: o.status,
    project: o.project,
    owner: { id: o.owner.id, name: o.owner.name, initials: initials(o.owner.name) },
    submittedAt: o.submittedAt?.toISOString() ?? null,
    dueDate: o.dueDate?.toISOString() ?? null,
    evidenceCount: ev.get(o.id) ?? 0,
    reviewedAt: o.reviewedAt?.toISOString() ?? null,
    revisionNote: o.revisionNote,
  }
}

/** Semua divisi yang dipimpin, atau satu bila `divisionId` diberikan; null bila di luar cakupan. */
async function scope(user: SessionUser, divisionId: string | null) {
  const { all, current } = await pickLedDivision(user, divisionId)
  if (divisionId && !current) return null
  const divs: LedDivision[] = divisionId && current ? [current] : all
  const projects = (await Promise.all(divs.map((d) => divisionProjects(d)))).flat()
  return { divs, projectIds: [...new Set(projects.map((p) => p.id))] }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  try {
    const s = await scope(user, req.nextUrl.searchParams.get('divisionId'))
    if (!s) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    const [queue, decided] = await Promise.all([
      db.output.findMany({
        where: { projectId: { in: s.projectIds }, status: 'MENUNGGU_REVIEW' },
        select: SELECT,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        take: 200,
      }),
      db.output.findMany({
        where: { projectId: { in: s.projectIds }, reviewerId: user.id, reviewedAt: { gte: new Date(Date.now() - DAY) }, status: { in: ['DITERIMA', 'PERLU_REVISI'] } },
        select: SELECT,
        orderBy: { reviewedAt: 'desc' },
        take: 50,
      }),
    ])
    const ev = await evidenceCounts([...queue, ...decided].map((o) => o.id))
    const body: ReviewQueue = { queue: queue.map((o) => shape(o, ev)), decided: decided.map((o) => shape(o, ev)), undoMinutes: UNDO_MINUTES }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[outputs/review] GET:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Antrean review belum termuat' }, { status: 500 })
  }
}

async function notifyOwner(user: SessionUser, o: Row, accepted: boolean, note?: string) {
  if (o.ownerId === user.id) return
  await notifyInApp([{ id: o.owner.id, email: o.owner.email }], 'OUTPUT_REVIEWED', {
    title: accepted ? `Output diterima: ${o.title}` : `Output perlu revisi: ${o.title}`,
    body: accepted ? `${user.name} menerima output Anda.` : `${user.name}: ${note ?? ''}`,
    tab: 'work-desk',
    projectId: o.projectId,
    actorName: user.name,
  })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const action = str(body, 'action', 20)

  try {
    const s = await scope(user, str(body, 'divisionId', 64) || null)
    if (!s) return NextResponse.json({ error: 'Divisi ini di luar tanggung jawab Anda' }, { status: 403 })
    if (s.divs.length === 0) return NextResponse.json({ error: 'Anda belum memimpin divisi mana pun' }, { status: 403 })
    const inScope = { projectId: { in: s.projectIds } }
    const now = new Date()

    if (action === 'accept' || action === 'revise') {
      const id = str(body, 'id', 64)
      const o = id ? await db.output.findFirst({ where: { id, ...inScope }, select: SELECT }) : null
      if (!o) return NextResponse.json({ error: 'Output tidak ditemukan di divisi Anda' }, { status: 404 })
      if (o.status !== 'MENUNGGU_REVIEW') return NextResponse.json({ error: 'Output ini sudah diputuskan' }, { status: 409 })
      const note = str(body, 'note', 2000)
      if (action === 'revise' && note.length < 5) return NextResponse.json({ error: 'Tulis catatan revisi untuk PIC, minimal 5 huruf' }, { status: 422 })
      const data =
        action === 'accept'
          ? { status: 'DITERIMA', reviewerId: user.id, reviewedAt: now }
          : { status: 'PERLU_REVISI', reviewerId: user.id, reviewedAt: now, revisionNote: note }
      const res = await db.output.updateMany({ where: { id: o.id, status: 'MENUNGGU_REVIEW' }, data })
      if (res.count === 0) return NextResponse.json({ error: 'Output baru saja berubah. Muat ulang lalu coba lagi.' }, { status: 409 })
      if (action === 'revise') await recordRevision(o.id, note, user.id, now)
      await auditPic(req, user, action === 'accept' ? 'OUTPUT_ACCEPT' : 'OUTPUT_REVISE', 'OUTPUT', o.id, { title: o.title, status: data.status, revisionNote: action === 'revise' ? note : undefined }, { status: o.status })
      await notifyOwner(user, o, action === 'accept', note)
      return NextResponse.json({ ok: true, ids: [o.id], reviewedAt: now.toISOString() })
    }

    if (action === 'accept-all') {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : null
      const projectId = str(body, 'projectId', 64)
      const rows = await db.output.findMany({
        where: { ...inScope, status: 'MENUNGGU_REVIEW', ...(ids ? { id: { in: ids } } : {}), ...(projectId ? { projectId } : {}) },
        select: SELECT,
        take: 200,
      })
      if (rows.length === 0) return NextResponse.json({ ok: true, ids: [] })
      await db.output.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, status: 'MENUNGGU_REVIEW' },
        data: { status: 'DITERIMA', reviewerId: user.id, reviewedAt: now },
      })
      // Yang benar-benar berubah oleh permintaan ini (bukan yang diputuskan orang lain di sela-selanya).
      const done = await db.output.findMany({ where: { id: { in: rows.map((r) => r.id) }, status: 'DITERIMA', reviewerId: user.id, reviewedAt: now }, select: { id: true } })
      const doneIds = new Set(done.map((d) => d.id))
      for (const o of rows.filter((r) => doneIds.has(r.id))) {
        await auditPic(req, user, 'OUTPUT_ACCEPT', 'OUTPUT', o.id, { title: o.title, status: 'DITERIMA', bulk: true }, { status: o.status })
        await notifyOwner(user, o, true)
      }
      return NextResponse.json({ ok: true, ids: [...doneIds], reviewedAt: now.toISOString() })
    }

    if (action === 'undo') {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : []
      if (ids.length === 0) return NextResponse.json({ error: 'Tidak ada yang diurungkan' }, { status: 400 })
      const since = new Date(now.getTime() - UNDO_MINUTES * 60000)
      const rows = await db.output.findMany({
        where: { id: { in: ids }, ...inScope, reviewerId: user.id, reviewedAt: { gte: since }, status: { in: ['DITERIMA', 'PERLU_REVISI'] } },
        select: SELECT,
      })
      if (rows.length === 0) return NextResponse.json({ error: `Batas urungkan ${UNDO_MINUTES} menit sudah lewat` }, { status: 409 })
      const undone: string[] = []
      for (const o of rows) {
        // "Terima" diurungkan: catatan revisi putaran sebelumnya tetap. "Minta revisi"
        // diurungkan: catatan putaran sebelumnya dipulihkan dari riwayat, bukan dikosongkan.
        const revisionNote = o.status === 'PERLU_REVISI' ? await undoLatestRevision(o.id, user.id) : o.revisionNote
        const res = await db.output.updateMany({
          where: { id: o.id, status: o.status, reviewerId: user.id },
          data: { status: 'MENUNGGU_REVIEW', reviewerId: null, reviewedAt: null, revisionNote },
        })
        if (res.count === 0) continue
        undone.push(o.id)
        await auditPic(req, user, 'OUTPUT_REVIEW_UNDO', 'OUTPUT', o.id, { title: o.title, status: 'MENUNGGU_REVIEW', revisionNote }, { status: o.status, revisionNote: o.revisionNote })
      }
      return NextResponse.json({ ok: true, ids: undone })
    }

    return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 })
  } catch (err) {
    console.error('[outputs/review] POST:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Review belum tersimpan' }, { status: 500 })
  }
}
