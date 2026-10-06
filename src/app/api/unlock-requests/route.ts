import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds, scopeUserIds } from '@/lib/auth'
import { can } from '@/lib/rbac'
import { Prisma } from '@prisma/client'
import {
  DEFAULT_UNLOCK_HOURS, MAX_UNLOCK_HOURS, normalizeTarget, relockExpiredUnlocks, resolveTarget, setReportLock, targetLabels,
} from '@/lib/unlock-requests'
import { serverError } from '@/lib/api-error'

/**
 * Buka kunci laporan (lihat src/lib/unlock-requests.ts).
 *
 *   GET   — daftar (cakupan pengaju mengikuti scopeUserIds)
 *   POST  { targetType: DAILY_REPORT|WEEKLY_REPORT, targetId, reason } — ajukan (unlock:request)
 *   PATCH { id, action: approve|reject } — putuskan (unlock:approve)
 *   PATCH { id, action: execute, hours? } — jalankan buka kunci (unlock:execute)
 *   PATCH { id, action: relock } — kunci kembali lebih awal (unlock:execute)
 *
 * Tidak ada yang memutuskan pengajuannya sendiri; setiap langkah tercatat di AuditLog.
 */

const ipOf = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

// GET /api/unlock-requests - list unlock requests
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '30', 10)))
    const status = sp.get('status') || undefined

    if (can(user.role, 'unlock:execute')) await relockExpiredUnlocks().catch(() => 0)

    // null for roles that may read the whole group. [F2-ADMIN] PIC proyek dan
    // kepala divisi hanya melihat pengajuannya sendiri, bukan seluruh PT.
    const scopeIds = user.role === 'PIC_PROYEK' || user.role === 'KEPALA_DIVISI' ? [user.id] : await scopeUserIds(user)

    const where: Prisma.UnlockRequestWhereInput = {
      ...(status ? { status } : {}),
      ...(scopeIds ? { AND: [{ requestedById: { in: scopeIds } }] } : {}),
    }

    const [items, total] = await Promise.all([
      db.unlockRequest.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          executedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      db.unlockRequest.count({ where }),
    ])
    const labels = await targetLabels(items)

    return NextResponse.json({
      items: items.map((u) => ({ ...u, targetLabel: labels.get(u.targetId) ?? 'Laporan sudah tidak ada' })),
      total,
      page,
      pageSize,
      can: {
        request: can(user.role, 'unlock:request'),
        approve: can(user.role, 'unlock:approve'),
        execute: can(user.role, 'unlock:execute'),
      },
      me: user.id,
    })
  } catch (err) {
    return serverError(err, 'Pengajuan buka kunci belum termuat. Coba lagi.', 'unlock-requests GET')
  }
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'unlock:request')) return NextResponse.json({ error: 'Peran Anda tidak mengajukan buka kunci' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const targetType = normalizeTarget(typeof body?.targetType === 'string' ? body.targetType : '')
  const targetId = typeof body?.targetId === 'string' ? body.targetId : ''
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (!targetType || !targetId) return NextResponse.json({ error: 'Pilih laporan yang ingin dibuka.' }, { status: 422 })
  if (reason.length < 10) return NextResponse.json({ error: 'Tulis alasan minimal 10 karakter.' }, { status: 422 })

  const target = await resolveTarget(targetType, targetId)
  const readable = await scopeEntityIds(user)
  if (!target || (readable !== null && !readable.includes(target.entityId))) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan di perusahaan Anda.' }, { status: 404 })
  }
  // [F1-A] PIC hanya boleh mengajukan untuk laporan harian proyek yang ia pegang.
  if (user.role === 'PIC_PROYEK') {
    const own =
      targetType === 'DAILY_REPORT'
        ? await db.dailyProjectReport.findFirst({ where: { id: targetId, project: { picUserId: user.id } }, select: { id: true } })
        : null
    if (!own) return NextResponse.json({ error: 'Laporan tidak ditemukan di proyek Anda.' }, { status: 404 })
  }
  const open = await db.unlockRequest.findFirst({
    where: { targetType, targetId, status: { in: ['DIAJUKAN', 'DISETUJUI'] } },
    select: { id: true },
  })
  if (open) return NextResponse.json({ error: 'Buka kunci untuk laporan ini masih diproses.' }, { status: 409 })

  const created = await db.$transaction(async (tx) => {
    const row = await tx.unlockRequest.create({
      data: { targetType, targetId, reason, status: 'DIAJUKAN', requestedById: user.id },
    })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'REQUEST_UNLOCK',
        targetType: 'UNLOCK_REQUEST',
        targetId: row.id,
        afterData: JSON.stringify({ targetType, targetId, label: target.label }),
        ip: ipOf(req),
      },
    })
    return row
  })
  return NextResponse.json({ ok: true, item: { ...created, targetLabel: target.label } }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id : ''
  const action = body?.action
  if (!id || !['approve', 'reject', 'execute', 'relock'].includes(String(action))) {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }
  const needs = action === 'approve' || action === 'reject' ? 'unlock:approve' : 'unlock:execute'
  if (!can(user.role, needs)) {
    return NextResponse.json({ error: needs === 'unlock:approve' ? 'Peran Anda tidak memutuskan buka kunci' : 'Peran Anda tidak menjalankan buka kunci' }, { status: 403 })
  }

  // F1-C: email pengaju untuk kolom recipient notifikasi (seragam = email).
  const row = await db.unlockRequest.findUnique({ where: { id }, include: { requestedBy: { select: { email: true } } } })
  if (!row) return NextResponse.json({ error: 'Pengajuan tidak ditemukan' }, { status: 404 })
  const type = normalizeTarget(row.targetType)
  const target = type ? await resolveTarget(type, row.targetId) : null
  if (!target) return NextResponse.json({ error: 'Laporan yang dituju sudah tidak ada.' }, { status: 404 })
  const readable = await scopeEntityIds(user)
  if (readable !== null && !readable.includes(target.entityId)) {
    return NextResponse.json({ error: 'Laporan ini di luar cakupan Anda.' }, { status: 403 })
  }
  if ((action === 'approve' || action === 'reject') && row.requestedById === user.id) {
    return NextResponse.json({ error: 'Anda tidak dapat memutuskan pengajuan Anda sendiri.' }, { status: 403 })
  }

  const expected = action === 'approve' || action === 'reject' ? 'DIAJUKAN' : action === 'execute' ? 'DISETUJUI' : 'DIEKSEKUSI'
  if (row.status !== expected || (action === 'relock' && row.reLockedAt)) {
    return NextResponse.json({ error: 'Status pengajuan sudah berubah. Muat ulang lalu coba lagi.' }, { status: 409 })
  }

  const now = new Date()
  const hoursRaw = typeof body?.hours === 'number' ? body.hours : DEFAULT_UNLOCK_HOURS
  const hours = Math.min(MAX_UNLOCK_HOURS, Math.max(1, Math.floor(hoursRaw)))
  const data: Prisma.UnlockRequestUncheckedUpdateManyInput =
    action === 'approve'
      ? { status: 'DISETUJUI', approvedById: user.id, approvedAt: now }
      : action === 'reject'
        ? { status: 'DITOLAK', approvedById: user.id, approvedAt: now }
        : action === 'execute'
          ? { status: 'DIEKSEKUSI', executedById: user.id, executedAt: now, unlockUntil: new Date(now.getTime() + hours * 3600000) }
          : { reLockedAt: now }

  try {
    const updated = await db.$transaction(async (tx) => {
      // Bersyarat pada status lama supaya dua klik bersamaan tidak berjalan dua kali.
      const claimed = await tx.unlockRequest.updateMany({ where: { id, status: expected, ...(action === 'relock' ? { reLockedAt: null } : {}) }, data })
      if (claimed.count === 0) throw new Error('CONFLICT')
      if (type && action === 'execute') await setReportLock(tx, type, row.targetId, false, now)
      if (type && action === 'relock') await setReportLock(tx, type, row.targetId, true, now)
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: { approve: 'APPROVE_UNLOCK', reject: 'REJECT_UNLOCK', execute: 'UNLOCK_EXECUTE', relock: 'RELOCK_REPORT' }[action as string]!,
          targetType: 'UNLOCK_REQUEST',
          targetId: id,
          beforeData: JSON.stringify({ status: row.status }),
          afterData: JSON.stringify({ ...data, label: target?.label ?? null }),
          ip: ipOf(req),
        },
      })
      return tx.unlockRequest.findUniqueOrThrow({ where: { id } })
    })

    if (row.requestedById && row.requestedById !== user.id && action !== 'relock') {
      const verb = action === 'approve' ? 'disetujui' : action === 'reject' ? 'ditolak' : `dibuka sampai ${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(updated.unlockUntil ?? now)} WIB`
      await db.notificationLog
        .create({
          data: {
            userId: row.requestedById,
            channel: 'APLIKASI',
            recipient: row.requestedBy?.email ?? row.requestedById,
            template: 'KEPUTUSAN_BUKA_KUNCI',
            status: 'SENT',
            sentAt: now,
            payload: JSON.stringify({ title: `Buka kunci ${verb}`, body: `${target?.label ?? 'Laporan'} · oleh ${user.name}.`, unlockRequestId: id }),
          },
        })
        .catch(() => null)
    }
    return NextResponse.json({ ok: true, item: { ...updated, targetLabel: target?.label ?? 'Laporan sudah tidak ada' } })
  } catch (err) {
    if (err instanceof Error && err.message === 'CONFLICT') {
      return NextResponse.json({ error: 'Status pengajuan sudah berubah. Muat ulang lalu coba lagi.' }, { status: 409 })
    }
    return serverError(err, 'Gagal memproses buka kunci. Coba lagi.', 'unlock-requests PATCH')
  }
}
