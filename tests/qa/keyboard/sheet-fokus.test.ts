/**
 * [T2-B2 · backlog D] Kontrak keyboard/fokus Sheet dan ConfirmDialog —
 * komponen dipanggil sebagai fungsi (hook React dimock, pola tests/cx),
 * pohon elemen diperiksa, handler keyboard/fokus dijalankan dengan objek
 * tiruan. Mereka menguji WALIRAN kode kami; perilaku primitif Radix itu
 * sendiri (focus trap, Esc → onOpenChange(false), scrim) adalah kontrak
 * pustaka yang dipegang lapisan manual/peramban (lihat laporan T2-B2).
 */
import { createElement as e } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'

const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = h.cursor++
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial
    return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v }]
  },
  useRef: (initial: any) => { const i = h.cursor++; return h.slots[i] ?? (h.slots[i] = { current: initial }) },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: any) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
}))
import { Sheet } from '@/components/mk/sheet'
import { ConfirmDialog } from '@/components/mk/confirm-dialog'
import { Button } from '@/components/mk/core'
import { useConfirm } from '@/components/companies/parts'
import { nodes } from './helpers'

const render = (fn: () => any) => { h.cursor = 0; return fn() }
beforeEach(() => { h.slots = []; h.cursor = 0; vi.unstubAllGlobals() })

/* ---------- Sheet: fokus masuk ---------- */

it('Sheet saat dibuka memindahkan fokus ke judul, bukan tombol pertama', () => {
  const tree = Sheet({ open: true, title: 'Proyek Alpha', onOpenChange: vi.fn() })
  const content = nodes(tree, (n) => n.type === DialogPrimitive.Content)[0]
  const title = nodes(tree, (n) => n.type === DialogPrimitive.Title)[0]
  expect(title).toBeDefined()
  // Judul hanya menerima fokus terprogram (09 · Aksesibilitas: pembaca layar
  // mulai dari nama sheet), bukan tab stop biasa.
  expect(title.props.tabIndex).toBe(-1)

  // useRef pertama di Sheet adalah titleRef; sambungkan ke elemen tiruan.
  const judul = { focus: vi.fn() }
  h.slots[0].current = judul
  const preventDefault = vi.fn()
  content.props.onOpenAutoFocus({ preventDefault })
  expect(preventDefault).toHaveBeenCalledTimes(1)
  expect(judul.focus).toHaveBeenCalledWith({ preventScroll: true })
})

it('Sheet tanpa referensi judul membiarkan fokus bawaan Radix berjalan', () => {
  const tree = Sheet({ open: true, title: 'Proyek Alpha', onOpenChange: vi.fn() })
  const content = nodes(tree, (n) => n.type === DialogPrimitive.Content)[0]
  h.slots[0].current = null
  const preventDefault = vi.fn()
  content.props.onOpenAutoFocus({ preventDefault })
  expect(preventDefault).not.toHaveBeenCalled()
})

/* ---------- Sheet: struktur & urutan tab ---------- */

it('Sheet adalah dialog aria-modal berlabel judul', () => {
  const tree = Sheet({ open: true, title: 'Proyek Alpha', onOpenChange: vi.fn() })
  const content = nodes(tree, (n) => n.type === DialogPrimitive.Content)[0]
  expect(content.props['aria-modal']).toBe('true')
  // Tanpa Description eksplisit, aria-describedby tidak boleh menunjuk kosong.
  expect(content.props['aria-describedby']).toBeUndefined()
  expect(nodes(tree, (n) => n.type === DialogPrimitive.Title)).toHaveLength(1)
})

it('urutan baca Sheet: baris ponsel → kepala (judul + tutup) → isi → footer aksi', () => {
  const tree = Sheet({ open: true, title: 'Proyek Alpha', onOpenChange: vi.fn(), footer: e(Button, null, 'Batal') })
  const content = nodes(tree, (n) => n.type === DialogPrimitive.Content)[0]
  const kelas = content.props.children.map((c: any) => c.props?.className)
  expect(kelas).toEqual(['mk-sheet__phonebar', 'mk-sheet__head', 'mk-sheet__body', 'mk-sheet__foot'])
})

