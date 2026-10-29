import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Model laporan SUBHOLDING (kontrak docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md)
 * dengan basis data tiruan di memori (tests/api/admin-fake-db.ts):
 * gerbang tiap peran, cakupan subholding (anti-IDOR), PT di luar subholding,
 * alur status, wajib bukti saat setuju, balapan keputusan, dashboard hanya
 * DISETUJUI, aturan baca bukti, dan penolakan peran baru di rute lama.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})
const storageLog = vi.hoisted(() => ({ removed: [] as string[] }))
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  storageConfigured: () => true,
  removeEvidence: async (key: string) => {
    storageLog.removed.push(key)
  },
  signedEvidenceUrl: async (key: string) => `https://signed.test/${key}`,
}))

import { AUTH_SECRET_FOR_TESTS, cookie, one, rows, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { startOfWibDay } from '@/lib/lock'
import { can, tabsForRole, defaultTabForRole } from '@/lib/rbac'
import { ROLE_LABELS, NAV_TABS } from '@/lib/constants'
import { previousWorkingDay } from '@/lib/subholding/reminders'
import { parseShDecision, parseShReportInput, reporterTitle } from '@/lib/subholding/rules'
import { GET as optionsGet } from '@/app/api/sh/options/route'
import { GET as reportsGet, POST as reportsPost } from '@/app/api/sh/reports/route'
import { DELETE as reportDelete, GET as reportGet, PATCH as reportPatch } from '@/app/api/sh/reports/[id]/route'
import { POST as commentPost } from '@/app/api/sh/reports/[id]/comments/route'
import { PATCH as commentPatch } from '@/app/api/sh/reports/[id]/comments/[commentId]/route'
import { POST as decisionPost } from '@/app/api/sh/reports/[id]/decision/route'
import { GET as inboxGet } from '@/app/api/sh/inbox/route'
import { POST as inboxReadPost } from '@/app/api/sh/inbox/read/route'
import { GET as reviewGet } from '@/app/api/sh/review/route'
import { GET as overviewGet } from '@/app/api/sh/overview/route'
import { GET as evidenceList, POST as evidenceLinkPost } from '@/app/api/evidence/route'
import { DELETE as evidenceDelete, GET as evidenceGet } from '@/app/api/evidence/[id]/route'
import { GET as navBadgesGet } from '@/app/api/nav-badges/route'
import { GET as projectsGet } from '@/app/api/projects/route'
import { GET as dailyInputGet } from '@/app/api/daily-input/route'
import { GET as ringkasanGet } from '@/app/api/ringkasan/route'
import { GET as workDeskGet } from '@/app/api/work-desk/route'
import { GET as entitiesGet } from '@/app/api/entities/route'
import { GET as dashboardGet } from '@/app/api/dashboard/route'
import { GET as profileGet } from '@/app/api/profile/route'
import { GET as notificationsGet } from '@/app/api/notifications/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

// Rabu 14 Okt 2026 10.00 WIB; hari kerja sebelumnya Selasa 13 Okt.
const T0 = new Date('2026-10-14T03:00:00Z')
const TODAY = startOfWibDay(T0)
const YESTERDAY = new Date(TODAY.getTime() - 86_400_000)

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

function req(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const json = async (res: Response) => (await res.json()) as Json

const VALID = {
  kegiatan: 'Pengecoran lantai 2 gudang',
  deskripsi: 'Pengecoran selesai 80 persen, menunggu material besi.',
  ptId: 'pt-a1',
  reporterName: 'Rina Lestari',
  reporterTitleKind: 'MANAJER',
  reporterTitleField: 'Proyek',
}

function seedReport(data: Json): string {
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  storageLog.removed.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  seed('entity', [
    { id: 'sh-a', name: 'Subholding Alfa', code: 'SHA', type: 'SUB_HOLDING', path: '/h/sh-a/', parentId: 'h' },
    { id: 'sec-a', name: 'Sektor Alfa', code: 'SECA', type: 'SECTOR', path: '/h/sh-a/sec-a/', parentId: 'sh-a' },
    { id: 'pt-a1', name: 'PT Alfa Satu', code: 'AS1', type: 'PT', path: '/h/sh-a/pt-a1/', parentId: 'sh-a' },
    { id: 'pt-a2', name: 'PT Alfa Dua', code: 'AS2', type: 'PT', path: '/h/sh-a/sec-a/pt-a2/', parentId: 'sec-a' },
    { id: 'pt-a3', name: 'PT Alfa Nonaktif', code: 'AS3', type: 'PT', path: '/h/sh-a/pt-a3/', parentId: 'sh-a', isActive: false },
    { id: 'sh-b', name: 'Subholding Beta', code: 'SHB', type: 'SUB_HOLDING', path: '/h/sh-b/', parentId: 'h' },
    { id: 'pt-b1', name: 'PT Beta Satu', code: 'BS1', type: 'PT', path: '/h/sh-b/pt-b1/', parentId: 'sh-b' },
  ])
  seed(
    'user',
    [
      { id: 'u-sha', name: 'Admin Subholding Alfa', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-a' },
      { id: 'u-shb', name: 'Admin Subholding Beta', role: 'ADMIN_SUBHOLDING', scopeEntityId: 'sh-b' },
      { id: 'u-sup', name: 'Sutan Supervisor', role: 'SUPERVISOR', scopeEntityId: null },
      { id: 'u-sup2', name: 'Sekar Supervisor', role: 'SUPERVISOR', scopeEntityId: null },
      { id: 'u-superuser', name: 'Kusuma Ketua', role: 'SUPERUSER', scopeEntityId: null },
    ].map((u) => ({ ...u, email: `${u.id}@contoh.test`, username: u.id.slice(2), passwordHash: `hash-${u.id}` }))
  )
})
afterEach(() => {
  vi.useRealTimers()
})

// ------------------------------------------------------------------
describe('peran, tab, kapabilitas', () => {
  it('tab dan label sesuai kontrak; Manajemen hanya sh-overview', () => {
    expect(tabsForRole('ADMIN_SUBHOLDING')).toEqual(['sh-dashboard', 'sh-inbox', 'sh-history'])
    expect(tabsForRole('SUPERVISOR')).toEqual(['sh-review'])
    expect(tabsForRole('SUPERUSER')).toEqual(['sh-overview'])
    expect(tabsForRole('MANAJEMEN')).toEqual(['sh-overview'])
    expect(defaultTabForRole('MANAJEMEN')).toBe('sh-overview')
    expect(ROLE_LABELS).toMatchObject({ ADMIN_SUBHOLDING: 'Admin subholding', SUPERVISOR: 'Supervisor', SUPERUSER: 'Superuser', MANAJEMEN: 'Manajemen' })
    const ids = NAV_TABS.map((t) => t.id as string)
    for (const id of ['sh-dashboard', 'sh-inbox', 'sh-history', 'sh-review', 'sh-overview']) expect(ids).toContain(id)
  })

  it('kapabilitas shreport:* hanya pada peran yang ditetapkan; TI tidak mendapatkannya', () => {
    expect(can('ADMIN_SUBHOLDING', 'shreport:write')).toBe(true)
    expect(can('ADMIN_SUBHOLDING', 'shreport:review')).toBe(false)
    expect(can('SUPERVISOR', 'shreport:review')).toBe(true)
    expect(can('SUPERADMIN', 'shreport:review')).toBe(true)
    expect(can('SUPERADMIN', 'shreport:write')).toBe(false)
    for (const r of ['SUPERUSER', 'MANAJEMEN', 'SUPERVISOR', 'SUPERADMIN']) expect(can(r, 'shreport:view-approved'), r).toBe(true)
    for (const c of ['shreport:write', 'shreport:review', 'shreport:view-approved'] as const) {
      expect(can('TI', c)).toBe(false)
      expect(can('AUDITOR', c)).toBe(false)
    }
    expect(can('ADMIN_SUBHOLDING', 'daily:input')).toBe(false)
    expect(can('SUPERVISOR', 'group:read')).toBe(false)
  })

  it('aturan murni: jabatan, validasi isian, catatan perbaikan', () => {
    expect(reporterTitle('MANAJER', 'Proyek')).toBe('Manajer Proyek')
    expect(parseShReportInput({ ...VALID, reporterTitleKind: 'kepala' })).toMatchObject({ ok: true, data: { reporterTitleKind: 'KEPALA' } })
    expect(parseShReportInput({ ...VALID, kegiatan: '   ' })).toMatchObject({ ok: false, field: 'kegiatan' })
    expect(parseShReportInput({ ...VALID, deskripsi: 'x'.repeat(4001) })).toMatchObject({ ok: false, field: 'deskripsi' })
    expect(parseShReportInput({ ...VALID, reporterName: 'x'.repeat(121) })).toMatchObject({ ok: false, field: 'reporterName' })
    expect(parseShReportInput({ ...VALID, reporterTitleField: 'x'.repeat(81) })).toMatchObject({ ok: false, field: 'reporterTitleField' })
    expect(parseShReportInput({ ...VALID, reporterTitleKind: 'DIREKTUR' })).toMatchObject({ ok: false, field: 'reporterTitleKind' })
    expect(parseShDecision({ action: 'revise', note: '12345 !!' })).toMatchObject({ ok: false, field: 'note' })
    expect(parseShDecision({ action: 'revise', note: 'Foto kurang' })).toMatchObject({ ok: true })
    expect(parseShDecision({ action: 'approve' })).toMatchObject({ ok: true, data: { note: '' } })
    expect(parseShDecision({ action: 'hapus' })).toMatchObject({ ok: false })
  })

  it('hari kerja sebelumnya: Senin → Jumat, Rabu → Selasa', () => {
    expect(previousWorkingDay(T0).toISOString()).toBe(YESTERDAY.toISOString())
    const monday = new Date('2026-10-12T03:00:00Z')
    expect(previousWorkingDay(monday).toISOString()).toBe(startOfWibDay(new Date('2026-10-09T03:00:00Z')).toISOString())
  })
})

// ------------------------------------------------------------------
describe('GET /api/sh/options', () => {
  it('admin subholding: PT aktif keturunan subholding (lewat sektor juga), bukan PT subholding lain', async () => {
    seedReport({ reporterName: 'Rina', reporterTitleKind: 'MANAJER', reporterTitleField: 'Proyek' })
    seedReport({ reporterName: 'rina', reporterTitleKind: 'MANAJER', reporterTitleField: 'proyek' })
    seedReport({ reporterName: 'Bayu', reporterTitleKind: 'KEPALA', reporterTitleField: 'Keuangan' })
    seedReport({ subholdingId: 'sh-b', ptId: 'pt-b1', reporterName: 'Orang Beta' })
    signIn('u-sha')
    const res = await optionsGet()
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.subholding).toEqual({ id: 'sh-a', name: 'Subholding Alfa' })
    expect(body.pts.map((p: Json) => p.id).sort()).toEqual(['pt-a1', 'pt-a2'])
    expect(body.reporters).toHaveLength(2)
    expect(body.reporters.map((r: Json) => r.name)).not.toContain('Orang Beta')
  })

  it('peran lain ditolak 403', async () => {
    for (const who of ['u-sup', 'u-superuser', 'u-mgmt', 'u-super', 'u-ti', 'u-admin-a', 'u-auditor']) {
      signIn(who)
      expect((await optionsGet()).status, who).toBe(403)
    }
  })

  it('admin subholding tanpa subholding aktif → 403', async () => {
    one('entity', 'sh-a').isActive = false
    signIn('u-sha')
    expect((await optionsGet()).status).toBe(403)
  })
})

// ------------------------------------------------------------------
describe('POST /api/sh/reports', () => {
  it('membuat laporan MENUNGGU hari ini + audit + notifikasi supervisor', async () => {
    signIn('u-sha')
    const res = await reportsPost(req('/api/sh/reports', 'POST', VALID))
    expect(res.status).toBe(201)
    const { report } = await json(res)
    expect(report).toMatchObject({
      subholdingId: 'sh-a',
      subholdingName: 'Subholding Alfa',
      ptId: 'pt-a1',
      ptName: 'PT Alfa Satu',
      reportDate: '2026-10-14',
      status: 'MENUNGGU',
      reporterTitle: 'Manajer Proyek',
      evidenceCount: 0,
      evidence: [],
      comments: [],
      canEdit: true,
      canWithdraw: true,
    })
    expect(one('subholdingReport', report.id)).toMatchObject({ createdById: 'u-sha', reportDate: TODAY })
    expect(rows('auditLog', { action: 'CREATE_SH_REPORT', targetId: report.id })).toHaveLength(1)
    const notes = rows('notificationLog', { template: 'SH_LAPORAN_BARU' })
    expect(notes.map((n) => n.userId).sort()).toEqual(['u-sup', 'u-sup2'])
  })

  it('PT lewat sektor diterima; PT subholding lain / di luar subholding / nonaktif / bukan PT → 422', async () => {
    signIn('u-sha')
    expect((await reportsPost(req('/api/sh/reports', 'POST', { ...VALID, ptId: 'pt-a2' }))).status).toBe(201)
    for (const ptId of ['pt-b1', 'pt-a', 'pt-a3', 'sec-a', 'sh-a', 'tidak-ada']) {
      const res = await reportsPost(req('/api/sh/reports', 'POST', { ...VALID, ptId }))
      expect(res.status, ptId).toBe(422)
    }
    expect(rows('subholdingReport')).toHaveLength(1)
  })

  it('validasi isian → 422 tanpa menulis', async () => {
    signIn('u-sha')
    for (const bad of [
      { ...VALID, kegiatan: '' },
      { ...VALID, kegiatan: 'x'.repeat(201) },
      { ...VALID, deskripsi: 'x'.repeat(4001) },
      { ...VALID, reporterTitleKind: 'STAF' },
      { ...VALID, reporterName: undefined },
    ]) {
      expect((await reportsPost(req('/api/sh/reports', 'POST', bad))).status).toBe(422)
    }
    expect((await reportsPost(req('/api/sh/reports', 'POST', [1, 2]))).status).toBe(400)
    expect(rows('subholdingReport')).toHaveLength(0)
  })

  it('Idempotency-Key: ulangan dibalas respons pertama, satu laporan, satu notifikasi', async () => {
    signIn('u-sha')
    const headers = { 'Idempotency-Key': 'sh-laporan-0001-abcdef' }
    const a = await reportsPost(req('/api/sh/reports', 'POST', VALID, headers))
    const b = await reportsPost(req('/api/sh/reports', 'POST', VALID, headers))
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    expect(b.headers.get('Idempotency-Replayed')).toBe('true')
    expect((await json(b)).report.id).toBe((await json(a)).report.id)
    expect(rows('subholdingReport')).toHaveLength(1)
    expect(rows('notificationLog', { template: 'SH_LAPORAN_BARU' })).toHaveLength(2)
  })

  it('supervisor, superuser, manajemen, super admin tidak membuat laporan', async () => {
    for (const who of ['u-sup', 'u-superuser', 'u-mgmt', 'u-super']) {
      signIn(who)
      expect((await reportsPost(req('/api/sh/reports', 'POST', VALID))).status, who).toBe(403)
    }
  })
})

// ------------------------------------------------------------------
describe('cakupan subholding (anti-IDOR)', () => {
  it('admin B tidak bisa membaca/mengubah/menarik/berkomentar/memberi bukti laporan subholding A', async () => {
    const id = seedReport({})
    signIn('u-shb')
    const list = await json(await reportsGet(req('/api/sh/reports')))
    expect(list.items).toEqual([])
    expect(list.total).toBe(0)
    expect((await reportGet(req(`/api/sh/reports/${id}`), ctx(id))).status).toBe(404)
    expect((await reportPatch(req(`/api/sh/reports/${id}`, 'PATCH', { kegiatan: 'Diubah' }), ctx(id))).status).toBe(404)
    expect((await reportDelete(req(`/api/sh/reports/${id}`, 'DELETE'), ctx(id))).status).toBe(404)
    expect((await commentPost(req(`/api/sh/reports/${id}/comments`, 'POST', { body: 'Halo' }), ctx(id))).status).toBe(404)
    const link = await evidenceLinkPost(
      req('/api/evidence', 'POST', { targetType: 'SUBHOLDING_REPORT', targetId: id, fileName: 'Bukti', url: 'https://contoh.test/b' })
    )
    expect(link.status).toBe(403)
    expect(one('subholdingReport', id)).toMatchObject({ kegiatan: 'Kegiatan contoh', status: 'MENUNGGU' })
    expect(rows('evidence')).toHaveLength(0)
  })

  it('admin A memindahkan laporan ke PT subholding B lewat PATCH → 422', async () => {
    const id = seedReport({})
    signIn('u-sha')
    const res = await reportPatch(req(`/api/sh/reports/${id}`, 'PATCH', { ptId: 'pt-b1' }), ctx(id))
    expect(res.status).toBe(422)
    expect(one('subholdingReport', id).ptId).toBe('pt-a1')
  })

  it('GET /api/sh/reports: bawaan hari ini, saringan status/PT/cari, hitungan per status', async () => {
    seedReport({ kegiatan: 'Gudang baru', status: 'MENUNGGU' })
    seedReport({ kegiatan: 'Jalan akses', status: 'DISETUJUI', ptId: 'pt-a2' })
    seedReport({ kegiatan: 'Kemarin', reportDate: YESTERDAY })
    seedReport({ subholdingId: 'sh-b', ptId: 'pt-b1', kegiatan: 'Beta' })
    signIn('u-sha')
    const all = await json(await reportsGet(req('/api/sh/reports')))
    expect(all.items.map((r: Json) => r.kegiatan).sort()).toEqual(['Gudang baru', 'Jalan akses'])
    expect(all.counts).toEqual({ MENUNGGU: 1, PERLU_PERBAIKAN: 0, DISETUJUI: 1 })
    const approved = await json(await reportsGet(req('/api/sh/reports?status=DISETUJUI')))
    expect(approved.items.map((r: Json) => r.kegiatan)).toEqual(['Jalan akses'])
    expect(approved.items[0]).toMatchObject({ canEdit: false, canWithdraw: false })
    expect(approved.counts).toEqual({ MENUNGGU: 1, PERLU_PERBAIKAN: 0, DISETUJUI: 1 })
    const range = await json(await reportsGet(req('/api/sh/reports?from=2026-10-13&to=2026-10-14&q=kemarin')))
    expect(range.items.map((r: Json) => r.kegiatan)).toEqual(['Kemarin'])
    const byPt = await json(await reportsGet(req('/api/sh/reports?ptId=pt-a2')))
    expect(byPt.total).toBe(1)
    expect((await reportsGet(req('/api/sh/reports?from=2026-13-01'))).status).toBe(422)
    expect((await reportsGet(req('/api/sh/reports?from=2026-10-14&to=2026-10-01'))).status).toBe(422)
    expect((await reportsGet(req('/api/sh/reports?status=HAPUS'))).status).toBe(422)
  })
})

// ------------------------------------------------------------------
describe('alur status', () => {
  it('ubah saat MENUNGGU → minta perbaikan (wajib catatan) → perbaiki & kirim ulang → MENUNGGU', async () => {
    const id = seedReport({})
    signIn('u-sha')
    const edit = await reportPatch(req(`/api/sh/reports/${id}`, 'PATCH', { kegiatan: 'Kegiatan diperbarui' }), ctx(id))
    expect(edit.status).toBe(200)
    expect((await json(edit)).report).toMatchObject({ kegiatan: 'Kegiatan diperbarui', status: 'MENUNGGU' })
    expect(rows('auditLog', { action: 'UPDATE_SH_REPORT' })).toHaveLength(1)

    signIn('u-sup')
    expect((await decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'revise' }), ctx(id))).status).toBe(422)
    expect((await decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'revise', note: 'ok' }), ctx(id))).status).toBe(422)
    expect(one('subholdingReport', id).status).toBe('MENUNGGU')
    const revise = await decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'revise', note: 'Lampirkan foto lokasi' }), ctx(id))
    expect(revise.status).toBe(200)
    expect((await json(revise)).report).toMatchObject({ status: 'PERLU_PERBAIKAN', decidedByName: 'Sutan Supervisor' })
    expect(rows('subholdingReportComment', { reportId: id, kind: 'PERBAIKAN' })).toHaveLength(1)
    expect(rows('auditLog', { action: 'REVISE_SH_REPORT' })).toHaveLength(1)
    expect(rows('notificationLog', { template: 'SH_KEPUTUSAN', userId: 'u-sha' })).toHaveLength(1)
    expect(rows('notificationLog', { template: 'SH_KEPUTUSAN', userId: 'u-shb' })).toHaveLength(0)

    signIn('u-sha')
    // Tarik hanya saat MENUNGGU.
    expect((await reportDelete(req(`/api/sh/reports/${id}`, 'DELETE'), ctx(id))).status).toBe(409)
    vi.setSystemTime(new Date(T0.getTime() + 3_600_000))
    const fix = await reportPatch(req(`/api/sh/reports/${id}`, 'PATCH', { deskripsi: 'Foto lokasi sudah dilampirkan' }), ctx(id))
    expect(fix.status).toBe(200)
    expect(one('subholdingReport', id)).toMatchObject({ status: 'MENUNGGU', decidedById: null, decidedAt: null })
    expect((one('subholdingReport', id).submittedAt as Date).getTime()).toBe(T0.getTime() + 3_600_000)
    expect(rows('auditLog', { action: 'RESUBMIT_SH_REPORT' })).toHaveLength(1)
    expect(rows('notificationLog', { template: 'SH_LAPORAN_KIRIM_ULANG' })).toHaveLength(2)
  })

  it('setujui tanpa bukti → 409 dan status tetap; dengan bukti → DISETUJUI dan terkunci', async () => {
    const id = seedReport({})
    signIn('u-sup')
    const none = await decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'approve' }), ctx(id))
    expect(none.status).toBe(409)
    expect(one('subholdingReport', id)).toMatchObject({ status: 'MENUNGGU', decidedById: null })
    expect(rows('auditLog', { action: 'APPROVE_SH_REPORT' })).toHaveLength(0)

    signIn('u-sha')
    const link = await evidenceLinkPost(
      req('/api/evidence', 'POST', { targetType: 'SUBHOLDING_REPORT', targetId: id, fileName: 'Foto drive', url: 'https://contoh.test/foto' })
    )
    expect(link.status).toBe(200)
    const evId = (await json(link)).evidence.id as string

    signIn('u-sup')
    const ok = await decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'approve', note: 'Bagus, lanjutkan' }), ctx(id))
    expect(ok.status).toBe(200)
    expect((await json(ok)).report).toMatchObject({ status: 'DISETUJUI', evidenceCount: 1 })
    expect(rows('subholdingReportComment', { reportId: id, kind: 'SETUJU' })).toHaveLength(1)
    expect((await decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'revise', note: 'Ubah lagi saja' }), ctx(id))).status).toBe(409)

    signIn('u-sha')
    expect((await reportPatch(req(`/api/sh/reports/${id}`, 'PATCH', { kegiatan: 'Ubah' }), ctx(id))).status).toBe(409)
    expect((await reportDelete(req(`/api/sh/reports/${id}`, 'DELETE'), ctx(id))).status).toBe(409)
    expect(
      (await evidenceLinkPost(req('/api/evidence', 'POST', { targetType: 'SUBHOLDING_REPORT', targetId: id, fileName: 'Lagi', url: 'https://contoh.test/2' }))).status
    ).toBe(409)
    expect((await evidenceDelete(req(`/api/evidence/${evId}`, 'DELETE'), ctx(evId))).status).toBe(409)
    expect(rows('evidence', { targetId: id })).toHaveLength(1)
    expect(one('subholdingReport', id).status).toBe('DISETUJUI')
  })

  it('hanya peninjau yang memutuskan: admin, superuser, manajemen, TI → 403', async () => {
    const id = seedReport({})
    seedEvidence(id)
    for (const who of ['u-sha', 'u-superuser', 'u-mgmt', 'u-ti', 'u-auditor']) {
      signIn(who)
      expect((await decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'approve' }), ctx(id))).status, who).toBe(403)
    }
    signIn('u-super')
    expect((await decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'approve' }), ctx(id))).status).toBe(200)
  })

  it('balapan: dua supervisor memutuskan bersamaan → satu 200, satu 409, satu audit', async () => {
    const id = seedReport({})
    seedEvidence(id)
    signIn('u-sup')
    const [a, b] = await Promise.all([
      decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'approve' }), ctx(id)),
      decisionPost(req(`/api/sh/reports/${id}/decision`, 'POST', { action: 'revise', note: 'Perlu foto tambahan' }), ctx(id)),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const decided = rows('auditLog', { targetType: 'SUBHOLDING_REPORT' }).filter((r) => /APPROVE|REVISE/.test(String(r.action)))
    expect(decided).toHaveLength(1)
    expect(['DISETUJUI', 'PERLU_PERBAIKAN']).toContain(one('subholdingReport', id).status)
  })

  it('tarik laporan MENUNGGU: laporan, komentar, baris bukti terhapus; berkas storage dibuang setelah commit', async () => {
    const id = seedReport({})
    seedEvidence(id)
    seedEvidence(id, { storageKey: 'link:x', url: 'https://contoh.test/tautan', mime: 'text/uri-list' })
    seed('subholdingReportComment', [{ reportId: id, authorId: 'u-sup', kind: 'KOMENTAR', body: 'Catatan' }])
    signIn('u-sha')
    const res = await reportDelete(req(`/api/sh/reports/${id}`, 'DELETE'), ctx(id))
    expect(res.status).toBe(200)
    expect(rows('subholdingReport')).toHaveLength(0)
    expect(rows('subholdingReportComment')).toHaveLength(0)
    expect(rows('evidence')).toHaveLength(0)
    expect(storageLog.removed).toEqual([`SUBHOLDING_REPORT/${id}/foto.jpg`])
    expect(rows('auditLog', { action: 'WITHDRAW_SH_REPORT' })).toHaveLength(1)
  })

  it('super admin boleh mengubah dan menghapus laporan DISETUJUI', async () => {
    const id = seedReport({ status: 'DISETUJUI' })
    signIn('u-super')
    const res = await reportPatch(req(`/api/sh/reports/${id}`, 'PATCH', { kegiatan: 'Koreksi ejaan' }), ctx(id))
    expect(res.status).toBe(200)
    expect(one('subholdingReport', id)).toMatchObject({ kegiatan: 'Koreksi ejaan', status: 'DISETUJUI' })
    expect((await reportDelete(req(`/api/sh/reports/${id}`, 'DELETE'), ctx(id))).status).toBe(200)
  })

  it('supervisor dan superuser tidak bisa mengubah/menarik laporan', async () => {
    const id = seedReport({})
    for (const who of ['u-sup', 'u-superuser', 'u-mgmt']) {
      signIn(who)
      expect((await reportPatch(req(`/api/sh/reports/${id}`, 'PATCH', { kegiatan: 'X' }), ctx(id))).status, who).toBe(403)
      expect((await reportDelete(req(`/api/sh/reports/${id}`, 'DELETE'), ctx(id))).status, who).toBe(403)
    }
  })
})

