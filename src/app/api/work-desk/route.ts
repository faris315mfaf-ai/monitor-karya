import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { startOfTodayWIB, endOfTodayWIB, countdownTo, monthKeyNow } from '@/lib/wib'

// GET /api/work-desk - admin PT's "today's work desk"
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, scopeEntityId: true, name: true, email: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const entityId = user.scopeEntityId
    if (!entityId) {
      return NextResponse.json({ error: 'User has no scopeEntityId' }, { status: 400 })
    }

    const entity = await db.entity.findUnique({
      where: { id: entityId },
      select: { id: true, name: true, code: true, region: true },
    })
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    const [projects, weeklyDrafts, pendingUnlocks, lateThisMonth] = await Promise.all([
      db.project.findMany({
        where: { entityId, lifecycle: 'AKTIF' },
        select: {
          id: true,
          name: true,
          code: true,
          phase: true,
          lifecycle: true,
          dailyReports: {
            where: { reportDate: { gte: startOfTodayWIB(), lt: endOfTodayWIB() } },
            select: {
              id: true,
              status: true,
              progressPct: true,
              reportDate: true,
              isLate: true,
            },
            take: 1,
          },
        },
        orderBy: { code: 'asc' },
      }),
      db.weeklyDivisionReport.findMany({
        where: {
          entityId,
          statusHeader: { in: ['DRAFT', 'MENUNGGU_PERSETUJUAN'] },
        },
        include: {
          division: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      db.unlockRequest.findMany({
        where: {
          requestedById: userId,
          status: { in: ['DIAJUKAN', 'DISETUJUI'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.lateIncident.count({
        where: {
          entityId,
          period: { startsWith: monthKeyNow() },
        },
      }),
    ])

    const projectsToday = projects.map((p) => {
      const todayReport = p.dailyReports[0] ?? null
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        phase: p.phase,
        lifecycle: p.lifecycle,
        todayReport,
        isUpdated: !!todayReport,
      }
    })

    const countdown = countdownTo(17)

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      entity,
      projectsToday,
      weeklyDrafts,
      pendingUnlocks,
      countdown: {
        hours: countdown.hours,
        minutes: countdown.minutes,
        total: countdown.total,
        passed: countdown.passed,
      },
      lateThisMonth,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
