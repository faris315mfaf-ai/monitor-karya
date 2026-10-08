/**
 * Rute pratinjau tambahan untuk area ini (P2). Kembalikan Response untuk path
 * yang ditangani, atau null agar diteruskan ke rute lain. Hanya mode pengembangan.
 *
 * P2-A (PIC proyek): output, bukti output, catatan kepala divisi, tahapan
 * bertanggal, usulan geser tenggat, dan badge nav "Laporan harian 1". Data
 * contoh disimpan di memori agar aksi (unggah, kirim, balas) terlihat hasilnya.
 */

import * as mock from './mock-data'
import { reportHistory } from './mock-history'
import { actor, divisions } from './mock-catalog'
import { projectSnapshots } from './mock-proyek'
import { startOfWibDay, wibDateKey } from '@/lib/lock'

const DAY = 86400000
const now = Date.now()
const day = (n: number, h = 10) => new Date(startOfWibDay(new Date(now)).getTime() + n * DAY + h * 3600000).toISOString()
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const ME = actor('PIC_PROYEK')
const HEAD = actor('KEPALA_DIVISI')

type Out = {
  id: string; projectId: string; title: string; description: string | null; status: string; dueDate: string | null
  ownerId: string; reviewerId: string | null; revisionNote: string | null; submittedAt: string | null; reviewedAt: string | null
  createdAt: string; updatedAt: string; projectName: string; projectCode: string; ownerName: string; reviewerName: string | null
}
const PROJ = Object.fromEntries(projectSnapshots('SUPERADMIN').map((p) => [p.id, { name: p.name, code: p.code, target: p.targetEndDate ?? day(30), ownerId: p.picUserId ?? ME.id, ownerName: p.picName ?? ME.name }]))
const O = (id: string, projectId: string, title: string, status: string, due: number | null, o: Partial<Out> = {}): Out => ({
  id, projectId, title, description: null, status, dueDate: due === null ? null : day(due), ownerId: PROJ[projectId].ownerId,
  reviewerId: status === 'DITERIMA' || status === 'PERLU_REVISI' ? HEAD.id : null, revisionNote: null,
  submittedAt: status === 'DIKERJAKAN' ? null : day(-2, 9), reviewedAt: status === 'DITERIMA' || status === 'PERLU_REVISI' ? day(-1, 10) : null,
  createdAt: day(-20), updatedAt: day(-1), projectName: PROJ[projectId].name, projectCode: PROJ[projectId].code, ownerName: PROJ[projectId].ownerName,
  reviewerName: status === 'DITERIMA' || status === 'PERLU_REVISI' ? HEAD.name : null, ...o,
})

const outputs: Out[] = [
  O('o1', 'p2', 'Panduan pengguna', 'PERLU_REVISI', 2, {
    description: 'Panduan pemakaian aplikasi absensi untuk karyawan: masuk, absen, izin, dan cuti.',
    revisionNote: 'Tambahkan bagian izin dan cuti, serta tangkapan layar versi iPhone.',
  }),
  O('o2', 'p2', 'Skenario uji gelombang 2', 'DIKERJAKAN', 6, { description: '12 skenario uji untuk 40 perangkat gelombang 2.' }),
  O('o3', 'p2', 'Materi pelatihan pengguna', 'DIKERJAKAN', 13),
  O('o4', 'p2', 'Laporan uji gelombang 1', 'MENUNGGU_REVIEW', -1, { description: 'Hasil uji 3 dari 4 skenario lulus; 1 skenario sinkronisasi diperbaiki.' }),
  O('o5', 'p2', 'Integrasi penggajian', 'DITERIMA', -6),
  O('o6', 'p2', 'Desain antarmuka v2', 'DITERIMA', -12),
  O('o7', 'p2', 'Spesifikasi kebutuhan', 'DITERIMA', -25),
  O('o8', 'p2', 'Rencana proyek', 'DITERIMA', -35),
  O('p7o1', 'p4', 'Peta kebutuhan portal', 'DIKERJAKAN', 9),
  O('p7o2', 'p4', 'Rencana anggaran portal', 'MENUNGGU_REVIEW', 3),
]

