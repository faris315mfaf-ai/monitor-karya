import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [F3-D] Peran grup & pengawas dengan basis data tiruan di memori dan sesi
 * sungguhan:
 *
 *  - /api/system/grup: panel per peran (SDM GA, TI/Super Admin, Auditor), lainnya 403;
 *  - ApprovalRequest: Direksi holding (SDM GA) memutuskan cuti di PT mana pun,
 *    Direktur entitas hanya PT-nya, Auditor tidak memutuskan; Urungkan 15 menit
 *    hanya oleh pemutus yang sama dan menghapus catatan cuti yang dibuatnya;
 *  - WeeklyReportComment: pengawas dalam cakupan menanggapi, PT lain 404,
 *    TI hanya membaca, kepala divisi pemilik membalas;
 *  - ProjectReview: pengawas dalam cakupan menandai, PT lain 403, Auditor &
 *    Admin PT tidak menandai, urungkan hanya oleh peninjau dalam 15 menit.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})

import { AUTH_SECRET_FOR_TESTS, auditActions, cookie, one, rows, seed, world } from './admin-fake-db'
import { createSessionToken } from '@/lib/auth'
import { isoWeekOf, weeklyDeadlines } from '@/lib/lock'
import { GET as grupGet } from '@/app/api/system/grup/route'
import { GET as approvalsGet, PATCH as approvalsPatch, POST as approvalsPost } from '@/app/api/approval-requests/route'
import { DELETE as commentDelete, GET as commentsGet, POST as commentPost } from '@/app/api/weekly-comments/route'
import { DELETE as reviewDelete, GET as reviewsGet, POST as reviewPost } from '@/app/api/project-reviews/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const T0 = new Date('2026-10-06T03:00:00Z') // Selasa 10.00 WIB
const MIN = 60000

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.30.0.1', 'user-agent': 'vitest' },
  })

async function call(as: string, handler: (r: NextRequest) => Promise<Response>, method: string, url: string, body?: unknown) {
  signIn(as)
  const res = await handler(req(method, url, body))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/system/grup', () => {
  it('panel sesuai peran grup; peran berlingkup PT dan Manajemen 403', async () => {
    expect((await call('u-sdm', () => grupGet(), 'GET', '/api/system/grup')).body.kind).toBe('SDM')
    expect((await call('u-ti', () => grupGet(), 'GET', '/api/system/grup')).body.kind).toBe('TEKNIS')
    expect((await call('u-super', () => grupGet(), 'GET', '/api/system/grup')).body.kind).toBe('TEKNIS')
    expect((await call('u-auditor', () => grupGet(), 'GET', '/api/system/grup')).body.kind).toBe('AUDIT')
    for (const who of ['u-admin-a', 'u-dir-a', 'u-kadiv-a', 'u-pic-a', 'u-mgmt']) {
      expect((await call(who, () => grupGet(), 'GET', '/api/system/grup')).status, who).toBe(403)
    }
  })
})

