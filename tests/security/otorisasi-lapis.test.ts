import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [T2-S1] Pengaman otorisasi lima lapis pada route API yang paling sering
 * diserang. Audit 8 Okt 2026 tidak menemukan celah eksploitabel, jadi berkas
 * ini mematri perlindungan yang ada sebagai tes regresi: bila salah satu pagar
 * (sesi, kapabilitas, cakupan entitas, relasi objek, atau kunci status)
 * dilemahkan, tes yang sesuai gagal dengan pesan yang menyebut lapisnya.
 *
 * Basis data tiruan & sesi bertanda tangan dipakai dari tests/api
 * (admin-fake-db + test-session); tidak ada koneksi keluar.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('../api/admin-fake-db')).db }))
vi.mock('next/headers', async () => {
  const { cookie } = await import('../api/admin-fake-db')
  return {
    cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
    headers: async () => new Headers(),
  }
})

import { AUTH_SECRET_FOR_TESTS, auditActions, cookie, one, rows, seed, world } from '../api/admin-fake-db'
import { createSessionToken } from '../api/test-session'
import { startOfWibDay } from '@/lib/lock'
import { GET as tasksGet } from '@/app/api/tasks/route'
import { GET as inboxGet, POST as inboxPost } from '@/app/api/inbox/route'
import { POST as workDeskPost } from '@/app/api/work-desk/route'
import { PUT as dailyPut } from '@/app/api/daily-input/route'
import { POST as evidencePost } from '@/app/api/evidence/route'
import { POST as unlockPost, PATCH as unlockPatch } from '@/app/api/unlock-requests/route'
import { POST as weeklyPost } from '@/app/api/weekly-input/route'
import { PUT as weeklyPut } from '@/app/api/weekly-input/route'
import { PATCH as approvalsPatch } from '@/app/api/approval-requests/route'
import { PATCH as accessPatch } from '@/app/api/access-requests/route'
import { PATCH as usersPatch } from '@/app/api/companies/users/route'
import { POST as escalatePost } from '@/app/api/escalations/actions/route'
import { POST as projectsPost } from '@/app/api/projects/route'
import { GET as auditGet } from '@/app/api/audit-logs/route'

process.env.AUTH_SECRET = AUTH_SECRET_FOR_TESTS

const T0 = new Date('2026-10-06T03:00:00Z') // Selasa 10.00 WIB, sebelum tenggat 17.00
const MIN = 60000

/** Admin PT yang sengaja tidak ditautkan ke PT mana pun (akun salah konfigurasi). */
const UNSCOPED_ADMIN = 'u-admin-x'

function signIn(id: string) {
  cookie.value = createSessionToken(id, String(one('user', id).passwordHash)).token
}

