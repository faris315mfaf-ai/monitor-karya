import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser, scopeEntityIds } from '@/lib/auth'
import { ageDays } from '@/lib/wib'
import { Prisma } from '@prisma/client'
import { serverError } from '@/lib/api-error' // [F3-D]
import { performerDivisionScope, performerProjectScope } from '@/lib/pic-access'

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

    // [T10-FIX2, T-1] Peran pelaksana hanya melihat eskalasi dari cakupannya:
    // laporan harian/task proyeknya (PIC) atau proyek divisinya (kepala divisi),
    // plus butir mingguan divisinya — bukan seluruh PT. Eskalasi hanya menyimpan
    // sumber (sourceType/sourceId), jadi id sumber dalam cakupan dikumpulkan
    // dulu agar saringan tetap bekerja di tingkat kueri (paginasi/total benar).
    const projectScope = await performerProjectScope(user)
    let performerWhere: Prisma.EscalationWhereInput | null = null
    if (projectScope) {
      const divisionScope = await performerDivisionScope(user)
      const [reportIds, itemIds, taskEscalationIds] = await Promise.all([
        db.dailyProjectReport.findMany({ where: { project: projectScope }, select: { id: true } }),
        db.weeklyReportItem.findMany({
          where: { weeklyReport: { division: divisionScope ?? { id: '__none__' } } },
          select: { id: true },
        }),
        db.task.findMany({ where: { project: projectScope, escalationId: { not: null } }, select: { escalationId: true } }),
      ])
      performerWhere = {
        OR: [
          { sourceType: 'DAILY_REPORT', sourceId: { in: reportIds.map((r) => r.id) } },
          { sourceType: 'WEEKLY_ITEM', sourceId: { in: itemIds.map((i) => i.id) } },
          { id: { in: taskEscalationIds.map((t) => t.escalationId).filter((x): x is string => Boolean(x)) } },
        ],
      }
    }

    const where: Prisma.EscalationWhereInput = {
      ...(status ? { status } : {}),
      ...(needed ? { needed } : {}),
      ...(entityId ? { entityId } : {}),
      ...(scopeIds || performerWhere
        ? {
            AND: [
              ...(scopeIds ? [{ entityId: { in: scopeIds } }] : []),
              ...(performerWhere ? [performerWhere] : []),
            ],
          }
        : {}),
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
    // [F3-D] Pesan umum ke klien; detail galat hanya ke log server.
    return serverError(err, 'Eskalasi belum termuat. Coba lagi.', 'escalations GET')
  }
}
