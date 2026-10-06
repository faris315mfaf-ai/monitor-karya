import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { asUser, auditsOf, db, jsonReq, matches, resetWorld, wib, world } from './pic-world'

/*
 * [F3-C] /api/outputs (PIC) dan /api/outputs/review (kepala divisi) tanpa basis
 * data. Output & riwayat revisi disimpan di memori supaya pembaruan bersyarat
 * (updateMany where status) dan urungkan benar-benar dijalankan oleh route.
 * Fokus: cakupan peran (anti-IDOR), validasi, transisi status, audit log.
 */

vi.mock('@/lib/db', async () => ({ db: (await import('./pic-world')).db }))
vi.mock('@/lib/auth', async () => (await import('./pic-world')).auth)

import { DELETE, GET, PATCH, POST } from '@/app/api/outputs/route'
import { GET as REVIEW_GET, POST as REVIEW_POST } from '@/app/api/outputs/review/route'

type Out = Record<string, unknown> & { id: string; projectId: string; status: string }
let outputs: Out[] = []
let revisions: { id: string; outputId: string; note: string; reviewerId: string | null; createdAt: Date; undoneAt: Date | null }[] = []
let evidence = new Map<string, number>()

const PROJECT_META: Record<string, { name: string; code: string }> = {
  'p-1': { name: 'Gudang Timur', code: 'PRJ-01' },
  'p-2': { name: 'Kanal Media', code: 'PRJ-02' },
  'p-3': { name: 'Riset Pasar', code: 'PRJ-03' },
}

function seedOutput(o: Partial<Out> & { id: string; projectId: string }): Out {
  const ownerId = (o.ownerId as string) ?? { 'p-1': 'pic-1', 'p-2': 'pic-2', 'p-3': 'pic-3' }[o.projectId]!
  const row: Out = {
    title: `Output ${o.id}`, description: null, status: 'DIKERJAKAN', dueDate: null, reviewerId: null, revisionNote: null,
    submittedAt: null, reviewedAt: null, createdAt: wib('2026-10-01T09:00:00'), updatedAt: wib('2026-10-01T09:00:00'),
    ...o,
    ownerId,
    project: { id: o.projectId, ...PROJECT_META[o.projectId] },
    owner: { id: ownerId, name: ownerId, email: `${ownerId}@contoh.test` },
    reviewer: null,
  }
  outputs.push(row)
  return row
}

const byId = (id: string) => outputs.find((o) => o.id === id)

