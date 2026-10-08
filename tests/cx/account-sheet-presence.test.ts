import { beforeEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, data: { holdingUsers: [], companies: [], totals: { users: 0 }, me: 'me' } }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial; return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }] },
  useMemo: (fn: () => unknown) => fn(),
}))
vi.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: h.data, loading: false, error: null, reload: vi.fn() }) }))
vi.mock('@/components/companies/parts', () => ({ useConfirm: () => [null, vi.fn()], UserAvatar: () => null, selectCls: 'mk-select', Field: () => null, SectionTitle: () => null, SwitchRow: () => null }))

import { AccountManager } from '@/components/account-manager'
import { AccountDialog } from '@/components/account-dialog'
import { AccountSheet } from '@/components/companies/account-sheet'
import { Button } from '@/components/mk'

function nodes(tree: any, accept: (n: any) => boolean): any[] {
  if (!tree || typeof tree !== 'object') return []
  return [...(accept(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap((c) => nodes(c, accept))]
}
beforeEach(() => { h.slots = []; h.cursor = 0 })

it('AccountManager tetap merender Sheet yang sama ketika ditutup untuk animasi Radix', () => {
  const render = () => { h.cursor = 0; return AccountManager({}) }
  const tree = render()
  const add = nodes(tree, (n) => n.type === Button && n.props.children === 'Tambah akun')[0]
  add.props.onClick()
  const opened = nodes(render(), (n) => (n.type === AccountSheet || n.type === AccountDialog))[0]
  expect(opened).toBeDefined()
  expect(opened.props.target ?? opened.props).toMatchObject({ user: null, company: null })
  opened.props.onClose()
  const closed = nodes(render(), (n) => (n.type === AccountSheet || n.type === AccountDialog))[0]
  expect(closed).toBeDefined()
  expect(closed.props.target).toBeNull()
})

it('AccountSheet mempertahankan judul dan isi terakhir setelah open berubah false', () => {
  const target = { user: { id: 'u', name: 'Rina', isActive: true } as any, company: null }
  const props = { target, companies: [], me: 'me', onClose: vi.fn(), onSaved: vi.fn() }
  const opened = AccountSheet(props)
  expect(opened.props.open).toBe(true)
  h.cursor = 0
  const closed = AccountSheet({ ...props, target: null })
  expect(closed.props.open).toBe(false)
  expect(closed.props.title).toBe('Rina')
  expect(closed.props.children.props.target).toBe(target)
})
