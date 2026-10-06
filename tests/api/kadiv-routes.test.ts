import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asUser, auditsOf, db, jsonReq, matches, resetWorld, wib, world } from './pic-world'

/*
 * [F3-C] Route kepala divisi tanpa basis data:
 *   /api/attendance     — kehadiran/cuti tim (dicatat atasan, bukan diri sendiri)
 *   /api/kadiv/team     — data tim, pengingat laporan harian, tanda "sudah dibaca"
 *   /api/kadiv/members  — keanggotaan divisi & tautan proyek
 * Fokus: cakupan peran (anti-IDOR), validasi, transisi, audit log.
 * Logika src/lib/kadiv.ts dijalankan sungguhan di atas fixture tests/api/pic-world.ts.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => (await import('./pic-world')).auth)

import * as attendance from '@/app/api/attendance/route'
import * as team from '@/app/api/kadiv/team/route'
import * as members from '@/app/api/kadiv/members/route'

const TODAY = wib('2026-10-06T00:00:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-06T10:00:00')) // Selasa 10.00 WIB, sebelum tenggat 17.00
  resetWorld()
})
afterEach(() => vi.useRealTimers())

/* ------------------------------------------------------------------ */
/* /api/attendance                                                      */
/* ------------------------------------------------------------------ */

