import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0, effects: [] as (() => void)[],
  data: null as any, loading: false, buttons: [] as any[], inputs: [] as any[],
  dialog: null as any, agenda: null as any, reload: vi.fn(), changed: vi.fn(), confirm: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))
// Persistent hook slots exercise callback/state transitions without a DOM dependency.
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = h.cursor++
    if (!(i in h.slots)) h.slots[i] = initial
    return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }]
  },
  useRef: (initial: any) => {
    const i = h.cursor++
    return h.slots[i] ?? (h.slots[i] = { current: initial })
  },
  useEffect: () => {},
  useLayoutEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) h.effects.push(cleanup) },
}))
vi.mock('sonner', () => ({ toast: h.toast }))
vi.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: h.data, loading: h.loading, error: null, reload: h.reload }) }))
vi.mock('@/components/companies/parts', () => ({ useConfirm: () => [null, h.confirm], Field: ({ children }: any) => children }))
vi.mock('@/components/app-provider', () => ({ useApp: () => ({ setActiveTab: vi.fn() }) }))
vi.mock('@/components/evidence-panel', () => ({ EvidencePanel: () => null }))
vi.mock('@/components/progress-report-panel', () => ({ ProgressReportPanel: () => null }))
vi.mock('@/components/pic/notes', () => ({ NotesCard: () => null }))
vi.mock('@/components/admin/request-access-form', () => ({ RequestAccessCard: () => null }))
vi.mock('@/components/oversight/approval-requests', () => ({ ApprovalRequestsCard: () => null }))
vi.mock('@/components/views/dash-common', () => ({ DashHeader: () => null }))
vi.mock('@/components/work-desk/parts', () => ({
  Agenda: (props: any) => { h.agenda = props; return null },
  CountUp: () => null, DayStrip: () => null, DeadlineRing: () => null, remainLong: () => '1 jam',
}))
vi.mock('@/components/task-dialog', () => ({
  TASK_STATUS_META: { BERJALAN: { label: 'Berjalan', status: 'on' }, SELESAI: { label: 'Selesai', status: 'done' }, BELUM_MULAI: { label: 'Belum mulai', status: 'neutral' } },
  URGENCY_STATUS: {}, TaskDialog: (props: any) => { h.dialog = props; return null },
}))
vi.mock('@/components/mk', () => {
  const container = ({ children }: { children?: ReactNode }) => createElement('div', null, children)
  return {
    Button: (props: any) => { h.buttons.push(props); return container(props) },
    IconButton: (props: any) => { h.buttons.push(props); return null },
    Card: ({ children, action }: any) => createElement('div', null, action, children),
    Sheet: ({ children, footer }: any) => createElement('div', null, children, footer),
    Chip: container, EmptyNote: container, ErrorNote: container, StatusBadge: container,
    Skeleton: () => null, Icon: () => null, ProgressBar: (props: any) => createElement('span', null, `${props.label}: ${props.value}%`),
    Hero: () => null, StatTile: () => null,
    useIsPhone: () => false, FlowDiagram: () => null, statusFromDaily: () => 'on',
    cx: (...v: any[]) => v.filter(Boolean).join(' '),
  }
})

import { PicDeskView } from '@/components/work-desk/pic-desk'
import { DailyReportCard } from '@/components/views/daily-input-view'
import { TaskSection } from '@/components/task-section'
import { OutputsCard, OutputSheet } from '@/components/pic/outputs'
import { useOutputs } from '@/components/pic/api'

