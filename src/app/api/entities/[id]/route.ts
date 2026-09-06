import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refuseUnscoped, requireApiUser, isGlobalRole, scopePathPrefix } from '@/lib/auth'
import { monthKeyNow } from '@/lib/wib'

// GET /api/entities/[id] - entity detail with stats
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user
    const unscoped = refuseUnscoped(user)
    if (unscoped) return unscoped
    const { id } = await params

    const entity = await db.entity.findUnique({ where: { id } })
    if (!entity) {
      return NextResponse.json({ error: 'Entitas tidak ditemukan' }, { status: 404 })
    }

    // A scoped role may only open its own entity or one beneath it.
    if (!isGlobalRole(user.role) && user.scopeEntityId) {
      const prefix = await scopePathPrefix(user.scopeEntityId)
      if (!prefix || !entity.path.startsWith(prefix)) {
        return NextResponse.json({ error: 'Entitas ini di luar cakupan Anda' }, { status: 403 })
      }
    }

    // Walk parent chain
    const parentChain: Array<{ id: string; name: string; code: string; type: string; region: string | null }> = []
    let cursor: typeof entity | null = entity
    while (cursor?.parentId) {
      const parent = await db.entity.findUnique({
        where: { id: cursor.parentId },
        select: { id: true, name: true, code: true, type: true, region: true, parentId: true },
      })
      if (!parent) break
      parentChain.unshift(parent)
      cursor = parent
    }

    const [children, divisions, projects, adminAppointments, currentKpi, recentDaily, recentWeekly] =
      await Promise.all([
        db.entity.findMany({
          where: { parentId: id },
          select: { id: true, name: true, code: true, type: true, region: true, isActive: true },
          orderBy: { code: 'asc' },
        }),
        entity.type === 'PT'
          ? db.division.findMany({
              where: { entityId: id },
              include: { divisionType: { select: { id: true, code: true, name: true } } },
              orderBy: { name: 'asc' },
            })
          : Promise.resolve([]),
        entity.type === 'PT'
          ? db.project.findMany({
              where: { entityId: id },
              select: { id: true, name: true, code: true, phase: true, lifecycle: true, picName: true, startDate: true, targetEndDate: true },
              orderBy: { code: 'asc' },
            })
          : Promise.resolve([]),
        entity.type === 'PT'
          ? db.adminAppointment.findMany({
              where: { entityId: id },
              orderBy: { validFrom: 'desc' },
            })
          : Promise.resolve([]),
        db.kpiSnapshot.findUnique({
          where: {
            entityId_periodType_periodKey: {
              entityId: id,
              periodType: 'BULANAN',
              periodKey: monthKeyNow(),
            },
          },
        }),
        entity.type === 'PT'
          ? db.dailyProjectReport.findMany({
              where: { entityId: id },
              orderBy: { reportDate: 'desc' },
              take: 7,
              include: {
                project: { select: { id: true, name: true, code: true } },
              },
            })
          : Promise.resolve([]),
        entity.type === 'PT'
          ? db.weeklyDivisionReport.findMany({
              where: { entityId: id },
              orderBy: [{ isoYear: 'desc' }, { isoWeek: 'desc' }],
              take: 4,
              include: {
                division: { select: { id: true, name: true } },
                approvedBy: { select: { id: true, name: true, email: true } },
              },
            })
          : Promise.resolve([]),
      ])

    return NextResponse.json({
      entity: {
        id: entity.id,
        name: entity.name,
        code: entity.code,
        type: entity.type,
        path: entity.path,
        region: entity.region,
        parentId: entity.parentId,
        isActive: entity.isActive,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      },
      parentChain,
      children,
      ...(entity.type === 'PT'
        ? {
            divisions,
            projects,
            adminAppointments,
            currentKpi,
            recentDailyReports: recentDaily,
            recentWeeklyReports: recentWeekly,
          }
        : {}),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