type Ev = { id: string; fileName: string; mime: string; size: number; url: string | null; createdAt: string }
const evidence: Record<string, Ev[]> = {
  o1: [{ id: 'ev-o1a', fileName: 'Panduan pengguna v1.pdf', mime: 'application/pdf', size: 842000, url: null, createdAt: day(-3, 8) }],
  o4: [
    { id: 'ev-o4a', fileName: 'Hasil uji gelombang 1.xlsx', mime: 'application/vnd.ms-excel', size: 120400, url: null, createdAt: day(-2, 8) },
    { id: 'ev-o4b', fileName: 'Rekaman uji.png', mime: 'image/png', size: 380200, url: null, createdAt: day(-2, 8) },
  ],
  o5: [{ id: 'ev-o5a', fileName: 'Berita acara integrasi.pdf', mime: 'application/pdf', size: 230000, url: null, createdAt: day(-7) }],
  o6: [{ id: 'ev-o6a', fileName: 'Figma antarmuka v2', mime: 'text/uri-list', size: 40, url: 'https://example.com/figma', createdAt: day(-13) }],
  o7: [{ id: 'ev-o7a', fileName: 'Spesifikasi.docx', mime: 'application/msword', size: 98000, url: null, createdAt: day(-26) }],
  o8: [{ id: 'ev-o8a', fileName: 'Rencana proyek.pdf', mime: 'application/pdf', size: 150000, url: null, createdAt: day(-36) }],
  p7o2: [{ id: 'ev-p7a', fileName: 'Anggaran portal.xlsx', mime: 'application/vnd.ms-excel', size: 64000, url: null, createdAt: day(-1) }],
}

type Note = { id: string; body: string; createdAt: string; readAt: string | null; authorId: string; authorName: string; authorRole: string }
const notes: Record<string, Note[]> = {
  p2: [
    { id: 'n1', body: 'Rina, perangkat uji gelombang 2 sudah ada kabar dari vendor?', createdAt: day(-1, 2), readAt: day(-1, 3), authorId: HEAD.id, authorName: HEAD.name, authorRole: 'KEPALA_DIVISI' },
    { id: 'n2', body: 'Belum, Pak. Vendor menjanjikan Kamis. Saya siapkan usulan geser rilis ke 31 Oktober.', createdAt: day(-1, 3), readAt: day(-1, 4), authorId: ME.id, authorName: ME.name, authorRole: 'PIC_PROYEK' },
    { id: 'n3', body: 'Oke. Panduan pengguna tolong lengkapi bagian izin dan cuti, lalu kirim ulang.', createdAt: day(0, 1), readAt: null, authorId: HEAD.id, authorName: HEAD.name, authorRole: 'KEPALA_DIVISI' },
  ],
  p4: [],
}

type Stage = { id: string; name: string; position: number; startDate: string | null; dueDate: string | null; status: string; note: string | null; updatedAt: string }
const S = (id: string, name: string, position: number, s: number, d: number, status: string, note: string | null = null): Stage => ({
  id, name, position, startDate: day(s), dueDate: day(d), status, note, updatedAt: day(-1),
})
const stages: Record<string, Stage[]> = {
  p2: [
    S('s1', 'Perencanaan', 0, -40, -32, 'SELESAI'),
    S('s2', 'Pengembangan', 1, -31, -12, 'SELESAI'),
    S('s3', 'Uji coba gelombang 1', 2, -11, -4, 'SELESAI'),
    S('s4', 'Uji coba gelombang 2', 3, -3, 6, 'TERTAHAN', 'Perangkat terlambat'),
    S('s5', 'Pelatihan pengguna', 4, 7, 13, 'BELUM_MULAI'),
    S('s6', 'Rilis', 5, 14, 19, 'BELUM_MULAI'),
  ],
  p4: [],
}

