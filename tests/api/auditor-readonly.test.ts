import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F2-GRUP] Auditor benar-benar hanya-baca (08-auditor.md): setiap route API
 * yang punya POST/PUT/PATCH/DELETE dipanggil sebagai AUDITOR dengan beberapa
 * badan permintaan, dan tidak satu pun boleh menulis ke basis data atau
 * menjawab 2xx. Daftar route dibaca dari disk saat tes berjalan, jadi route
 * baru otomatis ikut diperiksa.
 *
 * Basis data diganti Proxy: baca mengembalikan baris contoh yang masuk akal
 * (supaya pemeriksaan hak benar-benar tercapai, bukan berhenti di 404),
 * tulis dicatat. Tidak ada koneksi keluar.
 */

const ROOT = join(__dirname, '..', '..', 'src', 'app', 'api')

/** Route yang memang boleh menulis untuk akun sendiri, atau bukan berbasis sesi. */
const ALLOWED: Record<string, string> = {
  'auth/activate:POST': 'aktivasi sebelum sesi, dibuktikan token sekali pakai pada activation.test.ts',
  'health/backup:POST': 'pelapor cadangan memakai BACKUP_REPORT_SECRET, bukan peran; diuji operational-health.test.ts',
  'auth/login:POST': 'masuk (sebelum ada sesi)',
  'auth/logout:POST': 'keluar dari sesi sendiri',
  'profile:PATCH': 'mengubah profil sendiri',
  'profile/password:POST': 'mengganti kata sandi sendiri',
  'notifications:PATCH': 'menandai notifikasi sendiri sudah dibaca',
}
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

const writes: string[] = []
const reads: string[] = []
const WRITE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'])

function sampleRow(): Record<string, unknown> {
  const now = new Date()
  const entity = { id: 'pt-a', name: 'PT Contoh', code: 'PTA', type: 'PT', path: '/h/pt-a/', isActive: true, parentId: 'h' }
  const project = {
    id: 'p-1', name: 'Proyek', code: 'P1', entityId: 'pt-a', picUserId: 'u-pic', divisionId: 'd-1', lifecycle: 'AKTIF',
    targetEndDate: now, startDate: now, approvalChain: [], entity,
  }
  return {
    id: 'row-1', entityId: 'pt-a', projectId: 'p-1', divisionId: 'd-1', userId: 'u-other', picUserId: 'u-pic',
    actorId: 'u-other', headUserId: 'u-head', requestedById: 'u-other', proposedById: 'u-other', authorId: 'u-other', ownerId: 'u-pic',
    raisedById: 'u-other', targetUserId: 'u-other', weeklyReportId: 'wr-1', reviewerId: null,
    status: 'DIAJUKAN', statusHeader: 'MENUNGGU_PERSETUJUAN', lifecycle: 'AKTIF', role: 'PIC_PROYEK', type: 'PT',
    kind: 'HARIAN', isActive: true, isLocked: false, isLate: false, enabled: true, scope: 'HARIAN',
    reportDate: now, workDate: now, date: now, createdAt: now, updatedAt: now, at: now, submittedAt: null, forwardedAt: null,
    periodStart: now, periodEnd: now, isoYear: 2026, isoWeek: 41, startDate: now, endDate: now, dueDate: now,
    name: 'Contoh', title: 'Contoh', code: 'C1', path: '/h/pt-a/', email: 'contoh@contoh.test', username: 'contoh',
    targetType: 'DAILY_REPORT', targetId: 'row-1', payload: '{}', params: null, reason: 'Alasan contoh yang cukup panjang',
    approvalChain: [], approvals: [], items: [], tasks: [], subtasks: [], divisions: [], members: [],
    scopeEntityId: 'pt-a', passwordHash: null, progressPct: 10, evidenceCount: 0, amount: null,
    entity, project, division: { id: 'd-1', name: 'Keuangan', entityId: 'pt-a', headUserId: 'u-head', isActive: true, entity },
    weeklyReport: { id: 'wr-1', divisionId: 'd-1', entityId: 'pt-a', statusHeader: 'DRAFT', periodStart: now, isoYear: 2026, isoWeek: 41, isLocked: false },
    _count: { _all: 0 },
  }
}

