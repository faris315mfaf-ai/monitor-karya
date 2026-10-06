import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds, type SessionUser } from '@/lib/auth'
import { approvalChainFor, can, canSignSlot, isMasterRole, pendingSlot } from '@/lib/rbac'
import { NO_APPROVAL_LABEL } from '@/lib/constants'
import { Prisma } from '@prisma/client'
import { approvalSnap, issueUndo, projectStamp } from '@/lib/undo' // [F2-URUNGKAN]
import { serverError } from '@/lib/api-error' // [F3-D]

/**
 * Modul proyek (11 Sep 2026).
 *
 *   GET    ?lifecycle=&phase=&entityId=&search=&page=  — daftar proyek dalam cakupan
 *          (termasuk proyek PT lain yang menyebut PT dalam cakupan sebagai PT terkait)
 *   GET    ?options=1&entityId=                        — pilihan untuk formulir: PT, kandidat PIC, rantai
 *   POST   — ajukan proyek; rantai penyetuju mengikuti peran pengaju
 *   PATCH  — ubah proyek, ganti status, atau ajukan ulang yang ditolak
 *   DELETE ?id=                                        — hapus proyek yang belum punya data
 *
 * Siapa boleh mengubah/menghapus: Super Admin & TI (semua), Admin PT (PT-nya),
 * dan pengaju sendiri selama pengajuannya belum aktif.
 */

const PHASES = ['INISIASI', 'PERENCANAAN', 'PELAKSANAAN', 'PENYELESAIAN']
const MANAGED_LIFECYCLES = ['AKTIF', 'DITUTUP', 'DIARSIPKAN']

const PROJECT_INCLUDE = {
  entity: { select: { id: true, name: true, code: true, region: true } },
  picUser: { select: { id: true, name: true } },
  division: { select: { id: true, name: true } }, // [F2-ADMIN]
  proposedBy: { select: { id: true, name: true, role: true } },
  approvals: {
    select: { role: true, decision: true, note: true, decidedAt: true, decidedBy: { select: { name: true } } },
  },
  relatedEntities: { select: { entity: { select: { id: true, name: true, code: true } } } },
  dailyReports: {
    select: { status: true, progressPct: true, reportDate: true, isLate: true },
    orderBy: { reportDate: 'desc' },
    take: 1,
  },
} satisfies Prisma.ProjectInclude

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>

/** Kandidat PIC untuk formulir: akun Manager/PIC Proyek aktif di satu PT. */
async function picCandidates(entityId: string) {
  const users = await db.user.findMany({
    where: { role: 'PIC_PROYEK', isActive: true, scopeEntityId: entityId },
    select: { id: true, name: true, email: true, projectsAsPic: { where: { lifecycle: 'AKTIF' }, select: { id: true } } },
    orderBy: { name: 'asc' },
  })
  return users.map((u) => ({ id: u.id, name: u.name, email: u.email, activeProjects: u.projectsAsPic.length }))
}

/** Siapa boleh mengubah/menghapus proyek ini. */
function canManage(user: SessionUser, p: { entityId: string; proposedById: string | null; lifecycle: string }): boolean {
  if (isMasterRole(user.role)) return true
  if (can(user.role, 'project:manage') && user.scopeEntityId === p.entityId) return true
  // Pengaju boleh membenahi atau menarik pengajuannya sendiri selama belum aktif.
  return p.proposedById === user.id && (p.lifecycle === 'DIUSULKAN' || p.lifecycle === 'DITOLAK')
}

/** Boleh mengganti status (aktif/tutup/arsip) — bukan hak pengaju biasa. */
function canSetLifecycle(user: SessionUser, p: { entityId: string; lifecycle: string }): boolean {
  if (isMasterRole(user.role)) return true
  return can(user.role, 'project:manage') && user.scopeEntityId === p.entityId && p.lifecycle !== 'DIUSULKAN'
}