// ------------------------------------------------------------------
describe('komentar dan kotak masuk', () => {
  it('supervisor berkomentar (KOMENTAR), admin membalas (BALASAN); superuser 403', async () => {
    const id = seedReport({ status: 'DISETUJUI' })
    signIn('u-sup')
    const c = await commentPost(req(`/api/sh/reports/${id}/comments`, 'POST', { body: 'Mohon detail biaya' }), ctx(id))
    expect(c.status).toBe(201)
    const cb = await json(c)
    expect(cb.comment).toMatchObject({ kind: 'KOMENTAR', authorName: 'Sutan Supervisor', authorRole: 'SUPERVISOR', mine: true })
    expect(rows('notificationLog', { template: 'SH_KOMENTAR', userId: 'u-sha' })).toHaveLength(1)

    signIn('u-sha')
    const r = await commentPost(req(`/api/sh/reports/${id}/comments`, 'POST', { body: 'Biaya Rp 20 juta' }), ctx(id))
    expect(r.status).toBe(201)
    expect((await json(r)).comment.kind).toBe('BALASAN')
    expect(rows('notificationLog', { template: 'SH_KOMENTAR', userId: 'u-sup' })).toHaveLength(1)
    expect((await commentPost(req(`/api/sh/reports/${id}/comments`, 'POST', { body: '' }), ctx(id))).status).toBe(422)
    expect((await commentPost(req(`/api/sh/reports/${id}/comments`, 'POST', { body: 'x'.repeat(2001) }), ctx(id))).status).toBe(422)

    signIn('u-superuser')
    expect((await commentPost(req(`/api/sh/reports/${id}/comments`, 'POST', { body: 'Halo' }), ctx(id))).status).toBe(403)
  })

  it('penulis mengubah komentarnya sendiri: editedAt, readAt dikosongkan, audit; selain penulis ditolak', async () => {
    const id = seedReport({ status: 'PERLU_PERBAIKAN' })
    const other = seedReport({})
    const [fix, reply] = seed('subholdingReportComment', [
      { reportId: id, authorId: 'u-sup', kind: 'PERBAIKAN', body: 'Tambahkan foto', readAt: T0 },
      { reportId: id, authorId: 'u-sha', kind: 'BALASAN', body: 'Siap' },
    ])
    const path = (rid: string, cid: string) => `/api/sh/reports/${rid}/comments/${cid}`
    const cctx = (rid: string, cid: string) => ({ params: Promise.resolve({ id: rid, commentId: cid }) })
    const patch = (rid: string, cid: string, body: unknown) => commentPatch(req(path(rid, cid), 'PATCH', body), cctx(rid, cid))

    signIn('u-sup')
    const ok = await patch(id, fix.id as string, { body: '  Tambahkan foto sisi utara  ' })
    expect(ok.status).toBe(200)
    const okb = await json(ok)
    expect(okb.comment).toMatchObject({ id: fix.id, kind: 'PERBAIKAN', body: 'Tambahkan foto sisi utara', mine: true })
    expect(okb.comment.editedAt).toBe(T0.toISOString())
    expect(okb.report.comments.map((c: Json) => c.body)).toEqual(['Tambahkan foto sisi utara', 'Siap'])
    const saved = one('subholdingReportComment', fix.id as string)
    expect(saved).toMatchObject({ body: 'Tambahkan foto sisi utara', kind: 'PERBAIKAN', readAt: null })
    expect(rows('auditLog', { action: 'EDIT_SH_COMMENT', targetId: id })).toHaveLength(1)
    expect(JSON.parse(rows('auditLog', { action: 'EDIT_SH_COMMENT' })[0].beforeData as string)).toMatchObject({ body: 'Tambahkan foto' })

    // Isi sama → tanpa tulisan baru.
    expect((await patch(id, fix.id as string, { body: 'Tambahkan foto sisi utara' })).status).toBe(200)
    expect(rows('auditLog', { action: 'EDIT_SH_COMMENT' })).toHaveLength(1)

    // Bukan penulis, komentar laporan lain, isi kosong / terlalu panjang.
    expect((await patch(id, reply.id as string, { body: 'Diubah supervisor' })).status).toBe(403)
    expect((await patch(other, fix.id as string, { body: 'Salah laporan' })).status).toBe(404)
    expect((await patch(id, 'tidak-ada', { body: 'Halo' })).status).toBe(404)
    expect((await patch(id, fix.id as string, { body: '   ' })).status).toBe(422)
    expect((await patch(id, fix.id as string, { body: 'x'.repeat(2001) })).status).toBe(422)

    signIn('u-sha')
    expect((await patch(id, reply.id as string, { body: 'Siap, foto menyusul sore ini' })).status).toBe(200)
    expect(one('subholdingReportComment', reply.id as string).body).toBe('Siap, foto menyusul sore ini')
    expect((await patch(id, fix.id as string, { body: 'Diubah admin' })).status).toBe(403)

    // Admin subholding lain tidak melihat laporannya (anti-IDOR) → 404.
    signIn('u-shb')
    expect((await patch(id, reply.id as string, { body: 'Bukan milik saya' })).status).toBe(404)
    signIn('u-superuser')
    expect((await patch(id, fix.id as string, { body: 'Halo' })).status).toBe(403)
    expect(one('subholdingReportComment', fix.id as string).body).toBe('Tambahkan foto sisi utara')
  })

  it('kotak masuk: pesan peninjau subholding sendiri, belum dibaca, pengingat PT tanpa laporan kemarin', async () => {
    const a = seedReport({})
    const b = seedReport({ subholdingId: 'sh-b', ptId: 'pt-b1' })
    seedEvidence(a)
    seedReport({ ptId: 'pt-a1', reportDate: YESTERDAY })
    seed('subholdingReportComment', [
      { reportId: a, authorId: 'u-sup', kind: 'PERBAIKAN', body: 'Tambahkan foto' },
      { reportId: a, authorId: 'u-sha', kind: 'BALASAN', body: 'Siap' },
      { reportId: b, authorId: 'u-sup', kind: 'KOMENTAR', body: 'Untuk Beta' },
    ])
    signIn('u-sha')
    const box = await json(await inboxGet())
    expect(box.items).toHaveLength(1)
    expect(box.items[0]).toMatchObject({
      kind: 'PERBAIKAN',
      unread: true,
      authorName: 'Sutan Supervisor',
      report: { id: a, ptName: 'PT Alfa Satu', reporterTitle: 'Kepala Keuangan', evidenceCount: 1 },
    })
    expect(box.unreadCount).toBe(1)
    expect(box.reminders.map((r: Json) => r.text)).toEqual([expect.stringContaining('PT Alfa Dua')])

    const badges = await json(await navBadgesGet())
    expect(badges.badges).toEqual({ 'sh-inbox': 1 })

    // Id pesan subholding lain diabaikan diam-diam.
    const betaComment = rows('subholdingReportComment', { reportId: b })[0].id as string
    const marked = await json(await inboxReadPost(req('/api/sh/inbox/read', 'POST', { ids: [box.items[0].id, betaComment] })))
    expect(marked.marked).toBe(1)
    expect(one('subholdingReportComment', betaComment).readAt).toBeNull()
    expect((await json(await inboxGet())).unreadCount).toBe(0)
    expect((await inboxReadPost(req('/api/sh/inbox/read', 'POST', {}))).status).toBe(422)

    signIn('u-sup')
    expect((await inboxGet()).status).toBe(403)
    expect((await json(await navBadgesGet())).badges).toEqual({ 'sh-review': 3 })
  })
})

