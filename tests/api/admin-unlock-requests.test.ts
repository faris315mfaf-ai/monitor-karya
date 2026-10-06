import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [F3-D] /api/unlock-requests ujung ke ujung dengan basis data tiruan di
 * memori: ajukan (hak & cakupan, PIC hanya laporan harian proyeknya),
 * setujui (Direksi holding/TI), jalankan & kunci kembali (TI/Super Admin),
 * kunci kembali otomatis, dan efeknya pada /api/daily-input serta
 * /api/weekly-input — laporan yang beku/terkunci hanya bisa ditulis selama
 * buka kunci berlaku.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})
vi.mock('@/lib/storage', () => ({ storageConfigured: () => false, removeEvidence: vi.fn() }))

import { AUTH_SECRET_FOR_TESTS, auditActions, cookie, one, rows, seed, world } from './admin-fake-db'
import { createSessionToken } from '@/lib/auth'
import { isoWeekOf, isoWeekStart, startOfWibDay, weeklyDeadlines } from '@/lib/lock'
import { FORWARDED_FROZEN_MESSAGE } from '@/lib/daily-rollup'
import { GET, PATCH, POST } from '@/app/api/unlock-requests/route'
import { PUT as dailyPut, DELETE as dailyDelete } from '@/app/api/daily-input/route'
import { DELETE as weeklyDelete } from '@/app/api/weekly-input/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const HOUR = 3600000
const DAY = 24 * HOUR
const T0 = new Date('2026-10-06T03:00:00Z') // Selasa 10.00 WIB

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

const json = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.4.5.6' },
  })

async function request(as: string, targetType: string, targetId: string, reason = 'Salah ketik progres, perlu diperbaiki.') {
  signIn(as)
  const res = await POST(json('POST', '/api/unlock-requests', { targetType, targetId, reason }))
  return { res, body: (await res.json()) as { item?: { id: string }; error?: string } }
}

async function act(as: string, id: string, action: string, extra: Record<string, unknown> = {}) {
  signIn(as)
  const res = await PATCH(json('PATCH', '/api/unlock-requests', { id, action, ...extra }))
  return { res, body: (await res.json()) as Record<string, unknown> & { item?: Record<string, unknown> } }
}

