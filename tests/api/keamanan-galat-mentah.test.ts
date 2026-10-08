import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { runInThisContext } from 'node:vm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F3-D] Aturan kerja no. 7: route API tidak boleh mengembalikan err.message
 * mentah pada 500 (docs/KEAMANAN.md, src/lib/api-error.ts). Setiap handler
 * dipanggil dengan peran dan payload sah untuk bisnisnya sementara basis data
 * melempar galat yang membawa nama tabel/kolom. Jawaban apa pun tidak boleh
 * memuat penanda itu. Query DB wajib terpicu; respons HTTP diuji lewat boundary
 * App Route Next yang terpasang (500 kosong), atau kontrak JSON 5xx eksplisit.
 * Daftar route dibaca dari disk, jadi route baru ikut.
 */

const ROOT = join(__dirname, '..', '..', 'src', 'app', 'api')
const SECRET = 'database RahasiaInternal passwordHash connection unexpectedly lost'
const MARK = 'RahasiaInternal'
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
// Tidak ada bisnis DB di dua handler ini setelah auth di-mock.
const NO_BUSINESS_DB = { 'auth/me': ['GET'], 'auth/logout': ['POST'], 'health': ['GET'] }

const mocks = vi.hoisted(() => ({ user: { value: null as unknown }, calls: [] as string[], failures: [] as Error[] }))

vi.mock('@/lib/db', () => {
  const boom = (path: string) => async () => {
    mocks.calls.push(path)
    const err = new Error(`database RahasiaInternal passwordHash connection unexpectedly lost; db=${path}`)
    mocks.failures.push(err)
    throw err
  }
  const model = (name: string) => new Proxy({}, { get: (_t, op: string) => boom(`${name}.${op}`) })
  const db: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === 'then') return undefined
        // Jalankan callback supaya yang gagal query bisnis, bukan pembungkus transaksi.
        if (key === '$transaction') return async (arg: unknown) =>
          typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as Promise<unknown>[])
        if (key.startsWith('$')) return boom(key)
        return model(key)
      },
    }
  )
  return { db }
})

vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  requireApiUser: vi.fn(async () => mocks.user.value),
  getSessionUser: vi.fn(async () => mocks.user.value),
  scopeEntityIds: vi.fn(async () => null),
  scopeUserIds: vi.fn(async () => null),
}))

const SUPER: SessionUser = {
  id: 'u-super', name: 'Sule Super', email: 'super@contoh.test', role: 'SUPERADMIN', scopeEntityId: null, avatarColor: null, mustChangePassword: false,
}

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...routeFiles(p))
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

const files = routeFiles(ROOT).map((f) => ({ file: f, key: relative(ROOT, f).replace(/\/route\.ts$/, '').replace(/\\/g, '/') })).filter(({ key }) => !(key in NO_BUSINESS_DB))

type ErrorContract = { status: number; error?: string; body?: Record<string, unknown> }
const ERROR_CONTRACTS: Record<string, ErrorContract> = {
  'auth/activate:POST': { status: 500, error: 'Aktivasi belum dapat diproses. Coba lagi.' },
  'health/ready:GET': { status: 503, body: { ok: false, status: 'unavailable' } },
  'health/internal:GET': { status: 503, body: { ok: false, error: 'Status operasional tidak tersedia' } },
  'health/backup:POST': { status: 503, body: { ok: false, error: 'Laporan belum tersimpan' } },
  'cron/kpi-snapshot:GET': { status: 503, body: { ok: false, error: 'Pekerjaan operasional gagal' } },
  'cron/remind-divisions:GET': { status: 503, body: { ok: false, error: 'Pekerjaan operasional gagal' } },
  'cron/reminder-rules:GET': { status: 503, body: { ok: false, error: 'Pekerjaan operasional gagal' } },
  'auth/login:POST': { status: 503, error: 'Database tidak terjangkau dari server ini.' },
  'approval-requests/berkas:GET': { status: 502, error: 'Tautan berkas belum bisa dibuat. Coba lagi.' },
  'approval-requests/berkas:POST': { status: 502, error: 'Berkas belum terunggah. Coba lagi.' },
}

/*
 * Memakai template transport Next asli, bukan catch buatan yang menganggap
 * exception sukses. Hanya discovery/config/cache di-stub: handler() template,
 * catch, onRequestError, NextRequestAdapter, dan sendResponse tetap kode Next.
 * HTTP loopback memakai port ephemeral; server dev 3200 tidak disentuh.
 */
