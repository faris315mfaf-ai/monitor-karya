/* Monitor Karya — service worker "daring-duluan, singgah saat luring".
 *
 * Tujuan (keputusan pemilik 8 Okt 2026; penyempurnaan privasi 10 Okt 2026,
 * temuan T10-AUD4): aplikasi tetap TERBUKA dan halaman yang terakhir dibuka
 * tetap TERBACA saat koneksi putus sesaat. Tulis (POST/PUT/PATCH/DELETE)
 * selalu ke jaringan — tanpa antrean, karena tenggat 17.00 WIB, pembekuan
 * laporan, dan konflik 409 wajib divalidasi server saat kirim.
 *
 * Strategi:
 *  - Navigasi: daring-duluan (timeout 5 dtk) → cache halaman → /luring.html.
 *  - Aset statis (_next/static, ikon, logo): stale-while-revalidate.
 *  - Respons API TIDAK PERNAH di-cache dan tidak disajikan dari simpanan:
 *    /api/* membawa data pengguna (PII) yang tidak boleh menetap di
 *    CacheStorage lintas sesi/pengguna. Versi mk-sw-v1 pernah meng-cache
 *    respons API; rotasi nama versi ke v2 membuat cache lama itu terhapus
 *    otomatis saat SW baru aktif.
 *  - Pesan { type: 'CLEAR_CACHES' } dari klien (dikirim saat logout) menghapus
 *    semua cache SW di perangkat.
 */
const VERSI = 'mk-sw-v2'
const CACHE_STATIS = `${VERSI}-statis`
const CACHE_API = `${VERSI}-api`
const TIMEOUT_DARING = 5000

const PRA_CACHE = ['/luring.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/logo.svg']

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

/* Logout: klien meminta semua simpanan dihapus agar tidak ada sisa data
 * pengguna di perangkat bersama (respons API memang sudah tidak di-cache;
 * ini membersihkan sisa versi lama dan cache statis halaman). */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_CACHES') return
  event.waitUntil(
    (async () => {
      await caches.delete(CACHE_API)
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    })()
  )
})

function daringDenganTimeout(request, ms) {
  return Promise.race([
    fetch(request),
    new Promise((_, tolak) => setTimeout(() => tolak(new Error('timeout-daring')), ms)),
  ])
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

  if (req.mode === 'navigate') {
    event.respondWith(navHandler(event))
    return
  }
  // Semua /api/* dibiarkan langsung ke jaringan: responsnya berisi data
  // pengguna dan tidak boleh disimpan atau disajikan ulang lintas sesi.
  if (url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/_next/') || PRA_CACHE.includes(url.pathname)) {
    event.respondWith(statisHandler(event))
  }
})
