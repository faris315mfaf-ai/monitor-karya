import 'server-only'

import { db } from '@/lib/db'
import { can } from '@/lib/rbac'
import { DAILY_CUTOFF_LABEL } from '@/lib/lock'

/**
 * Pengingat laporan harian ke PIC satu proyek [F1-D] — satu tempat untuk
 * tombol "Ingatkan" di Meja kerja Admin PT (/api/work-desk) dan aturan
 * otomatis HARIAN (src/lib/reminder-rules.ts → runDueRules).
 *
 * Satu pengingat per proyek per hari (tengah malam WIB), apa pun sumbernya:
 * PIC yang sudah diingatkan manual tidak diingatkan lagi oleh cron, dan
 * sebaliknya. Template dan teks sama untuk keduanya.
 */

export const DAILY_PIC_TEMPLATE = 'PENGINGAT_HARIAN_PIC'
export const AUTO_ACTOR_NAME = 'Pengingat otomatis'

/**
 * Siapa yang mengingatkan.
 *   user — akun yang menekan "Ingatkan"; cakupan PT diperiksa dan aksi
 *          dicatat sebagai REMIND_PIC di AuditLog.
 *   auto — pekerjaan terjadwal; tanpa pemeriksaan cakupan, tanpa audit per
 *          proyek (runDueRules mencatat satu AUTO_REMINDER per aturan).
 */
export type RemindActor =
  | { kind: 'user'; id: string; name: string; role: string; scopeEntityId: string | null }
  | { kind: 'auto' }

export type RemindResult =
  | { ok: true; projectId: string; picName: string; remindedAt: Date }
  | { ok: false; status: number; error: string; remindedAt?: Date }

export async function remindPicDaily(
  actor: RemindActor,
  projectId: string,
  today: Date,
  meta?: { ip?: string | null; userAgent?: string | null }
): Promise<RemindResult> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, entityId: true, lifecycle: true, picUser: { select: { id: true, name: true, email: true, isActive: true } } },
  })
  if (!project || project.lifecycle !== 'AKTIF') return { ok: false, status: 404, error: 'Proyek tidak ditemukan' }
  // Gagal-tertutup (6 Okt 2026): hanya peran grup yang menjangkau semua PT;
  // peran berlingkup tanpa PT tidak boleh mengingatkan PIC di PT mana pun.
  if (actor.kind === 'user' && !can(actor.role, 'group:read') && project.entityId !== actor.scopeEntityId) {
    return { ok: false, status: 403, error: 'Proyek ini di luar perusahaan Anda' }
  }
  if (!project.picUser || !project.picUser.isActive) {
    return { ok: false, status: 422, error: `${project.name} belum punya PIC aktif` }
  }
  const report = await db.dailyProjectReport.findUnique({
    where: { projectId_reportDate: { projectId, reportDate: today } },
    select: { submittedAt: true },
  })
  if (report?.submittedAt) return { ok: false, status: 409, error: `Laporan ${project.name} sudah terkirim` }

  const already = await db.notificationLog.findFirst({
    where: { template: DAILY_PIC_TEMPLATE, userId: project.picUser.id, createdAt: { gte: today }, payload: { contains: `"projectId":"${projectId}"` } },
    select: { createdAt: true },
  })
  if (already) {
    return { ok: false, status: 409, error: `${project.picUser.name} sudah diingatkan hari ini`, remindedAt: already.createdAt }
  }

  const actorName = actor.kind === 'user' ? actor.name : AUTO_ACTOR_NAME
  const created = await db.notificationLog.create({
    data: {
      userId: project.picUser.id,
      channel: 'APLIKASI',
      recipient: project.picUser.email,
      template: DAILY_PIC_TEMPLATE,
      status: 'SENT',
      sentAt: new Date(),
      payload: JSON.stringify({
        title: `Laporan harian ${project.name} belum dikirim`,
        body: `Tenggat pukul ${DAILY_CUTOFF_LABEL}. Diingatkan oleh ${actorName}.`,
        tab: 'work-desk',
        projectId,
        entityId: project.entityId,
        actorName,
        ...(actor.kind === 'auto' ? { source: 'CRON' } : {}),
      }),
    },
    select: { createdAt: true },
  })
  if (actor.kind === 'user') {
    await db.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'REMIND_PIC',
        targetType: 'PROJECT',
        targetId: projectId,
        afterData: JSON.stringify({ pic: project.picUser.name }),
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
      },
    })
  }
  return { ok: true, projectId, picName: project.picUser.name, remindedAt: created.createdAt }
}

/** Pengingat harian ke PIC proyek tertentu; dipakai "Ingatkan semua" dan cron. */
export async function remindPicsDaily(
  actor: RemindActor,
  projectIds: string[],
  today: Date,
  meta?: { ip?: string | null; userAgent?: string | null }
): Promise<{ sent: { projectId: string; picName: string; remindedAt: Date }[]; skipped: number }> {
  const sent: { projectId: string; picName: string; remindedAt: Date }[] = []
  let skipped = 0
  for (const id of projectIds) {
    const r = await remindPicDaily(actor, id, today, meta)
    if (r.ok) sent.push({ projectId: r.projectId, picName: r.picName, remindedAt: r.remindedAt })
    else skipped += 1
  }
  return { sent, skipped }
}
