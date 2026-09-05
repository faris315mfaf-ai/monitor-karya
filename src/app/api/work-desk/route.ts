import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { startOfTodayWIB, endOfTodayWIB, countdownTo, monthKeyNow } from '@/lib/wib'

// GET /api/work-desk - the signed-in user's own "today's work desk".
// The user is taken from the session, never from a query parameter, so one
// account cannot read another account's desk.
export async function GET() {
  try {
    const user = await requireApiUser()
    if (user instanceof NextResponse) return user

    const entityId = user.scopeEntityId
    if (!entityId) {
      return NextResponse.json(
        { error: 'Peran ini tidak terikat pada satu entitas' },
        { status: 400 }
      )
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
          requestedById: user.id,
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
