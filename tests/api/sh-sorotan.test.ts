import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Sorotan supervisor + pola 7 hari (docs/zcode/KONTRAK-MANAJEMEN-MOBILE.md D1):
 * - POST /api/sh/reports/:id/decision approve { highlight, highlightNote }:
 *   validasi 422, simpan dalam transaksi yang sama, jejak audit, hanya supervisor.
 * - GET /api/sh/review menyertakan sorotan; endpoint Admin subholding tidak.
 * - GET /api/sh/overview: `highlight`/`highlightNote` per laporan + `allPts`.
 * - GET /api/sh/overview/week: days, counts, pts, highlights, akses per peran.
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
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  storageConfigured: () => true,
  removeEvidence: async () => {},
  signedEvidenceUrl: async (key: string) => `https://signed.test/${key}`,
}))

import { AUTH_SECRET_FOR_TESTS, cookie, one, rows, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { startOfWibDay } from '@/lib/lock'
import { parseShDecision, SH_LIMITS } from '@/lib/subholding/rules'
import { GET as reportsGet } from '@/app/api/sh/reports/route'
import { GET as reportGet } from '@/app/api/sh/reports/[id]/route'
import { POST as decisionPost } from '@/app/api/sh/reports/[id]/decision/route'
import { GET as inboxGet } from '@/app/api/sh/inbox/route'
import { GET as reviewGet } from '@/app/api/sh/review/route'
import { GET as overviewGet } from '@/app/api/sh/overview/route'
import { GET as weekGet } from '@/app/api/sh/overview/week/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

// Rabu 14 Okt 2026 10.00 WIB.
const T0 = new Date('2026-10-14T03:00:00Z')
const TODAY = startOfWibDay(T0)
const dayOffset = (n: number) => new Date(TODAY.getTime() + n * 86_400_000)

type Json = Record<string, any>

const NOTE = 'Progres gudang melampaui target minggu ini'

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

function req(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const json = async (res: Response) => (await res.json()) as Json
const decide = (id: string, body: unknown) => decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', body), ctx(id))

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
      highlight: false,
      highlightNote: null,
      highlightedAt: null,
      ...data,
    },
  ])
  return r.id as string
}

function seedEvidence(reportId: string): string {
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
    },
  ])
  return e.id as string
}

/** Laporan menunggu dengan satu bukti — siap disetujui. */
const pendingWithEvidence = (data: Json = {}) => {
  const id = seedReport(data)
  seedEvidence(id)
  return id
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  vi.spyOn(console, 'error').mockImplementation(() => {})
  seed('entity', [
    { id: 'sh-b', name: 'Subholding Beta', code: 'SHB', type: 'SUB_HOLDING', path: '/h/sh-b/', parentId: 'h' },
    { id: 'pt-b1', name: 'PT Beta Satu', code: 'BS1', type: 'PT', path: '/h/sh-b/pt-b1/', parentId: 'sh-b' },
    { id: 'sh-a', name: 'Subholding Alfa', code: 'SHA', type: 'SUB_HOLDING', path: '/h/sh-a/', parentId: 'h' },
    { id: 'sec-a', name: 'Sektor Alfa', code: 'SECA', type: 'SECTOR', path: '/h/sh-a/sec-a/', parentId: 'sh-a' },
    { id: 'pt-a1', name: 'PT Alfa Satu', code: 'AS1', type: 'PT', path: '/h/sh-a/pt-a1/', parentId: 'sh-a' },
    { id: 'pt-a2', name: 'PT Alfa Dua', code: 'AS2', type: 'PT', path: '/h/sh-a/sec-a/pt-a2/', parentId: 'sec-a' },
    { id: 'pt-a3', name: 'PT Alfa Nonaktif', code: 'AS3', type: 'PT', path: '/h/sh-a/pt-a3/', parentId: 'sh-a', isActive: false },
    { id: 'pt-a4', name: 'PT Alfa Empat', code: 'AS4', type: 'PT', path: '/h/sh-a/pt-a4/', parentId: 'sh-a' },
    { id: 'sh-off', name: 'Subholding Nonaktif', code: 'SHO', type: 'SUB_HOLDING', path: '/h/sh-off/', parentId: 'h', isActive: false },
  ])
  seed(
    'user',
    [
      { id: 'u-sha', name: 'Admin Subholding Alfa', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-a' },
      { id: 'u-sup', name: 'Sutan Supervisor', role: 'SUPERVISOR', scopeEntityId: null },
      { id: 'u-superuser', name: 'Kusuma Ketua', role: 'SUPERUSER', scopeEntityId: null },
    ].map((u) => ({ ...u, email: `${u.id}@contoh.test`, username: u.id.slice(2), passwordHash: `hash-${u.id}` }))
  )
})
afterEach(() => {
  vi.useRealTimers()
})