function task() {
  return { id: 't', projectId: 'A', title: 'Tugas A', description: null, tags: [], picName: null, startAt: null, endAt: null, durationMin: null,
    status: 'BERJALAN', progressPct: 25, urgency: 'SEDANG', obstacle: null, decisionNeeded: null, escalationId: null, escalation: null, subtasks: [], evidence: [] }
}
function output() {
  return { id: 'oa', projectId: 'A', title: 'Output A', status: 'DIKERJAKAN', dueDate: null, evidenceCount: 0, createdAt: '2026-10-06T00:00:00Z' }
}
function renderTasks() {
  h.cursor = 0; h.buttons = []; h.dialog = null
  return renderToStaticMarkup(createElement(TaskSection, { projectId: 'A', projectName: 'Proyek A', locked: false, onChanged: h.changed } as any))
}
function treeTasks() {
  h.cursor = 0
  // Get the native checkbox callback from the actual rendered JSX tree.
  const element = TaskSection({ projectId: 'A', projectName: 'Proyek A', locked: false, onChanged: h.changed } as any) as any
  const walk = (node: any): any => {
    if (!node || typeof node !== 'object') return null
    if (node.props?.role === 'checkbox') return node.props
    for (const child of [node.props?.children].flat(Infinity)) { const found = walk(child); if (found) return found }
    return null
  }
  // A wrapper may key the implementation. Invoke it with the same slot cursor.
  if (typeof element.type === 'function') { h.cursor = 0; return walk(element.type(element.props)) }
  return walk(element)
}
function renderOutputs(projectId = 'A') {
  h.cursor = 0; h.buttons = []
  return renderToStaticMarkup(createElement(OutputsCard, { projectId, res: useOutputs(projectId) }))
}

beforeEach(() => {
  vi.clearAllMocks(); h.slots = []; h.cursor = 0; h.effects = []; h.loading = false
  h.data = { locked: false, tasks: [task()] }
  h.confirm.mockResolvedValue(true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ evidence: { id: 'e' } }) }))
})

describe('PIC task refresh', () => {
  it('refreshes the parent rollup after deletion', async () => {
    renderTasks()
    await h.buttons.find((b) => b.children === 'Hapus').onClick()
    expect(h.reload).toHaveBeenCalledTimes(1)
    expect(h.changed).toHaveBeenCalledTimes(1)
  })
  it('refreshes parent after toggle and undo', async () => {
    await treeTasks().onClick()
    expect(h.changed).toHaveBeenCalledTimes(1)
    await h.toast.mock.calls[0][1].action.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h.changed).toHaveBeenCalledTimes(2)
  })
  it('keeps an evidence dialog open and resolves its task by ID after reload', () => {
    renderTasks()
    h.buttons.find((b) => b.children === 'Ubah progress').onClick()
    renderTasks()
    h.dialog.onSaved()
    expect(h.changed).toHaveBeenCalledTimes(1)
    h.data = { ...h.data, tasks: [{ ...task(), evidence: [{ id: 'new-evidence' }] }] }
    renderTasks()
    expect(h.dialog.task.evidence).toEqual([{ id: 'new-evidence' }])
  })
  it('does not refresh parent for a failed mutation', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Bekukan' }) } as Response)
    await treeTasks().onClick()
    expect(h.changed).not.toHaveBeenCalled()
  })
})

describe('PIC output project isolation', () => {
  it('does not show or expose project A actions while B is loading', () => {
    h.data = { items: [output()], total: 1, counts: {} }
    expect(renderOutputs()).toContain('Output A')
    h.loading = true
    expect(renderOutputs('B')).not.toContain('Output A')
    expect(h.buttons.some((b) => b['aria-label'] === 'Unggah bukti Output A')).toBe(false)
  })
  it('rejects a mismatched project item even when loading completed', () => {
    h.data = { items: [output()], total: 1, counts: {} }
    expect(renderOutputs('B')).not.toContain('Output A')
  })
})

