import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(), ctor: vi.fn(), findMany: vi.fn(), update: vi.fn(), upsert: vi.fn(),
  entity: vi.fn(), disconnect: vi.fn(),
}))
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawnSync: (...args: unknown[]) => mocks.spawn(...args) ?? Reflect.apply(actual.spawnSync, undefined, args) }
})
vi.mock('@prisma/client', () => ({ PrismaClient: class {
  constructor(options: unknown) { mocks.ctor(options) }
  user = { findMany: mocks.findMany, update: mocks.update, upsert: mocks.upsert }
  entity = { findUnique: mocks.entity, findFirst: mocks.entity }
  division = { findFirst: async () => null }
  project = { findFirst: async () => null }
  $disconnect = mocks.disconnect
} }))
// Baseline's shared client is also intercepted: no test can connect to a DB.
vi.mock('../../src/lib/db', () => ({ db: {
  user: { findMany: mocks.findMany, update: mocks.update, upsert: mocks.upsert },
  entity: { findUnique: mocks.entity, findFirst: mocks.entity },
  division: { findFirst: async () => null }, project: { findFirst: async () => null },
  $disconnect: mocks.disconnect,
} }))
vi.mock('../../src/lib/password', () => ({ hashPassword: async () => 'test-hash' }))

const local = 'postgresql://test:test@127.0.0.1:54329/monitor_karya_local'
let errors: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mocks.spawn.mockReset()
  vi.stubEnv('DATABASE_URL', local); vi.stubEnv('DIRECT_URL', local)
  vi.stubEnv('LOCAL_DB_PORT', '54329'); vi.stubEnv('SEED_PASSWORD', 'test-password')
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.findMany.mockResolvedValue([{ id: 'u', email: 'test@example.invalid', username: 'test', role: 'PIC_PROYEK' }])
  mocks.update.mockResolvedValue({}); mocks.upsert.mockResolvedValue({ id: 'u' })
  mocks.entity.mockResolvedValue({ id: 'pt' }); mocks.disconnect.mockResolvedValue(undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function load(script: string) {
  if (script === 'set-passwords') await import('../../scripts/set-passwords')
  else await import('../../scripts/demo-accounts')
}

describe('legacy account scripts, with every DB operation mocked', () => {
  for (const script of ['set-passwords', 'demo-accounts']) {
    it.each(['remote', 'direct', 'query', 'missing'])(`${script} rejects %s before Prisma or queries`, async kind => {
      if (kind === 'remote') vi.stubEnv('DATABASE_URL', local.replace('127.0.0.1', 'example.invalid'))
      if (kind === 'direct') vi.stubEnv('DIRECT_URL', local.replace('127.0.0.1', 'example.invalid'))
      if (kind === 'query') vi.stubEnv('DATABASE_URL', local + '?host=example.invalid')
      if (kind === 'missing') vi.stubEnv('DATABASE_URL', '')
      await load(script)
      await vi.waitFor(() => expect(errors).toHaveBeenCalled())
      expect(String(errors.mock.calls[0])).toContain('ditolak:')
      expect(mocks.ctor).not.toHaveBeenCalled()
      expect(mocks.findMany).not.toHaveBeenCalled(); expect(mocks.entity).not.toHaveBeenCalled()
    })
    it(`${script} pins the validated URL and requires password change`, async () => {
      await load(script)
      await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalled())
      expect(errors).not.toHaveBeenCalled()
      expect(mocks.ctor).toHaveBeenCalledWith({ datasources: { db: { url: local } } })
      const writes = script === 'set-passwords' ? mocks.update.mock.calls : mocks.upsert.mock.calls
      expect(writes.length).toBeGreaterThan(0)
      for (const [write] of writes) {
        if (script === 'set-passwords') expect(write.data.mustChangePassword).toBe(true)
        else { expect(write.create.mustChangePassword).toBe(true); expect(write.update.mustChangePassword).toBe(true) }
      }
    })
  }
})

it('SQL package entry runs the guard wrapper, never Prisma directly', () => {
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  expect(pkg.scripts['db:seed:sql']).toBe('tsx scripts/guard-db-lokal.ts seed-sql')
})

it('SQL wrapper subprocess rejects routing before launching SQL', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/guard-db-lokal.ts'), 'seed-sql'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, DATABASE_URL: local + '?host=example.invalid', DIRECT_URL: local, LOCAL_DB_PORT: '54329' },
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('ditolak:')
  expect(result.stderr).not.toContain('Environment variables loaded')
})


it('SQL execution receives only the pinned URL, without schema/env URL selection', async () => {
  const { seedLocalSql } = await import('../../scripts/guard-db-lokal')
  mocks.spawn.mockReturnValue({ status: 0 })
  expect(seedLocalSql({ ...process.env, DATABASE_URL: local, DIRECT_URL: local.replace('127.0.0.1', 'localhost') })).toBe(0)
  const [command, args, options] = mocks.spawn.mock.calls[0]
  expect(command).toBe(process.execPath)
  expect(args).toContain('--url')
  expect(args[args.indexOf('--url') + 1]).toBe(local)
  expect(args).not.toContain('--schema')
  expect(options.env.DATABASE_URL).toBe(local)
  expect(options.env.DIRECT_URL).toBe(local)
  expect(options.shell).toBeUndefined()
})

it.each(['host', 'hostaddr', 'port', 'options', 'service', 'sslcert', 'schema=other'])('SQL rejects query override %s before spawning', async key => {
  const { seedLocalSql } = await import('../../scripts/guard-db-lokal')
  const query = key.includes('=') ? key : `${key}=example.invalid`
  expect(() => seedLocalSql({ ...process.env, DATABASE_URL: local + '?' + query })).toThrow('ditolak:')
  expect(mocks.spawn).not.toHaveBeenCalled()
})

it.each(['seed', 'seed-sql', 'migrasi', 'naik', 'turun', 'ulang'])('shell rejects unsafe URL before %s can launch Docker or Prisma', action => {
  const result = spawnSync('bash', ['scripts/db-lokal.sh', action], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, DATABASE_URL: local + '?host=example.invalid', DIRECT_URL: local, LOCAL_DB_PORT: '54329' },
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('ditolak:')
})

it.each(['set-passwords', 'demo-accounts'])('%s subprocess accepts local guard then stops at weak password before loading Prisma', script => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve(`scripts/${script}.ts`)], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, DATABASE_URL: local, DIRECT_URL: local, LOCAL_DB_PORT: '54329', SEED_PASSWORD: 'weak' },
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('SEED_PASSWORD minimal 8 karakter.')
  expect(result.stderr).not.toContain('ditolak:')
})
