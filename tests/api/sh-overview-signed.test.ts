import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Kontrak Opsi A "Mosaik" (docs/zcode/KONTRAK-SUPERUSER-OPSI-A.md):
 * - POST /api/evidence/signed — URL bukti secara batch; id ditolak/tidak ada
 *   dilewati tanpa alasan, tautan tidak aman dilewati, gagal tanda tangan satu
 *   id tidak menggagalkan lainnya, penyimpanan belum aktif → 503.
 * - GET /api/sh/overview — bukti mendapat `kind`, urutan subholding/PT/laporan.
 * Basis data tiruan di memori: tests/api/admin-fake-db.ts.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})
const storage = vi.hoisted(() => ({ configured: true, failKeys: new Set<string>(), signed: [] as string[] }))
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  storageConfigured: () => storage.configured,
  signedEvidenceUrl: async (key: string) => {
    storage.signed.push(key)
    if (storage.failKeys.has(key)) throw new Error('tanda tangan gagal')
    return `https://signed.test/${key}`
  },
}))

import { AUTH_SECRET_FOR_TESTS, cookie, one, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { startOfWibDay } from '@/lib/lock'
import { POST as signedPost } from '@/app/api/evidence/signed/route'
import { GET as overviewGet } from '@/app/api/sh/overview/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const T0 = new Date('2026-10-14T03:00:00Z') // Rabu 10.00 WIB
const TODAY = startOfWibDay(T0)

type Json = Record<string, any>

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

function post(body: unknown, raw?: string) {
  return signedPost(
    new NextRequest('http://localhost/api/evidence/signed', {
      method: 'POST',
      body: raw ?? JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  )
}
const json = async (res: Response) => (await res.json()) as Json

function seedReport(data: Json = {}): string {
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
      status: 'MENUNGGU',
      createdById: 'u-sha',
      submittedAt: T0,
      ...data,
    },
  ])
  return r.id as string
}

