/**
 * [T2-B2 · backlog D] Uji langsung fungsi utilitas keyboard murni
 * src/components/mk/keyboard.ts — tanpa DOM: querySelectorAll/element.focus
 * diganti objek tiruan, sesuai pola tests/cx (hook/objek dipalsukan).
 */
import { describe, expect, it, vi } from 'vitest'
import { moveRovingFocus } from '@/components/mk/keyboard'

type FakeItem = {
  focus: ReturnType<typeof vi.fn>
  click: ReturnType<typeof vi.fn>
  getAttribute: (name: string) => string | null
  contains: (node: unknown) => boolean
  ariaDisabled?: string
}

function items(n: number): FakeItem[] {
  return Array.from({ length: n }, () => {
    const it: FakeItem = {
      focus: vi.fn(),
      click: vi.fn(),
      contains: () => false,
      getAttribute: (name: string) => (name === 'aria-disabled' ? it.ariaDisabled ?? null : null),
    }
    return it
  })
}

/** Bangun event keyboard mirip DOM untuk moveRovingFocus. */
function key(opts: { key: string; at: FakeItem; list: FakeItem[]; alt?: boolean; ctrl?: boolean; meta?: boolean }) {
  const preventDefault = vi.fn()
  const event: any = {
    key: opts.key,
    altKey: opts.alt ?? false,
    ctrlKey: opts.ctrl ?? false,
    metaKey: opts.meta ?? false,
    preventDefault,
    target: opts.at,
    currentTarget: { querySelectorAll: () => opts.list },
  }
  return { event, preventDefault }
}

describe('moveRovingFocus — satu tab stop, panah memindahkan fokus', () => {
  it('panah kanan memindahkan fokus ke item berikutnya dan mencegah gulir bawaan', () => {
    const list = items(3)
    const { event, preventDefault } = key({ key: 'ArrowRight', at: list[0], list })
    moveRovingFocus(event)
    expect(list[1].focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(list[0].focus).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('panah kiri dari item pertama memutar ke item terakhir (roving tanpa jebakan)', () => {
    const list = items(3)
    const { event } = key({ key: 'ArrowLeft', at: list[0], list })
    moveRovingFocus(event)
    expect(list[2].focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('panah kanan dari item terakhir memutar ke item pertama', () => {
    const list = items(3)
    const { event } = key({ key: 'ArrowDown', at: list[2], list })
    moveRovingFocus(event)
    expect(list[0].focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('Home dan End menjangkau batas daftar', () => {
    const list = items(4)
    const home = key({ key: 'Home', at: list[2], list })
    moveRovingFocus(home.event)
    expect(list[0].focus).toHaveBeenCalled()
    const end = key({ key: 'End', at: list[1], list })
    moveRovingFocus(end.event)
    expect(list[3].focus).toHaveBeenCalled()
  })

  it('kunci ubah (Alt/Ctrl/Meta) tidak mengambil alih panah dari pengguna', () => {
    const list = items(3)
    for (const mod of ['alt', 'ctrl', 'meta'] as const) {
      const { event, preventDefault } = key({ key: 'ArrowRight', at: list[0], list, [mod]: true })
      moveRovingFocus(event)
      expect(preventDefault).not.toHaveBeenCalled()
      expect(list[1].focus).not.toHaveBeenCalled()
    }
  })

  it('tombol selain panah/Home/End diabaikan (Enter/Space tetap aktivasi native)', () => {
    const list = items(3)
    const { event, preventDefault } = key({ key: 'Enter', at: list[0], list })
    moveRovingFocus(event)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(list.map((i) => i.focus)).toSatisfy((fns: any[]) => fns.every((f) => !f.mock.calls.length))
  })

  it('item aria-disabled dilewati saat memilih target berikutnya', () => {
    const list = items(3)
    list[1].ariaDisabled = 'true'
    const { event } = key({ key: 'ArrowRight', at: list[0], list })
    moveRovingFocus(event)
    expect(list[1].focus).not.toHaveBeenCalled()
    expect(list[2].focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('target di luar daftar (bukan anak kontainer) tidak memicu preventDefault', () => {
    const list = items(3)
    const asing = items(1)[0]
    const { event, preventDefault } = key({ key: 'ArrowRight', at: asing, list })
    moveRovingFocus(event)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(list.map((i) => i.focus)).toSatisfy((fns: any[]) => fns.every((f) => !f.mock.calls.length))
  })

  it('activate=true juga mengklik target baru (mode pilih dengan panah)', () => {
    const list = items(3)
    const { event } = key({ key: 'ArrowRight', at: list[0], list })
    moveRovingFocus(event, 'button:not(:disabled)', true)
    expect(list[1].click).toHaveBeenCalledTimes(1)
  })

  it('pemindahan fokus tidak pernah sekaligus mengaktifkan baris (bawaan aman)', () => {
    const list = items(3)
    const { event } = key({ key: 'End', at: list[0], list })
    moveRovingFocus(event)
    expect(list[2].click).not.toHaveBeenCalled()
  })
})
