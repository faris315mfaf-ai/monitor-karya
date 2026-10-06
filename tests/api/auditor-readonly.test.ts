import { readdirSync, statSync } from 'node:fs'
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
  'auth/login': 'masuk (sebelum ada sesi)',
  'auth/logout': 'keluar dari sesi sendiri',
  'profile': 'mengubah profil sendiri',
  'profile/password': 'mengganti kata sandi sendiri',
  'notifications': 'menandai notifikasi sendiri sudah dibaca',
}
const SKIP_PREFIX = ['cron/'] // dilindungi CRON_SECRET, bukan sesi

const writes: string[] = []
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
    headUserId: 'u-head', requestedById: 'u-other', proposedById: 'u-other', authorId: 'u-other', ownerId: 'u-pic',
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
    {},
    {
      get(_t, op: string) {
        return async (...args: unknown[]) => {
          if (WRITE_OPS.has(op)) {
            writes.push(`${name}.${op}`)
            return op.endsWith('Many') ? { count: 1 } : sampleRow()
          }
          if (op === 'findMany' || op === 'groupBy') return []
          if (op === 'count') return 0
          if (op === 'aggregate') return { _count: { _all: 0 }, _max: {}, _min: {}, _sum: {}, _avg: {} }
          if (op === 'findUnique' || op === 'findFirst' || op === 'findUniqueOrThrow' || op === 'findFirstOrThrow') return sampleRow()
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

const ACTIONS = [undefined, 'approve', 'reject', 'submit', 'forward', 'execute', 'relock', 'decide', 'review', 'close', 'remind', 'remind-all-pics', 'undo', 'withdraw']

function body(action: string | undefined): Record<string, unknown> {
  return {
    ...(action ? { action } : {}),
    id: 'row-1', projectId: 'p-1', entityId: 'pt-a', divisionId: 'd-1', reportId: 'row-1', weeklyReportId: 'wr-1',
    targetType: 'DAILY_REPORT', targetId: 'row-1', type: 'AKUN_BARU', decision: 'DISETUJUI', status: 'SELESAI',
    reason: 'Alasan contoh yang cukup panjang', note: 'Catatan contoh', body: 'Isi catatan', title: 'Judul contoh',
    name: 'Nama Contoh', role: 'PIC_PROYEK', kind: 'HARIAN', enabled: false, token: 'tok', password: 'rahasia-sekali-123',
    payload: { name: 'Akun Baru', role: 'PIC_PROYEK' }, achievementToday: 'Capaian', progressPct: 50, items: [],
    workDate: '2026-10-06', reportDate: '2026-10-06', proposedDate: '2027-01-01', week: '2026-W41',
  }
}

const files = routeFiles(ROOT)
  .map((f) => ({ file: f, key: relative(ROOT, f).replace(/\/route\.ts$/, '').replace(/\\/g, '/') }))
  .filter(({ key }) => !SKIP_PREFIX.some((p) => key.startsWith(p)) && !(key in ALLOWED))

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
    globalThis.fetch = realFetch
  })
  beforeEach(() => {
    mocks.user.value = AUDITOR
    writes.length = 0
  })

  it('menemukan route untuk diperiksa', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  for (const { file, key } of files) {
    it(`/api/${key}`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mod = (await import(file)) as Record<string, unknown>
      const methods = ['POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => typeof mod[m] === 'function')
      const failures: string[] = []
      for (const method of methods) {
        for (const action of ACTIONS) {
          writes.length = 0
          const url = `http://localhost/api/${key.replace(/\[(\w+)\]/g, 'row-1')}?id=row-1&projectId=p-1&entityId=pt-a${action ? `&action=${action}` : ''}`
          const req = new NextRequest(url, {
            method,
            body: method === 'DELETE' && action ? undefined : JSON.stringify(body(action)),
            headers: { 'content-type': 'application/json', 'user-agent': 'vitest', origin: 'http://localhost', host: 'localhost' },
          })
          let status = 0
          try {
            const handler = mod[method] as (r: NextRequest, ctx: unknown) => Promise<Response>
            const res = await handler(req, { params: Promise.resolve({ id: 'row-1' }) })
            status = res.status
          } catch {
            status = 500 // galat sebelum menulis = tidak menulis
          }
          const wrote = writes.filter((w) => w !== 'fetch')
          if (wrote.length || (status >= 200 && status < 300)) {
            failures.push(`${method} action=${action ?? '-'} → ${status} ${wrote.join(', ')}`)
          }
        }
      }
      expect(failures).toEqual([])
    })
  }
})