let dailyId: string
let pastWeeklyId: string
let pastItemId: string

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  cookie.value = undefined
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // Laporan harian hari ini sudah dikirim PIC dan diteruskan Admin PT ke holding (beku).
  ;[{ id: dailyId }] = seed('dailyProjectReport', [
    {
      projectId: 'prj-a', entityId: 'pt-a', reportDate: startOfWibDay(T0), status: 'ON_PROGRESS', progressPct: 40,
      achievementToday: 'Pondasi selesai', submittedAt: new Date(T0.getTime() - HOUR), submittedById: 'u-pic-a',
      forwardedAt: new Date(T0.getTime() - HOUR / 2), forwardedById: 'u-admin-a', isLocked: true, lockedAt: T0,
    },
  ]) as { id: string }[]
  // Laporan mingguan Divisi Teknik PT Alfa untuk minggu lalu (hanya dibaca).
  const start = new Date(isoWeekStart(T0).getTime() - 7 * DAY)
  const { isoYear, isoWeek } = isoWeekOf(start)
  const { periodStart, periodEnd } = weeklyDeadlines(start)
  ;[{ id: pastWeeklyId }] = seed('weeklyDivisionReport', [
    { divisionId: 'div-a1', entityId: 'pt-a', isoYear, isoWeek, periodStart, periodEnd, statusHeader: 'DISETUJUI' },
  ]) as { id: string }[]
  ;[{ id: pastItemId }] = seed('weeklyReportItem', [{ weeklyReportId: pastWeeklyId, workItem: 'Item salah input', status: 'SELESAI' }]) as { id: string }[]
})
afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/unlock-requests — ajukan', () => {
  it('kepala divisi, direktur entitas, dan auditor tidak mengajukan (403)', async () => {
    for (const who of ['u-kadiv-a', 'u-dir-a', 'u-auditor']) {
      expect((await request(who, 'DAILY_REPORT', dailyId)).res.status).toBe(403)
    }
    expect(rows('unlockRequest')).toHaveLength(0)
  })

  it('alasan kurang dari 10 huruf dan sasaran rusak ditolak 422', async () => {
    expect((await request('u-admin-a', 'DAILY_REPORT', dailyId, 'salah')).res.status).toBe(422)
    expect((await request('u-admin-a', 'TABEL_LAIN', dailyId)).res.status).toBe(422)
    expect((await request('u-admin-a', 'DAILY_REPORT', '')).res.status).toBe(422)
  })

  it('laporan PT lain dijawab 404 (anti-IDOR)', async () => {
    const r = await request('u-admin-b', 'DAILY_REPORT', dailyId)
    expect(r.res.status).toBe(404)
    expect((await request('u-pic-b', 'DAILY_REPORT', dailyId)).res.status).toBe(404)
    expect(rows('unlockRequest')).toHaveLength(0)
  })

  it('PIC hanya untuk laporan harian proyek yang ia pegang', async () => {
    expect((await request('u-pic-a2', 'DAILY_REPORT', dailyId)).res.status).toBe(404) // PT sama, bukan PIC-nya
    expect((await request('u-pic-a', 'WEEKLY_REPORT', pastWeeklyId)).res.status).toBe(404)
    const own = await request('u-pic-a', 'DAILY_REPORT', dailyId)
    expect(own.res.status).toBe(201)
    expect(one('unlockRequest', own.body.item!.id)).toMatchObject({ status: 'DIAJUKAN', requestedById: 'u-pic-a', targetType: 'DAILY_REPORT' })
    expect(auditActions()).toEqual(['REQUEST_UNLOCK'])
  })

  it('satu laporan hanya punya satu pengajuan yang masih diproses (409)', async () => {
    expect((await request('u-pic-a', 'DAILY_REPORT', dailyId)).res.status).toBe(201)
    expect((await request('u-admin-a', 'DAILY_REPORT', dailyId)).res.status).toBe(409)
  })
})

