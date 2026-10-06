/**
 * Data contoh pratinjau untuk layar pengawas (P2-D): Manajemen, Direktur, Direksi
 * holding, TI, Auditor, Super Admin. Bentuknya sama dengan /api/ringkasan.
 * Hanya mode pengembangan. Direktur (DIREKTUR_ENTITAS) melihat 3 divisi di PT
 * Ratu Karya; peran lain melihat seluruh grup.
 */

import { ringkasan as base } from '@/components/preview/mock-data'

const DAY = 86400000
const now = Date.now()
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString()

type Weekly = {
  id: string | null
  state: 'sent' | 'late' | 'missing' | 'read'
  statusHeader: string | null
  submittedAt: string | null
  submittedBy: string | null
  readAt: string | null
  itemsTotal: number
  itemsDone: number
  summary: string | null
  points: string[]
  obstacles: string[]
}

const W = (
  id: string, state: Weekly['state'], by: string | null, at: number | null, done: number, total: number, points: string[], obstacles: string[] = []
): Weekly => ({
  id: state === 'missing' ? null : id,
  state,
  statusHeader: state === 'missing' ? 'DRAFT' : 'MENUNGGU_PERSETUJUAN',
  submittedAt: at === null ? null : iso(at),
  submittedBy: by,
  readAt: state === 'read' ? iso(-0.5) : null,
  itemsTotal: total,
  itemsDone: done,
  summary: state === 'missing' ? null : `${done} dari ${total} pekerjaan selesai${obstacles.length ? `, ${obstacles.length} tertahan` : ''}.`,
  points,
  obstacles,
})

const D = (
  id: string, name: string, entityId: string, entityName: string, entityCode: string, head: string | null, weekly: Weekly,
  out: [done: number, total: number, active: number, onTime: number, withDue: number], trend: number[], projects: number
) => ({
  id, name, typeName: name, entityId, entityName, entityCode,
  // [F2-DIREKTUR] kontak contoh untuk "Hubungi <kadiv>"
  head: head
    ? { id: 'u-' + id, name: head, email: `${head.split(' ')[0].toLowerCase()}@contoh.co.id`, phone: '0812-3456-7890' }
    : null,
  projects,
  weekly,
  outputs: { total: out[1], done: out[0], active: out[2], review: Math.max(0, out[1] - out[0] - out[2]), onTime: out[3], withDue: out[4], trend },
  onTime: out[4] ? { pct: Math.round((out[3] / out[4]) * 100), ok: out[3], total: out[4], basis: 'output' as const } : null,
})

// ---- Direktur: 3 divisi, 8 proyek (02-direktur.md)
const DIR_DIVS = [
  D('dv-tek', 'Teknologi', 'e1', 'PT Ratu Karya', 'RTK', 'Andi Wijaya',
    W('w-tek', 'sent', 'Andi Wijaya', -3.2, 31, 38, ['Migrasi akun Google Workspace selesai untuk 50 pengguna.', 'Uji beban server cadangan mencapai 70%.', 'Desain halaman portal pelanggan disetujui.'], ['Perangkat uji gelombang 2 Aplikasi Absensi belum tiba dari vendor.']),
    [31, 38, 5, 28, 31], [22, 25, 24, 27, 26, 29, 28, 31], 3),
  D('dv-ops', 'Operasional', 'e1', 'PT Ratu Karya', 'RTK', 'Wahyu Hidayat',
    W('w-ops', 'missing', null, null, 0, 0, []),
    [18, 24, 4, 13, 18], [12, 14, 13, 15, 16, 15, 17, 18], 3),
  D('dv-med', 'Media', 'e1', 'PT Ratu Karya', 'RTK', 'Lina Marlina',
    W('w-med', 'late', 'Lina Marlina', -2.1, 22, 30, ['Materi cetak Kampanye Oktober selesai.', 'Jadwal unggah media sosial November tersusun.', 'Foto produk baru selesai disunting.'], ['Materi video menunggu persetujuan direktur.']),
    [22, 30, 6, 13, 21], [15, 18, 17, 19, 18, 21, 20, 22], 2),
]

