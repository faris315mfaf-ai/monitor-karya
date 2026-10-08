import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type Step = { method: string; path: string; status: number; expected: number; ms: number }
export type Scenario = { id: string; name: string; status: 'PASS' | 'FAIL' | 'EXTERNAL_PENDING'; steps: Step[]; evidence: string[]; error?: string }
export class Report {
  scenarios: Scenario[] = []
  current?: Scenario
  constructor(readonly phase: string, readonly runId: string) {}
  async scenario(id: string, name: string, fn: () => Promise<void>) {
    const s: Scenario = { id, name, status: 'PASS', steps: [], evidence: [] }
    this.scenarios.push(s); this.current = s
    try { await fn() } catch (err) {
      s.status = 'FAIL'
      s.error = err instanceof Error ? err.message : String(err)
    } finally { this.current = undefined }
    console.log(`${s.status} ${id} — ${name}${s.error ? `: ${s.error}` : ''}`)
  }
  evidence(message: string) { this.current?.evidence.push(message) }
  pending(id: string, name: string, reason: string) {
    this.scenarios.push({ id, name, status: 'EXTERNAL_PENDING', steps: [], evidence: [reason] })
  }
  get failed() { return this.scenarios.some(s => s.status === 'FAIL') }
  async save(path: string) {
    await mkdir(dirname(path), { recursive: true })
    const json = { runId: this.runId, phase: this.phase, generatedAt: new Date().toISOString(), passed: this.scenarios.filter(s => s.status === 'PASS').length, failed: this.scenarios.filter(s => s.status === 'FAIL').length, externalPending: this.scenarios.filter(s => s.status === 'EXTERNAL_PENDING').length, scenarios: this.scenarios }
    await writeFile(path, JSON.stringify(json, null, 2) + '\n', { mode: 0o600 })
    const human = [`CX14 ${this.phase} · ${this.runId}`, `${json.passed} lulus, ${json.failed} gagal, ${json.externalPending} verifikasi eksternal tertunda.`, ...this.scenarios.flatMap(s => [`\n${s.status} ${s.id} — ${s.name}`, ...s.steps.map(t => `  ${t.method} ${t.path}: ${t.status} (diharapkan ${t.expected})`), ...s.evidence.map(e => `  Bukti: ${e}`), ...(s.error ? [`  Galat: ${s.error}`] : [])])].join('\n') + '\n'
    await writeFile(path.replace(/\.json$/, '') + '.txt', human, { mode: 0o600 })
  }
}

/** Cookie hanya di memori; respons/login/password tidak disalin ke laporan. */
export class HttpActor {
  private cookie = ''
  constructor(readonly base: string, readonly report: Report) {}
  async request(method: string, path: string, body?: unknown, expected = 200): Promise<any> {
    assert(path.startsWith('/api/') || path === '/', 'Path HTTP harus relatif ke server uji')
    const url = new URL(path, this.base)
    assert.equal(url.origin, this.base, 'Origin lintas server ditolak')
    const start = performance.now()
    const res = await fetch(url, {
      method, redirect: 'manual', signal: AbortSignal.timeout(30_000),
      headers: { origin: this.base, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(this.cookie ? { cookie: this.cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    this.report.current?.steps.push({ method, path, status: res.status, expected, ms: Math.round(performance.now() - start) })
    // Rekam cookie yang diterbitkan aplikasi sungguhan, termasuk rotasi ganti sandi.
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(';', 1)[0]
      const name = pair.split('=', 1)[0]
      this.cookie = [...this.cookie.split('; ').filter(x => x && !x.startsWith(`${name}=`)), pair].join('; ')
    }
    const text = await res.text()
    let data: any
    try { data = text ? JSON.parse(text) : {} } catch { data = { nonJson: true } }
    // HTTP 500, redirect, assertion, dan galat jaringan selalu menggagalkan skenario.
    assert.equal(res.status, expected, `${method} ${path}: status ${res.status}; ${typeof data.error === 'string' ? data.error.slice(0, 300) : 'respons tidak sesuai'}`)
    if (res.headers.has('location')) data.location = res.headers.get('location')
    return data
  }
  async login(identifier: string, password: string) {
    const result = await this.request('POST', '/api/auth/login', { identifier, password })
    assert(this.cookie, 'Login harus menerbitkan cookie sesi')
    return result
  }
}

/** Query PT lain tetap memakai cakupan Admin sendiri; periksa isi, bukan hanya HTTP 200. */
export function assertFixtureComplianceScope(
  own: { divisions: { id: string; entityId: string }[]; totals: { expected: number; reported: number } },
  requested: typeof own,
  fixture: { entityId: string; divisionId: string; forbiddenIds: string[] },
) {
  assert.deepEqual(requested, own, 'Query PT luar harus identik dengan baseline PT sendiri, termasuk agregat')
  assert.deepEqual(requested.divisions.map(d => ({ id: d.id, entityId: d.entityId })), [
    { id: fixture.divisionId, entityId: fixture.entityId },
  ], 'Hanya divisi dan entitas milik fixture boleh terbaca')
  assert.equal(requested.totals.expected, 1, 'Cakupan fixture hanya satu PIC wajib lapor')
  assert.equal(requested.totals.reported, 1, 'Satu PIC fixture telah melaporkan ketiga proyek')
  const serialized = JSON.stringify(requested)
  for (const id of fixture.forbiddenIds) assert(!serialized.includes(id), `Data PT luar tidak boleh terbaca: ${id}`)
}