// ------------------------------------------------------------------
describe('GET /api/sh/review', () => {
  it('supervisor melihat semua subholding; hitungan & antrean per subholding', async () => {
    seedReport({ kegiatan: 'A menunggu' })
    seedReport({ kegiatan: 'A disetujui', status: 'DISETUJUI' })
    seedReport({ subholdingId: 'sh-b', ptId: 'pt-b1', kegiatan: 'B menunggu' })
    signIn('u-sup')
    const all = await json(await reviewGet(req('/api/sh/review')))
    expect(all.items.map((r: Json) => r.kegiatan).sort()).toEqual(['A menunggu', 'B menunggu'])
    expect(all.counts).toEqual({ MENUNGGU: 2, PERLU_PERBAIKAN: 0, DISETUJUI: 1 })
    expect(all.subholdings).toEqual([
      { id: 'sh-a', name: 'Subholding Alfa', waiting: 1, oldestAt: expect.any(String) },
      { id: 'sh-b', name: 'Subholding Beta', waiting: 1, oldestAt: expect.any(String) },
    ])
    expect(all.today).toEqual({ approved: 0, highlighted: 0, revised: 0 })
    const onlyB = await json(await reviewGet(req('/api/sh/review?subholdingId=sh-b')))
    expect(onlyB.items.map((r: Json) => r.kegiatan)).toEqual(['B menunggu'])
    expect(onlyB.items[0]).toMatchObject({ canEdit: false, canWithdraw: false })
    const approved = await json(await reviewGet(req('/api/sh/review?status=DISETUJUI&date=2026-10-14')))
    expect(approved.items.map((r: Json) => r.kegiatan)).toEqual(['A disetujui'])
    expect((await reviewGet(req('/api/sh/review?status=X'))).status).toBe(422)
  })

  it('rekap keputusan peninjau hari ini & antrean terlama per subholding', async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 3 * 86400_000)
    seedReport({ kegiatan: 'Lama', submittedAt: old })
    seedReport({ kegiatan: 'Baru', submittedAt: now })
    seedReport({ kegiatan: 'S1', status: 'DISETUJUI', decidedById: 'u-sup', decidedAt: now })
    seedReport({ kegiatan: 'S2', status: 'DISETUJUI', decidedById: 'u-sup', decidedAt: now, highlight: true, highlightNote: 'Penting sekali' })
    seedReport({ kegiatan: 'P1', status: 'PERLU_PERBAIKAN', decidedById: 'u-sup', decidedAt: now })
    seedReport({ kegiatan: 'Kemarin', status: 'DISETUJUI', decidedById: 'u-sup', decidedAt: old })
    seedReport({ kegiatan: 'Orang lain', status: 'DISETUJUI', decidedById: 'u-sa', decidedAt: now })
    signIn('u-sup')
    const res = await json(await reviewGet(req('/api/sh/review')))
    expect(res.today).toEqual({ approved: 2, highlighted: 1, revised: 1 })
    expect(res.subholdings.find((s: Json) => s.id === 'sh-a')).toMatchObject({ waiting: 2, oldestAt: old.toISOString() })
    expect(res.subholdings.find((s: Json) => s.id === 'sh-b')).toMatchObject({ waiting: 0, oldestAt: null })
  })

  it('admin, superuser, manajemen, TI → 403', async () => {
    for (const who of ['u-sha', 'u-superuser', 'u-mgmt', 'u-ti']) {
      signIn(who)
      expect((await reviewGet(req('/api/sh/review'))).status, who).toBe(403)
    }
  })
})

