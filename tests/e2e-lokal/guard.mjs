import { existsSync } from 'node:fs'

const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
/**
 * Semua pemeriksaan selesai sebelum membuka koneksi atau menyiapkan fixture.
 * @param {Record<string, string | undefined>} env
 * @param {boolean} inContainer
 */
export function assertLocalTarget(env = process.env, inContainer = existsSync('/.dockerenv')) {
  if (env.MK_E2E_ISOLATED !== '1') throw new Error('Setel MK_E2E_ISOLATED=1 untuk lingkungan uji terisolasi.')
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    if (env[key]) throw new Error(`Proxy ${key} dilarang untuk E2E lokal.`)
  }
  function database(raw, key) {
    if (!raw) throw new Error(`${key} wajib eksplisit; berkas .env tidak dimuat.`)
    let u
    try { u = new URL(raw) } catch { throw new Error(`${key} tidak valid.`) }
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !loopback.has(u.hostname)) throw new Error(`${key} harus PostgreSQL loopback.`)
    if (u.search || u.hash) throw new Error(`${key} tidak boleh memiliki query/proxy/fragmen.`)
    if (u.pathname !== '/monitor_karya_local') throw new Error(`${key} hanya untuk basis data khusus monitor_karya_local.`)
    if (!u.port || u.port === '54339') throw new Error(`${key} wajib port khusus; 54339 adalah DB persisten.`)
    if (u.port === '54329' && !inContainer) throw new Error('Port host 54329 bukan DB uji. Jalankan di namespace kontainer E2E.')
    if (u.username !== 'mk_local' || !u.password) throw new Error(`${key} wajib pengguna uji mk_local dan kata sandi eksplisit.`)
    return u
  }
  const db = database(env.DATABASE_URL, 'DATABASE_URL')
  const direct = database(env.DIRECT_URL, 'DIRECT_URL')
  if (db.href !== direct.href) throw new Error('DATABASE_URL dan DIRECT_URL harus menunjuk target identik.')
  let base
  try { base = new URL(env.MK_E2E_BASE_URL || '') } catch { throw new Error('MK_E2E_BASE_URL wajib eksplisit.') }
  if (base.protocol !== 'http:' || !loopback.has(base.hostname) || !['3201', '3202'].includes(base.port) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Server E2E harus origin HTTP loopback port 3201/3202, tanpa kredensial atau query.')
  }
  return { databaseUrl: db.href, databaseName: 'monitor_karya_local', databasePort: Number(db.port), baseUrl: base.origin }
}