describe('PATCH /api/unlock-requests — setujui, jalankan, kunci kembali', () => {
  it('hak tiap langkah: Admin PT/Kadiv/Auditor tidak menyetujui; SDM GA tidak menjalankan; urutan dijaga', async () => {
    const id = (await request('u-pic-a', 'DAILY_REPORT', dailyId)).body.item!.id
    for (const who of ['u-admin-a', 'u-kadiv-a', 'u-dir-a', 'u-auditor', 'u-mgmt']) {
      expect((await act(who, id, 'approve')).res.status).toBe(403)
    }
    expect((await act('u-ti', id, 'execute')).res.status).toBe(409) // belum disetujui
    expect((await act('u-sdm', id, 'approve')).res.status).toBe(200)
    expect((await act('u-sdm', id, 'execute')).res.status).toBe(403)
    expect((await act('u-sdm', id, 'approve')).res.status).toBe(409) // sudah diputuskan
    expect(one('unlockRequest', id)).toMatchObject({ status: 'DISETUJUI', approvedById: 'u-sdm' })
    expect((await act('u-ti', id, 'bogus')).res.status).toBe(400)
  })

  it('pengaju tidak menyetujui pengajuannya sendiri', async () => {
    const id = (await request('u-ti', 'DAILY_REPORT', dailyId)).body.item!.id
    expect((await act('u-ti', id, 'approve')).res.status).toBe(403)
    expect(one('unlockRequest', id).status).toBe('DIAJUKAN')
  })

  it('tolak: DITOLAK, PIC diberi tahu, laporan tetap beku', async () => {
    const id = (await request('u-pic-a', 'DAILY_REPORT', dailyId)).body.item!.id
    expect((await act('u-sdm', id, 'reject')).res.status).toBe(200)
    expect(one('unlockRequest', id).status).toBe('DITOLAK')
    expect(rows('notificationLog', { userId: 'u-pic-a', template: 'KEPUTUSAN_BUKA_KUNCI' })).toHaveLength(1)
    expect((await act('u-ti', id, 'execute')).res.status).toBe(409)
    expect(one('dailyProjectReport', dailyId).isLocked).toBe(true)
  })

  it('jalankan: laporan dibuka, masa buka dibatasi 72 jam, setiap langkah tercatat', async () => {
    const id = (await request('u-pic-a', 'DAILY_REPORT', dailyId)).body.item!.id
    await act('u-sdm', id, 'approve')
    const ex = await act('u-ti', id, 'execute', { hours: 500 })
    expect(ex.res.status).toBe(200)
    const row = one('unlockRequest', id)
    expect(row).toMatchObject({ status: 'DIEKSEKUSI', executedById: 'u-ti' })
    expect((row.unlockUntil as Date).getTime()).toBe(T0.getTime() + 72 * HOUR)
    expect(one('dailyProjectReport', dailyId).isLocked).toBe(false)
    expect(auditActions()).toEqual(['REQUEST_UNLOCK', 'APPROVE_UNLOCK', 'UNLOCK_EXECUTE'])

    const re = await act('u-ti', id, 'relock')
    expect(re.res.status).toBe(200)
    expect(one('dailyProjectReport', dailyId).isLocked).toBe(true)
    expect(one('unlockRequest', id).reLockedAt).toBeInstanceOf(Date)
    expect((await act('u-ti', id, 'relock')).res.status).toBe(409) // tidak dua kali
    expect(auditActions().at(-1)).toBe('RELOCK_REPORT')
  })

  it('TI/Super Admin dari mana pun boleh; Admin PT tidak bisa memakai id pengajuan PT lain', async () => {
    const id = (await request('u-admin-a', 'DAILY_REPORT', dailyId)).body.item!.id
    // Admin PT tidak punya unlock:approve — dan pengajuan di luar cakupan juga tidak bocor.
    expect((await act('u-admin-b', id, 'approve')).res.status).toBe(403)
    expect((await act('u-super', id, 'approve')).res.status).toBe(200)
  })
})

describe('efek buka kunci pada laporan harian (/api/daily-input)', () => {
  const save = () =>
    dailyPut(json('PUT', '/api/daily-input', { projectId: 'prj-a', action: 'save', status: 'ON_PROGRESS', progressPct: 45, achievementToday: 'Pondasi selesai, revisi angka progres' }))

  it('beku sebelum dibuka, bisa disunting selama dibuka (tetap diteruskan), beku lagi setelah dikunci kembali', async () => {
    signIn('u-pic-a')
    const before = await save()
    expect(before.status).toBe(409)
    expect(((await before.json()) as { error: string }).error).toBe(FORWARDED_FROZEN_MESSAGE)

    const id = (await request('u-pic-a', 'DAILY_REPORT', dailyId)).body.item!.id
    await act('u-sdm', id, 'approve')
    // Disetujui saja belum membuka.
    signIn('u-pic-a')
    expect((await save()).status).toBe(409)

    await act('u-ti', id, 'execute', { hours: 4 })
    signIn('u-pic-a')
    const during = await save()
    expect(during.status).toBe(200)
    const report = one('dailyProjectReport', dailyId)
    expect(report.progressPct).toBe(45)
    expect(report.forwardedAt).toBeInstanceOf(Date) // tidak kembali ke antrean Admin PT
    const saved = rows('auditLog', { action: 'SAVE_DAILY_REPORT' })
    expect(JSON.parse(saved[0].afterData as string)).toMatchObject({ unlockRequestId: id, afterForward: true })

    // Laporan yang sudah diteruskan tetap tidak bisa dihapus, walau sedang dibuka.
    signIn('u-pic-a')
    expect((await dailyDelete(json('DELETE', '/api/daily-input?projectId=prj-a'))).status).toBe(409)

    await act('u-ti', id, 'relock')
    signIn('u-pic-a')
    expect((await save()).status).toBe(409)
  })

  it('masa buka habis: GET oleh TI mengunci kembali otomatis dan PIC ditolak lagi', async () => {
    const id = (await request('u-pic-a', 'DAILY_REPORT', dailyId)).body.item!.id
    await act('u-sdm', id, 'approve')
    await act('u-ti', id, 'execute', { hours: 2 })
    vi.setSystemTime(new Date(T0.getTime() + 3 * HOUR)) // 13.00 WIB, belum lewat tenggat harian
    signIn('u-pic-a')
    // Tanpa cron: buka kunci yang lewat masanya sudah tidak berlaku.
    expect((await save()).status).toBe(409)

    signIn('u-ti')
    expect((await GET(json('GET', '/api/unlock-requests'))).status).toBe(200)
    expect(one('dailyProjectReport', dailyId).isLocked).toBe(true)
    expect(one('unlockRequest', id).reLockedAt).toBeInstanceOf(Date)
    const auto = rows('auditLog', { action: 'RELOCK_REPORT' })
    expect(auto).toHaveLength(1)
    expect(auto[0].actorId).toBeNull()
  })
})

