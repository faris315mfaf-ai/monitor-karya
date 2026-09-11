import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { PROJECT_ENTITY_SLOTS, can, canSignSlot, pendingSlot } from '@/lib/rbac'
import { PROJECT_APPROVER_LABELS } from '@/lib/constants'

/**
 * Persetujuan pengajuan proyek (11 Sep 2026): slot demi slot mengikuti
 * `Project.approvalChain`, urut. Hanya slot yang sedang menunggu yang bisa
 * ditandatangani — oleh pemegang peran slot itu (Admin PT dan Direktur harus
 * dari PT yang sama; slot Manajemen boleh oleh Manajemen atau Direksi
 * Holding), atau oleh akun induk (TI, Super Admin) atas nama slot itu.
 * Seluruh slot DISETUJUI → proyek AKTIF; satu DITOLAK → DITOLAK.
 *
 *   POST { projectId, decision: 'DISETUJUI' | 'DITOLAK', note? }
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user
  if (!can(user.role, 'project:approve')) {
    return NextResponse.json({ error: 'Peran Anda tidak menyetujui proyek' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const decision = body.decision === 'DITOLAK' ? 'DITOLAK' : body.decision === 'DISETUJUI' ? 'DISETUJUI' : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
  if (!projectId || !decision) {
    return NextResponse.json({ error: 'Proyek dan keputusan wajib diisi' }, { status: 400 })
  }
  if (decision === 'DITOLAK' && note.length < 5) {
    return NextResponse.json(
      { error: 'Alasan penolakan wajib diisi agar pengaju tahu apa yang perlu diperbaiki' },
      { status: 422 }
    )
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, entityId: true, lifecycle: true, approvalChain: true, approvals: { select: { role: true, decision: true } } },
  })
  if (!project) return NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 })
  if (project.lifecycle !== 'DIUSULKAN') {
    return NextResponse.json({ error: 'Proyek ini sudah tidak dalam tahap pengajuan' }, { status: 409 })
  }

  const approvedRoles = project.approvals.filter((a) => a.decision === 'DISETUJUI').map((a) => a.role)
  const slot = pendingSlot(project.approvalChain, approvedRoles)
  if (!slot) {
    // Rantai kosong tetapi masih DIUSULKAN — data lama. Aktifkan saja.
    await db.project.update({ where: { id: projectId }, data: { lifecycle: 'AKTIF', approvedAt: new Date(), approvedByName: user.name } })
    return NextResponse.json({ ok: true, lifecycle: 'AKTIF', pending: null, approvals: [] })
  }
  if (!canSignSlot(user, slot, project.entityId)) {
    const label = PROJECT_APPROVER_LABELS[slot] ?? slot
    const sameEntity = (PROJECT_ENTITY_SLOTS as readonly string[]).includes(slot) ? ' di PT pemilik proyek' : ''
    return NextResponse.json({ error: `Sekarang giliran ${label}${sameEntity}. Anda tidak bisa menandatangani slot ini.` }, { status: 403 })
  }

  await db.projectApproval.upsert({
    where: { projectId_role: { projectId, role: slot } },
    update: { decision, note: note || null, decidedById: user.id, decidedAt: new Date() },
    create: { projectId, role: slot, decision, note: note || null, decidedById: user.id },
  })

  const nextPending = decision === 'DISETUJUI' ? pendingSlot(project.approvalChain, [...approvedRoles, slot]) : slot
  let lifecycle = project.lifecycle
  if (decision === 'DITOLAK') {
    lifecycle = 'DITOLAK'
    await db.project.update({ where: { id: projectId }, data: { lifecycle } })
  } else if (nextPending === null) {
    lifecycle = 'AKTIF'
    await db.project.update({ where: { id: projectId }, data: { lifecycle, approvedAt: new Date(), approvedByName: user.name } })
  }

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: decision === 'DISETUJUI' ? 'APPROVE_PROJECT' : 'REJECT_PROJECT',
      targetType: 'PROJECT',
      targetId: projectId,
      afterData: JSON.stringify({ slot, signerRole: user.role, decision, note, lifecycle }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  const approvals = await db.projectApproval.findMany({ where: { projectId }, select: { role: true, decision: true, note: true, decidedAt: true } })
  return NextResponse.json({ ok: true, lifecycle, pending: lifecycle === 'DIUSULKAN' ? nextPending : null, approvals })
}