function outputTree(projectId = 'A') {
  h.cursor = 0
  const wrapper = OutputsCard({ projectId, res: useOutputs(projectId) }) as any
  h.cursor = 0
  const element = wrapper.type(wrapper.props)
  const inputs: any[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'input') inputs.push(node.props)
    for (const child of [node.props?.children].flat(Infinity)) walk(child)
  }
  walk(element)
  return inputs[0]
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
describe('PIC stale output operations', () => {
  it('does not submit output A after its upload completes on another project', async () => {
    h.data = { items: [output()], total: 1, counts: {} }
    renderOutputs()
    h.buttons.find((b) => b['aria-label'] === 'Unggah bukti Output A').onClick()
    const input = outputTree()
    const pending = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(pending.promise)
    const uploading = input.onChange({ target: { files: [new File(['proof'], 'a.txt')] } })
    // Navigation unmounts the keyed project card before the upload responds.
    h.effects.forEach((cleanup) => cleanup())
    pending.resolve({ ok: true, json: async () => ({ evidence: { id: 'ea' } }) } as Response)
    await uploading
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(h.reload).not.toHaveBeenCalled()
  })
  it('keeps undo usable for the same output after its submitted state reloads', async () => {
    h.data = { items: [output()], total: 1, counts: {} }
    renderOutputs()
    h.buttons.find((b) => b['aria-label'] === 'Unggah bukti Output A').onClick()
    await outputTree().onChange({ target: { files: [new File(['proof'], 'a.txt')] } })
    expect(fetch).toHaveBeenCalledTimes(2) // evidence upload then submit
    const undo = h.toast.success.mock.calls.find(([, options]) => options?.action)?.[1].action
    expect(undo).toBeDefined()
    h.data = { ...h.data, items: [{ ...output(), status: 'MENUNGGU_REVIEW' }] }
    renderOutputs()
    undo.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as string)).toEqual({ id: 'oa', action: 'withdraw' })
  })
  it('keeps the explicit undo toast usable after the output sheet closes', async () => {
    h.data = { items: [{ id: 'ea', fileName: 'a.txt', mime: 'text/plain', size: 1, createdAt: '2026-10-06T00:00:00Z' }] }
    h.cursor = 0
    const close = vi.fn(() => h.effects.forEach((cleanup) => cleanup()))
    renderToStaticMarkup(createElement(OutputSheet, { output: output() as any, projectId: 'A', onClose: close, onChanged: h.changed }))
    await h.buttons.find((b) => b.children === 'Kirim untuk review').onClick()
    expect(close).toHaveBeenCalled()
    const undo = h.toast.success.mock.calls.find(([, options]) => options?.action)?.[1].action
    expect(undo).toBeDefined()
    undo.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h.changed).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toEqual({ id: 'oa', action: 'withdraw' })
  })
  it('hides the current project rows while their refresh is loading', () => {
    h.data = { items: [output()], total: 1, counts: {} }
    renderOutputs()
    h.loading = true
    expect(renderOutputs()).not.toContain('Output A')
    expect(h.buttons.some((b) => b['aria-label'] === 'Unggah bukti Output A')).toBe(false)
  })
  it('rejects pending file selection when its project is no longer active', async () => {
    h.data = { items: [output()], total: 1, counts: {} }
    renderOutputs()
    h.buttons.find((b) => b['aria-label'] === 'Unggah bukti Output A').onClick()
    const input = outputTree()
    h.loading = true
    renderOutputs('B')
    await input.onChange({ target: { files: [new File(['proof'], 'a.txt')] } })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not mount an evidence sheet for a mismatched output/project pair', () => {
    h.cursor = 0
    const html = renderToStaticMarkup(createElement(OutputSheet, { output: output() as any, projectId: 'B', onClose: vi.fn(), onChanged: h.changed }))
    expect(html).toBe('')
  })
  it('does not delete evidence after confirmation resolves on an unmounted sheet', async () => {
    h.data = { items: [{ id: 'ea', fileName: 'a.txt', mime: 'text/plain', size: 1, createdAt: '2026-10-06T00:00:00Z' }] }
    h.cursor = 0
    renderToStaticMarkup(createElement(OutputSheet, { output: output() as any, projectId: 'A', onClose: vi.fn(), onChanged: h.changed }))
    const pending = deferred<boolean>()
    h.confirm.mockReturnValueOnce(pending.promise)
    const removing = h.buttons.find((b) => b.label === 'Hapus a.txt').onClick()
    h.effects.forEach((cleanup) => cleanup())
    pending.resolve(true)
    await removing
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('PIC rendered report rollup', () => {
  function setupReport() {
    h.data = {
      ...h.data, reportDate: '2026-10-05T17:00:00Z', reportDateKey: '2026-10-06', lockAt: '2026-10-06T10:00:00Z',
      projects: [{ id: 'A', code: 'A', name: 'Proyek A', phase: 'AKTIF', derived: true, taskCount: 1, editable: true,
        report: { id: 'r', status: 'ON_PROGRESS', progressPct: 25, achievementToday: '', obstacle: null, followUp: null,
          evidenceCount: 0, evidence: [], submittedAt: null, forwardedAt: null, isLocked: false } }],
    }
  }
  function renderReport() {
    h.cursor = 0; h.buttons = []; h.dialog = null
    return renderToStaticMarkup(createElement(DailyReportCard, { projectId: 'A', onChanged: h.changed }))
  }
  it('refreshes derived count/progress and enables submission after task evidence reload', () => {
    setupReport()
    expect(renderReport()).toContain('Progres hari ini: 25%')
    expect(h.buttons.find((b) => b.children === 'Kirim laporan').disabled).toBe(true)
    h.buttons.find((b) => b.children === 'Ubah progress').onClick()
    renderReport()
    h.dialog.onSaved()
    // Parent reload was actually reached through ReportForm, not a direct test callback.
    expect(h.changed).toHaveBeenCalledTimes(1)
    const project = h.data.projects[0]
    h.data = { ...h.data, projects: [{ ...project, taskCount: 2, report: { ...project.report, status: 'SELESAI', progressPct: 100, evidenceCount: 1 } }],
      tasks: [{ ...task(), evidence: [{ id: 'ea' }] }] }
    const html = renderReport()
    expect(html).toContain('Diringkas dari 2 progress')
    expect(html).toContain('Progres hari ini: 100%')
    expect(h.buttons.find((b) => b.children === 'Kirim laporan').disabled).toBe(false)
    expect(h.dialog.task.evidence).toEqual([{ id: 'ea' }])
  })
  it('refreshes the parent after creating a task', () => {
    setupReport(); renderReport()
    h.buttons.find((b) => b.children === 'Tambah progress').onClick()
    renderReport()
    expect(h.dialog.task).toBeNull()
    h.dialog.onSaved()
    expect(h.changed).toHaveBeenCalledTimes(1)
    expect(h.reload).toHaveBeenCalledTimes(2) // task list + daily report
  })
})

describe('PIC work desk evidence refresh', () => {
  it('keeps the agenda task sheet open and resolves fresh evidence by ID', () => {
    const project = { id: 'A', name: 'Proyek A', code: 'A', phase: 'AKTIF', report: null, history: [], tasks: { total: 1, done: 0, blocked: 0 } }
    const desk = { projects: [project], today: '2026-10-05T17:00:00Z', lockAt: '2026-10-06T10:00:00Z', locked: false, cutoffLabel: '17.00', countdown: { totalMs: 3600000 } }
    h.data = { ...h.data, items: [], counts: {}, total: 0 }
    const renderDesk = () => {
      h.cursor = 0; h.buttons = []; h.dialog = null
      return renderToStaticMarkup(createElement(PicDeskView, { data: desk as any, reload: h.changed }))
    }
    renderDesk()
    h.agenda.onOpen({ id: 't' })
    renderDesk()
    expect(h.dialog.task.id).toBe('t')
    h.dialog.onSaved()
    expect(h.changed).toHaveBeenCalledTimes(1)
    h.data = { ...h.data, tasks: [{ ...task(), evidence: [{ id: 'fresh' }] }] }
    renderDesk()
    expect(h.dialog.task.evidence).toEqual([{ id: 'fresh' }])
  })
})