it('Sheet menyediakan dua tombol tutup yang terlabel: kembali (ponsel) dan Tutup (ikon)', () => {
  const tree = Sheet({ open: true, title: 'Proyek Alpha', onOpenChange: vi.fn(), backLabel: 'Laporan' })
  const closeWrappers = nodes(tree, (n) => n.type === DialogPrimitive.Close)
  expect(closeWrappers).toHaveLength(2)
  const kembali = nodes(closeWrappers[0], (n) => n.type === 'button')[0]
  expect(kembali.props.type).toBe('button')
  expect(String(kembali.props.children)).toContain('Laporan')
  // Tombol ikon Tutup dipasang via IconButton (aria-label "Tutup" dipasang
  // saat dirender — kelas .mk-sheet__close menandainya di kepala sheet).
  const tutup = nodes(closeWrappers[1], (n) => n.props?.label === 'Tutup')[0]
  expect(tutup).toBeDefined()
  expect(String(tutup.props.className)).toContain('mk-sheet__close')
})

/* ---------- ConfirmDialog: konfirmasi destruktif (Hapus) ---------- */

function dialogActions(overrides: Record<string, any> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const onOpenChange = vi.fn()
  const tree = ConfirmDialog({
    open: true,
    onOpenChange,
    title: 'Hapus laporan hari ini?',
    description: 'Tidak bisa dikembalikan.',
    confirmLabel: 'Hapus laporan',
    destructive: true,
    onConfirm,
    onCancel,
    ...overrides,
  })
  const actions = nodes(tree, (n) => n.props?.className === 'mk-confirm__actions')[0]
  const [cancelWrap, actionWrap] = actions.props.children
  return { tree, cancelWrap, actionWrap, onConfirm, onCancel, onOpenChange }
}

it('ConfirmDialog: tombol aman (Batal) berada sebelum tombol konfirmasi dalam urutan tab', () => {
  const { cancelWrap, actionWrap } = dialogActions()
  expect(cancelWrap.type).toBe(AlertDialogPrimitive.Cancel)
  expect(actionWrap.type).toBe(AlertDialogPrimitive.Action)
  const batal = cancelWrap.props.children
  const hapus = actionWrap.props.children
  expect(batal.props.children).toBe('Batal')
  expect(hapus.props.children).toBe('Hapus laporan')
})

it('ConfirmDialog destruktif menandai tombol konfirmasi variant destructive', () => {
  const { actionWrap } = dialogActions()
  expect(actionWrap.props.children.props.variant).toBe('destructive')
})

it('ConfirmDialog non-destruktif memakai tombol primer, bukan destructive', () => {
  const { actionWrap } = dialogActions({ destructive: undefined, confirmLabel: 'Arsipkan proyek' })
  expect(actionWrap.props.children.props.variant).toBe('primary')
})

it('ConfirmDialog: Batal memicu onCancel, konfirmasi memicu onConfirm', () => {
  const { cancelWrap, actionWrap, onConfirm, onCancel } = dialogActions()
  cancelWrap.props.children.props.onClick()
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
  actionWrap.props.children.props.onClick()
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

/* ---------- useConfirm: Esc membatalkan, tombol konfirmasi melanjutkan ---------- */

it('useConfirm: Esc (onOpenChange(false)) mengembalikan false tanpa menjalankan aksi', async () => {
  const [, ask] = render(useConfirm)
  const janji = ask({ title: 'Hapus laporan hari ini?', description: 'x', confirmLabel: 'Hapus laporan', destructive: true })
  const [el] = render(useConfirm)
  const dlg = el.props as any
  expect(dlg.open).toBe(true)
  expect(dlg.destructive).toBe(true)
  expect(dlg.title).toBe('Hapus laporan hari ini?')

  // Radix: Esc / klik scrim → onOpenChange(false)
  dlg.onOpenChange(false)
  await expect(janji).resolves.toBe(false)
  const [el2] = render(useConfirm)
  expect((el2.props as any).open).toBe(false)
})

it('useConfirm: tombol konfirmasi mengembalikan true; Batal mengembalikan false', async () => {
  const renderHook = () => render(useConfirm)
  let [el, ask] = renderHook()
  const janji = ask({ title: 'Hapus bukti?', description: 'x', confirmLabel: 'Hapus bukti', destructive: true })
  ;[, ask] = renderHook()
  ;[el] = renderHook()
  ;(el.props as any).onConfirm()
  await expect(janji).resolves.toBe(true)

  const janji2 = ask({ title: 'Hapus bukti?', description: 'x', confirmLabel: 'Hapus bukti', destructive: true })
  ;[el] = renderHook()
  ;(el.props as any).onCancel()
  await expect(janji2).resolves.toBe(false)
})