type Prop = {
  id: string; projectId: string; previousDate: string | null; proposedDate: string; reason: string; status: string; proposedById: string
  decidedAt: string | null; decisionNote: string | null; createdAt: string; projectName: string; projectCode: string
  currentTargetDate: string | null; proposedByName: string; decidedByName: string | null
}
const proposals: Prop[] = [
  {
    id: 'dp1', projectId: 'p2', previousDate: PROJ.p2.target, proposedDate: day(26), reason: 'Perangkat uji gelombang 2 terlambat 4 hari dari vendor.',
    status: 'DIAJUKAN', proposedById: ME.id, decidedAt: null, decisionNote: null, createdAt: day(-1, 5), projectName: PROJ.p2.name,
    projectCode: PROJ.p2.code, currentTargetDate: PROJ.p2.target, proposedByName: ME.name, decidedByName: null,
  },
]

const body = (init?: RequestInit) => {
  try {
    return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
  } catch {
    return {}
  }
}
const params = (url: string) => new URL(url, 'http://pratinjau').searchParams
const counts = (list: Out[]) => {
  const c: Record<string, number> = { DIKERJAKAN: 0, MENUNGGU_REVIEW: 0, PERLU_REVISI: 0, DITERIMA: 0 }
  list.forEach((o) => (c[o.status] += 1))
  return c
}
const withEv = (o: Out) => ({ ...o, evidenceCount: evidence[o.id]?.length ?? 0 })
const dateFromKey = (k: unknown) => (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) ? new Date(`${k}T00:00:00+07:00`).toISOString() : null)

function outputsRoute(url: string, init: RequestInit | undefined, role: string) {
  const method = init?.method ?? 'GET'
  const sp = params(url)
  const visible = new Set(projectSnapshots(role).map((p) => p.id))
  if (method === 'GET') {
    const pid = sp.get('projectId')
    const base = outputs.filter((o) => visible.has(o.projectId) && (!pid || o.projectId === pid))
    const st = sp.get('status')
    const list = st ? base.filter((o) => o.status === st) : base
    return json({ items: list.map(withEv), counts: counts(base), total: base.length })
  }
  if (!['PIC_PROYEK', 'ADMIN_PT', 'TI', 'SUPERADMIN'].includes(role)) return json({ error: 'Peran Anda tidak mengubah output.' }, 403)
  if (method === 'DELETE') {
    const i = outputs.findIndex((o) => o.id === sp.get('id'))
    if (i < 0 || !visible.has(outputs[i].projectId)) return json({ error: 'Output tidak ditemukan' }, 404)
    if (evidence[outputs[i].id]?.length) return json({ error: 'Hapus bukti output ini dulu' }, 409)
    outputs.splice(i, 1)
    return json({ ok: true })
  }
  const b = body(init)
  if (method === 'POST') {
    const pid = String(b.projectId ?? '')
    if (!PROJ[pid] || !visible.has(pid)) return json({ error: 'Proyek tidak ditemukan' }, 404)
    const title = String(b.title ?? '').trim()
    if (title.length < 3) return json({ error: 'Judul output minimal 3 huruf' }, 422)
    const o = O(uid('o'), pid, title, 'DIKERJAKAN', null, {
      description: String(b.description ?? '').trim() || null,
      dueDate: dateFromKey(b.dueDate),
      createdAt: new Date().toISOString(),
    })
    outputs.unshift(o)
    return json({ ok: true, output: withEv(o) }, 201)
  }
  // PATCH
  const o = outputs.find((x) => x.id === b.id)
  if (!o || !visible.has(o.projectId)) return json({ error: 'Output tidak ditemukan' }, 404)
  const at = new Date().toISOString()
  switch (b.action) {
    case 'update':
      if ('title' in b) o.title = String(b.title).trim()
      if ('description' in b) o.description = String(b.description ?? '').trim() || null
      if ('dueDate' in b) o.dueDate = dateFromKey(b.dueDate)
      break
    case 'submit':
      if (o.status !== 'DIKERJAKAN' && o.status !== 'PERLU_REVISI') return json({ error: 'Output ini sudah dikirim atau diterima' }, 409)
      if (!evidence[o.id]?.length) return json({ error: 'Unggah minimal 1 bukti sebelum mengirim output untuk direview', needsEvidence: true }, 422)
      Object.assign(o, { status: 'MENUNGGU_REVIEW', submittedAt: at, reviewedAt: null })
      break
    case 'withdraw':
      if (o.status !== 'MENUNGGU_REVIEW') return json({ error: 'Output ini sudah direview' }, 409)
      Object.assign(o, { status: o.revisionNote ? 'PERLU_REVISI' : 'DIKERJAKAN', submittedAt: null })
      break
    default:
      return json({ error: 'Aksi tidak dikenal' }, 400)
  }
  o.updatedAt = at
  return json({ ok: true, output: withEv(o) })
}