// ------------------------------------------------------------------
describe('GET /api/sh/overview', () => {
  it('hanya DISETUJUI pada tanggal itu; semua subholding aktif tampil walau 0', async () => {
    const decided = new Date('2026-10-14T03:24:00Z') // 10.24 WIB
    const ok = seedReport({
      kegiatan: 'Disetujui A1',
      status: 'DISETUJUI',
      reporterName: 'Budi Santoso',
      reporterTitleKind: 'MANAJER',
      reporterTitleField: 'Proyek',
      decidedAt: decided,
    })
    seedEvidence(ok)
    seedReport({ kegiatan: 'Rahasia menunggu', status: 'MENUNGGU', ptId: 'pt-a2' })
    seedReport({ kegiatan: 'Rahasia perbaikan', status: 'PERLU_PERBAIKAN', subholdingId: 'sh-b', ptId: 'pt-b1' })
    seedReport({ kegiatan: 'Disetujui kemarin', status: 'DISETUJUI', reportDate: YESTERDAY })
    for (const who of ['u-superuser', 'u-mgmt', 'u-sup', 'u-super']) {
      signIn(who)
      const res = await overviewGet(req('/api/sh/overview'))
      expect(res.status, who).toBe(200)
      const text = await res.text()
      expect(text).not.toContain('Rahasia')
      expect(text).not.toContain('Disetujui kemarin')
      const body = JSON.parse(text) as Json
      expect(body.date).toBe('2026-10-14')
      expect(body.subholdings).toEqual([
        {
          id: 'sh-a',
          name: 'Subholding Alfa',
          count: 1,
          ptCount: 1,
          pts: [
            {
              id: 'pt-a1',
              name: 'PT Alfa Satu',
              reports: [
                {
                  id: ok,
                  kegiatan: 'Disetujui A1',
                  deskripsi: 'Deskripsi contoh',
                  reporterName: 'Budi Santoso',
                  reporterTitle: 'Manajer Proyek',
                  decidedAt: '2026-10-14T03:24:00.000Z',
                  highlight: false,
                  highlightNote: null,
                  evidence: [{ id: expect.any(String), fileName: 'foto.jpg', mime: 'image/jpeg', kind: 'file' }],
                },
              ],
            },
          ],
          // Semua PT aktif (urut nama, termasuk lewat sektor; nonaktif tidak).
          allPts: [
            { id: 'pt-a2', name: 'PT Alfa Dua' },
            { id: 'pt-a1', name: 'PT Alfa Satu' },
          ],
        },
        { id: 'sh-b', name: 'Subholding Beta', count: 0, ptCount: 0, pts: [], allPts: [{ id: 'pt-b1', name: 'PT Beta Satu' }] },
      ])
    }
    signIn('u-superuser')
    const yesterday = await json(await overviewGet(req('/api/sh/overview?date=2026-10-13')))
    expect(yesterday.subholdings[0].pts[0].reports[0]).toMatchObject({
      kegiatan: 'Disetujui kemarin',
      reporterName: 'Pelapor',
      reporterTitle: 'Kepala Keuangan',
      decidedAt: null,
    })
    expect((await overviewGet(req('/api/sh/overview?date=kemarin'))).status).toBe(422)
  })

  it('admin subholding, TI, auditor, admin PT → 403', async () => {
    for (const who of ['u-sha', 'u-ti', 'u-auditor', 'u-admin-a']) {
      signIn(who)
      expect((await overviewGet(req('/api/sh/overview'))).status, who).toBe(403)
    }
  })
})

