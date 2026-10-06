import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { parseWibDateKey, startOfWibDay } from '@/lib/lock'
import {
  PIC_WRITE_RELATIONS,
  READ_RELATIONS,
  auditPic,
  canDecideDeadline,
  guardProjectAccess,
  notifyInApp,
  projectScopeWhere,
  readJson,
  str,
} from '@/lib/pic-access'
import { UNDO_WINDOW_MINUTES } from '@/lib/oversight-shared' // [F2-DIREKTUR]

/**
 * Usulan geser tenggat proyek (6 Okt 2026) — "Rilis 24 Okt · usul 31 Okt".
 * PIC (atau Admin PT atas namanya) mengajukan; Direktur entitas, Manajemen,
 * atau Super Admin memutuskan. Disetujui → Project.targetEndDate berubah.
 *
 *   GET   ?projectId=          — riwayat usulan proyek itu
 *   GET   ?status=DIAJUKAN     — antrean usulan dalam cakupan akun (untuk pemutus)
 *   POST                       — ajukan { projectId, proposedDate: "YYYY-MM-DD", reason }
 *   PATCH                      — { id, action: approve | reject | withdraw | undo, note? }
 *                                (undo [F2-DIREKTUR]: pemutus mengurungkan keputusannya ≤ 15 menit)
 *
 * Satu proyek hanya boleh punya satu usulan yang masih DIAJUKAN.
 */

const STATUSES = ['DIAJUKAN', 'DISETUJUI', 'DITOLAK'] as const

const SELECT = {
  id: true,
  projectId: true,
  previousDate: true,
  proposedDate: true,
  reason: true,
  status: true,
  proposedById: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  project: { select: { name: true, code: true, targetEndDate: true } },
  proposedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
} as const

type Row = {
  project: { name: string; code: string; targetEndDate: Date | null }
  proposedBy: { name: string }
  decidedBy: { name: string } | null
} & Record<string, unknown>