function format(p: ProjectRow, user: SessionUser) {
  const approvedRoles = p.approvals.filter((a) => a.decision === 'DISETUJUI').map((a) => a.role)
  const pending = p.lifecycle === 'DIUSULKAN' ? pendingSlot(p.approvalChain, approvedRoles) : null
  const r = p.dailyReports[0]
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    phase: p.phase,
    lifecycle: p.lifecycle,
    picName: p.picName,
    picUserId: p.picUserId,
    // [F2-ADMIN] divisi pelaksana (Project.divisionId)
    divisionId: p.divisionId,
    division: p.division,
    description: p.description,
    purpose: p.purpose,
    proposedBy: p.proposedBy,
    proposedAt: p.proposedAt,
    approvalChain: p.approvalChain,
    pendingRole: pending,
    // Satu slot per anggota rantai, urut, terisi atau belum.
    approvals: p.approvalChain.map((role) => {
      const a = p.approvals.find((x) => x.role === role)
      return a
        ? { role, decision: a.decision, note: a.note, decidedAt: a.decidedAt, decidedByName: a.decidedBy?.name ?? null }
        : { role, decision: null, note: null, decidedAt: null, decidedByName: null }
    }),
    relatedEntities: p.relatedEntities.map((x) => x.entity),
    startDate: p.startDate,
    targetEndDate: p.targetEndDate,
    approvedByName: p.approvedByName,
    approvedAt: p.approvedAt,
    // Didaftarkan di tahap awal tanpa melewati rantai persetujuan.
    noApproval: p.approvalChain.length === 0 && p.approvedByName === NO_APPROVAL_LABEL,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    entity: p.entity,
    latestReport: r ? { status: r.status, progressPct: r.progressPct, reportDate: r.reportDate, isLate: r.isLate } : null,
    permissions: {
      manage: canManage(user, p),
      setLifecycle: canSetLifecycle(user, p),
      approve: pending !== null && canSignSlot(user, pending, p.entityId),
      resubmit: p.lifecycle === 'DITOLAK' && canManage(user, p),
    },
  }
}

/** PT yang boleh dituju pengaju: PT-nya sendiri untuk peran berlingkup, PT mana pun untuk peran global. */
async function proposalEntity(user: SessionUser, requested: string | null) {
  const select = { id: true, code: true, name: true, type: true, isActive: true }
  // Peran berlingkup selalu terpaku pada PT-nya; tanpa PT berarti tidak ada
  // tujuan (gagal-tertutup), bukan PT bebas pilihan dari permintaan.
  const id = isMasterRole(user.role) || can(user.role, 'group:read') ? (user.scopeEntityId ?? requested) : user.scopeEntityId
  if (!id) return null
  const e = await db.entity.findUnique({ where: { id }, select })
  return e && e.type === 'PT' && e.isActive ? e : null
}

const parseDate = (v: string): Date | null | undefined => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** PT terkait: unik, bukan PT pemilik, harus PT aktif. Mengembalikan pesan galat bila ada yang tidak sah. */
async function readRelated(raw: unknown, ownerId: string): Promise<string[] | string> {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return 'Daftar PT terkait tidak valid.'
  const ids = Array.from(new Set(raw.filter((x): x is string => typeof x === 'string' && x !== ownerId))).slice(0, 50)
  if (ids.length === 0) return []
  const found = await db.entity.count({ where: { id: { in: ids }, type: 'PT', isActive: true } })
  return found === ids.length ? ids : 'Ada PT terkait yang tidak dikenali.'
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams

    if (sp.get('options') === '1') {
      if (!can(user.role, 'project:propose') && !can(user.role, 'project:manage')) {
        return NextResponse.json({ error: 'Tidak diizinkan' }, { status: 403 })
      }
      const entity = await proposalEntity(user, sp.get('entityId'))
      const entities = await db.entity.findMany({
        where: { type: 'PT', isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json({
        entity: entity ? { id: entity.id, code: entity.code, name: entity.name } : null,
        entityPinned: Boolean(user.scopeEntityId),
        entities,
        candidates: entity ? await picCandidates(entity.id) : [],
        // [F2-ADMIN] pilihan divisi pelaksana di PT pemilik
        divisions: entity ? await db.division.findMany({ where: { entityId: entity.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [],
        chain: approvalChainFor(user.role),
        picIsSelf: user.role === 'PIC_PROYEK',
      })
    }

    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '20', 10)))
    const entityId = sp.get('entityId') || undefined
    const phase = sp.get('phase') || undefined
    const lifecycle = sp.get('lifecycle') || 'AKTIF'
    const search = sp.get('search') || undefined

    // null for roles that may read the whole group. A project is visible in a
    // PT either as its owner or when it names that PT as related.
    const scopeIds = await scopeEntityIds(user)
    const and: Prisma.ProjectWhereInput[] = []
    if (scopeIds) {
      and.push({ OR: [{ entityId: { in: scopeIds } }, { relatedEntities: { some: { entityId: { in: scopeIds } } } }] })
    }
    if (entityId) and.push({ OR: [{ entityId }, { relatedEntities: { some: { entityId } } }] })

    const where: Prisma.ProjectWhereInput = {
      ...(phase ? { phase } : {}),
      ...(lifecycle === 'ALL' ? {} : { lifecycle }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      ...(and.length ? { AND: and } : {}),
    }

    const [items, total] = await Promise.all([
      db.project.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ lifecycle: 'asc' }, { code: 'asc' }],
        include: PROJECT_INCLUDE,
      }),
      db.project.count({ where }),
    ])

    return NextResponse.json({ items: items.map((p) => format(p, user)), total, page, pageSize })
  } catch (err) {
    // [F3-D] Pesan umum ke klien; detail galat hanya ke log server.
    return serverError(err, 'Proyek belum termuat. Coba lagi.', 'projects GET')
  }
}

