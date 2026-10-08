/* Monitor Karya — service worker "daring-duluan, singgah saat luring".
 *
 * Tujuan (keputusan pemilik 8 Okt 2026): aplikasi tetap TERBUKA dan data yang
 * terakhir dimuat tetap TERBACA saat koneksi putus sesaat. Tulis (POST/PUT/
 * PATCH/DELETE) selalu ke jaringan — tanpa antrean, karena tenggat 17.00 WIB,
 * pembekuan laporan, dan konflik 409 wajib divalidasi server saat kirim.
 *
 * Strategi:
 *  - Navigasi: daring-duluan (timeout 5 dtk) → cache halaman → /luring.html.
 *  - GET /api/*: daring-duluan, simpan salinan 200 (maks 80 entri, buang
 *    tertua); saat luring sajikan salinan terakhir (data bisa lama — halaman
 *    menandainya lewat toast luring).
 *  - Aset statis (_next/static, ikon, logo): stale-while-revalidate.
 *  - Jangan pernah menyentuh /api/auth/*, /api/cron/*, /api/health*.
 */
const VERSI = 'mk-sw-v1'
const CACHE_STATIS = `${VERSI}-statis`
const CACHE_API = `${VERSI}-api`
const BATAS_API = 80
const TIMEOUT_DARING = 5000

const PRA_CACHE = ['/luring.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/logo.svg']

const JANGAN_CACHE_API = (path) =>
  path.startsWith('/api/auth/') || path.startsWith('/api/cron/') || path.startsWith('/api/health')

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIS).then((c) => c.addAll(PRA_CACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSI)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function daringDenganTimeout(request, ms) {
  return Promise.race([
    fetch(request),
    new Promise((_, tolak) => setTimeout(() => tolak(new Error('timeout-daring')), ms)),
  ])
}

async function cacheApiPut(request, response) {
  const cache = await caches.open(CACHE_API)
  await cache.put(request, response.clone())
  const keys = await cache.keys()
  if (keys.length > BATAS_API) {
    for (const k of keys.slice(0, keys.length - BATAS_API)) await cache.delete(k)
  }
}

async function navHandler(event) {
  try {
    const res = await daringDenganTimeout(event.request, TIMEOUT_DARING)
    return res
  } catch {
    const tersimpan = await caches.match(event.request, { ignoreSearch: true, ignoreVary: true })
    if (tersimpan) return tersimpan
    const luring = await caches.match('/luring.html')
    return luring || Response.error()
  }
}

async function apiHandler(event) {
  try {
    const res = await daringDenganTimeout(event.request, TIMEOUT_DARING)
    if (res && res.status === 200) event.waitUntil(cacheApiPut(event.request, res.clone()))
    return res
  } catch {
    const tersimpan = await caches.match(event.request, { ignoreVary: true })
    if (tersimpan) {
      // Tandai basi agar UI tahu data ini dari simpanan luring.
      const badan = await tersimpan.clone().json().catch(() => null)
      return new Response(JSON.stringify(badan ?? {}), {
        status: tersimpan.status,
        headers: { ...Object.fromEntries(tersimpan.headers.entries()), 'x-mk-dari-luring': '1', 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ error: 'Anda sedang luring dan data ini belum pernah dimuat.' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'x-mk-dari-luring': '1' },
    })
  }
}

async function statisHandler(event) {
  const cache = await caches.open(CACHE_STATIS)
  const tersimpan = await cache.match(event.request, { ignoreVary: true })
  const perbarui = fetch(event.request)
    .then((res) => {
      if (res && res.status === 200) cache.put(event.request, res.clone())
      return res
    })
    .catch(() => null)
  return tersimpan || (await perbarui) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (JANGAN_CACHE_API(url.pathname)) return

  if (req.mode === 'navigate') {
    event.respondWith(navHandler(event))
    return
  }
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiHandler(event))
    return
  }
  if (url.pathname.startsWith('/_next/') || PRA_CACHE.includes(url.pathname)) {
    event.respondWith(statisHandler(event))
  }
})