function shape(r: Row) {
  const { project, proposedBy, decidedBy, ...rest } = r
  return {
    ...rest,
    projectName: project.name,
    projectCode: project.code,
    currentTargetDate: project.targetEndDate,
    proposedByName: proposedBy.name,
    decidedByName: decidedBy?.name ?? null,
  }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const sp = req.nextUrl.searchParams
  const projectId = sp.get('projectId')
  const status = sp.get('status') ?? ''

  let where: Record<string, unknown>
  if (projectId) {
    const guard = await guardProjectAccess(user, projectId, READ_RELATIONS)
    if (!guard.ok) return guard.res
    where = { projectId }
  } else {
    where = { project: await projectScopeWhere(user) }
  }
  if ((STATUSES as readonly string[]).includes(status)) where.status = status

  const rows = await db.deadlineProposal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: SELECT,
  })
  return NextResponse.json({ items: rows.map(shape), canDecide: canDecideDeadline(user.role) })
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })

  const guard = await guardProjectAccess(user, body.projectId, PIC_WRITE_RELATIONS)
  if (!guard.ok) return guard.res

  const proposedDate = parseWibDateKey(body.proposedDate)
  if (!proposedDate) return NextResponse.json({ error: 'Pilih tanggal tenggat baru' }, { status: 422 })
  if (proposedDate <= startOfWibDay(new Date())) {
    return NextResponse.json({ error: 'Tenggat baru harus setelah hari ini' }, { status: 422 })
  }
  const prev = guard.project.targetEndDate
  if (prev && startOfWibDay(prev).getTime() === proposedDate.getTime()) {
    return NextResponse.json({ error: 'Tanggal yang diusulkan sama dengan tenggat sekarang' }, { status: 422 })
  }
  const reason = str(body, 'reason', 1000)
  if (reason.length < 10) {
    return NextResponse.json({ error: 'Tulis alasannya sebagai fakta, minimal 10 huruf' }, { status: 422 })
  }

  const open = await db.deadlineProposal.findFirst({
    where: { projectId: guard.project.id, status: 'DIAJUKAN' },
    select: { id: true },
  })
  if (open) return NextResponse.json({ error: 'Masih ada usulan tenggat yang belum diputuskan' }, { status: 409 })

  const created = await db.deadlineProposal.create({
    data: {
      projectId: guard.project.id,
      previousDate: prev,
      proposedDate,
      reason,
      proposedById: user.id,
    },
    select: SELECT,
  })
  await auditPic(req, user, 'PROPOSE_DEADLINE', 'PROJECT', guard.project.id, { proposedDate, reason }, { targetEndDate: prev })

  // Pemutus di PT proyek: Direktur entitas dengan cakupan PT itu.
  const deciders = await db.user.findMany({
    where: { role: 'DIREKTUR_ENTITAS', scopeEntityId: guard.project.entityId, isActive: true },
    select: { id: true, email: true },
  })
  await notifyInApp(deciders, 'DEADLINE_PROPOSAL', {
    title: `Usulan geser tenggat · ${guard.project.name}`,
    body: `${user.name} mengusulkan tenggat baru ${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(proposedDate)}.`,
    tab: 'dashboard',
    projectId: guard.project.id,
    actorName: user.name,
  })

  return NextResponse.json({ ok: true, proposal: shape(created) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })

  const id = str(body, 'id', 64)
  const action = str(body, 'action', 20)
  const current = id ? await db.deadlineProposal.findUnique({ where: { id } }) : null
  if (!current) return NextResponse.json({ error: 'Usulan tidak ditemukan' }, { status: 404 })

  // [F2-DIREKTUR] Urungkan keputusan sendiri dalam 15 menit (toast "Urungkan"):
  // usulan kembali DIAJUKAN; bila disetujui, tenggat proyek kembali ke tanggal
  // sebelumnya asalkan belum diubah lagi sejak keputusan itu.
  if (action === 'undo') {
    if (current.status === 'DIAJUKAN' || current.decidedById !== user.id || !current.decidedAt) {
      return NextResponse.json({ error: 'Hanya keputusan Anda sendiri yang bisa diurungkan' }, { status: 403 })
    }
    if (Date.now() - current.decidedAt.getTime() > UNDO_WINDOW_MINUTES * 60000) {
      return NextResponse.json({ error: `Keputusan hanya bisa diurungkan dalam ${UNDO_WINDOW_MINUTES} menit` }, { status: 409 })
    }
    const guard = await guardProjectAccess(user, current.projectId, ['MASTER', 'VIEWER'])
    if (!guard.ok) return guard.res
    const undone = await db.$transaction(async (tx) => {
      const res = await tx.deadlineProposal.updateMany({
        where: { id, status: current.status, decidedById: user.id },
        data: { status: 'DIAJUKAN', decidedById: null, decidedAt: null, decisionNote: null },
      })
      if (res.count === 0) return false
      if (current.status === 'DISETUJUI') {
        await tx.project.updateMany({
          where: { id: current.projectId, targetEndDate: current.proposedDate },
          data: { targetEndDate: current.previousDate },
        })
      }
      return true
    })
    if (!undone) return NextResponse.json({ error: 'Status usulan sudah berubah' }, { status: 409 })
    await auditPic(req, user, 'UNDO_DEADLINE_DECISION', 'PROJECT', current.projectId, { status: 'DIAJUKAN' }, {
      status: current.status,
      note: current.decisionNote,
    })
    return NextResponse.json({ ok: true })
  }

  if (current.status !== 'DIAJUKAN') {
    return NextResponse.json({ error: 'Usulan ini sudah diputuskan' }, { status: 409 })
  }

  if (action === 'withdraw') {
    const guard = await guardProjectAccess(user, current.projectId, PIC_WRITE_RELATIONS)
    if (!guard.ok) return guard.res
    if (current.proposedById !== user.id && guard.relation === 'PIC') {
      return NextResponse.json({ error: 'Hanya pengaju yang bisa menarik usulan ini' }, { status: 403 })
    }
    const res = await db.deadlineProposal.deleteMany({ where: { id, status: 'DIAJUKAN' } })
    if (res.count === 0) return NextResponse.json({ error: 'Usulan ini sudah diputuskan' }, { status: 409 })
    await auditPic(req, user, 'WITHDRAW_DEADLINE', 'PROJECT', current.projectId, undefined, {
      proposedDate: current.proposedDate,
      reason: current.reason,
    })
    return NextResponse.json({ ok: true })
  }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 })
  }
  if (!canDecideDeadline(user.role)) {
    return NextResponse.json({ error: 'Peran Anda tidak memutuskan usulan tenggat' }, { status: 403 })
  }
  const guard = await guardProjectAccess(user, current.projectId, ['MASTER', 'VIEWER'])
  if (!guard.ok) return guard.res
  if (current.proposedById === user.id) {
    return NextResponse.json({ error: 'Usulan Anda sendiri diputuskan oleh pihak lain' }, { status: 403 })
  }

  const note = str(body, 'note', 1000) || null
  if (action === 'reject' && !note) {
    return NextResponse.json({ error: 'Tulis alasan penolakan untuk PIC' }, { status: 422 })
  }
  const now = new Date()
  const status = action === 'approve' ? 'DISETUJUI' : 'DITOLAK'

  const ok = await db.$transaction(async (tx) => {
    const res = await tx.deadlineProposal.updateMany({
      where: { id, status: 'DIAJUKAN' },
      data: { status, decidedById: user.id, decidedAt: now, decisionNote: note },
    })
    if (res.count === 0) return false
    if (action === 'approve') {
      await tx.project.update({ where: { id: current.projectId }, data: { targetEndDate: current.proposedDate } })
    }
    return true
  })
  if (!ok) return NextResponse.json({ error: 'Usulan ini baru saja diputuskan' }, { status: 409 })

  await auditPic(
    req,
    user,
    action === 'approve' ? 'APPROVE_DEADLINE' : 'REJECT_DEADLINE',
    'PROJECT',
    current.projectId,
    { status, proposedDate: current.proposedDate, note },
    { targetEndDate: guard.project.targetEndDate }
  )

  const proposer = await db.user.findUnique({ where: { id: current.proposedById }, select: { id: true, email: true } })
  if (proposer) {
    await notifyInApp([proposer], 'DEADLINE_DECIDED', {
      title: `Usulan tenggat ${action === 'approve' ? 'disetujui' : 'ditolak'} · ${guard.project.name}`,
      body: note ? `${user.name}: ${note}` : `Diputuskan oleh ${user.name}.`,
      tab: 'work-desk',
      projectId: guard.project.id,
      actorName: user.name,
    })
  }

  const updated = await db.deadlineProposal.findUniqueOrThrow({ where: { id }, select: SELECT })
  return NextResponse.json({ ok: true, proposal: shape(updated) })
}