function model(name: string) {
  return new Proxy(
    {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
    {
      get(_t, op: string) {
        return async (...args: unknown[]) => {
          if (!WRITE_OPS.has(op)) reads.push(`${name}.${op}`)
          if (WRITE_OPS.has(op)) {
            writes.push(`${name}.${op}`)
            return op.endsWith('Many') ? { count: 1 } : sampleRow()
          }
          if (op === 'findMany' || op === 'groupBy') return []
          if (op === 'count') return 0
          if (op === 'aggregate') return { _count: { _all: 0 }, _max: {}, _min: {}, _sum: {}, _avg: {} }
          if (op === 'findUnique' || op === 'findFirst' || op === 'findUniqueOrThrow' || op === 'findFirstOrThrow') return { ...sampleRow(), id: (args[0] as { where?: { id?: string } } | undefined)?.where?.id ?? 'row-1' }
          void args
          return null
        }
      },
    }
  )
}

const mocks = vi.hoisted(() => ({ user: { value: null as unknown } }))

vi.mock('@/lib/db', () => {
  const db: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === '$transaction') {
          return async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as Promise<unknown>[]))
        }
        if (key === '$executeRaw' || key === '$executeRawUnsafe') {
          return async () => {
            writes.push(`db.${key}`)
            return 1
          }
        }
        if (key === '$queryRaw' || key === '$queryRawUnsafe') return async () => []
        if (key === 'then') return undefined
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
}))

