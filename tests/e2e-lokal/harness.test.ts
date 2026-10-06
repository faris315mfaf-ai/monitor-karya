import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertFixtureComplianceScope, HttpActor, Report } from './harness'

let server: Server
let base: string
beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/auth/login') { res.setHeader('set-cookie', 'session=fixture-secret; HttpOnly; Path=/'); res.end('{}') }
    else if (req.url === '/api/fail') { res.statusCode = 500; res.end('{"error":"Galat uji sengaja"}') }
    else if (req.url === '/api/redirect') { res.statusCode = 302; res.setHeader('location', 'https://example.test'); res.end('{}') }
    else { res.end(JSON.stringify({ cookieReceived: req.headers.cookie === 'session=fixture-secret' })) }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw Error('Port uji belum tersedia')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(() => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())))

describe('Laporan HTTP nyata tidak mengabaikan kegagalan', () => {
  it('500 menggagalkan skenario; skenario berikutnya tetap menghasilkan bukti; JSON dan teks tanpa cookie', async () => {
    const report = new Report('before', 'unit-report')
    const actor = new HttpActor(base, report)
    await report.scenario('gagal', 'HTTP 500 sengaja', async () => { await actor.request('GET', '/api/fail') })
    await report.scenario('lulus', 'Cookie sesi sungguhan', async () => {
      await actor.login('uji', 'never-report-this-password')
      expect((await actor.request('GET', '/api/me')).cookieReceived).toBe(true)
    })
    expect(report.failed).toBe(true)
    expect(report.scenarios.map(s => s.status)).toEqual(['FAIL', 'PASS'])
    expect(report.scenarios[0].steps[0].status).toBe(500)
    const dir = await mkdtemp(join(tmpdir(), 'cx14-harness-'))
    try {
      const path = join(dir, 'report.json'); await report.save(path)
      const json = await readFile(path, 'utf8'); const human = await readFile(join(dir, 'report.txt'), 'utf8')
      expect(JSON.parse(json).failed).toBe(1); expect(human).toContain('FAIL gagal')
      for (const text of [json, human]) { expect(text).not.toContain('fixture-secret'); expect(text).not.toContain('never-report-this-password') }
    } finally { await rm(dir, { recursive: true }) }
  })
  it('redirect eksternal tidak diikuti dan tidak bisa dianggap sukses', async () => {
    const report = new Report('before', 'redirect')
    await expect(new HttpActor(base, report).request('GET', '/api/redirect')).rejects.toThrow(/302/)
  })
  it('verifikasi eksternal belum selesai tidak dilaporkan PASS', () => {
    const report = new Report('before', 'pending')
    report.pending('storage', 'Supabase', 'Belum diotorisasi')
    expect(report.scenarios[0].status).toBe('EXTERNAL_PENDING')
  })
})

describe('Isolasi isi kepatuhan Admin dengan query PT luar', () => {
  const fixture = { entityId: 'own-pt', divisionId: 'own-division', forbiddenIds: ['foreign-pt', 'foreign-project', 'foreign-user'] }
  const body = () => ({ divisions: [{ id: 'own-division', entityId: 'own-pt' }], totals: { expected: 1, reported: 1 } })
  it('menerima respons identik yang tetap hanya berisi PT dan divisi sendiri', () => {
    expect(() => assertFixtureComplianceScope(body(), body(), fixture)).not.toThrow()
  })
  it('menolak kebocoran agregat meski baris divisi tidak berubah', () => {
    const leaked = body(); leaked.totals.expected = 2
    expect(() => assertFixtureComplianceScope(body(), leaked, fixture)).toThrow(/baseline PT sendiri/)
    expect(() => assertFixtureComplianceScope(leaked, leaked, fixture)).toThrow(/satu PIC wajib lapor/)
  })
  it('menolak baseline dan query yang sama-sama tercemar divisi atau entitas luar', () => {
    for (const row of [{ id: 'foreign-division', entityId: 'own-pt' }, { id: 'own-division', entityId: 'foreign-pt' }]) {
      const leaked = body(); leaked.divisions = [row]
      expect(() => assertFixtureComplianceScope(leaked, leaked, fixture)).toThrow(/Hanya divisi dan entitas/)
    }
  })
  it('menolak ID luar pada data bersarang meski divisi dan agregat tampak benar', () => {
    for (const id of fixture.forbiddenIds) {
      const leaked = { ...body(), nested: { missing: [{ id }] } }
      expect(() => assertFixtureComplianceScope(leaked, leaked, fixture)).toThrow(/Data PT luar/)
    }
  })
})
