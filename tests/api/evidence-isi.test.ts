import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * GET /api/evidence/:id/isi — isi dokumen bukti (PDF/.docx) untuk penampil
 * di pop-up aplikasi (13 Nov 2026):
 * - akses sama dengan GET /api/evidence/:id (Superuser hanya laporan disetujui);
 * - hanya PDF/.docx; gambar, .doc, Excel, tautan lama → 415;
 * - Content-Type dari jenis dokumen (bukan MIME tersimpan), inline, sandbox CSP;
 * - berkas > 20 MB → 413; penyimpanan gagal → 502.
 * Basis data tiruan: tests/api/admin-fake-db.ts; penyimpanan & fetch di-mock.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})
const storage = vi.hoisted(() => ({ configured: true }))
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  storageConfigured: () => storage.configured,
  signedEvidenceUrl: async (key: string) => `https://signed.test/${key}`,
}))

import { AUTH_SECRET_FOR_TESTS, cookie, one, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { startOfWibDay } from '@/lib/lock'
import { DOCX_MIME } from '@/lib/evidence-doc'
import { MAX_EVIDENCE_BYTES } from '@/lib/storage'
import { GET } from '@/app/api/evidence/[id]/isi/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const T0 = new Date('2026-11-12T03:00:00Z')
const TODAY = startOfWibDay(T0)
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n%isi uji\n')

type Json = Record<string, unknown>

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

function get(id: string) {
  return GET(new NextRequest(`http://localhost/api/evidence/${id}/isi`), { params: Promise.resolve({ id }) })
}

function seedReport(status: string): string {
  const [r] = seed('subholdingReport', [
    {
      subholdingId: 'sh-a',
      ptId: 'pt-a1',
      reportDate: TODAY,
      kegiatan: 'Kegiatan contoh',
      deskripsi: 'Deskripsi contoh',
      reporterName: 'Pelapor',
      reporterTitleKind: 'KEPALA',
      reporterTitleField: 'Keuangan',
      status,
      createdById: 'u-sha',
      submittedAt: T0,
    },
  ])
  return r.id as string
}

function seedEvidence(reportId: string, data: Json = {}): string {
  const name = (data.fileName as string | undefined) ?? 'berita-acara.pdf'
  const [e] = seed('evidence', [
    {
      targetType: 'SUBHOLDING_REPORT',
      targetId: reportId,
      storageKey: `SUBHOLDING_REPORT/${reportId}/${name}`,
      fileName: name,
      mime: 'application/pdf',
      size: PDF_BYTES.length,
      url: null,
      uploadedById: 'u-sha',
      ...data,
    },
  ])
  return e.id as string
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  storage.configured = true
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response(PDF_BYTES, { status: 200, headers: { 'content-length': String(PDF_BYTES.length) } }))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  seed('entity', [
    { id: 'sh-a', name: 'Subholding Alfa', code: 'SHA', type: 'SUB_HOLDING', path: '/h/sh-a/', parentId: 'h' },
    { id: 'pt-a1', name: 'PT Alfa Satu', code: 'AS1', type: 'PT', path: '/h/sh-a/pt-a1/', parentId: 'sh-a' },
  ])
  seed(
    'user',
    [
      { id: 'u-sha', name: 'Admin Subholding Alfa', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-a' },
      { id: 'u-sup', name: 'Sutan Supervisor', role: 'SUPERVISOR', scopeEntityId: null },
      { id: 'u-superuser', name: 'Kusuma Superuser', role: 'SUPERUSER', scopeEntityId: null },
    ].map((u) => ({ ...u, email: `${u.id}@contoh.test`, username: u.id.slice(2), passwordHash: `hash-${u.id}` }))
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('GET /api/evidence/:id/isi', () => {
  it('tanpa sesi → 401, tanpa menyentuh penyimpanan', async () => {
    const ev = seedEvidence(seedReport('DISETUJUI'))
    expect((await get(ev)).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('PDF: isi dialirkan inline dengan Content-Type tetap, nosniff, sandbox, tanpa cache', async () => {
    const ev = seedEvidence(seedReport('DISETUJUI'), { fileName: 'Rekap "akhir"\r\n.pdf' })
    signIn('u-superuser')
    const res = await get(ev)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/^inline; filename="Rekap _akhir___\.pdf"; filename\*=UTF-8''/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'")
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF_BYTES)
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://signed.test/SUBHOLDING_REPORT/')
  })

  it('.docx dengan MIME generik dari HP dikenali lewat ekstensi; Content-Type tidak mengikuti MIME tersimpan', async () => {
    const ev = seedEvidence(seedReport('DISETUJUI'), { fileName: 'notulen.docx', mime: 'application/octet-stream' })
    signIn('u-sup')
    const res = await get(ev)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(DOCX_MIME)
  })

  it('Superuser tidak boleh membuka bukti laporan MENUNGGU; Supervisor boleh', async () => {
    const ev = seedEvidence(seedReport('MENUNGGU'))
    signIn('u-superuser')
    expect((await get(ev)).status).toBeGreaterThanOrEqual(403)
    expect(fetchMock).not.toHaveBeenCalled()
    signIn('u-sup')
    expect((await get(ev)).status).toBe(200)
  })

  it('gambar, Word lama .doc, Excel, dan tautan lama → 415', async () => {
    const r = seedReport('DISETUJUI')
    const ids = [
      seedEvidence(r, { fileName: 'foto.jpg', mime: 'image/jpeg' }),
      seedEvidence(r, { fileName: 'lama.doc', mime: 'application/msword' }),
      seedEvidence(r, { fileName: 'data.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      seedEvidence(r, { fileName: 'tautan.pdf', url: 'https://contoh.test/a.pdf' }),
    ]
    signIn('u-sup')
    for (const id of ids) expect((await get(id)).status).toBe(415)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('id tidak dikenal → 404; penyimpanan belum aktif → 503', async () => {
    signIn('u-sup')
    expect((await get('tidak-ada')).status).toBe(404)
    const ev = seedEvidence(seedReport('DISETUJUI'))
    storage.configured = false
    expect((await get(ev)).status).toBe(503)
  })

  it('berkas melebihi batas (baris maupun header penyimpanan) → 413', async () => {
    const r = seedReport('DISETUJUI')
    signIn('u-sup')
    expect((await get(seedEvidence(r, { size: MAX_EVIDENCE_BYTES + 1 }))).status).toBe(413)
    fetchMock.mockImplementationOnce(async () => new Response(PDF_BYTES, { headers: { 'content-length': String(MAX_EVIDENCE_BYTES + 1) } }))
    expect((await get(seedEvidence(r, { fileName: 'b.pdf' }))).status).toBe(413)
  })

  it('penyimpanan menjawab galat atau jaringan putus → 502 tanpa detail mentah', async () => {
    const r = seedReport('DISETUJUI')
    signIn('u-sup')
    fetchMock.mockImplementationOnce(async () => new Response('NoSuchKey', { status: 404 }))
    const a = await get(seedEvidence(r))
    expect(a.status).toBe(502)
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('ECONNRESET rahasia-internal')
    })
    const b = await get(seedEvidence(r, { fileName: 'c.pdf' }))
    expect(b.status).toBe(502)
    expect(JSON.stringify(await b.json())).not.toContain('rahasia-internal')
  })
})