let activeHandler: (() => Promise<Response>) | null = null
const boundaryErrors: unknown[] = []
const nativeRequire = createRequire(import.meta.url)
const templatePath = nativeRequire.resolve('next/dist/build/templates/app-route.js')
const templateRequire = createRequire(templatePath)
type BoundaryHandler = (req: IncomingMessage, res: ServerResponse, ctx: object) => Promise<void>
class FixtureRouteModule {
  isDev = false
  async prepare() {
    return {
      buildId: 'security-test', params: {},
      nextConfig: { experimental: { instantInsights: {} } },
      parsedUrl: {}, prerenderManifest: { routes: {}, dynamicRoutes: {}, preview: {} },
      resolvedPathname: '/api/security-test',
    }
  }
  async getIncrementalCache() { return undefined }
  async handle() {
    if (!activeHandler) throw new Error('Handler fixture belum dipasang')
    return activeHandler()
  }
  async handleResponse({ responseGenerator }: { responseGenerator: (arg: object) => Promise<unknown> }) {
    return responseGenerator({ previousCacheEntry: undefined })
  }
  async onRequestError(_req: unknown, err: unknown) { boundaryErrors.push(err) }
}
const templateSource = readFileSync(templatePath, 'utf8')
if (!templateSource.includes('// INJECT:nextConfigOutput')) throw new Error('Template Next berubah; harness perlu ditinjau')
function loadBoundary(source: string): BoundaryHandler {
  const fixtureModule: { exports: { handler?: BoundaryHandler } } = { exports: {} }
  const compile = runInThisContext(`(function(require, module, exports) {\n${source.replace('// INJECT:nextConfigOutput', 'const nextConfigOutput = undefined;')}\n})`, { filename: templatePath }) as
    (require: (id: string) => unknown, compiledModule: typeof fixtureModule, exports: object) => void
  compile((id) => id === '../../server/route-modules/app-route/module.compiled'
    ? { AppRouteRouteModule: FixtureRouteModule } : templateRequire(id), fixtureModule, fixtureModule.exports)
  if (!fixtureModule.exports.handler) throw new Error('Template Next tidak mengekspor handler')
  return fixtureModule.exports.handler
}
let nextBoundary = loadBoundary(templateSource)
const boundaryServer = createServer((req, res) => {
  // Kegagalan setup transport tidak boleh dijadikan 500 aman.
  void nextBoundary(req, res, {}).catch((err) => res.destroy(err))
})
let boundaryPort = 0

