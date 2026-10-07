import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [F3-D] /api/access-requests ujung ke ujung dengan basis data tiruan di
 * memori (tests/api/admin-fake-db.ts) dan sesi sungguhan (cookie bertanda
 * tangan): ajukan, cakupan PT (anti-IDOR), setujui menerapkan perubahan
 * peran & kepala divisi, tolak, keputusan ganda, dan akses sementara yang
 * kedaluwarsa mengembalikan peran, status aktif, serta Division.headUserId.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('./admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})

import { AUTH_SECRET_FOR_TESTS, auditActions, cookie, one, rows, world } from './admin-fake-db'
import { createSessionToken } from './test-session'
import { GET, PATCH, POST } from '@/app/api/access-requests/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const DAY = 86400000
const T0 = new Date('2026-10-06T03:00:00Z') // Selasa 10.00 WIB

function signIn(id: string) {
  cookie.value = createSessionToken(id, one('user', id).passwordHash as string).token
}

const req = (method: string, body?: unknown, qs = '') =>
  new NextRequest(`http://localhost/api/access-requests${qs}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.1.2.3' },
  })

async function submit(as: string, body: Record<string, unknown>) {
  signIn(as)
  const res = await POST(req('POST', body))
  return { res, json: (await res.json()) as Record<string, unknown> & { item?: { id: string } } }
}

async function decide(as: string, id: string, decision: 'approve' | 'reject', note?: string) {
  signIn(as)
  const res = await PATCH(req('PATCH', { id, decision, note }))
  return { res, json: (await res.json()) as Record<string, unknown> }
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

describe('POST /api/access-requests — ajukan', () => {
  it('tanpa sesi 401', async () => {
    const res = await POST(req('POST', { type: 'PINDAH_PERAN', payload: { userId: 'u-pic-a', role: 'KEPALA_DIVISI' } }))
    expect(res.status).toBe(401)
  })

  it('kepala divisi mengajukan untuk anggota timnya: tersimpan dengan PT & sasaran, tercatat REQUEST_ACCESS', async () => {
    const { res, json } = await submit('u-kadiv-a', {
      type: 'PINDAH_PERAN',
      payload: { userId: 'u-pic-a', role: 'KEPALA_DIVISI', divisionId: 'div-a1' },
      reason: 'Putra memimpin tim teknik selama proyek gudang.',
    })
    expect(res.status).toBe(201)
    const row = one('accessRequest', json.item!.id)
    expect(row).toMatchObject({ type: 'PINDAH_PERAN', status: 'DIAJUKAN', entityId: 'pt-a', targetUserId: 'u-pic-a', requestedById: 'u-kadiv-a' })
    expect(auditActions()).toEqual(['REQUEST_ACCESS'])
    expect(one('user', 'u-pic-a').role).toBe('PIC_PROYEK') // belum diterapkan sebelum disetujui

    const again = await submit('u-kadiv-a', { type: 'PINDAH_PERAN', payload: { userId: 'u-pic-a', role: 'KEPALA_DIVISI', divisionId: 'div-a1' } })
    expect(again.res.status).toBe(409)
    expect(rows('accessRequest')).toHaveLength(1)
  })

  it('Admin PT tidak bisa menyasar akun PT lain (404, tidak ada baris)', async () => {
    const { res } = await submit('u-admin-a', { type: 'AKSES_SEMENTARA', payload: { userId: 'u-pic-b', days: 3 } })
    expect(res.status).toBe(404)
    expect(rows('accessRequest')).toHaveLength(0)
  })

  it('Admin PT tidak bisa mengajukan akun baru untuk PT lain', async () => {
    const { res } = await submit('u-admin-a', { type: 'AKUN_BARU', entityId: 'pt-b', payload: { name: 'Akun Baru', role: 'PIC_PROYEK' } })
    expect(res.status).toBe(403)
    expect(rows('accessRequest')).toHaveLength(0)
  })

  it('PIC hanya untuk timnya dan hanya posisi PIC/kepala divisi', async () => {
    const outside = await submit('u-pic-a', { type: 'PINDAH_PERAN', payload: { userId: 'u-pic-b', role: 'KEPALA_DIVISI' } })
    expect(outside.res.status).toBe(403)
    const tooHigh = await submit('u-pic-a', { type: 'PINDAH_PERAN', payload: { userId: 'u-pic-a', role: 'DIREKTUR_ENTITAS' } })
    expect(tooHigh.res.status).toBe(403)
    const otherDivision = await submit('u-pic-a', { type: 'AKSES_SEMENTARA', payload: { userId: 'u-pic-a', role: 'KEPALA_DIVISI', divisionId: 'div-a2', days: 3 } })
    expect(otherDivision.res.status).toBe(403)
    expect(rows('accessRequest')).toHaveLength(0)
  })

  it('Auditor hanya membaca: 403 tanpa menulis', async () => {
    const { res } = await submit('u-auditor', { type: 'AKSES_SEMENTARA', payload: { userId: 'u-pic-a', days: 3 } })
    expect(res.status).toBe(403)
    expect(rows('accessRequest')).toHaveLength(0)
    expect(auditActions()).toEqual([])
  })

  it('validasi: jenis tak dikenal, lama akses di luar 1–90 hari, badan rusak', async () => {
    expect((await submit('u-admin-a', { type: 'HAPUS_SEMUA', payload: {} })).res.status).toBe(422)
    expect((await submit('u-admin-a', { type: 'AKSES_SEMENTARA', payload: { userId: 'u-pic-a', days: 0 } })).res.status).toBe(422)
    expect((await submit('u-admin-a', { type: 'AKSES_SEMENTARA', payload: { userId: 'u-pic-a', days: 91 } })).res.status).toBe(422)
    signIn('u-admin-a')
    const bad = await POST(new NextRequest('http://localhost/api/access-requests', { method: 'POST', body: '{rusak', headers: { 'content-type': 'application/json' } }))
    expect(bad.status).toBe(400)
  })
})

describe('PATCH /api/access-requests — putuskan', () => {
  async function pendingRoleChange(to = 'KEPALA_DIVISI', divisionId: string | undefined = 'div-a2', as = 'u-ti', userId = 'u-pic-a') {
    const payload: Record<string, unknown> = { userId, role: to }
    if (divisionId) payload.divisionId = divisionId
    const { res, json } = await submit(as, { type: 'PINDAH_PERAN', payload })
    expect(res.status).toBe(201)
    return json.item!.id
  }

  it('peran tanpa meja keputusan (PIC, Direktur, Auditor) ditolak 403', async () => {
    const id = await pendingRoleChange('KEPALA_DIVISI', undefined)
    for (const who of ['u-pic-a2', 'u-dir-a', 'u-auditor', 'u-mgmt']) {
      expect((await decide(who, id, 'approve')).res.status).toBe(403)
    }
    expect(one('accessRequest', id).status).toBe('DIAJUKAN')
  })

  it('Admin PT lain tidak memutuskan permintaan PT ini (403, status tetap)', async () => {
    const id = await pendingRoleChange('KEPALA_DIVISI', undefined)
    const { res } = await decide('u-admin-b', id, 'approve')
    expect(res.status).toBe(403)
    expect(one('accessRequest', id).status).toBe('DIAJUKAN')
    expect(one('user', 'u-pic-a').role).toBe('PIC_PROYEK')
  })

  it('pengaju tidak memutuskan permintaannya sendiri', async () => {
    const { json } = await submit('u-admin-a', { type: 'PINDAH_PERAN', payload: { userId: 'u-pic-a', role: 'KEPALA_DIVISI' } })
    const { res } = await decide('u-admin-a', json.item!.id, 'approve')
    expect(res.status).toBe(403)
  })

  it('setujui pindah peran: peran & kepala divisi diterapkan, AuditLog lengkap, pengaju diberi tahu; keputusan kedua 409', async () => {
    const id = await pendingRoleChange('KEPALA_DIVISI', 'div-a2')
    const { res, json } = await decide('u-admin-a', id, 'approve', 'Disetujui untuk kuartal ini')
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(one('user', 'u-pic-a').role).toBe('KEPALA_DIVISI')
    expect(one('division', 'div-a2').headUserId).toBe('u-pic-a')
    const row = one('accessRequest', id)
    expect(row).toMatchObject({ status: 'DISETUJUI', decidedById: 'u-admin-a', decisionNote: 'Disetujui untuk kuartal ini' })
    expect(JSON.parse(row.appliedData as string)).toMatchObject({ role: 'PIC_PROYEK' })
    expect(auditActions()).toEqual(['REQUEST_ACCESS', 'UPDATE_ACCOUNT', 'APPROVE_ACCESS_REQUEST'])
    const note = rows('notificationLog', { userId: 'u-ti' })
    expect(note).toHaveLength(1)
    expect(note[0].template).toBe('KEPUTUSAN_AKSES')

    const twice = await decide('u-admin-a', id, 'approve')
    expect(twice.res.status).toBe(409)
  })

  it('posisi di luar meja Admin PT: persetujuan ditolak dan tidak ada yang berubah (transaksi batal)', async () => {
    // TI (meja penuh) yang mengajukan; Admin PT tidak boleh mengangkat Direktur.
    const id = await pendingRoleChange('DIREKTUR_ENTITAS', undefined, 'u-ti')
    const { res } = await decide('u-admin-a', id, 'approve')
    expect(res.status).toBe(403)
    expect(one('accessRequest', id).status).toBe('DIAJUKAN')
    expect(one('user', 'u-pic-a').role).toBe('PIC_PROYEK')
    expect(auditActions()).toEqual(['REQUEST_ACCESS'])
  })

  it('tolak: status DITOLAK, peran tidak berubah, tercatat REJECT_ACCESS_REQUEST', async () => {
    const id = await pendingRoleChange('KEPALA_DIVISI', 'div-a2')
    const { res } = await decide('u-admin-a', id, 'reject', 'Belum perlu')
    expect(res.status).toBe(200)
    expect(one('accessRequest', id).status).toBe('DITOLAK')
    expect(one('user', 'u-pic-a').role).toBe('PIC_PROYEK')
    expect(one('division', 'div-a2').headUserId).toBeNull()
    expect(auditActions()).toEqual(['REQUEST_ACCESS', 'REJECT_ACCESS_REQUEST'])
  })

  it('keputusan rusak 400; id tak dikenal 404', async () => {
    signIn('u-admin-a')
    expect((await PATCH(req('PATCH', { id: 'x', decision: 'maybe' }))).status).toBe(400)
    expect((await PATCH(req('PATCH', { id: 'tidak-ada', decision: 'approve' }))).status).toBe(404)
  })
})

describe('akses sementara berakhir', () => {
  it('peran sementara kepala divisi: setelah kedaluwarsa peran & kepala divisi lama kembali', async () => {
    // Kadiv A meminta Sari memegang divisinya selama 2 hari (mis. selama cuti).
    const { json } = await submit('u-kadiv-a', {
      type: 'AKSES_SEMENTARA',
      payload: { userId: 'u-pic-a2', role: 'KEPALA_DIVISI', divisionId: 'div-a1', days: 2 },
      reason: 'Saya cuti dua hari.',
    })
    const id = json.item!.id
    const ok = await decide('u-admin-a', id, 'approve')
    expect(ok.res.status).toBe(200)
    expect(one('user', 'u-pic-a2').role).toBe('KEPALA_DIVISI')
    expect(one('division', 'div-a1').headUserId).toBe('u-pic-a2')
    const granted = one('accessRequest', id)
    expect((granted.expiresAt as Date).getTime()).toBe(T0.getTime() + 2 * DAY)
    expect(auditActions()).toContain('GRANT_TEMP_ACCESS')

    // Belum lewat: daftar dibuka pemutus, tidak ada yang dicabut.
    vi.setSystemTime(new Date(T0.getTime() + DAY))
    signIn('u-admin-a')
    expect((await GET(req('GET', undefined, '?status=all'))).status).toBe(200)
    expect(one('user', 'u-pic-a2').role).toBe('KEPALA_DIVISI')

    // Lewat 2 hari: membuka daftar menjalankan pencabutan.
    vi.setSystemTime(new Date(T0.getTime() + 3 * DAY))
    signIn('u-admin-a')
    const res = await GET(req('GET', undefined, '?status=all'))
    expect(res.status).toBe(200)
    expect(one('user', 'u-pic-a2').role).toBe('PIC_PROYEK')
    expect(one('division', 'div-a1').headUserId).toBe('u-kadiv-a')
    expect(one('accessRequest', id).revertedAt).toBeInstanceOf(Date)
    const expired = rows('auditLog', { action: 'TEMP_ACCESS_EXPIRED' })
    expect(expired).toHaveLength(1)
    expect(expired[0].actorId).toBeNull()
    expect(JSON.parse(expired[0].afterData as string)).toMatchObject({ role: 'PIC_PROYEK', heads: [{ divisionId: 'div-a1', from: 'u-pic-a2', to: 'u-kadiv-a' }] })

    // Dijalankan lagi: tidak dicabut dua kali.
    await GET(req('GET', undefined, '?status=all'))
    expect(rows('auditLog', { action: 'TEMP_ACCESS_EXPIRED' })).toHaveLength(1)
  })

  it('akun nonaktif yang diaktifkan sementara kembali nonaktif', async () => {
    one('user', 'u-pic-a').isActive = false
    const { json } = await submit('u-admin-a', { type: 'AKSES_SEMENTARA', payload: { userId: 'u-pic-a', days: 1 }, reason: 'Serah terima dokumen.' })
    expect((await decide('u-ti', json.item!.id, 'approve')).res.status).toBe(200)
    expect(one('user', 'u-pic-a').isActive).toBe(true)

    vi.setSystemTime(new Date(T0.getTime() + 2 * DAY))
    signIn('u-ti')
    await GET(req('GET'))
    expect(one('user', 'u-pic-a').isActive).toBe(false)
    expect(one('user', 'u-pic-a').role).toBe('PIC_PROYEK')
  })

  it('peran yang sudah diubah orang lain sejak itu dipertahankan', async () => {
    const { json } = await submit('u-kadiv-a', { type: 'AKSES_SEMENTARA', payload: { userId: 'u-pic-a2', role: 'KEPALA_DIVISI', divisionId: 'div-a1', days: 1 } })
    await decide('u-admin-a', json.item!.id, 'approve')
    one('user', 'u-pic-a2').role = 'ADMIN_PT' // Super Admin mengubahnya lewat meja akun
    vi.setSystemTime(new Date(T0.getTime() + 2 * DAY))
    signIn('u-admin-a')
    await GET(req('GET'))
    expect(one('user', 'u-pic-a2').role).toBe('ADMIN_PT')
  })
})

describe('GET /api/access-requests — cakupan baca', () => {
  it('Admin PT lain tidak melihat permintaan PT ini; pengaju terbatas hanya miliknya', async () => {
    await submit('u-kadiv-a', { type: 'PINDAH_PERAN', payload: { userId: 'u-pic-a', role: 'KEPALA_DIVISI', divisionId: 'div-a1' } })
    await submit('u-admin-b', { type: 'AKSES_SEMENTARA', payload: { userId: 'u-pic-b', days: 2 } })

    signIn('u-admin-b')
    const b = (await (await GET(req('GET'))).json()) as { items: { entityId: string }[]; canDecide: boolean }
    expect(b.canDecide).toBe(true)
    expect(b.items.map((i) => i.entityId)).toEqual(['pt-b'])

    signIn('u-pic-a')
    const pic = (await (await GET(req('GET'))).json()) as { items: unknown[]; canDecide: boolean }
    expect(pic.canDecide).toBe(false)
    expect(pic.items).toHaveLength(0)

    signIn('u-ti')
    const ti = (await (await GET(req('GET'))).json()) as { items: unknown[] }
    expect(ti.items).toHaveLength(2)
  })
})
