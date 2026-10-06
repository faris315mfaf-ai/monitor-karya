import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth'

/*
 * [F3-D] Aturan kerja no. 7: route API tidak boleh mengembalikan err.message
 * mentah pada 500 (docs/KEAMANAN.md, src/lib/api-error.ts). Setiap handler
 * dipanggil sebagai Super Admin (semua hak, seluruh grup) sementara basis data
 * melempar galat yang membawa nama tabel/kolom. Jawaban apa pun tidak boleh
 * memuat penanda itu. Daftar route dibaca dari disk, jadi route baru ikut.
 */

const ROOT = join(__dirname, '..', '..', 'src', 'app', 'api')
const SECRET = 'relation "RahasiaInternal" column "passwordHash" does not exist'
const MARK = 'RahasiaInternal'

const mocks = vi.hoisted(() => ({ user: { value: null as unknown } }))

vi.mock('@/lib/db', () => {
  const boom = async () => {
    throw new Error('relation "RahasiaInternal" column "passwordHash" does not exist')
  }
  const model = new Proxy({}, { get: () => boom })
  const db: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === 'then') return undefined
        if (key === '$transaction' || key.startsWith('$')) return boom
        return model
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

const files = routeFiles(ROOT).map((f) => ({ file: f, key: relative(ROOT, f).replace(/\/route\.ts$/, '').replace(/\\/g, '/') }))

describe('500 tanpa err.message mentah', () => {
  const realFetch = globalThis.fetch
  beforeAll(() => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error(SECRET)
    }) as unknown as typeof fetch
    process.env.CRON_SECRET = 'rahasia-cron-uji-yang-cukup-panjang-1234567890'
  })
  afterAll(() => {
    globalThis.fetch = realFetch
  })
  beforeEach(() => {
    mocks.user.value = SUPER
  })

  it('menemukan route untuk diperiksa', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  for (const { file, key } of files) {
    it(`/api/${key}`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mod = (await import(file)) as Record<string, unknown>
      const leaks: string[] = []
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (typeof mod[method] !== 'function') continue
        const url = `http://localhost/api/${key.replace(/\[(\w+)\]/g, 'row-1')}?id=row-1&projectId=p-1&entityId=pt-a&divisionId=d-1&weeklyReportId=wr-1&q=gudang&date=2026-10-06&week=2026-W41`
        const req = new NextRequest(url, {
          method,
          body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({
            id: 'row-1', projectId: 'p-1', entityId: 'pt-a', divisionId: 'd-1', weeklyReportId: 'wr-1', reportId: 'row-1',
            action: 'approve', decision: 'approve', type: 'PINDAH_PERAN', targetType: 'DAILY_REPORT', targetId: 'row-1',
            reason: 'Alasan contoh yang cukup panjang', note: 'Catatan', body: 'Isi', title: 'Judul contoh', name: 'Nama',
            status: 'ON_PROGRESS', achievementToday: 'Capaian', kind: 'HARIAN', enabled: false, token: 'tok_abc',
            payload: { userId: 'u-1', role: 'PIC_PROYEK', days: 2 },
          }),
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.CRON_SECRET}`,
            'x-cron-secret': process.env.CRON_SECRET!,
            origin: 'http://localhost',
            host: 'localhost',
          },
        })
        let text = ''
        let status = 0
        try {
          const handler = mod[method] as (r: NextRequest, ctx: unknown) => Promise<Response>
          const res = await handler(req, { params: Promise.resolve({ id: 'row-1' }) })
          status = res.status
          text = await res.text()
        } catch {
          continue // dilempar ke Next: klien hanya menerima 500 umum tanpa isi
        }
        if (text.includes(MARK)) leaks.push(`${method} → ${status}`)
      }
      expect(leaks).toEqual([])
    })
  }
})
