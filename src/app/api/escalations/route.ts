import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { ageDays } from '@/lib/wib'
import { Prisma } from '@prisma/client'

// GET /api/escalations - list escalations with filters
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.max(1, Math.min(200, parseInt(sp.get('pageSize') || '50', 10)))
    const status = sp.get('status') || undefined
    const needed = sp.get('needed') || undefined
    const entityId = sp.get('entityId') || undefined
    const overdueStr = sp.get('overdue')

    // null for roles that may read the whole group.
    const scopeIds = await scopeEntityIds(user)

    const where: Prisma.EscalationWhereInput = {
      ...(status ? { status } : {}),
      ...(needed ? { needed } : {}),
      ...(entityId ? { entityId } : {}),
      ...(scopeIds ? { AND: [{ entityId: { in: scopeIds } }] } : {}),
    }

    const [rows, total] = await Promise.all([
      db.escalation.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ raisedAt: 'desc' }],
        include: {
          entity: { select: { id: true, name: true, code: true, region: true } },
          raisedBy: { select: { id: true, name: true, email: true } },
          decidedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      db.escalation.count({ where }),
    ])

    let items = rows.map((e) => {
      const ad = ageDays(e.raisedAt)
      return {
        ...e,
        ageDays: ad,
        isOverdue: ad > e.slaDays,
      }
    })

    if (overdueStr === 'true') {
      items = items.filter((e) => e.isOverdue)
    } else if (overdueStr === 'false') {
      items = items.filter((e) => !e.isOverdue)
    }

    return NextResponse.json({ items, total, page, pageSize })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
