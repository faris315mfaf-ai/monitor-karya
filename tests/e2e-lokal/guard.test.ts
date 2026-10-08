import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { assertLocalTarget } from './guard.mjs'

const good = () => ({ DATABASE_URL: 'postgresql://mk_local:test-only@127.0.0.1:54329/monitor_karya_local', DIRECT_URL: 'postgresql://mk_local:test-only@127.0.0.1:54329/monitor_karya_local', MK_E2E_ISOLATED: '1', MK_E2E_BASE_URL: 'http://127.0.0.1:3201' })
describe('CX14 menolak sasaran selain lingkungan khusus', () => {
  it('menerima namespace kontainer yang eksplisit', () => {
    expect(assertLocalTarget(good(), true).databaseName).toBe('monitor_karya_local')
  })
  it('port host 54329 bukan namespace kontainer', () => {
    expect(() => assertLocalTarget(good(), false)).toThrow(/host 54329/)
  })
  it.each([
    'postgresql://mk_local:test@db.example.test:5432/monitor_karya_local',
    'postgresql://mk_local:test@localhost.evil.test:54329/monitor_karya_local',
    'postgresql://mk_local:test@127.0.0.1:54339/monitor_karya_local',
    'postgresql://mk_local:test@127.0.0.1:54329/production',
    'postgresql://mk_local:test@127.0.0.1:54329/monitor_karya_local?host=remote.example.test',
    'postgresql://mk_local:test@127.0.0.1:54329/monitor_karya_local?pgbouncer=true',
    'postgresql://mk_local:test@127.0.0.1:54329/monitor_karya_local#proxy',
    'prisma://localhost:54329/monitor_karya_local',
    'postgresql://postgres:test@127.0.0.1:54329/monitor_karya_local',
  ])('flag apa pun tidak membuka target berbahaya %s', url => {
    expect(() => assertLocalTarget({ ...good(), DATABASE_URL: url, DIRECT_URL: url }, true)).toThrow()
  })
  it('DIRECT_URL juga diperiksa dan harus sama', () => {
    expect(() => assertLocalTarget({ ...good(), DIRECT_URL: 'postgresql://mk_local:test@remote.example.test:5432/monitor_karya_local' }, true)).toThrow()
    expect(() => assertLocalTarget({ ...good(), DIRECT_URL: good().DIRECT_URL.replace('54329', '55432') }, true)).toThrow(/identik/)
  })
  it.each(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'])('menolak proxy %s', key => {
    expect(() => assertLocalTarget({ ...good(), [key]: 'http://proxy.example.test:8080' }, true)).toThrow(/Proxy/)
  })
  it.each(['http://127.0.0.1:3200', 'http://127.0.0.1:3100', 'https://remote.example.test', 'http://127.0.0.1:3201/?proxy=remote', 'http://u:p@127.0.0.1:3201', 'http://127.0.0.1:3201/api'])('melindungi server/asal %s', url => {
    expect(() => assertLocalTarget({ ...good(), MK_E2E_BASE_URL: url }, true)).toThrow()
  })
  it('tidak membaca URL implisit atau melewati opt-in', () => {
    expect(() => assertLocalTarget({ ...good(), DATABASE_URL: '' }, true)).toThrow(/eksplisit/)
    expect(() => assertLocalTarget({ ...good(), MK_E2E_ISOLATED: '0' }, true)).toThrow(/ISOLATED/)
  })
  it('penolakan tidak membocorkan kata sandi', () => {
    const url = 'postgresql://secret-user:secret-password@remote.example.test:5432/prod'
    try { assertLocalTarget({ ...good(), DATABASE_URL: url }, true); throw Error('seharusnya ditolak') } catch (err) {
      expect(String(err)).not.toContain('secret-password')
      expect(String(err)).not.toContain('secret-user')
    }
  })
})

describe('preload waktu hanya di proses server uji', () => {
  it('mempertahankan constructor, pemanggilan Date(), own parse/UTC, dan waktu yang bergerak', () => {
    const env = { ...process.env, ...good(), DATABASE_URL: good().DATABASE_URL.replace('54329', '55432'), DIRECT_URL: good().DIRECT_URL.replace('54329', '55432'), MK_E2E_NOW: '2026-10-08T10:05:00.000Z' }
    for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[k as keyof typeof env]
    const r = spawnSync(process.execPath, ['--import', './tests/e2e-lokal/clock.mjs', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      assert(Object.hasOwn(Date,'parse')); assert(Object.hasOwn(Date,'UTC')); assert(Object.hasOwn(Date,'now'));
      assert.equal(Date.parse('2026-10-08T10:05:00.000Z'), Date.UTC(2026,9,8,10,5));
      assert.equal(new Date('2020-01-01').getUTCFullYear(), 2020);
      assert.equal(typeof Date(), 'string'); assert(new Date() instanceof Date);
      assert(new Date().toISOString().startsWith('2026-10-08T10:05:'));
      const first=Date.now(); await new Promise(r=>setTimeout(r,25)); assert(Date.now()>first);
      const Wrapped = Object.assign(function(...args) { return new Date(...args) }, Object.fromEntries(Object.getOwnPropertyNames(Date).filter(k=>['parse','UTC','now'].includes(k)).map(k=>[k,Date[k]])));
      assert.equal(Wrapped.parse('2020-01-01'), Date.parse('2020-01-01'));
    `], { encoding: 'utf8', env, timeout: 10_000 })
    expect(r.status, r.stderr).toBe(0)
  })
  it('proses biasa tidak berubah dan preload tanpa opt-in ditolak', () => {
    const r = spawnSync(process.execPath, ['--import', './tests/e2e-lokal/clock.mjs', '-e', 'process.exit(0)'], { env: { ...process.env, MK_E2E_ISOLATED: '0' }, encoding: 'utf8', timeout: 10_000 })
    expect(r.status).not.toBe(0); expect(r.stderr).toContain('MK_E2E_ISOLATED')
  })
})
