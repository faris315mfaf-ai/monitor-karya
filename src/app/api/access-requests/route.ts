import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { activationError, activationIssueLimit, issueAccountActivation } from '@/lib/account-activation'
import { refuseUnscoped, requireApiUser, scopeEntityIds, type SessionUser } from '@/lib/auth'
import { entityRef } from '@/lib/account-desk'
import {
  AccessRefusal, applyAccessRequest, decisionDesk, describe, mayDecideFor, readPayload, revertExpiredAccess,
} from '@/lib/access-requests'
import { ACCESS_REQUEST_TYPES, type AccessRequestItem, type AccessRequestType, type AccessStatus } from '@/lib/admin-meta'
import { USERNAME_RE, isValidEmail, slugify } from '@/lib/companies'
import { clientErrorMessage, serverError } from '@/lib/api-error'
import { limitedRequestRefusal } from '@/lib/access-requesters'
import { READ_ONLY_MESSAGE, isReadOnlyRole } from '@/lib/group-panel' // [F2-GRUP]

/**
 * Permintaan akses (6 Okt 2026, 04-admin-pt.md).
 *
 *   GET   ?status=pending|all — pemutus melihat permintaan PT-nya (Admin PT)
 *         atau seluruh grup (Super Admin, TI); akun lain hanya permintaannya sendiri.
 *   POST  { type, payload, reason?, entityId? } — ajukan permintaan.
 *   PATCH { id, decision: 'approve'|'reject', note? } — putuskan. Persetujuan
 *         langsung menerapkan perubahan lewat aturan meja akun yang sama dengan
 *         /api/companies/users, dalam satu transaksi, dan tercatat di AuditLog.
 */

export const dynamic = 'force-dynamic'

const MAX_PENDING_PER_USER = 20
const ipOf = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

const include = {
  requestedBy: { select: { id: true, name: true } },
  targetUser: { select: { id: true, name: true, role: true, isActive: true, mustChangePassword: true, lastLoginAt: true, scopeEntityId: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.AccessRequestInclude

type RowWithNames = Prisma.AccessRequestGetPayload<{ include: typeof include }>

async function toItems(rows: RowWithNames[], user: SessionUser): Promise<AccessRequestItem[]> {
  const desk = decisionDesk(user)
  const payloads = rows.map((r) => {
    try {
      return JSON.parse(r.payload) as Record<string, unknown>
    } catch {
      return {}
    }
  })
  const entityIds = Array.from(new Set(rows.map((r) => r.entityId).filter((x): x is string => !!x)))
  const divisionIds = Array.from(new Set(payloads.map((p) => p.divisionId).filter((x): x is string => typeof x === 'string')))
  const targetIds = Array.from(new Set(payloads.map((p) => p.userId).filter((x): x is string => typeof x === 'string')))
  const none: Promise<{ id: string; name: string }[]> = Promise.resolve([])
  const [entities, divisions, targets] = await Promise.all([
    entityIds.length ? db.entity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } }) : none,
    divisionIds.length ? db.division.findMany({ where: { id: { in: divisionIds } }, select: { id: true, name: true } }) : none,
    targetIds.length ? db.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true, role: true } }) : Promise.resolve([] as { id: string; name: string; role: string }[]),
  ])
  const eName = new Map(entities.map((e) => [e.id, e.name]))
  const dName = new Map(divisions.map((d) => [d.id, d.name]))
  const uName = new Map(targets.map((u) => [u.id, u.name]))
  const uRole = new Map(targets.map((u) => [u.id, u.role]))

  return rows.map((r, i) => {
    const p = payloads[i]
    const targetName = r.targetUser?.name ?? (typeof p.userId === 'string' ? uName.get(p.userId) : null) ?? null
    const { title, detail } = describe(r.type as AccessRequestType, p, {
      target: targetName,
      division: typeof p.divisionId === 'string' ? (dName.get(p.divisionId) ?? null) : null,
    })
    return {
      id: r.id,
      type: r.type as AccessRequestType,
      status: r.status as AccessStatus,
      title,
      detail,
      reason: r.reason,
      entityId: r.entityId,
      entityName: r.entityId ? (eName.get(r.entityId) ?? null) : null,
      requester: r.requestedBy,
      target: r.targetUser
        ? { id: r.targetUser.id, name: r.targetUser.name }
        : typeof p.userId === 'string' && targetName
          ? { id: p.userId, name: targetName }
          : null,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: r.decisionNote,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revertedAt: r.revertedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      canActivate: r.type === 'AKUN_BARU' && r.status === 'DISETUJUI' &&
        !!r.targetUser?.isActive && !!r.targetUser.mustChangePassword && !r.targetUser.lastLoginAt &&
        r.targetUser.id !== user.id && mayDecideFor(desk, r.targetUser.scopeEntityId) && !!desk?.roles.includes(r.targetUser.role),
      // Tombol hanya untuk yang benar-benar bisa diterapkan meja ini (server tetap memeriksa).
      canDecide:
        r.status === 'DIAJUKAN' &&
        r.requestedById !== user.id &&
        mayDecideFor(desk, r.entityId) &&
        (typeof p.role !== 'string' || !!desk?.roles.includes(p.role)) &&
        (() => {
          const tr = r.targetUser?.role ?? (typeof p.userId === 'string' ? uRole.get(p.userId) : undefined)
          return !tr || !!desk?.roles.includes(tr)
        })(),
    }
  })
}

