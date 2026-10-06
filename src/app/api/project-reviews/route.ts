import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { READ_RELATIONS, auditPic, guardProjectAccess, readJson } from '@/lib/pic-access'
import { cleanText } from '@/lib/security'
import { serverError } from '@/lib/api-error'
import { UNDO_WINDOW_MINUTES, isProjectOverseer } from '@/lib/oversight-shared'
import { MIGRATION_PENDING_MESSAGE, isMissingTable, namesOf } from '@/lib/oversight'

/**
 * [F2-DIREKTUR] "Tandai sudah ditinjau" pada detail proyek (01-manajemen.md,
 * 02-direktur.md). Jejak tinjauan pengawas; tidak mengubah status proyek.
 *
 *   GET    ?projectId=          — 5 tinjauan terakhir + tinjauan terakhir saya
 *   POST   { projectId, note? } — tandai ditinjau (Manajemen, Direktur entitas, Direksi holding, Super Admin, TI)
 *   DELETE { id }               — Urungkan: hapus tinjauan sendiri ≤ 15 menit
 */

const UNDO_MS = UNDO_WINDOW_MINUTES * 60000

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const guard = await guardProjectAccess(user, req.nextUrl.searchParams.get('projectId'), READ_RELATIONS)
  if (!guard.ok) return guard.res
  try {
    const rows = await db.projectReview.findMany({
      where: { projectId: guard.project.id },
      orderBy: { reviewedAt: 'desc' },
      take: 5,
    })
    const mine = rows.find((r) => r.reviewerId === user.id) ??
      (await db.projectReview.findFirst({ where: { projectId: guard.project.id, reviewerId: user.id }, orderBy: { reviewedAt: 'desc' } }))
    const names = await namesOf(rows.map((r) => r.reviewerId))
    return NextResponse.json({
      projectId: guard.project.id,
      canReview: isProjectOverseer(user.role),
      undoMinutes: UNDO_WINDOW_MINUTES,
      mine: mine ? { id: mine.id, reviewedAt: mine.reviewedAt } : null,
      items: rows.map((r) => ({
        id: r.id,
        reviewedAt: r.reviewedAt,
        note: r.note,
        reviewer: names.get(r.reviewerId)?.name ?? 'Pengguna',
        mine: r.reviewerId === user.id,
      })),
    })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ projectId: guard.project.id, canReview: false, mine: null, items: [], pendingMigration: true })
    return serverError(err, 'Riwayat tinjauan belum termuat.', 'project-reviews GET')
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!isProjectOverseer(user.role)) {
    return NextResponse.json({ error: 'Peran Anda tidak menandai tinjauan proyek' }, { status: 403 })
  }
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const guard = await guardProjectAccess(user, body.projectId, ['MASTER', 'VIEWER'])
  if (!guard.ok) return guard.res
  const note = cleanText(body.note, 500) || null
  try {
    const row = await db.projectReview.create({ data: { projectId: guard.project.id, reviewerId: user.id, note } })
    await auditPic(req, user, 'REVIEW_PROJECT', 'PROJECT', guard.project.id, { reviewId: row.id, note })
    return NextResponse.json({ ok: true, review: { id: row.id, reviewedAt: row.reviewedAt }, undoMinutes: UNDO_WINDOW_MINUTES }, { status: 201 })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 })
    return serverError(err, 'Tanda tinjauan belum tersimpan. Coba lagi.', 'project-reviews POST')
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  const id = body ? cleanText(body.id, 64) : ''
  if (!id) return NextResponse.json({ error: 'Tinjauan tidak dikenali' }, { status: 400 })
  try {
    const row = await db.projectReview.findUnique({ where: { id } })
    if (!row || row.reviewerId !== user.id) return NextResponse.json({ error: 'Tinjauan tidak ditemukan' }, { status: 404 })
    if (Date.now() - row.reviewedAt.getTime() > UNDO_MS) {
      return NextResponse.json({ error: `Tanda tinjauan hanya bisa diurungkan dalam ${UNDO_WINDOW_MINUTES} menit` }, { status: 409 })
    }
    await db.projectReview.delete({ where: { id } })
    await auditPic(req, user, 'UNDO_REVIEW_PROJECT', 'PROJECT', row.projectId, undefined, { reviewId: row.id, reviewedAt: row.reviewedAt })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: MIGRATION_PENDING_MESSAGE }, { status: 503 })
    return serverError(err, 'Tanda tinjauan belum diurungkan. Coba lagi.', 'project-reviews DELETE')
  }
}