// ------------------------------------------------------------------
describe('parseShDecision — sorotan', () => {
  it('approve + highlight wajib catatan 5–280; bukan boolean ditolak; revise mengabaikan', () => {
    expect(parseShDecision({ action: 'approve', highlight: true })).toMatchObject({ ok: false, field: 'highlightNote' })
    expect(parseShDecision({ action: 'approve', highlight: true, highlightNote: 'ab 12 !!' })).toMatchObject({ ok: false, field: 'highlightNote' })
    expect(parseShDecision({ action: 'approve', highlight: true, highlightNote: 'a'.repeat(SH_LIMITS.highlightNote + 1) })).toMatchObject({ ok: false, field: 'highlightNote' })
    expect(parseShDecision({ action: 'approve', highlight: true, highlightNote: 'a'.repeat(SH_LIMITS.highlightNote) })).toMatchObject({ ok: true })
    expect(parseShDecision({ action: 'approve', highlight: 'ya', highlightNote: NOTE })).toMatchObject({ ok: false, field: 'highlight' })
    expect(parseShDecision({ action: 'approve', highlight: true, highlightNote: `  ${NOTE}  ` })).toEqual({
      ok: true,
      data: { action: 'approve', note: '', highlight: true, highlightNote: NOTE },
    })
    // highlight false/tanpa: catatan sorotan dibuang.
    expect(parseShDecision({ action: 'approve', highlight: false, highlightNote: NOTE })).toEqual({
      ok: true,
      data: { action: 'approve', note: '', highlight: false, highlightNote: null },
    })
    expect(parseShDecision({ action: 'revise', note: 'Foto kurang jelas', highlight: true })).toEqual({
      ok: true,
      data: { action: 'revise', note: 'Foto kurang jelas', highlight: false, highlightNote: null },
    })
  })
})

