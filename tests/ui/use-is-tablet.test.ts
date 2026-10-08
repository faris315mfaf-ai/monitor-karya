import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Regresi hook layar mk/layout.tsx (Tahap 1): useIsPhone/useIsTablet memakai
 * useSyncExternalStore + window.matchMedia. Tanpa DOM di lingkungan tes, hook
 * diuji dengan meniru kontrak useSyncExternalStore React:
 *  - window belum ada (SSR/render pertama) → hanya getServerSnapshot dipanggil;
 *  - window ada → langganan dipasang (addEventListener 'change') lalu snapshot
 *    klien dibaca dari window.matchMedia(query).matches;
 *  - cleanup menghapus langganan (removeEventListener 'change').
 * Query yang benar: ponsel '(max-width: 599px)', tablet '(min-width: 600px)
 * and (max-width: 1023px)'.
 */

const h = vi.hoisted(() => ({
  queries: [] as string[],
  listeners: new Map<string, Set<() => void>>(),
  lastSubscribe: null as null | ((cb: () => void) => () => void),
  lastCleanup: null as null | (() => void),
}))

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useSyncExternalStore: (
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => boolean,
    getServerSnapshot: () => boolean
  ) => {
    if (typeof window === 'undefined') return getServerSnapshot()
    h.lastSubscribe = subscribe
    h.lastCleanup = subscribe(() => {})
    return getSnapshot()
  },
}))

import { useIsPhone, useIsTablet } from '@/components/mk/layout'

const PHONE_QUERY = '(max-width: 599px)'
const TABLET_QUERY = '(min-width: 600px) and (max-width: 1023px)'

/** Stub window.matchMedia; `matches` dibaca ulang tiap pemanggilan supaya
 * perubahan viewport bisa disimulasikan dengan memutar nilai record. */
function stubWindow(matches: Record<string, boolean>) {
  const mql = (q: string) => ({
    matches: matches[q] ?? false,
    addEventListener: (type: string, cb: () => void) => {
      if (type !== 'change') return
      if (!h.listeners.has(q)) h.listeners.set(q, new Set())
      h.listeners.get(q)!.add(cb)
    },
    removeEventListener: (type: string, cb: () => void) => {
      if (type === 'change') h.listeners.get(q)?.delete(cb)
    },
  })
  vi.stubGlobal('window', {
    matchMedia: (q: string) => {
      h.queries.push(q)
      return mql(q)
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  h.queries = []
  h.listeners.clear()
  h.lastSubscribe = null
  h.lastCleanup = null
})

describe('useIsTablet — rentang 600–1023 px', () => {
  it('membaca snapshot dari matchMedia dengan query rentang tablet', () => {
    stubWindow({ [TABLET_QUERY]: true })
    expect(useIsTablet()).toBe(true)
    expect(new Set(h.queries)).toEqual(new Set([TABLET_QUERY]))
  })

  it('false ketika lebar layar di luar rentang tablet', () => {
    stubWindow({ [TABLET_QUERY]: false })
    expect(useIsTablet()).toBe(false)
  })

  it('berlangganan event change dan berhenti lewat cleanup', () => {
    stubWindow({})
    useIsTablet()
    expect(h.lastSubscribe).toBeTypeOf('function')
    const cb = vi.fn()
    const unsub = h.lastSubscribe!(cb)
    expect(h.listeners.get(TABLET_QUERY)!.has(cb)).toBe(true)
    unsub()
    expect(h.listeners.get(TABLET_QUERY)!.has(cb)).toBe(false)
  })

  it('snapshot mengikuti nilai matchMedia saat viewport berubah', () => {
    const matches: Record<string, boolean> = {}
    stubWindow(matches)
    expect(useIsTablet()).toBe(false)
    matches[TABLET_QUERY] = true
    expect(useIsTablet()).toBe(true)
  })

  it('callback langganan dipanggil saat MediaQueryList mengirim change', () => {
    stubWindow({})
    useIsTablet()
    const cb = vi.fn()
    h.lastSubscribe!(cb)
    for (const listener of h.listeners.get(TABLET_QUERY)!) listener()
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('useIsPhone — di bawah 600 px', () => {
  it('membaca snapshot dengan query ponsel', () => {
    stubWindow({ [PHONE_QUERY]: true })
    expect(useIsPhone()).toBe(true)
    expect(new Set(h.queries)).toEqual(new Set([PHONE_QUERY]))
  })

  it('false pada lebar layar ponsel PC/desktop', () => {
    stubWindow({})
    expect(useIsPhone()).toBe(false)
  })
})

describe('batas rentang ponsel dan tablet tidak tumpang tindih', () => {
  it('maks ponsel tepat satu piksel di bawah minimum tablet', () => {
    const maxPhone = Number(PHONE_QUERY.match(/max-width:\s*(\d+)px/)![1])
    const minTablet = Number(TABLET_QUERY.match(/min-width:\s*(\d+)px/)![1])
    const maxTablet = Number(TABLET_QUERY.match(/max-width:\s*(\d+)px/)![1])
    expect(maxPhone).toBe(minTablet - 1)
    expect(minTablet).toBeLessThan(maxTablet)
  })

  it('query yang dipakai hook persis konstanta rentang di atas', () => {
    stubWindow({ [PHONE_QUERY]: true, [TABLET_QUERY]: false })
    useIsPhone()
    useIsTablet()
    expect([...new Set(h.queries)].sort()).toEqual([PHONE_QUERY, TABLET_QUERY].sort())
  })
})

describe('server dan render pertama', () => {
  it('selalu false dan tidak menyentuh matchMedia saat window belum ada', () => {
    // Node: global window belum didefinisikan — jalur getServerSnapshot.
    expect(useIsPhone()).toBe(false)
    expect(useIsTablet()).toBe(false)
    expect(h.queries).toEqual([])
    expect(h.lastSubscribe).toBeNull()
  })
})
