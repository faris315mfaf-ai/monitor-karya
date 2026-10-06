import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WeeklyBoard, type BoardCard, type BoardMove } from '@/components/weekly-board'

const harness = vi.hoisted(() => ({
  states: [] as any[], refs: [] as { current: any }[], stateIndex: 0, refIndex: 0,
  context: null as any,
  droppable: [] as { id: string; disabled: boolean }[],
  sortable: [] as { id: string; disabled: boolean }[],
}))
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>()
  return {
    ...react,
    useState: (initial: unknown) => {
      const slot = harness.stateIndex++
      if (!(slot in harness.states)) harness.states[slot] = initial
      return [harness.states[slot], (value: any) => {
        harness.states[slot] = typeof value === 'function' ? value(harness.states[slot]) : value
      }]
    },
    useRef: (initial: unknown) => {
      const slot = harness.refIndex++
      return harness.refs[slot] ?? (harness.refs[slot] = { current: initial })
    },
    useLayoutEffect: () => {}, // no DOM measurements in SSR
  }
})
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, ...props }: any) => { harness.context = props; return children },
  DragOverlay: () => null,
  KeyboardSensor: 'keyboard', PointerSensor: 'pointer', TouchSensor: 'touch',
  closestCorners: vi.fn(), useSensor: (sensor: string) => sensor, useSensors: (...sensors: string[]) => sensors,
  useDroppable: (props: { id: string; disabled: boolean }) => {
    harness.droppable.push(props)
    return { setNodeRef: () => {}, isOver: false }
  },
}))
vi.mock('@dnd-kit/sortable', async (original) => {
  const sortable = await original<typeof import('@dnd-kit/sortable')>()
  return {
    ...sortable,
    SortableContext: ({ children }: { children: ReactNode }) => children,
    useSortable: (props: { id: string; disabled: boolean }) => {
      harness.sortable.push(props)
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, setActivatorNodeRef: () => {},
        transform: null, transition: undefined, isDragging: false }
    },
  }
})
vi.mock('@/components/mk', () => ({
  Icon: () => createElement('svg'),
  IconButton: ({ label }: { label: string }) => createElement('button', null, label),
  cx: (...values: unknown[]) => values.filter(Boolean).join(' '),
}))

const days = ['2026-10-04T17:00:00.000Z', '2026-10-05T17:00:00.000Z', '2026-10-06T17:00:00.000Z']
const cards: BoardCard[] = [
  { id: 'a', lane: '2026-10-05' }, { id: 'b', lane: '2026-10-06' },
  { id: 'c', lane: '2026-10-06' }, { id: 'w', lane: 'MINGGUAN' },
]
let disabledLanes: string[] | undefined
let disabled: boolean
let onMove = vi.fn<(moves: BoardMove[], next: BoardCard[]) => void>()
let onAdd = vi.fn<(lane: string) => void>()
let boardCards: BoardCard[]
function render() {
  harness.stateIndex = 0
  harness.refIndex = 0
  harness.droppable = []
  harness.sortable = []
  return renderToStaticMarkup(createElement(WeeklyBoard<BoardCard>, {
    days, today: days[0], cards: boardCards, disabled, disabledLanes, onMove, onAdd,
    renderCard: (card) => createElement('article', null, card.id),
    renderLaneNote: (lane) => disabledLanes?.includes(lane) ? createElement('p', null, 'Diteruskan ke holding · ajukan buka kunci') : null,
  }))
}
function start(id: string, input: string) {
  harness.context.onDragStart({ active: { id }, activatorEvent: { type: input } })
  render()
}
function over(id: string, target: string) {
  harness.context.onDragOver({ active: { id }, over: { id: target } })
  render()
}
function end(id: string, target: string | null) {
  harness.context.onDragEnd({ active: { id }, over: target ? { id: target } : null })
  render()
}

beforeEach(() => {
  harness.states = []
  harness.refs = []
  disabledLanes = ['2026-10-05']
  disabled = false
  boardCards = cards
  onMove = vi.fn<(moves: BoardMove[], next: BoardCard[]) => void>()
  onAdd = vi.fn<(lane: string) => void>()
})

