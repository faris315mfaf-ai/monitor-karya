import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

// GET /api/notifications - paginated notification logs
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '50', 10)))
    const status = sp.get('status') || undefined
    const channel = sp.get('channel') || undefined
    const template = sp.get('template') || undefined

    const where: Prisma.NotificationLogWhereInput = {
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(template ? { template } : {}),
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
