import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  data: null as any,
  loading: false,
  board: null as any,
  dialog: null as any,
  dialogProps: null as any,
  ref: null as any,
  hook: 0,
  cleanup: null as (() => void) | null,
  reload: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

// SSR tests exercise the board callbacks. Shared ref/effect simulates a committed
// refresh so an earlier toast must use the newest lock state, not its closure.
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  return {
    ...react,
    useRef: (initial: unknown) => harness.ref ?? (harness.ref = { current: initial }),
    useLayoutEffect: (effect: () => () => void) => { harness.cleanup = effect() },
    useState: (initial: unknown) => {
      const slot = harness.hook++
      return [slot === 0 ? harness.dialog : initial, (value: unknown) => {
        if (slot === 0) harness.dialog = value
      }]
    },
  }
})
vi.mock('sonner', () => ({ toast: harness.toast }))
vi.mock('@/hooks/use-resource', () => ({
  useResource: () => ({ data: harness.data, loading: harness.loading, error: null, reload: harness.reload }),
}))
vi.mock('@/components/companies/parts', () => ({ useConfirm: () => [null, vi.fn()] }))
vi.mock('@/components/mk', () => {
  const container = ({ children }: { children?: ReactNode }) => createElement('div', null, children)
  return {
    Button: container, Card: container, ErrorNote: container, IconButton: container,
    ProgressBar: () => null, Skeleton: () => null, StatusBadge: container,
    Icon: () => createElement('svg', { 'aria-hidden': true }),
    cx: (...values: unknown[]) => values.filter(Boolean).join(' '),
  }
})
vi.mock('@/components/weekly-board', async (original) => {
  const board = await original<typeof import('@/components/weekly-board')>()
  return {
    ...board,
    WeeklyBoard: (props: any) => {
      harness.board = props
      return createElement('div', { 'data-editable': true }, props.cards.map((card: any) =>
        createElement('div', { key: card.id }, props.renderCard(card, false))))
    },
  }
})
vi.mock('@/components/task-dialog', () => ({
  TASK_STATUS_META: { BELUM_MULAI: { label: 'Belum mulai' } },
  TaskDialog: (props: unknown) => { harness.dialogProps = props; return null },
}))

import { canMoveTasks, WeeklyTaskBoard } from '@/components/weekly-task-board'