describe('efek buka kunci pada laporan mingguan (/api/weekly-input)', () => {
  it('item minggu lalu hanya bisa dihapus selama buka kunci berlaku', async () => {
    const del = () => weeklyDelete(json('DELETE', `/api/weekly-input?itemId=${pastItemId}`))
    signIn('u-kadiv-a')
    const before = await del()
    expect(before.status).toBe(409)
    expect(((await before.json()) as { reason: string }).reason).toBe('PAST_WEEK')

    const id = (await request('u-admin-a', 'WEEKLY_REPORT', pastWeeklyId)).body.item!.id
    await act('u-sdm', id, 'approve')
    await act('u-ti', id, 'execute')
    signIn('u-kadiv-a')
    const during = await del()
    expect(during.status).toBe(200)
    expect(rows('weeklyReportItem')).toHaveLength(0)
    expect(rows('auditLog', { action: 'DELETE_WEEKLY_ITEM' })).toHaveLength(1)
  })

  it('buka kunci laporan lain tidak membuka laporan ini', async () => {
    const [{ id: otherWeekly }] = seed('weeklyDivisionReport', [
      { divisionId: 'div-a2', entityId: 'pt-a', isoYear: 2026, isoWeek: 30, periodStart: new Date('2026-07-19T17:00:00Z'), periodEnd: new Date('2026-07-24T10:00:00Z') },
    ]) as { id: string }[]
    const id = (await request('u-admin-a', 'WEEKLY_REPORT', otherWeekly)).body.item!.id
    await act('u-sdm', id, 'approve')
    await act('u-ti', id, 'execute')
    signIn('u-kadiv-a')
    expect((await weeklyDelete(json('DELETE', `/api/weekly-input?itemId=${pastItemId}`))).status).toBe(409)
  })
})

describe('GET /api/unlock-requests — cakupan baca', () => {
  it('PIC hanya melihat pengajuannya; Admin PT lain tidak melihat pengajuan PT ini; TI melihat semua', async () => {
    await request('u-pic-a', 'DAILY_REPORT', dailyId)
    await request('u-admin-a', 'WEEKLY_REPORT', pastWeeklyId)
    const list = async (who: string) => {
      signIn(who)
      return ((await (await GET(json('GET', '/api/unlock-requests'))).json()) as { items: { requestedById: string }[] }).items
    }
    expect((await list('u-pic-a')).map((i) => i.requestedById)).toEqual(['u-pic-a'])
    expect(await list('u-pic-a2')).toHaveLength(0)
    expect(await list('u-admin-b')).toHaveLength(0)
    expect(await list('u-admin-a')).toHaveLength(2)
    expect(await list('u-ti')).toHaveLength(2)
  })
})
