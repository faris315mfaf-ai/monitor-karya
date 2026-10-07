import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer, type Server } from 'node:http'

const exec = promisify(execFile)
const root = process.cwd()
let dir: string
const env = () => ({ ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, TEST_DIR: dir })
const script = (name: string, contents: string) => writeFileSync(join(dir, 'bin', name), `#!/usr/bin/env bash\n${contents}\n`, { mode: 0o700 })
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mk-operational-')); mkdirSync(join(dir, 'bin')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('backup wrapper exit semantics with offline command fixtures', () => {
  beforeEach(() => {
    // Only relocate the fixed recipient file. Every backup command is substituted; no DB/remote exists.
    const source = readFileSync(resolve(root, 'deploy/db-vps/backup.sh'), 'utf8')
      .replace('RECIPIENT_FILE="/etc/pg-backup/recipient.txt"', 'RECIPIENT_FILE="$TEST_DIR/recipient.txt"')
    writeFileSync(join(dir, 'backup.sh'), source)
    writeFileSync(join(dir, 'recipient.txt'), 'offline-recipient')
    writeFileSync(join(dir, 'report-backup.py'), `import os,sys\nwith open(os.environ['TEST_DIR']+'/reports','a') as out: out.write(sys.argv[1]+'\\n')\nsys.exit(1 if os.environ.get('REPORT_FAIL') in ('all',sys.argv[1]) else 0)\n`)
    script('timeout', 'shift; exec "$@"')
    script('realpath', 'printf "%s\\n" "${@: -1}"')
    script('sudo', `shift 2
case "$1" in
  psql) printf '%s\\n' "\${TEST_DATABASE:-monitor_karya}" ;;
  pg_dumpall) printf 'offline globals' ;;
  pg_dump) printf 'offline dump'; exit "\${DUMP_EXIT:-0}" ;;
  *) exit 99 ;;
esac`)
    script('age', 'cat')
    script('sha256sum', 'echo "offline-checksum"')
    script('rclone', '[[ "$1" != copy ]] || exit "${COPY_EXIT:-0}"; exit 0')
    script('find', 'exit 0')
  })
  const run = (overrides: Record<string, string> = {}) => spawnSync('bash', [join(dir, 'backup.sh')], {
    env: { ...env(), LOCAL_DIR: join(dir, 'backups'), REMOTE: 'offline:fixture',
      BACKUP_REPORT_URL: 'http://127.0.0.1:1/api/health/backup', BACKUP_REPORT_SECRET_FILE: join(dir, 'unused'),
      BACKUP_REQUIRED_DATABASE: 'monitor_karya', ...overrides }, encoding: 'utf8', timeout: 10000,
  })
  const reports = () => readFileSync(join(dir, 'reports'), 'utf8').trim().split('\n')
  it('reports success only after the full backup and offsite copy succeed', () => {
    expect(run().status).toBe(0); expect(reports()).toEqual(['running', 'success'])
  })
  it.each(['DUMP_EXIT', 'COPY_EXIT'])('preserves original %s failure even if failure reporting also fails', name => {
    expect(run({ [name]: '23', REPORT_FAIL: 'failure' }).status).toBe(23)
    expect(reports()).toEqual(['running', 'failure'])
  })
  it('returns 70 on report failure following a successful backup', () => {
    expect(run({ REPORT_FAIL: 'success' }).status).toBe(70)
    expect(reports()).toEqual(['running', 'success'])
  })
  it('still attempts backup when the initial report fails and preserves its failure', () => {
    expect(run({ REPORT_FAIL: 'all', DUMP_EXIT: '19' }).status).toBe(19)
    expect(reports()).toEqual(['running'])
  })
  it('does not report success for another application database', () => {
    expect(run({ TEST_DATABASE: 'other_app' }).status).toBe(1)
    expect(reports()).toEqual(['running', 'failure'])
  })
  it('requires an explicit application database when reporting is enabled', () => {
    expect(run({ BACKUP_REQUIRED_DATABASE: '' }).status).toBe(1)
    expect(reports()).toEqual(['running', 'failure'])
  })
  it('keeps the legacy backup usable without optional reporting configuration', () => {
    expect(run({ BACKUP_REPORT_URL: '', BACKUP_REPORT_SECRET_FILE: '' }).status).toBe(0)
  })
})

