import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asUser, auditsOf, db, jsonReq, matches, resetWorld, wib, world } from './pic-world'

/*
 * [F3-C] Route proyek sisi PIC tanpa basis data:
 *   /api/project-notes      — percakapan PIC ↔ kepala divisi, status baca per akun
 *   /api/project-stages     — tahapan bertanggal
 *   /api/deadline-proposals — usulan geser tenggat (PIC mengajukan, direktur memutuskan)
 * Fokus: cakupan peran (anti-IDOR), validasi, transisi status, audit log.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => (await import('./pic-world')).auth)

import * as notes from '@/app/api/project-notes/route'
import * as stages from '@/app/api/project-stages/route'
import * as deadlines from '@/app/api/deadline-proposals/route'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-06T10:00:00')) // Selasa 10.00 WIB
  resetWorld()
})
afterEach(() => vi.useRealTimers())

/* ------------------------------------------------------------------ */
/* /api/project-notes                                                   */
/* ------------------------------------------------------------------ */

describe('/api/project-notes — cakupan', () => {
  beforeEach(() => {
    db.projectNote.findMany.mockResolvedValue([])
    db.projectNote.count.mockResolvedValue(0)
    db.noteRead.createMany.mockResolvedValue({ count: 0 })
  })

  it.each([
    ['pic-1', 200],
    ['kadiv-1', 200],
    ['admin-a', 200],
    ['dir-a', 200], // pengawas boleh membaca & mengirim catatan ke PIC [F2-DIREKTUR]
    ['pic-2', 403],
    ['kadiv-2', 403], // kepala divisi lain di PT yang sama
    ['admin-b', 403],
    ['dir-b', 403],
  ])('GET ?projectId=p-1 sebagai %s → %i', async (id, status) => {
    asUser(id)
    const res = await notes.GET(jsonReq('/api/project-notes?projectId=p-1', 'GET'))
    expect(res.status).toBe(status)
    if (status === 403) expect(db.projectNote.findMany).not.toHaveBeenCalled()
  })

  it('peran pantau non-pengawas (auditor) ditolak walau cakupannya global', async () => {
    world.current = { id: 'aud', name: 'Auditor', email: 'aud@contoh.test', role: 'AUDITOR', scopeEntityId: null, avatarColor: null }
    expect((await notes.GET(jsonReq('/api/project-notes?projectId=p-1', 'GET'))).status).toBe(403)
  })

  it('?unread=1 dihitung dalam cakupan akun; peran lain selalu 0 tanpa kueri', async () => {
    db.projectNote.count.mockResolvedValue(3)
    asUser('pic-1')
    expect(await (await notes.GET(jsonReq('/api/project-notes?unread=1', 'GET'))).json()).toEqual({ unread: 3 })
    const where = db.projectNote.count.mock.calls[0][0].where
    expect(where).toMatchObject({ authorId: { not: 'pic-1' }, readAt: null, reads: { none: { userId: 'pic-1' } }, project: { picUserId: 'pic-1' } })

    asUser('dir-a')
    expect(await (await notes.GET(jsonReq('/api/project-notes?unread=1', 'GET'))).json()).toEqual({ unread: 0 })
    expect(db.projectNote.count).toHaveBeenCalledTimes(1)
  })
})

