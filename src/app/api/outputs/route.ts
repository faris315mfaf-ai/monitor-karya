import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { parseWibDateKey } from '@/lib/lock'
import {
  PIC_WRITE_RELATIONS,
  READ_RELATIONS,
  REVIEW_RELATIONS,
  auditPic,
  guardProjectAccess,
  noteParticipants,
  notifyInApp,
  projectScopeWhere,
  readJson,
  str,
} from '@/lib/pic-access'
import { divisionProjects, ledDivisions } from '@/lib/kadiv'
import { recordRevision, revisionHistory } from '@/lib/output-revisions'

/**
 * Output proyek (6 Okt 2026) — hasil kerja PIC yang direview kepala divisi
 * (05-pic-proyek.md "Output saya", 03-kepala-divisi.md "Review output").
 *
 *   GET    ?projectId= &status=   — daftar output (tanpa projectId: semua proyek
 *                                   dalam cakupan akun) + hitungan per status
 *   GET    ?id=&history=1         — riwayat catatan revisi satu output [F1-D]
 *   POST                          — buat output { projectId, title, description?, dueDate? }
 *   PATCH                         — { id, action }:
 *       update    ubah judul/deskripsi/target (PIC, Admin PT)
 *       submit    kirim untuk review; wajib minimal 1 bukti (OUTPUT di /api/evidence)
 *       withdraw  batalkan kirim selama belum direview (dipakai toast "Urungkan")
 *       accept    terima (kepala divisi)
 *       revise    minta revisi dengan catatan (kepala divisi)
 *   DELETE ?id=                   — hapus output tanpa bukti yang belum diterima
 */

const OUTPUT_STATUSES = ['DIKERJAKAN', 'MENUNGGU_REVIEW', 'PERLU_REVISI', 'DITERIMA'] as const
type OutputStatus = (typeof OUTPUT_STATUSES)[number]
const isStatus = (s: string): s is OutputStatus => (OUTPUT_STATUSES as readonly string[]).includes(s)

const OUTPUT_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  ownerId: true,
  reviewerId: true,
  revisionNote: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { name: true, code: true } },
  owner: { select: { name: true } },
  reviewer: { select: { name: true } },
} as const

async function evidenceCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map()
  const rows = await db.evidence.groupBy({
    by: ['targetId'],
    where: { targetType: 'OUTPUT', targetId: { in: ids } },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.targetId, r._count._all]))
}