const DP = (
  id: string, name: string, div: number, pic: string, status: string, progress: number, start: number, end: number, reason: string | null,
  phase = 'PELAKSANAAN', today = true, outs: [number, number] = [4, 6]
) => ({
  id, code: `PRJ-${id.toUpperCase()}`, name, phase, entityId: 'e1', entityName: 'PT Ratu Karya', entityCode: 'RTK',
  divisionId: DIR_DIVS[div].id, divisionName: DIR_DIVS[div].name,
  pic, startDate: iso(start), targetEndDate: iso(end), status, reason, progress, lastReportAt: iso(-0.2),
  lastNote: 'Integrasi modul absensi dengan sistem penggajian selesai, uji coba gelombang 2 menunggu perangkat.', reportedToday: today,
  outputsDone: outs[0], outputsTotal: outs[1],
})

const DIR_PROJECTS = [
  DP('q1', 'Kampanye Media Oktober', 2, 'Bagas Prakoso', 'late', 48, -30, -5, 'Materi video belum disetujui, lewat 5 hari.', 'PELAKSANAAN', false, [3, 8]),
  DP('q2', 'Peluncuran Aplikasi Absensi', 0, 'Rina Kartika', 'risk', 64, -40, 19, 'Uji coba gelombang 2 mundur 4 hari.', 'PELAKSANAAN', true, [7, 11]),
  DP('q3', 'Renovasi Ruang IT', 1, 'Dimas Saputra', 'risk', 35, -20, 30, 'Vendor belum konfirmasi jadwal.', 'PERENCANAAN', true, [2, 6]),
  DP('q4', 'Migrasi Server Data', 0, 'Yoga Saputra', 'on', 72, -50, 12, null, 'PELAKSANAAN', true, [9, 12]),
  DP('q5', 'Portal Pelanggan', 0, 'Sari Wulandari', 'on', 55, -25, 35, null, 'PELAKSANAAN', true, [6, 11]),
  DP('q6', 'Pelatihan K3 Gudang', 1, 'Wahyu Hidayat', 'on', 40, -10, 40, null, 'PELAKSANAAN', false, [4, 9]),
  DP('q7', 'Jadwal Armada Distribusi', 1, 'Fajar Nugroho', 'on', 61, -15, 9, null, 'PELAKSANAAN', true, [5, 9]),
  DP('q8', 'Konten Media Sosial Kuartal 4', 2, 'Lina Marlina', 'on', 30, -5, 50, null, 'PERENCANAAN', true, [3, 10]),
]

const sumTrend = (divs: { outputs: { trend: number[] } }[]) =>
  divs[0].outputs.trend.map((_, i) => divs.reduce((a, d) => a + d.outputs.trend[i], 0))

const outputsOf = (divs: typeof DIR_DIVS) => {
  const wk = sumTrend(divs)
  return {
    total: divs.reduce((a, d) => a + d.outputs.total, 0),
    done: divs.reduce((a, d) => a + d.outputs.done, 0),
    active: divs.reduce((a, d) => a + d.outputs.active, 0),
    review: divs.reduce((a, d) => a + d.outputs.review, 0),
    onTime: divs.reduce((a, d) => a + d.outputs.onTime, 0),
    withDue: divs.reduce((a, d) => a + d.outputs.withDue, 0),
    trend: {
      week: base.trend.map((t, i) => ({ label: t.label, value: wk[i] })),
      month: ['Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep'].map((label, i) => ({ label, value: [210, 236, 228, 251, 262, 274][i] * (divs.length / 6) | 0 })),
      quarter: ["K4'25", "K1'26", "K2'26", "K3'26"].map((label, i) => ({ label, value: [640, 690, 720, 787][i] * (divs.length / 6) | 0 })),
    },
  }
}

const proposals = [
  {
    id: 'dp1', projectId: 'q2', projectName: 'Peluncuran Aplikasi Absensi', entityName: 'PT Ratu Karya', divisionId: 'dv-tek',
    proposer: 'Rina Kartika', proposedAt: iso(-0.4), previousDate: iso(19), proposedDate: iso(25),
    reason: 'Perangkat uji gelombang 2 terlambat 4 hari dari vendor.',
  },
]

