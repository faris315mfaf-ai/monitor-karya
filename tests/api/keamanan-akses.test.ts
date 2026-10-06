import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * [F3-D] Keamanan lintas route dengan sesi sungguhan (cookie bertanda tangan)
 * dan basis data tiruan di memori (tests/api/admin-fake-db.ts):
 *
 *  - akun bertanda mustChangePassword ditolak 403 di route Admin/grup sampai
 *    kata sandinya diganti; sesi lama tidak berlaku setelah ganti;
 *  - /api/notifications: baca & tandai hanya milik sendiri, peran grup pun;
 *  - /api/undo: tiket hanya untuk pelaku yang sama, 15 menit, sekali pakai,
 *    dan ditolak bila buka kunci sudah diajukan sejak diteruskan;
 *  - /api/audit-logs/export: cakupan baris per PT dan sel aman dari CSV injection;
 *  - /api/search: hasil tidak menembus PT lain.
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
import { SESSION_COOKIE, createSessionToken, hashPassword } from '@/lib/auth'
import { startOfWibDay } from '@/lib/lock'
import { GET as accessGet } from '@/app/api/access-requests/route'
import { GET as unlockGet, POST as unlockPost } from '@/app/api/unlock-requests/route'
import { GET as overviewGet } from '@/app/api/admin/overview/route'
import { GET as rulesGet } from '@/app/api/admin/reminder-rules/route'
import { GET as notifGet, PATCH as notifPatch } from '@/app/api/notifications/route'
import { GET as searchGet } from '@/app/api/search/route'
import { POST as undoPost } from '@/app/api/undo/route'
import { GET as exportGet } from '@/app/api/audit-logs/export/route'
import { POST as inboxPost } from '@/app/api/inbox/route'
import { POST as passwordPost } from '@/app/api/profile/password/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const T0 = new Date('2026-10-06T03:00:00Z') // Selasa 10.00 WIB
const MIN = 60000

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