let ipSeq = 0
const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.30.0.${++ipSeq % 250}`,
      'user-agent': 'vitest',
      origin: 'http://localhost',
      host: 'localhost',
    },
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  world()
  seed('user', [
    { id: UNSCOPED_ADMIN, name: 'Admin Tanpa PT', role: 'ADMIN_PT', scopeEntityId: null, email: 'adminx@contoh.test', username: 'adminx', passwordHash: `hash-${UNSCOPED_ADMIN}` },
  ])
  cookie.value = undefined
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Lapis 1 — sesi', () => {
  it('tanpa cookie: 401, dan cookie orang lain tidak bisa dipakai setelah akun nonaktif', async () => {
    cookie.value = undefined
    expect((await tasksGet(req('GET', '/api/tasks?projectId=prj-a'))).status).toBe(401)

    signIn('u-admin-a')
    one('user', 'u-admin-a').isActive = false
    expect((await inboxGet()).status).toBe(401)
  })
})

describe('Lapis 3+4 — penerusan laporan hanya untuk PT pemilik (gagal-tertutup)', () => {
  let reportId: string
  beforeEach(() => {
    ;[{ id: reportId }] = seed('dailyProjectReport', [
      { projectId: 'prj-a', entityId: 'pt-a', reportDate: startOfWibDay(T0), status: 'ON_PROGRESS', achievementToday: 'Galian pondasi tiang', submittedAt: new Date(T0.getTime() - 30 * MIN), submittedById: 'u-pic-a' },
    ]) as { id: string }[]
  })

  it('Admin PT lain dan Admin PT tanpa PT ditolak; laporan tidak berubah', async () => {
    for (const who of ['u-admin-b', UNSCOPED_ADMIN]) {
      signIn(who)
      const res = await inboxPost(req('POST', '/api/inbox', { kind: 'daily', id: reportId }))
      expect(res.status, who).toBe(403)
    }
    expect(one('dailyProjectReport', reportId).forwardedAt).toBeNull()
    expect(auditActions().filter((a) => a === 'FORWARD_DAILY_REPORT')).toEqual([])
  })

  it('Admin PT pemilik meneruskan (kontrol positif), lalu laporan beku', async () => {
    signIn('u-admin-a')
    const res = await inboxPost(req('POST', '/api/inbox', { kind: 'daily', id: reportId }))
    expect(res.status).toBe(200)
    expect(one('dailyProjectReport', reportId)).toMatchObject({ forwardedById: 'u-admin-a', isLocked: true })
  })

  it('meja terima akun tanpa PT juga ditolak pada GET', async () => {
    signIn(UNSCOPED_ADMIN)
    expect((await inboxGet()).status).toBe(400)
  })
})

describe('Lapis 3 — pengingat PIC hanya dalam PT akun', () => {
  it('Admin PT lain / tanpa PT tidak bisa mengingatkan PIC PT A', async () => {
    for (const who of ['u-admin-b', UNSCOPED_ADMIN]) {
      signIn(who)
      const res = await workDeskPost(req('POST', '/api/work-desk', { action: 'remind-pic', projectId: 'prj-a' }))
      expect(res.status, who).toBe(403)
    }
    expect(rows('notificationLog', { userId: 'u-pic-a' })).toHaveLength(0)
  })

  it('Admin PT pemilik berhasil (kontrol positif)', async () => {
    signIn('u-admin-a')
    const res = await workDeskPost(req('POST', '/api/work-desk', { action: 'remind-pic', projectId: 'prj-a' }))
    expect(res.status).toBe(200)
    expect(rows('notificationLog', { userId: 'u-pic-a', template: 'PENGINGAT_HARIAN_PIC' })).toHaveLength(1)
  })
})

describe('Lapis 4 — relasi objek proyek/divisi/bukti', () => {
  it('PIC PT B tidak membaca task proyek PT A; PIC pemilik bisa', async () => {
    signIn('u-pic-b')
    expect((await tasksGet(req('GET', '/api/tasks?projectId=prj-a'))).status).toBe(403)
    signIn('u-pic-a')
    expect((await tasksGet(req('GET', '/api/tasks?projectId=prj-a'))).status).toBe(200)
  })

  it('kepala divisi tidak menulis papan mingguan divisi PT lain', async () => {
    signIn('u-kadiv-a')
    const res = await weeklyPut(req('PUT', '/api/weekly-input', { divisionId: 'div-b1', workItem: 'Perbaikan mesin', status: 'BERJALAN', aspectCategoryId: 'asp-1', priorityId: 'prio-1' }))
    expect(res.status).toBe(403)
  })

  it('peran pantau (Direktur PT yang sama) tidak bisa melampirkan bukti', async () => {
    const [{ id: reportId }] = seed('dailyProjectReport', [
      { projectId: 'prj-a', entityId: 'pt-a', reportDate: startOfWibDay(T0), status: 'ON_PROGRESS', achievementToday: 'Galian pondasi tiang' },
    ]) as { id: string }[]
    signIn('u-dir-a')
    const res = await evidencePost(req('POST', '/api/evidence', { targetType: 'DAILY_REPORT', targetId: reportId, fileName: 'Foto situs', url: 'https://contoh.test/foto.jpg' }))
    expect(res.status).toBe(403)
    expect(rows('evidence')).toHaveLength(0)
  })
})

describe('Lapis 5 — laporan beku setelah diteruskan', () => {
  let reportId: string
  beforeEach(async () => {
    ;[{ id: reportId }] = seed('dailyProjectReport', [
      { projectId: 'prj-a', entityId: 'pt-a', reportDate: startOfWibDay(T0), status: 'ON_PROGRESS', achievementToday: 'Galian pondasi tiang', submittedAt: new Date(T0.getTime() - 30 * MIN), submittedById: 'u-pic-a' },
    ]) as { id: string }[]
    signIn('u-admin-a')
    expect((await inboxPost(req('POST', '/api/inbox', { kind: 'daily', id: reportId }))).status).toBe(200)
  })

  it('PIC tidak bisa mengubah laporan yang sudah diteruskan (409 FORWARDED)', async () => {
    signIn('u-pic-a')
    const res = await dailyPut(req('PUT', '/api/daily-input', { projectId: 'prj-a', reportDate: '2026-10-06', action: 'save', status: 'ON_PROGRESS', achievementToday: 'Koreksi angka progres' }))
    expect(res.status).toBe(409)
    expect(((await res.json()) as { frozen?: string }).frozen).toBe('FORWARDED')
  })

  it('bukti tidak bisa ditambahkan ke laporan beku (409)', async () => {
    signIn('u-pic-a')
    const res = await evidencePost(req('POST', '/api/evidence', { targetType: 'DAILY_REPORT', targetId: reportId, fileName: 'Foto situs', url: 'https://contoh.test/foto.jpg' }))
    expect(res.status).toBe(409)
    expect(rows('evidence')).toHaveLength(0)
  })
})

describe('Lapis 2 — kapabilitas pada keputusan', () => {
  it('menjalankan buka kunci hanya unlock:execute (Direktur entitas ditolak)', async () => {
    signIn('u-dir-a')
    const res = await unlockPatch(req('PATCH', '/api/unlock-requests', { id: 'unlock-1', action: 'execute' }))
    expect(res.status).toBe(403)
  })

  it('menyetujui laporan mingguan hanya weekly:approve (Admin PT ditolak)', async () => {
    signIn('u-admin-a')
    const res = await weeklyPost(req('POST', '/api/weekly-input', { divisionId: 'div-a1', action: 'approve' }))
    expect(res.status).toBe(403)
  })

  it('kepala divisi tidak mengajukan buka kunci (unlock:request)', async () => {
    signIn('u-kadiv-a')
    const res = await unlockPost(req('POST', '/api/unlock-requests', { targetType: 'WEEKLY_REPORT', targetId: 'wr-1', reason: 'Salah ketik angka capaian divisi.' }))
    expect(res.status).toBe(403)
    expect(rows('unlockRequest')).toHaveLength(0)
  })
})

describe('Lapis 2+3+4 — meja keputusan & eskalasi', () => {
  it('pengaju tidak memutuskan permintaannya sendiri', async () => {
    const [{ id }] = seed('approvalRequest', [
      { type: 'MATERI', title: 'Materi kampanye Oktober', entityId: 'pt-a', requestedById: 'u-pic-a', status: 'DIAJUKAN' },
    ]) as { id: string }[]
    signIn('u-pic-a')
    expect((await approvalsPatch(req('PATCH', '/api/approval-requests', { id, action: 'approve' }))).status).toBe(403)
    expect(one('approvalRequest', id).status).toBe('DIAJUKAN')
  })

  it('Direktur PT B tidak memutuskan permintaan PT A (di luar cakupan = tidak ada)', async () => {
    const [{ id }] = seed('approvalRequest', [
      { type: 'MATERI', title: 'Materi kampanye Oktober', entityId: 'pt-a', requestedById: 'u-pic-a', status: 'DIAJUKAN' },
    ]) as { id: string }[]
    signIn('u-dir-b')
    expect((await approvalsPatch(req('PATCH', '/api/approval-requests', { id, action: 'approve' }))).status).toBe(404)
    expect(one('approvalRequest', id).status).toBe('DIAJUKAN')
  })

  it('Admin PT A tidak memutuskan permintaan akses PT B', async () => {
    const [{ id }] = seed('accessRequest', [
      { type: 'PINDAH_PERAN', payload: JSON.stringify({ userId: 'u-pic-b', role: 'KEPALA_DIVISI' }), entityId: 'pt-b', requestedById: 'u-pic-b', status: 'DIAJUKAN' },
    ]) as { id: string }[]
    signIn('u-admin-a')
    expect((await accessPatch(req('PATCH', '/api/access-requests', { id, decision: 'approve' }))).status).toBe(403)
    expect(one('accessRequest', id).status).toBe('DIAJUKAN')
  })

  it('kepala divisi tidak mengeskalasi task yang bukan milik divisinya/proyek PIC-nya', async () => {
    const [{ id: taskId }] = seed('task', [
      { projectId: 'prj-a', entityId: 'pt-a', workDate: startOfWibDay(T0), scope: 'HARIAN', title: 'Pasang besi tulangan', status: 'TERKENDALA' },
    ]) as { id: string }[]
    signIn('u-kadiv-a') // kepala div-a1; task prj-a PIC-nya u-pic-a, bukan kepala divisi ini
    const res = await escalatePost(req('POST', '/api/escalations/actions', { action: 'raise', sourceType: 'TASK', sourceId: taskId, summary: 'Besi tulangan belum datang dari pemasok', needed: 'KEPUTUSAN' }))
    expect(res.status).toBe(403)
    expect(rows('escalation')).toHaveLength(0)
  })
})

describe('Lapis 3 — meja akun terbatas Admin PT', () => {
  it('tidak bisa memindahkan akun ke PT lain, tidak bisa melepas akun ke holding', async () => {
    signIn('u-admin-a')
    const toOther = await usersPatch(req('PATCH', '/api/companies/users', { id: 'u-pic-a', entityId: 'pt-b' }))
    expect(toOther.status).toBe(403)
    const detach = await usersPatch(req('PATCH', '/api/companies/users', { id: 'u-pic-a', entityId: null }))
    expect(detach.status).toBe(403)
    expect(one('user', 'u-pic-a').scopeEntityId).toBe('pt-a')
  })
})

describe('Lapis 3 — pengajuan proyek gagal-tertutup untuk akun tanpa PT', () => {
  it('Admin PT tanpa PT tidak bisa mengajukan proyek ke PT mana pun', async () => {
    signIn(UNSCOPED_ADMIN)
    const res = await projectsPost(req('POST', '/api/projects', { name: 'Gudang Baru Timur', description: 'Pembangunan gudang baru di kawasan timur untuk menambah kapasitas simpan.', entityId: 'pt-a', phase: 'INISIASI' }))
    expect(res.status).toBe(400)
    expect(rows('project').filter((p) => p.name === 'Gudang Baru Timur')).toHaveLength(0)
  })
})

describe('Lapis baca — log aktivitas mengikuti audit:read + cakupan', () => {
  beforeEach(() => {
    seed('auditLog', [
      { actorId: 'u-admin-a', action: 'FORWARD_DAILY_REPORT', targetType: 'DAILY_REPORT', targetId: 'r-a', at: new Date(T0.getTime() - 40 * MIN) },
      { actorId: 'u-pic-b', action: 'SAVE_DAILY_REPORT', targetType: 'DAILY_REPORT', targetId: 'r-b-rahasia', at: new Date(T0.getTime() - 30 * MIN) },
      { actorId: null, action: 'AUTO_REMINDER', targetType: 'REMINDER_RULE', targetId: 'pt-b:HARIAN', at: new Date(T0.getTime() - 20 * MIN) },
    ])
  })

  it('PIC tanpa audit:read hanya melihat jejaknya sendiri', async () => {
    seed('auditLog', [{ actorId: 'u-pic-a', action: 'SAVE_DAILY_REPORT', targetType: 'DAILY_REPORT', targetId: 'r-a2', at: new Date(T0.getTime() - 10 * MIN) }])
    signIn('u-pic-a')
    const body = (await (await auditGet(req('GET', '/api/audit-logs'))).json()) as { items: { actorId: string | null }[]; total: number }
    expect(body.total).toBe(1)
    expect(body.items.every((i) => i.actorId === 'u-pic-a')).toBe(true)
  })

  it('Direktur entitas dengan audit:read hanya melihat subtree PT-nya', async () => {
    signIn('u-dir-a')
    const text = JSON.stringify(await (await auditGet(req('GET', '/api/audit-logs'))).json())
    expect(text).toContain('r-a')
    expect(text).not.toContain('r-b-rahasia')
    expect(text).not.toContain('pt-b:HARIAN')
  })
})