const direktur = {
  ...base,
  scope: { entities: 1, divisions: 3, global: false },
  projects: DIR_PROJECTS,
  counts: { on: 5, risk: 2, late: 1, done: 0, neutral: 0 },
  daily: { expected: 8, submitted: 6, onTime30Pct: 87, onTime30: 139, total30: 160 },
  weekly: { expected: 3, submitted: 2, approved: 1 },
  byEntity: [base.byEntity[1]],
  decisions: [],
  escalations: [
    { id: 'x2', divisionId: 'dv-ops', summary: 'Revisi anggaran Renovasi Ruang IT Rp 48,5 jt', needed: 'ANGGARAN', status: 'DITINJAU', raisedAt: iso(-2), raisedBy: 'Wahyu Hidayat', entityName: 'PT Ratu Karya', entityCode: 'RTK', ageDays: 2, overdue: false },
    { id: 'x1', divisionId: 'dv-med', summary: 'Materi video Kampanye Oktober belum disetujui', needed: 'KEPUTUSAN', status: 'DIAJUKAN', raisedAt: iso(-9), raisedBy: 'Lina Marlina', entityName: 'PT Ratu Karya', entityCode: 'RTK', ageDays: 9, overdue: true },
  ],
  reportWeek: { isoYear: 2026, isoWeek: base.week - 1, label: `M${base.week - 1}`, handoverBy: iso(-4), current: false },
  divisions: DIR_DIVS,
  outputs: outputsOf(DIR_DIVS),
  deadlineProposals: proposals,
  viewer: { canRemind: true, canMarkRead: true, canDecideDeadline: true },
}

// ---- Manajemen & peran grup: 3 entitas × divisi bernama sama (Kinerja divisi digabung per nama)
const G = (id: string, name: string, ent: number, head: string | null, state: Weekly['state'], out: [number, number, number, number, number], trend: number[]) => {
  const e = base.byEntity.find((x) => x.id === `e${ent}`)!
  return D(id, name, e.id, e.name, e.code, head, W('w-' + id, state, head, state === 'missing' ? null : -3, out[0], out[1], ['Pekerjaan utama minggu ini selesai sesuai rencana.']), out, trend, 2)
}
const GROUP_DIVS = [
  G('g-keu', 'Keuangan', 2, 'Sinta Dewi', 'read', [47, 50, 2, 44, 47], [40, 41, 43, 44, 42, 45, 46, 47]),
  G('g-huk', 'Hukum', 3, 'Rudi Hartono', 'sent', [30, 33, 2, 27, 30], [24, 25, 27, 26, 28, 29, 28, 30]),
  G('g-tek', 'Teknologi', 1, 'Andi Wijaya', 'sent', [31, 38, 5, 23, 28], [22, 25, 24, 27, 26, 29, 28, 31]),
  G('g-sdm', 'SDM', 1, 'Rudi Hartono', 'read', [25, 32, 5, 18, 23], [18, 20, 21, 22, 21, 23, 24, 25]),
  G('g-ops', 'Operasional', 2, 'Wahyu Hidayat', 'missing', [18, 26, 6, 11, 16], [12, 14, 13, 15, 16, 15, 17, 18]),
  G('g-med', 'Media', 3, 'Lina Marlina', 'late', [22, 36, 9, 12, 20], [15, 18, 17, 19, 18, 21, 20, 22]),
]

const grup = {
  ...base,
  projects: base.projects.map((p) => ({ ...p, divisionId: null, divisionName: null, outputsDone: Math.round(p.progress / 12), outputsTotal: 9 })),
  reportWeek: { isoYear: 2026, isoWeek: base.week - 1, label: `M${base.week - 1}`, handoverBy: iso(-4), current: false },
  divisions: GROUP_DIVS,
  outputs: outputsOf(GROUP_DIVS),
  deadlineProposals: proposals,
  attendance: { people: 50, present: 46, late: 2, leave: 4 },
  viewer: { canRemind: false, canMarkRead: true, canDecideDeadline: true },
}

// Status keputusan & tanda baca disimpan di sini agar muat ulang konsisten selama sesi pratinjau.
const decidedProposals = new Set<string>()

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