describe('/api/attendance', () => {
  beforeEach(() => {
    db.attendance.findMany.mockResolvedValue([])
    db.attendance.findUnique.mockResolvedValue(null)
    db.attendance.upsert.mockImplementation(async ({ create }) => ({ ...create, user: { name: 'Rina' } }))
    db.attendance.deleteMany.mockResolvedValue({ count: 1 })
  })
  const post = (body: unknown) => attendance.POST(jsonReq('/api/attendance', 'POST', body))

  it('GET tanpa divisionId hanya membaca milik sendiri', async () => {
    asUser('pic-1')
    expect((await attendance.GET(jsonReq('/api/attendance', 'GET'))).status).toBe(200)
    expect(db.attendance.findMany.mock.calls[0][0].where.userId).toEqual({ in: ['pic-1'] })
  })

  it('GET divisi: kepala divisinya & Admin PT-nya boleh; tim = anggota ∪ PIC proyek divisi, tanpa kepalanya', async () => {
    for (const id of ['kadiv-1', 'admin-a']) {
      asUser(id)
      expect((await attendance.GET(jsonReq('/api/attendance?divisionId=div-a1', 'GET'))).status).toBe(200)
    }
    for (const call of db.attendance.findMany.mock.calls) expect(call[0].where.userId).toEqual({ in: ['pic-1'] })
  })

  it.each(['kadiv-2', 'admin-b', 'pic-1', 'dir-a'])('GET divisi div-a1 sebagai %s → 403', async (id) => {
    asUser(id)
    expect((await attendance.GET(jsonReq('/api/attendance?divisionId=div-a1', 'GET'))).status).toBe(403)
    expect(db.attendance.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['from=2026-10-01&to=2026-12-31', 'lebih dari 62 hari'],
    ['from=2026-10-10&to=2026-10-01', 'to sebelum from'],
    ['from=kemarin', 'format'],
  ])('GET rentang tidak valid (%s, %s) → 400', async (q) => {
    asUser('pic-1')
    expect((await attendance.GET(jsonReq(`/api/attendance?${q}`, 'GET'))).status).toBe(400)
  })

  it('kepala divisi mencatat cuti anggota: upsert, audit dengan keadaan sebelumnya, previous dikembalikan', async () => {
    asUser('kadiv-1')
    db.attendance.findUnique.mockResolvedValue({ status: 'HADIR', note: null })
    const res = await post({ userId: 'pic-1', date: '2026-10-07', status: 'CUTI', note: 'Cuti tahunan' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.previous).toEqual({ status: 'HADIR', note: null })
    expect(body.row).toMatchObject({ userId: 'pic-1', date: '2026-10-07', status: 'CUTI' })
    expect(db.attendance.upsert.mock.calls[0][0].create).toMatchObject({ userId: 'pic-1', recordedById: 'kadiv-1', status: 'CUTI' })
    const [a] = auditsOf('SET_ATTENDANCE')
    expect(a).toMatchObject({ actorId: 'kadiv-1', targetType: 'USER', targetId: 'pic-1' })
    expect(a.after).toEqual({ name: 'Rina', date: '2026-10-07', status: 'CUTI' })
    expect(a.before).toEqual({ status: 'HADIR', note: null })
  })

  it('status TERLAMBAT diterima [F2-DIREKTUR]; status lain ditolak 422', async () => {
    asUser('kadiv-1')
    expect((await post({ userId: 'pic-1', status: 'TERLAMBAT' })).status).toBe(200)
    expect((await post({ userId: 'pic-1', status: 'LIBUR' })).status).toBe(422)
  })

  it('tanggal di luar jendela (31 hari lalu – 90 hari ke depan) atau tak ada → 422', async () => {
    asUser('kadiv-1')
    for (const date of ['2026-08-01', '2027-02-01', '2026-02-31']) {
      expect([date, (await post({ userId: 'pic-1', date, status: 'CUTI' })).status]).toEqual([date, 422])
    }
    expect(db.attendance.upsert).not.toHaveBeenCalled()
  })

  it('tidak bisa mencatat kehadiran diri sendiri (kecuali master)', async () => {
    asUser('pic-1')
    const res = await post({ status: 'CUTI' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/dicatat oleh kepala divisi atau Admin PT/)
    asUser('kadiv-1')
    expect((await post({ userId: 'kadiv-1', status: 'CUTI' })).status).toBe(403)
    asUser('sa')
    expect((await post({ status: 'CUTI' })).status).toBe(200)
  })

  it.each([
    ['kadiv-1', 'pic-2', 'anggota divisi lain di PT yang sama'],
    ['kadiv-1', 'pic-4', 'PIC tanpa divisi'],
    ['kadiv-1', 'pic-3', 'PT lain'],
    ['admin-a', 'pic-3', 'Admin PT untuk PT lain'],
    ['dir-a', 'pic-1', 'direktur'],
  ])('%s mencatat %s (%s) → 403', async (actor, target) => {
    asUser(actor)
    expect((await post({ userId: target, status: 'CUTI' })).status).toBe(403)
    expect(db.attendance.upsert).not.toHaveBeenCalled()
    expect(world.audits).toHaveLength(0)
  })

  it('Admin PT mencatat siapa pun di PT-nya', async () => {
    asUser('admin-a')
    expect((await post({ userId: 'pic-4', status: 'SAKIT' })).status).toBe(200)
  })

  it('DELETE: hapus catatan → audit "HADIR cleared"; tidak ada baris → tanpa audit; di luar tim 403', async () => {
    asUser('kadiv-1')
    expect((await attendance.DELETE(jsonReq('/api/attendance?userId=pic-1&date=2026-10-07', 'DELETE'))).status).toBe(200)
    expect(auditsOf('SET_ATTENDANCE')[0].after).toEqual({ date: '2026-10-07', status: 'HADIR', cleared: true })
    db.attendance.deleteMany.mockResolvedValue({ count: 0 })
    await attendance.DELETE(jsonReq('/api/attendance?userId=pic-1&date=2026-10-08', 'DELETE'))
    expect(world.audits).toHaveLength(1)
    expect((await attendance.DELETE(jsonReq('/api/attendance?userId=pic-2', 'DELETE'))).status).toBe(403)
  })

  it('galat basis data: 500 dengan pesan umum, bukan pesan mentah', async () => {
    asUser('kadiv-1')
    db.attendance.upsert.mockRejectedValue(new Error('column "secret" of relation "Attendance" does not exist'))
    const res = await post({ userId: 'pic-1', status: 'CUTI' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/secret|relation|column/)
  })
})

/* ------------------------------------------------------------------ */
/* /api/kadiv/team                                                      */
/* ------------------------------------------------------------------ */

describe('/api/kadiv/team', () => {
  const post = (body: unknown) => team.POST(jsonReq('/api/kadiv/team', 'POST', body))

  beforeEach(() => {
    db.dailyProjectReport.findMany.mockResolvedValue([])
    db.attendance.findMany.mockResolvedValue([])
    db.dailyReportRead.findMany.mockResolvedValue([])
    db.dailyReportRead.createMany.mockResolvedValue({ count: 1 })
    db.dailyReportRead.deleteMany.mockResolvedValue({ count: 1 })
  })

  it('GET divisi yang tidak ia pimpin: 403', async () => {
    asUser('kadiv-1')
    expect((await team.GET(jsonReq('/api/kadiv/team?divisionId=div-a2', 'GET'))).status).toBe(403)
  })

  it('GET oleh akun tanpa divisi: kerangka kosong, tanpa data tim', async () => {
    asUser('pic-1')
    const body = await (await team.GET(jsonReq('/api/kadiv/team', 'GET'))).json()
    expect(body).toMatchObject({ division: null, members: [], projects: [] })
    expect(db.project.findMany).not.toHaveBeenCalled()
  })

  it('GET galat basis data: 500 dengan pesan umum', async () => {
    asUser('kadiv-1')
    db.division.findMany.mockRejectedValue(new Error('prisma: relation "Division" token=abc'))
    const res = await team.GET(jsonReq('/api/kadiv/team', 'GET'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Data tim belum termuat' })
  })

  it('ingatkan: hanya PIC proyek divisinya yang belum mengirim; audit REMIND_PIC; lonceng bertemplat PIC', async () => {
    asUser('kadiv-1')
    const res = await post({ action: 'remind' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toEqual([{ userId: 'pic-1', name: 'Rina', projectId: 'p-1' }])
    expect(world.notifications).toEqual([expect.objectContaining({ userId: 'pic-1', template: 'PENGINGAT_HARIAN_PIC' })])
    expect(JSON.parse(world.notifications[0].payload as string).projectId).toBe('p-1')
    expect(auditsOf('REMIND_PIC')).toEqual([expect.objectContaining({ actorId: 'kadiv-1', targetId: 'p-1' })])
    // Laporan yang dicek dibatasi ke proyek divisi & hari ini.
    expect(db.dailyProjectReport.findMany.mock.calls[0][0].where).toMatchObject({ projectId: { in: ['p-1'] }, reportDate: TODAY })
  })

  it('ingatkan dilewati bila sudah mengirim, sedang cuti, atau sudah diingatkan hari ini', async () => {
    asUser('kadiv-1')
    for (const setup of [
      () => db.dailyProjectReport.findMany.mockResolvedValueOnce([{ projectId: 'p-1' }]),
      () => db.attendance.findMany.mockResolvedValueOnce([{ userId: 'pic-1' }]),
      () => db.notificationLog.findMany.mockResolvedValueOnce([{ payload: JSON.stringify({ projectId: 'p-1' }) }]),
    ]) {
      setup()
      const body = await (await post({ action: 'remind' })).json()
      expect(body).toMatchObject({ sent: [], skipped: 1 })
    }
    expect(world.notifications).toHaveLength(0)
  })

  it('ingatkan satu orang di luar tim: 404; divisi lain: 403', async () => {
    asUser('kadiv-1')
    expect((await post({ action: 'remind', userId: 'pic-2' })).status).toBe(404)
    expect((await post({ action: 'remind', divisionId: 'div-a2' })).status).toBe(403)
    expect(world.notifications).toHaveLength(0)
  })

  it('setelah 17.00 pengingat ditolak 409 locked', async () => {
    vi.setSystemTime(wib('2026-10-06T17:05:00'))
    asUser('kadiv-1')
    const res = await post({ action: 'remind' })
    expect(res.status).toBe(409)
    expect((await res.json()).locked).toBe(true)
  })

  it('tandai dibaca: laporan terkirim hari ini milik anggota; audit KADIV_READ_DAILY; urungkan menghapus tanda', async () => {
    asUser('kadiv-1')
    db.dailyProjectReport.findMany.mockResolvedValue([{ id: 'dr-1' }])
    const res = await post({ action: 'read', userId: 'pic-1' })
    expect(await res.json()).toEqual({ ok: true, reportIds: ['dr-1'] })
    expect(db.dailyProjectReport.findMany.mock.calls[0][0].where).toEqual({
      projectId: { in: ['p-1'] }, reportDate: TODAY, submittedAt: { not: null },
    })
    expect(db.dailyReportRead.createMany.mock.calls[0][0].data).toEqual([{ dailyReportId: 'dr-1', userId: 'kadiv-1' }])
    expect(auditsOf('KADIV_READ_DAILY')[0].after).toEqual({ reportIds: ['dr-1'], divisionId: 'div-a1' })

    await post({ action: 'unread', userId: 'pic-1' })
    expect(db.dailyReportRead.deleteMany.mock.calls[0][0].where).toEqual({ userId: 'kadiv-1', dailyReportId: { in: ['dr-1'] } })
    expect(auditsOf('KADIV_UNREAD_DAILY')).toHaveLength(1)
  })

  it('tandai dibaca: bukan anggota 404, belum ada laporan 409, tabel belum dimigrasi 503, tanpa userId 400', async () => {
    asUser('kadiv-1')
    expect((await post({ action: 'read', userId: 'pic-2' })).status).toBe(404)
    expect((await post({ action: 'read', userId: 'pic-1' })).status).toBe(409)
    db.dailyProjectReport.findMany.mockResolvedValue([{ id: 'dr-1' }])
    db.dailyReportRead.findMany.mockRejectedValue(Object.assign(new Error('tabel tidak ada'), { code: 'P2021' }))
    expect((await post({ action: 'read', userId: 'pic-1' })).status).toBe(503)
    expect((await post({ action: 'read' })).status).toBe(400)
    expect(world.audits).toHaveLength(0)
  })

  it('aksi tak dikenal 400; body bukan objek 400', async () => {
    asUser('kadiv-1')
    expect((await post({ action: 'hapus' })).status).toBe(400)
    expect((await post('[]')).status).toBe(400)
  })
})

/* ------------------------------------------------------------------ */
/* /api/kadiv/members                                                   */
/* ------------------------------------------------------------------ */

describe('/api/kadiv/members', () => {
  const put = (body: unknown) => members.PUT(jsonReq('/api/kadiv/members', 'PUT', body))

  beforeEach(() => {
    db.user.update.mockResolvedValue({})
  })

  it.each([
    ['kadiv-1', 200],
    ['admin-a', 200],
    ['sa', 200],
    ['kadiv-2', 403],
    ['admin-b', 403],
    ['pic-1', 403],
    ['dir-a', 403],
  ])('GET div-a1 sebagai %s → %i', async (id, status) => {
    asUser(id)
    expect((await members.GET(jsonReq('/api/kadiv/members?divisionId=div-a1', 'GET'))).status).toBe(status)
  })

  it('GET: calon anggota hanya PIC aktif di PT divisi, tanpa kepala divisinya', async () => {
    asUser('kadiv-1')
    const body = await (await members.GET(jsonReq('/api/kadiv/members?divisionId=div-a1', 'GET'))).json()
    expect(body.people.map((p: { id: string; isMember: boolean }) => [p.id, p.isMember])).toEqual([
      ['pic-1', true], ['pic-2', false], ['pic-4', false],
    ])
    expect(body.projects.map((p: { id: string }) => p.id)).toEqual(['p-1', 'p-2'])
  })

  it('GET tanpa divisionId: 403', async () => {
    asUser('kadiv-1')
    expect((await members.GET(jsonReq('/api/kadiv/members', 'GET'))).status).toBe(403)
  })

  it('kepala divisi menambah PIC tanpa divisi: User.divisionId diisi, audit sebelum/sesudah', async () => {
    asUser('kadiv-1')
    const res = await put({ divisionId: 'div-a1', userId: 'pic-4', member: true })
    expect(await res.json()).toEqual({ ok: true, previousDivisionId: null })
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'pic-4' }, data: { divisionId: 'div-a1' } })
    const [a] = auditsOf('SET_DIVISION_MEMBER')
    expect(a.before).toEqual({ divisionId: null })
    expect(a.after).toMatchObject({ divisionId: 'div-a1', division: 'Media' })
  })

  it('kepala divisi tidak bisa menarik anggota divisi lain (409); Admin PT boleh memindahkan', async () => {
    asUser('kadiv-1')
    expect((await put({ divisionId: 'div-a1', userId: 'pic-2', member: true })).status).toBe(409)
    expect(db.user.update).not.toHaveBeenCalled()
    asUser('admin-a')
    expect((await put({ divisionId: 'div-a1', userId: 'pic-2', member: true })).status).toBe(200)
  })

  it.each<[Record<string, unknown>, number, string]>([
    [{ userId: 'pic-3', member: true }, 422, 'akun PT lain'],
    [{ userId: 'kadiv-2', member: true }, 422, 'bukan peran PIC'],
    [{ userId: 'pic-4', member: 'ya' }, 400, 'member bukan boolean'],
    [{}, 400, 'tanpa akun/proyek'],
  ])('PUT %o → %i (%s)', async (extra, status) => {
    asUser('kadiv-1')
    expect((await put({ divisionId: 'div-a1', ...extra })).status).toBe(status)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('keluarkan orang yang bukan anggota: tidak ada perubahan, tanpa audit', async () => {
    asUser('kadiv-1')
    expect(await (await put({ divisionId: 'div-a1', userId: 'pic-2', member: false })).json()).toEqual({ ok: true, unchanged: true })
    expect(db.user.update).not.toHaveBeenCalled()
    expect(world.audits).toHaveLength(0)
  })

  it('divisi lain: 403 tanpa menyentuh akun', async () => {
    asUser('kadiv-2')
    expect((await put({ divisionId: 'div-a1', userId: 'pic-4', member: true })).status).toBe(403)
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })

  it('tautan proyek: PT lain 422, proyek divisi lain 409 untuk kepala divisi, Admin PT boleh + audit', async () => {
    asUser('kadiv-1')
    expect((await put({ divisionId: 'div-a1', projectId: 'p-3', assign: true })).status).toBe(422)
    expect((await put({ divisionId: 'div-a1', projectId: 'p-2', assign: true })).status).toBe(409)
    expect((await put({ divisionId: 'div-a1', projectId: 'p-2', assign: 1 })).status).toBe(400)
    expect(db.project.update).not.toHaveBeenCalled()
    asUser('admin-a')
    expect(await (await put({ divisionId: 'div-a1', projectId: 'p-2', assign: true })).json()).toEqual({ ok: true, previousDivisionId: 'div-a2' })
    expect(db.project.update).toHaveBeenCalledWith({ where: { id: 'p-2' }, data: { divisionId: 'div-a1' } })
    expect(auditsOf('SET_PROJECT_DIVISION')[0].before).toEqual({ divisionId: 'div-a2' })
  })
})

// Pastikan pencocok fixture memang menyaring (penjaga terhadap tes yang lolos karena kosong).
describe('fixture', () => {
  it('matches menyaring in/not/null', () => {
    expect(matches({ a: 1, b: null }, { a: { in: [1, 2] }, b: null })).toBe(true)
    expect(matches({ a: 3 }, { a: { in: [1, 2] } })).toBe(false)
    expect(matches({ a: 1 }, { a: { not: 1 } })).toBe(false)
  })
})