function evidenceRoute(path: string, url: string, init: RequestInit | undefined, role: string) {
  const method = init?.method ?? 'GET'
  const guard = (id: string) => {
    const output = outputSnapshots(role).find((o) => o.id === id)
    if (!output) return json({ error: 'Data induk bukti tidak ditemukan' }, 404)
    if (method !== 'GET' && !['PIC_PROYEK', 'ADMIN_PT', 'TI', 'SUPERADMIN'].includes(role)) return json({ error: 'Peran Anda tidak mengubah bukti output.' }, 403)
    if (method !== 'GET' && ['MENUNGGU_REVIEW', 'DITERIMA'].includes(output.status)) return json({ error: 'Output ini sedang direview atau sudah diterima' }, 409)
    return null
  }
  if (path === '/api/evidence/upload') {
    const fd = init?.body instanceof FormData ? init.body : null
    if (!fd || fd.get('targetType') !== 'OUTPUT') return null
    const id = String(fd.get('targetId') ?? '')
    const denied = guard(id)
    if (denied) return denied
    const file = fd.get('file')
    const f = file instanceof File ? file : null
    const ev: Ev = { id: uid('ev'), fileName: f?.name ?? 'Berkas', mime: f?.type || 'application/octet-stream', size: f?.size ?? 0, url: null, createdAt: new Date().toISOString() }
    ;(evidence[id] ??= []).unshift(ev)
    return json({ ok: true, evidence: ev, evidenceCount: evidence[id].length })
  }
  if (path === '/api/evidence') {
    if (method === 'GET') {
      const sp = params(url)
      if (sp.get('targetType') !== 'OUTPUT') return null
      const denied = guard(sp.get('targetId') ?? '')
      if (denied) return denied
      const items = evidence[sp.get('targetId') ?? ''] ?? []
      return json({ items, total: items.length })
    }
    const b = body(init)
    if (b.targetType !== 'OUTPUT') return null
    const id = String(b.targetId ?? '')
    const denied = guard(id)
    if (denied) return denied
    if (!/^https?:\/\/\S+$/i.test(String(b.url ?? ''))) return json({ error: 'Tautan bukti harus berupa URL yang diawali http:// atau https://' }, 422)
    const ev: Ev = { id: uid('ev'), fileName: String(b.fileName ?? 'Tautan'), mime: 'text/uri-list', size: 0, url: String(b.url), createdAt: new Date().toISOString() }
    ;(evidence[id] ??= []).unshift(ev)
    return json({ ok: true, evidence: ev, evidenceCount: evidence[id].length })
  }
  // /api/evidence/<id>
  const evId = path.slice('/api/evidence/'.length)
  const owner = Object.keys(evidence).find((k) => evidence[k].some((e) => e.id === evId))
  if (!owner) return null
  const denied = guard(owner)
  if (denied) return denied
  const ev = evidence[owner].find((e) => e.id === evId)!
  if (method === 'DELETE') {
    evidence[owner] = evidence[owner].filter((e) => e.id !== evId)
    return json({ ok: true, evidenceCount: evidence[owner].length })
  }
  return json({ url: ev.url ?? 'data:text/plain;charset=utf-8,' + encodeURIComponent(`Pratinjau: ${ev.fileName}`), kind: ev.url ? 'link' : 'file' })
}

