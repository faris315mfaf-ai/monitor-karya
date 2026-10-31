import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import sharp from 'sharp'

/**
 * GET /api/sh/pdf — PDF laporan subholding (mode id, pt, sub).
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
import { startOfWibDay } from '@/lib/lock'
import { GET as pdfGet } from '@/app/api/sh/pdf/route'
import { pdfText } from '../lib/pdf-helpers'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

// Rabu 14 Okt 2026 10.00 WIB.
const T0 = new Date('2026-10-14T03:00:00Z')
const TODAY = startOfWibDay(T0)

type Json = Record<string, any>

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}
const get = (qs: string) => pdfGet(new NextRequest(`http://localhost/api/sh/pdf?${qs}`))
const json = async (res: Response) => (await res.json()) as Json

function seedReport(data: Json = {}): string {
  const [r] = seed('subholdingReport', [
    {
      subholdingId: 'sh-a',
      ptId: 'pt-a1',
      reportDate: TODAY,
      kegiatan: 'Pemasangan panel “gardu” B',
      deskripsi: 'Panel selesai 80 persen.\nUji beban Senin.',
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

function seedEvidence(reportId: string, data: Json = {}): string {
  const [e] = seed('evidence', [
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
  return e.id as string
}

let jpeg: Buffer

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  for (const u of ['u-sha', 'u-sup', 'u-superuser', 'u-manajemen', 'u-shb']) resetRate(`shpdf:${u}`)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3377cc' } }).jpeg().toBuffer()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { 'content-type': 'image/jpeg' } })))
  seed('entity', [
    { id: 'sh-b', name: 'Subholding Beta', code: 'SHB', type: 'SUB_HOLDING', path: '/h/sh-b/', parentId: 'h' },
    { id: 'sh-a', name: 'Subholding Alfa', code: 'SHA', type: 'SUB_HOLDING', path: '/h/sh-a/', parentId: 'h' },
    { id: 'pt-a1', name: 'PT Alfa Satu', code: 'AS1', type: 'PT', path: '/h/sh-a/pt-a1/', parentId: 'sh-a' },
    { id: 'pt-a2', name: 'PT Alfa Dua', code: 'AS2', type: 'PT', path: '/h/sh-a/pt-a2/', parentId: 'sh-a' },
  ])
  seed(
    'user',
    [
      { id: 'u-sha', name: 'Admin Subholding Alfa', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-a' },
      { id: 'u-shb', name: 'Admin Subholding Beta', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-b' },
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

describe('GET /api/sh/pdf', () => {
  it('tanpa sesi 401; parameter harus tepat satu dari id/pt/sub', async () => {
    expect((await get('id=x')).status).toBe(401)
    signIn('u-manajemen')
    expect((await get('')).status).toBe(422)
    expect((await get('id=a&pt=b')).status).toBe(422)
    expect((await get('id=' + 'x'.repeat(65))).status).toBe(422)
  })

  it('Manajemen: PDF satu laporan disetujui, foto tersisip, komentar tidak dicetak', async () => {
    const id = seedReport()
    seedEvidence(id)
    seed('subholdingReportComment', [
      { reportId: id, authorId: 'u-sup', kind: 'KOMENTAR', body: 'Komentar internal supervisor', createdAt: T0, editedAt: null, readAt: null },
    ])
    signIn('u-manajemen')
    const res = await get(`id=${id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/^inline; filename="Laporan-PT-Alfa-Satu-2026-10-14\.pdf"/)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    const text = pdfText(buf)
    expect(text).toContain('PT Alfa Satu')
    expect(text).toContain('Pemasangan panel \x93gardu\x94 B')
    expect(text).toContain('Uji beban Senin.')
    expect(text).toContain('Rina Wulandari')
    expect(text).toContain('Disetujui')
    expect(text).not.toContain('Komentar internal supervisor')
    expect(text).not.toContain('DRAF')
    expect(buf.toString('latin1')).toContain('/Subtype /Image')
  })

  it('Manajemen tidak boleh membuka laporan belum disetujui (404); Supervisor boleh, dengan DRAF dan komentar', async () => {
    const id = seedReport({ status: 'MENUNGGU', decidedById: null, decidedAt: null })
    seed('subholdingReportComment', [
      { reportId: id, authorId: 'u-sup', kind: 'KOMENTAR', body: 'Lampirkan nomor pesanan', createdAt: T0, editedAt: null, readAt: null },
    ])
    signIn('u-manajemen')
    expect((await get(`id=${id}`)).status).toBe(404)
    signIn('u-sup')
    const res = await get(`id=${id}`)
    expect(res.status).toBe(200)
    const text = pdfText(Buffer.from(await res.arrayBuffer()))
    expect(text).toContain('DRAF')
    expect(text).toContain('Menunggu tinjauan')
    expect(text).toContain('Lampirkan nomor pesanan')
  })

  it('Admin subholding hanya bisa laporan subholding sendiri; tidak boleh mode pt/sub', async () => {
    const id = seedReport()
    signIn('u-shb')
    expect((await get(`id=${id}`)).status).toBe(404)
    expect((await get(`pt=pt-a1&date=2026-10-14`)).status).toBe(403)
    signIn('u-sha')
    expect((await get(`id=${id}`)).status).toBe(200)
  })

  it('mode PT: semua laporan disetujui PT itu pada tanggalnya; 404 bila kosong atau bukan PT', async () => {
    seedReport({ kegiatan: 'Satu' })
    seedReport({ kegiatan: 'Dua' })
    seedReport({ kegiatan: 'Belum', status: 'MENUNGGU', decidedById: null, decidedAt: null })
    seedReport({ kegiatan: 'LainPT', ptId: 'pt-a2' })
    signIn('u-superuser')
    const res = await get('pt=pt-a1&date=2026-10-14')
    expect(res.status).toBe(200)
    const text = pdfText(Buffer.from(await res.arrayBuffer()))
    expect(text).toContain('Satu')
    expect(text).toContain('Dua')
    expect(text).toContain('2 laporan')
    expect(text).not.toContain('Belum')
    expect(text).not.toContain('LainPT')
    expect(text).not.toContain('DRAF')
    expect((await get('pt=pt-a1&date=2026-10-13')).status).toBe(404)
    expect((await get('pt=sh-a&date=2026-10-14')).status).toBe(404)
    expect((await get('pt=pt-a1&date=bukan')).status).toBe(422)
  })

  it('mode subholding: PT dikelompokkan; tanpa date memakai hari ini', async () => {
    seedReport({ kegiatan: 'Satu' })
    seedReport({ kegiatan: 'LainPT', ptId: 'pt-a2' })
    signIn('u-manajemen')
    const res = await get('sub=sh-a')
    expect(res.status).toBe(200)
    const text = pdfText(Buffer.from(await res.arrayBuffer()))
    expect(text).toContain('Subholding Alfa')
    expect(text).toContain('PT Alfa Satu')
    expect(text).toContain('PT Alfa Dua')
    expect(text).toContain('2 PT')
  })

  it('foto yang gagal diambil dicantumkan sebagai lampiran, PDF tetap jadi', async () => {
    const id = seedReport()
    seedEvidence(id)
    seedEvidence(id, { fileName: 'laporan.pdf', mime: 'application/pdf', storageKey: 'k/laporan.pdf' })
    seedEvidence(id, { fileName: 'tautan', url: 'https://contoh.test/dokumen', storageKey: '' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    signIn('u-manajemen')
    const res = await get(`id=${id}`)
    expect(res.status).toBe(200)
    const buf = Buffer.from(await res.arrayBuffer())
    const text = pdfText(buf)
    expect(text).toContain('foto.jpg')
    expect(text).toContain('foto tidak disertakan')
    expect(text).toContain('laporan.pdf')
    expect(text).toContain('https://contoh.test/dokumen')
    expect(buf.toString('latin1')).not.toContain('/Subtype /Image')
  })

  it('dibatasi 20 permintaan per 5 menit per akun', async () => {
    const id = seedReport()
    signIn('u-manajemen')
    for (let i = 0; i < 20; i++) expect((await get(`id=${id}`)).status).toBe(200)
    const res = await get(`id=${id}`)
    expect(res.status).toBe(429)
    expect((await json(res)).error).toMatch(/PDF/)
  })
})