function seedEvidence(reportId: string, data: Json = {}): string {
  const name = (data.fileName as string | undefined) ?? 'foto.jpg'
  const [e] = seed('evidence', [
    {
      targetType: 'SUBHOLDING_REPORT',
      targetId: reportId,
      storageKey: `SUBHOLDING_REPORT/${reportId}/${name}`,
      fileName: name,
      mime: 'image/jpeg',
      size: 1234,
      url: null,
      uploadedById: 'u-sha',
      ...data,
    },
  ])
  return e.id as string
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  storage.configured = true
  storage.failKeys.clear()
  storage.signed.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // Nama sengaja tidak sesuai urutan sisip, untuk memeriksa pengurutan.
  seed('entity', [
    { id: 'sh-z', name: 'Subholding Zeta', code: 'SHZ', type: 'SUB_HOLDING', path: '/h/sh-z/', parentId: 'h' },
    { id: 'pt-z1', name: 'PT Zeta Satu', code: 'ZS1', type: 'PT', path: '/h/sh-z/pt-z1/', parentId: 'sh-z' },
    { id: 'sh-a', name: 'Subholding Alfa', code: 'SHA', type: 'SUB_HOLDING', path: '/h/sh-a/', parentId: 'h' },
    { id: 'pt-a1', name: 'PT Alfa Satu', code: 'AS1', type: 'PT', path: '/h/sh-a/pt-a1/', parentId: 'sh-a' },
    { id: 'pt-a0', name: 'PT Alfa Awal', code: 'AS0', type: 'PT', path: '/h/sh-a/pt-a0/', parentId: 'sh-a' },
    { id: 'sh-b', name: 'Subholding Beta', code: 'SHB', type: 'SUB_HOLDING', path: '/h/sh-b/', parentId: 'h' },
  ])
  seed(
    'user',
    [
      { id: 'u-sha', name: 'Admin Subholding Alfa', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-a' },
      { id: 'u-shz', name: 'Admin Subholding Zeta', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-z' },
      { id: 'u-sup', name: 'Sutan Supervisor', role: 'SUPERVISOR', scopeEntityId: null },
      { id: 'u-superuser', name: 'Kusuma Superuser', role: 'SUPERUSER', scopeEntityId: null },
    ].map((u) => ({ ...u, email: `${u.id}@contoh.test`, username: u.id.slice(2), passwordHash: `hash-${u.id}` }))
  )
})
afterEach(() => {
  vi.useRealTimers()
})

// ------------------------------------------------------------------
describe('POST /api/evidence/signed — validasi', () => {
  it('tanpa sesi → 401', async () => {
    const res = await post({ ids: ['x'] })
    expect(res.status).toBe(401)
  })

  it('ids kosong, bukan larik, >60, ganda, atau bukan string → 422 { error }', async () => {
    signIn('u-superuser')
    const many = Array.from({ length: 61 }, (_, i) => `id-${i}`)
    for (const body of [{ ids: [] }, { ids: 'abc' }, {}, { ids: many }, { ids: ['a', 'a'] }, { ids: [1] }, { ids: [''] }]) {
      const res = await post(body)
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(422)
      expect(typeof (await json(res)).error).toBe('string')
    }
    // Tepat 60 masih diterima (semuanya tidak ada → daftar kosong).
    const ok = await post({ ids: many.slice(0, 60) })
    expect(ok.status).toBe(200)
    expect((await json(ok)).items).toEqual([])
  })

  it('JSON rusak atau bukan objek → 400', async () => {
    signIn('u-superuser')
    expect((await post(undefined, '{ids: [')).status).toBe(400)
    expect((await post(['a'])).status).toBe(400)
    expect((await post(null)).status).toBe(400)
  })

  it('peran lain di luar cakupan: semua id dilewati, bukan 403', async () => {
    const ev = seedEvidence(seedReport({ status: 'DISETUJUI' }))
    signIn('u-admin-a') // Admin PT lama
    const res = await post({ ids: [ev] })
    expect(res.status).toBe(200)
    expect((await json(res)).items).toEqual([])
  })
})

describe('POST /api/evidence/signed — cakupan dan hasil', () => {
  it('Superuser hanya mendapat bukti laporan DISETUJUI; MENUNGGU dan id tak dikenal dilewati tanpa alasan', async () => {
    const approved = seedReport({ status: 'DISETUJUI', decidedAt: T0 })
    const pending = seedReport({})
    const evOk = seedEvidence(approved)
    const evOk2 = seedEvidence(approved, { fileName: 'dua.jpg' })
    const evPending = seedEvidence(pending)
    for (const who of ['u-superuser', 'u-mgmt']) {
      signIn(who)
      const res = await post({ ids: [evPending, evOk2, 'tidak-ada', evOk] })
      expect(res.status, who).toBe(200)
      const text = await res.text()
      expect(text, who).not.toContain(evPending)
      expect(text, who).not.toContain('tidak-ada')
      expect(JSON.parse(text).items, who).toEqual([
        { id: evOk2, url: `https://signed.test/SUBHOLDING_REPORT/${approved}/dua.jpg`, kind: 'file' },
        { id: evOk, url: `https://signed.test/SUBHOLDING_REPORT/${approved}/foto.jpg`, kind: 'file' },
      ])
    }
    // Berkas laporan MENUNGGU tidak pernah ditandatangani untuk Superuser.
    expect(storage.signed.some((k) => k.includes(pending))).toBe(false)
  })

  it('admin subholding hanya bukti laporannya sendiri (semua status); supervisor semua', async () => {
    const mineApproved = seedReport({ status: 'DISETUJUI' })
    const minePending = seedReport({})
    const other = seedReport({ subholdingId: 'sh-z', ptId: 'pt-z1', createdById: 'u-shz', status: 'DISETUJUI' })
    const a = seedEvidence(mineApproved)
    const b = seedEvidence(minePending)
    const c = seedEvidence(other)

    signIn('u-sha')
    expect((await json(await post({ ids: [a, b, c] }))).items.map((x: Json) => x.id)).toEqual([a, b])
    signIn('u-shz')
    expect((await json(await post({ ids: [a, b, c] }))).items.map((x: Json) => x.id)).toEqual([c])
    signIn('u-sup')
    expect((await json(await post({ ids: [a, b, c] }))).items.map((x: Json) => x.id)).toEqual([a, b, c])
  })

  it('tautan lama: aman → kind link; tidak aman (javascript:, kredensial) dilewati', async () => {
    const r = seedReport({ status: 'DISETUJUI' })
    const good = seedEvidence(r, { fileName: 'Tautan', mime: 'text/uri-list', storageKey: '', url: 'https://contoh.test/dok' })
    const evil = seedEvidence(r, { fileName: 'Jahat', mime: 'text/uri-list', storageKey: '', url: 'javascript:alert(1)' })
    const cred = seedEvidence(r, { fileName: 'Kredensial', mime: 'text/uri-list', storageKey: '', url: 'https://a:b@contoh.test/x' })
    signIn('u-superuser')
    const res = await post({ ids: [evil, good, cred] })
    expect(res.status).toBe(200)
    expect((await json(res)).items).toEqual([{ id: good, url: 'https://contoh.test/dok', kind: 'link' }])
  })

  it('gagal tanda tangan satu id tidak menggagalkan lainnya', async () => {
    const r = seedReport({ status: 'DISETUJUI' })
    const a = seedEvidence(r, { fileName: 'a.jpg' })
    const b = seedEvidence(r, { fileName: 'b.jpg' })
    const c = seedEvidence(r, { fileName: 'c.jpg' })
    storage.failKeys.add(`SUBHOLDING_REPORT/${r}/b.jpg`)
    signIn('u-superuser')
    const res = await post({ ids: [a, b, c] })
    expect(res.status).toBe(200)
    expect((await json(res)).items.map((x: Json) => x.id)).toEqual([a, c])
  })

  it('penyimpanan belum aktif → 503 needsConfig bila ada berkas; tautan saja tetap 200', async () => {
    const r = seedReport({ status: 'DISETUJUI' })
    const file = seedEvidence(r)
    const link = seedEvidence(r, { fileName: 'Tautan', mime: 'text/uri-list', storageKey: '', url: 'https://contoh.test/dok' })
    storage.configured = false
    signIn('u-superuser')
    const res = await post({ ids: [file, link] })
    expect(res.status).toBe(503)
    expect(await json(res)).toMatchObject({ error: expect.any(String), needsConfig: true })
    const onlyLink = await post({ ids: [link] })
    expect(onlyLink.status).toBe(200)
    expect((await json(onlyLink)).items).toEqual([{ id: link, url: 'https://contoh.test/dok', kind: 'link' }])
    // Berkas di luar cakupan tidak memicu 503 (tidak membocorkan keberadaannya).
    const pendingFile = seedEvidence(seedReport({}))
    expect((await post({ ids: [pendingFile] })).status).toBe(200)
  })
})

describe('POST /api/evidence/signed — size thumb/full (Fase 1 PWA)', () => {
  it('thumb → thumbKey bila ada, selain itu storageKey; full/tanpa size → selalu storageKey', async () => {
    const r = seedReport({ status: 'DISETUJUI' })
    const withThumb = seedEvidence(r, { fileName: 'a.jpg', thumbKey: `SUBHOLDING_REPORT/${r}/a.jpg.thumb.webp` })
    const legacy = seedEvidence(r, { fileName: 'b.jpg' }) // bukti lama: thumbKey null
    signIn('u-superuser')

    const thumb = await post({ ids: [withThumb, legacy], size: 'thumb' })
    expect(thumb.status).toBe(200)
    expect((await json(thumb)).items).toEqual([
      { id: withThumb, url: `https://signed.test/SUBHOLDING_REPORT/${r}/a.jpg.thumb.webp`, kind: 'file' },
      { id: legacy, url: `https://signed.test/SUBHOLDING_REPORT/${r}/b.jpg`, kind: 'file' },
    ])
    for (const body of [{ ids: [withThumb] }, { ids: [withThumb], size: 'full' }, { ids: [withThumb], size: null }]) {
      const res = await post(body)
      expect(res.status, JSON.stringify(body)).toBe(200)
      expect((await json(res)).items, JSON.stringify(body)).toEqual([
        { id: withThumb, url: `https://signed.test/SUBHOLDING_REPORT/${r}/a.jpg`, kind: 'file' },
      ])
    }
  })

  it('thumbnail gagal ditandatangani → jatuh ke berkas asli; keduanya gagal → dilewati', async () => {
    const r = seedReport({ status: 'DISETUJUI' })
    const a = seedEvidence(r, { fileName: 'a.jpg', thumbKey: `SUBHOLDING_REPORT/${r}/a.jpg.thumb.webp` })
    const b = seedEvidence(r, { fileName: 'b.jpg', thumbKey: `SUBHOLDING_REPORT/${r}/b.jpg.thumb.webp` })
    storage.failKeys.add(`SUBHOLDING_REPORT/${r}/a.jpg.thumb.webp`)
    storage.failKeys.add(`SUBHOLDING_REPORT/${r}/b.jpg.thumb.webp`)
    storage.failKeys.add(`SUBHOLDING_REPORT/${r}/b.jpg`)
    signIn('u-superuser')
    const res = await post({ ids: [a, b], size: 'thumb' })
    expect(res.status).toBe(200)
    expect((await json(res)).items).toEqual([{ id: a, url: `https://signed.test/SUBHOLDING_REPORT/${r}/a.jpg`, kind: 'file' }])
  })

  it('tautan tidak terpengaruh size; size tak dikenal → 422', async () => {
    const r = seedReport({ status: 'DISETUJUI' })
    const link = seedEvidence(r, { fileName: 'Tautan', mime: 'text/uri-list', storageKey: '', url: 'https://contoh.test/dok' })
    signIn('u-superuser')
    const res = await post({ ids: [link], size: 'thumb' })
    expect((await json(res)).items).toEqual([{ id: link, url: 'https://contoh.test/dok', kind: 'link' }])
    for (const size of ['besar', 1, true, 'THUMB']) {
      const bad = await post({ ids: [link], size })
      expect(bad.status, String(size)).toBe(422)
      expect(typeof (await json(bad)).error).toBe('string')
    }
    expect(storage.signed).toEqual([])
  })

  it('thumb tetap mengikuti cakupan baca: laporan MENUNGGU tidak ditandatangani untuk Superuser', async () => {
    const pending = seedReport({})
    const ev = seedEvidence(pending, { thumbKey: `SUBHOLDING_REPORT/${pending}/foto.jpg.thumb.webp` })
    signIn('u-superuser')
    const res = await post({ ids: [ev], size: 'thumb' })
    expect((await json(res)).items).toEqual([])
    expect(storage.signed).toEqual([])
  })
})

// ------------------------------------------------------------------
describe('GET /api/sh/overview — kind dan urutan', () => {
  it('bukti punya kind file/link; subholding & PT urut nama; laporan urut decidedAt lalu submittedAt', async () => {
    const t = (min: number) => new Date(T0.getTime() + min * 60_000)
    // Disisipkan acak; urutan yang diharapkan: late-dec terakhir, dua laporan
    // ber-decidedAt sama diurutkan submittedAt.
    const late = seedReport({ kegiatan: 'Ketiga', status: 'DISETUJUI', decidedAt: t(30), submittedAt: t(-50) })
    const tieB = seedReport({ kegiatan: 'Kedua', status: 'DISETUJUI', decidedAt: t(10), submittedAt: t(-5) })
    const tieA = seedReport({ kegiatan: 'Pertama', status: 'DISETUJUI', decidedAt: t(10), submittedAt: t(-20) })
    const awal = seedReport({ kegiatan: 'PT awal', ptId: 'pt-a0', status: 'DISETUJUI', decidedAt: t(40) })
    const zeta = seedReport({ kegiatan: 'Zeta', subholdingId: 'sh-z', ptId: 'pt-z1', createdById: 'u-shz', status: 'DISETUJUI', decidedAt: t(1) })
    seedReport({ kegiatan: 'Rahasia', status: 'MENUNGGU' })
    const file = seedEvidence(tieA)
    const link = seedEvidence(tieA, { fileName: 'Tautan', mime: 'text/uri-list', storageKey: '', url: 'https://contoh.test/dok' })
    seedEvidence(zeta)

    signIn('u-superuser')
    const res = await overviewGet(new NextRequest('http://localhost/api/sh/overview'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('Rahasia')
    expect(text).not.toContain('contoh.test/dok') // URL tautan tidak dikirim di ringkasan
    const body = JSON.parse(text) as Json
    expect(body.subholdings.map((s: Json) => s.id)).toEqual(['sh-a', 'sh-b', 'sh-z'])
    const alfa = body.subholdings[0]
    expect(alfa).toMatchObject({ count: 4, ptCount: 2 })
    expect(alfa.pts.map((p: Json) => p.name)).toEqual(['PT Alfa Awal', 'PT Alfa Satu'])
    expect(alfa.pts[0].reports.map((r: Json) => r.id)).toEqual([awal])
    expect(alfa.pts[1].reports.map((r: Json) => r.id)).toEqual([tieA, tieB, late])
    expect(alfa.pts[1].reports[0].evidence).toEqual([
      { id: file, fileName: 'foto.jpg', mime: 'image/jpeg', kind: 'file' },
      { id: link, fileName: 'Tautan', mime: 'text/uri-list', kind: 'link' },
    ])
    expect(body.subholdings[1]).toEqual({ id: 'sh-b', name: 'Subholding Beta', count: 0, ptCount: 0, pts: [], allPts: [] })
    expect(body.subholdings[2].pts[0].reports[0].evidence[0].kind).toBe('file')
  })

  it('setiap laporan membawa reporterName, reporterTitle (label jadi), decidedAt ISO; hanya DISETUJUI', async () => {
    const decided = new Date('2026-10-14T03:24:00Z')
    const approved = seedReport({
      kegiatan: 'Disetujui',
      status: 'DISETUJUI',
      reporterName: 'Budi Santoso',
      reporterTitleKind: 'MANAJER',
      reporterTitleField: 'Proyek',
      decidedAt: decided,
    })
    // Laporan lama tanpa decidedAt tetap tampil dengan decidedAt null.
    const legacy = seedReport({ kegiatan: 'Lama', status: 'DISETUJUI', submittedAt: new Date(T0.getTime() + 60_000) })
    for (const status of ['MENUNGGU', 'PERLU_PERBAIKAN']) {
      seedReport({ kegiatan: `Rahasia ${status}`, status, reporterName: `Orang ${status}`, decidedAt: decided })
    }

    signIn('u-superuser')
    const text = await (await overviewGet(new NextRequest('http://localhost/api/sh/overview'))).text()
    expect(text).not.toContain('Rahasia')
    expect(text).not.toContain('Orang ')
    const reports = (JSON.parse(text) as Json).subholdings
      .flatMap((s: Json) => s.pts)
      .flatMap((p: Json) => p.reports)
    expect(reports.map((r: Json) => r.id).sort()).toEqual([approved, legacy].sort())
    const byId = new Map(reports.map((r: Json) => [r.id, r]))
    expect(byId.get(approved)).toMatchObject({
      reporterName: 'Budi Santoso',
      reporterTitle: 'Manajer Proyek',
      decidedAt: '2026-10-14T03:24:00.000Z',
    })
    expect(byId.get(legacy)).toMatchObject({ reporterName: 'Pelapor', reporterTitle: 'Kepala Keuangan', decidedAt: null })
  })

  it('allPts[].lastReportDate: DISETUJUI terakhir SEBELUM tanggal, jendela 90 hari, selain itu null', async () => {
    const day = (key: string) => new Date(`${key}T00:00:00+07:00`)
    // pt-a1: terakhir Senin 12 Okt (Jumat 9 Okt lebih lama; hari itu sendiri dan masa depan tidak dihitung).
    seedReport({ status: 'DISETUJUI', reportDate: day('2026-10-09'), decidedAt: T0 })
    seedReport({ status: 'DISETUJUI', reportDate: day('2026-10-12'), decidedAt: T0 })
    seedReport({ status: 'DISETUJUI', reportDate: TODAY, decidedAt: T0 })
    seedReport({ status: 'DISETUJUI', reportDate: day('2026-10-15'), decidedAt: T0 })
    // pt-a0: yang belum disetujui diabaikan; yang disetujui di luar 90 hari tidak terhitung.
    seedReport({ ptId: 'pt-a0', status: 'MENUNGGU', reportDate: day('2026-10-13') })
    seedReport({ ptId: 'pt-a0', status: 'DISETUJUI', reportDate: day('2026-07-01'), decidedAt: T0 })
    // pt-z1: tepat di tepi jendela (90 hari sebelum 14 Okt = 16 Jul) masih terhitung.
    seedReport({ subholdingId: 'sh-z', ptId: 'pt-z1', createdById: 'u-shz', status: 'DISETUJUI', reportDate: day('2026-07-16'), decidedAt: T0 })

    signIn('u-superuser')
    const body = (await json(await overviewGet(new NextRequest('http://localhost/api/sh/overview')))) as Json
    const last = (subId: string) =>
      Object.fromEntries(body.subholdings.find((s: Json) => s.id === subId).allPts.map((p: Json) => [p.id, p.lastReportDate]))
    expect(last('sh-a')).toEqual({ 'pt-a0': null, 'pt-a1': '2026-10-12' })
    expect(last('sh-z')).toEqual({ 'pt-z1': '2026-07-16' })

    // Tanggal lain: patokan bergeser (sebelum 12 Okt → 9 Okt).
    const earlier = (await json(await overviewGet(new NextRequest('http://localhost/api/sh/overview?date=2026-10-12')))) as Json
    const alfa = earlier.subholdings.find((s: Json) => s.id === 'sh-a')
    expect(alfa.allPts.find((p: Json) => p.id === 'pt-a1').lastReportDate).toBe('2026-10-09')
  })
})