function installStores() {
  outputs = []
  revisions = []
  evidence = new Map()
  db.output.findUnique.mockImplementation(async ({ where }) => {
    const o = byId(where.id)
    return o ? { ...o } : null
  })
  db.output.findUniqueOrThrow.mockImplementation(async ({ where }) => {
    const o = byId(where.id)
    if (!o) throw new Error('tidak ada')
    return { ...o }
  })
  db.output.findFirst.mockImplementation(async ({ where }) => {
    const o = outputs.find((x) => matches(x, where))
    return o ? { ...o } : null
  })
  db.output.findMany.mockImplementation(async ({ where }) => outputs.filter((x) => matches(x, where)).map((x) => ({ ...x })))
  db.output.groupBy.mockResolvedValue([])
  db.output.updateMany.mockImplementation(async ({ where, data }) => {
    const hit = outputs.filter((x) => matches(x, where))
    for (const o of hit) Object.assign(o, data)
    return { count: hit.length }
  })
  db.output.create.mockImplementation(async ({ data }) => seedOutput({ id: `o-new-${outputs.length + 1}`, ...data }))
  db.output.delete.mockImplementation(async ({ where }) => {
    outputs = outputs.filter((o) => o.id !== where.id)
    return {}
  })
  db.evidence.count.mockImplementation(async ({ where }) => evidence.get(where.targetId) ?? 0)
  db.evidence.groupBy.mockResolvedValue([])

  db.outputRevision.create.mockImplementation(async ({ data }) => {
    const row = { id: `rev-${revisions.length + 1}`, undoneAt: null, ...data }
    revisions.push(row)
    return row
  })
  db.outputRevision.findMany.mockImplementation(async ({ where, orderBy, take }) => {
    const rows = revisions.filter((r) => matches(r, where))
    rows.sort((a, b) => (orderBy.createdAt === 'desc' ? -1 : 1) * (a.createdAt.getTime() - b.createdAt.getTime()))
    return rows.slice(0, take ?? rows.length).map((r) => ({ ...r }))
  })
  db.outputRevision.update.mockImplementation(async ({ where, data }) => {
    const r = revisions.find((x) => x.id === where.id)!
    Object.assign(r, data)
    return r
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(wib('2026-10-06T10:00:00')) // Selasa 10.00 WIB
  resetWorld()
  installStores()
})
afterEach(() => vi.useRealTimers())

const patch = (body: unknown) => PATCH(jsonReq('/api/outputs', 'PATCH', body))
const review = (body: unknown) => REVIEW_POST(jsonReq('/api/outputs/review', 'POST', body))

/* ------------------------------------------------------------------ */

describe('GET /api/outputs — cakupan baca', () => {
  it('tanpa sesi: 401 dari requireApiUser diteruskan', async () => {
    world.current = NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
    const res = await GET(jsonReq('/api/outputs?projectId=p-1', 'GET'))
    expect(res.status).toBe(401)
    expect(db.output.findMany).not.toHaveBeenCalled()
  })

  it('PIC membaca output proyeknya sendiri', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    const res = await GET(jsonReq('/api/outputs?projectId=p-1', 'GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items.map((o: { id: string }) => o.id)).toEqual(['o-1'])
    expect(body.items[0].projectName).toBe('Gudang Timur')
  })

  it('PIC tidak bisa membaca proyek PIC lain (403, tanpa kueri output)', async () => {
    asUser('pic-1')
    const res = await GET(jsonReq('/api/outputs?projectId=p-2', 'GET'))
    expect(res.status).toBe(403)
    expect(db.output.findMany).not.toHaveBeenCalled()
  })

  it('Admin PT lain ditolak; proyek tidak dikenal 404', async () => {
    asUser('admin-b')
    expect((await GET(jsonReq('/api/outputs?projectId=p-1', 'GET'))).status).toBe(403)
    expect((await GET(jsonReq('/api/outputs?projectId=p-x', 'GET'))).status).toBe(404)
  })

  it('tanpa projectId, daftar dibatasi ke cakupan akun', async () => {
    asUser('pic-1')
    await GET(jsonReq('/api/outputs', 'GET'))
    expect(db.output.findMany.mock.calls[0][0].where.project).toEqual({ picUserId: 'pic-1' })

    asUser('admin-a')
    await GET(jsonReq('/api/outputs', 'GET'))
    expect(db.output.findMany.mock.calls[1][0].where.project).toEqual({ entityId: 'pt-a' })

    asUser('kadiv-1')
    await GET(jsonReq('/api/outputs', 'GET'))
    const where = db.output.findMany.mock.calls[2][0].where.project
    expect(where.OR[0]).toEqual({ divisionId: { in: ['div-a1'] } })
  })

  it('status tak dikenal tidak ikut menjadi saringan', async () => {
    asUser('pic-1')
    await GET(jsonReq('/api/outputs?projectId=p-1&status=APA_SAJA', 'GET'))
    expect(db.output.findMany.mock.calls[0][0].where.status).toBeUndefined()
  })
})

describe('POST /api/outputs — buat output', () => {
  it('PIC membuat output di proyeknya; audit CREATE_OUTPUT tercatat', async () => {
    asUser('pic-1')
    const res = await POST(jsonReq('/api/outputs', 'POST', { projectId: 'p-1', title: '  Desain halaman  ', dueDate: '2026-10-20' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.output.title).toBe('Desain halaman')
    expect(body.output.ownerId).toBe('pic-1')
    const [a] = auditsOf('CREATE_OUTPUT')
    expect(a.actorId).toBe('pic-1')
    expect(a.after).toEqual({ title: 'Desain halaman', projectId: 'p-1' })
    expect(a.ip).toBe('10.0.0.9')
    expect(a.userAgent).toBe('vitest')
  })

  it('Admin PT membuat atas nama PIC: pemiliknya tetap PIC proyek', async () => {
    asUser('admin-a')
    const res = await POST(jsonReq('/api/outputs', 'POST', { projectId: 'p-1', title: 'Laporan uji' }))
    expect(res.status).toBe(201)
    expect((await res.json()).output.ownerId).toBe('pic-1')
  })

  it.each([
    ['pic-2', 'PIC proyek lain'],
    ['admin-b', 'Admin PT lain'],
    ['kadiv-1', 'kepala divisi (hanya mereview)'],
    ['dir-a', 'direktur (hanya membaca)'],
  ])('%s (%s) ditolak 403', async (id) => {
    asUser(id)
    const res = await POST(jsonReq('/api/outputs', 'POST', { projectId: 'p-1', title: 'Desain halaman' }))
    expect(res.status).toBe(403)
    expect(db.output.create).not.toHaveBeenCalled()
    expect(world.audits).toHaveLength(0)
  })

  it('validasi: body bukan objek 400, tanpa proyek 400, judul pendek 422, tanggal tidak ada 422', async () => {
    asUser('pic-1')
    expect((await POST(jsonReq('/api/outputs', 'POST', '["x"]'))).status).toBe(400)
    expect((await POST(jsonReq('/api/outputs', 'POST', 'bukan json'))).status).toBe(400)
    expect((await POST(jsonReq('/api/outputs', 'POST', { title: 'Desain' }))).status).toBe(400)
    expect((await POST(jsonReq('/api/outputs', 'POST', { projectId: 'p-1', title: 'ab' }))).status).toBe(422)
    expect((await POST(jsonReq('/api/outputs', 'POST', { projectId: 'p-1', title: 'Desain', dueDate: '2026-02-31' }))).status).toBe(422)
    expect(db.output.create).not.toHaveBeenCalled()
  })

  it('judul & deskripsi dipotong ke batas panjang', async () => {
    asUser('pic-1')
    await POST(jsonReq('/api/outputs', 'POST', { projectId: 'p-1', title: 'x'.repeat(500), description: 'y'.repeat(9000) }))
    const data = db.output.create.mock.calls[0][0].data
    expect(data.title).toHaveLength(200)
    expect(data.description).toHaveLength(4000)
  })
})

describe('PATCH /api/outputs — transisi status', () => {
  it('kirim tanpa bukti ditolak 422 needsEvidence; status tidak berubah', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    const res = await patch({ id: 'o-1', action: 'submit' })
    expect(res.status).toBe(422)
    expect((await res.json()).needsEvidence).toBe(true)
    expect(byId('o-1')!.status).toBe('DIKERJAKAN')
  })

  it('kirim dengan bukti: MENUNGGU_REVIEW, audit, lonceng ke kepala divisi & Admin PT (bukan pengirim)', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    evidence.set('o-1', 2)
    const res = await patch({ id: 'o-1', action: 'submit' })
    expect(res.status).toBe(200)
    expect(byId('o-1')!.status).toBe('MENUNGGU_REVIEW')
    const [a] = auditsOf('OUTPUT_SUBMIT')
    expect(a.before).toEqual({ status: 'DIKERJAKAN' })
    expect(a.after.status).toBe('MENUNGGU_REVIEW')
    const to = world.notifications.map((n) => n.userId).sort()
    expect(to).toEqual(['admin-a', 'kadiv-1'])
    expect(world.notifications.every((n) => n.template === 'OUTPUT_SUBMITTED')).toBe(true)
  })

  it('kirim ulang output yang sudah diterima: 409', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'DITERIMA' })
    evidence.set('o-1', 1)
    expect((await patch({ id: 'o-1', action: 'submit' })).status).toBe(409)
  })

  it('batal kirim kembali ke PERLU_REVISI bila ada catatan revisi; setelah diputuskan 409', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW', revisionNote: 'Perbaiki warna', submittedAt: new Date() })
    expect((await patch({ id: 'o-1', action: 'withdraw' })).status).toBe(200)
    expect(byId('o-1')).toMatchObject({ status: 'PERLU_REVISI', submittedAt: null })

    seedOutput({ id: 'o-2', projectId: 'p-1', status: 'DITERIMA' })
    expect((await patch({ id: 'o-2', action: 'withdraw' })).status).toBe(409)
  })

  it('ubah output yang sedang direview: 409; judul pendek 422', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    expect((await patch({ id: 'o-1', action: 'update', title: 'Judul baru' })).status).toBe(409)
    seedOutput({ id: 'o-2', projectId: 'p-1' })
    expect((await patch({ id: 'o-2', action: 'update', title: 'ab' })).status).toBe(422)
    expect((await patch({ id: 'o-2', action: 'update', title: 'Judul baru' })).status).toBe(200)
    expect(byId('o-2')!.title).toBe('Judul baru')
  })

  it('PIC tidak bisa menerima output sendiri (hanya kepala divisi/master)', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    expect((await patch({ id: 'o-1', action: 'accept' })).status).toBe(403)
    expect(byId('o-1')!.status).toBe('MENUNGGU_REVIEW')
  })

  it('kepala divisi lain di PT yang sama tidak bisa memutuskan (403)', async () => {
    asUser('kadiv-2')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    expect((await patch({ id: 'o-1', action: 'accept' })).status).toBe(403)
    expect(byId('o-1')!.status).toBe('MENUNGGU_REVIEW')
  })

  it('kepala divisi pelaksana menerima: DITERIMA, audit, lonceng ke pemilik', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    const res = await patch({ id: 'o-1', action: 'accept' })
    expect(res.status).toBe(200)
    expect(byId('o-1')).toMatchObject({ status: 'DITERIMA', reviewerId: 'kadiv-1' })
    expect(auditsOf('OUTPUT_ACCEPT')[0].before).toEqual({ status: 'MENUNGGU_REVIEW' })
    expect(world.notifications).toEqual([expect.objectContaining({ userId: 'pic-1', template: 'OUTPUT_REVIEWED' })])
  })

  it('kepala divisi tidak bisa memakai aksi PIC (update/kirim)', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    expect((await patch({ id: 'o-1', action: 'update', title: 'Judul baru' })).status).toBe(403)
  })

  it('minta revisi wajib catatan; catatan masuk riwayat OutputRevision', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    expect((await patch({ id: 'o-1', action: 'revise', revisionNote: 'ok' })).status).toBe(422)
    expect((await patch({ id: 'o-1', action: 'revise', revisionNote: 'Tambahkan foto lokasi' })).status).toBe(200)
    expect(byId('o-1')).toMatchObject({ status: 'PERLU_REVISI', revisionNote: 'Tambahkan foto lokasi' })
    expect(revisions).toEqual([expect.objectContaining({ outputId: 'o-1', note: 'Tambahkan foto lokasi', reviewerId: 'kadiv-1' })])
  })

  it('memutuskan output yang belum dikirim: 409', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    expect((await patch({ id: 'o-1', action: 'accept' })).status).toBe(409)
  })

  it('balapan: status berubah di sela baca & tulis → 409, tanpa audit', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    db.output.updateMany.mockResolvedValueOnce({ count: 0 })
    expect((await patch({ id: 'o-1', action: 'accept' })).status).toBe(409)
    expect(world.audits).toHaveLength(0)
  })

  it('aksi tak dikenal 400; id tak dikenal 404', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    expect((await patch({ id: 'o-1', action: 'hapus-semua' })).status).toBe(400)
    expect((await patch({ id: 'o-x', action: 'submit' })).status).toBe(404)
  })
})

