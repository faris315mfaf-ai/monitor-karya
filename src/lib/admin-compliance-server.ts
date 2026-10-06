import 'server-only'

import { db } from '@/lib/db'
import { ROLE_LABELS } from '@/lib/constants'
import { isDailyLocked, isoWeekOf, startOfWibDay, weeklyDeadlines } from '@/lib/lock'
import { lastWorkingDays } from '@/lib/kadiv'
import { DAILY_PIC_TEMPLATE } from '@/lib/reminders-pic'
import {
  pctOf, projectDivisionId, tallyDay, weeklyState,
  type ComplianceData, type DivisionCompliance, type DivisionRef,
} from '@/lib/admin-compliance'

/**
 * Pemuat kepatuhan Admin PT [F2-ADMIN]. Aturan hitung ada di
 * src/lib/admin-compliance.ts; berkas ini hanya membaca basis data.
 *
 * `entityIds` = cakupan PT pembaca (null = seluruh grup).
 */

const DAY = 86400000
const ABSENT = ['CUTI', 'SAKIT', 'IZIN']

type ScopeProject = {
  id: string
  name: string
  entityId: string
  divisionId: string | null
  picUserId: string | null
  startDate: Date | null
  picUser: { id: string; name: string; role: string; isActive: boolean; divisionId: string | null } | null
}

/** Proyek aktif dalam cakupan beserta PIC-nya. */
export async function scopeProjects(entityIds: string[] | null): Promise<ScopeProject[]> {
  return db.project.findMany({
    where: { lifecycle: 'AKTIF', picUserId: { not: null }, ...(entityIds ? { entityId: { in: entityIds } } : {}) },
    select: {
      id: true,
      name: true,
      entityId: true,
      divisionId: true,
      picUserId: true,
      startDate: true,
      picUser: { select: { id: true, name: true, role: true, isActive: true, divisionId: true } },
    },
  })
}

export async function scopeDivisions(entityIds: string[] | null) {
  return db.division.findMany({
    where: { isActive: true, ...(entityIds ? { entityId: { in: entityIds } } : {}) },
    select: {
      id: true,
      name: true,
      entityId: true,
      headUserId: true,
      headUser: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
      members: { where: { isActive: true }, select: { id: true } },
    },
    orderBy: { name: 'asc' },
  })
}

/** Proyek per divisi (id divisi → id proyek). */
export function groupProjectsByDivision(projects: ScopeProject[], divisions: DivisionRef[]) {
  const out = new Map<string, string[]>()
  for (const p of projects) {
    const d = projectDivisionId(
      { id: p.id, entityId: p.entityId, divisionId: p.divisionId, picUserId: p.picUserId, picDivisionId: p.picUser?.divisionId ?? null },
      divisions
    )
    if (!d) continue
    const list = out.get(d) ?? []
    list.push(p.id)
    out.set(d, list)
  }
  return out
}

