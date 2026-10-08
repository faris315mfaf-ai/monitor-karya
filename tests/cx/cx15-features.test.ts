import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as math from '@/lib/kpi-math'
import { asUser, db, resetWorld, wib } from '../api/pic-world'
const h = vi.hoisted(() => ({ role: 'AUDITOR', kadiv: null as any, slots: [] as any[], cursor: 0, selection: null as any, sheets: [] as any[], projectRows: [] as any[], list: null as any, hero: null as any, cards: [] as any[], tiles: [] as any[], header: null as any, evidence: [] as any[], resourceCalls: [] as (string | null)[] }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = h.cursor++
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial
    return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }]
  },
  useRef: (initial: any) => { const i = h.cursor++; return h.slots[i] ?? (h.slots[i] = { current: initial }) },
}))
vi.mock('@/lib/db', async () => {
  const { db } = await import('../api/pic-world')
  return { db: new Proxy({}, { get: (_t, key) => key === '$queryRaw' ? vi.fn().mockResolvedValue([]) : db[key as string] }) }
})
vi.mock('@/lib/auth', async () => ({ ...(await import('../api/pic-world')).auth, scopeUserIds: vi.fn().mockResolvedValue([]) }))
vi.mock('@/components/shell', () => ({ NotificationButton: () => null }))
vi.mock('@/components/division-weekly-desk', () => ({ DivisionWeeklyDesk: () => null }))
vi.mock('@/components/app-provider', () => ({ useApp: () => ({ user: { role: h.role, name: 'Pengguna' }, setActiveTab: vi.fn() }) }))
vi.mock('@/components/views/dash-common', () => ({ DashHeader: (p: any) => { h.header = p; return p.tools ?? null }, ProjectSheet: () => null, seriesTone: () => 'data-1', timelineFrame: () => ({ at: () => 0, span: 1, ticks: [] }) }))
vi.mock('@/components/views/entity-activity-board', () => ({ EntityActivityBoard: () => null }))
vi.mock('@/components/group/group-panel', () => ({ GroupRolePanel: () => null }))
vi.mock('@/components/views/companies-view', () => ({ SuperadminStrip: () => null }))
vi.mock('@/components/oversight/deadline-decisions', () => ({ DeadlineProposalItems: () => null, RejectDeadlineSheet: () => null, useDeadlineDecisions: () => ({ decided: {} }) }))
vi.mock('@/components/oversight/approval-requests', () => ({ ApprovalRequestItems: () => null, RejectApprovalSheet: () => null, useApprovalDecisions: () => ({ decided: {} }) }))
vi.mock('@/components/oversight/weekly-reports', () => ({ WeeklyReportSheet: () => null, useWeeklyActions: () => ({}) }))
vi.mock('@/components/search/command-palette', () => ({ SearchButton: () => createElement('button', { 'data-search': 'existing-palette' }, 'Cari'), useSearchSelection: (handle: any) => { h.selection = handle } }))
vi.mock('@/components/kadiv', () => ({
  ATTENDANCE_LABELS: {}, DivisionProjectsCard: () => null, OutputHeatmapCard: () => null,
  ReviewOutputCard: () => null, TeamActivityCard: () => null, TeamDailyCard: () => null,
  WeeklySummaryCard: () => null, WorkloadCard: () => null,
  useKadivData: () => ({ team: h.kadiv }), useTeamSheets: () => ({ element: null }),
}))
vi.mock('@/components/admin/access-requests-card', () => ({ AccessRequestsCard: () => null }))
vi.mock('@/components/admin/activity-log', () => ({ ActivityLogCard: () => null }))
vi.mock('@/components/admin/reminder-rules-card', () => ({ ReminderRulesCard: () => null }))
vi.mock('@/components/admin/master-data', () => ({ MasterDataCard: () => null, UsersByRoleCard: () => null, useAdminOverview: () => ({ data: null }) }))
vi.mock('@/components/admin/compliance', () => ({ ComplianceCard: () => null, ComplianceHeatmapCard: () => null, useCompliance: () => ({ data: null }), sendReminder: vi.fn() }))
vi.mock('@/hooks/use-resource', () => ({ useResource: (url: string | null) => { h.resourceCalls.push(url); return { data: url?.startsWith('/api/evidence') ? { items: h.evidence } : h.list, loading: false, error: null } } }))
vi.mock('@/hooks/use-fetch', () => ({ useFetch: () => ({ data: null, loading: false, error: null, reload: vi.fn() }) }))
vi.mock('@/components/mk', () => {
  const container = ({ children }: { children?: ReactNode }) => createElement('div', null, children)
  const nothing = () => null
  return {
    Card: (p: any) => { h.cards.push(p); return container(p) },
    StatTile: (p: any) => { h.tiles.push(p); return createElement('span', null, p.label, p.value, p.delta) },
    ApprovalItem: (p: any) => createElement('span', null, p.title, p.amount),
    Button: container, Chip: container, EmptyNote: container, Hero: (p: any) => { h.hero = p; return createElement('div', null, p.children, p.kpis) }, SegmentedControl: nothing,
    ActivityItem: nothing, ActivityRings: nothing, AttentionItem: nothing, BarChart: nothing, DivisionBar: nothing, DonutChart: nothing, ProjectRow: (p: any) => { h.projectRows.push(p); return null }, Timeline: nothing, StatusBadge: nothing, ProgressRing: nothing, FlowDiagram: nothing, PageHeader: nothing, SearchField: nothing, Sheet: (p: any) => { h.sheets.push(p); return null }, Skeleton: nothing, ErrorNote: nothing, useIsPhone: () => false,
  }
})
import { ManagementDashboard } from '@/components/oversight/management-dashboard'
import { AdminSummary } from '@/components/admin/admin-summary'
import { KadivDashboard } from '@/components/views/role-dashboards'
import { ProjectsView } from '@/components/views/projects-view'
import { DivisionsView } from '@/components/views/divisions-view'
import * as ringkasan from '@/app/api/ringkasan/route'
import { ReviewOutputCard } from '@/components/kadiv/review-card'