type NoteRead = { noteId: string; userId: string; readAt: string }
const noteReads: NoteRead[] = []
const readAtFor = (n: Note, userId: string) => n.readAt ?? noteReads.find((r) => r.noteId === n.id && (n.authorId === userId ? r.userId !== userId : r.userId === userId))?.readAt ?? null
export function unreadNotes(role: string) {
  const ids = new Set(projectSnapshots(role).map((p) => p.id))
  return Object.entries(notes).flatMap(([id, list]) => ids.has(id) ? list : []).filter((n) => n.authorId !== actor(role).id && !readAtFor(n, actor(role).id)).length
}
function notesRoute(url: string, init: RequestInit | undefined, role: string) {
  if (role === 'AUDITOR') return json({ error: 'Peran Anda tidak mengelola catatan.' }, 403)
  const method = init?.method ?? 'GET'
  const sp = params(url)
  const me = actor(role)
  if (method === 'GET' && sp.get('unread') === '1') return json({ unread: ['PIC_PROYEK', 'KEPALA_DIVISI', 'ADMIN_PT'].includes(role) ? unreadNotes(role) : 0 })
  const pid = method === 'GET' ? sp.get('projectId') ?? '' : String(body(init).projectId ?? '')
  const p = projectSnapshots(role).find((p) => p.id === pid)
  if (!p) return json({ error: 'Proyek tidak ditemukan di cakupan Anda.' }, 404)
  const list = notes[pid] ??= []
  const shape = (n: Note) => ({ ...n, mine: n.authorId === me.id, readAt: readAtFor(n, me.id), readCount: noteReads.filter((r) => r.noteId === n.id && r.userId !== n.authorId).length })
  if (method === 'GET') return json({ projectId: pid, projectName: p.name, heads: divisions.filter((d) => d.id === p.divisionId).map((d) => d.head), unread: list.filter((n) => n.authorId !== me.id && !readAtFor(n, me.id)).length, items: list.slice(-100).map(shape) })
  const at = new Date().toISOString()
  const text = String(body(init).body ?? '').trim().slice(0, 2000)
  if (method === 'POST' && !text) return json({ error: 'Catatan tidak boleh kosong' }, 422)
  let marked = 0
  for (const n of list) if (n.authorId !== me.id && !readAtFor(n, me.id)) { noteReads.push({ noteId: n.id, userId: me.id, readAt: at }); marked++ }
  if (method === 'PATCH') return json({ ok: true, marked })
  const n: Note = { id: uid('n'), body: text, createdAt: at, readAt: null, authorId: me.id, authorName: me.name, authorRole: role }
  list.push(n)
  return json({ ok: true, note: shape(n) }, 201)
}

function stagesRoute(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  const sp = params(url)
  const b = method === 'GET' || method === 'DELETE' ? {} : body(init)
  if (method === 'GET') {
    const pid = sp.get('projectId') ?? ''
    if (!PROJ[pid]) return json({ error: 'Proyek tidak ditemukan' }, 404)
    const items = [...(stages[pid] ?? [])].sort((a, c) => a.position - c.position)
    const pending = proposals.find((p) => p.projectId === pid && p.status === 'DIAJUKAN')
    return json({
      projectId: pid, targetEndDate: PROJ[pid].target, proposedEndDate: pending?.proposedDate ?? null, canEdit: true,
      done: items.filter((s) => s.status === 'SELESAI').length, total: items.length, items,
    })
  }
  const all = Object.values(stages).flat()
  if (method === 'DELETE') {
    const id = sp.get('id')
    for (const k of Object.keys(stages)) stages[k] = stages[k].filter((s) => s.id !== id)
    return json({ ok: true })
  }
  if (method === 'PATCH') {
    const order = (b.order as string[]) ?? []
    order.forEach((id, i) => {
      const s = all.find((x) => x.id === id)
      if (s) s.position = i
    })
    return json({ ok: true })
  }
  const name = String(b.name ?? '').trim()
  if ('name' in b && name.length < 2) return json({ error: 'Nama tahap minimal 2 huruf' }, 422)
  const fields = {
    name,
    startDate: dateFromKey(b.startDate),
    dueDate: dateFromKey(b.dueDate),
    status: String(b.status ?? 'BELUM_MULAI'),
    note: String(b.note ?? '').trim() || null,
    updatedAt: new Date().toISOString(),
  }
  if (method === 'POST') {
    const pid = String(b.projectId ?? '')
    const list = (stages[pid] ??= [])
    const s: Stage = { id: uid('s'), position: list.length, ...fields }
    list.push(s)
    return json({ ok: true, stage: s }, 201)
  }
  const s = all.find((x) => x.id === b.id)
  if (!s) return json({ error: 'Tahap tidak ditemukan' }, 404)
  Object.assign(s, fields)
  return json({ ok: true, stage: s })
}