/** Membaca isian proyek dari badan permintaan; dipakai POST dan PATCH. */
async function readFields(body: Record<string, unknown>, entityId: string, opts: { partial: boolean }) {
  const has = (k: string) => body[k] !== undefined
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, 4000) : '')
  const errors: string[] = []
  const data: Prisma.ProjectUpdateInput & Prisma.ProjectUncheckedUpdateInput = {}

  if (!opts.partial || has('name')) {
    const name = str('name')
    if (name.length < 5) errors.push('Nama proyek minimal 5 karakter.')
    else data.name = name
  }
  if (!opts.partial || has('description')) {
    const description = str('description')
    if (description.length < 20) errors.push('Jelaskan proyeknya minimal 20 karakter agar penyetuju paham.')
    else data.description = description
  }
  if (has('purpose')) data.purpose = str('purpose').slice(0, 2000) || null
  if (!opts.partial || has('phase')) {
    // Tahap awal boleh dikosongkan: proyek yang belum ditentukan tahapnya
    // dianggap masih Inisiasi.
    const phase = str('phase')
    if (phase && !PHASES.includes(phase)) errors.push('Tahap tidak dikenali.')
    else data.phase = phase || 'INISIASI'
  }
  if (has('startDate') || has('targetEndDate')) {
    const start = parseDate(str('startDate'))
    const end = parseDate(str('targetEndDate'))
    if (start === undefined || end === undefined) errors.push('Format tanggal tidak valid.')
    else {
      if (has('startDate')) data.startDate = start
      if (has('targetEndDate')) data.targetEndDate = end
    }
  }
  if (has('picUserId')) {
    const picUserId = str('picUserId')
    if (!picUserId) {
      data.picUserId = null
      data.picName = null
    } else {
      const pic = await db.user.findFirst({
        where: { id: picUserId, role: 'PIC_PROYEK', isActive: true, scopeEntityId: entityId },
        select: { id: true, name: true },
      })
      if (!pic) errors.push('PIC yang dipilih bukan Manager/PIC Proyek aktif di PT ini.')
      else {
        data.picUserId = pic.id
        data.picName = pic.name
      }
    }
  }
  // [F2-ADMIN] divisi pelaksana: divisi aktif di PT pemilik, atau kosong.
  if (has('divisionId')) {
    const divisionId = str('divisionId').slice(0, 64)
    if (!divisionId) data.divisionId = null
    else {
      const div = await db.division.findFirst({ where: { id: divisionId, entityId, isActive: true }, select: { id: true } })
      if (!div) errors.push('Divisi yang dipilih bukan divisi aktif di PT ini.')
      else data.divisionId = div.id
    }
  }
  const related = has('relatedEntityIds') ? await readRelated(body.relatedEntityIds, entityId) : undefined
  if (typeof related === 'string') errors.push(related)

  return { errors, data, related: typeof related === 'string' ? undefined : related }
}