describe('ApprovalRequest — cuti PIC diputuskan peran grup', () => {
  async function leave(as = 'u-pic-a') {
    const r = await call(as, approvalsPost, 'POST', '/api/approval-requests', {
      type: 'CUTI', title: 'Cuti keluarga', startDate: '2026-10-08', endDate: '2026-10-12',
    })
    expect(r.status).toBe(201)
    return (r.body.item as { id: string }).id
  }
  const decide = (as: string, id: string, action: string, note?: string) =>
    call(as, approvalsPatch, 'PATCH', '/api/approval-requests', { id, action, note })

  it('tersimpan di PT pengaju; Direktur PT itu melihatnya, Direktur PT lain tidak', async () => {
    const id = await leave()
    expect(one('approvalRequest', id)).toMatchObject({ entityId: 'pt-a', requestedById: 'u-pic-a', status: 'DIAJUKAN' })
    const a = await call('u-dir-a', approvalsGet, 'GET', '/api/approval-requests')
    expect((a.body.items as { id: string }[]).map((i) => i.id)).toEqual([id])
    const b = await call('u-dir-b', approvalsGet, 'GET', '/api/approval-requests')
    expect(b.body.items).toEqual([])
    const sdm = await call('u-sdm', approvalsGet, 'GET', '/api/approval-requests')
    expect((sdm.body.items as unknown[]).length).toBe(1)
    const aud = await call('u-auditor', approvalsGet, 'GET', '/api/approval-requests')
    expect(aud.body.canDecide).toBe(false)
  })

  it('Direktur PT lain 404; Auditor & Admin PT 403; tidak ada yang berubah', async () => {
    const id = await leave()
    expect((await decide('u-dir-b', id, 'approve')).status).toBe(404)
    expect((await decide('u-auditor', id, 'approve')).status).toBe(403)
    expect((await decide('u-admin-a', id, 'approve')).status).toBe(403)
    expect(one('approvalRequest', id).status).toBe('DIAJUKAN')
    expect(rows('attendance')).toHaveLength(0)
  })

  it('SDM GA menyetujui: Attendance CUTI hanya hari kerja, PIC diberi tahu; urungkan 15 menit oleh pemutus yang sama', async () => {
    const id = await leave()
    const ok = await decide('u-sdm', id, 'approve', 'Selamat beristirahat')
    expect(ok.status).toBe(200)
    expect(one('approvalRequest', id)).toMatchObject({ status: 'DISETUJUI', decidedById: 'u-sdm' })
    // 8–12 Okt 2026: Kamis, Jumat, (Sabtu, Minggu), Senin → 3 hari kerja.
    expect(rows('attendance', { userId: 'u-pic-a', status: 'CUTI' })).toHaveLength(3)
    expect(rows('notificationLog', { userId: 'u-pic-a' }).length).toBeGreaterThan(0)
    expect(auditActions()).toContain('APPROVE_APPROVAL_REQUEST')

    // Pemutus lain tidak bisa mengurungkan keputusan SDM GA.
    expect((await decide('u-mgmt', id, 'undo')).status).toBe(403)
    vi.setSystemTime(new Date(T0.getTime() + 10 * MIN))
    expect((await decide('u-sdm', id, 'undo')).status).toBe(200)
    expect(one('approvalRequest', id)).toMatchObject({ status: 'DIAJUKAN', decidedById: null })
    expect(rows('attendance')).toHaveLength(0)
  })

  it('urungkan lewat 15 menit ditolak 409; keputusan tetap', async () => {
    const id = await leave()
    await decide('u-mgmt', id, 'approve')
    vi.setSystemTime(new Date(T0.getTime() + 16 * MIN))
    expect((await decide('u-mgmt', id, 'undo')).status).toBe(409)
    expect(one('approvalRequest', id).status).toBe('DISETUJUI')
    expect(rows('attendance')).toHaveLength(3)
  })

  it('menolak wajib beralasan; keputusan kedua 409', async () => {
    const id = await leave()
    expect((await decide('u-dir-a', id, 'reject')).status).toBe(422)
    expect((await decide('u-dir-a', id, 'reject', 'Bentrok tenggat gudang')).status).toBe(200)
    expect((await decide('u-sdm', id, 'approve')).status).toBe(409)
  })
})