describe('DELETE /api/outputs', () => {
  it('menghapus output tanpa bukti; audit DELETE_OUTPUT menyimpan keadaan sebelumnya', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', title: 'Draf video' })
    const res = await DELETE(jsonReq('/api/outputs?id=o-1', 'DELETE'))
    expect(res.status).toBe(200)
    expect(byId('o-1')).toBeUndefined()
    expect(auditsOf('DELETE_OUTPUT')[0].before).toEqual({ title: 'Draf video', status: 'DIKERJAKAN' })
  })

  it('output dengan bukti atau sudah diterima tidak terhapus (409)', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    evidence.set('o-1', 1)
    expect((await DELETE(jsonReq('/api/outputs?id=o-1', 'DELETE'))).status).toBe(409)
    seedOutput({ id: 'o-2', projectId: 'p-1', status: 'DITERIMA' })
    expect((await DELETE(jsonReq('/api/outputs?id=o-2', 'DELETE'))).status).toBe(409)
    expect(db.output.delete).not.toHaveBeenCalled()
  })

  it('PIC lain tidak bisa menghapus (403)', async () => {
    asUser('pic-2')
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    expect((await DELETE(jsonReq('/api/outputs?id=o-1', 'DELETE'))).status).toBe(403)
    expect(byId('o-1')).toBeDefined()
  })
})