function proposalsRoute(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  if (method === 'GET') {
    const pid = params(url).get('projectId')
    return json({ items: proposals.filter((p) => !pid || p.projectId === pid), canDecide: false })
  }
  const b = body(init)
  if (method === 'POST') {
    const pid = String(b.projectId ?? '')
    if (!PROJ[pid]) return json({ error: 'Proyek tidak ditemukan' }, 404)
    if (proposals.some((p) => p.projectId === pid && p.status === 'DIAJUKAN')) return json({ error: 'Masih ada usulan tenggat yang belum diputuskan' }, 409)
    const date = dateFromKey(b.proposedDate)
    if (!date) return json({ error: 'Pilih tanggal tenggat baru' }, 422)
    const reason = String(b.reason ?? '').trim()
    if (reason.length < 10) return json({ error: 'Tulis alasannya sebagai fakta, minimal 10 huruf' }, 422)
    const p: Prop = {
      id: uid('dp'), projectId: pid, previousDate: PROJ[pid].target, proposedDate: date, reason, status: 'DIAJUKAN', proposedById: ME.id,
      decidedAt: null, decisionNote: null, createdAt: new Date().toISOString(), projectName: PROJ[pid].name, projectCode: PROJ[pid].code,
      currentTargetDate: PROJ[pid].target, proposedByName: ME.name, decidedByName: null,
    }
    proposals.unshift(p)
    return json({ ok: true, proposal: p }, 201)
  }
  const i = proposals.findIndex((p) => p.id === b.id)
  if (i < 0) return json({ error: 'Usulan tidak ditemukan' }, 404)
  if (b.action !== 'withdraw') return json({ error: 'Pratinjau PIC tidak memutuskan usulan' }, 403)
  proposals.splice(i, 1)
  return json({ ok: true })
}

/* ------------------------------------------------------------------ */
/* [F2-PIC] Laporan harian (/api/daily-input) & progres proyek          */
/* ------------------------------------------------------------------ */