describe('POST /api/sh/reports/:id/decision — sorotan', () => {
  it('highlight tanpa catatan sah → 422 { error, field }, laporan tetap MENUNGGU tanpa jejak', async () => {
    const id = pendingWithEvidence()
    signIn('u-sup')
    for (const body of [
      { action: 'approve', highlight: true },
      { action: 'approve', highlight: true, highlightNote: '1234' },
      { action: 'approve', highlight: true, highlightNote: 'x'.repeat(281) },
      { action: 'approve', highlight: 1, highlightNote: NOTE },
    ]) {
      const res = await decide(id, body)
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(422)
      const b = await json(res)
      expect(typeof b.error).toBe('string')
      expect(['highlightNote', 'highlight']).toContain(b.field)
    }
    expect(one('subholdingReport', id)).toMatchObject({ status: 'MENUNGGU', highlight: false, highlightNote: null })
    expect(rows('auditLog')).toHaveLength(0)
  })

  it('approve + highlight menyimpan sorotan, catatan, waktu; audit mencatat; respons membawa sorotan', async () => {
    const id = pendingWithEvidence()
    signIn('u-sup')
    const res = await decide(id, { action: 'approve', note: 'Bagus, lanjutkan', highlight: true, highlightNote: NOTE })
    expect(res.status).toBe(200)
    const { report } = await json(res)
    expect(report).toMatchObject({ status: 'DISETUJUI', highlight: true, highlightNote: NOTE, highlightedAt: T0.toISOString() })
    expect(one('subholdingReport', id)).toMatchObject({
      status: 'DISETUJUI',
      decidedById: 'u-sup',
      highlight: true,
      highlightNote: NOTE,
    })
    expect((one('subholdingReport', id).highlightedAt as Date).getTime()).toBe(T0.getTime())
    const audit = rows('auditLog', { action: 'APPROVE_SH_REPORT', targetId: id })
    expect(audit).toHaveLength(1)
    expect(JSON.parse(audit[0].afterData as string)).toEqual({
      status: 'DISETUJUI',
      note: 'Bagus, lanjutkan',
      highlight: true,
      highlightNote: NOTE,
    })
    // Notifikasi ke Admin subholding tidak membawa catatan sorotan.
    const notes = rows('notificationLog', { userId: 'u-sha' })
    expect(notes).toHaveLength(1)
    expect(String(notes[0].payload)).not.toContain(NOTE)
  })

  it('approve tanpa highlight → false/null; audit tetap mencatat highlight false', async () => {
    const id = pendingWithEvidence()
    signIn('u-sup')
    const res = await decide(id, { action: 'approve', highlightNote: NOTE })
    expect(res.status).toBe(200)
    expect((await json(res)).report).toMatchObject({ highlight: false, highlightNote: null, highlightedAt: null })
    expect(one('subholdingReport', id)).toMatchObject({ highlight: false, highlightNote: null, highlightedAt: null })
    const audit = rows('auditLog', { action: 'APPROVE_SH_REPORT', targetId: id })
    expect(JSON.parse(audit[0].afterData as string)).toMatchObject({ highlight: false, highlightNote: null })
  })

  it('revise mengabaikan highlight', async () => {
    const id = pendingWithEvidence()
    signIn('u-sup')
    const res = await decide(id, { action: 'revise', note: 'Lampirkan foto lokasi', highlight: true, highlightNote: NOTE })
    expect(res.status).toBe(200)
    expect(one('subholdingReport', id)).toMatchObject({ status: 'PERLU_PERBAIKAN', highlight: false, highlightNote: null })
    const audit = rows('auditLog', { action: 'REVISE_SH_REPORT', targetId: id })
    expect(audit[0].afterData as string).not.toContain('highlight')
  })

  it('hanya supervisor/Super Admin: admin subholding, Superuser, Manajemen → 403 tanpa menyimpan sorotan', async () => {
    const id = pendingWithEvidence()
    for (const who of ['u-sha', 'u-superuser', 'u-mgmt', 'u-auditor']) {
      signIn(who)
      expect((await decide(id, { action: 'approve', highlight: true, highlightNote: NOTE })).status, who).toBe(403)
    }
    expect(one('subholdingReport', id)).toMatchObject({ status: 'MENUNGGU', highlight: false })
    signIn('u-super')
    expect((await decide(id, { action: 'approve', highlight: true, highlightNote: NOTE })).status).toBe(200)
    expect(one('subholdingReport', id)).toMatchObject({ highlight: true, highlightNote: NOTE })
  })
})

