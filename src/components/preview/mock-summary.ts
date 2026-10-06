import { compareProgress } from '@/lib/kpi-math'
import { historyDays, reportHistory, onTime30 } from './mock-history'
/** Proyeksi agregat dari data contoh yang dipakai endpoint operasional. */
import { actor, entities, entityKpis, people, visibleDivisions, visiblePeople, groupRoles } from './mock-catalog'
import { projectSnapshots, weeklySnapshots } from './mock-proyek'
import { outputSnapshots } from './mock-pic'
import { dailyProjects, deskWeeklyReports } from './mock-laporan'
import * as mock from './mock-data'
import { dailyCountdown, dailyLockAt, isDailyLocked, isoWeekOf, startOfWibDay, weeklyDeadlines, weekPeriodOf } from '@/lib/lock'
import { canSeeTab } from '@/lib/rbac'
import { ROLE_LABELS, type NavTabId } from '@/lib/constants'
import type { ComplianceData } from '@/lib/admin-compliance'

export function summaryFor(role: string) {
  const projects = projectSnapshots(role).filter((p) => p.lifecycle === 'AKTIF')
  const outs = outputSnapshots(role)
  const week = isoWeekOf(new Date())
  const onTime = onTime30(role)
  const weekly = weeklySnapshots(role).filter((w) => w.isoWeek === week.isoWeek && w.isoYear === week.isoYear)
  const divs = visibleDivisions(role).map((d) => {
    const w = weekly.find((w) => w.divisionId === d.id)
    const items = (w?.items ?? []) as { status: string }[]
    const list = outs.filter((o) => o.divisionId === d.id)
    const done = list.filter((o) => o.status === 'DITERIMA').length
    const review = list.filter((o) => o.status === 'MENUNGGU_REVIEW').length
    const withDue = list.filter((o) => o.status === 'DITERIMA' && o.dueDate && o.reviewedAt)
    const onTime = withDue.filter((o) => o.reviewedAt! <= o.dueDate!).length
    const entity = entities.find((e) => e.id === d.entityId)!
    const submittedAt = w?.submittedAt as string | null ?? null
    return {
      ...d, typeName: d.name, entityName: entity.name, entityCode: entity.code,
      head: { id: d.headId, name: d.head, email: people.find((p) => p.id === d.headId)?.email ?? '', phone: null },
      projects: projects.filter((p) => p.divisionId === d.id).length,
      weekly: { id: w?.id ?? null, state: submittedAt ? 'sent' : 'missing', statusHeader: w?.statusHeader ?? null, submittedAt, submittedBy: d.head, readAt: null, itemsTotal: items.length, itemsDone: items.filter((i) => i.status === 'SELESAI').length, summary: submittedAt ? `${items.filter((i) => i.status === 'SELESAI').length} dari ${items.length} pekerjaan selesai.` : null, points: [], obstacles: [], comments: 0 },
      outputs: { total: list.length, done, review, active: list.length - done - review, onTime, withDue: withDue.length, trend: [0, 0, 0, 0, 0, 0, 0, done] },
      onTime: withDue.length ? { pct: Math.round(onTime / withDue.length * 100), ok: onTime, total: withDue.length, basis: 'output' as const } : null,
    }
  })
  const sum = (key: 'total' | 'done' | 'review' | 'active' | 'onTime' | 'withDue') => divs.reduce((n, d) => n + d.outputs[key], 0)
  const counts = { on: 0, risk: 0, late: 0, done: 0, neutral: 0 }
  projects.forEach((p) => counts[p.status]++)
  const scopedEntities = entities.filter((e) => groupRoles.includes(role) || e.id === 'e1')
  return {
    ...mock.ringkasan, week: week.isoWeek,
    scope: { entities: scopedEntities.length, divisions: divs.length, global: groupRoles.includes(role) },
    projects: projects.map((p) => ({ ...p, outputsDone: outs.filter((o) => o.projectId === p.id && o.status === 'DITERIMA').length, outputsTotal: outs.filter((o) => o.projectId === p.id).length })),
    counts,
    progressComparison: compareProgress(
      projects.map((p) => { const at = dailyProjects().find((d) => d.id === p.id)?.report?.submittedAt; return { id: p.id, progress: p.progress, submittedAt: at ? new Date(at) : null } }),
      projects.flatMap((p) => reportHistory(p.id).map((r) => ({ projectId: p.id, progressPct: r.progressPct ?? 0, reportDate: new Date(r.date), submittedAt: r.submittedAt ? new Date(r.submittedAt) : null, updatedAt: new Date(r.updatedAt) }))),
      weekPeriodOf(new Date()).start,
    ),
    daily: { expected: projects.length, submitted: projects.filter((p) => p.reportedToday).length, onTime30Pct: onTime.pct, onTime30: onTime.ok, total30: onTime.total },
    weekly: { expected: divs.length, submitted: weekly.filter((w) => w.submittedAt).length, approved: weekly.filter((w) => w.approvedAt).length },
    byEntity: scopedEntities.map((e) => ({ ...e, onTimePct: onTime30(role, e.id).pct, onTime: onTime30(role, e.id).ok, total: onTime30(role, e.id).total, projects: projects.filter((p) => p.entityId === e.id).length, reportedToday: projects.filter((p) => p.entityId === e.id && p.reportedToday).length, complianceScore: entityKpis[e.id].complianceScore })),
    reportWeek: { ...week, label: `M${week.isoWeek}`, handoverBy: weeklyDeadlines(new Date()).handoverBy.toISOString(), current: true },
    divisions: divs,
    outputs: { total: sum('total'), done: sum('done'), review: sum('review'), active: sum('active'), onTime: sum('onTime'), withDue: sum('withDue'), trend: { week: Array.from({ length: 8 }, (_, i) => ({ label: `M${week.isoWeek - 7 + i}`, value: i === 7 ? sum('done') : 0 })), month: [], quarter: [] } },
  }
}