function progressRoute(url: string) {
  const pid = params(url).get('projectId') ?? ''
  if (!PROJ[pid]) return json({ error: 'Proyek tidak ditemukan' }, 404)
  const desk = mock.deskPic.projects.find((x) => x.id === pid)
  const r = desk?.report ?? null
  // Enam minggu terakhir: aktual dari riwayat contoh, rencana dari tahapan contoh (setara rumus src/lib/pic-progress.ts).
  const actual = reportHistory(pid, Array.from({ length: 6 }, (_, i) => startOfWibDay(new Date(Date.now() - (5 - i) * 7 * DAY)).toISOString())).map((h) => h.progressPct)
  const plan = pid === 'p2' ? [15, 27, 39, 51, 63, 75] : [0, 0, 0, 0, 12, 20]
  const nowD = new Date(now)
  const wk = (() => {
    const x = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate()))
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7))
    return Math.ceil(((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 1)) / DAY + 1) / 7)
  })()
  const weeks = actual.map((a, i) => ({
    key: `2026-W${String(wk - 5 + i).padStart(2, '0')}`, label: `M${wk - 5 + i}`, start: day(-(5 - i) * 7), actual: a, plan: plan[i], reported: a !== null,
  }))
  const pending = proposals.find((x) => x.projectId === pid && x.status === 'DIAJUKAN')
  const st = stages[pid] ?? []
  const deadlines = [
    ...st.filter((x) => x.status !== 'SELESAI').map((x) => {
      const startNext = x.status === 'BELUM_MULAI' && x.startDate && Date.parse(x.startDate) >= now - DAY
      const date = startNext ? x.startDate! : x.dueDate!
      const daysLeft = Math.round((Date.parse(date) - Date.parse(day(0))) / DAY)
      const blocked = x.status === 'TERTAHAN'
      return {
        id: `${x.id}:${startNext ? 'start' : 'due'}`, kind: startNext ? 'STAGE_START' : 'STAGE_DUE', date, title: `${x.name} ${startNext ? 'mulai' : 'selesai'}`,
        note: blocked ? x.note : null, daysLeft,
        state: daysLeft < 0 ? 'late' : blocked || daysLeft <= 3 ? 'risk' : 'neutral',
        badge: daysLeft < 0 ? `Lewat ${-daysLeft} hari` : blocked ? `${daysLeft} hari · tertahan` : `${daysLeft} hari lagi`,
      }
    }),
    ...outputs.filter((o) => o.projectId === pid && o.status !== 'DITERIMA' && o.dueDate).map((o) => {
      const daysLeft = Math.round((Date.parse(o.dueDate!) - Date.parse(day(0))) / DAY)
      return {
        id: `${o.id}:output`, kind: 'OUTPUT', date: o.dueDate!, title: o.title, note: o.status === 'PERLU_REVISI' ? 'Output perlu revisi' : o.status === 'MENUNGGU_REVIEW' ? 'Output menunggu review' : 'Output dikerjakan',
        daysLeft, state: daysLeft < 0 ? 'late' : daysLeft <= 3 || o.status === 'PERLU_REVISI' ? 'risk' : 'neutral',
        badge: daysLeft < 0 ? `Lewat ${-daysLeft} hari` : daysLeft === 0 ? 'Hari ini' : `${daysLeft} hari lagi`,
      }
    }),
    {
      id: 'project:target', kind: 'PROJECT', date: PROJ[pid].target, title: 'Tenggat proyek',
      note: pending ? `Usul geser ke ${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(pending.proposedDate))} · sedang ditinjau` : null,
      daysLeft: Math.round((Date.parse(PROJ[pid].target) - Date.parse(day(0))) / DAY), state: 'neutral',
      badge: `${Math.round((Date.parse(PROJ[pid].target) - Date.parse(day(0))) / DAY)} hari lagi`,
    },
  ]
    .sort((a, b) => a.daysLeft - b.daysLeft)
  // Seperti src/lib/pic-progress.ts: tenggat proyek selalu tampil.
  const top = deadlines.slice(0, 5)
  const target = deadlines.find((x) => x.kind === 'PROJECT')
  if (target && !top.includes(target)) top[top.length - 1] = target
  const history = reportHistory(pid).slice(-6).map((h) => ({
    date: h.key,
    state: h.forwarded ? 'FORWARDED' : h.submitted ? h.isLate ? 'LATE' : 'SENT' : h.progressPct !== null ? 'DRAFT' : 'MISSING',
    status: h.status, progressPct: h.progressPct, submittedAt: h.submittedAt,
  }))
  return json({
    projectId: pid,
    today: r ? { submittedAt: r.submittedAt, forwardedAt: r.forwardedAt, isLate: r.isLate, progressPct: r.progressPct } : null,
    plan: { source: (stages[pid] ?? []).length ? 'STAGES' : 'LINEAR', weeks },
    deadlines: top,
    history,
  })
}

