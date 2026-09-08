import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, isGlobalRole } from '@/lib/auth'
import { Prisma } from '@prisma/client'

/**
 * GET /api/notifications — paginated notification logs.
 *
 *   ?inbox=1  — the signed-in user's own in-app messages (8 Sep 2026): the
 *               latest 30 plus how many are still unread, for the bell.
 *   otherwise — the delivery log; personal unless the role covers the group.
 *
 * PATCH { ids?: string[], all?: true } — mark the user's own messages as read.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams

    if (sp.get('inbox') === '1') {
      const [items, unread] = await Promise.all([
        db.notificationLog.findMany({
          where: { userId: user.id, channel: 'APLIKASI' },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { id: true, template: true, payload: true, createdAt: true, readAt: true },
        }),
        db.notificationLog.count({ where: { userId: user.id, channel: 'APLIKASI', readAt: null } }),
      ])
      return NextResponse.json({
        unread,
        items: items.map((n) => {
          let payload: { title?: string; body?: string; tab?: string } = {}
          try {
            payload = JSON.parse(n.payload) as typeof payload
          } catch {
            // Payload lama bukan JSON — tampilkan nama template saja.
          }
          return {
            id: n.id,
            template: n.template,
            title: payload.title ?? n.template,
            body: payload.body ?? '',
            tab: payload.tab ?? null,
            createdAt: n.createdAt,
            readAt: n.readAt,
          }
        }),
      })
    }

    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '50', 10)))
    const status = sp.get('status') || undefined
    const channel = sp.get('channel') || undefined
    const template = sp.get('template') || undefined

    // Notification history is personal unless the role covers the whole group.
    const ownOnly = !isGlobalRole(user.role)

    const where: Prisma.NotificationLogWhereInput = {
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(template ? { template } : {}),
      ...(ownOnly ? { AND: [{ userId: user.id }] } : {}),
    }

    const [items, total] = await Promise.all([
      db.notificationLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      db.notificationLog.count({ where }),
    ])

    return NextResponse.json({ items, total, page, pageSize })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Permintaan tidak valid' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string') : []
  if (!body.all && ids.length === 0) {
    return NextResponse.json({ error: 'Tidak ada notifikasi yang ditandai' }, { status: 422 })
  }

  // Hanya milik sendiri yang bisa ditandai — id orang lain diabaikan diam-diam.
  const result = await db.notificationLog.updateMany({
    where: { userId: user.id, readAt: null, ...(body.all ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  })

  return NextResponse.json({ ok: true, marked: result.count })
}