const overview = (extra: Record<string, unknown> = {}) => ({ kind: 'RINGKASAN', week: 41, projects: [], counts: { on: 0, risk: 0, late: 0, done: 0, neutral: 0 }, scope: { entities: 1, divisions: 1 }, daily: { expected: 0, submitted: 0, onTime30Pct: 0, total30: 0, onTime30: 0 }, weekly: { expected: 0, submitted: 0, approved: 0 }, trend: [], byEntity: [], decisions: [], escalations: [], activity: [], ...extra })
const renderManagement = (extra = {}) => renderToStaticMarkup(createElement(ManagementDashboard, { data: overview(extra), reload: vi.fn() } as any))
beforeEach(() => { h.cards = []; h.tiles = []; h.header = null; h.role = 'AUDITOR'; h.evidence = []; h.resourceCalls = []; h.list = null; h.hero = null; h.slots = []; h.cursor = 0; h.selection = null; h.sheets = []; h.projectRows = []; resetWorld() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('CX8 dan CX15 UI', () => {
  it('Keputusan terbuka dihapus 8 Okt 2026; bagian Laporan per perusahaan hadir (keputusan pemilik)', () => {
    // Kartu "Keputusan terbuka"/"Persetujuan menunggu" dihapus pemilik dari Ringkasan
    // Manajemen; penggantinya bagian drill-down per perusahaan (CompanyReports).
    for (const role of ['AUDITOR', 'MANAJEMEN'] as const) {
      h.role = role; h.cards = []
      const html = renderManagement()
      expect(h.cards.find((p) => p.title === 'Keputusan terbuka' || p.title === 'Persetujuan menunggu')).toBeUndefined()
      expect(html).toContain('Laporan per perusahaan')
    }
  })
  it('Admin PT memasang pemicu palet yang sudah ada di header', () => {
    h.role = 'ADMIN_PT'
    const data = { entity: { name: 'PT A' }, summary: { projects: 0, dailyReceived: 0, dailyMissing: 0, dailyAwaitingForward: 0, weeklyAwaitingForward: 0, divisions: 0 }, countdown: { passed: false }, divisionsWeekly: [], days: [], entities: [], trend: [] }
    const html = renderToStaticMarkup(createElement(AdminSummary, { data } as any))
    expect(h.header.tools).toBeTruthy()
    expect(html).toContain('data-search="existing-palette"')
  })
  it('review menampilkan jenis dan nama bukti yang sesungguhnya per output', () => {
    h.evidence = [{ fileName: 'Laporan uji.pdf', mime: 'application/pdf' }, { fileName: 'Desain final', mime: 'text/uri-list' }]
    const o = { id: 'output-a', title: 'Hasil pengujian', project: { id: 'p', name: 'Aplikasi' }, owner: { name: 'Rina', initials: 'R' }, submittedAt: '2026-10-06T08:00:00Z', status: 'MENUNGGU_REVIEW', evidenceCount: 2 }
    const html = renderToStaticMarkup(createElement(ReviewOutputCard, { ctl: { review: { queue: [o], decided: [] }, loading: false, reload: vi.fn() } } as any))
    expect(html).toContain('Dokumen PDF: Laporan uji.pdf')
    expect(html).toContain('Tautan: Desain final')
    expect(h.resourceCalls).toContain('/api/evidence?targetType=OUTPUT&targetId=output-a')
  })
  it('delta progres riwayat nyata muncul, tanpa riwayat tidak mengarang angka', () => {
    renderManagement({ progressComparison: { previous: 40, current: 55, delta: 15, projects: 2, asOf: '2026-10-04T17:00:00Z' } })
    expect(h.tiles.find((p) => p.label === 'Rata-rata progres').delta).toContain('+15 poin')
    h.tiles = []; renderManagement()
    expect(h.tiles.find((p) => p.label === 'Rata-rata progres').delta).not.toMatch(/[+-]\d+ poin/)
    h.tiles = []; renderManagement({ progressComparison: { previous: 55, current: 40, delta: -15, projects: 2 } })
    expect(h.tiles.find((p) => p.label === 'Rata-rata progres').delta).toContain('-15 poin')
  })
})

describe('CX15 perbandingan progres memakai seluruh kohor yang sama', () => {
  const cutoff = new Date('2026-10-04T17:00:00Z')
  const current = [{ id: 'a', progress: 60, submittedAt: new Date('2026-10-06T08:00:00Z') }, { id: 'b', progress: 80, submittedAt: new Date('2026-10-06T08:00:00Z') }]
  const historic = (id: string, progressPct: number, date = '2026-10-02T08:00:00Z') => ({ projectId: id, progressPct, reportDate: new Date(date), submittedAt: new Date(date), updatedAt: new Date(date) })
  const compare = (rows: any[], ps = current) => (math as any).compareProgress(ps, rows, cutoff)
  it('memakai laporan terakhir sebelum batas WIB dan mengabaikan proyek luar cakupan', () => {
    expect(compare([historic('a', 20), historic('a', 10, '2026-10-01T08:00:00Z'), historic('b', 40), historic('luar', 100)])).toMatchObject({ previous: 30, current: 70, delta: 40, projects: 2 })
  })
  it('riwayat parsial, draf, laporan setelah cutoff, dan perubahan sesudah cutoff tidak memberi delta', () => {
    expect(compare([historic('a', 20)])).toBeNull()
    expect(compare([{ ...historic('a', 20), submittedAt: null }, historic('b', 40)])).toBeNull()
    expect(compare([historic('a', 20, '2026-10-05T08:00:00Z'), historic('b', 40)])).toBeNull()
    expect(compare([{ ...historic('a', 20), updatedAt: new Date('2026-10-06T08:00:00Z') }, historic('b', 40)])).toBeNull()
    expect(compare([historic('a', 20), historic('b', 40)], [{ ...current[0], submittedAt: null } as any, current[1]])).toBeNull()
    expect(compare([], [])).toBeNull()
  })
})


describe('CX9 hero menggunakan agregat API', () => {
  it('Proyek memakai total status seluruh saringan meski halaman kosong', () => {
    h.list = { items: [], total: 25, page: 1, pageSize: 12, summary: { running: 25, waiting: 0, resubmit: 0, late: 13, risk: 4, silent: 1 } }
    renderToStaticMarkup(createElement(ProjectsView))
    expect(h.hero.support).toBe('13 terlambat, 4 perlu perhatian, 1 belum punya laporan harian.')
  })
  it('Divisi memakai ringkasan seluruh hasil, tanpa label Di halaman ini', () => {
    h.list = { items: [], total: 25, page: 1, pageSize: 10, summary: { waiting: 13, late: 4 } }
    renderToStaticMarkup(createElement(DivisionsView))
    expect(h.hero.support).toBe('13 menunggu persetujuan, 4 terlambat.')
  })
})

describe('CX15 delta di API ringkasan', () => {
  const cutoff = new Date('2026-10-04T17:00:00Z')
  beforeEach(() => {
    asUser('dir-a'); vi.useFakeTimers(); vi.setSystemTime(wib('2026-10-06T18:00:00'))
    for (const model of ['entity', 'division', 'weeklyDivisionReport', 'escalation', 'auditLog', 'output', 'deadlineProposal', 'projectReview', 'approvalRequest', 'user']) db[model].findMany.mockResolvedValue([])
    db.division.count.mockResolvedValue(0); db.user.count.mockResolvedValue(0); db.attendance.groupBy.mockResolvedValue([])
    const latest = { status: 'ON_PROGRESS', progressPct: 60, reportDate: wib('2026-10-06T00:00:00'), submittedAt: wib('2026-10-06T16:00:00'), obstacle: null, needsEscalation: false }
    db.project.findMany.mockImplementation(async ({ where }) => where.lifecycle === 'AKTIF' ? [{ id: 'p1', name: 'P1', lifecycle: 'AKTIF', targetEndDate: null, picName: 'Rina', picUserId: null, entity: { id: 'pt-a', name: 'PT A', code: 'A' }, dailyReports: [latest] }] : [])
    db.dailyProjectReport.findMany.mockImplementation(async ({ where }) => where.projectId ? [{ projectId: 'p1', progressPct: 35, reportDate: wib('2026-10-02T00:00:00'), submittedAt: wib('2026-10-02T16:00:00'), updatedAt: wib('2026-10-02T16:00:00') }] : [])
  })
  it('mengembalikan delta 25 dari data historis yang tersaring cakupan dan batas waktu', async () => {
    const res = await ringkasan.GET()
    expect(res.status).toBe(200)
    expect((await res.json()).progressComparison).toMatchObject({ previous: 35, current: 60, delta: 25, projects: 1, asOf: cutoff.toISOString() })
    const q = db.dailyProjectReport.findMany.mock.calls.map(([q]) => q).find((q) => q.where.projectId)
    expect(q.where).toEqual({ entityId: { in: ['pt-a'] }, projectId: { in: ['p1'] }, reportDate: { lt: cutoff }, submittedAt: { not: null, lt: cutoff }, updatedAt: { lt: cutoff } })
  })
  it('tidak membuat delta bila laporan historis tidak tersedia', async () => {
    db.dailyProjectReport.findMany.mockResolvedValue([])
    const res = await ringkasan.GET()
    expect(res.status).toBe(200)
    expect((await res.json()).progressComparison).toBeNull()
  })
})


describe('CX15 integrasi palet → Sheet proyek', () => {
  const item = (id: string) => ({ id, name: `Proyek ${id}`, code: id, lifecycle: 'AKTIF', phase: 'INISIASI', latestReport: null, targetEndDate: null, startDate: null, approvalChain: [], approvals: [], relatedEntities: [], entity: { id: 'pt-a', name: 'PT A' }, permissions: { approve: false, resubmit: false, manage: false, setLifecycle: false } })
  const render = () => { h.cursor = 0; h.sheets = []; return renderToStaticMarkup(createElement(ProjectsView)) }
  const flush = async () => { await new Promise((r) => setTimeout(r, 0)) }
  beforeEach(() => { h.role = 'PIC_PROYEK'; h.list = { items: [], total: 25, page: 1, pageSize: 12 }; vi.stubGlobal('fetch', vi.fn()) })
  it('hit di luar halaman/filter dimuat menurut ID lalu membuka Sheet yang benar', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [item('absensi')] })))
    render()
    expect(h.selection).toBeTypeOf('function')
    expect(h.selection({ kind: 'project', id: 'absensi', title: 'Absensi', tab: 'projects' })).toBe(true)
    await flush(); render()
    expect(fetch).toHaveBeenCalledWith('/api/projects?id=absensi&lifecycle=ALL&pageSize=1', expect.anything())
    expect(h.sheets.some((p) => p.open && p.title === 'Proyek absensi')).toBe(true)
  })
  it('tidak membuka item lain saat hasil kosong/salah ID atau respons ditolak', async () => {
    for (const response of [new Response(JSON.stringify({ items: [item('lain')] })), new Response(JSON.stringify({ error: 'Tidak diizinkan' }), { status: 403 })]) {
      h.slots = []; vi.mocked(fetch).mockResolvedValue(response); render()
      expect(h.selection).toBeTypeOf('function')
      h.selection({ kind: 'project', id: 'absensi' }); await flush(); render()
      expect(h.sheets.some((p) => p.open)).toBe(false)
    }
  })
  it('respons lambat pilihan lama tidak menimpa pilihan terbaru', async () => {
    let finish!: (r: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((r) => { finish = r }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [item('baru')] })))
    render(); expect(h.selection).toBeTypeOf('function')
    h.selection({ kind: 'project', id: 'lama' }); h.selection({ kind: 'project', id: 'baru' })
    await flush(); finish(new Response(JSON.stringify({ items: [item('lama')] }))); await flush(); render()
    expect(h.sheets.find((p) => p.open)?.title).toBe('Proyek baru')
  })
})