/* ------------------------------------------------------------------ */

describe('GET /api/outputs/review — antrean kepala divisi', () => {
  it('hanya output menunggu review dari proyek divisinya', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    seedOutput({ id: 'o-2', projectId: 'p-2', status: 'MENUNGGU_REVIEW' })
    seedOutput({ id: 'o-3', projectId: 'p-1', status: 'DIKERJAKAN' })
    const res = await REVIEW_GET(jsonReq('/api/outputs/review', 'GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.queue.map((o: { id: string }) => o.id)).toEqual(['o-1'])
    expect(body.undoMinutes).toBe(15)
  })

  it('divisi yang tidak ia pimpin: 403', async () => {
    asUser('kadiv-1')
    expect((await REVIEW_GET(jsonReq('/api/outputs/review?divisionId=div-a2', 'GET'))).status).toBe(403)
  })

  it('akun yang tidak memimpin divisi mendapat antrean kosong, bukan semua output', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    const body = await (await REVIEW_GET(jsonReq('/api/outputs/review', 'GET'))).json()
    expect(body.queue).toEqual([])
  })
})

describe('POST /api/outputs/review — terima, revisi, terima semua', () => {
  it('akun yang tidak memimpin divisi ditolak 403', async () => {
    asUser('pic-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    expect((await review({ action: 'accept', id: 'o-1' })).status).toBe(403)
    expect(byId('o-1')!.status).toBe('MENUNGGU_REVIEW')
  })

  it('output proyek divisi lain: 404 (tidak bocor bahwa output itu ada)', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-2', projectId: 'p-2', status: 'MENUNGGU_REVIEW' })
    expect((await review({ action: 'accept', id: 'o-2' })).status).toBe(404)
    expect(byId('o-2')!.status).toBe('MENUNGGU_REVIEW')
  })

  it('terima: DITERIMA + audit OUTPUT_ACCEPT + lonceng ke PIC; kedua kali 409', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    const res = await review({ action: 'accept', id: 'o-1' })
    expect(res.status).toBe(200)
    expect((await res.json()).ids).toEqual(['o-1'])
    expect(byId('o-1')).toMatchObject({ status: 'DITERIMA', reviewerId: 'kadiv-1' })
    expect(auditsOf('OUTPUT_ACCEPT')).toHaveLength(1)
    expect(world.notifications.map((n) => n.userId)).toEqual(['pic-1'])
    expect((await review({ action: 'accept', id: 'o-1' })).status).toBe(409)
  })

  it('minta revisi: catatan minimal 5 huruf', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    expect((await review({ action: 'revise', id: 'o-1', note: 'tes' })).status).toBe(422)
    expect(byId('o-1')!.status).toBe('MENUNGGU_REVIEW')
  })

  it('terima semua hanya menyentuh output di divisinya walau id lain ikut dikirim', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    seedOutput({ id: 'o-2', projectId: 'p-2', status: 'MENUNGGU_REVIEW' })
    seedOutput({ id: 'o-3', projectId: 'p-3', status: 'MENUNGGU_REVIEW' })
    const res = await review({ action: 'accept-all', ids: ['o-1', 'o-2', 'o-3'] })
    expect((await res.json()).ids).toEqual(['o-1'])
    expect(byId('o-2')!.status).toBe('MENUNGGU_REVIEW')
    expect(byId('o-3')!.status).toBe('MENUNGGU_REVIEW')
    expect(auditsOf('OUTPUT_ACCEPT').map((a) => [a.targetId, a.after.bulk])).toEqual([['o-1', true]])
  })

  it('aksi tak dikenal 400', async () => {
    asUser('kadiv-1')
    expect((await review({ action: 'hapus' })).status).toBe(400)
  })
})

