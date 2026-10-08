import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ChoiceGroup, Input, Label, Switch, Textarea } from '@/components/mk/forms'

function choices(selected = 0) {
  return ['Rendah', 'Sedang', 'Tinggi'].map((label, i) => createElement('button', {
    key: label, role: 'radio', type: 'button', 'aria-checked': i === selected,
    disabled: i === 1, onClick: vi.fn(),
  }, label))
}

it('Input dan Textarea mempertahankan label, validasi, ref dan callback native', () => {
  const onChange = vi.fn()
  const ref = { current: null }
  const input = Input({ id: 'email', name: 'email', type: 'email', required: true, disabled: true, 'aria-invalid': true, 'aria-describedby': 'email-error', ref, onChange, className: 'extra' })
  expect(input.props).toMatchObject({ id: 'email', name: 'email', type: 'email', required: true, disabled: true, 'aria-invalid': true, 'aria-describedby': 'email-error', ref, onChange })
  expect(input.props.className).toBe('mk-input extra')
  const textarea = Textarea({ id: 'catatan', rows: 3, maxLength: 500, defaultValue: 'Draf', onChange, ref })
  expect(textarea.props).toMatchObject({ id: 'catatan', rows: 3, maxLength: 500, defaultValue: 'Draf', onChange, ref })
  expect(renderToStaticMarkup(createElement(Label, { htmlFor: 'email' }, 'Email'))).toContain('for="email"')
})

it('Switch mempertahankan checkbox native untuk label, Space, disabled dan submit form', () => {
  const change = vi.fn()
  const tree = Switch({ id: 'notif', name: 'notif', value: 'aktif', checked: true, disabled: true, onCheckedChange: change, 'aria-label': 'Pengingat' })
  expect(tree.type).toBe('input')
  expect(tree.props).toMatchObject({ type: 'checkbox', role: 'switch', id: 'notif', name: 'notif', value: 'aktif', checked: true, disabled: true })
  tree.props.onChange({ currentTarget: { checked: false } } as any)
  expect(change).toHaveBeenCalledWith(false)
  expect(renderToStaticMarkup(tree)).toContain('aria-label="Pengingat"')
})

it('Switch defaultChecked tetap native sehingga reset form memulihkan nilai awal', () => {
  const tree = Switch({ defaultChecked: true, name: 'pengingat' })
  expect(tree.props.defaultChecked).toBe(true)
  expect(tree.props.checked).toBeUndefined()
})

it('ChoiceGroup hanya mentab pilihan aktif dan melewati pilihan disabled', () => {
  const group = ChoiceGroup({ 'aria-label': 'Urgensi', children: choices() })
  expect(group.props.role).toBe('radiogroup')
  const children = group.props.children
  expect(children.map((child: any) => child.props.tabIndex)).toEqual([0, -1, -1])
  const first = { focus: vi.fn(), click: children[0].props.onClick, getAttribute: () => null }
  const last = { focus: vi.fn(), click: children[2].props.onClick, getAttribute: () => null }
  const event = { key: 'ArrowRight', preventDefault: vi.fn(), currentTarget: { querySelectorAll: (selector: string) => { expect(selector).toContain(':not(:disabled)'); return [first, last] } }, target: first }
  group.props.onKeyDown(event as any)
  expect(last.focus).toHaveBeenCalled()
  expect(last.click).toHaveBeenCalledTimes(1)
  expect(children[1].props.onClick).not.toHaveBeenCalled()
  group.props.onKeyDown({ ...event, key: 'ArrowLeft' } as any)
  expect(last.click).toHaveBeenCalledTimes(2)
})

it('ChoiceGroup Home/End memilih batas dan Tab tidak dicegat', () => {
  const group = ChoiceGroup({ children: choices(2) })
  const children = group.props.children
  expect(children.map((child: any) => child.props.tabIndex)).toEqual([-1, -1, 0])
  const buttons = [0, 2].map((i) => ({ focus: vi.fn(), click: children[i].props.onClick }))
  const event = { key: 'Home', preventDefault: vi.fn(), currentTarget: { querySelectorAll: () => buttons }, target: buttons[1] }
  group.props.onKeyDown(event as any)
  expect(buttons[0].click).toHaveBeenCalledOnce()
  group.props.onKeyDown({ ...event, key: 'End', target: buttons[0] } as any)
  expect(buttons[1].click).toHaveBeenCalledOnce()
  event.preventDefault.mockClear()
  group.props.onKeyDown({ ...event, key: 'Tab' } as any)
  expect(event.preventDefault).not.toHaveBeenCalled()
})

it('ChoiceGroup tanpa pilihan atau pilihan aktif disabled memiliki satu titik masuk yang valid', () => {
  const group = ChoiceGroup({ children: choices(1) })
  expect(group.props.children.map((child: any) => child.props.tabIndex)).toEqual([0, -1, -1])
  expect(ChoiceGroup({ children: [] }).props.children).toHaveLength(0)
})
