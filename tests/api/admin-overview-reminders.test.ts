import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [F3-D] /api/admin/overview dan /api/admin/reminder-rules dengan basis
 * data tiruan di memori dan sesi sungguhan: hak peran, cakupan PT (Admin PT
 * tidak bisa melebarkan ke PT lain lewat ?entityId=), hitungan buka kunci
 * per PT, kepatuhan per orang (cuti keluar dari penyebut), validasi masukan
 * pengingat, dan jejak AuditLog "<nama> mematikan …".
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})

import { AUTH_SECRET_FOR_TESTS, cookie, db, one, rows, seed, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { startOfWibDay } from '@/lib/lock'
import type { AdminOverview, ReminderRuleView } from '@/lib/admin-meta'
import { GET as overview } from '@/app/api/admin/overview/route'
import { GET as getRules, PATCH as patchRule } from '@/app/api/admin/reminder-rules/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const T0 = new Date('2026-10-06T03:00:00Z') // Selasa 10.00 WIB

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

const get = (url: string) => new NextRequest(`http://localhost${url}`)
const patch = (body: unknown) =>
  new NextRequest('http://localhost/api/admin/reminder-rules', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.7.7.7' },
  })

async function readOverview(as: string, qs = '') {
  signIn(as)
  const res = await overview(get(`/api/admin/overview${qs}`))
  return { res, body: (await res.json()) as AdminOverview & { error?: string } }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  // Pemuat bersama memakai _max; fixture umum hanya menyediakan _count.
  const reportsDb = db.dailyProjectReport as { groupBy(args: { where?: Record<string, unknown> }): Promise<unknown[]> }
  vi.spyOn(reportsDb, 'groupBy').mockImplementation(async (args) => {
    const reports = rows('dailyProjectReport', args.where as Record<string, unknown>)
    const ids = [...new Set(reports.map((r) => r.projectId as string))]
    return ids.map((projectId) => ({ projectId, _max: {
      submittedAt: reports.filter((r) => r.projectId === projectId)
        .map((r) => r.submittedAt as Date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    } }))
  })
  cookie.value = undefined
  seed('unlockRequest', [
    { targetType: 'DAILY_REPORT', targetId: 'x-1', reason: 'Alasan A', status: 'DIAJUKAN', requestedById: 'u-admin-a' },
    { targetType: 'DAILY_REPORT', targetId: 'x-2', reason: 'Alasan A2', status: 'DISETUJUI', requestedById: 'u-pic-a' },
    { targetType: 'DAILY_REPORT', targetId: 'x-3', reason: 'Alasan B', status: 'DIAJUKAN', requestedById: 'u-admin-b' },
  ])
})
afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/admin/overview', () => {
  it('PIC dan kepala divisi tidak membuka data induk (403)', async () => {
    expect((await readOverview('u-pic-a')).res.status).toBe(403)
    expect((await readOverview('u-kadiv-a')).res.status).toBe(403)
  })

  it('Admin PT: hanya PT-nya; ?entityId= PT lain diabaikan (tidak melebar)', async () => {
    const own = await readOverview('u-admin-a')
    expect(own.res.status).toBe(200)
    expect(own.body.scope).toBe('ENTITY')
    expect(own.body.entityName).toBe('PT Alfa')
    expect(own.body.masterData).toMatchObject({ entities: 1, divisions: 2, projects: 1, activeProjects: 1, users: 5 })
    expect(own.body.unlocks).toEqual({ pending: 1, approved: 1 })
    expect(own.body.canManageReminders).toBe(true)

    const widened = await readOverview('u-admin-a', '?entityId=pt-b')
    expect(widened.body.masterData).toEqual(own.body.masterData)
    expect(widened.body.unlocks).toEqual(own.body.unlocks)
    expect(widened.body.compliance.divisions.map((d) => d.id).sort()).toEqual(['div-a1', 'div-a2'])
  })

  it('peran grup: seluruh grup, atau satu PT lewat ?entityId= (hitungan buka kunci ikut terbatas)', async () => {
    const all = await readOverview('u-ti')
    expect(all.body.scope).toBe('ALL')
    expect(all.body.unlocks.pending).toBe(2)
    expect(all.body.masterData.entities).toBe(2)

    const b = await readOverview('u-ti', '?entityId=pt-b')
    expect(b.res.status).toBe(200)
    expect(b.body.scope).toBe('ENTITY')
    expect(b.body.unlocks).toEqual({ pending: 1, approved: 0 })
    expect(b.body.masterData.projects).toBe(1)

    expect((await readOverview('u-ti', '?entityId=tidak-ada')).res.status).toBe(404)
  })

  it('kepatuhan per orang: sudah lapor dihitung, cuti keluar dari penyebut', async () => {
    const today = startOfWibDay(T0)
    let o = await readOverview('u-admin-a')
    let teknik = o.body.compliance.divisions.find((d) => d.id === 'div-a1')!
    expect(teknik).toMatchObject({ expected: 1, reported: 0, onLeave: 0, head: 'Kirana Kadiv A' })
    expect(teknik.missing.map((m) => m.id)).toEqual(['u-pic-a'])

    seed('dailyProjectReport', [{ projectId: 'prj-a', entityId: 'pt-a', reportDate: today, status: 'ON_PROGRESS', submittedAt: T0 }])
    o = await readOverview('u-admin-a')
    teknik = o.body.compliance.divisions.find((d) => d.id === 'div-a1')!
    expect(teknik).toMatchObject({ expected: 1, reported: 1, missing: [] })

    seed('attendance', [{ userId: 'u-pic-a', date: today, status: 'CUTI' }])
    o = await readOverview('u-admin-a')
    teknik = o.body.compliance.divisions.find((d) => d.id === 'div-a1')!
    expect(teknik).toMatchObject({ expected: 0, reported: 0, onLeave: 1 })
  })
})