// ------------------------------------------------------------------
describe('bukti SUBHOLDING_REPORT', () => {
  it('baca: superuser & manajemen hanya laporan DISETUJUI; supervisor semua; admin lain & peran lama ditolak', async () => {
    const approved = seedReport({ status: 'DISETUJUI' })
    const pending = seedReport({})
    const evOk = seedEvidence(approved)
    const evPending = seedEvidence(pending)
    const open = (id: string) => evidenceGet(req(`/api/evidence/${id}`), ctx(id))

    for (const who of ['u-superuser', 'u-mgmt']) {
      signIn(who)
      const ok = await open(evOk)
      expect(ok.status, who).toBe(200)
      expect((await json(ok)).url).toBe(`https://signed.test/SUBHOLDING_REPORT/${approved}/foto.jpg`)
      expect((await open(evPending)).status, who).toBe(403)
      expect((await evidenceList(req(`/api/evidence?targetType=SUBHOLDING_REPORT&targetId=${pending}`))).status, who).toBe(403)
      expect((await evidenceList(req(`/api/evidence?targetType=SUBHOLDING_REPORT&targetId=${approved}`))).status, who).toBe(200)
    }
    for (const who of ['u-sup', 'u-super', 'u-sha']) {
      signIn(who)
      expect((await open(evPending)).status, who).toBe(200)
    }
    for (const who of ['u-shb', 'u-ti', 'u-auditor', 'u-sdm', 'u-admin-a']) {
      signIn(who)
      expect((await open(evOk)).status, who).toBe(403)
      expect((await open(evPending)).status, who).toBe(403)
    }
  })

  it('tulis: hanya admin pemilik (dan super admin); supervisor/superuser/TI ditolak; hapus bukti saat MENUNGGU', async () => {
    const id = seedReport({})
    const ev = seedEvidence(id)
    const body = { targetType: 'SUBHOLDING_REPORT', targetId: id, fileName: 'Tautan', url: 'https://contoh.test/x' }
    for (const who of ['u-sup', 'u-superuser', 'u-mgmt', 'u-ti']) {
      signIn(who)
      expect((await evidenceLinkPost(req('/api/evidence', 'POST', body))).status, who).toBe(403)
      expect((await evidenceDelete(req(`/api/evidence/${ev}`, 'DELETE'), ctx(ev))).status, who).toBe(403)
    }
    signIn('u-sha')
    const del = await evidenceDelete(req(`/api/evidence/${ev}`, 'DELETE'), ctx(ev))
    expect(del.status).toBe(200)
    expect((await json(del)).evidenceCount).toBe(0)
    expect(storageLog.removed).toEqual([`SUBHOLDING_REPORT/${id}/foto.jpg`])
    expect(rows('auditLog', { action: 'REMOVE_EVIDENCE' })).toHaveLength(1)
  })

  it('peran subholding tidak membaca bukti target lama (cakupan lama tertutup)', async () => {
    seed('dailyProjectReport', [
      { id: 'dr-1', projectId: 'prj-a', entityId: 'pt-a', reportDate: TODAY, status: 'ON_PROGRESS', submittedAt: T0, submittedById: 'u-pic-a' },
    ])
    one('entity', 'pt-a').path = '/h/sh-a/pt-a/' // PT lama di bawah subholding A
    const [ev] = seed('evidence', [
      { targetType: 'DAILY_REPORT', targetId: 'dr-1', storageKey: 'k', fileName: 'f', mime: 'image/png', size: 1, url: null },
    ])
    for (const who of ['u-sha', 'u-sup', 'u-superuser']) {
      signIn(who)
      expect((await evidenceGet(req(`/api/evidence/${ev.id}`), ctx(ev.id as string))).status, who).toBe(403)
    }
  })
})

