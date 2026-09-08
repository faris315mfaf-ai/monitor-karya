import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { PROJECT_APPROVER_ROLES, can } from '@/lib/rbac'

/**
 * Persetujuan pengajuan proyek (7 Sep 2026).
 *
 * Admin PT mengajukan; proyek menjadi AKTIF setelah tiga pihak menyetujui —
 * Direktur Entitas (PT yang sama), Direktur SDM & GA, dan Manajemen. Satu
 * penolakan membuat proyek DITOLAK. Tiap pihak punya satu slot keputusan yang
 * bisa diperbarui selama proyek masih DIUSULKAN.
 *
 *   POST { projectId, decision: 'DISETUJUI' | 'DITOLAK', note? }
 */
export async function POST(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  // Kapabilitasnya harus ada DAN perannya harus salah satu dari tiga pihak,
  // karena tiap keputusan mengisi slot atas nama peran itu.
  const role = user.role as (typeof PROJECT_APPROVER_ROLES)[number]
  if (!can(user.role, 'project:approve') || !PROJECT_APPROVER_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'Hanya Direktur Entitas, Direktur SDM & GA, dan Manajemen yang menyetujui proyek' },
      { status: 403 }
    )
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
    return NextResponse.json({ error: 'Alasan penolakan wajib diisi agar pengaju tahu apa yang perlu diperbaiki' }, { status: 422 })
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, entityId: true, lifecycle: true },
  })
  if (!project) return NextResponse.json({ error: 'Proyek tidak ditemukan' }, { status: 404 })
  if (project.lifecycle !== 'DIUSULKAN') {
    return NextResponse.json({ error: 'Proyek ini sudah tidak dalam tahap pengajuan' }, { status: 409 })
  }
  // Direktur Entitas hanya menyetujui proyek di PT-nya sendiri.
  if (role === 'DIREKTUR_ENTITAS' && project.entityId !== user.scopeEntityId) {
    return NextResponse.json({ error: 'Proyek ini berada di luar entitas Anda' }, { status: 403 })
  }

  await db.projectApproval.upsert({
    where: { projectId_role: { projectId, role } },
    update: { decision, note: note || null, decidedById: user.id, decidedAt: new Date() },
    create: { projectId, role, decision, note: note || null, decidedById: user.id },
  })

  const approvals = await db.projectApproval.findMany({ where: { projectId } })
  const rejected = approvals.some((a) => a.decision === 'DITOLAK')
  const approvedRoles = new Set(approvals.filter((a) => a.decision === 'DISETUJUI').map((a) => a.role))
  const complete = PROJECT_APPROVER_ROLES.every((r) => approvedRoles.has(r))

  let lifecycle = project.lifecycle
  if (rejected) {
    lifecycle = 'DITOLAK'
    await db.project.update({ where: { id: projectId }, data: { lifecycle } })
  } else if (complete) {
    lifecycle = 'AKTIF'
    await db.project.update({
      where: { id: projectId },
      data: { lifecycle, approvedAt: new Date(), approvedByName: user.name },
    })
  }

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: decision === 'DISETUJUI' ? 'APPROVE_PROJECT' : 'REJECT_PROJECT',
      targetType: 'PROJECT',
      targetId: projectId,
      afterData: JSON.stringify({ role, decision, note, lifecycle }),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  })

  return NextResponse.json({
    ok: true,
    lifecycle,
    approvals: approvals.map((a) => ({ role: a.role, decision: a.decision, note: a.note, decidedAt: a.decidedAt })),
  })
}