let ipSeq = 0
const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.20.0.${++ipSeq % 250}`, 'x-real-ip': `10.20.0.${ipSeq % 250}`, 'user-agent': 'vitest' },
  })

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

describe('mustChangePassword: 403 sampai kata sandi diganti', () => {
  const calls: [string, () => Promise<Response>][] = [
    ['GET /api/access-requests', () => accessGet(req('GET', '/api/access-requests'))],
    ['GET /api/unlock-requests', () => unlockGet(req('GET', '/api/unlock-requests'))],
    ['POST /api/unlock-requests', () => unlockPost(req('POST', '/api/unlock-requests', { targetType: 'DAILY_REPORT', targetId: 'x', reason: 'Alasan yang cukup panjang' }))],
    ['GET /api/admin/overview', () => overviewGet(req('GET', '/api/admin/overview'))],
    ['GET /api/admin/reminder-rules', () => rulesGet(req('GET', '/api/admin/reminder-rules'))],
    ['GET /api/notifications', () => notifGet(req('GET', '/api/notifications?inbox=1'))],
    ['GET /api/search', () => searchGet(req('GET', '/api/search?q=gudang'))],
    ['POST /api/undo', () => undoPost(req('POST', '/api/undo', { token: 'abc' }))],
    ['GET /api/audit-logs/export', () => exportGet(req('GET', '/api/audit-logs/export'))],
    ['POST /api/inbox', () => inboxPost(req('POST', '/api/inbox', { kind: 'daily', id: 'x' }))],
  ]

  it('ditahan di semua route; ganti kata sandi membuka, sesi lama dicabut', async () => {
    const admin = one('user', 'u-admin-a')
    admin.passwordHash = await hashPassword('sandi-dari-admin-1')
    admin.mustChangePassword = true
    signIn('u-admin-a')
    const oldCookie = cookie.value

    for (const [name, call] of calls) {
      const res = await call()
      expect(res.status, name).toBe(403)
      expect(((await res.json()) as { code?: string }).code, name).toBe('MUST_CHANGE_PASSWORD')
    }
    expect(auditActions()).toEqual([])
    expect(rows('unlockRequest')).toHaveLength(0)

    // Kata sandi saat ini salah → tetap tertahan.
    const wrong = await passwordPost(req('POST', '/api/profile/password', { currentPassword: 'salah-salah-1', newPassword: 'sandi-baru-yang-kuat-9' }))
    expect(wrong.status).toBe(422)
    // Terlalu pendek → 422.
    expect((await passwordPost(req('POST', '/api/profile/password', { currentPassword: 'sandi-dari-admin-1', newPassword: 'pendek' }))).status).toBe(422)
    expect(one('user', 'u-admin-a').mustChangePassword).toBe(true)

    const ok = await passwordPost(req('POST', '/api/profile/password', { currentPassword: 'sandi-dari-admin-1', newPassword: 'sandi-baru-yang-kuat-9' }))
    expect(ok.status).toBe(200)
    expect(one('user', 'u-admin-a').mustChangePassword).toBe(false)
    expect(JSON.parse(rows('auditLog', { action: 'CHANGE_OWN_PASSWORD' })[0].afterData as string)).toEqual({ forced: true })
    const fresh = (ok as NextResponse).cookies.get(SESSION_COOKIE)?.value
    expect(fresh).toBeTruthy()

    // Cookie lama (sidik kata sandi lama) tidak berlaku lagi.
    cookie.value = oldCookie
    expect((await overviewGet(req('GET', '/api/admin/overview'))).status).toBe(401)

    cookie.value = fresh
    expect((await overviewGet(req('GET', '/api/admin/overview'))).status).toBe(200)
    expect((await accessGet(req('GET', '/api/access-requests'))).status).toBe(200)
    expect((await notifGet(req('GET', '/api/notifications?inbox=1'))).status).toBe(200)
  })

  it('akun nonaktif tidak punya sesi (401)', async () => {
    signIn('u-admin-a')
    one('user', 'u-admin-a').isActive = false
    expect((await overviewGet(req('GET', '/api/admin/overview'))).status).toBe(401)
  })
})

describe('/api/notifications hanya milik sendiri', () => {
  let picOwn: string[]
  let otherId: string
  beforeEach(() => {
    picOwn = seed('notificationLog', [
      { userId: 'u-pic-a', channel: 'APLIKASI', recipient: 'u-pic-a@contoh.test', template: 'PENGINGAT', status: 'SENT', payload: '{"title":"Kirim laporan"}' },
      { userId: 'u-pic-a', channel: 'APLIKASI', recipient: 'u-pic-a@contoh.test', template: 'PENGINGAT', status: 'SENT', payload: 'bukan-json' },
    ]).map((r) => r.id as string)
    ;[{ id: otherId }] = seed('notificationLog', [
      { userId: 'u-pic-b', channel: 'APLIKASI', recipient: 'u-pic-b@contoh.test', template: 'PENGINGAT', status: 'SENT', payload: '{"title":"Rahasia B"}' },
    ]) as { id: string }[]
    seed('notificationLog', [{ userId: 'u-admin-b', channel: 'EMAIL', recipient: 'u-admin-b@contoh.test', template: 'RINGKASAN', status: 'FAILED', payload: '{}' }])
  })

  it('GET: peran grup (TI, Auditor) pun tidak melihat log akun lain', async () => {
    for (const who of ['u-ti', 'u-auditor', 'u-super']) {
      signIn(who)
      const log = (await (await notifGet(req('GET', '/api/notifications'))).json()) as { items: unknown[]; total: number }
      expect(log.total, who).toBe(0)
      const inbox = (await (await notifGet(req('GET', '/api/notifications?inbox=1'))).json()) as { items: unknown[]; unread: number }
      expect(inbox.unread, who).toBe(0)
    }
    signIn('u-pic-a')
    const mine = (await (await notifGet(req('GET', '/api/notifications?inbox=1'))).json()) as { items: { id: string; title: string }[]; unread: number }
    expect(mine.unread).toBe(2)
    expect(mine.items.map((i) => i.id).sort()).toEqual([...picOwn].sort())
    expect(JSON.stringify(mine)).not.toContain('Rahasia B')
  })

  it('PATCH: id milik orang lain diabaikan; "all" hanya milik sendiri', async () => {
    signIn('u-pic-a')
    const res = await notifPatch(req('PATCH', '/api/notifications', { ids: [picOwn[0], otherId] }))
    expect(((await res.json()) as { marked: number }).marked).toBe(1)
    expect(one('notificationLog', picOwn[0]).readAt).toBeInstanceOf(Date)
    expect(one('notificationLog', otherId).readAt).toBeNull()

    signIn('u-ti')
    const all = await notifPatch(req('PATCH', '/api/notifications', { all: true }))
    expect(((await all.json()) as { marked: number }).marked).toBe(0)
    expect(one('notificationLog', otherId).readAt).toBeNull()
    expect(one('notificationLog', picOwn[1]).readAt).toBeNull()

    expect((await notifPatch(req('PATCH', '/api/notifications', { ids: [] }))).status).toBe(422)
  })
})

describe('/api/undo: pelaku sama, 15 menit, sekali pakai', () => {
  let reportId: string
  beforeEach(() => {
    ;[{ id: reportId }] = seed('dailyProjectReport', [
      { projectId: 'prj-a', entityId: 'pt-a', reportDate: startOfWibDay(T0), status: 'ON_PROGRESS', achievementToday: 'Galian', submittedAt: new Date(T0.getTime() - 30 * MIN), submittedById: 'u-pic-a' },
    ]) as { id: string }[]
  })

  async function forward(): Promise<string> {
    signIn('u-admin-a')
    const res = await inboxPost(req('POST', '/api/inbox', { kind: 'daily', id: reportId }))
    expect(res.status).toBe(200)
    const { undoToken } = (await res.json()) as { undoToken: string }
    expect(undoToken).toBeTruthy()
    expect(one('dailyProjectReport', reportId)).toMatchObject({ forwardedById: 'u-admin-a', isLocked: true })
    return undoToken
  }
  const undo = async (as: string, token: string) => {
    signIn(as)
    const res = await undoPost(req('POST', '/api/undo', { token }))
    return { status: res.status, body: (await res.json()) as { error?: string } }
  }

  it('akun lain (Admin PT lain, TI, PIC) tidak bisa memakai tiket itu: 404, laporan tetap diteruskan', async () => {
    const token = await forward()
    for (const who of ['u-admin-b', 'u-ti', 'u-pic-a', 'u-super']) {
      expect((await undo(who, token)).status, who).toBe(404)
    }
    expect(one('dailyProjectReport', reportId).forwardedAt).toBeInstanceOf(Date)
    expect(auditActions().filter((a) => a.startsWith('UNDO_'))).toEqual([])
  })

  it('pelaku sama dalam 15 menit: penerusan & kunci dicabut, tercatat; kedua kalinya 409', async () => {
    const token = await forward()
    vi.setSystemTime(new Date(T0.getTime() + 14 * MIN))
    const first = await undo('u-admin-a', token)
    expect(first.status).toBe(200)
    expect(one('dailyProjectReport', reportId)).toMatchObject({ forwardedAt: null, forwardedById: null, isLocked: false })
    expect(auditActions()).toContain('UNDO_FORWARD_DAILY_REPORT')
    expect((await undo('u-admin-a', token)).status).toBe(409)
  })

  it('lewat 15 menit: 409 dan laporan tetap diteruskan', async () => {
    const token = await forward()
    vi.setSystemTime(new Date(T0.getTime() + 15 * MIN + 1000))
    const late = await undo('u-admin-a', token)
    expect(late.status).toBe(409)
    expect(late.body.error).toContain('15 menit')
    expect(one('dailyProjectReport', reportId).isLocked).toBe(true)
  })

  it('ditolak bila PIC sudah mengajukan buka kunci sejak diteruskan', async () => {
    const token = await forward()
    vi.setSystemTime(new Date(T0.getTime() + MIN))
    signIn('u-pic-a')
    expect((await unlockPost(req('POST', '/api/unlock-requests', { targetType: 'DAILY_REPORT', targetId: reportId, reason: 'Angka progres salah ketik.' }))).status).toBe(201)
    vi.setSystemTime(new Date(T0.getTime() + 2 * MIN))
    expect((await undo('u-admin-a', token)).status).toBe(409)
    expect(one('dailyProjectReport', reportId).forwardedAt).toBeInstanceOf(Date)
  })

  it('tiket rusak 400, tiket tak dikenal 404', async () => {
    expect((await undo('u-admin-a', '../etc/passwd')).status).toBe(400)
    expect((await undo('u-admin-a', 'x'.repeat(65))).status).toBe(400)
    expect((await undo('u-admin-a', 'tidak_ada_123')).status).toBe(404)
  })
})

describe('/api/audit-logs/export: cakupan & CSV injection', () => {
  beforeEach(() => {
    seed('auditLog', [
      { actorId: 'u-admin-a', action: 'FORWARD_DAILY_REPORT', targetType: 'DAILY_REPORT', targetId: 'r-a', ip: '10.0.0.1', at: new Date(T0.getTime() - 3600000) },
      { actorId: 'u-pic-a', action: 'SAVE_DAILY_REPORT', targetType: 'DAILY_REPORT', targetId: 'r-a2', afterData: JSON.stringify({ message: '=HYPERLINK("http://jahat.test","klik")' }), at: new Date(T0.getTime() - 3000000) },
      { actorId: 'u-admin-b', action: 'FORWARD_DAILY_REPORT', targetType: 'DAILY_REPORT', targetId: 'r-b-rahasia', at: new Date(T0.getTime() - 2000000) },
      { actorId: null, action: 'AUTO_REMINDER', targetType: 'REMINDER_RULE', targetId: 'pt-a:HARIAN', at: new Date(T0.getTime() - 1000000) },
      { actorId: null, action: 'AUTO_REMINDER', targetType: 'REMINDER_RULE', targetId: 'pt-b:HARIAN', at: new Date(T0.getTime() - 900000) },
    ])
  })
  const csv = async (as: string) => {
    signIn(as)
    const res = await exportGet(req('GET', '/api/audit-logs/export'))
    return { status: res.status, text: res.status === 200 ? await res.text() : '' }
  }

  it('Admin PT: baris PT-nya saja (termasuk tugas terjadwal PT-nya), tanpa kolom IP, sel berbahaya dinetralkan', async () => {
    const { status, text } = await csv('u-admin-a')
    expect(status).toBe(200)
    expect(text).toContain('"r-a"')
    expect(text).toContain('"pt-a:HARIAN"')
    expect(text).not.toContain('r-b-rahasia')
    expect(text).not.toContain('pt-b:HARIAN')
    expect(text).not.toContain('10.0.0.1')
    expect(text).toContain(`"'=HYPERLINK(""http://jahat.test"",""klik"")"`)
    expect(rows('auditLog', { action: 'EXPORT_AUDIT_LOG', actorId: 'u-admin-a' })).toHaveLength(1)
  })

  it('Direktur PT lain hanya PT-nya (dengan IP); Auditor seluruh grup; PIC & Kadiv ditolak', async () => {
    const b = await csv('u-dir-b')
    expect(b.text).toContain('r-b-rahasia')
    expect(b.text).not.toContain('"r-a"')
    expect(b.text.split('\r\n')[0]).toContain('"IP"')

    const all = await csv('u-auditor')
    for (const id of ['"r-a"', 'r-b-rahasia', 'pt-a:HARIAN', 'pt-b:HARIAN']) expect(all.text).toContain(id)

    expect((await csv('u-pic-a')).status).toBe(403)
    expect((await csv('u-kadiv-a')).status).toBe(403)
  })
})

describe('/api/search: tidak menembus PT lain', () => {
  const search = async (as: string, q: string) => {
    signIn(as)
    const res = await searchGet(req('GET', `/api/search?q=${encodeURIComponent(q)}`))
    expect(res.status).toBe(200)
    return ((await res.json()) as { hits: { kind: string; id: string }[] }).hits
  }

  it('Admin PT A: proyek, divisi, dan orang PT A saja', async () => {
    expect((await search('u-admin-a', 'gudang')).map((h) => h.id)).toEqual(['prj-a'])
    expect((await search('u-admin-a', 'teknik')).filter((h) => h.kind === 'division').map((h) => h.id)).toEqual(['div-a1'])
    const people = (await search('u-admin-a', 'PIC')).filter((h) => h.kind === 'user').map((h) => h.id)
    expect(people.sort()).toEqual(['u-pic-a', 'u-pic-a2'])
  })

  it('Direktur PT B dan PIC B: tidak melihat PT A', async () => {
    expect((await search('u-dir-b', 'gudang')).map((h) => h.id)).toEqual(['prj-b'])
    const pic = await search('u-pic-b', 'gudang')
    expect(pic.map((h) => h.id)).toEqual(['prj-b'])
    expect((await search('u-pic-b', 'putra')).length).toBe(0)
  })

  it('peran grup melihat seluruh grup', async () => {
    expect((await search('u-mgmt', 'gudang')).map((h) => h.id).sort()).toEqual(['prj-a', 'prj-b'])
  })
})