const days = ['2026-10-04T17:00:00.000Z', '2026-10-05T17:00:00.000Z']
function task(id: string, workDate: string, scope = 'HARIAN') {
  return {
    id, title: `Capaian ${id}`, workDate, scope, sortOrder: 0,
    status: 'BELUM_MULAI', progressPct: 0, urgency: 'SEDANG', subtasks: [],
    tags: [], description: null, picName: null, startAt: null, endAt: null,
    durationMin: null, obstacle: null, decisionNeeded: null, escalationId: null,
  }
}
function render(weekKey = '2026-W41') {
  harness.hook = 0
  harness.dialogProps = null
  return renderToStaticMarkup(createElement(WeeklyTaskBoard, {
    projectId: 'project', projectName: 'Proyek', weekKey, onWeekChange: vi.fn(),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.ref = null
  harness.dialog = null
  harness.loading = false
  harness.data = {
    mode: 'MINGGUAN', locked: false, frozenDays: [], days, today: days[0],
    period: { key: '2026-W41', start: days[0], end: days[1], lockAt: days[1], current: true },
    tasks: [task('a', days[0]), task('b', days[1])],
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})

describe('CX2 frozen days', () => {
  it.each([
    ['2026-10-05', '2026-10-06'],
    ['2026-10-06', '2026-10-05'],
    ['2026-10-05', '2026-10-05'],
  ])('rejects frozen source/destination %s → %s', (from, to) => {
    expect(canMoveTasks({ ...harness.data, frozenDays: [days[0]] }, [{ id: 'a', lane: from }],
      [{ id: 'a', lane: to, index: 0 }])).toBe(false)
  })

  it('supports unlocked days, weekly cards and legacy preview data', () => {
    const snapshot = { locked: false, days }
    expect(canMoveTasks(snapshot, [{ id: 'a', lane: '2026-10-05' }],
      [{ id: 'a', lane: 'MINGGUAN', index: 0 }])).toBe(true)
    expect(canMoveTasks({ ...snapshot, frozenDays: [days[0]] }, [{ id: 'a', lane: 'MINGGUAN' }],
      [{ id: 'a', lane: '2026-10-06', index: 0 }])).toBe(true)
  })

  it('rejects locked week, unknown cards and destinations', () => {
    const cards = [{ id: 'a', lane: '2026-10-06' }]
    const moves = [{ id: 'a', lane: 'MINGGUAN', index: 0 }]
    expect(canMoveTasks({ ...harness.data, locked: true }, cards, moves)).toBe(false)
    expect(canMoveTasks(harness.data, cards, [{ ...moves[0], id: 'missing' }])).toBe(false)
    expect(canMoveTasks(harness.data, cards, [{ ...moves[0], lane: '2026-10-20' }])).toBe(false)
  })

  it('shows focusable locked lanes including empty ones; removes frozen cards from drag surface', () => {
    harness.data.frozenDays = days
    harness.data.tasks = [task('a', days[0]), task('w', days[0], 'MINGGUAN')]
    const html = render()
    expect(harness.board.days).toEqual(days) // weekday labels keep their original indices
    expect(harness.board.cards.map((t: any) => t.id)).toEqual(['w'])
    expect(html).toContain('has-frozen-1 has-frozen-2')
    expect(html.match(/Diteruskan ke holding/g)).toHaveLength(2)
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('Capaian a')
    const frozenMarkup = html.slice(html.indexOf('aria-label="Hari yang dibekukan"'))
    expect(frozenMarkup).not.toContain('Ubah capaian')
    expect(frozenMarkup).not.toContain('Hapus')
    expect(frozenMarkup).not.toContain('Tambah capaian')
  })

  it.each([
    [{ id: 'a', lane: '2026-10-06', index: 0 }],
    [{ id: 'b', lane: '2026-10-05', index: 0 }],
    [{ id: 'b', lane: 'MINGGUAN', index: 0 }, { id: 'a', lane: '2026-10-06', index: 1 }],
  ])('never sends PATCH for a batch touching a frozen day: %j', async (...moves) => {
    harness.data.frozenDays = [days[0]]
    render()
    await harness.board.onMove(moves)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('undo includes the origin lane even when it becomes empty', async () => {
    render()
    await harness.board.onMove([{ id: 'a', lane: '2026-10-06', index: 1 }])
    const undo = harness.toast.mock.calls.find(([message]) => message === 'Susunan tersimpan.')![1].action
    undo.onClick()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const body = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string)
    expect(body.moves).toContainEqual({ id: 'a', lane: '2026-10-05', sortOrder: 0 })
  })

  it.each(['origin', 'destination', 'week', 'loading', 'navigation'])('rechecks %s before an old undo callback', async (change) => {
    render()
    await harness.board.onMove([{ id: 'a', lane: '2026-10-06', index: 1 }])
    const undo = harness.toast.mock.calls.find(([message]) => message === 'Susunan tersimpan.')![1].action
    harness.data = { ...harness.data, tasks: [task('a', days[1]), task('b', days[1])] }
    if (change === 'origin') harness.data.frozenDays = [days[0]]
    if (change === 'destination') harness.data.frozenDays = [days[1]]
    if (change === 'week') harness.data.locked = true
    if (change === 'loading') harness.loading = true
    render(change === 'navigation' ? '2026-W42' : undefined)
    undo.onClick()
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('blocks undo after the board unmounts', async () => {
    render()
    await harness.board.onMove([{ id: 'a', lane: '2026-10-06', index: 1 }])
    const undo = harness.toast.mock.calls.find(([message]) => message === 'Susunan tersimpan.')![1].action
    harness.cleanup!()
    undo.onClick()
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('guards add/edit and excludes frozen destinations from the dialog', () => {
    harness.data.frozenDays = [days[0]]
    render()
    harness.board.onAdd('2026-10-05')
    expect(harness.dialog).toBeNull()
    harness.board.onAdd('2026-10-06')
    render()
    expect(harness.dialogProps.weekly.days).toEqual([days[1]])
    harness.data = { ...harness.data, frozenDays: days }
    render()
    expect(harness.dialogProps).toBeNull() // source just froze: no PUT form mounted
    expect(fetch).not.toHaveBeenCalled()
  })
})