export async function loadCompliance(entityIds: string[] | null, opts: { canRemind: boolean; now?: Date }): Promise<ComplianceData> {
  const now = opts.now ?? new Date()
  const today = startOfWibDay(now)
  const days = lastWorkingDays(today, 10)
  const firstDay = days[0] ?? today
  const { isoYear, isoWeek } = isoWeekOf(today)
  const wk = weeklyDeadlines(today)

  const [projects, divisions] = await Promise.all([scopeProjects(entityIds), scopeDivisions(entityIds)])
  const live = projects.filter((p) => p.picUser?.isActive)
  const projectIds = live.map((p) => p.id)
  const picIds = Array.from(new Set(live.map((p) => p.picUserId!)))

  const [reports, lastByProject, leave, reminders, weekly] = await Promise.all([
    projectIds.length
      ? db.dailyProjectReport.findMany({
          where: { projectId: { in: projectIds }, reportDate: { gte: firstDay, lte: today }, submittedAt: { not: null } },
          select: { projectId: true, reportDate: true },
        })
      : Promise.resolve([] as { projectId: string; reportDate: Date }[]),
    projectIds.length
      ? db.dailyProjectReport.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds }, submittedAt: { not: null } }, _max: { submittedAt: true } })
      : Promise.resolve([] as { projectId: string; _max: { submittedAt: Date | null } }[]),
    picIds.length
      ? db.attendance.findMany({ where: { userId: { in: picIds }, date: { gte: firstDay, lte: today }, status: { in: ABSENT } }, select: { userId: true, date: true } })
      : Promise.resolve([] as { userId: string; date: Date }[]),
    picIds.length
      ? db.notificationLog.findMany({
          where: { template: DAILY_PIC_TEMPLATE, userId: { in: picIds }, createdAt: { gte: today } },
          select: { userId: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([] as { userId: string | null; createdAt: Date }[]),
    divisions.length
      ? db.weeklyDivisionReport.findMany({
          where: { divisionId: { in: divisions.map((d) => d.id) }, isoYear, isoWeek },
          select: { divisionId: true, statusHeader: true, submittedAt: true, approvedAt: true, forwardedAt: true },
        })
      : Promise.resolve([] as { divisionId: string; statusHeader: string; submittedAt: Date | null; approvedAt: Date | null; forwardedAt: Date | null }[]),
  ])

  const key = (d: Date) => d.getTime()
  const submittedOn = new Map<number, Set<string>>()
  for (const r of reports) {
    const s = submittedOn.get(key(r.reportDate)) ?? new Set<string>()
    s.add(r.projectId)
    submittedOn.set(key(r.reportDate), s)
  }
  const leaveOn = new Map<number, Set<string>>()
  for (const l of leave) {
    const s = leaveOn.get(key(l.date)) ?? new Set<string>()
    s.add(l.userId)
    leaveOn.set(key(l.date), s)
  }
  const remindedAt = new Map<string, Date>()
  for (const n of reminders) if (n.userId && !remindedAt.has(n.userId)) remindedAt.set(n.userId, n.createdAt)
  const lastOf = new Map<string, Date | null>(lastByProject.map((r) => [r.projectId, r._max.submittedAt]))

  /** Proyek tiap orang yang sudah mulai pada hari `d`. */
  const projectsOn = (d: Date) => {
    const end = d.getTime() + DAY
    const m = new Map<string, string[]>()
    for (const p of live) {
      if (p.startDate && p.startDate.getTime() >= end) continue
      const list = m.get(p.picUserId!) ?? []
      list.push(p.id)
      m.set(p.picUserId!, list)
    }
    return m
  }
  const dayInputs = days.map((d) => ({
    projectsOf: projectsOn(d),
    submitted: submittedOn.get(key(d)) ?? new Set<string>(),
    onLeave: leaveOn.get(key(d)) ?? new Set<string>(),
  }))
  const todayInput = dayInputs[dayInputs.length - 1] && key(days[days.length - 1]) === key(today)
    ? dayInputs[dayInputs.length - 1]
    : { projectsOf: projectsOn(today), submitted: submittedOn.get(key(today)) ?? new Set<string>(), onLeave: leaveOn.get(key(today)) ?? new Set<string>() }

  const divRefs = divisions.map((d) => ({ id: d.id, entityId: d.entityId, headUserId: d.headUserId }))
  const byDivision = groupProjectsByDivision(live, divRefs)
  const projectById = new Map(live.map((p) => [p.id, p]))
  const personById = new Map(live.map((p) => [p.picUserId!, p.picUser!]))
  const weeklyBy = new Map(weekly.map((w) => [w.divisionId, w]))

  const assigned = new Set<string>()
  const out: DivisionCompliance[] = divisions.map((d) => {
    const people = new Set<string>()
    for (const pid of byDivision.get(d.id) ?? []) people.add(projectById.get(pid)!.picUserId!)
    for (const m of d.members) if (personById.has(m.id)) people.add(m.id)
    for (const id of people) assigned.add(id)

    const t = tallyDay(people, todayInput)
    const missing = t.missing.map((id) => {
      const person = personById.get(id)!
      const mine = live.filter((p) => p.picUserId === id)
      const last = mine.map((p) => lastOf.get(p.id) ?? null).filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0]
      return {
        id,
        name: person.name,
        role: ROLE_LABELS[person.role] ?? person.role,
        lastReportAt: last?.toISOString() ?? null,
        remindedAt: remindedAt.get(id)?.toISOString() ?? null,
        projects: mine.filter((p) => !todayInput.submitted.has(p.id)).map((p) => p.name),
      }
    })
    const w = weeklyBy.get(d.id)
    return {
      id: d.id,
      name: d.name,
      entityId: d.entityId,
      head: d.headUser && d.headUser.isActive ? { id: d.headUser.id, name: d.headUser.name, email: d.headUser.email || null, phone: d.headUser.phone || null } : null,
      expected: t.expected,
      reported: t.reported,
      onLeave: t.onLeave,
      missing,
      history: dayInputs.map((di) => {
        const x = tallyDay(people, di)
        return x.expected > 0 ? pctOf(x.reported, x.expected) : null
      }),
      weekly: {
        state: weeklyState(w?.submittedAt, wk.handoverBy),
        statusHeader: w?.statusHeader ?? null,
        submittedAt: w?.submittedAt?.toISOString() ?? null,
        approvedAt: w?.approvedAt?.toISOString() ?? null,
        forwardedAt: w?.forwardedAt?.toISOString() ?? null,
      },
    }
  })

  const all = tallyDay(personById.keys(), todayInput)
  return {
    today: today.toISOString(),
    days: days.map((d) => d.toISOString()),
    locked: isDailyLocked(today, now),
    week: { isoYear, isoWeek, handoverBy: wk.handoverBy.toISOString(), lockAt: wk.lockAt.toISOString(), handoverPassed: now >= wk.handoverBy },
    totals: {
      expected: all.expected,
      reported: all.reported,
      onLeave: all.onLeave,
      reminded: all.missing.filter((id) => remindedAt.has(id)).length,
      unassigned: Array.from(personById.keys()).filter((id) => !assigned.has(id)).length,
    },
    divisions: out,
    canRemind: opts.canRemind,
  }
}

// ------------------------------------------------------------------
// Cakupan pembaca
// ------------------------------------------------------------------

/** Peran yang membuka kepatuhan & log PT: Admin PT dan Direktur entitas (PT-nya), peran grup (seluruh grup / ?entityId=). */
export const COMPLIANCE_ROLES = new Set(['ADMIN_PT', 'DIREKTUR_ENTITAS'])

/**
 * Daftar entitas yang boleh dibaca, mengikuti /api/admin/overview: peran
 * berlingkup selalu PT-nya (subtree); peran grup boleh mempersempit ke satu
 * PT lewat `requested`. Mengembalikan string galat bila PT tidak ditemukan.
 */
export async function resolveEntityScope(scoped: string[] | null, requested: string | null): Promise<string[] | null | 'NOT_FOUND'> {
  if (scoped !== null || !requested) return scoped
  const e = await db.entity.findUnique({ where: { id: requested }, select: { path: true } })
  if (!e) return 'NOT_FOUND'
  return (await db.entity.findMany({ where: { path: { startsWith: e.path } }, select: { id: true } })).map((x) => x.id)
}