export function searchPreview(url: string, role: string) {
  const q = (new URL(url, 'http://pratinjau').searchParams.get('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return { q, hits: [] }
  const has = (s: string | null) => Boolean(s?.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
  const tab = (t: NavTabId) => canSeeTab(role, t) ? t : null
  const week = /^m(?:inggu)?(?:\s*ke)?[-\s]*(\d{1,2})$/i.exec(q) ?? /^(\d{1,2})$/.exec(q)
  const divs = visibleDivisions(role)
  return { q, hits: [
    ...projectSnapshots(role).filter((p) => p.lifecycle !== 'DIARSIPKAN' && (has(p.name) || has(p.code))).slice(0, 6).map((p) => ({ kind: 'project', id: p.id, title: p.name, sub: `${p.code} · ${p.entityCode} · ${p.picName ?? ''}`, tab: tab('projects') })),
    ...divs.filter((d) => has(d.name)).slice(0, 6).map((d) => ({ kind: 'division', id: d.id, title: `Divisi ${d.name}`, sub: `${entities.find((e) => e.id === d.entityId)?.name} · ${d.head}`, tab: tab('divisions'), divisionId: d.id })),
    ...visiblePeople(role).filter((p) => p.isActive && (has(p.name) || has(p.username) || has(p.title))).slice(0, 6).map((p) => ({ kind: 'user', id: p.id, title: p.name, sub: ROLE_LABELS[p.role] ?? p.role, tab: null, email: p.email, phone: p.phone })),
    ...weeklySnapshots(role).filter((w) => divs.some((d) => d.id === w.divisionId && (week ? w.isoWeek === Number(week[1]) : has(d.name)))).slice(0, 6).map((w) => ({ kind: 'weekly', id: w.id, title: `Laporan mingguan M${w.isoWeek} · Divisi ${divs.find((d) => d.id === w.divisionId)?.name}`, sub: `${entities.find((e) => e.id === w.entityId)?.code} · ${w.isoYear}`, divisionId: w.divisionId, tab: tab('divisions') ?? tab('weekly-input') })),
  ] }
}

export function complianceFor(): ComplianceData {
  const projects = projectSnapshots('ADMIN_PT').filter((p) => p.lifecycle === 'AKTIF')
  const live = dailyProjects()
  const days = historyDays()
  const divisions = visibleDivisions('ADMIN_PT').map((d) => {
    const reporters = people.filter((u) => u.scopeEntityId === 'e1' && projects.some((p) => p.divisionId === d.id && p.picUserId === u.id))
    const missing = reporters.filter((u) => projects.some((p) => p.divisionId === d.id && p.picUserId === u.id && !p.reportedToday)).map((u) => {
      const owned = projects.filter((p) => p.picUserId === u.id)
      return { id: u.id, name: u.name, role: ROLE_LABELS[u.role], lastReportAt: null, remindedAt: mock.deskAdmin.projects.find((p) => owned.some((o) => o.id === p.id))?.remindedAt ?? null, projects: owned.map((p) => p.name) }
    })
    const w = deskWeeklyReports().find((w) => w.divisionId === d.id)?.report
    return { id: d.id, name: d.name, entityId: d.entityId, head: { id: d.headId, name: d.head, email: people.find((p) => p.id === d.headId)?.email ?? '', phone: null }, expected: reporters.length, reported: reporters.length - missing.length, onLeave: 0, missing, history: days.map((day) => { const eligible = reporters.filter((u) => projects.some((p) => p.divisionId === d.id && p.picUserId === u.id && reportHistory(p.id, [day])[0].required)); const sent = eligible.filter((u) => projects.filter((p) => p.divisionId === d.id && p.picUserId === u.id).every((p) => { const r = reportHistory(p.id, [day])[0]; return !r.required || r.submitted })); return eligible.length ? Math.round(sent.length / eligible.length * 100) : 0 }), weekly: { state: w?.submittedAt ? 'MASUK' as const : 'BELUM' as const, statusHeader: w?.statusHeader ?? null, submittedAt: w?.submittedAt ?? null, approvedAt: w?.approvedAt ?? null, forwardedAt: w?.forwardedAt ?? null } }
  })
  return { today: startOfWibDay(new Date()).toISOString(), days, locked: isDailyLocked(new Date()), week: { ...mock.weeklyInput.week, handoverPassed: Date.now() >= Date.parse(mock.weeklyInput.week.handoverBy) }, canRemind: true, divisions, totals: { expected: divisions.reduce((s, d) => s + d.expected, 0), reported: divisions.reduce((s, d) => s + d.reported, 0), onLeave: 0, reminded: new Set(divisions.flatMap((d) => d.missing.filter((m) => m.remindedAt).map((m) => m.id))).size, unassigned: projects.filter((p) => !p.picUserId && live.some((d) => d.id === p.id)).length } }
}

export function companiesFor(role: string) {
  const scoped = groupRoles.includes(role) ? entities : entities.filter((e) => e.id === 'e1')
  const projects = projectSnapshots(role)
  const rows = scoped.map((e) => {
    const divs = visibleDivisions('SUPERADMIN').filter((d) => d.entityId === e.id)
    const ps = projects.filter((p) => p.entityId === e.id)
    const users = people.filter((p) => p.scopeEntityId === e.id).map((p) => ({ ...p, lastLoginAt: null, avatarColor: null, hasPassword: true, divisionName: divs.find((d) => d.id === p.divisionId)?.name ?? null, projectId: ps.find((x) => x.picUserId === p.id)?.id ?? null, projectName: ps.find((x) => x.picUserId === p.id)?.name ?? null }))
    return { ...e, type: 'PT', parentId: 'h', parentName: 'PT. BIKE Tbk', logoData: null, address: null, phone: null, email: null, website: null, isActive: true, users, divisions: divs.map((d) => ({ ...d, headUserId: d.headId, headName: d.head })), projects: ps, counts: { users: users.length, divisions: divs.length, projects: ps.length, dailyReports: dailyProjects().filter((p) => p.entityId === e.id && p.report).length, weeklyReports: weeklySnapshots(role).filter((w) => w.entityId === e.id).length } }
  })
  const holdingUsers = groupRoles.includes(role) ? people.filter((p) => !p.scopeEntityId).map((p) => ({ ...p, lastLoginAt: null, avatarColor: null, hasPassword: true, divisionName: null, projectId: null, projectName: null })) : []
  return { companies: rows, holdingUsers, totals: { companies: rows.length, users: rows.reduce((n, r) => n + r.users.length, holdingUsers.length), divisions: rows.reduce((n, r) => n + r.divisions.length, 0), projects: projects.length }, me: actor(role).id, scope: groupRoles.includes(role) ? 'ALL' : 'ENTITY', canManageCompanies: role === 'SUPERADMIN', manageableRoles: role === 'SUPERADMIN' ? Object.keys(ROLE_LABELS) : ['ADMIN_PT', 'KEPALA_DIVISI', 'PIC_PROYEK'] }
}

export function deskClock() {
  const today = startOfWibDay(new Date()).toISOString()
  return { today, lockAt: dailyLockAt(new Date()).toISOString(), locked: isDailyLocked(new Date()), countdown: dailyCountdown() }
}