type Row = { id: string; project: { name: string; code: string }; owner: { name: string }; reviewer: { name: string } | null } & Record<string, unknown>
function shape(o: Row, evidence: number) {
  const { project, owner, reviewer, ...rest } = o
  return {
    ...rest,
    projectName: project.name,
    projectCode: project.code,
    ownerName: owner.name,
    reviewerName: reviewer?.name ?? null,
    evidenceCount: evidence,
  }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const sp = req.nextUrl.searchParams
  const projectId = sp.get('projectId')
  const status = sp.get('status') ?? ''

  if (sp.get('history') === '1') {
    const id = (sp.get('id') ?? '').slice(0, 64)
    const output = id ? await db.output.findUnique({ where: { id }, select: { id: true, projectId: true } }) : null
    if (!output) return NextResponse.json({ error: 'Output tidak ditemukan' }, { status: 404 })
    const guard = await guardProjectAccess(user, output.projectId, READ_RELATIONS)
    if (!guard.ok) return guard.res
    const rows = await revisionHistory(output.id)
    const names = new Map(
      (await db.user.findMany({
        where: { id: { in: rows.map((r) => r.reviewerId).filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      })).map((u) => [u.id, u.name])
    )
    return NextResponse.json({
      id: output.id,
      revisions: rows.map((r) => ({ id: r.id, note: r.note, createdAt: r.createdAt, reviewerName: r.reviewerId ? (names.get(r.reviewerId) ?? null) : null })),
    })
  }

  let projectWhere: Record<string, unknown>
  if (projectId) {
    const guard = await guardProjectAccess(user, projectId, READ_RELATIONS)
    if (!guard.ok) return guard.res
    projectWhere = { id: projectId }
  } else {
    projectWhere = await projectScopeWhere(user)
  }

  const base = { project: projectWhere }
  const [rows, grouped] = await Promise.all([
    db.output.findMany({
      where: { ...base, ...(isStatus(status) ? { status } : {}) },
      select: OUTPUT_SELECT,
      // Yang perlu disentuh dulu: perlu revisi, dikerjakan, menunggu, diterima.
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 200,
    }),
    db.output.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
  ])

  const counts: Record<string, number> = { DIKERJAKAN: 0, MENUNGGU_REVIEW: 0, PERLU_REVISI: 0, DITERIMA: 0 }
  for (const g of grouped) counts[g.status] = g._count._all
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const ev = await evidenceCounts(rows.map((r) => r.id))

  return NextResponse.json({
    items: rows.map((r) => shape(r, ev.get(r.id) ?? 0)),
    counts,
    total,
  })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })

  const guard = await guardProjectAccess(user, body.projectId, PIC_WRITE_RELATIONS)
  if (!guard.ok) return guard.res

  const title = str(body, 'title', 200)
  if (title.length < 3) return NextResponse.json({ error: 'Judul output minimal 3 huruf' }, { status: 422 })
  const description = str(body, 'description', 4000) || null
  const dueRaw = body.dueDate
  const dueDate = dueRaw ? parseWibDateKey(dueRaw) : null
  if (dueRaw && !dueDate) return NextResponse.json({ error: 'Tanggal target tidak valid' }, { status: 422 })

  const created = await db.output.create({
    data: {
      projectId: guard.project.id,
      title,
      description,
      dueDate,
      // Output milik PIC proyek walau dibuat Admin PT atas namanya.
      ownerId: guard.project.picUserId ?? user.id,
    },
    select: OUTPUT_SELECT,
  })
  await auditPic(req, user, 'CREATE_OUTPUT', 'OUTPUT', created.id, { title, projectId: guard.project.id })
  return NextResponse.json({ ok: true, output: shape(created, 0) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })

  const id = str(body, 'id', 64)
  const action = str(body, 'action', 20)
  const current = id ? await db.output.findUnique({ where: { id } }) : null
  if (!current) return NextResponse.json({ error: 'Output tidak ditemukan' }, { status: 404 })

  const isReview = action === 'accept' || action === 'revise'
  const guard = await guardProjectAccess(user, current.projectId, isReview ? REVIEW_RELATIONS : PIC_WRITE_RELATIONS)
  if (!guard.ok) return guard.res
  // Kepala divisi hanya memutuskan output proyek divisinya sendiri — cakupan yang
  // sama dengan /api/outputs/review — bukan semua proyek di PT-nya.
  if (isReview && guard.relation === 'KADIV') {
    const divs = await ledDivisions(user.id)
    const mine = (await Promise.all(divs.map((d) => divisionProjects(d)))).flat()
    if (!mine.some((p) => p.id === current.projectId)) {
      return NextResponse.json({ error: 'Output ini bukan dari proyek divisi Anda' }, { status: 403 })
    }
  }

  const now = new Date()
  let data: Record<string, unknown>
  let notify: { title: string; body: string } | null = null

  switch (action) {
    case 'update': {
      if (current.status === 'MENUNGGU_REVIEW' || current.status === 'DITERIMA') {
        return NextResponse.json({ error: 'Output yang sedang direview atau sudah diterima tidak dapat diubah' }, { status: 409 })
      }
      data = {}
      if ('title' in body) {
        const title = str(body, 'title', 200)
        if (title.length < 3) return NextResponse.json({ error: 'Judul output minimal 3 huruf' }, { status: 422 })
        data.title = title
      }
      if ('description' in body) data.description = str(body, 'description', 4000) || null
      if ('dueDate' in body) {
        const d = body.dueDate ? parseWibDateKey(body.dueDate) : null
        if (body.dueDate && !d) return NextResponse.json({ error: 'Tanggal target tidak valid' }, { status: 422 })
        data.dueDate = d
      }
      break
    }
    case 'submit': {
      if (current.status !== 'DIKERJAKAN' && current.status !== 'PERLU_REVISI') {
        return NextResponse.json({ error: 'Output ini sudah dikirim atau diterima' }, { status: 409 })
      }
      const evidence = await db.evidence.count({ where: { targetType: 'OUTPUT', targetId: current.id } })
      if (evidence < 1) {
        return NextResponse.json(
          { error: 'Unggah minimal 1 bukti sebelum mengirim output untuk direview', needsEvidence: true },
          { status: 422 }
        )
      }
      data = { status: 'MENUNGGU_REVIEW', submittedAt: now, reviewedAt: null }
      notify = {
        title: `Output menunggu review: ${current.title}`,
        body: `${user.name} mengirim output ${guard.project.name} dengan ${evidence} bukti.`,
      }
      break
    }
    case 'withdraw': {
      if (current.status !== 'MENUNGGU_REVIEW') {
        return NextResponse.json({ error: 'Output ini sudah direview, pengiriman tidak bisa dibatalkan' }, { status: 409 })
      }
      // Kembali ke status sebelum dikirim: ada catatan revisi berarti dari "Perlu revisi".
      data = { status: current.revisionNote ? 'PERLU_REVISI' : 'DIKERJAKAN', submittedAt: null }
      break
    }
    case 'accept':
    case 'revise': {
      if (current.status !== 'MENUNGGU_REVIEW') {
        return NextResponse.json({ error: 'Hanya output yang menunggu review yang bisa diputuskan' }, { status: 409 })
      }
      if (action === 'revise') {
        const note = str(body, 'revisionNote', 2000)
        if (note.length < 5) return NextResponse.json({ error: 'Tulis catatan revisi untuk PIC' }, { status: 422 })
        data = { status: 'PERLU_REVISI', revisionNote: note, reviewerId: user.id, reviewedAt: now }
      } else {
        data = { status: 'DITERIMA', reviewerId: user.id, reviewedAt: now }
      }
      break
    }
    default:
      return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 })
  }

  // Bersyarat pada status yang dibaca, supaya dua klik bersamaan tidak saling menimpa.
  const res = await db.output.updateMany({ where: { id: current.id, status: current.status }, data })
  if (res.count === 0) {
    return NextResponse.json({ error: 'Output baru saja berubah. Muat ulang lalu coba lagi.' }, { status: 409 })
  }
  if (action === 'revise') await recordRevision(current.id, String(data.revisionNote), user.id, now)
  const updated = await db.output.findUniqueOrThrow({ where: { id: current.id }, select: OUTPUT_SELECT })
  const ev = await evidenceCounts([current.id])

  await auditPic(
    req,
    user,
    `OUTPUT_${action.toUpperCase()}`,
    'OUTPUT',
    current.id,
    { status: updated.status, revisionNote: updated.revisionNote },
    { status: current.status }
  )

  if (notify) {
    const to = await noteParticipants(guard.project, user.id)
    await notifyInApp(to, 'OUTPUT_SUBMITTED', { ...notify, tab: 'work-desk', projectId: guard.project.id, actorName: user.name })
  } else if (isReview && current.ownerId !== user.id) {
    const owner = await db.user.findUnique({ where: { id: current.ownerId }, select: { id: true, email: true } })
    if (owner) {
      await notifyInApp([owner], 'OUTPUT_REVIEWED', {
        title: action === 'accept' ? `Output diterima: ${current.title}` : `Output perlu revisi: ${current.title}`,
        body: action === 'accept' ? `${user.name} menerima output Anda.` : `${user.name}: ${String(data.revisionNote)}`,
        tab: 'work-desk',
        projectId: guard.project.id,
        actorName: user.name,
      })
    }
  }

  return NextResponse.json({ ok: true, output: shape(updated, ev.get(current.id) ?? 0) })
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const id = req.nextUrl.searchParams.get('id') || ''
  const current = id ? await db.output.findUnique({ where: { id } }) : null
  if (!current) return NextResponse.json({ error: 'Output tidak ditemukan' }, { status: 404 })

  const guard = await guardProjectAccess(user, current.projectId, PIC_WRITE_RELATIONS)
  if (!guard.ok) return guard.res
  if (current.status === 'DITERIMA' || current.status === 'MENUNGGU_REVIEW') {
    return NextResponse.json({ error: 'Output yang sedang direview atau sudah diterima tidak dapat dihapus' }, { status: 409 })
  }
  // Bukti berkas tinggal di Storage; minta dihapus dulu agar tidak ada berkas yatim.
  const evidence = await db.evidence.count({ where: { targetType: 'OUTPUT', targetId: id } })
  if (evidence > 0) {
    return NextResponse.json({ error: `Hapus ${evidence} bukti output ini dulu` }, { status: 409 })
  }

  await db.output.delete({ where: { id } })
  await auditPic(req, user, 'DELETE_OUTPUT', 'OUTPUT', id, undefined, { title: current.title, status: current.status })
  return NextResponse.json({ ok: true })
}
