import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const seedPath = resolve(process.cwd(), 'scripts/seed.ts')
const localUrl = (port = '54329', host = '127.0.0.1', database = 'monitor_karya_local') =>
  `postgresql://seed:seed@${host}:${port}/${database}`

type SeedEnv = { DATABASE_URL?: string; DIRECT_URL?: string; LOCAL_DB_PORT?: string }

function runGuard(overrides: SeedEnv) {
  const env = { ...process.env }
  delete env.DATABASE_URL
  delete env.DIRECT_URL
  delete env.LOCAL_DB_PORT
  // Always stop at password validation after an accepted guard, before any
  // Prisma client is constructed. No case can seed or open a DB connection.
  env.SEED_PASSWORD = 'weak'
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) env[key] = value
  }
  const result = spawnSync(process.execPath, ['--import', 'tsx', seedPath], {
    env, cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
  })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('Seeding business')
  return result.stderr
}

describe('seed local database guard (subprocess, no database connection)', () => {
  it.each([
    ['default port', { DATABASE_URL: localUrl() }],
    ['explicit default port', { DATABASE_URL: localUrl(), LOCAL_DB_PORT: '54329' }],
    ['alternate port', { DATABASE_URL: localUrl('54339'), LOCAL_DB_PORT: '54339' }],
    ['localhost on both URLs', { DATABASE_URL: localUrl('54339', 'localhost'), DIRECT_URL: localUrl('54339', 'localhost'), LOCAL_DB_PORT: '54339' }],
    ['mixed loopback hostnames', { DATABASE_URL: localUrl(), DIRECT_URL: localUrl('54329', 'localhost') }],
    ['allowed connection parameters', { DATABASE_URL: `${localUrl()}?schema=public&connection_limit=1` }],
  ] satisfies [string, SeedEnv][])('accepts %s then stops before Prisma at weak password validation', (_name, env) => {
    const stderr = runGuard(env)
    expect(stderr).not.toContain('Seed ditolak:')
    expect(stderr).toContain('SEED_PASSWORD minimal 8 karakter.')
  })

  it.each([
    ['missing database URL', {}],
    ['invalid URL', { DATABASE_URL: 'invalid' }],
    ['remote host', { DATABASE_URL: localUrl('54329', 'example.invalid') }],
    ['remote direct URL', { DATABASE_URL: localUrl(), DIRECT_URL: localUrl('54329', 'example.invalid') }],
    ['empty direct URL', { DATABASE_URL: localUrl(), DIRECT_URL: '' }],
    ['wrong protocol', { DATABASE_URL: localUrl().replace('postgresql:', 'https:') }],
    ['wrong port', { DATABASE_URL: localUrl('5432') }],
    ['alternate port requires explicit opt-in', { DATABASE_URL: localUrl('54339') }],
    ['default port with alternate configured', { DATABASE_URL: localUrl(), LOCAL_DB_PORT: '54339' }],
    ['direct URL port mismatch', { DATABASE_URL: localUrl('54339'), DIRECT_URL: localUrl(), LOCAL_DB_PORT: '54339' }],
    ['unsupported local port', { DATABASE_URL: localUrl('5432'), LOCAL_DB_PORT: '5432' }],
    ['empty local port', { DATABASE_URL: localUrl(), LOCAL_DB_PORT: '' }],
    ['wrong database name', { DATABASE_URL: localUrl('54329', 'localhost', 'postgres') }],
    ['wrong direct database name', { DATABASE_URL: localUrl(), DIRECT_URL: localUrl('54329', 'localhost', 'postgres') }],
    ['missing database name', { DATABASE_URL: localUrl('54329', 'localhost', '') }],
    ['encoded database name', { DATABASE_URL: localUrl('54329', 'localhost', '%6donitor_karya_local') }],
    ['routing query override', { DATABASE_URL: `${localUrl()}?host=example.invalid` }],
    ['direct routing query override', { DATABASE_URL: localUrl(), DIRECT_URL: `${localUrl()}?hostaddr=192.0.2.1` }],
  ] satisfies [string, SeedEnv][])('rejects %s before password validation or connection', (_name, env) => {
    const stderr = runGuard(env)
    expect(stderr).toContain('Seed ditolak:')
    expect(stderr).not.toContain('SEED_PASSWORD minimal')
  })
})
