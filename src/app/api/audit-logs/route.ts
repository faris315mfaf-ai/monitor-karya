import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeUserIds } from '@/lib/auth'
import { Prisma } from '@prisma/client'

// GET /api/audit-logs - paginated audit logs
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '50', 10)))
    const actorId = sp.get('actorId') || undefined
    const action = sp.get('action') || undefined
    const targetType = sp.get('targetType') || undefined
    const dateFrom = sp.get('dateFrom')
    const dateTo = sp.get('dateTo')

    const at: Prisma.DateTimeFilter = {}
    for (const [raw, key] of [[dateFrom, 'gte'], [dateTo, 'lte']] as const) {
      if (!raw) continue
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 })
      }
      at[key] = d
    }

    // null for roles that may read the whole group.
    const scopeIds = await scopeUserIds(user)

    const where: Prisma.AuditLogWhereInput = {
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
      ...(Object.keys(at).length ? { at } : {}),
      ...(scopeIds ? { AND: [{ actorId: { in: scopeIds } }] } : {}),
    }

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { at: 'desc' },
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      db.auditLog.count({ where }),
    ])

    const items = rows.map((r) => {
      let beforeData: unknown = null
      let afterData: unknown = null
      try {
        beforeData = r.beforeData ? JSON.parse(r.beforeData) : null
      } catch {
        beforeData = r.beforeData
      }
      try {
        afterData = r.afterData ? JSON.parse(r.afterData) : null
      } catch {
        afterData = r.afterData
      }
      return {
        id: r.id,
        actorId: r.actorId,
        actor: r.actor,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        beforeData,
        afterData,
        ip: r.ip,
        userAgent: r.userAgent,
        at: r.at,
      }
    })

    return NextResponse.json({ items, total, page, pageSize })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