/**
 * POST — ajukan proyek. PIC boleh dikosongkan oleh siapa pun yang mengajukan
 * dan ditentukan belakangan. Pengaju di puncak rantai membuat proyek langsung
 * AKTIF; pengaju lain bisa memilih `skipApproval` untuk mendaftarkan proyek
 * tahap awal (Inisiasi) tanpa menunggu persetujuan — proyek langsung aktif dan
 * ditandai supaya jelas bahwa rantai persetujuannya dilewati (1 Okt 2026).
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'project:propose')) {
    return NextResponse.json({ error: 'Peran Anda tidak mengajukan proyek' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const entity = await proposalEntity(user, typeof body.entityId === 'string' ? body.entityId : null)
  if (!entity) {
    return NextResponse.json({ error: 'Proyek harus diajukan untuk sebuah PT yang aktif' }, { status: 400 })
  }

  const { errors, data, related } = await readFields(body, entity.id, { partial: false })
  const start = data.startDate instanceof Date ? data.startDate : null
  const end = data.targetEndDate instanceof Date ? data.targetEndDate : null
  if (start && end && end <= start) errors.push('Target selesai harus setelah rencana mulai.')
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 422 })

  // Kode berurutan per PT: PT-SIGMA-PRJ-03.
  const count = await db.project.count({ where: { entityId: entity.id } })
  let code = `${entity.code}-PRJ-${String(count + 1).padStart(2, '0')}`
  for (let n = count + 2; await db.project.findUnique({ where: { code }, select: { id: true } }); n++) {
    code = `${entity.code}-PRJ-${String(n).padStart(2, '0')}`
  }

  // Proyek tahap awal boleh didaftarkan tanpa persetujuan; tahap berikutnya
  // tetap lewat rantai seperti biasa.
  const roleChain = approvalChainFor(user.role)
  const skipApproval = body.skipApproval === true && roleChain.length > 0
  if (skipApproval && ((data.phase as string) ?? 'INISIASI') !== 'INISIASI') {
    return NextResponse.json({ error: 'Pengajuan tanpa persetujuan hanya untuk tahap awal (Inisiasi).' }, { status: 422 })
  }
  const chain = skipApproval ? [] : roleChain
  const active = chain.length === 0
  const project = await db.project.create({
    data: {
      ...(data as Prisma.ProjectUncheckedCreateInput),
      name: data.name as string,
      phase: (data.phase as string) ?? 'INISIASI',
      entityId: entity.id,
      code,
      lifecycle: active ? 'AKTIF' : 'DIUSULKAN',
      approvalChain: chain,
      proposedById: user.id,
      proposedAt: new Date(),
      ...(active ? { approvedAt: new Date(), approvedByName: skipApproval ? NO_APPROVAL_LABEL : user.name } : {}),
      relatedEntities: { create: (related ?? []).map((entityId) => ({ entityId })) },
    },
    include: PROJECT_INCLUDE,
  })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: skipApproval ? 'CREATE_PROJECT_NO_APPROVAL' : active ? 'CREATE_PROJECT' : 'PROPOSE_PROJECT',
      targetType: 'PROJECT',
      targetId: project.id,
      afterData: JSON.stringify({ code, name: project.name, phase: project.phase, chain, skipApproval, divisionId: project.divisionId, related: related ?? [] }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json({ ok: true, project: format(project, user) })
}

/**
 * PATCH { id, ...fields } — ubah proyek; { id, lifecycle } — ganti status;
 * { id, resubmit: true } — ajukan ulang pengajuan yang ditolak (slot dikosongkan).
 */