describe('/api/admin/reminder-rules', () => {
  const kinds = (rules: ReminderRuleView[]) => rules.map((r) => r.kind)

  it('hanya Admin PT, TI, Super Admin', async () => {
    for (const who of ['u-pic-a', 'u-kadiv-a', 'u-dir-a', 'u-sdm', 'u-auditor', 'u-mgmt']) {
      signIn(who)
      expect((await getRules(get('/api/admin/reminder-rules'))).status).toBe(403)
      expect((await patchRule(patch({ kind: 'HARIAN', enabled: false }))).status).toBe(403)
    }
    expect(rows('reminderRule')).toHaveLength(0)
  })

  it('Admin PT: PT-nya sendiri; PT lain 403 tanpa menulis', async () => {
    signIn('u-admin-a')
    const res = await getRules(get('/api/admin/reminder-rules'))
    const body = (await res.json()) as { entityId: string; rules: ReminderRuleView[] }
    expect(body.entityId).toBe('pt-a')
    expect(kinds(body.rules)).toEqual(['HARIAN', 'MINGGUAN', 'ESKALASI_KADIV', 'RINGKASAN_MANAJEMEN'])
    expect((await getRules(get('/api/admin/reminder-rules?entityId=pt-b'))).status).toBe(403)
    expect((await patchRule(patch({ kind: 'HARIAN', enabled: false, entityId: 'pt-b' }))).status).toBe(403)
    expect(rows('reminderRule')).toHaveLength(0)
  })

  it('TI wajib memilih PT yang ada (bukan holding)', async () => {
    signIn('u-ti')
    expect((await getRules(get('/api/admin/reminder-rules'))).status).toBe(422)
    expect((await getRules(get('/api/admin/reminder-rules?entityId=tidak-ada'))).status).toBe(404)
    expect((await getRules(get('/api/admin/reminder-rules?entityId=h'))).status).toBe(404)
    expect((await getRules(get('/api/admin/reminder-rules?entityId=pt-b'))).status).toBe(200)
  })

  it('validasi masukan', async () => {
    signIn('u-admin-a')
    const bad = [
      { kind: 'SEMUA', enabled: false },
      { kind: 'HARIAN', time: '25:00' },
      { kind: 'HARIAN', time: '9:00' },
      { kind: 'MINGGUAN', weekday: 8 },
      { kind: 'MINGGUAN', weekday: 1.5 },
      { kind: 'ESKALASI_KADIV', days: 11 },
      { kind: 'ESKALASI_KADIV', days: '2' },
      { kind: 'HARIAN' },
    ]
    for (const b of bad) expect((await patchRule(patch(b))).status, JSON.stringify(b)).toBe(422)
    expect(rows('reminderRule')).toHaveLength(0)
    expect(rows('auditLog')).toHaveLength(0)
  })

  it('mematikan pengingat berlaku seketika dan tercatat dengan kalimat log', async () => {
    signIn('u-admin-a')
    const res = await patchRule(patch({ kind: 'HARIAN', enabled: false }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { rule: ReminderRuleView; message: string }
    expect(body.message).toBe('Maya Admin A mematikan pengingat laporan harian')
    expect(body.rule).toMatchObject({ kind: 'HARIAN', enabled: false, time: '16:30', updatedBy: 'Maya Admin A' })
    expect(rows('reminderRule', { entityId: 'pt-a', kind: 'HARIAN' })[0]).toMatchObject({ enabled: false, updatedById: 'u-admin-a' })
    const log = rows('auditLog', { action: 'UPDATE_REMINDER_RULE' })
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ actorId: 'u-admin-a', targetId: 'pt-a:HARIAN', ip: '10.7.7.7' })
    expect(JSON.parse(log[0].beforeData as string)).toMatchObject({ enabled: true })

    const again = (await (await patchRule(patch({ kind: 'ESKALASI_KADIV', days: 3, time: '08:15' }))).json()) as { rule: ReminderRuleView; message: string }
    expect(again.rule).toMatchObject({ time: '08:15', params: { days: 3 } })
    expect(again.message).toBe('Maya Admin A mengubah eskalasi ke kepala divisi menjadi pukul 08.15, 3 hari')

    // PT lain tidak tersentuh.
    signIn('u-ti')
    const b = (await (await getRules(get('/api/admin/reminder-rules?entityId=pt-b'))).json()) as { rules: ReminderRuleView[] }
    expect(b.rules.find((r) => r.kind === 'HARIAN')!.enabled).toBe(true)
  })
})