function dataFor(role: string) {
  const d = role === 'DIREKTUR_ENTITAS' ? direktur : grup
  const readOnly = role === 'AUDITOR' || role === 'TI'
  const decider = ['DIREKTUR_ENTITAS', 'MANAJEMEN', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI'].includes(role)
  return {
    ...d,
    // [F2-DIREKTUR]
    approvalRequests: decider ? approvalRequests.filter((a) => a.status === 'DIAJUKAN') : [],
    projects: d.projects.map((p) => ({ ...p, lastReview: reviews[p.id]?.[0] ? { at: reviews[p.id][0].reviewedAt, by: 'Anda' } : null })),
    divisions: d.divisions.map((x) => ({ ...x, weekly: { ...x.weekly, comments: (comments[x.weekly.id ?? ''] ?? []).length } })),
    decisions: readOnly ? [] : d.decisions,
    deadlineProposals: ['DIREKTUR_ENTITAS', 'MANAJEMEN', 'SUPERADMIN'].includes(role) ? d.deadlineProposals.filter((p) => !decidedProposals.has(p.id)) : [],
    viewer: {
      canRemind: role === 'DIREKTUR_ENTITAS' || role === 'DIREKTUR_SDM_GA' || role === 'TI' || role === 'SUPERADMIN',
      canMarkRead: !readOnly,
      canDecideDeadline: role === 'DIREKTUR_ENTITAS' || role === 'MANAJEMEN' || role === 'SUPERADMIN',
      canComment: ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN'].includes(role),
      canReview: ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI'].includes(role),
      canNote: ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI'].includes(role),
      canDecideApproval: decider,
    },
  }
}


// ---------------------------------------------------------------------
// [F2-DIREKTUR] Persetujuan, tanggapan, tinjauan, catatan, tahapan, pencarian, badge
// ---------------------------------------------------------------------

type MockApproval = {
  id: string; type: 'MATERI' | 'ANGGARAN' | 'CUTI'; title: string; description: string | null; amount: number | null
  entityId: string; entityName: string; entityCode: string; divisionId: string | null; divisionName: string | null
  projectId: string | null; projectName: string | null; requestedById: string; requester: string; requesterRole: string | null
  startDate: string | null; endDate: string | null; status: 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'DITARIK'
  decidedBy: string | null; decidedById: string | null; decidedAt: string | null; decisionNote: string | null
  file: { name: string; mime: string | null; size: number | null } | null; createdAt: string
}
const AR = (
  id: string, type: MockApproval['type'], title: string, requester: string, divIdx: number, ageDays: number,
  extra: Partial<MockApproval> = {}
): MockApproval => ({
  id, type, title, description: null, amount: null, entityId: 'e1', entityName: 'PT Ratu Karya', entityCode: 'RTK',
  divisionId: DIR_DIVS[divIdx].id, divisionName: DIR_DIVS[divIdx].name, projectId: null, projectName: null,
  requestedById: 'u-' + DIR_DIVS[divIdx].id, requester, requesterRole: 'KEPALA_DIVISI', startDate: null, endDate: null,
  status: 'DIAJUKAN', decidedBy: null, decidedById: null, decidedAt: null, decisionNote: null, file: null,
  createdAt: iso(-ageDays), ...extra,
})
const approvalRequests: MockApproval[] = [
  AR('ar1', 'MATERI', 'Materi video Kampanye Oktober', 'Lina Marlina', 2, 1.2, {
    projectId: 'q1', projectName: 'Kampanye Media Oktober',
    description: 'Video 45 detik untuk Instagram dan YouTube. Naskah sudah disetujui klien; perlu persetujuan sebelum tayang 24 Okt.',
    file: { name: 'storyboard-kampanye-oktober.pdf', mime: 'application/pdf', size: 1843200 },
  }),
  AR('ar2', 'ANGGARAN', 'Revisi anggaran Renovasi Ruang IT', 'Wahyu Hidayat', 1, 0.6, {
    amount: 48_500_000, projectId: 'q3', projectName: 'Renovasi Ruang IT',
    description: 'Harga rak server naik 12% dari penawaran awal. Tanpa revisi, pemasangan mundur 2 minggu.',
  }),
  AR('ar3', 'CUTI', 'Cuti 3 hari', 'Rina Kartika', 0, 0.3, { requesterRole: 'PIC_PROYEK', startDate: iso(7), endDate: iso(9) }),
]
const myRequests: MockApproval[] = [
  { ...approvalRequests[1], id: 'my1', requester: 'Andi Wijaya', status: 'DIAJUKAN' },
  { ...AR('my2', 'MATERI', 'Desain halaman portal pelanggan', 'Andi Wijaya', 0, 5), status: 'DISETUJUI', decidedBy: 'Hadi Santoso', decidedAt: iso(-4), decisionNote: null },
]

type MockComment = { id: string; weeklyReportId: string; body: string; createdAt: string; readAt: string | null; authorId: string; authorName: string; authorRole: string | null; mine: boolean }
const comments: Record<string, MockComment[]> = {
  'w-tek': [
    { id: 'c1', weeklyReportId: 'w-tek', body: 'Bagus, migrasi akun selesai lebih cepat. Tolong kabari bila perangkat uji belum tiba Rabu.', createdAt: iso(-1), readAt: iso(-0.8), authorId: 'u-dir', authorName: 'Hadi Santoso', authorRole: 'DIREKTUR_ENTITAS', mine: true },
    { id: 'c2', weeklyReportId: 'w-tek', body: 'Siap, Pak. Vendor menjanjikan Selasa sore.', createdAt: iso(-0.7), readAt: null, authorId: 'u-dv-tek', authorName: 'Andi Wijaya', authorRole: 'KEPALA_DIVISI', mine: false },
  ],
}
const reviews: Record<string, { id: string; reviewedAt: string; reviewer: string; mine: boolean }[]> = {}
const projectNotes: Record<string, { id: string; body: string; createdAt: string; readAt: string | null; authorId: string; authorName: string; authorRole: string; mine: boolean }[]> = {
  q2: [{ id: 'n1', body: 'Perangkat uji gelombang 2 dijadwalkan tiba Selasa.', createdAt: iso(-1), readAt: null, authorId: 'u-rina', authorName: 'Rina Kartika', authorRole: 'PIC_PROYEK', mine: false }],
}
const STAGE_NAMES = ['Analisis kebutuhan', 'Desain', 'Pengembangan', 'Uji coba', 'Peluncuran']

function body(init?: RequestInit): Record<string, unknown> {
  try {
    return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function oversightExtras(path: string, url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  const sp = new URL(url, 'http://x').searchParams
  const now = new Date().toISOString()

  if (path === '/api/approval-requests') {
    if (method === 'GET') {
      if (sp.get('mine') === '1') {
        const can = role === 'KEPALA_DIVISI' || role === 'PIC_PROYEK'
        return json({
          canRequest: can, undoMinutes: 15,
          options: { divisions: role === 'KEPALA_DIVISI' ? [{ id: 'dv-tek', name: 'Teknologi', entityName: 'PT Ratu Karya' }] : [], projects: DIR_PROJECTS.slice(0, 4).map((p) => ({ id: p.id, name: p.name, code: p.code })) },
          items: can ? myRequests : [],
        })
      }
      if (sp.get('decided') === '1') return json({ canDecide: true, items: approvalRequests.filter((a) => a.status === 'DISETUJUI' || a.status === 'DITOLAK') })
      return json({ canDecide: true, items: approvalRequests.filter((a) => a.status === 'DIAJUKAN') })
    }
    const b = body(init)
    if (method === 'POST') {
      const item: MockApproval = {
        ...AR('my' + (myRequests.length + 1), (b.type as MockApproval['type']) ?? 'MATERI', String(b.title || 'Cuti'), 'Anda', 0, 0),
        amount: typeof b.amount === 'number' ? b.amount : null,
        description: (b.description as string) ?? null,
        startDate: (b.startDate as string) ?? null,
        endDate: (b.endDate as string) ?? null,
      }
      myRequests.unshift(item)
      return json({ ok: true, item }, 201)
    }
    const a = [...approvalRequests, ...myRequests].find((x) => x.id === b.id)
    if (!a) return json({ error: 'Permintaan tidak ditemukan' }, 404)
    if (b.action === 'reject' && String(b.note ?? '').trim().length < 5) return json({ error: 'Tulis alasan penolakan untuk pengaju, minimal 5 huruf' }, 422)
    if (b.action === 'approve') Object.assign(a, { status: 'DISETUJUI', decidedBy: 'Anda', decidedAt: now })
    if (b.action === 'reject') Object.assign(a, { status: 'DITOLAK', decidedBy: 'Anda', decidedAt: now, decisionNote: b.note })
    if (b.action === 'undo' || b.action === 'reopen') Object.assign(a, { status: 'DIAJUKAN', decidedBy: null, decidedAt: null, decisionNote: null })
    if (b.action === 'withdraw') a.status = 'DITARIK'
    return json({ ok: true })
  }
  if (path === '/api/approval-requests/berkas') {
    return method === 'GET' ? json({ error: 'Berkas contoh tidak tersedia di pratinjau.' }, 404) : json({ ok: true, file: { name: 'berkas', mime: null, size: 0 } })
  }

  if (path === '/api/weekly-comments') {
    if (method === 'GET') {
      const div = sp.get('divisionId')
      if (div) {
        const d = DIR_DIVS.find((x) => x.id === div) ?? DIR_DIVS[0]
        const list = (comments[d.weekly.id ?? ''] ?? []).map((c) => ({ ...c, mine: c.authorRole === 'KEPALA_DIVISI' }))
        return json({
          divisionId: d.id, divisionName: d.name, canReply: role === 'KEPALA_DIVISI',
          unread: list.filter((c) => !c.mine && !c.readAt).length,
          reports: list.length ? [{ weeklyReportId: d.weekly.id, label: `M${base.week - 1}`, isoYear: 2026, isoWeek: base.week - 1, comments: list }] : [],
        })
      }
      const id = sp.get('weeklyReportId') ?? ''
      return json({ weeklyReportId: id, canComment: true, unread: 0, undoMinutes: 15, items: comments[id] ?? [] })
    }
    const b = body(init)
    if (method === 'POST') {
      const id = String(b.weeklyReportId ?? '')
      const mineIsHead = role === 'KEPALA_DIVISI'
      const item: MockComment = { id: 'c' + Date.now(), weeklyReportId: id, body: String(b.body ?? ''), createdAt: now, readAt: null, authorId: 'me', authorName: mineIsHead ? 'Andi Wijaya' : 'Anda', authorRole: mineIsHead ? 'KEPALA_DIVISI' : role, mine: true }
      ;(comments[id] ??= []).push(item)
      return json({ ok: true, item }, 201)
    }
    if (method === 'DELETE') {
      for (const k of Object.keys(comments)) comments[k] = comments[k].filter((c) => c.id !== b.id)
      return json({ ok: true })
    }
    return json({ ok: true, marked: 0 })
  }

  if (path === '/api/project-reviews') {
    if (method === 'GET') {
      const id = sp.get('projectId') ?? ''
      const list = reviews[id] ?? []
      return json({ projectId: id, canReview: true, undoMinutes: 15, mine: list[0] ? { id: list[0].id, reviewedAt: list[0].reviewedAt } : null, items: list })
    }
    const b = body(init)
    if (method === 'POST') {
      const r = { id: 'rv' + Date.now(), reviewedAt: now, reviewer: 'Anda', mine: true }
      ;(reviews[String(b.projectId)] ??= []).unshift(r)
      return json({ ok: true, review: { id: r.id, reviewedAt: r.reviewedAt } }, 201)
    }
    for (const k of Object.keys(reviews)) reviews[k] = reviews[k].filter((r) => r.id !== b.id)
    return json({ ok: true })
  }

  if (path === '/api/project-notes' && role !== 'PIC_PROYEK' && role !== 'KEPALA_DIVISI') {
    const id = method === 'GET' ? (sp.get('projectId') ?? '') : String(body(init).projectId ?? '')
    if (method === 'POST') {
      const n = { id: 'n' + Date.now(), body: String(body(init).body ?? ''), createdAt: now, readAt: null, authorId: 'me', authorName: 'Anda', authorRole: role, mine: true }
      ;(projectNotes[id] ??= []).push(n)
      return json({ ok: true, note: n }, 201)
    }
    if (method === 'PATCH') return json({ ok: true, marked: 0 })
    return json({ projectId: id, projectName: '', unread: 0, heads: [], items: projectNotes[id] ?? [] })
  }

  if (path === '/api/project-stages' && role !== 'PIC_PROYEK' && method === 'GET') {
    const id = sp.get('projectId') ?? ''
    const p = [...DIR_PROJECTS].find((x) => x.id === id)
    if (!p) return json({ projectId: id, targetEndDate: null, proposedEndDate: null, canEdit: false, done: 0, total: 0, items: [] })
    const n = STAGE_NAMES.length
    const doneCount = Math.min(n - 1, Math.floor((p.progress / 100) * n))
    const start = Date.parse(p.startDate)
    const span = (Date.parse(p.targetEndDate) - start) / n
    const items = STAGE_NAMES.map((name, i) => ({
      id: `${id}-s${i}`, name, position: i,
      startDate: new Date(start + i * span).toISOString(), dueDate: new Date(start + (i + 1) * span).toISOString(),
      status: i < doneCount ? 'SELESAI' : i === doneCount ? (p.status === 'risk' || p.status === 'late' ? 'TERTAHAN' : 'BERJALAN') : 'BELUM_MULAI',
      note: i === doneCount && p.reason ? p.reason : null,
      updatedAt: now,
    }))
    return json({ projectId: id, targetEndDate: p.targetEndDate, proposedEndDate: null, canEdit: false, done: doneCount, total: n, items })
  }

  if (path === '/api/search') {
    const q = (sp.get('q') ?? '').trim().toLowerCase()
    if (q.length < 2) return json({ q, hits: [] })
    const d = dataFor(role)
    const wk = /^m?\s*(\d{1,2})$/.exec(q)
    const hits = [
      ...d.projects.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, 6)
        .map((p) => ({ kind: 'project', id: p.id, title: p.name, sub: `${p.code} · ${p.entityCode} · ${p.pic}`, tab: 'projects' })),
      ...d.divisions.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 6)
        .map((x) => ({ kind: 'division', id: x.id, title: `Divisi ${x.name}`, sub: `${x.entityName} · ${x.head?.name ?? '—'}`, tab: 'divisions', divisionId: x.id })),
      ...d.divisions.filter((x) => x.weekly.id && (wk ? Number(wk[1]) === base.week - 1 : x.name.toLowerCase().includes(q))).slice(0, 6)
        .map((x) => ({ kind: 'weekly', id: x.weekly.id, title: `Laporan mingguan M${base.week - 1} · Divisi ${x.name}`, sub: `${x.entityCode} · 2026`, tab: 'divisions', divisionId: x.id })),
      ...d.divisions.filter((x) => x.head && x.head.name.toLowerCase().includes(q)).slice(0, 6)
        .map((x) => ({ kind: 'user', id: x.head!.id, title: x.head!.name, sub: `Kepala divisi · ${x.name}`, tab: null, email: x.head!.email, phone: x.head!.phone })),
    ]
    return json({ q, hits })
  }

  if (path === '/api/nav-badges' && ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN'].includes(role)) {
    const d = dataFor(role)
    const badges: Record<string, number> = {}
    if (d.escalations.length) badges.escalations = d.escalations.length
    const unread = d.divisions.filter((x) => x.weekly.state === 'sent' || x.weekly.state === 'late').length
    if (unread) badges.divisions = unread
    const appr = d.approvalRequests.length + d.deadlineProposals.length + (d.decisions?.length ?? 0)
    if (appr && role !== 'DIREKTUR_SDM_GA') badges.approvals = appr
    return json({ badges })
  }
  return null
}

/**
 * Rute pratinjau tambahan untuk area ini (P2). Kembalikan Response untuk path
 * yang ditangani, atau null agar diteruskan ke rute lain. Hanya mode pengembangan.
 */
export function handle(path: string, _url: string, init: RequestInit | undefined, role: string): Promise<Response> | null {
  const method = init?.method ?? 'GET'
  const extra = oversightExtras(path, _url, init, role) // [F2-DIREKTUR]
  if (extra) return extra
  if (path === '/api/ringkasan' && method === 'GET') return json(dataFor(role))
  if (path === '/api/ringkasan/laporan-dibaca') {
    const b = JSON.parse(String(init?.body ?? '{}')) as { weeklyReportId?: string }
    for (const d of [...DIR_DIVS, ...GROUP_DIVS]) {
      if (d.weekly.id !== b.weeklyReportId) continue
      if (method === 'DELETE') {
        d.weekly.readAt = null
        d.weekly.state = 'sent'
      } else {
        d.weekly.readAt = new Date().toISOString()
        d.weekly.state = 'read'
      }
    }
    return json({ ok: true, readAt: new Date().toISOString() })
  }
  if (path === '/api/notifications/remind' && method === 'POST') {
    return json({ ok: true, sent: 1, results: [{ division: 'Operasional', head: 'Wahyu Hidayat', sent: true }] })
  }
  if (path.startsWith('/api/deadline-proposals')) {
    if (method === 'GET') return json({ items: dataFor(role).deadlineProposals })
    const b = JSON.parse(String(init?.body ?? '{}')) as { id?: string; action?: string; note?: string }
    if (b.action === 'reject' && !b.note) return json({ error: 'Tulis alasan penolakan untuk PIC' }, 422)
    if (b.id) decidedProposals.add(b.id)
    return json({ ok: true })
  }
  return null
}