describe('/api/project-notes — status baca per akun', () => {
  const READ_AT = wib('2026-10-06T08:30:00')
  const ROWS = [
    {
      id: 'n-1', body: 'Mohon kirim foto', createdAt: wib('2026-10-06T08:00:00'), readAt: null, authorId: 'kadiv-1',
      author: { name: 'Andi', role: 'KEPALA_DIVISI' }, reads: [{ userId: 'pic-1', readAt: READ_AT }],
    },
    {
      id: 'n-0', body: 'Catatan lama', createdAt: wib('2026-09-30T08:00:00'), readAt: wib('2026-09-30T09:00:00'), authorId: 'pic-1',
      author: { name: 'Rina', role: 'PIC_PROYEK' }, reads: [],
    },
  ]

  beforeEach(() => {
    db.projectNote.findMany.mockResolvedValue(ROWS.map((r) => ({ ...r })))
    db.projectNote.count.mockResolvedValue(0)
  })

  it('PIC: catatan pihak lain memakai waktu baca miliknya; urutan lama → baru; nama kepala divisi ikut', async () => {
    asUser('pic-1')
    const body = await (await notes.GET(jsonReq('/api/project-notes?projectId=p-1', 'GET'))).json()
    expect(body.items.map((n: { id: string }) => n.id)).toEqual(['n-0', 'n-1'])
    const n1 = body.items[1]
    expect(n1).toMatchObject({ mine: false, readCount: 1, readAt: READ_AT.toISOString() })
    expect(body.items[0]).toMatchObject({ mine: true, readAt: wib('2026-09-30T09:00:00').toISOString() }) // kolom lama
    expect(body.heads).toEqual(['Andi'])
    // Hitungan belum dibaca dibatasi ke proyek & akun ini.
    expect(db.projectNote.count.mock.calls[0][0].where).toMatchObject({ projectId: 'p-1', authorId: { not: 'pic-1' } })
  })

  it('Admin PT belum membaca catatan kepala divisi: readAt null walau PIC sudah membacanya', async () => {
    asUser('admin-a')
    const body = await (await notes.GET(jsonReq('/api/project-notes?projectId=p-1', 'GET'))).json()
    expect(body.items[1]).toMatchObject({ id: 'n-1', mine: false, readAt: null })
  })

  it('penulis melihat kapan catatannya pertama dibaca pihak lain', async () => {
    asUser('kadiv-1')
    const body = await (await notes.GET(jsonReq('/api/project-notes?projectId=p-1', 'GET'))).json()
    expect(body.items[1]).toMatchObject({ id: 'n-1', mine: true, readAt: READ_AT.toISOString() })
  })

  it('PATCH menandai dibaca hanya untuk akun ini', async () => {
    asUser('admin-a')
    db.projectNote.findMany.mockResolvedValue([{ id: 'n-1' }, { id: 'n-2' }])
    db.noteRead.createMany.mockResolvedValue({ count: 2 })
    const res = await notes.PATCH(jsonReq('/api/project-notes', 'PATCH', { projectId: 'p-1' }))
    expect(await res.json()).toEqual({ ok: true, marked: 2 })
    const q = db.projectNote.findMany.mock.calls[0][0].where
    expect(q).toMatchObject({ projectId: 'p-1', authorId: { not: 'admin-a' }, reads: { none: { userId: 'admin-a' } } })
    expect(db.noteRead.createMany.mock.calls[0][0]).toEqual({
      data: [{ noteId: 'n-1', userId: 'admin-a' }, { noteId: 'n-2', userId: 'admin-a' }],
      skipDuplicates: true,
    })
  })

  it('PATCH di proyek lain ditolak tanpa menulis NoteRead', async () => {
    asUser('pic-2')
    expect((await notes.PATCH(jsonReq('/api/project-notes', 'PATCH', { projectId: 'p-1' }))).status).toBe(403)
    expect(db.noteRead.createMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/project-notes', () => {
  beforeEach(() => {
    db.projectNote.create.mockImplementation(async ({ data }) => ({ id: 'n-9', createdAt: new Date(), readAt: null, ...data }))
    db.projectNote.findMany.mockResolvedValue([])
  })

  it('catatan kosong 422; body bukan objek 400', async () => {
    asUser('pic-1')
    expect((await notes.POST(jsonReq('/api/project-notes', 'POST', { projectId: 'p-1', body: '   ' }))).status).toBe(422)
    expect((await notes.POST(jsonReq('/api/project-notes', 'POST', 'x'))).status).toBe(400)
    expect(db.projectNote.create).not.toHaveBeenCalled()
  })

  it('PIC mengirim: dipotong 2000 huruf, audit tercatat, lonceng ke kepala divisi & Admin PT', async () => {
    asUser('pic-1')
    const res = await notes.POST(jsonReq('/api/project-notes', 'POST', { projectId: 'p-1', body: 'a'.repeat(2500) }))
    expect(res.status).toBe(201)
    expect(db.projectNote.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p-1', authorId: 'pic-1' })
    expect(db.projectNote.create.mock.calls[0][0].data.body).toHaveLength(2000)
    expect(auditsOf('CREATE_PROJECT_NOTE')).toEqual([expect.objectContaining({ actorId: 'pic-1', targetId: 'n-9' })])
    expect(world.notifications.map((n) => n.userId).sort()).toEqual(['admin-a', 'kadiv-1'])
  })

  it('kepala divisi lain tidak bisa menulis di proyek divisi lain', async () => {
    asUser('kadiv-2')
    expect((await notes.POST(jsonReq('/api/project-notes', 'POST', { projectId: 'p-1', body: 'Halo' }))).status).toBe(403)
    expect(db.projectNote.create).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ */
/* /api/project-stages                                                  */
/* ------------------------------------------------------------------ */

describe('/api/project-stages', () => {
  type Stage = { id: string; projectId: string; name: string; position: number; startDate: Date | null; dueDate: Date | null; status: string; note: string | null }
  let rows: Stage[] = []

  beforeEach(() => {
    rows = [
      { id: 's-1', projectId: 'p-1', name: 'Desain', position: 0, startDate: wib('2026-10-01T00:00:00'), dueDate: wib('2026-10-10T00:00:00'), status: 'BERJALAN', note: null },
      { id: 's-2', projectId: 'p-1', name: 'Produksi', position: 1, startDate: null, dueDate: null, status: 'BELUM_MULAI', note: null },
      { id: 's-9', projectId: 'p-2', name: 'Uji', position: 0, startDate: null, dueDate: null, status: 'BELUM_MULAI', note: null },
    ]
    db.projectStage.findMany.mockImplementation(async ({ where }) => rows.filter((s) => matches(s, where)))
    db.projectStage.findUnique.mockImplementation(async ({ where }) => rows.find((s) => s.id === where.id) ?? null)
    db.projectStage.count.mockImplementation(async ({ where }) => rows.filter((s) => matches(s, where)).length)
    db.projectStage.findFirst.mockImplementation(async ({ where }) => {
      const r = rows.filter((s) => matches(s, where)).sort((a, b) => b.position - a.position)
      return r[0] ?? null
    })
    db.projectStage.create.mockImplementation(async ({ data }) => ({ id: 's-new', ...data }))
    db.projectStage.update.mockImplementation(async ({ where, data }) => ({ ...rows.find((s) => s.id === where.id), ...data }))
    db.projectStage.delete.mockResolvedValue({})
    db.deadlineProposal.findFirst.mockResolvedValue(null)
  })

  it('GET: canEdit hanya untuk PIC/Admin/master; kepala divisi & direktur membaca saja', async () => {
    for (const [id, canEdit] of [['pic-1', true], ['admin-a', true], ['kadiv-1', false], ['dir-a', false]] as const) {
      asUser(id)
      const body = await (await stages.GET(jsonReq('/api/project-stages?projectId=p-1', 'GET'))).json()
      expect([id, body.canEdit, body.total]).toEqual([id, canEdit, 2])
    }
    asUser('pic-2')
    expect((await stages.GET(jsonReq('/api/project-stages?projectId=p-1', 'GET'))).status).toBe(403)
  })

  it('POST: tahap baru di posisi terakhir + audit', async () => {
    asUser('pic-1')
    const res = await stages.POST(jsonReq('/api/project-stages', 'POST', { projectId: 'p-1', name: 'Rilis', startDate: '2026-10-20', dueDate: '2026-10-24' }))
    expect(res.status).toBe(201)
    expect(db.projectStage.create.mock.calls[0][0].data).toMatchObject({ projectId: 'p-1', position: 2, name: 'Rilis', status: 'BELUM_MULAI' })
    expect(auditsOf('CREATE_PROJECT_STAGE')[0].after).toEqual({ projectId: 'p-1', name: 'Rilis' })
  })

  it.each<[Record<string, unknown>, string]>([
    [{ name: 'R' }, 'nama pendek'],
    [{ name: 'Rilis', startDate: '2026-10-20', dueDate: '2026-10-19' }, 'selesai sebelum mulai'],
    [{ name: 'Rilis', dueDate: '20-10-2026' }, 'format tanggal'],
    [{ name: 'Rilis', status: 'DIBATALKAN' }, 'status tak dikenal'],
    [{ name: 'Rilis', status: 'TERTAHAN' }, 'tertahan tanpa alasan'],
  ])('POST validasi %o (%s) → 422', async (extra) => {
    asUser('pic-1')
    const res = await stages.POST(jsonReq('/api/project-stages', 'POST', { projectId: 'p-1', ...extra }))
    expect(res.status).toBe(422)
    expect(db.projectStage.create).not.toHaveBeenCalled()
  })

  it('POST: maksimal 20 tahap', async () => {
    asUser('pic-1')
    db.projectStage.count.mockResolvedValue(20)
    expect((await stages.POST(jsonReq('/api/project-stages', 'POST', { projectId: 'p-1', name: 'Rilis' }))).status).toBe(422)
  })

  it('POST: kepala divisi tidak mengelola tahapan (403)', async () => {
    asUser('kadiv-1')
    expect((await stages.POST(jsonReq('/api/project-stages', 'POST', { projectId: 'p-1', name: 'Rilis' }))).status).toBe(403)
  })

  it('PUT: tahap proyek lain ditolak walau id-nya ditebak', async () => {
    asUser('pic-1')
    expect((await stages.PUT(jsonReq('/api/project-stages', 'PUT', { id: 's-9', name: 'Diambil alih' }))).status).toBe(403)
    expect(db.projectStage.update).not.toHaveBeenCalled()
  })

  it('PUT: tanggal selesai baru sebelum tanggal mulai yang tersimpan → 422', async () => {
    asUser('pic-1')
    expect((await stages.PUT(jsonReq('/api/project-stages', 'PUT', { id: 's-1', dueDate: '2026-09-30' }))).status).toBe(422)
  })

  it('PUT: tertahan tanpa catatan 422; dengan catatan tersimpan + audit sebelum/sesudah', async () => {
    asUser('pic-1')
    expect((await stages.PUT(jsonReq('/api/project-stages', 'PUT', { id: 's-1', status: 'TERTAHAN' }))).status).toBe(422)
    const res = await stages.PUT(jsonReq('/api/project-stages', 'PUT', { id: 's-1', status: 'TERTAHAN', note: 'Menunggu material' }))
    expect(res.status).toBe(200)
    // Hanya kolom yang dikirim yang diubah.
    expect(db.projectStage.update.mock.calls[0][0].data).toEqual({ status: 'TERTAHAN', note: 'Menunggu material' })
    const [a] = auditsOf('UPDATE_PROJECT_STAGE')
    expect(a.before).toMatchObject({ name: 'Desain', status: 'BERJALAN' })
  })

  it('PATCH urutan: harus memuat semua tahap tepat sekali', async () => {
    asUser('pic-1')
    for (const order of [['s-1'], ['s-1', 's-1'], ['s-1', 's-9'], ['s-2', 's-1', 's-9']]) {
      expect((await stages.PATCH(jsonReq('/api/project-stages', 'PATCH', { projectId: 'p-1', order }))).status).toBe(422)
    }
    const res = await stages.PATCH(jsonReq('/api/project-stages', 'PATCH', { projectId: 'p-1', order: ['s-2', 's-1'] }))
    expect(res.status).toBe(200)
    expect(db.projectStage.update.mock.calls.map((c) => [c[0].where.id, c[0].data.position])).toEqual([['s-2', 0], ['s-1', 1]])
    expect(auditsOf('REORDER_PROJECT_STAGES')[0].after).toEqual({ order: ['s-2', 's-1'] })
  })

  it('DELETE: Admin PT lain 403; PIC menghapus + audit', async () => {
    asUser('admin-b')
    expect((await stages.DELETE(jsonReq('/api/project-stages?id=s-1', 'DELETE'))).status).toBe(403)
    asUser('pic-1')
    expect((await stages.DELETE(jsonReq('/api/project-stages?id=s-1', 'DELETE'))).status).toBe(200)
    expect(auditsOf('DELETE_PROJECT_STAGE')[0].before).toEqual({ name: 'Desain', status: 'BERJALAN' })
    expect((await stages.DELETE(jsonReq('/api/project-stages?id=s-x', 'DELETE'))).status).toBe(404)
  })
})

/* ------------------------------------------------------------------ */
/* /api/deadline-proposals                                              */
/* ------------------------------------------------------------------ */

describe('/api/deadline-proposals', () => {
  type Prop = Record<string, unknown> & { id: string; projectId: string; status: string }
  let props: Prop[] = []
  const TARGET = wib('2026-10-24T00:00:00') // targetEndDate fixture

  function seed(p: Partial<Prop> & { id: string }): Prop {
    const row: Prop = {
      projectId: 'p-1', previousDate: TARGET, proposedDate: wib('2026-10-31T00:00:00'), reason: 'Material terlambat datang',
      status: 'DIAJUKAN', proposedById: 'pic-1', decidedById: null, decidedAt: null, decisionNote: null, createdAt: new Date(),
      project: { name: 'Gudang Timur', code: 'PRJ-01', targetEndDate: TARGET }, proposedBy: { name: 'Rina' }, decidedBy: null,
      ...p,
    }
    props.push(row)
    return row
  }
  const prop = (id: string) => props.find((p) => p.id === id)

  beforeEach(() => {
    props = []
    db.deadlineProposal.findUnique.mockImplementation(async ({ where }) => {
      const p = prop(where.id)
      return p ? { ...p } : null
    })
    db.deadlineProposal.findUniqueOrThrow.mockImplementation(async ({ where }) => ({ ...prop(where.id) }))
    db.deadlineProposal.findFirst.mockImplementation(async ({ where }) => props.find((p) => matches(p, where)) ?? null)
    db.deadlineProposal.findMany.mockImplementation(async ({ where }) => props.filter((p) => matches(p, where)))
    db.deadlineProposal.create.mockImplementation(async ({ data }) => seed({ id: 'dp-new', ...data }))
    db.deadlineProposal.updateMany.mockImplementation(async ({ where, data }) => {
      const hit = props.filter((p) => matches(p, where))
      for (const p of hit) Object.assign(p, data)
      return { count: hit.length }
    })
    db.deadlineProposal.deleteMany.mockImplementation(async ({ where }) => {
      const before = props.length
      props = props.filter((p) => !matches(p, where))
      return { count: before - props.length }
    })
  })

  const post = (body: unknown) => deadlines.POST(jsonReq('/api/deadline-proposals', 'POST', body))
  const patch = (body: unknown) => deadlines.PATCH(jsonReq('/api/deadline-proposals', 'PATCH', body))
  const VALID = { projectId: 'p-1', proposedDate: '2026-10-31', reason: 'Material terlambat datang dari pemasok' }

  it('PIC mengajukan: 201, audit dengan tenggat lama, lonceng hanya ke direktur PT proyek', async () => {
    asUser('pic-1')
    const res = await post(VALID)
    expect(res.status).toBe(201)
    const [a] = auditsOf('PROPOSE_DEADLINE')
    expect(a.targetId).toBe('p-1')
    expect(a.before).toEqual({ targetEndDate: TARGET.toISOString() })
    expect(world.notifications.map((n) => n.userId)).toEqual(['dir-a'])
  })

  it.each<[Record<string, unknown>, string]>([
    [{ proposedDate: '2026-10-06' }, 'hari ini'],
    [{ proposedDate: '2026-10-01' }, 'masa lalu'],
    [{ proposedDate: '2026-10-24' }, 'sama dengan tenggat sekarang'],
    [{ proposedDate: 'besok' }, 'format'],
    [{ reason: 'telat' }, 'alasan pendek'],
  ])('validasi %o (%s) → 422', async (extra) => {
    asUser('pic-1')
    expect((await post({ ...VALID, ...extra })).status).toBe(422)
    expect(db.deadlineProposal.create).not.toHaveBeenCalled()
  })

  it('satu usulan terbuka per proyek: 409', async () => {
    seed({ id: 'dp-1' })
    asUser('pic-1')
    expect((await post(VALID)).status).toBe(409)
  })

  it.each(['pic-2', 'kadiv-1', 'admin-b', 'dir-a'])('%s tidak bisa mengajukan untuk p-1 (403)', async (id) => {
    asUser(id)
    expect((await post(VALID)).status).toBe(403)
  })

  it('GET antrean pemutus dibatasi ke PT-nya', async () => {
    seed({ id: 'dp-1' })
    asUser('dir-a')
    const body = await (await deadlines.GET(jsonReq('/api/deadline-proposals?status=DIAJUKAN', 'GET'))).json()
    expect(body.canDecide).toBe(true)
    expect(db.deadlineProposal.findMany.mock.calls[0][0].where).toEqual({ project: { entityId: { in: ['pt-a'] } }, status: 'DIAJUKAN' })
    asUser('pic-2')
    expect((await deadlines.GET(jsonReq('/api/deadline-proposals?projectId=p-1', 'GET'))).status).toBe(403)
  })

  it('PIC/Admin PT/kepala divisi tidak memutuskan (403); direktur PT lain 403', async () => {
    seed({ id: 'dp-1' })
    for (const id of ['pic-1', 'admin-a', 'kadiv-1', 'dir-b']) {
      asUser(id)
      expect([id, (await patch({ id: 'dp-1', action: 'approve' })).status]).toEqual([id, 403])
    }
    expect(prop('dp-1')!.status).toBe('DIAJUKAN')
    expect(db.project.update).not.toHaveBeenCalled()
  })

  it('direktur menyetujui: tenggat proyek berubah dalam transaksi, audit, lonceng ke pengaju; kedua kali 409', async () => {
    seed({ id: 'dp-1' })
    asUser('dir-a')
    const res = await patch({ id: 'dp-1', action: 'approve' })
    expect(res.status).toBe(200)
    expect(prop('dp-1')).toMatchObject({ status: 'DISETUJUI', decidedById: 'dir-a' })
    expect(db.$transaction).toHaveBeenCalled()
    expect(db.project.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: { targetEndDate: wib('2026-10-31T00:00:00') } })
    const [a] = auditsOf('APPROVE_DEADLINE')
    expect(a.after.status).toBe('DISETUJUI')
    expect(world.notifications.map((n) => [n.userId, n.template])).toEqual([['pic-1', 'DEADLINE_DECIDED']])
    expect((await patch({ id: 'dp-1', action: 'approve' })).status).toBe(409)
  })

  it.each([
    ['2026-10-05', '2026-10-06T10:00:00'],
    ['2026-10-06', '2026-10-07T00:00:00'],
    ['2026-10-06', '2026-10-07T00:00:01'],
  ])('CX8.6: usulan %s yang sudah lewat saat %s WIB ditolak 422 tanpa efek samping', async (date, now) => {
    seed({ id: 'dp-1', proposedDate: wib(`${date}T00:00:00`) })
    vi.setSystemTime(wib(now))
    asUser('dir-a')
    const res = await patch({ id: 'dp-1', action: 'approve' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/tenggat.*lewat/i) })
    expect(prop('dp-1')).toMatchObject({ status: 'DIAJUKAN', decidedById: null })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.project.update).not.toHaveBeenCalled()
    expect(world.audits).toHaveLength(0)
    expect(world.notifications).toHaveLength(0)
  })

  it.each(['2026-10-06T00:00:00', '2026-10-06T23:59:59'])('CX8.6: tenggat hari ini masih boleh disetujui pada %s WIB', async (now) => {
    const proposedDate = wib('2026-10-06T00:00:00')
    seed({ id: 'dp-1', proposedDate })
    vi.setSystemTime(wib(now))
    asUser('dir-a')
    expect((await patch({ id: 'dp-1', action: 'approve' })).status).toBe(200)
    expect(db.project.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: { targetEndDate: proposedDate } })
  })

  it('CX8.6: usulan kedaluwarsa tetap boleh ditolak atau ditarik', async () => {
    seed({ id: 'dp-1', proposedDate: wib('2026-10-01T00:00:00') })
    asUser('dir-a')
    expect((await patch({ id: 'dp-1', action: 'reject', note: 'Ajukan tenggat baru' })).status).toBe(200)
    seed({ id: 'dp-2', proposedDate: wib('2026-10-01T00:00:00') })
    asUser('pic-1')
    expect((await patch({ id: 'dp-2', action: 'withdraw' })).status).toBe(200)
    expect(db.project.update).not.toHaveBeenCalled()
  })

  it('menolak wajib alasan', async () => {
    seed({ id: 'dp-1' })
    asUser('dir-a')
    expect((await patch({ id: 'dp-1', action: 'reject' })).status).toBe(422)
    expect((await patch({ id: 'dp-1', action: 'reject', note: 'Tenggat rilis tidak bisa mundur' })).status).toBe(200)
    expect(prop('dp-1')!.status).toBe('DITOLAK')
    expect(db.project.update).not.toHaveBeenCalled()
  })

  it('pemutus tidak memutuskan usulannya sendiri', async () => {
    seed({ id: 'dp-1', proposedById: 'sa' })
    asUser('sa')
    expect((await patch({ id: 'dp-1', action: 'approve' })).status).toBe(403)
  })

  it('tarik usulan: pengaju boleh; PIC tidak bisa menarik usulan Admin PT; PIC lain 403', async () => {
    seed({ id: 'dp-1', proposedById: 'admin-a' })
    asUser('pic-1')
    expect((await patch({ id: 'dp-1', action: 'withdraw' })).status).toBe(403)
    asUser('pic-2')
    expect((await patch({ id: 'dp-1', action: 'withdraw' })).status).toBe(403)
    asUser('admin-a')
    expect((await patch({ id: 'dp-1', action: 'withdraw' })).status).toBe(200)
    expect(prop('dp-1')).toBeUndefined()
    expect(auditsOf('WITHDRAW_DEADLINE')).toHaveLength(1)
  })

  it('urungkan keputusan dalam 15 menit memulihkan tenggat bila belum diubah lagi', async () => {
    seed({ id: 'dp-1' })
    asUser('dir-a')
    await patch({ id: 'dp-1', action: 'approve' })

    asUser('mgmt')
    expect((await patch({ id: 'dp-1', action: 'undo' })).status).toBe(403) // bukan keputusannya

    asUser('dir-a')
    vi.advanceTimersByTime(10 * 60000)
    expect((await patch({ id: 'dp-1', action: 'undo' })).status).toBe(200)
    expect(prop('dp-1')).toMatchObject({ status: 'DIAJUKAN', decidedById: null, decidedAt: null })
    expect(db.project.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', targetEndDate: wib('2026-10-31T00:00:00') },
      data: { targetEndDate: TARGET },
    })
    expect(auditsOf('UNDO_DEADLINE_DECISION')[0].before).toMatchObject({ status: 'DISETUJUI' })
  })

  it('urungkan setelah 15 menit: 409', async () => {
    seed({ id: 'dp-1' })
    asUser('dir-a')
    await patch({ id: 'dp-1', action: 'reject', note: 'Tidak bisa mundur' })
    vi.advanceTimersByTime(16 * 60000)
    expect((await patch({ id: 'dp-1', action: 'undo' })).status).toBe(409)
    expect(prop('dp-1')!.status).toBe('DITOLAK')
  })

  it('aksi tak dikenal 400; id tak dikenal 404', async () => {
    seed({ id: 'dp-1' })
    asUser('dir-a')
    expect((await patch({ id: 'dp-1', action: 'hapus' })).status).toBe(400)
    expect((await patch({ id: 'dp-x', action: 'approve' })).status).toBe(404)
  })
})
