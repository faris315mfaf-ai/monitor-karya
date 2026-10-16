import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

/**
 * PWA (KONTRAK-FASE1-PWA.md C.1–C.3): manifest model subholding, viewport
 * `interactive-widget`, dan service worker v3 yang dijalankan di kotak pasir
 * dengan CacheStorage/fetch tiruan:
 *  - /_next/static/* cache-duluan (tidak ke jaringan bila tersimpan);
 *  - ikon/logo tetap stale-while-revalidate;
 *  - /api/* tidak pernah disadap atau disimpan;
 *  - navigasi luring → /luring.html; CLEAR_CACHES menghapus lalu memasang ulang pra-cache.
 */

const root = process.cwd()
const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'))
const swSource = readFileSync(join(root, 'public/sw.js'), 'utf8')

describe('manifest', () => {
  it('deskripsi model subholding, theme_color tetap', () => {
    expect(manifest.description).toBe('Laporan subholding PT BIKE Tbk: lapor, setujui, pantau.')
    expect(manifest.theme_color).toBe('#f5f5f7')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/login')
  })

  it('pintasan Tambah laporan & Persetujuan menggantikan pintasan lama', () => {
    const s = manifest.shortcuts as { name: string; url: string }[]
    expect(s.map((x) => [x.name, x.url])).toEqual([
      ['Tambah laporan', '/?tab=sh-dashboard'],
      ['Persetujuan', '/?tab=sh-review'],
    ])
  })
})