const AUDITOR: SessionUser = {
  id: 'auditor-1',
  name: 'Yusuf Pratama',
  email: 'auditor@contoh.test',
  role: 'AUDITOR',
  scopeEntityId: null,
  avatarColor: null,
  mustChangePassword: false,
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

// Hanya aksi sah: 400 akibat aksi rekaan tidak membuktikan otorisasi.
const ROUTE_ACTIONS: Record<string, string[]> = {
  'unlock-requests': ['approve', 'reject', 'execute', 'relock'],
  'approval-requests': ['approve', 'reject', 'withdraw', 'reopen', 'undo'],
  'access-requests': ['approve', 'reject'],
  'outputs/review': ['accept', 'revise', 'accept-all', 'undo'],
  'outputs': ['submit', 'withdraw'],
  'deadline-proposals': ['approve', 'reject'],
  'escalations/actions': ['review', 'decide', 'close'],
  'work-desk': ['remind-all-pics'],
  'kadiv/team': ['read', 'unread', 'remind'],
  'kadiv/weekly-summary': ['send', 'unsend'],
}

function body(action: string | undefined): Record<string, unknown> {
  return {
    ...(action ? { action } : {}),
    id: 'row-1', projectId: 'p-1', entityId: 'pt-a', divisionId: 'd-1', reportId: 'row-1', weeklyReportId: 'wr-1',
    targetType: 'DAILY_REPORT', targetId: 'row-1', type: 'AKUN_BARU', decision: 'DISETUJUI', status: 'SELESAI',
    reason: 'Alasan contoh yang cukup panjang', note: 'Catatan contoh', body: 'Isi catatan', title: 'Judul contoh',
    name: 'Nama Contoh', role: 'PIC_PROYEK', kind: 'HARIAN', enabled: false, token: 'tok', password: 'rahasia-sekali-123',
    payload: { name: 'Akun Baru', role: 'PIC_PROYEK' }, achievementToday: 'Capaian', progressPct: 50, items: [],
    cadence: 'BULANAN', ids: ['row-1'], order: ['row-1'], fileName: 'Bukti', url: 'https://contoh.test/bukti', text: 'Catatan contoh', userId: 'u-other', memberIds: ['u-other'], itemId: 'row-1', workDate: '2026-10-06', reportDate: '2026-10-06', proposedDate: '2027-01-01', week: '2026-W41',
  }
}

const files = routeFiles(ROOT)
  .map((f) => ({ file: f, key: relative(ROOT, f).replace(/\/route\.ts$/, '').replace(/\\/g, '/') }))
  .filter(({ file, key }) => METHODS.some((method) =>
    !(`${key}:${method}` in ALLOWED) && new RegExp(`export async function ${method}\\(`).test(readFileSync(file, 'utf8'))))

function assertDenied(res: Response, expected: number) {
  expect(res.status, 'Harus penolakan akses tepat, bukan validasi/crash').toBe(expected)
  expect(writes, 'DB maupun fetch dilarang sebelum penolakan').toEqual([])
}

async function checkHandler(handler: () => Promise<Response>, expected = 403) {
  const res = await handler() // exception sengaja tidak ditangkap
  assertDenied(res, expected)
  return res
}

describe('AUDITOR hanya-baca di semua route tulis', () => {
  const realFetch = globalThis.fetch
  beforeAll(() => {
    globalThis.fetch = vi.fn(async () => {
      writes.push('fetch')
      throw new Error('tidak ada jaringan di tes')
    }) as unknown as typeof fetch
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => {
    vi.useRealTimers()
    globalThis.fetch = realFetch
  })
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T02:00:00Z'))
    mocks.user.value = AUDITOR
    writes.length = 0
    reads.length = 0
  })

  it('inventaris benar-benar memuat handler tulis, bukan hanya route baca', async () => {
    const discovered: string[] = []
    const exercised: string[] = []
    for (const { file, key } of files) {
      const source = readFileSync(file, 'utf8')
      for (const method of METHODS) {
        if (!(`${key}:${method}` in ALLOWED) && new RegExp(`export async function ${method}\\(`).test(source)) discovered.push(`${key}:${method}`)
      }
      const mod = await import(file)
      for (const method of METHODS) {
        if (!(`${key}:${method}` in ALLOWED) && typeof mod[method] === 'function') exercised.push(`${key}:${method}`)
      }
    }
    expect(exercised.sort()).toEqual(discovered.sort())
    expect(exercised.length).toBeGreaterThan(50)
    expect(exercised).toContain('evidence/upload:POST')
    expect(exercised).toContain('tasks:PATCH')
    for (const endpoint of Object.keys(ALLOWED)) {
      const [key, method] = endpoint.split(':')
      const mod = await import(join(ROOT, key, 'route.ts'))
      expect(typeof mod[method], endpoint).toBe('function')
    }
  }, 30000)

  it.each([200, 400, 404, 409, 422, 500])('harness menggagalkan handler rusak yang menjawab %s', async (status) => {
    await expect(checkHandler(async () => Response.json({ error: 'rusak' }, { status }))).rejects.toThrow()
  })

  it('harness menggagalkan exception yang dahulu dianggap 500 aman', async () => {
    await expect(checkHandler(async () => { throw new Error('rusak') })).rejects.toThrow('rusak')
  })

  it('harness menggagalkan fetch walau handler menangkap galat dan menjawab 403', async () => {
    await expect(checkHandler(async () => {
      await fetch('https://contoh.test').catch(() => null)
      return Response.json({ error: 'Ditolak' }, { status: 403 })
    })).rejects.toThrow()
  })

  it('harness menggagalkan tulis DB walau akhirnya menjawab 403', async () => {
    await expect(checkHandler(async () => {
      await model('project').update({})
      return Response.json({ error: 'Ditolak' }, { status: 403 })
    })).rejects.toThrow()
  })

  for (const { file, key } of files) {
    it(`/api/${key}`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mod = (await import(file)) as Record<string, unknown>
      const methods = METHODS.filter((m) => !(`${key}:${m}` in ALLOWED) && typeof mod[m] === 'function')
      for (const method of methods) {
        for (const action of (ROUTE_ACTIONS[key] ?? [undefined])) {
          writes.length = 0
          reads.length = 0
          const url = `http://localhost/api/${key.replace(/\[(\w+)\]/g, 'row-1')}?id=row-1&projectId=p-1&entityId=pt-a${action ? `&action=${action}` : ''}`
          const data = { ...body(action), ...(key === 'attendance' ? { status: 'HADIR' } : {}), points: ['Capaian minggu ini'] }
          const multipart = key === 'evidence/upload' || key === 'approval-requests/berkas'
          const form = new FormData()
          if (multipart) {
            form.set('file', new File(['bukti'], 'bukti.txt', { type: 'text/plain' }))
            form.set('id', 'row-1')
            form.set('targetType', 'DAILY_REPORT')
            form.set('targetId', 'row-1')
          }
          const req = new NextRequest(url, {
            method,
            body: multipart ? form : JSON.stringify(data),
            headers: { ...(multipart ? {} : { 'content-type': 'application/json' }), 'user-agent': 'vitest', origin: 'http://localhost', host: 'localhost' },
          })
          const handler = mod[method] as (r: NextRequest, ctx: unknown) => Promise<Response>
          // Exception gagal langsung; jangan menyulap crash menjadi penolakan akses.
          const expected = ['undo', 'approval-requests/berkas', 'weekly-comments', 'project-reviews'].includes(key) &&
            (key === 'undo' || key === 'approval-requests/berkas' || method === 'DELETE' || key === 'weekly-comments') ? 404 : 403
          await checkHandler(() => handler(req, { params: Promise.resolve({ id: 'row-1' }) }), expected)
          if (expected === 404) {
            // Bukan objek hilang: fixture ada dan query pencarian benar-benar tercapai.
            const modelName = key === 'undo' ? 'undoToken' : key === 'approval-requests/berkas' ? 'approvalRequest' :
              key === 'project-reviews' ? 'projectReview' : method === 'DELETE' ? 'weeklyReportComment' : 'weeklyDivisionReport'
            expect(reads).toContain(`${modelName}.findUnique`)
          }
        }
      }
    })
  }
})