describe('sorotan di endpoint baca', () => {
  it('GET /api/sh/review menyertakan highlight + highlightNote', async () => {
    const hi = seedReport({ status: 'DISETUJUI', decidedAt: T0, highlight: true, highlightNote: NOTE, highlightedAt: T0 })
    const plain = seedReport({ status: 'DISETUJUI', decidedAt: T0, kegiatan: 'Biasa' })
    signIn('u-sup')
    const body = await json(await reviewGet(req('/api/sh/review?status=DISETUJUI')))
    const byId = new Map(body.items.map((r: Json) => [r.id, r]))
    expect(byId.get(hi)).toMatchObject({ highlight: true, highlightNote: NOTE, highlightedAt: T0.toISOString() })
    expect(byId.get(plain)).toMatchObject({ highlight: false, highlightNote: null, highlightedAt: null })
  })

  it('endpoint Admin subholding (reports, reports/:id, inbox) tidak menyertakan sorotan maupun catatannya', async () => {
    const hi = seedReport({ status: 'DISETUJUI', decidedAt: T0, highlight: true, highlightNote: NOTE, highlightedAt: T0 })
    seed('subholdingReportComment', [{ reportId: hi, authorId: 'u-sup', kind: 'SETUJU', body: 'Bagus' }])
    signIn('u-sha')

    const list = await reportsGet(req('/api/sh/reports?status=DISETUJUI'))
    expect(list.status).toBe(200)
    const listText = await list.text()
    expect(listText).not.toContain(NOTE)
    const items = (JSON.parse(listText) as Json).items as Json[]
    expect(items.map((r) => r.id)).toEqual([hi])
    expect(items[0]).not.toHaveProperty('highlight')
    expect(items[0]).not.toHaveProperty('highlightNote')

    const single = await reportGet(req(`/api/sh/reports/${hi}`), ctx(hi))
    expect(single.status).toBe(200)
    const singleText = await single.text()
    expect(singleText).not.toContain(NOTE)
    expect(singleText).not.toContain('highlight')

    const inbox = await inboxGet()
    expect(inbox.status).toBe(200)
    const inboxText = await inbox.text()
    expect(inboxText).toContain('Bagus')
    expect(inboxText).not.toContain(NOTE)
    expect(inboxText).not.toContain('highlight')
  })

  it('GET /api/sh/overview: highlight/highlightNote per laporan dan allPts (PT aktif, urut nama)', async () => {
    const hi = seedReport({ status: 'DISETUJUI', decidedAt: T0, highlight: true, highlightNote: NOTE, highlightedAt: T0 })
    const plain = seedReport({ status: 'DISETUJUI', decidedAt: T0, ptId: 'pt-a2', kegiatan: 'Biasa' })
    // Catatan lama tanpa flag tidak bocor.
    const stale = seedReport({ status: 'DISETUJUI', decidedAt: T0, kegiatan: 'Basi', highlight: false, highlightNote: 'Catatan basi lama' })
    signIn('u-superuser')
    const res = await overviewGet(req('/api/sh/overview'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('Catatan basi lama')
    const body = JSON.parse(text) as Json
    expect(body.subholdings.map((s: Json) => s.id)).toEqual(['sh-a', 'sh-b'])
    const alfa = body.subholdings[0]
    expect(alfa.allPts).toEqual([
      { id: 'pt-a2', name: 'PT Alfa Dua', lastReportDate: null },
      { id: 'pt-a4', name: 'PT Alfa Empat', lastReportDate: null },
      { id: 'pt-a1', name: 'PT Alfa Satu', lastReportDate: null },
    ])
    expect(body.subholdings[1].allPts).toEqual([{ id: 'pt-b1', name: 'PT Beta Satu', lastReportDate: null }])
    const reports = new Map(alfa.pts.flatMap((p: Json) => p.reports).map((r: Json) => [r.id, r]))
    expect(reports.get(hi)).toMatchObject({ highlight: true, highlightNote: NOTE })
    expect(reports.get(plain)).toMatchObject({ highlight: false, highlightNote: null })
    expect(reports.get(stale)).toMatchObject({ highlight: false, highlightNote: null })
  })
})

// ------------------------------------------------------------------
describe('GET /api/sh/overview/week', () => {
  it('7 hari berakhir hari ini (WIB); counts = laporan DISETUJUI per reportDate; semua subholding aktif', async () => {
    seedReport({ status: 'DISETUJUI', reportDate: TODAY })
    seedReport({ status: 'DISETUJUI', reportDate: TODAY, ptId: 'pt-a2' })
    seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-6) })
    seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-7) }) // di luar rentang
    seedReport({ status: 'DISETUJUI', reportDate: dayOffset(1) }) // besok: di luar
    seedReport({ status: 'MENUNGGU', reportDate: TODAY })
    seedReport({ status: 'PERLU_PERBAIKAN', reportDate: dayOffset(-1) })
    seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-2), subholdingId: 'sh-b', ptId: 'pt-b1' })

    signIn('u-superuser')
    const res = await weekGet(req('/api/sh/overview/week'))
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.days).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
    expect(body.start).toBe('2026-10-08')
    expect(body.end).toBe('2026-10-14')
    expect(body.subholdings).toEqual([
      { id: 'sh-a', name: 'Subholding Alfa', counts: [1, 0, 0, 0, 0, 0, 2] },
      { id: 'sh-b', name: 'Subholding Beta', counts: [0, 0, 0, 0, 1, 0, 0] },
    ])
    expect(body.highlights).toEqual([])
  })

  it('end eksplisit menggeser jendela; end tidak sah → 422', async () => {
    seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-7) })
    signIn('u-sup')
    const body = await json(await weekGet(req('/api/sh/overview/week?end=2026-10-07')))
    expect(body.days[0]).toBe('2026-10-01')
    expect(body.days[6]).toBe('2026-10-07')
    expect(body.subholdings[0].counts).toEqual([0, 0, 0, 0, 0, 0, 1])
    for (const bad of ['kemarin', '2026-02-31', '2026-1-1']) {
      expect((await weekGet(req(`/api/sh/overview/week?end=${bad}`))).status, bad).toBe(422)
    }
  })

  it('subholdingId: hanya subholding itu + pts (semua PT aktif, urut nama) beserta counts; tak dikenal → 404', async () => {
    seedReport({ status: 'DISETUJUI', reportDate: TODAY })
    seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-1), ptId: 'pt-a2' })
    seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-1), ptId: 'pt-a2' })
    seedReport({ status: 'DISETUJUI', reportDate: TODAY, subholdingId: 'sh-b', ptId: 'pt-b1' })
    signIn('u-mgmt')
    const res = await weekGet(req('/api/sh/overview/week?subholdingId=sh-a'))
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.subholdings).toEqual([
      {
        id: 'sh-a',
        name: 'Subholding Alfa',
        counts: [0, 0, 0, 0, 0, 2, 1],
        pts: [
          { id: 'pt-a2', name: 'PT Alfa Dua', counts: [0, 0, 0, 0, 0, 2, 0] },
          { id: 'pt-a4', name: 'PT Alfa Empat', counts: [0, 0, 0, 0, 0, 0, 0] },
          { id: 'pt-a1', name: 'PT Alfa Satu', counts: [0, 0, 0, 0, 0, 0, 1] },
        ],
      },
    ])
    for (const id of ['tidak-ada', 'sh-off', 'pt-a1']) {
      expect((await weekGet(req(`/api/sh/overview/week?subholdingId=${id}`))).status, id).toBe(404)
    }
  })

  it('highlights: DISETUJUI + disorot dalam 7 hari, terbaru dulu, sesuai cakupan subholding, maks 50', async () => {
    const old = seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-5), highlight: true, highlightNote: 'Catatan lama sekali', highlightedAt: T0, kegiatan: 'Lama' })
    const today = seedReport({ status: 'DISETUJUI', reportDate: TODAY, ptId: 'pt-a2', highlight: true, highlightNote: NOTE, highlightedAt: T0, kegiatan: 'Baru' })
    const beta = seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-2), subholdingId: 'sh-b', ptId: 'pt-b1', highlight: true, highlightNote: 'Catatan beta', highlightedAt: T0 })
    seedReport({ status: 'DISETUJUI', reportDate: dayOffset(-8), highlight: true, highlightNote: 'Di luar rentang' })
    seedReport({ status: 'MENUNGGU', reportDate: TODAY, highlight: true, highlightNote: 'Belum disetujui' })
    seedReport({ status: 'DISETUJUI', reportDate: TODAY, highlight: false })

    signIn('u-superuser')
    const res = await weekGet(req('/api/sh/overview/week'))
    const text = await res.text()
    expect(text).not.toContain('Di luar rentang')
    expect(text).not.toContain('Belum disetujui')
    const body = JSON.parse(text) as Json
    expect(body.highlights).toEqual([
      { id: today, date: '2026-10-14', kegiatan: 'Baru', subholdingId: 'sh-a', subholdingName: 'Subholding Alfa', ptName: 'PT Alfa Dua', highlightNote: NOTE },
      { id: beta, date: '2026-10-12', kegiatan: 'Kegiatan contoh', subholdingId: 'sh-b', subholdingName: 'Subholding Beta', ptName: 'PT Beta Satu', highlightNote: 'Catatan beta' },
      { id: old, date: '2026-10-09', kegiatan: 'Lama', subholdingId: 'sh-a', subholdingName: 'Subholding Alfa', ptName: 'PT Alfa Satu', highlightNote: 'Catatan lama sekali' },
    ])
    const onlyB = await json(await weekGet(req('/api/sh/overview/week?subholdingId=sh-b')))
    expect(onlyB.highlights.map((h: Json) => h.id)).toEqual([beta])

    for (let i = 0; i < 55; i++) seedReport({ status: 'DISETUJUI', reportDate: TODAY, highlight: true, highlightNote: `Sorotan ke ${i}` })
    const capped = await json(await weekGet(req('/api/sh/overview/week')))
    expect(capped.highlights).toHaveLength(50)
  })

  it('akses: Superuser, Manajemen, Supervisor, Super Admin 200; admin subholding, TI, auditor, admin PT 403; tanpa sesi 401', async () => {
    for (const who of ['u-superuser', 'u-mgmt', 'u-sup', 'u-super']) {
      signIn(who)
      expect((await weekGet(req('/api/sh/overview/week'))).status, who).toBe(200)
    }
    for (const who of ['u-sha', 'u-ti', 'u-auditor', 'u-admin-a', 'u-pic-a']) {
      signIn(who)
      expect((await weekGet(req('/api/sh/overview/week'))).status, who).toBe(403)
    }
    cookie.value = undefined
    expect((await weekGet(req('/api/sh/overview/week'))).status).toBe(401)
  })
})
