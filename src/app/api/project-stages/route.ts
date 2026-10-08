import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { parseWibDateKey } from '@/lib/lock'
import { PIC_WRITE_RELATIONS, READ_RELATIONS, auditPic, guardProjectAccess, readJson, str } from '@/lib/pic-access'

/**
 * Tahapan proyek bertanggal (6 Okt 2026) — 05-pic-proyek.md "Tahapan proyek".
 *
 *   GET    ?projectId=  — tahapan berurutan + ringkasan (n dari m selesai)
 *   POST               — tambah { projectId, name, startDate?, dueDate?, status?, note? }
 *   PUT                — ubah { id, name?, startDate?, dueDate?, status?, note? }
 *   PATCH              — urutkan ulang { projectId, order: [id, …] }
 *   DELETE ?id=        — hapus satu tahap
 *
 * Tanggal dikirim sebagai "YYYY-MM-DD" (WIB). Status TERTAHAN wajib disertai
 * catatan, supaya alasannya tampil di diagram.
 */

const STAGE_STATUSES = ['BELUM_MULAI', 'BERJALAN', 'TERTAHAN', 'SELESAI'] as const
const MAX_STAGES = 20

const SELECT = { id: true, name: true, position: true, startDate: true, dueDate: true, status: true, note: true, updatedAt: true } as const

type Parsed = { ok: true; data: Record<string, unknown> } | { ok: false; res: NextResponse }

