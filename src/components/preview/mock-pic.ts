/**
 * Rute pratinjau tambahan untuk area ini (P2). Kembalikan Response untuk path
 * yang ditangani, atau null agar diteruskan ke rute lain. Hanya mode pengembangan.
 *
 * P2-A (PIC proyek): output, bukti output, catatan kepala divisi, tahapan
 * bertanggal, usulan geser tenggat, dan badge nav "Laporan harian 1". Data
 * contoh disimpan di memori agar aksi (unggah, kirim, balas) terlihat hasilnya.
 */

import * as mock from './mock-data'

const DAY = 86400000
const now = Date.now()
const day = (n: number, h = 3) => new Date(now + n * DAY - (now % DAY) + h * 3600000).toISOString()
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const ME = { id: 'pratinjau-PIC_PROYEK', name: 'Rina Kartika' }
const HEAD = { id: 'u-andi', name: 'Andi Wijaya' }

type Out = {
  id: string; projectId: string; title: string; description: string | null; status: string; dueDate: string | null
  ownerId: string; reviewerId: string | null; revisionNote: string | null; submittedAt: string | null; reviewedAt: string | null
  createdAt: string; updatedAt: string; projectName: string; projectCode: string; ownerName: string; reviewerName: string | null
}
const PROJ: Record<string, { name: string; code: string; target: string }> = {
  p2: { name: 'Aplikasi Absensi', code: 'PRJ-P2', target: day(19) },
  p7: { name: 'Portal Pelanggan', code: 'PRJ-P7', target: day(60) },
}
const O = (id: string, projectId: string, title: string, status: string, due: number | null, o: Partial<Out> = {}): Out => ({
  id, projectId, title, description: null, status, dueDate: due === null ? null : day(due), ownerId: ME.id,
  reviewerId: status === 'DITERIMA' || status === 'PERLU_REVISI' ? HEAD.id : null, revisionNote: null,
  submittedAt: status === 'DIKERJAKAN' ? null : day(-2, 9), reviewedAt: status === 'DITERIMA' || status === 'PERLU_REVISI' ? day(-1, 10) : null,
  createdAt: day(-20), updatedAt: day(-1), projectName: PROJ[projectId].name, projectCode: PROJ[projectId].code, ownerName: ME.name,
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
  O('p7o1', 'p7', 'Peta kebutuhan portal', 'DIKERJAKAN', 9),
  O('p7o2', 'p7', 'Rencana anggaran portal', 'MENUNGGU_REVIEW', 3),
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
  p7: [],
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
  p7: [],
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

function outputsRoute(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  const sp = params(url)
  if (method === 'GET') {
    const pid = sp.get('projectId')
    const base = outputs.filter((o) => !pid || o.projectId === pid)
    const st = sp.get('status')
    const list = st ? base.filter((o) => o.status === st) : base
    return json({ items: list.map(withEv), counts: counts(base), total: base.length })
  }
  if (method === 'DELETE') {
    const i = outputs.findIndex((o) => o.id === sp.get('id'))
    if (i < 0) return json({ error: 'Output tidak ditemukan' }, 404)
    if (evidence[outputs[i].id]?.length) return json({ error: 'Hapus bukti output ini dulu' }, 409)
    outputs.splice(i, 1)
    return json({ ok: true })
  }
  const b = body(init)
  if (method === 'POST') {
    const pid = String(b.projectId ?? '')
    if (!PROJ[pid]) return json({ error: 'Proyek tidak ditemukan' }, 404)
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
  if (!o) return json({ error: 'Output tidak ditemukan' }, 404)
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

function evidenceRoute(path: string, url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  if (path === '/api/evidence/upload') {
    const fd = init?.body instanceof FormData ? init.body : null
    if (fd && fd.get('targetType') === 'DAILY_REPORT') return dailyUpload(fd)
    if (!fd || fd.get('targetType') !== 'OUTPUT') return null
    const id = String(fd.get('targetId') ?? '')
    const o = outputs.find((x) => x.id === id)
    if (!o) return json({ error: 'Data induk bukti tidak ditemukan' }, 404)
    if (o.status === 'MENUNGGU_REVIEW' || o.status === 'DITERIMA') return json({ error: 'Output ini sedang direview atau sudah diterima' }, 409)
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
      const items = evidence[sp.get('targetId') ?? ''] ?? []
      return json({ items, total: items.length })
    }
    const b = body(init)
    if (b.targetType !== 'OUTPUT') return null
    const id = String(b.targetId ?? '')
    if (!/^https?:\/\/\S+$/i.test(String(b.url ?? ''))) return json({ error: 'Tautan bukti harus berupa URL yang diawali http:// atau https://' }, 422)
    const ev: Ev = { id: uid('ev'), fileName: String(b.fileName ?? 'Tautan'), mime: 'text/uri-list', size: 0, url: String(b.url), createdAt: new Date().toISOString() }
    ;(evidence[id] ??= []).unshift(ev)
    return json({ ok: true, evidence: ev, evidenceCount: evidence[id].length })
  }
  // /api/evidence/<id>
  const evId = path.slice('/api/evidence/'.length)
  const daily = dailyEvidenceRoute(evId, method)
  if (daily) return daily
  const owner = Object.keys(evidence).find((k) => evidence[k].some((e) => e.id === evId))
  if (!owner) return null
  const ev = evidence[owner].find((e) => e.id === evId)!
  if (method === 'DELETE') {
    evidence[owner] = evidence[owner].filter((e) => e.id !== evId)
    return json({ ok: true, evidenceCount: evidence[owner].length })
  }
  return json({ url: ev.url ?? 'data:text/plain;charset=utf-8,' + encodeURIComponent(`Pratinjau: ${ev.fileName}`), kind: ev.url ? 'link' : 'file' })
}

function notesRoute(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  const sp = params(url)
  if (method === 'GET' && sp.get('unread') === '1') {
    return json({ unread: Object.values(notes).flat().filter((n) => !n.readAt && n.authorId !== ME.id).length })
  }
  const pid = method === 'GET' ? (sp.get('projectId') ?? '') : String(body(init).projectId ?? '')
  if (!PROJ[pid]) return json({ error: 'Proyek tidak ditemukan' }, 404)
  const list = (notes[pid] ??= [])
  if (method === 'GET') {
    return json({
      projectId: pid,
      projectName: PROJ[pid].name,
      unread: list.filter((n) => !n.readAt && n.authorId !== ME.id).length,
      heads: [HEAD.name],
      items: list.map((n) => ({ ...n, mine: n.authorId === ME.id })),
    })
  }
  const at = new Date().toISOString()
  list.forEach((n) => {
    if (!n.readAt && n.authorId !== ME.id) n.readAt = at
  })
  if (method === 'PATCH') return json({ ok: true })
  const text = String(body(init).body ?? '').trim()
  if (!text) return json({ error: 'Catatan tidak boleh kosong' }, 422)
  const n: Note = { id: uid('n'), body: text, createdAt: at, readAt: null, authorId: ME.id, authorName: ME.name, authorRole: 'PIC_PROYEK' }
  list.push(n)
  return json({ ok: true, note: { ...n, mine: true } }, 201)
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

type DailyRep = {
  id: string; status: string; progressPct: number; achievementToday: string; obstacle: string | null; followUp: string | null
  decisionRequestedFrom: string | null; evidenceCount: number; submittedAt: string | null; forwardedAt: string | null; isLocked: boolean
  evidence: Ev[]
}
const DAILY_TEXT: Record<string, { achievement: string; obstacle: string | null; followUp: string | null }> = {
  p2: {
    achievement: 'Perbaikan sinkronisasi data cuti selesai; panduan pengguna versi iPhone sedang disusun.',
    obstacle: 'Perangkat uji gelombang 2 belum tiba dari vendor.',
    followUp: 'Konfirmasi jadwal kirim perangkat, lanjutkan panduan pengguna.',
  },
  p7: { achievement: 'Wawancara kebutuhan tim layanan dan sketsa alur pendaftaran selesai.', obstacle: null, followUp: null },
}
const dailyEvidence: Record<string, Ev[]> = {
  'dr-p2': [{ id: 'ev-dr-p2a', fileName: 'Foto rak perangkat uji.jpg', mime: 'image/jpeg', size: 412000, url: null, createdAt: day(0, 4) }],
}
function dailyReport(pid: string): DailyRep | null {
  const p = mock.deskPic.projects.find((x) => x.id === pid)
  if (!p?.report) return null
  const id = `dr-${pid}`
  const ev = dailyEvidence[id] ?? []
  const t = DAILY_TEXT[pid] ?? { achievement: '', obstacle: null, followUp: null }
  return {
    id, status: p.report.status, progressPct: p.report.progressPct, achievementToday: t.achievement, obstacle: t.obstacle, followUp: t.followUp,
    decisionRequestedFrom: null, evidenceCount: ev.length, submittedAt: p.report.submittedAt, forwardedAt: p.report.forwardedAt, isLocked: false, evidence: ev,
  }
}
function dailyUpload(fd: FormData) {
  const id = String(fd.get('targetId') ?? '')
  const pid = id.replace(/^dr-/, '')
  const p = mock.deskPic.projects.find((x) => x.id === pid)
  if (!p?.report) return json({ error: 'Simpan draf dulu agar bukti bisa dilampirkan' }, 404)
  if (p.report.forwardedAt) return json({ error: 'Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.' }, 409)
  const file = fd.get('file')
  const f = file instanceof File ? file : null
  const ev: Ev = { id: uid('ev-dr'), fileName: f?.name ?? 'Foto', mime: f?.type || 'image/jpeg', size: f?.size ?? 0, url: null, createdAt: new Date().toISOString() }
  ;(dailyEvidence[id] ??= []).unshift(ev)
  p.report.evidenceCount = dailyEvidence[id].length
  return json({ ok: true, evidence: ev, evidenceCount: dailyEvidence[id].length })
}
function dailyEvidenceRoute(evId: string, method: string) {
  const owner = Object.keys(dailyEvidence).find((k) => dailyEvidence[k].some((e) => e.id === evId))
  if (!owner) return null
  if (method === 'DELETE') {
    dailyEvidence[owner] = dailyEvidence[owner].filter((e) => e.id !== evId)
    const p = mock.deskPic.projects.find((x) => `dr-${x.id}` === owner)
    if (p?.report) p.report.evidenceCount = dailyEvidence[owner].length
    return json({ ok: true, evidenceCount: dailyEvidence[owner].length })
  }
  const ev = dailyEvidence[owner].find((e) => e.id === evId)!
  return json({ url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(`Pratinjau: ${ev.fileName}`), kind: 'file' })
}

function dailyInputRoute(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  const desk = mock.deskPic
  if (method === 'GET') {
    if (params(url).get('date')) return json({ error: 'Pratinjau hanya memuat laporan hari ini' }, 422)
    return json({
      reportDate: desk.today,
      reportDateKey: desk.today.slice(0, 10),
      today: true,
      todayKey: desk.today.slice(0, 10),
      lockAt: desk.lockAt,
      locked: desk.locked,
      countdown: desk.countdown,
      canRequestUnlock: true,
      openDays: [],
      projects: desk.projects.map((p) => {
        const report = dailyReport(p.id)
        const forwarded = Boolean(report?.forwardedAt)
        return {
          id: p.id, code: p.code, name: p.name, phase: p.phase, taskCount: mock.deskTasks[p.id]?.length ?? 0,
          derived: (mock.deskTasks[p.id]?.length ?? 0) > 0,
          editable: !desk.locked && !forwarded,
          lockReason: forwarded ? 'FORWARDED' : desk.locked ? 'TIME' : null,
          unlock: null,
          report,
        }
      }),
    })
  }
  if (method === 'DELETE') {
    const pid = params(url).get('projectId') ?? ''
    const p = desk.projects.find((x) => x.id === pid)
    if (!p?.report) return json({ error: 'Laporan tidak ditemukan' }, 404)
    if (p.report.forwardedAt) return json({ error: 'Laporan yang sudah diteruskan ke holding tidak bisa dihapus.' }, 409)
    p.report = null as unknown as typeof p.report
    return json({ ok: true })
  }
  // PUT { projectId, action, status, progressPct, achievementToday, obstacle, followUp }
  const b = body(init)
  const p = desk.projects.find((x) => x.id === b.projectId)
  if (!p) return json({ error: 'Proyek tidak ditemukan' }, 404)
  if (desk.locked) return json({ error: 'Tenggat 17.00 sudah lewat; laporan hari ini terkunci.' }, 409)
  if (p.report?.forwardedAt) return json({ error: 'Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya.', frozen: true }, 409)
  const derived = (mock.deskTasks[p.id]?.length ?? 0) > 0
  const status = derived && p.report ? p.report.status : String(b.status ?? '')
  if (!status) return json({ error: 'Pilih status laporan' }, 422)
  const achievement = String(b.achievementToday ?? '').trim()
  if (b.action === 'submit' && achievement.length < 3) return json({ error: 'Tulis capaian hari ini' }, 422)
  const obstacle = String(b.obstacle ?? '').trim() || null
  const followUp = String(b.followUp ?? '').trim() || null
  if (b.action === 'submit' && (status === 'TERKENDALA' || status === 'MENUNGGU_KEPUTUSAN') && !obstacle) return json({ error: 'Tulis kendalanya' }, 422)
  if (b.action === 'submit' && status === 'TERKENDALA' && !followUp) return json({ error: 'Tulis rencana besok' }, 422)
  DAILY_TEXT[p.id] = { achievement, obstacle, followUp }
  const prev = p.report
  p.report = {
    status,
    progressPct: derived && prev ? prev.progressPct : Number(b.progressPct ?? 0),
    submittedAt: b.action === 'submit' ? new Date().toISOString() : (prev?.submittedAt ?? null),
    forwardedAt: null,
    isLate: false,
    evidenceCount: dailyEvidence[`dr-${p.id}`]?.length ?? 0,
  }
  return json({ ok: true, report: dailyReport(p.id) })
}

function progressRoute(url: string) {
  const pid = params(url).get('projectId') ?? ''
  if (!PROJ[pid]) return json({ error: 'Proyek tidak ditemukan' }, 404)
  const desk = mock.deskPic.projects.find((x) => x.id === pid)
  const r = desk?.report ?? null
  // Enam minggu terakhir: aktual dari riwayat contoh, rencana dari tahapan contoh (setara rumus src/lib/pic-progress.ts).
  const actual = pid === 'p2' ? [12, 22, 33, 45, 58, 64] : [0, 0, 0, 0, 10, 22]
  const plan = pid === 'p2' ? [15, 27, 39, 51, 63, 75] : [0, 0, 0, 0, 12, 20]
  const nowD = new Date(now)
  const wk = (() => {
    const x = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate()))
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7))
    return Math.ceil(((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 1)) / DAY + 1) / 7)
  })()
  const weeks = actual.map((a, i) => ({
    key: `2026-W${String(wk - 5 + i).padStart(2, '0')}`, label: `M${wk - 5 + i}`, start: day(-(5 - i) * 7), actual: a, plan: plan[i], reported: a > 0,
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
  const history = (desk?.history ?? []).slice(-6).map((h, i, arr) => {
    const last = i === arr.length - 1
    const state = last
      ? r?.forwardedAt ? 'FORWARDED' : r?.submittedAt ? 'SENT' : r ? 'DRAFT' : 'PENDING'
      : !h.submitted ? 'MISSING' : h.isLate ? 'LATE' : i < arr.length - 2 ? 'FORWARDED' : 'SENT'
    return {
      date: h.date.slice(0, 10) === h.date ? h.date : new Date(Date.parse(h.date) + 7 * 3600000).toISOString().slice(0, 10),
      state,
      status: last ? (r?.status ?? null) : h.status,
      progressPct: last ? (r?.progressPct ?? null) : h.progressPct,
      submittedAt: last ? (r?.submittedAt ?? null) : h.submitted ? new Date(Date.parse(h.date) + 16 * 3600000).toISOString() : null,
    }
  })
  return json({
    projectId: pid,
    today: r ? { submittedAt: r.submittedAt, forwardedAt: r.forwardedAt, isLate: r.isLate, progressPct: r.progressPct } : null,
    plan: { source: (stages[pid] ?? []).length ? 'STAGES' : 'LINEAR', weeks },
    deadlines: top,
    history,
  })
}

export function handle(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  if (role !== 'PIC_PROYEK') return null
  if (path === '/api/nav-badges') {
    const outstanding = mock.deskPic.projects.filter((p) => !p.report?.submittedAt).length
    const unread = Object.values(notes).flat().filter((n) => !n.readAt && n.authorId !== ME.id).length
    return json({
      badges: {
        ...(!mock.deskPic.locked && outstanding ? { 'daily-input': outstanding } : {}),
        ...(unread ? { dashboard: unread } : {}),
      },
    })
  }
  if (path === '/api/daily-input') return dailyInputRoute(url, init)
  if (path === '/api/project-progress') return progressRoute(url)
  if (path === '/api/outputs') return outputsRoute(url, init)
  if (path === '/api/evidence' || path.startsWith('/api/evidence/')) return evidenceRoute(path, url, init)
  if (path === '/api/project-notes') return notesRoute(url, init)
  if (path === '/api/project-stages') return stagesRoute(url, init)
  if (path === '/api/deadline-proposals') return proposalsRoute(url, init)
  return null
}
