import { dailyHistoryTotals, reportHistory } from './mock-history'
import { companiesFor, deskClock, searchPreview, summaryFor } from './mock-summary'
import { roleNames, groupRoles } from './mock-catalog'
import { can } from '@/lib/rbac'
import * as mock from './mock-data'
import * as mockPic from '@/components/preview/mock-pic'
import * as mockKadiv from '@/components/preview/mock-kadiv'
import * as mockAdmin from '@/components/preview/mock-admin'
import * as mockOversight from '@/components/preview/mock-oversight'
import * as mockGroup from '@/components/preview/mock-group' // [F2-GRUP]
import * as mockSistem from '@/components/preview/mock-sistem' // [F3-B]
import * as mockLaporan from '@/components/preview/mock-laporan' // [F3-A]
import * as mockProyek from '@/components/preview/mock-proyek' // [F3-A]

// Laporan, task, bukti dan unlock berbagi state; handler spesifik mengembalikan
// null bila endpoint milik modul lain. Dipakai interceptor dan tes regresi.
const AREA_MOCKS = [mockLaporan, mockGroup, mockPic, mockKadiv, mockAdmin, mockOversight, mockSistem, mockProyek]

export const ROLES = Object.fromEntries(Object.entries(roleNames).map(([role, name]) => [role, { name }]))
export const GROUP_ROLES = groupRoles

export function handlePreview(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  mockLaporan.refreshPreviewDay()
  if (role === 'AUDITOR' && (init?.method ?? 'GET') !== 'GET') return json({ error: 'Peran Anda hanya dapat membaca.' }, 403)
  if (path === '/api/search') return json(searchPreview(url, role))
  if (path === '/api/companies' && (!init?.method || init.method === 'GET')) return json(companiesFor(role))
  for (const m of AREA_MOCKS) {
    const r = m.handle(path, url, init, role)
    if (r) return r
  }
  if (path === '/api/my-dashboard') {
    if (role === 'PIC_PROYEK') {
      const data = summaryFor(role)
      return json({ ...mock.pic, ...deskClock(), summary: { projects: data.projects.length, submitted: data.daily.submitted, outstanding: data.daily.expected - data.daily.submitted, blocked: data.counts.risk, onTimePct: data.daily.onTime30Pct }, projects: data.projects.map((p) => {
        const report = mock.deskPic.projects.find((d) => d.id === p.id)?.report
        return { ...mock.pic.projects.find((d) => d.id === p.id), ...p, latestProgress: p.progress, derivedStatus: p.status, progressPct: report?.progressPct ?? null, submitted: Boolean(report?.submittedAt), forwarded: Boolean(report?.forwardedAt), history: reportHistory(p.id), latest: mock.pic.projects.find((d) => d.id === p.id)?.latest ?? null }
      }) })
    }
    if (role === 'KEPALA_DIVISI') {
      const src = mock.weeklyInput
      const items = src.divisions.flatMap((d) => d.report.items)
      const byStatus = Object.fromEntries(['SELESAI', 'ON_PROGRESS', 'TERKENDALA', 'BELUM_MULAI'].map((s) => [s, items.filter((i) => i.status === s).length]))
      return json({ kind: 'KADIV', week: src.week, handoverHoursLeft: Math.max(0, Math.round((Date.parse(src.week.handoverBy) - Date.now()) / 3600000)), handoverPassed: Date.now() >= Date.parse(src.week.handoverBy), summary: { divisions: src.divisions.length, items: items.length, done: byStatus.SELESAI, blocked: byStatus.TERKENDALA, missingEvidence: items.filter((i) => !i.evidenceCount).length, needsEscalation: byStatus.TERKENDALA }, byStatus, history: [], items, divisions: src.divisions.map((d) => ({ ...d, statusHeader: d.report.statusHeader, itemCount: d.report.items.length, submitted: Boolean(d.report.submittedAt), approved: Boolean(d.report.approvedAt), forwarded: Boolean(d.report.forwardedAt) })) })
    }
    if (role === 'ADMIN_PT') {
      const s = summaryFor(role)
      const ps = mock.deskAdmin.projects
      return json({ kind: 'ADMIN', entity: mock.deskAdmin.entity, ...deskClock(), summary: { projects: ps.length, divisions: s.divisions.length, dailyReceived: s.daily.submitted, dailyAwaitingForward: ps.filter((p) => p.report?.submittedAt && !p.report.forwardedAt).length, dailyMissing: ps.filter((p) => !p.report?.submittedAt).length, weeklyApproved: s.weekly.approved, weeklyAwaitingForward: mock.deskAdmin.divisions.filter((d) => d.report?.approvedAt && !d.report.forwardedAt).length, weeklyDraft: s.weekly.expected - s.weekly.submitted, lateThisMonth: 0, openEscalations: mock.deskAdmin.escalations.length, complianceScore: s.byEntity[0]?.complianceScore ?? 0, onTimeDailyPct: s.daily.onTime30Pct }, missing: ps.filter((p) => !p.report?.submittedAt).map((p) => ({ id: p.id, name: p.name, pic: p.picName })), divisionsWeekly: mock.deskAdmin.divisions.map((d) => ({ ...d.report, id: d.id, name: d.name, head: d.head?.name ?? null })), days: dailyHistoryTotals('ADMIN_PT') })
    }
    return json({ kind: 'OVERSIGHT' })
  }
  if (path === '/api/notifications') return json(init?.method === 'PATCH' ? { ok: true } : mock.notifications)
  if (path === '/api/entity-activity') return json(mock.entityActivity)
  if (path === '/api/companies' || path === '/api/companies/users') {
    return json(!init?.method || init.method === 'GET' ? companiesFor(role) : { ok: true, entity: { id: 'e1' } })
  }
  // [F2-URUNGKAN] tiket contoh agar toast "Urungkan" bisa dicoba di pratinjau.
  if (path === '/api/projects/approve') return json({ ok: true, undoToken: 'pratinjau' })
  if (path === '/api/undo') return json({ ok: true, message: 'Persetujuan proyek diurungkan.' })
  if (path === '/api/work-desk') return workDesk(role, init)
  return null
}

/** Meja kerja contoh; pengingat & centang task mengubah data contoh agar muat ulang tetap konsisten. */
function workDesk(role: string, init?: RequestInit) {
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  if (init?.method === 'POST') {
    if (!can(role, 'notify:remind')) return json({ error: 'Peran Anda tidak mengirim pengingat.' }, 403)
    const b = JSON.parse(String(init.body ?? '{}')) as { action?: string; projectId?: string }
    const at = new Date().toISOString()
    const targets = mock.deskAdmin.projects.filter((p) => p.pic && !p.report?.submittedAt && !p.remindedAt && (b.action === 'remind-all-pics' || p.id === b.projectId))
    targets.forEach((p) => (p.remindedAt = at))
    if (b.action === 'remind-all-pics') return json({ ok: true, sent: targets.map((p) => ({ projectId: p.id, picName: p.picName, remindedAt: at })), skipped: 0 })
    const p = targets[0]
    return p ? json({ ok: true, projectId: p.id, picName: p.picName, remindedAt: at }) : json({ error: 'Sudah diingatkan hari ini' }, 409)
  }
  if (role === 'PIC_PROYEK') return json({ ...mock.deskPic, ...deskClock(), projects: mock.deskPic.projects.map((p) => ({ ...p, history: reportHistory(p.id) })) })
  if (role === 'KEPALA_DIVISI') return json(mock.deskKadiv)
  return json({ ...mock.deskAdmin, ...deskClock(), history: dailyHistoryTotals(role) })
}