describe('POST /api/outputs/review — urungkan & riwayat revisi', () => {
  it('urungkan "minta revisi" memulihkan catatan putaran sebelumnya dari riwayat', async () => {
    asUser('kadiv-1')
    // Putaran 1: sudah pernah direvisi, PIC mengirim ulang.
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW', revisionNote: 'Tambahkan foto lokasi' })
    revisions.push({ id: 'rev-0', outputId: 'o-1', note: 'Tambahkan foto lokasi', reviewerId: 'kadiv-1', createdAt: wib('2026-10-05T10:00:00'), undoneAt: null })

    expect((await review({ action: 'revise', id: 'o-1', note: 'Foto masih buram' })).status).toBe(200)
    expect(byId('o-1')).toMatchObject({ status: 'PERLU_REVISI', revisionNote: 'Foto masih buram' })

    vi.advanceTimersByTime(5 * 60000)
    const res = await review({ action: 'undo', ids: ['o-1'] })
    expect(res.status).toBe(200)
    expect((await res.json()).ids).toEqual(['o-1'])
    expect(byId('o-1')).toMatchObject({ status: 'MENUNGGU_REVIEW', revisionNote: 'Tambahkan foto lokasi', reviewerId: null, reviewedAt: null })

    const [a] = auditsOf('OUTPUT_REVIEW_UNDO')
    expect(a.before).toEqual({ status: 'PERLU_REVISI', revisionNote: 'Foto masih buram' })
    expect(a.after.revisionNote).toBe('Tambahkan foto lokasi')

    // Riwayat hanya menyisakan putaran yang berlaku.
    const hist = await (await GET(jsonReq('/api/outputs?id=o-1&history=1', 'GET'))).json()
    expect(hist.revisions.map((r: { note: string; reviewerName: string }) => [r.note, r.reviewerName])).toEqual([['Tambahkan foto lokasi', 'Andi']])
  })

  it('klik "Urungkan" kedua yang kalah balapan tidak ikut membatalkan putaran revisi sebelumnya', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW', revisionNote: 'Tambahkan foto lokasi' })
    revisions.push({ id: 'rev-0', outputId: 'o-1', note: 'Tambahkan foto lokasi', reviewerId: 'kadiv-1', createdAt: wib('2026-10-05T10:00:00'), undoneAt: null })
    await review({ action: 'revise', id: 'o-1', note: 'Foto masih buram' })

    // Klik kedua membaca output sebelum klik pertama menulis (potret basi), tetapi
    // menyentuh riwayat setelah klik pertama selesai.
    const stale = { ...byId('o-1')! }
    expect(await (await review({ action: 'undo', ids: ['o-1'] })).json()).toMatchObject({ ids: ['o-1'] })
    db.output.findMany.mockImplementationOnce(async () => [{ ...stale }])
    expect(await (await review({ action: 'undo', ids: ['o-1'] })).json()).toMatchObject({ ids: [] })
    expect(byId('o-1')).toMatchObject({ status: 'MENUNGGU_REVIEW', revisionNote: 'Tambahkan foto lokasi' })
    // Putaran 1 tetap berlaku; hanya putaran yang diurungkan yang ditandai.
    expect(revisions.filter((r) => r.undoneAt === null).map((r) => r.id)).toEqual(['rev-0'])
    expect(auditsOf('OUTPUT_REVIEW_UNDO')).toHaveLength(1)
  })

  it('urungkan "terima" mempertahankan catatan revisi lama', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW', revisionNote: 'Catatan lama' })
    await review({ action: 'accept', id: 'o-1' })
    await review({ action: 'undo', ids: ['o-1'] })
    expect(byId('o-1')).toMatchObject({ status: 'MENUNGGU_REVIEW', revisionNote: 'Catatan lama' })
  })

  it('lewat 15 menit: 409 dan status tetap', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    await review({ action: 'accept', id: 'o-1' })
    vi.advanceTimersByTime(16 * 60000)
    expect((await review({ action: 'undo', ids: ['o-1'] })).status).toBe(409)
    expect(byId('o-1')!.status).toBe('DITERIMA')
  })

  it('kepala divisi lain tidak bisa mengurungkan keputusan orang lain', async () => {
    asUser('kadiv-1')
    seedOutput({ id: 'o-1', projectId: 'p-1', status: 'MENUNGGU_REVIEW' })
    await review({ action: 'accept', id: 'o-1' })
    asUser('kadiv-2')
    expect((await review({ action: 'undo', ids: ['o-1'] })).status).toBe(409)
    expect(byId('o-1')!.status).toBe('DITERIMA')
  })

  it('tanpa id: 400', async () => {
    asUser('kadiv-1')
    expect((await review({ action: 'undo', ids: [] })).status).toBe(400)
  })
})

describe('GET /api/outputs?history=1 — cakupan riwayat', () => {
  it('Admin PT lain ditolak 403; id tak dikenal 404', async () => {
    seedOutput({ id: 'o-1', projectId: 'p-1' })
    asUser('admin-b')
    expect((await GET(jsonReq('/api/outputs?id=o-1&history=1', 'GET'))).status).toBe(403)
    expect((await GET(jsonReq('/api/outputs?id=o-x&history=1', 'GET'))).status).toBe(404)
  })
})