export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const existing = await db.project.findUnique({ where: { id }, include: PROJECT_INCLUDE })
  if (!existing) return NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 })
  if (!canManage(user, existing)) {
    return NextResponse.json({ error: 'Anda tidak berwenang mengubah proyek ini' }, { status: 403 })
  }

  if (body.resubmit === true) {
    if (existing.lifecycle !== 'DITOLAK') {
      return NextResponse.json({ error: 'Hanya pengajuan yang ditolak yang bisa diajukan ulang' }, { status: 409 })
    }
    const active = existing.approvalChain.length === 0
    // [F2-URUNGKAN] baris persetujuan lengkap sebelum dikosongkan, untuk urungkan.
    const priorApprovals = await db.projectApproval.findMany({
      where: { projectId: id },
      select: { role: true, decision: true, note: true, decidedById: true, decidedAt: true },
    })
    const updated = await db.$transaction(async (tx) => {
      await tx.projectApproval.deleteMany({ where: { projectId: id } })
      return tx.project.update({
        where: { id },
        data: {
          lifecycle: active ? 'AKTIF' : 'DIUSULKAN',
          proposedAt: new Date(),
          ...(active ? { approvedAt: new Date(), approvedByName: user.name } : {}),
        },
        include: PROJECT_INCLUDE,
      })
    })
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'RESUBMIT_PROJECT',
        targetType: 'PROJECT',
        targetId: id,
        afterData: JSON.stringify({ lifecycle: updated.lifecycle }),
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      },
    })
    // [F2-URUNGKAN]
    const undoToken = await issueUndo({
      action: 'RESUBMIT_PROJECT',
      targetType: 'PROJECT',
      targetId: id,
      entityId: existing.entityId,
      actorId: user.id,
      snapshot: {
        project: {
          lifecycle: existing.lifecycle,
          approvedAt: existing.approvedAt?.toISOString() ?? null,
          approvedByName: existing.approvedByName,
          proposedAt: existing.proposedAt?.toISOString() ?? null,
        },
        approvals: priorApprovals.map(approvalSnap),
      },
      stamp: await projectStamp(id),
    })
    return NextResponse.json({ ok: true, project: format(updated, user), undoToken })
  }

  const { errors, data, related } = await readFields(body, existing.entityId, { partial: true })
  const start = (data.startDate instanceof Date ? data.startDate : data.startDate === null ? null : existing.startDate) ?? null
  const end = (data.targetEndDate instanceof Date ? data.targetEndDate : data.targetEndDate === null ? null : existing.targetEndDate) ?? null
  if (start && end && end <= start) errors.push('Target selesai harus setelah rencana mulai.')

  if (typeof body.lifecycle === 'string' && body.lifecycle !== existing.lifecycle) {
    if (!MANAGED_LIFECYCLES.includes(body.lifecycle)) errors.push('Status tidak dikenali.')
    else if (!canSetLifecycle(user, existing)) errors.push('Anda tidak berwenang mengganti status proyek ini.')
    else {
      data.lifecycle = body.lifecycle
      if (body.lifecycle === 'AKTIF' && !existing.approvedAt) {
        data.approvedAt = new Date()
        data.approvedByName = user.name
      }
    }
  }
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 422 })

  const updated = await db.project.update({
    where: { id },
    data: {
      ...(data as Prisma.ProjectUncheckedUpdateInput),
      ...(related !== undefined
        ? { relatedEntities: { deleteMany: {}, create: related.map((entityId) => ({ entityId })) } }
        : {}),
    },
    include: PROJECT_INCLUDE,
  })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'UPDATE_PROJECT',
      targetType: 'PROJECT',
      targetId: id,
      beforeData: JSON.stringify({ name: existing.name, phase: existing.phase, lifecycle: existing.lifecycle, picUserId: existing.picUserId, divisionId: existing.divisionId }),
      afterData: JSON.stringify({ name: updated.name, phase: updated.phase, lifecycle: updated.lifecycle, picUserId: updated.picUserId, divisionId: updated.divisionId, related: related ?? undefined }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  // [F2-URUNGKAN] Pengarsipan bisa diurungkan: hanya siklus hidup yang dipulihkan.
  const undoToken =
    updated.lifecycle === 'DIARSIPKAN' && existing.lifecycle !== 'DIARSIPKAN'
      ? await issueUndo({
          action: 'ARCHIVE_PROJECT',
          targetType: 'PROJECT',
          targetId: id,
          entityId: existing.entityId,
          actorId: user.id,
          snapshot: {
            project: {
              lifecycle: existing.lifecycle,
              approvedAt: existing.approvedAt?.toISOString() ?? null,
              approvedByName: existing.approvedByName,
            },
          },
          stamp: await projectStamp(id),
        })
      : null

  return NextResponse.json({ ok: true, project: format(updated, user), undoToken })
}

/** DELETE ?id= — hapus proyek yang belum punya laporan/task; selebihnya diarsipkan. */
export async function DELETE(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const id = req.nextUrl.searchParams.get('id') || ''
  const existing = await db.project.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, entityId: true, proposedById: true, lifecycle: true },
  })
  if (!existing) return NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 })
  if (!canManage(user, existing)) {
    return NextResponse.json({ error: 'Anda tidak berwenang menghapus proyek ini' }, { status: 403 })
  }

  const [daily, tasks, progress] = await Promise.all([
    db.dailyProjectReport.count({ where: { projectId: id } }),
    db.task.count({ where: { projectId: id } }),
    db.projectProgressReport.count({ where: { projectId: id } }),
  ])
  const activity = daily + tasks + progress
  if (activity > 0) {
    return NextResponse.json(
      {
        error: `Proyek ini sudah punya ${activity} laporan/task, jadi tidak dihapus agar riwayatnya utuh. Arsipkan saja.`,
        activity,
        canArchive: canSetLifecycle(user, existing),
      },
      { status: 409 }
    )
  }

  // Persetujuan dan PT terkait ikut terhapus lewat ON DELETE CASCADE.
  await db.project.delete({ where: { id } })
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: 'DELETE_PROJECT',
      targetType: 'PROJECT',
      targetId: id,
      beforeData: JSON.stringify({ code: existing.code, name: existing.name, lifecycle: existing.lifecycle }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    },
  })

  return NextResponse.json({ ok: true })
}