describe('viewport', () => {
  it('keyboard virtual mengubah ukuran isi (interactive-widget=resizes-content)', () => {
    const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8')
    const block = layout.slice(layout.indexOf('export const viewport'), layout.indexOf('export default'))
    expect(block).toMatch(/interactiveWidget:\s*["']resizes-content["']/)
    expect(block).toMatch(/viewportFit:\s*["']cover["']/)
  })
})

/* ---------- Kotak pasir service worker ---------- */

type Res = { status: number; type: string; body: string; clone: () => Res }
const mkRes = (body: string, status = 200): Res => {
  const r: Res = { status, type: 'basic', body, clone: () => mkRes(body, status) }
  return r
}

function sandbox(opts: { online?: boolean } = {}) {
  const store = new Map<string, Map<string, Res>>()
  const fetched: string[] = []
  const listeners: Record<string, (e: unknown) => void> = {}
  const origin = 'https://monitorkarya.tech'
  const keyOf = (r: string | { url: string }) => {
    const u = new URL(typeof r === 'string' ? r : r.url, origin)
    return u.pathname + u.search
  }
  const openCache = (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    const m = store.get(name)!
    return {
      match: async (req: string | { url: string }) => m.get(keyOf(req)),
      put: async (req: string | { url: string }, res: Res) => void m.set(keyOf(req), res),
      addAll: async (urls: string[]) => urls.forEach((u) => m.set(keyOf(u), mkRes(`pra:${u}`))),
      keys: async () => [...m.keys()].map((k) => ({ url: origin + k })),
      delete: async (req: string | { url: string }) => m.delete(keyOf(req)),
    }
  }
  const caches = {
    open: async (name: string) => openCache(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (req: string | { url: string }) => {
      for (const m of store.values()) {
        const hit = m.get(keyOf(req))
        if (hit) return hit
      }
      return undefined
    },
  }
  const fetchFn = async (req: string | { url: string }) => {
    fetched.push(keyOf(req))
    if (opts.online === false) throw new TypeError('Failed to fetch')
    return mkRes(`net:${keyOf(req)}`)
  }
  const self = {
    location: { origin },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn
    },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  }
  runInNewContext(swSource, {
    self, caches, fetch: fetchFn, URL, Response: { error: () => mkRes('galat', 0) }, setTimeout, Promise, Error,
  })

  async function lifecycle(type: 'install' | 'activate' | 'message', data?: unknown) {
    const waits: Promise<unknown>[] = []
    listeners[type]({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
  }

  async function request(path: string, init: { method?: string; mode?: string } = {}) {
    const box: { responded: Promise<Res> | null } = { responded: null }
    const waits: Promise<unknown>[] = []
    listeners.fetch({
      request: { url: origin + path, method: init.method ?? 'GET', mode: init.mode ?? 'no-cors' },
      respondWith: (p: Promise<Res>) => {
        box.responded = p
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    })
    const res = box.responded ? await box.responded : null
    await Promise.all(waits)
    return { intercepted: box.responded !== null, res }
  }

  return { store, fetched, lifecycle, request }
}

describe('service worker v3', () => {
  it('versi dinaikkan ke mk-sw-v3 dan cache v2 dibuang saat aktif', async () => {
    expect(swSource).toContain("const VERSI = 'mk-sw-v3'")
    const sw = sandbox()
    sw.store.set('mk-sw-v2-statis', new Map([['/lama.js', mkRes('lama')]]))
    sw.store.set('mk-sw-v1-api', new Map([['/api/me', mkRes('pii')]]))
    await sw.lifecycle('install')
    await sw.lifecycle('activate')
    expect([...sw.store.keys()]).toEqual(['mk-sw-v3-statis'])
    expect(sw.store.get('mk-sw-v3-statis')!.has('/luring.html')).toBe(true)
  })

  it('/_next/static/* cache-duluan: jaringan sekali, berikutnya dari simpanan', async () => {
    const sw = sandbox()
    await sw.lifecycle('install')
    const a = await sw.request('/_next/static/chunks/app-abc123.js')
    expect(a.intercepted).toBe(true)
    expect(a.res?.body).toBe('net:/_next/static/chunks/app-abc123.js')
    expect(sw.store.get('mk-sw-v3-statis')!.has('/_next/static/chunks/app-abc123.js')).toBe(true)

    sw.fetched.length = 0
    const b = await sw.request('/_next/static/chunks/app-abc123.js')
    expect(b.res?.body).toBe('net:/_next/static/chunks/app-abc123.js')
    expect(sw.fetched).toEqual([]) // tanpa revalidasi
  })

  it('ikon/logo tetap stale-while-revalidate (sajikan simpanan, perbarui di latar)', async () => {
    const sw = sandbox()
    await sw.lifecycle('install')
    const r = await sw.request('/logo.svg')
    expect(r.res?.body).toBe('pra:/logo.svg')
    await new Promise((ok) => setTimeout(ok, 0))
    expect(sw.fetched).toContain('/logo.svg')
    expect(sw.store.get('mk-sw-v3-statis')!.get('/logo.svg')?.body).toBe('net:/logo.svg')
  })

  it('/api/* tidak pernah disadap maupun disimpan', async () => {
    const sw = sandbox()
    await sw.lifecycle('install')
    for (const p of ['/api/me', '/api/sh/reports?tab=x', '/api/evidence/signed']) {
      const r = await sw.request(p)
      expect(r.intercepted).toBe(false)
    }
    for (const m of sw.store.values()) {
      expect([...m.keys()].some((k) => k.startsWith('/api/'))).toBe(false)
    }
  })

  it('tulis (POST) dan asal lain tidak disadap', async () => {
    const sw = sandbox()
    expect((await sw.request('/_next/static/x.js', { method: 'POST' })).intercepted).toBe(false)
  })

  it('navigasi luring → /luring.html; HTML tidak disimpan', async () => {
    const sw = sandbox({ online: false })
    await sw.lifecycle('install')
    const r = await sw.request('/?tab=sh-review', { mode: 'navigate' })
    expect(r.res?.body).toBe('pra:/luring.html')
    for (const m of sw.store.values()) expect(m.has('/?tab=sh-review')).toBe(false)
  })

  it('/_next/static luring tanpa simpanan → Response.error', async () => {
    const sw = sandbox({ online: false })
    await sw.lifecycle('install')
    const r = await sw.request('/_next/static/chunks/baru.js')
    expect(r.res?.status).toBe(0)
  })

  it('CLEAR_CACHES menghapus semua cache lalu memasang ulang pra-cache', async () => {
    const sw = sandbox()
    await sw.lifecycle('install')
    await sw.request('/_next/static/chunks/a.js')
    await sw.lifecycle('message', { type: 'CLEAR_CACHES' })
    const statis = sw.store.get('mk-sw-v3-statis')!
    expect(statis.has('/_next/static/chunks/a.js')).toBe(false)
    expect(statis.has('/luring.html')).toBe(true)
  })

  it('cache statis dibatasi; aset pra-cache tidak ikut dipangkas', async () => {
    const sw = sandbox()
    await sw.lifecycle('install')
    const max = Number(/const MAKS_STATIS = (\d+)/.exec(swSource)?.[1])
    expect(max).toBeGreaterThan(0)
    for (let i = 0; i < max + 5; i++) await sw.request(`/_next/static/chunks/c${i}.js`)
    const statis = sw.store.get('mk-sw-v3-statis')!
    expect(statis.size).toBeLessThanOrEqual(max)
    expect(statis.has('/luring.html')).toBe(true)
    expect(statis.has('/_next/static/chunks/c0.js')).toBe(false)
    expect(statis.has(`/_next/static/chunks/c${max + 4}.js`)).toBe(true)
  })

  it('kebijakan privasi tetap tertulis di kepala berkas', () => {
    expect(swSource).toMatch(/TIDAK PERNAH di-cache/)
    expect(swSource).toMatch(/CLEAR_CACHES/)
    expect(swSource).toMatch(/luring\.html/)
  })
})