async function throughNextBoundary(handler: () => Promise<Response>) {
  activeHandler = handler
  boundaryErrors.length = 0
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: boundaryPort, path: '/api/security-test', method: 'GET', agent: false }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('error', reject)
      res.on('end', () => resolve({ status: res.statusCode!, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function checkFailure(handler: () => Promise<Response>, contract?: ErrorContract) {
  const { status, text } = await throughNextBoundary(handler)
  expect(mocks.calls.length, 'Kegagalan DB bisnis wajib tercapai').toBeGreaterThan(0)
  expect(status, text).toBe(contract?.status ?? 500)
  expect(text).not.toContain(MARK)
  expect(text).not.toContain('passwordHash')
  expect(text).not.toContain(SECRET)
  if (boundaryErrors.length) {
    // Hanya exception DB yang diinjeksi boleh membuktikan boundary 500 kosong.
    expect(contract).toBeUndefined()
    expect(text).toBe('')
    expect(boundaryErrors).toHaveLength(1)
    expect(mocks.failures).toContain(boundaryErrors[0])
  } else {
    const payload = JSON.parse(text) as { error?: unknown }
    if (contract?.body) {
      expect(payload).toEqual(contract.body)
      return
    }
    expect(typeof payload.error).toBe('string')
    expect((payload.error as string).length).toBeGreaterThan(0)
    if (contract) expect(payload).toEqual({ error: contract.error })
  }
}

describe('500 tanpa err.message mentah', () => {
  const realFetch = globalThis.fetch
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      boundaryServer.once('error', reject)
      boundaryServer.listen(0, '127.0.0.1', resolve)
    })
    const address = boundaryServer.address()
    if (!address || typeof address === 'string') throw new Error('Port boundary tidak tersedia')
    boundaryPort = address.port
    globalThis.fetch = vi.fn(async () => {
      throw new Error(SECRET)
    }) as unknown as typeof fetch
    vi.stubEnv('CRON_SECRET', 'rahasia-cron-uji-yang-cukup-panjang-1234567890')
    vi.stubEnv('OPS_HEALTH_SECRET', 'rahasia-ops-uji-yang-cukup-panjang-1234567890')
    vi.stubEnv('BACKUP_REPORT_SECRET', 'rahasia-backup-uji-yang-cukup-panjang-1234567890')
  })
  afterAll(async () => {
    activeHandler = null
    await new Promise<void>((resolve, reject) => boundaryServer.close((err) => err ? reject(err) : resolve()))
    vi.unstubAllEnvs()
    vi.useRealTimers()
    globalThis.fetch = realFetch
  })
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T02:00:00Z'))
    mocks.calls.length = 0
    mocks.failures.length = 0
    mocks.user.value = SUPER
  })

  it('semua ekspor handler DB berada dalam inventaris positif', async () => {
    const discovered: string[] = []
    const covered: string[] = []
    for (const { file, key } of files) {
      for (const method of METHODS) {
        if (new RegExp(`export async function ${method}\\(`).test(readFileSync(file, 'utf8'))) discovered.push(`${key}:${method}`)
      }
      const mod = await import(file)
      for (const method of METHODS) if (typeof mod[method] === 'function') covered.push(`${key}:${method}`)
    }
    expect(covered.sort()).toEqual(discovered.sort())
    expect(covered.length).toBeGreaterThan(100)
    for (const [key, methods] of Object.entries(NO_BUSINESS_DB)) {
      const mod = await import(join(ROOT, key, 'route.ts'))
      expect(METHODS.filter((method) => typeof mod[method] === 'function')).toEqual(methods)
    }
  }, 30000)

  it.each([200, 400, 404, 422, 502, 503])('harness menolak respons %s meski marker tidak bocor', async (status) => {
    mocks.calls.push('project.findMany')
    await expect(checkFailure(async () => Response.json({ error: 'umum' }, { status }))).rejects.toThrow()
  })

  it('harness menolak 500 palsu tanpa kegagalan DB bisnis', async () => {
    await expect(checkFailure(async () => Response.json({ error: 'umum' }, { status: 500 }))).rejects.toThrow()
  })

  it('harness menolak handler yang membocorkan galat DB', async () => {
    mocks.calls.push('project.findMany')
    await expect(checkFailure(async () => Response.json({ error: SECRET }, { status: 500 }))).rejects.toThrow()
  })

  it('harness menolak exception yang tidak berasal dari query DB fixture', async () => {
    await expect(checkFailure(async () => { throw new Error(SECRET) })).rejects.toThrow()
  })

  it('boundary Next asli mengirim 500 kosong untuk exception DB yang sama', async () => {
    const { db } = await import('@/lib/db')
    await checkFailure(async () => { await db.project.findMany(); throw new Error('DB seharusnya gagal') })
    expect(boundaryErrors).toHaveLength(1)
    expect(boundaryErrors[0]).toBe(mocks.failures[0])
  })

  it('harness menggagalkan mutasi boundary Next yang membocorkan exception', async () => {
    const empty500 = /new Response\(null, \{\s*status: 500\s*\}\)/
    expect(templateSource).toMatch(empty500)
    const original = nextBoundary
    nextBoundary = loadBoundary(templateSource.replace(empty500, 'new Response(String(err), { status: 500 })'))
    try {
      const { db } = await import('@/lib/db')
      await expect(checkFailure(async () => { await db.project.findMany(); throw new Error('DB seharusnya gagal') })).rejects.toThrow()
    } finally {
      nextBoundary = original
    }
  })

  it.each(Object.entries(ERROR_CONTRACTS))('harness memeriksa kontrak %s tepat', async (_endpoint, contract) => {
    mocks.calls.push('query-bisnis')
    await checkFailure(async () => Response.json(contract.body ?? { error: contract.error }, { status: contract.status }), contract)
    await expect(checkFailure(async () => Response.json({ error: 'pesan yang salah' }, { status: contract.status }), contract)).rejects.toThrow()
    await expect(checkFailure(async () => Response.json(contract.body ?? { error: contract.error }, { status: contract.status === 500 ? 503 : 500 }), contract)).rejects.toThrow()
  })

  it('harness menerima 500 aman sesudah kegagalan DB bisnis', async () => {
    const { db } = await import('@/lib/db')
    await checkFailure(async () => {
      try { await db.project.findMany() } catch { return Response.json({ error: 'Gagal memuat proyek' }, { status: 500 }) }
      throw new Error('DB tiruan seharusnya gagal')
    })
  })

  it.each([
    { key: 'companies', body: { name: '' }, error: 'Nama perusahaan wajib diisi.' },
    { key: 'companies/users', body: { entityId: null, role: 'PERAN_TIDAK_SAH' }, error: 'Posisi "PERAN_TIDAK_SAH" tidak dikenali.' },
  ])('validasi $key tetap 422 sebelum query DB', async ({ key, body, error }) => {
    const mod = await import(join(ROOT, key, 'route.ts'))
    const req = new NextRequest(`http://localhost/api/${key}`, {
      method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
    })
    const response = await throughNextBoundary(() => mod.POST(req))
    expect(response.status).toBe(422)
    expect(JSON.parse(response.text)).toEqual({ error })
    expect(mocks.calls).toEqual([])
    expect(boundaryErrors).toEqual([])
  })

  for (const { file, key } of files) {
    const sourceMethods = METHODS.filter((method) => new RegExp(`export async function ${method}\\(`).test(readFileSync(file, 'utf8')))
    for (const method of sourceMethods) it(`${method} /api/${key}`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mod = (await import(file)) as Record<string, unknown>
      expect(typeof mod[method]).toBe('function')
      const scoped = ['access-requests/options', 'admin/compliance/remind', 'work-desk'].includes(key)
      const pic = key === 'my-dashboard' || key === 'nav-badges' || (key === 'approval-requests' && method === 'POST')
      mocks.user.value = { ...SUPER, id: `security-${key}-${method}`, role: pic ? 'PIC_PROYEK' : scoped ? 'ADMIN_PT' : 'SUPERADMIN', scopeEntityId: scoped || pic ? 'pt-a' : null }
      const data: Record<string, unknown> = {
        id: 'row-1', projectId: 'p-1', entityId: 'pt-a', divisionId: 'd-1', weeklyReportId: 'wr-1', reportId: 'row-1',
        action: 'approve', decision: 'DISETUJUI', role: 'PIC_PROYEK', type: 'PINDAH_PERAN', targetType: 'DAILY_REPORT', targetId: 'row-1',
        reason: 'Alasan contoh yang cukup panjang', note: 'Catatan contoh', body: 'Isi catatan', title: 'Judul contoh', name: 'Nama',
        username: 'contoh', password: 'rahasia-123456', currentPassword: 'rahasia-123456', newPassword: 'baru-rahasia-123456',
        cadence: 'BULANAN', points: ['Capaian minggu ini'], workDate: '2026-10-06', reportDate: '2026-10-06', proposedDate: '2027-01-01',
        date: '2026-10-06', week: '2026-W41', fileName: 'Bukti', url: 'https://contoh.test/bukti',
        status: 'ON_PROGRESS', achievementToday: 'Capaian', kind: 'HARIAN', enabled: false, token: 'tok_abc',
        payload: { userId: 'u-1', role: 'PIC_PROYEK', days: 2 }, ids: ['row-1'], userId: 'u-other',
      }
      if (key === 'admin/compliance/remind') { delete data.divisionId; data.userId = 'u_other' }
      if (key === 'access-requests') data.decision = 'approve'
      if (key === 'attendance') data.status = 'HADIR'
      if (key === 'auth/activate') data.token = 'a'.repeat(43)
      if (key === 'health/backup') {
        for (const field of Object.keys(data)) delete data[field]
        Object.assign(data, { status: 'running', runId: '11111111-1111-4111-8111-111111111111' })
      }
      if (key === 'approval-requests') data.type = 'MATERI'
      if (key === 'kadiv/team') data.action = 'read'
      if (key === 'kadiv/weekly-summary') data.action = 'send'
      if (key === 'work-desk') data.action = 'remind-all-pics'
      if (key === 'escalations/actions') data.action = 'review'
      const multipart = key === 'evidence/upload' || key === 'approval-requests/berkas'
      const form = new FormData()
      if (multipart) {
        form.set('file', new File(['bukti'], 'bukti.txt', { type: 'text/plain' }))
        form.set('id', 'row-1')
        form.set('targetType', 'DAILY_REPORT')
        form.set('targetId', 'row-1')
      }
      const url = `http://localhost/api/${key.replace(/\[(\w+)\]/g, 'row-1')}?id=row-1&itemId=row-1&projectId=p-1&entityId=pt-a&divisionId=d-1&weeklyReportId=wr-1&q=gudang&date=2026-10-06&week=2026-W41&targetType=DAILY_REPORT&targetId=row-1&cadence=BULANAN`
      const req = new NextRequest(url, {
        method,
        body: method === 'GET' ? undefined : multipart ? form : JSON.stringify(data),
        headers: {
          ...(multipart ? {} : { 'content-type': 'application/json' }),
          authorization: `Bearer ${key === 'health/backup' ? process.env.BACKUP_REPORT_SECRET : key === 'health/internal' ? process.env.OPS_HEALTH_SECRET : process.env.CRON_SECRET}`,
          'x-cron-secret': process.env.CRON_SECRET!, origin: 'http://localhost', host: 'localhost',
        },
      })
      mocks.calls.length = 0
      const handler = mod[method] as (r: NextRequest, ctx: unknown) => Promise<Response>
      await checkFailure(() => handler(req, { params: Promise.resolve({ id: 'row-1' }) }), ERROR_CONTRACTS[`${key}:${method}`])
    })
  }
})
