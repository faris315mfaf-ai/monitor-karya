import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Guard khusus alat data contoh; bukan pembatas skrip operator produksi. */
export function requireLocalDatabase(env: NodeJS.ProcessEnv = process.env, action = 'Seed'): string {
  const localPort = env.LOCAL_DB_PORT ?? '54329'
  const fail = (message: string): never => { throw new Error(`${action} ditolak: ${message}`) }
  if (!['54329', '54339'].includes(localPort)) fail('LOCAL_DB_PORT hanya boleh 54329 atau 54339.')
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) fail('DATABASE_URL lokal wajib diisi.')
  // Daftar izin sengaja sempit: host/hostaddr/port/options/service bisa
  // mengalihkan koneksi walaupun hostname pada URL terlihat loopback.
  const allowedParams = new Set(['schema', 'connection_limit', 'connect_timeout', 'pool_timeout', 'sslmode', 'pgbouncer'])
  for (const [name, value] of [['DATABASE_URL', databaseUrl], ['DIRECT_URL', env.DIRECT_URL]] as const) {
    if (value === undefined) continue
    let url: URL
    try { url = new URL(value) } catch { return fail(`${name} tidak sah.`) }
    const keys = [...url.searchParams.keys()]
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.port !== localPort || url.pathname !== '/monitor_karya_local'
      || url.hash || keys.some(key => !allowedParams.has(key))
      || new Set(keys).size !== keys.length
      || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
      fail(`${name} harus menunjuk monitor_karya_local di localhost:${localPort} tanpa pengalihan koneksi.`)
    }
  }
  return databaseUrl!
}

/** --url menghindari pemilihan datasource dari schema/.env oleh Prisma CLI. */
export function seedLocalSql(env: NodeJS.ProcessEnv = process.env): number {
  const databaseUrl = requireLocalDatabase(env, 'Seed SQL')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const result = spawnSync(process.execPath, [
    resolve(root, 'node_modules/prisma/build/index.js'),
    'db', 'execute', '--file', resolve(root, 'prisma/seed.sql'), '--url', databaseUrl,
  ], {
    cwd: root, stdio: 'inherit',
    env: { ...env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
  })
  if (result.error) throw new Error('Seed SQL gagal menjalankan Prisma lokal.')
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== 'seed-sql' || process.argv.length !== 3) {
      throw new Error('Pemakaian: tsx scripts/guard-db-lokal.ts seed-sql')
    }
    process.exitCode = seedLocalSql()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Seed SQL ditolak.')
    process.exitCode = 1
  }
}