/** Batas baca: pemutus melihat PT-nya / seluruh grup; selain itu hanya miliknya sendiri. */
function readWhere(user: SessionUser): Prisma.AccessRequestWhereInput {
  const desk = decisionDesk(user)
  if (desk?.full) return {}
  if (desk) return { OR: [{ entityId: desk.entityId }, { requestedById: user.id }] }
  return { requestedById: user.id }
}

export async function GET(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  try {
    const desk = decisionDesk(user)
    if (desk) await revertExpiredAccess().catch(() => 0)
    const status = req.nextUrl.searchParams.get('status') === 'all' ? null : 'DIAJUKAN'
    const base = readWhere(user)
    const where: Prisma.AccessRequestWhereInput = { AND: [base, status ? { status } : {}] }
    const [rows, pending] = await Promise.all([
      db.accessRequest.findMany({ where, include, orderBy: [{ createdAt: 'desc' }], take: 50 }),
      db.accessRequest.count({ where: { AND: [base, { status: 'DIAJUKAN' }] } }),
    ])
    return NextResponse.json({ items: await toItems(rows, user), pending, canDecide: !!desk })
  } catch (err) {
    return serverError(err, 'Permintaan akses belum termuat. Coba lagi.', 'access-requests GET')
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  // [F2-GRUP] Auditor hanya membaca: tidak mengajukan perubahan akses.
  if (isReadOnlyRole(user.role)) return NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 403 })
  const unscoped = refuseUnscoped(user)
  if (unscoped) return unscoped

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  const type = body.type as AccessRequestType
  if (!ACCESS_REQUEST_TYPES.includes(type)) return NextResponse.json({ error: 'Jenis permintaan tidak dikenali.' }, { status: 422 })
  const payload = readPayload(type, body.payload)
  if (typeof payload === 'string') return NextResponse.json({ error: payload }, { status: 422 })
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null
  // [F2-ADMIN] Kepala divisi & PIC hanya menyasar timnya dan posisi PIC/kepala divisi.
  const limited = await limitedRequestRefusal(user, type, payload as { role?: string; userId?: string; divisionId?: string; projectId?: string })
  if (limited) return NextResponse.json({ error: limited }, { status: 403 })

  const pendingMine = await db.accessRequest.count({ where: { requestedById: user.id, status: 'DIAJUKAN' } })
  if (pendingMine >= MAX_PENDING_PER_USER) {
    return NextResponse.json({ error: `Anda masih punya ${pendingMine} permintaan yang belum diputuskan.` }, { status: 429 })
  }

  const readable = await scopeEntityIds(user)
  let entityId: string | null
  let targetUserId: string | null = null

  if (type === 'AKUN_BARU') {
    const wanted = typeof body.entityId === 'string' && body.entityId ? body.entityId : null
    entityId = readable === null ? wanted : user.scopeEntityId
    if (readable !== null && wanted && wanted !== user.scopeEntityId) {
      return NextResponse.json({ error: 'Anda hanya dapat mengajukan akun untuk perusahaan Anda sendiri.' }, { status: 403 })
    }
    try {
      await entityRef(entityId)
    } catch (err) {
      return NextResponse.json({ error: clientErrorMessage(err, 'Perusahaan tidak ditemukan', 'access-requests POST') }, { status: 422 })
    }
    // Cek bentrok sejak awal supaya pemutus tidak menyetujui yang pasti gagal.
    const p = payload as { name: string; username?: string; email?: string }
    const username = (p.username ?? slugify(p.name)).toLowerCase()
    if (!USERNAME_RE.test(username)) return NextResponse.json({ error: `Username "${username}" tidak valid.` }, { status: 422 })
    const email = (p.email ?? `${username}@karya.co.id`).toLowerCase()
    if (!isValidEmail(email)) return NextResponse.json({ error: `Email "${email}" tidak valid.` }, { status: 422 })
    const clash = await db.user.findFirst({ where: { OR: [{ username }, { email }] }, select: { id: true } })
    if (clash) return NextResponse.json({ error: 'Username atau email itu sudah dipakai akun lain.' }, { status: 422 })
    const dupe = await db.accessRequest.findFirst({ where: { type, status: 'DIAJUKAN', payload: { contains: `"name":${JSON.stringify(p.name)}` }, entityId } })
    if (dupe) return NextResponse.json({ error: 'Permintaan akun untuk nama ini sudah diajukan.' }, { status: 409 })
  } else {
    const p = payload as { userId: string }
    const target = await db.user.findUnique({ where: { id: p.userId }, select: { id: true, scopeEntityId: true } })
    if (!target || (readable !== null && (!target.scopeEntityId || !readable.includes(target.scopeEntityId)))) {
      return NextResponse.json({ error: 'Akun tidak ditemukan di perusahaan Anda.' }, { status: 404 })
    }
    entityId = target.scopeEntityId
    targetUserId = target.id
    const dupe = await db.accessRequest.findFirst({ where: { type, status: 'DIAJUKAN', targetUserId } })
    if (dupe) return NextResponse.json({ error: 'Permintaan serupa untuk akun ini masih menunggu keputusan.' }, { status: 409 })
  }

  const created = await db.$transaction(async (tx) => {
    const row = await tx.accessRequest.create({
      data: { type, payload: JSON.stringify(payload), reason, entityId, requestedById: user.id, targetUserId },
      include,
    })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'REQUEST_ACCESS',
        targetType: 'ACCESS_REQUEST',
        targetId: row.id,
        afterData: JSON.stringify({ type, entityId, targetUserId }),
        ip: ipOf(req),
      },
    })
    return row
  })
  const [item] = await toItems([created], user)
  return NextResponse.json({ ok: true, item }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  const desk = decisionDesk(user)
  if (!desk) return NextResponse.json({ error: 'Peran Anda tidak memutuskan permintaan akses' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id : ''
  const decision = body?.decision
  if (!id || (decision !== 'approve' && decision !== 'reject')) {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null

  // F1-C: email pengaju untuk kolom recipient notifikasi (seragam = email).
  const row = await db.accessRequest.findUnique({ where: { id }, include: { requestedBy: { select: { email: true } } } })
  if (!row) return NextResponse.json({ error: 'Permintaan tidak ditemukan' }, { status: 404 })
  if (!mayDecideFor(desk, row.entityId)) return NextResponse.json({ error: 'Permintaan ini di luar perusahaan Anda.' }, { status: 403 })
  if (row.requestedById === user.id) {
    return NextResponse.json({ error: 'Anda tidak dapat memutuskan permintaan Anda sendiri.' }, { status: 403 })
  }
  if (row.status !== 'DIAJUKAN') return NextResponse.json({ error: 'Permintaan ini sudah diputuskan.' }, { status: 409 })

  if (decision === 'approve' && row.type === 'AKUN_BARU') {
    const limited = activationIssueLimit(user.id)
    if (limited) return limited
  }
  const now = new Date()
  const ip = ipOf(req)
  try {
    const { updated, activation } = await db.$transaction(async (tx) => {
      let activation: Awaited<ReturnType<typeof issueAccountActivation>> | null = null
      // Klaim baris lebih dulu: dua pemutus yang menekan bersamaan tidak menerapkan dua kali.
      const claimed = await tx.accessRequest.updateMany({
        where: { id, status: 'DIAJUKAN' },
        data: { status: decision === 'approve' ? 'DISETUJUI' : 'DITOLAK', decidedById: user.id, decidedAt: now, decisionNote: note },
      })
      if (claimed.count === 0) throw new AccessRefusal('Permintaan ini sudah diputuskan.', 409)

      let effect: Record<string, unknown> = {}
      if (decision === 'approve') {
        const r = await applyAccessRequest(tx, user, desk, row, ip)
        effect = r.effect
        await tx.accessRequest.update({
          where: { id },
          data: { targetUserId: r.targetUserId, expiresAt: r.expiresAt, appliedData: r.appliedData },
        })
        if (row.type === 'AKUN_BARU' && r.targetUserId) {
          activation = await issueAccountActivation(tx, user, r.targetUserId, ip)
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: decision === 'approve' ? 'APPROVE_ACCESS_REQUEST' : 'REJECT_ACCESS_REQUEST',
          targetType: 'ACCESS_REQUEST',
          targetId: id,
          beforeData: JSON.stringify({ status: 'DIAJUKAN', type: row.type }),
          afterData: JSON.stringify({ status: decision === 'approve' ? 'DISETUJUI' : 'DITOLAK', note, ...effect }),
          ip,
        },
      })
      return { updated: await tx.accessRequest.findUniqueOrThrow({ where: { id }, include }), activation }
    })

    const [item] = await toItems([updated], user)
    if (row.requestedById) {
      await db.notificationLog
        .create({
          data: {
            userId: row.requestedById,
            channel: 'APLIKASI',
            recipient: row.requestedBy?.email ?? row.requestedById,
            template: 'KEPUTUSAN_AKSES',
            status: 'SENT',
            sentAt: now,
            payload: JSON.stringify({
              title: `${item.title} ${decision === 'approve' ? 'disetujui' : 'ditolak'}`,
              body: `Diputuskan oleh ${user.name}.${note ? ` Catatan: ${note}` : ''}`,
              accessRequestId: id,
            }),
          },
        })
        .catch(() => null)
    }
    return NextResponse.json({ ok: true, item, activation }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof AccessRefusal) return NextResponse.json({ error: err.message }, { status: err.status })
    if (row.type === 'AKUN_BARU' && decision === 'approve') return activationError(err)
    return NextResponse.json({ error: clientErrorMessage(err, 'Gagal memutuskan permintaan. Coba lagi.', 'access-requests PATCH') }, { status: 422 })
  }
}