describe('WeeklyReportComment — tanggapan laporan mingguan', () => {
  let reportId: string
  beforeEach(() => {
    const { isoYear, isoWeek } = isoWeekOf(T0)
    const { periodStart, periodEnd } = weeklyDeadlines(T0)
    ;[{ id: reportId }] = seed('weeklyDivisionReport', [
      { divisionId: 'div-a1', entityId: 'pt-a', isoYear, isoWeek, periodStart, periodEnd, statusHeader: 'MENUNGGU_PERSETUJUAN', submittedAt: T0 },
    ]) as { id: string }[]
  })
  const post = (as: string, body: string) => call(as, commentPost, 'POST', '/api/weekly-comments', { weeklyReportId: reportId, body })

  it('pengawas dalam cakupan menanggapi; PT lain 404; TI, Admin PT, Auditor tidak menulis', async () => {
    const a = await post('u-dir-a', 'Mohon rinci kendala gudang.')
    expect(a.status).toBe(201)
    expect(rows('notificationLog', { userId: 'u-kadiv-a' })).toHaveLength(1)
    expect((await post('u-sdm', 'Catatan SDM GA.')).status).toBe(201)

    expect((await post('u-dir-b', 'Mencoba dari PT lain.')).status).toBe(404)
    expect((await post('u-ti', 'TI menulis.')).status).toBe(403)
    expect((await post('u-admin-a', 'Admin menulis.')).status).toBe(403)
    expect((await post('u-auditor', 'Auditor menulis.')).status).toBe(404)
    expect((await post('u-pic-a', 'PIC menulis.')).status).toBe(404)
    expect(rows('weeklyReportComment')).toHaveLength(2)

    // Direktur PT lain juga tidak bisa membaca.
    expect((await call('u-dir-b', commentsGet, 'GET', `/api/weekly-comments?weeklyReportId=${reportId}`)).status).toBe(404)
    const ti = await call('u-ti', commentsGet, 'GET', `/api/weekly-comments?weeklyReportId=${reportId}`)
    expect(ti.status).toBe(200)
    expect(ti.body.canComment).toBe(false)
  })

  it('kepala divisi pemilik membalas; penanggap diberi tahu', async () => {
    await post('u-dir-a', 'Mohon rinci kendala gudang.')
    const reply = await post('u-kadiv-a', 'Kendala ada di pengiriman semen.')
    expect(reply.status).toBe(201)
    expect(rows('notificationLog', { userId: 'u-dir-a' })).toHaveLength(1)
  })

  it('tanggapan hanya bisa ditarik penulisnya dalam 15 menit', async () => {
    const a = await post('u-dir-a', 'Mohon rinci kendala gudang.')
    const id = (a.body.item as { id: string }).id
    expect((await call('u-sdm', commentDelete, 'DELETE', '/api/weekly-comments', { id })).status).toBe(404)
    vi.setSystemTime(new Date(T0.getTime() + 16 * MIN))
    expect((await call('u-dir-a', commentDelete, 'DELETE', '/api/weekly-comments', { id })).status).toBe(409)
    expect(rows('weeklyReportComment')).toHaveLength(1)
  })
})

describe('ProjectReview — tanda "sudah ditinjau"', () => {
  const mark = (as: string, projectId: string) => call(as, reviewPost, 'POST', '/api/project-reviews', { projectId, note: 'Progres sesuai.' })

  it('pengawas dalam cakupan menandai; PT lain 403; Auditor, Admin PT, PIC tidak menandai', async () => {
    expect((await mark('u-dir-a', 'prj-a')).status).toBe(201)
    expect((await mark('u-sdm', 'prj-b')).status).toBe(201)
    expect((await mark('u-ti', 'prj-a')).status).toBe(201)
    expect((await mark('u-dir-b', 'prj-a')).status).toBe(403)
    for (const who of ['u-auditor', 'u-admin-a', 'u-pic-a', 'u-kadiv-a']) {
      expect((await mark(who, 'prj-a')).status, who).toBe(403)
    }
    expect((await mark('u-dir-a', 'tidak-ada')).status).toBe(404)
    expect(rows('projectReview')).toHaveLength(3)
    expect(rows('auditLog', { action: 'REVIEW_PROJECT' })).toHaveLength(3)
  })

  it('riwayat dibaca pihak proyek; Direktur PT lain 403', async () => {
    await mark('u-dir-a', 'prj-a')
    const pic = await call('u-pic-a', reviewsGet, 'GET', '/api/project-reviews?projectId=prj-a')
    expect(pic.status).toBe(200)
    expect(pic.body.canReview).toBe(false)
    expect((pic.body.items as unknown[]).length).toBe(1)
    expect((await call('u-dir-b', reviewsGet, 'GET', '/api/project-reviews?projectId=prj-a')).status).toBe(403)
    expect((await call('u-pic-b', reviewsGet, 'GET', '/api/project-reviews?projectId=prj-a')).status).toBe(403)
  })

  it('urungkan: hanya peninjau sendiri, dalam 15 menit', async () => {
    const r = await mark('u-dir-a', 'prj-a')
    const id = (r.body.review as { id: string }).id
    expect((await call('u-mgmt', reviewDelete, 'DELETE', '/api/project-reviews', { id })).status).toBe(404)
    vi.setSystemTime(new Date(T0.getTime() + 15 * MIN + 1000))
    expect((await call('u-dir-a', reviewDelete, 'DELETE', '/api/project-reviews', { id })).status).toBe(409)
    vi.setSystemTime(new Date(T0.getTime() + 5 * MIN))
    expect((await call('u-dir-a', reviewDelete, 'DELETE', '/api/project-reviews', { id })).status).toBe(200)
    expect(rows('projectReview')).toHaveLength(0)
  })
})