it('CX15 integrasi: PIC null tidak menjatuhkan Ringkasan Manajemen', () => {
  h.role = 'MANAJEMEN'
  // Tabel "Proyek prioritas" dihapus 8 Okt; proyek kini tampil lewat kartu
  // perusahaan. PIC null tetap tidak boleh menjatuhkan render, dan kartu
  // perusahaan PT A tetap terbentuk (baris proyeknya ada di dalam Sheet).
  let html = ''
  expect(() => {
    html = renderManagement({ projects: [{ id: 'p-null', name: 'Audit Pajak 2026', pic: null, picName: null, progress: 20, status: 'on', entityCode: 'A', entityName: 'PT A', entityId: 'pt-a', targetEndDate: null }] })
  }).not.toThrow()
  expect(html).toContain('Laporan per perusahaan')
  expect(html).toContain('PT A')
})


it('CX9 KPI menandai riwayat tidak lengkap tanpa memajang persentase', () => {
  h.role = 'KEPALA_DIVISI'
  h.kadiv = { division: { id: 'd' }, members: [], projects: [], trend: [], onTime30: { pct: null, ok: 4, total: 4, target: 85, days: 20, historyComplete: false, unknownProjects: 1 }, summary: { members: 1, present: 1, reporters: 1, reported: 1, outputsTarget: 1, outputsAccepted: 0, avgLoad: 50, overloaded: 0 } }
  const data = { summary: { divisions: 1, items: 0, done: 0, blocked: 0, missingEvidence: 0, needsEscalation: 0 }, divisions: [{ id: 'd', name: 'Teknologi' }], items: [], byStatus: {}, history: [], week: { isoYear: 2026, isoWeek: 41, handoverBy: '2026-10-08T10:00:00Z', lockAt: '2026-10-09T10:00:00Z' } }
  renderToStaticMarkup(createElement(KadivDashboard, { data } as any))
  expect(h.tiles.find((p) => p.label === 'Tepat waktu 30 hari')).toMatchObject({ value: '-', delta: 'Riwayat belum lengkap · 1 proyek', tone: 'neutral' })
})