// ------------------------------------------------------------------
describe('peran baru ditolak di rute lama', () => {
  it('projects, daily-input, ringkasan, work-desk, entities, dashboard → 403', async () => {
    // Subpohon subholding A berisi PT lama dengan proyek: tidak boleh bocor.
    one('entity', 'pt-a').path = '/h/sh-a/pt-a/'
    for (const who of ['u-sha', 'u-sup', 'u-superuser']) {
      signIn(who)
      expect((await projectsGet(req('/api/projects'))).status, `${who} projects`).toBe(403)
      expect((await dailyInputGet(req('/api/daily-input'))).status, `${who} daily-input`).toBe(403)
      expect((await ringkasanGet()).status, `${who} ringkasan`).toBe(403)
      expect((await workDeskGet()).status, `${who} work-desk`).toBe(403)
      expect((await entitiesGet(req('/api/entities'))).status, `${who} entities`).toBe(403)
      expect((await dashboardGet(req('/api/dashboard'))).status, `${who} dashboard`).toBe(403)
    }
  })

  it('profil dan notifikasi sendiri tetap terbuka untuk peran baru', async () => {
    for (const who of ['u-sha', 'u-sup', 'u-superuser']) {
      signIn(who)
      expect((await profileGet()).status, who).toBe(200)
      expect((await notificationsGet(req('/api/notifications?inbox=1'))).status, who).toBe(200)
    }
  })
})
