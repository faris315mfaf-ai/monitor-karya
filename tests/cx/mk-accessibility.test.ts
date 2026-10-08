import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = h.cursor++
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial
    return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }]
  },
  useRef: (initial: any) => { const i = h.cursor++; return h.slots[i] ?? (h.slots[i] = { current: initial }) },
  useId: () => 'chart-id',
}))
import { BarChart, AreaChart, DonutChart, Timeline } from '@/components/mk/data'
import { Sheet } from '@/components/mk/sheet'

function nodes(tree: any, accept: (n: any) => boolean): any[] {
  if (!tree || typeof tree !== 'object') return []
  return [...(accept(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap((c) => nodes(c, accept))]
}
const series = [{ label: 'M1', value: 20 }, { label: 'M2', value: 30 }, { label: 'M3', value: 40 }]
beforeEach(() => { h.slots = []; h.cursor = 0; vi.unstubAllGlobals() })

const charts = [
  ['batang', () => BarChart({ data: series })],
  ['area', () => AreaChart({ data: series })],
  ['donat', () => DonutChart({ data: series })],
  ['linimasa', () => Timeline({ rows: series.map((s, i) => ({ id: String(i), label: s.label, start: 0, end: 10 })), span: 10 })],
] as const

describe.each(charts)('keyboard grafik %s', (_name, render) => {
  it('memiliki satu tab stop; panah berpindah fokus dan Home/End menjangkau batas', () => {
    const tree = render()
    const buttons = nodes(tree, (n) => n.type === 'button')
    expect(buttons.filter((b) => b.props.tabIndex === 0)).toHaveLength(1)
    expect(buttons.filter((b) => b.props.tabIndex === -1)).toHaveLength(2)
    const group = nodes(tree, (n) => n.props?.role === 'group')[0]
    const fake = buttons.map((b) => ({ disabled: false, focus: vi.fn(), click: b.props.onClick }))
    const preventDefault = vi.fn()
    const dispatch = (key: string, at: number) => group.props.onKeyDown({ key, preventDefault, target: fake[at], currentTarget: { querySelectorAll: () => fake }, altKey: false, ctrlKey: false, metaKey: false })
    dispatch('ArrowRight', 0)
    expect(fake[1].focus).toHaveBeenCalled()
    dispatch('End', 1)
    expect(fake[2].focus).toHaveBeenCalled()
    dispatch('Home', 2)
    expect(fake[0].focus).toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledTimes(3)
  })
})

it('angka batang tertulis dalam hasil render, termasuk nol dan format khusus', () => {
  const html = renderToStaticMarkup(createElement(BarChart, { data: [{ label: 'M1', value: 0 }, { label: 'M2', value: 1200 }], formatValue: (v) => `${v} output` }))
  expect(html).toContain('0 output</span>')
  expect(html).toContain('1200 output</span>')
})

it('Sheet mengembalikan fokus ke main bila pemicu palet sudah dilepas', () => {
  class FocusTarget { isConnected = true; focus = vi.fn(); closest = () => null; hasAttribute = () => false; getClientRects = () => [{}] }
  const trigger = new FocusTarget()
  const fallback = new FocusTarget()
  vi.stubGlobal('HTMLElement', FocusTarget)
  vi.stubGlobal('document', { body: {}, activeElement: trigger, querySelector: () => fallback })
  const tree = Sheet({ open: true, title: 'Proyek', onOpenChange: vi.fn() })
  trigger.isConnected = false
  const content = nodes(tree, (n) => !!n.props?.onCloseAutoFocus)[0]
  const preventDefault = vi.fn()
  content.props.onCloseAutoFocus({ preventDefault })
  expect(preventDefault).toHaveBeenCalled()
  expect(fallback.focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(trigger.focus).not.toHaveBeenCalled()
})

it('Sheet tetap mengembalikan fokus ke pemicu yang masih terpasang', () => {
  class FocusTarget { isConnected = true; focus = vi.fn(); closest = () => null; hasAttribute = () => false; getClientRects = () => [{}] }
  const trigger = new FocusTarget()
  vi.stubGlobal('HTMLElement', FocusTarget)
  vi.stubGlobal('document', { body: {}, activeElement: trigger, querySelector: vi.fn() })
  const content = nodes(Sheet({ open: true, title: 'Proyek', onOpenChange: vi.fn() }), (n) => !!n.props?.onCloseAutoFocus)[0]
  content.props.onCloseAutoFocus({ preventDefault: vi.fn() })
  expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true })
})

it('panah grafik hanya memindahkan fokus; Enter/klik tetap menjadi aktivasi eksplisit', () => {
  const onSelect = vi.fn()
  const render = () => { h.cursor = 0; return Timeline({ rows: series.map((s, i) => ({ id: String(i), label: s.label, start: 0, end: 10 })), span: 10, onSelect }) }
  const tree = render()
  const buttons = nodes(tree, (n) => n.type === 'button')
  const fake = buttons.map((b) => ({ focus: b.props.onFocus, click: b.props.onClick }))
  const group = nodes(tree, (n) => n.props?.role === 'group')[0]
  group.props.onKeyDown({ key: 'ArrowRight', preventDefault: vi.fn(), target: fake[0], currentTarget: { querySelectorAll: () => fake } })
  expect(onSelect).not.toHaveBeenCalled()
  const moved = nodes(render(), (n) => n.type === 'button')
  expect(moved.map((n) => n.props.tabIndex)).toEqual([-1, 0, -1])
  moved[1].props.onClick()
  expect(onSelect).toHaveBeenCalledWith('1')
})

it('grafik yang menyusut tetap mempunyai tepat satu titik masuk', () => {
  BarChart({ data: series, defaultSelectedIndex: 2 })
  h.cursor = 0
  const buttons = nodes(BarChart({ data: series.slice(0, 1) }), (n) => n.type === 'button')
  expect(buttons.map((n) => n.props.tabIndex)).toEqual([0])
  h.cursor = 0
  expect(nodes(BarChart({ data: [] }), (n) => n.type === 'button')).toHaveLength(0)
})

it('Sheet memakai cadangan jika pemicu masih terpasang tetapi tersembunyi setelah navigasi', () => {
  class FocusTarget { isConnected = true; focus = vi.fn(); closest = () => null; hasAttribute = () => false; getClientRects = () => [] }
  const trigger = new FocusTarget()
  const fallback = new FocusTarget()
  vi.stubGlobal('HTMLElement', FocusTarget)
  vi.stubGlobal('document', { body: {}, activeElement: trigger, querySelector: () => fallback })
  const content = nodes(Sheet({ open: true, title: 'Proyek', onOpenChange: vi.fn() }), (n) => !!n.props?.onCloseAutoFocus)[0]
  content.props.onCloseAutoFocus({ preventDefault: vi.fn() })
  expect(trigger.focus).not.toHaveBeenCalled()
  expect(fallback.focus).toHaveBeenCalledWith({ preventScroll: true })
})
