import 'server-only'

import { db } from '@/lib/db'
import { clientIp } from '@/lib/security'
import type { Prisma } from '@prisma/client'
import type { SessionUser } from '@/lib/auth'
import { SH_AUDIT_TARGET } from '@/lib/subholding/rules'

type Client = Prisma.TransactionClient | typeof db

/**
 * Notifikasi dalam aplikasi (NotificationLog channel APLIKASI, pola
 * src/lib/pic-access.ts) dan jejak AuditLog untuk laporan subholding.
 *
 * Notifikasi bersifat upaya-terbaik dan dikirim SESUDAH transaksi tulis
 * commit: kegagalan mengirim tidak membatalkan laporan/keputusan.
 */

export type ShNotifyPayload = { title: string; body: string; tab: string; reportId?: string }

async function notifyWhere(where: Prisma.UserWhereInput, template: string, payload: ShNotifyPayload, exceptUserId?: string) {
  try {
    const recipients = await db.user.findMany({
      where: { ...where, isActive: true, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
      select: { id: true, email: true },
      take: 200,
    })
    if (!recipients.length) return
    await db.notificationLog.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        channel: 'APLIKASI',
        recipient: r.email,
        template,
        status: 'SENT',
        sentAt: new Date(),
        payload: JSON.stringify(payload),
      })),
    })
  } catch (err) {
    console.error('[subholding] notifikasi gagal:', err instanceof Error ? err.message : err)
  }
}

/** Ke akun Admin subholding pemilik laporan (keputusan, komentar supervisor). */
export function notifyShAdmins(subholdingId: string, template: string, payload: ShNotifyPayload, exceptUserId?: string) {
  return notifyWhere({ role: 'ADMIN_SUBHOLDING', scopeEntityId: subholdingId }, template, payload, exceptUserId)
}

/** Ke semua Supervisor (laporan baru, kirim ulang, balasan admin). */
export function notifyShReviewers(template: string, payload: ShNotifyPayload, exceptUserId?: string) {
  return notifyWhere({ role: 'SUPERVISOR' }, template, payload, exceptUserId)
}

/** Jejak audit laporan subholding (dalam transaksi pemanggil). */
export async function auditSh(
  client: Client,
  req: Request,
  user: SessionUser,
  action: string,
  reportId: string,
  data: { before?: unknown; after?: unknown } = {}
) {
  await client.auditLog.create({
    data: {
      actorId: user.id,
      action,
      targetType: SH_AUDIT_TARGET,
      targetId: reportId,
      beforeData: data.before === undefined ? null : JSON.stringify(data.before),
      afterData: data.after === undefined ? null : JSON.stringify(data.after),
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent')?.slice(0, 300) || null,
    },
  })
}