/** Membaca kolom yang ada di body; `partial` untuk PUT (kolom yang tidak dikirim tidak diubah). */
function parseStage(body: Record<string, unknown>, partial: boolean): Parsed {
  const bad = (error: string) => ({ ok: false as const, res: NextResponse.json({ error }, { status: 422 }) })
  const data: Record<string, unknown> = {}

  if (!partial || 'name' in body) {
    const name = str(body, 'name', 120)
    if (name.length < 2) return bad('Nama tahap minimal 2 huruf')
    data.name = name
  }
  for (const k of ['startDate', 'dueDate'] as const) {
    if (!partial || k in body) {
      const raw = body[k]
      const d = raw ? parseWibDateKey(raw) : null
      if (raw && !d) return bad('Tanggal tahap tidak valid')
      data[k] = d
    }
  }
  if (!partial || 'status' in body) {
    const s = str(body, 'status', 20) || 'BELUM_MULAI'
    if (!(STAGE_STATUSES as readonly string[]).includes(s)) return bad('Status tahap tidak dikenal')
    data.status = s
  }
  if (!partial || 'note' in body) data.note = str(body, 'note', 500) || null

  const start = data.startDate as Date | null | undefined
  const due = data.dueDate as Date | null | undefined
  if (start && due && due < start) return bad('Tanggal selesai tahap tidak boleh sebelum tanggal mulai')
  return { ok: true, data }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const guard = await guardProjectAccess(user, req.nextUrl.searchParams.get('projectId'), READ_RELATIONS)
  if (!guard.ok) return guard.res

  const items = await db.projectStage.findMany({
    where: { projectId: guard.project.id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: SELECT,
  })
  const pending = await db.deadlineProposal.findFirst({
    where: { projectId: guard.project.id, status: 'DIAJUKAN' },
    select: { proposedDate: true },
  })
  return NextResponse.json({
    projectId: guard.project.id,
    targetEndDate: guard.project.targetEndDate,
    proposedEndDate: pending?.proposedDate ?? null,
    canEdit: (['PIC', 'ADMIN', 'MASTER'] as string[]).includes(guard.relation),
    done: items.filter((s) => s.status === 'SELESAI').length,
    total: items.length,
    items,
  })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const guard = await guardProjectAccess(user, body.projectId, PIC_WRITE_RELATIONS)
  if (!guard.ok) return guard.res

  const parsed = parseStage(body, false)
  if (!parsed.ok) return parsed.res
  if (parsed.data.status === 'TERTAHAN' && !parsed.data.note) {
    return NextResponse.json({ error: 'Tulis alasan tahap tertahan' }, { status: 422 })
  }

  const count = await db.projectStage.count({ where: { projectId: guard.project.id } })
  if (count >= MAX_STAGES) return NextResponse.json({ error: `Maksimal ${MAX_STAGES} tahap per proyek` }, { status: 422 })
  const last = await db.projectStage.findFirst({
    where: { projectId: guard.project.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  const stage = await db.projectStage.create({
    data: {
      projectId: guard.project.id,
      position: (last?.position ?? -1) + 1,
      name: parsed.data.name as string,
      startDate: parsed.data.startDate as Date | null,
      dueDate: parsed.data.dueDate as Date | null,
      status: parsed.data.status as string,
      note: parsed.data.note as string | null,
    },
    select: SELECT,
  })
  await auditPic(req, user, 'CREATE_PROJECT_STAGE', 'PROJECT_STAGE', stage.id, { projectId: guard.project.id, name: stage.name })
  return NextResponse.json({ ok: true, stage }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })

  const id = str(body, 'id', 64)
  const current = id ? await db.projectStage.findUnique({ where: { id } }) : null
  if (!current) return NextResponse.json({ error: 'Tahap tidak ditemukan' }, { status: 404 })
  const guard = await guardProjectAccess(user, current.projectId, PIC_WRITE_RELATIONS)
  if (!guard.ok) return guard.res

  const parsed = parseStage(body, true)
  if (!parsed.ok) return parsed.res
  const next = { ...current, ...parsed.data }
  if (next.startDate && next.dueDate && next.dueDate < next.startDate) {
    return NextResponse.json({ error: 'Tanggal selesai tahap tidak boleh sebelum tanggal mulai' }, { status: 422 })
  }
  if (next.status === 'TERTAHAN' && !next.note) {
    return NextResponse.json({ error: 'Tulis alasan tahap tertahan' }, { status: 422 })
  }

  const stage = await db.projectStage.update({ where: { id }, data: parsed.data, select: SELECT })
  await auditPic(req, user, 'UPDATE_PROJECT_STAGE', 'PROJECT_STAGE', id, parsed.data, {
    name: current.name,
    status: current.status,
    startDate: current.startDate,
    dueDate: current.dueDate,
  })
  return NextResponse.json({ ok: true, stage })
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const guard = await guardProjectAccess(user, body.projectId, PIC_WRITE_RELATIONS)
  if (!guard.ok) return guard.res

  const order = Array.isArray(body.order) ? body.order.filter((x): x is string => typeof x === 'string') : []
  const existing = await db.projectStage.findMany({ where: { projectId: guard.project.id }, select: { id: true } })
  const ids = new Set(existing.map((s) => s.id))
  if (order.length !== ids.size || !order.every((x) => ids.has(x)) || new Set(order).size !== order.length) {
    return NextResponse.json({ error: 'Urutan tahap tidak lengkap' }, { status: 422 })
  }

  await db.$transaction(order.map((sid, i) => db.projectStage.update({ where: { id: sid }, data: { position: i } })))
  await auditPic(req, user, 'REORDER_PROJECT_STAGES', 'PROJECT', guard.project.id, { order })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const id = req.nextUrl.searchParams.get('id') || ''
  const current = id ? await db.projectStage.findUnique({ where: { id } }) : null
  if (!current) return NextResponse.json({ error: 'Tahap tidak ditemukan' }, { status: 404 })
  const guard = await guardProjectAccess(user, current.projectId, PIC_WRITE_RELATIONS)
  if (!guard.ok) return guard.res

  await db.projectStage.delete({ where: { id } })
  await auditPic(req, user, 'DELETE_PROJECT_STAGE', 'PROJECT_STAGE', id, undefined, { name: current.name, status: current.status })
  return NextResponse.json({ ok: true })
}