describe('monitor/cron scripts reject false HTTP successes', () => {
  const healthy = () => ({ ok: true, checks: { database: true, storage: true, storageStatus: 'ok' },
    jobs: ['reminder-rules', 'remind-divisions', 'kpi-snapshot', 'backup'].map(job => ({ job, ok: true, status: 'success' })) })
  beforeEach(() => {
    script('docker', 'shift; [[ "$1" != -i ]] || shift; shift; exec "$@"')
    writeFileSync(join(dir, 'fetch.mjs'), `globalThis.fetch = async () => new Response(process.env.TEST_BODY, {status: Number(process.env.TEST_STATUS || '200')});`)
  })
  const run = (path: string, body: unknown, status = 200) => spawnSync('bash', [resolve(root, path), 'kpi-snapshot'], {
    env: { ...env(), OPS_HEALTH_SECRET: 'offline-operational-secret-at-least-32', CRON_SECRET: 'offline-cron-secret-at-least-16',
      NODE_OPTIONS: `--import=${join(dir, 'fetch.mjs')}`, TEST_BODY: JSON.stringify(body), TEST_STATUS: String(status) },
    encoding: 'utf8', timeout: 10000,
  })
  it('accepts only a complete healthy monitoring response', () => {
    expect(run('deploy/app-vps/monitor.sh', healthy()).status).toBe(0)
  })
  it.each(['degraded', 'configmissing'])('rejects storage %s even when DB readiness is healthy', storageStatus => {
    const body = healthy(); body.checks.storage = false; body.checks.storageStatus = storageStatus
    const result = run('deploy/app-vps/monitor.sh', body)
    expect(result.status).toBe(1); expect(result.stderr).toContain(storageStatus)
  })
  it('rejects a missing job even if top-level ok incorrectly says true', () => {
    const body = healthy(); body.jobs.pop()
    const result = run('deploy/app-vps/monitor.sh', body)
    expect(result.status).toBe(1); expect(result.stderr).toContain('backup: invalid')
  })
  it('rejects an HTTP error with a healthy-looking JSON body', () => {
    expect(run('deploy/app-vps/monitor.sh', healthy(), 503).status).toBe(1)
  })
  it('rejects malformed HTTP-200 bodies without printing their private contents', () => {
    const result = run('deploy/app-vps/monitor.sh', 'private-provider-detail')
    expect(result.status).toBe(1); expect(result.stderr).not.toContain('private-provider-detail')
  })
  it('cron rejects HTTP 200 with ok false', () => {
    expect(run('deploy/app-vps/cron.sh', { ok: false, secret: 'private-provider-detail' }).status).toBe(1)
    expect(run('deploy/app-vps/cron.sh', { ok: true }).status).toBe(0)
  })
})

describe('backup HTTP reporter against loopback fixture only', () => {
  let server: Server | undefined
  afterEach(async () => { if (server) await new Promise<void>(done => server!.close(() => done())); server = undefined })
  const run = (url: string, overrides: Record<string, string> = {}) => {
    const file = join(dir, 'secret'); writeFileSync(file, 'offline-backup-secret-at-least-32chars', { mode: 0o600 })
    return exec('python3', [resolve(root, 'deploy/db-vps/report-backup.py'), 'success', 'a1234567-1234-4123-8123-123456789abc'], {
      env: { ...env(), BACKUP_REPORT_URL: url, BACKUP_REPORT_SECRET_FILE: file, ...overrides }, timeout: 5000,
    })
  }
  const start = async (status: number, body: string) => {
    const calls: { path?: string; authorization?: string; body: string }[] = []
    server = createServer((req, res) => {
      let data = ''; req.on('data', chunk => { data += chunk })
      req.on('end', () => {
        calls.push({ path: req.url, authorization: req.headers.authorization, body: data })
        res.writeHead(status, { 'Content-Type': 'application/json', Location: '/redirect-target' }); res.end(body)
      })
    })
    await new Promise<void>(done => server!.listen(0, '127.0.0.1', done))
    const address = server!.address() as { port: number }
    return { url: `http://127.0.0.1:${address.port}/api/health/backup`, calls }
  }
  it('sends only the fixed status/runId payload with the private token', async () => {
    const fixture = await start(200, '{"ok":true}')
    await expect(run(fixture.url)).resolves.toMatchObject({ stdout: '', stderr: '' })
    expect(JSON.parse(fixture.calls[0].body)).toEqual({ status: 'success', runId: 'a1234567-1234-4123-8123-123456789abc' })
    expect(fixture.calls[0].authorization).toBe('Bearer offline-backup-secret-at-least-32chars')
  })
  it.each([[200, '{"ok":false}'], [503, 'private-provider-error'], [302, '{"ok":true}'], [200, 'x'.repeat(1025)]])('rejects status %s without leaking the body', async (status, body) => {
    const fixture = await start(status as number, body as string)
    await expect(run(fixture.url)).rejects.toMatchObject({ code: 1, stderr: expect.not.stringContaining('private-provider-error') })
    expect(fixture.calls).toHaveLength(1)
  })
  it.each(['http://external.invalid/api/health/backup', 'https://user:secret@external.invalid/api/health/backup', 'https://external.invalid/api/health/backup?token=secret'])('refuses unsafe URL before networking', async url => {
    await expect(run(url)).rejects.toMatchObject({ code: 1 })
  })
})