describe('WeeklyBoard per-lane locks', () => {
  it('keeps chronological lanes, lock descriptions, and frozen cards visible without add/grips', () => {
    const html = render()
    expect(harness.droppable).toEqual([
      { id: '2026-10-05', disabled: true }, { id: '2026-10-06', disabled: false },
      { id: '2026-10-07', disabled: false }, { id: 'MINGGUAN', disabled: false },
    ])
    expect(harness.sortable.find((card) => card.id === 'a')?.disabled).toBe(true)
    expect(harness.sortable.find((card) => card.id === 'b')?.disabled).toBe(false)
    const frozen = html.slice(html.indexOf('<section'), html.indexOf('</section>'))
    expect(frozen).toContain('Senin 5 · hanya dapat dibaca')
    expect(frozen).toContain('tabindex="0"')
    expect(frozen).toContain('aria-describedby=')
    expect(frozen).toContain('Diteruskan ke holding')
    expect(frozen).toContain('<article>a</article>')
    expect(frozen).not.toContain('<button')
    expect(html.indexOf('Senin 5')).toBeLessThan(html.indexOf('Selasa 6'))
    expect(html.indexOf('Selasa 6')).toBeLessThan(html.indexOf('Rabu 7'))
    expect(html).toContain('Tambah capaian di Selasa 6')
  })

  it('annotates even an empty frozen lane', () => {
    boardCards = cards.filter((card) => card.id !== 'a')
    const html = render()
    const frozen = html.slice(html.indexOf('<section'), html.indexOf('</section>'))
    expect(frozen).toContain('Diteruskan ke holding')
    expect(frozen).toContain('Belum ada capaian.')
    expect(frozen).not.toContain('<button')
  })

  it.each(['pointerdown', 'keydown'])('blocks frozen source start/over/end for %s', (input) => {
    render()
    start('a', input)
    over('a', '2026-10-07')
    end('a', '2026-10-07')
    expect(onMove).not.toHaveBeenCalled()
    expect(harness.states[0]).toEqual(cards)
  })

  it.each(['pointerdown', 'keydown'])('blocks frozen lane and card destinations for %s', (input) => {
    for (const target of ['2026-10-05', 'a']) {
      render()
      start('b', input)
      over('b', target)
      expect(harness.states[0]).toEqual(cards)
      end('b', target)
      expect(onMove).not.toHaveBeenCalled()
    }
  })

  it.each(['source', 'destination'])('cancels a move when %s freezes after drag-over', (side) => {
    disabledLanes = []
    render()
    start('a', 'keydown')
    over('a', '2026-10-07')
    expect(harness.states[0].find((card: BoardCard) => card.id === 'a').lane).toBe('2026-10-07')
    disabledLanes = [side === 'source' ? '2026-10-05' : '2026-10-07']
    render()
    end('a', '2026-10-07')
    expect(onMove).not.toHaveBeenCalled()
    expect(harness.states[0]).toEqual(cards)
  })

  it('does not commit an earlier open-lane hover when released on a frozen lane', () => {
    render()
    start('b', 'pointerdown')
    over('b', '2026-10-07')
    over('b', 'a')
    end('b', 'a')
    expect(onMove).not.toHaveBeenCalled()
    expect(harness.states[0]).toEqual(cards)
  })

  it('moves and reorders unlocked cards while another lane is frozen', () => {
    render()
    start('b', 'keydown')
    end('b', 'c')
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove.mock.calls[0][0]).toEqual([
      { id: 'c', lane: '2026-10-06', index: 0 }, { id: 'b', lane: '2026-10-06', index: 1 },
    ])
    onMove.mockClear()
    start('c', 'pointerdown')
    over('c', 'MINGGUAN')
    end('c', 'MINGGUAN')
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove.mock.calls[0][0]).toContainEqual({ id: 'c', lane: 'MINGGUAN', index: 1 })
  })

  it('preserves old callers when optional lane props are omitted', () => {
    disabledLanes = undefined
    const html = render()
    expect(harness.droppable.every((lane) => !lane.disabled)).toBe(true)
    expect(harness.sortable.every((card) => !card.disabled)).toBe(true)
    expect(html).not.toContain('data-readonly')
    expect(html).toContain('Tambah capaian di Senin 5')
    start('a', 'pointerdown')
    over('a', '2026-10-07')
    end('a', '2026-10-07')
    expect(onMove).toHaveBeenCalledOnce()
  })

  it('blocks all targets and drag handlers for a globally disabled board', () => {
    disabled = true
    const html = render()
    expect(harness.droppable.every((lane) => lane.disabled)).toBe(true)
    expect(harness.sortable.every((card) => card.disabled)).toBe(true)
    expect(html).not.toContain('<button')
    start('b', 'keydown')
    over('b', '2026-10-07')
    end('b', '2026-10-07')
    expect(onMove).not.toHaveBeenCalled()
  })
})
