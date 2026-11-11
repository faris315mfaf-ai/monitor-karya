import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import sharp from 'sharp'

/**
 * Unduh PDF Supervisor: GET /api/sh/pdf/ringkasan dan GET /api/sh/pdf/berkas.
 * Basis data tiruan di memori: tests/api/admin-fake-db.ts; storage dan fetch ditiru.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  storageConfigured: () => true,
  removeEvidence: async () => {},
  signedEvidenceUrl: async (key: string) => `https://signed.test/${key}`,
}))

import { AUTH_SECRET_FOR_TESTS, cookie, one, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { resetRate } from '@/lib/security'
import { parseWibDateKey } from '@/lib/lock'
import { GET as summaryGet } from '@/app/api/sh/pdf/ringkasan/route'
import { GET as bundleGet } from '@/app/api/sh/pdf/berkas/route'
import { pdfText } from '../lib/pdf-helpers'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

// Senin 9 Nov 2026 10.00 WIB.
const T0 = new Date('2026-11-09T03:00:00Z')
const DAY = (key: string) => parseWibDateKey(key)!

type Json = Record<string, any>

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}
const summary = (qs: string) => summaryGet(new NextRequest(`http://localhost/api/sh/pdf/ringkasan?${qs}`))
const bundle = (qs: string) => bundleGet(new NextRequest(`http://localhost/api/sh/pdf/berkas?${qs}`))
const json = async (res: Response) => (await res.json()) as Json
const body = async (res: Response) => Buffer.from(await res.arrayBuffer())

function seedReport(data: Json = {}): string {
  const [r] = seed('subholdingReport', [
    {
      subholdingId: 'sh-a',
      ptId: 'pt-a1',
      reportDate: DAY('2026-11-09'),
      kegiatan: 'Kegiatan Alfa',
      deskripsi: 'Uraian.',
      reporterName: 'Rina Wulandari',
      reporterTitleKind: 'KEPALA',
      reporterTitleField: 'Keuangan',
      status: 'DISETUJUI',
      createdById: 'u-sha',
      submittedAt: T0,
      decidedById: 'u-sup',
      decidedAt: T0,
      highlight: false,
      highlightNote: null,
      highlightedAt: null,
      ...data,
    },
  ])
  return r.id as string
}

function seedPhoto(reportId: string, data: Json = {}): void {
  seed('evidence', [
    {
      targetType: 'SUBHOLDING_REPORT',
      targetId: reportId,
      storageKey: `SUBHOLDING_REPORT/${reportId}/foto.jpg`,
      fileName: 'foto.jpg',
      mime: 'image/jpeg',
      size: 1234,
      url: null,
      uploadedById: 'u-sha',
      ...data,
    },
  ])
}

/** Isi arsip STORE: nama → data. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const end = buf.length - 22
  let p = buf.readUInt32LE(end + 16)
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    const nameLen = buf.readUInt16LE(p + 28)
    const size = buf.readUInt32LE(p + 24)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const start = local + 30 + buf.readUInt16LE(local + 26)
    out.set(name, buf.subarray(start, start + size))
    p += 46 + nameLen
  }
  return out
}

let jpeg: Buffer

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  for (const u of ['u-sha', 'u-sup', 'u-superuser', 'u-manajemen']) resetRate(`shpdfberkas:${u}`)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3377cc' } }).jpeg().toBuffer()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { 'content-type': 'image/jpeg' } })))
  seed('entity', [
    { id: 'sh-b', name: 'Subholding Beta', code: 'SHB', type: 'SUB_HOLDING', path: '/h/sh-b/', parentId: 'h' },
    { id: 'sh-a', name: 'Subholding Alfa', code: 'SHA', type: 'SUB_HOLDING', path: '/h/sh-a/', parentId: 'h' },
    { id: 'sh-x', name: 'Subholding Lama', code: 'SHX', type: 'SUB_HOLDING', path: '/h/sh-x/', parentId: 'h', isActive: false },
    { id: 'pt-a1', name: 'PT Alfa Satu', code: 'AS1', type: 'PT', path: '/h/sh-a/pt-a1/', parentId: 'sh-a' },
    { id: 'pt-a2', name: 'PT Alfa Dua', code: 'AS2', type: 'PT', path: '/h/sh-a/pt-a2/', parentId: 'sh-a' },
    { id: 'pt-b1', name: 'PT Beta Satu', code: 'BS1', type: 'PT', path: '/h/sh-b/pt-b1/', parentId: 'sh-b' },
  ])
  seed(
    'user',
    [
      { id: 'u-sha', name: 'Admin Subholding Alfa', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-a' },
      { id: 'u-sup', name: 'Sutan Supervisor', role: 'SUPERVISOR', scopeEntityId: null },
      { id: 'u-superuser', name: 'Kusuma Ketua', role: 'SUPERUSER', scopeEntityId: null },
      { id: 'u-manajemen', name: 'Mira Manajemen', role: 'MANAJEMEN', scopeEntityId: null },
    ].map((u) => ({ ...u, email: `${u.id}@contoh.test`, username: u.id.slice(2), passwordHash: `hash-${u.id}` }))
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GET /api/sh/pdf/ringkasan', () => {
  it('tanpa sesi 401; Admin subholding 403; rentang tidak sah 422', async () => {
    expect((await summary('from=2026-11-09')).status).toBe(401)
    signIn('u-sha')
    expect((await summary('from=2026-11-09')).status).toBe(403)
    signIn('u-sup')
    expect((await summary('from=bukan')).status).toBe(422)
    expect((await summary('from=2026-11-09&to=2026-11-01')).status).toBe(422)
    expect((await summary('from=2026-10-01&to=2026-11-09')).status).toBe(422)
  })

  it('Supervisor: jumlah disetujui/menunggu + foto per subholding aktif dalam periode', async () => {
    const a = seedReport()
    seedPhoto(a)
    seedPhoto(a, { url: 'https://contoh.test/tautan', mime: 'text/html' })
    const w = seedReport({ status: 'MENUNGGU', decidedById: null, decidedAt: null })
    seedPhoto(w)
    seedReport({ status: 'PERLU_PERBAIKAN' })
    seedReport({ reportDate: DAY('2026-11-08'), subholdingId: 'sh-b', ptId: 'pt-b1' })
    seedReport({ reportDate: DAY('2026-11-01') })
    seedReport({ subholdingId: 'sh-x' })
    signIn('u-sup')
    const res = await summary('from=2026-11-08&to=2026-11-09')
    expect(res.status).toBe(200)
    const d = await json(res)
    expect(d).toMatchObject({ from: '2026-11-08', to: '2026-11-09', canDrafts: true })
    expect(d.subholdings).toEqual([
      { id: 'sh-a', name: 'Subholding Alfa', approved: 1, pending: 1, photosApproved: 1, photosPending: 1 },
      { id: 'sh-b', name: 'Subholding Beta', approved: 1, pending: 0, photosApproved: 0, photosPending: 0 },
    ])
  })

  it('Manajemen: hanya disetujui, tanpa hitungan menunggu', async () => {
    seedReport()
    seedReport({ status: 'MENUNGGU', decidedById: null, decidedAt: null })
    signIn('u-manajemen')
    const d = await json(await summary('from=2026-11-09'))
    expect(d.canDrafts).toBe(false)
    expect(d.subholdings[0]).toMatchObject({ id: 'sh-a', approved: 1, pending: 0 })
  })
})

describe('GET /api/sh/pdf/berkas', () => {
  it('akses: 401, Admin subholding 403, DRAF hanya peninjau', async () => {
    expect((await bundle('from=2026-11-09')).status).toBe(401)
    signIn('u-sha')
    expect((await bundle('from=2026-11-09')).status).toBe(403)
    seedReport()
    signIn('u-manajemen')
    expect((await bundle('from=2026-11-09&drafts=1')).status).toBe(403)
    expect((await bundle('from=2026-11-09')).status).toBe(200)
  })

  it('masukan: 422 parameter/subholding tidak dikenal atau nonaktif; 404 tanpa laporan', async () => {
    signIn('u-sup')
    expect((await bundle('from=2026-11-09&format=rar')).status).toBe(422)
    expect((await bundle('from=2026-11-09&subs=sh-a,tidak-ada')).status).toBe(422)
    expect((await bundle('from=2026-11-09&subs=sh-x')).status).toBe(422)
    const res = await bundle('from=2026-11-09')
    expect(res.status).toBe(404)
    expect((await json(res)).error).toBe('Tidak ada laporan pada periode dan subholding ini')
  })

  it('PDF gabungan hari ini: sampul + ringkasan + belum melapor + bagian per subholding', async () => {
    const a = seedReport({ kegiatan: 'Pemasangan trafo' })
    seedPhoto(a)
    seed('subholdingReportComment', [
      { reportId: a, authorId: 'u-sup', kind: 'KOMENTAR', body: 'Lampirkan berita acara', createdAt: T0, editedAt: null, readAt: null },
    ])
    seedReport({ kegiatan: 'Bongkar muat', subholdingId: 'sh-b', ptId: 'pt-b1' })
    seedReport({ kegiatan: 'Masih menunggu', status: 'MENUNGGU', decidedById: null, decidedAt: null })
    seedReport({ kegiatan: 'Kemarin', reportDate: DAY('2026-11-08') })
    signIn('u-sup')
    const res = await bundle('from=2026-11-09')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="Laporan-Subholding-2026-11-09\.pdf"/)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const buf = await body(res)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    const text = pdfText(buf)
    expect(text).toContain('Laporan harian subholding')
    expect(text).toContain('Senin, 9 November 2026')
    expect(text).toContain('2 laporan disetujui')
    expect(text).toContain('RINGKASAN')
    expect(text).toContain('1 dari 2')
    expect(text).toContain('2 dari 3')
    expect(text).toContain('BELUM MELAPOR')
    expect(text).toContain('Subholding Alfa: PT Alfa Dua')
    expect(text).toContain('Pemasangan trafo')
    expect(text).toContain('Bongkar muat')
    expect(text).toContain('Lampirkan berita acara')
    expect(text).not.toContain('Masih menunggu')
    expect(text).not.toContain('Kemarin')
    expect(text).not.toContain('DRAF')
    expect(buf.toString('latin1')).toContain('/Subtype /Image')
  })

  it('pilihan isi: tanpa foto, tanpa komentar; DRAF menyertakan menunggu', async () => {
    const a = seedReport({ kegiatan: 'Pemasangan trafo' })
    seedPhoto(a)
    seed('subholdingReportComment', [
      { reportId: a, authorId: 'u-sup', kind: 'KOMENTAR', body: 'Lampirkan berita acara', createdAt: T0, editedAt: null, readAt: null },
    ])
    seedReport({ kegiatan: 'Masih menunggu', status: 'MENUNGGU', decidedById: null, decidedAt: null })
    signIn('u-sup')
    const buf = await body(await bundle('from=2026-11-09&subs=sh-a&drafts=1&photos=0&comments=0'))
    const text = pdfText(buf)
    expect(text).toContain('Masih menunggu')
    expect(text).toContain('DRAF')
    expect(text).toContain('1 disetujui · 1 menunggu tinjauan')
    expect(text).toContain('foto tidak disertakan')
    expect(text).not.toContain('Lampirkan berita acara')
    expect(buf.toString('latin1')).not.toContain('/Subtype /Image')
  })

  it('Manajemen: komentar tidak dicetak walau diminta', async () => {
    const a = seedReport()
    seed('subholdingReportComment', [
      { reportId: a, authorId: 'u-sup', kind: 'KOMENTAR', body: 'Komentar internal', createdAt: T0, editedAt: null, readAt: null },
    ])
    signIn('u-manajemen')
    const text = pdfText(await body(await bundle('from=2026-11-09&comments=1')))
    expect(text).not.toContain('Komentar internal')
  })

  it('rentang tanggal: dikelompokkan per tanggal terbaru dulu; satu subholding → nama berkasnya', async () => {
    seedReport({ kegiatan: 'Kegiatan Senin', reportDate: DAY('2026-11-09') })
    seedReport({ kegiatan: 'Kegiatan Selasa lalu', reportDate: DAY('2026-11-03') })
    signIn('u-sup')
    const res = await bundle('from=2026-11-02&to=2026-11-09&subs=sh-a')
    expect(res.headers.get('content-disposition')).toMatch(/filename="Laporan-Subholding-Alfa-2026-11-02_sd_2026-11-09\.pdf"/)
    const text = pdfText(await body(res))
    expect(text).toContain('Laporan subholding')
    expect(text).toContain('TANPA LAPORAN PADA PERIODE INI')
    const senin = text.indexOf('SENIN, 9 NOVEMBER 2026')
    const selasa = text.indexOf('SELASA, 3 NOVEMBER 2026')
    expect(senin).toBeGreaterThan(-1)
    expect(selasa).toBeGreaterThan(senin)
  })

  it('zip: satu PDF per subholding yang punya laporan', async () => {
    seedReport({ kegiatan: 'Kegiatan Alfa' })
    seedReport({ kegiatan: 'Kegiatan Beta', subholdingId: 'sh-b', ptId: 'pt-b1' })
    signIn('u-superuser')
    const res = await bundle('from=2026-11-09&format=zip')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toMatch(/filename="Laporan-Subholding-2026-11-09\.zip"/)
    const files = unzip(await body(res))
    expect([...files.keys()]).toEqual(['Laporan-Subholding-Alfa-2026-11-09.pdf', 'Laporan-Subholding-Beta-2026-11-09.pdf'])
    const alfa = pdfText(files.get('Laporan-Subholding-Alfa-2026-11-09.pdf')!)
    expect(alfa).toContain('Kegiatan Alfa')
    expect(alfa).not.toContain('Kegiatan Beta')
  })

  it('batas laju 10 unduhan per 5 menit', async () => {
    seedReport()
    signIn('u-sup')
    for (let i = 0; i < 10; i++) expect((await bundle('from=2026-11-09')).status).toBe(200)
    expect((await bundle('from=2026-11-09')).status).toBe(429)
  })
})