/** Output dan riwayat revisi yang sama dipakai PIC, kepala divisi, serta ringkasan. */
export function outputSnapshots(role: string) {
  const ps = projectSnapshots(role)
  return outputs.filter((o) => ps.some((p) => p.id === o.projectId)).map((o) => {
    const p = ps.find((p) => p.id === o.projectId)!
    return { ...withEv(o), projectName: p.name, projectCode: p.code, divisionId: p.divisionId,
      project: { id: p.id, name: p.name, code: p.code }, owner: { id: o.ownerId, name: o.ownerName, initials: o.ownerName.split(' ').map((s) => s[0]).join('') } }
  })
}
type OutputRevision = { outputId: string; reviewerId: string; note: string; previousNote: string | null; reviewedAt: string; undoneAt: string | null }
const revisions: OutputRevision[] = []
function reviewRoute(init: RequestInit | undefined, role: string) {
  if (!['KEPALA_DIVISI', 'TI', 'SUPERADMIN'].includes(role)) return json({ error: 'Peran Anda tidak mereview output.' }, 403)
  const items = outputSnapshots(role)
  if ((init?.method ?? 'GET') === 'GET') return json({ queue: items.filter((o) => o.status === 'MENUNGGU_REVIEW'), decided: items.filter((o) => o.reviewerId === actor(role).id && o.reviewedAt && Date.now() - Date.parse(o.reviewedAt) < DAY), undoMinutes: 15 })
  const b = body(init)
  const me = actor(role)
  const at = new Date().toISOString()
  const ids = new Set(Array.isArray(b.ids) ? b.ids : [b.id])
  if (!['accept', 'revise', 'accept-all', 'undo'].includes(String(b.action))) return json({ error: 'Aksi tidak dikenal' }, 400)
  const note = String(b.note ?? '').trim()
  if (b.action === 'revise' && note.length < 5) return json({ error: 'Tulis catatan revisi minimal 5 huruf.' }, 422)
  const rows = outputs.filter((o) => items.some((i) => i.id === o.id) && (b.action === 'accept-all' && !Array.isArray(b.ids) || ids.has(o.id)))
    .filter((o) => b.action === 'undo' ? o.status !== 'MENUNGGU_REVIEW' && o.reviewerId === me.id && o.reviewedAt && Date.now() - Date.parse(o.reviewedAt) <= 15 * 60000 : o.status === 'MENUNGGU_REVIEW')
  if (['accept', 'revise'].includes(String(b.action)) && !rows.length) return json({ error: 'Output ini sudah diputuskan.' }, 409)
  for (const o of rows) {
    if (b.action === 'undo') {
      if (o.status === 'PERLU_REVISI') {
        const rev = revisions.findLast((r) => r.outputId === o.id && r.reviewerId === me.id && !r.undoneAt)
        if (rev) { o.revisionNote = rev.previousNote; rev.undoneAt = at }
      }
      Object.assign(o, { status: 'MENUNGGU_REVIEW', reviewerId: null, reviewerName: null, reviewedAt: null })
    } else {
      if (b.action === 'revise') {
        revisions.push({ outputId: o.id, reviewerId: me.id, note, previousNote: o.revisionNote, reviewedAt: at, undoneAt: null })
        o.revisionNote = note
      }
      Object.assign(o, { status: b.action === 'revise' ? 'PERLU_REVISI' : 'DITERIMA', reviewerId: me.id, reviewerName: me.name, reviewedAt: at })
    }
  }
  return json({ ok: true, ids: rows.map((o) => o.id), reviewedAt: at })
}

export function handle(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  if (path === '/api/project-notes') return notesRoute(url, init, role)
  if (path === '/api/outputs/review') return reviewRoute(init, role)
  if (path === '/api/outputs') return outputsRoute(url, init, role)
  if (path === '/api/evidence' || path.startsWith('/api/evidence/')) return evidenceRoute(path, url, init, role)
  if (role !== 'PIC_PROYEK') return null
  if (path === '/api/nav-badges') {
    const outstanding = mock.deskPic.projects.filter((p) => !p.report?.submittedAt).length
    const unread = unreadNotes(role)
    return json({
      badges: {
        ...(!mock.deskPic.locked && outstanding ? { 'daily-input': outstanding } : {}),
        ...(unread ? { dashboard: unread } : {}),
      },
    })
  }
  if (path === '/api/project-progress') return progressRoute(url)
  if (path === '/api/project-stages') return stagesRoute(url, init)
  if (path === '/api/deadline-proposals') return proposalsRoute(url, init)
  return null
}
