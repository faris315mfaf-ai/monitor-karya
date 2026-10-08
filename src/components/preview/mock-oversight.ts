import { summaryFor } from './mock-summary'
import { can } from '@/lib/rbac'
import { divisions as catalogDivisions } from './mock-catalog'
import { summary as kadivSummary } from './mock-kadiv'
import { projectSnapshots } from './mock-proyek'
/**
 * Data contoh pratinjau untuk layar pengawas (P2-D): Manajemen, Direktur, Direksi
 * holding, TI, Auditor, Super Admin. Bentuknya sama dengan /api/ringkasan.
 * Hanya mode pengembangan. Direktur (DIREKTUR_ENTITAS) melihat 3 divisi di PT
 * Ratu Karya; peran lain melihat seluruh grup.
 */

import { isoWeekOf } from '@/lib/lock'
const mockWeek = () => isoWeekOf(new Date()).isoWeek

const DAY = 86400000
const now = Date.now()
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString()

const decidedProposals = new Set<string>()
const weeklyReads = new Map<string, string>()
const approvalDivisions = ['dv-tek', 'dv-ops', 'dv-med'].map((id) => catalogDivisions.find((d) => d.id === id)!)

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

function dataFor(role: string) {
  const d = summaryFor(role)
  const readOnly = role === 'AUDITOR' || role === 'TI'
  const decider = ['DIREKTUR_ENTITAS', 'MANAJEMEN', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI'].includes(role)
  return {
    ...d,
    // [F2-DIREKTUR]
    approvalRequests: decider ? approvalRequests.filter((a) => a.status === 'DIAJUKAN') : [],
    projects: d.projects.map((p) => ({ ...p, lastReview: reviews[p.id]?.[0] ? { at: reviews[p.id][0].reviewedAt, by: 'Anda' } : null })),
    divisions: d.divisions.map((x) => ({ ...x, weekly: { ...x.weekly, ...(x.id === 'dv-tek' && kadivSummary.status === 'TERKIRIM' ? { points: kadivSummary.points ?? [], summary: kadivSummary.points?.join(' ') ?? null } : {}), readAt: weeklyReads.get(x.weekly.id ?? '') ?? null, state: weeklyReads.has(x.weekly.id ?? '') ? 'read' : x.weekly.state, comments: (comments[x.weekly.id ?? ''] ?? []).length } })),
    decisions: readOnly ? [] : d.decisions,
    deadlineProposals: ['DIREKTUR_ENTITAS', 'MANAJEMEN', 'SUPERADMIN'].includes(role) ? [{ id: 'dp1', projectId: 'p2', projectName: projectSnapshots(role).find((p) => p.id === 'p2')?.name ?? '', entityName: 'PT Ratu Karya', divisionId: 'dv-tek', proposer: 'Rina Kartika', proposedAt: iso(-1), previousDate: iso(19), proposedDate: iso(26), reason: 'Perangkat uji terlambat dari vendor.' }].filter((p) => !decidedProposals.has(p.id)) : [],
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
  divisionId: approvalDivisions[divIdx].id, divisionName: approvalDivisions[divIdx].name, projectId: null, projectName: null,
  requestedById: 'u-' + approvalDivisions[divIdx].id, requester, requesterRole: 'KEPALA_DIVISI', startDate: null, endDate: null,
  status: 'DIAJUKAN', decidedBy: null, decidedById: null, decidedAt: null, decisionNote: null, file: null,
  createdAt: iso(-ageDays), ...extra,
})
const approvalRequests: MockApproval[] = [
  AR('ar1', 'MATERI', 'Materi video Kampanye Oktober', 'Lina Marlina', 2, 1.2, {
    projectId: 'p7', projectName: 'Kampanye Media Q4',
    description: 'Video 45 detik untuk Instagram dan YouTube. Naskah sudah disetujui klien; perlu persetujuan sebelum tayang 24 Okt.',
    file: { name: 'storyboard-kampanye-oktober.pdf', mime: 'application/pdf', size: 1843200 },
  }),
  AR('ar2', 'ANGGARAN', 'Revisi anggaran Renovasi Gudang Cikarang', 'Wahyu Hidayat', 1, 0.6, {
    amount: 48_500_000, projectId: 'p5', projectName: 'Renovasi Gudang Cikarang',
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
  'w1': [
    { id: 'c1', weeklyReportId: 'w1', body: 'Bagus, migrasi akun selesai lebih cepat. Tolong kabari bila perangkat uji belum tiba Rabu.', createdAt: iso(-1), readAt: iso(-0.8), authorId: 'u-dir', authorName: 'Hadi Santoso', authorRole: 'DIREKTUR_ENTITAS', mine: true },
    { id: 'c2', weeklyReportId: 'w1', body: 'Siap, Pak. Vendor menjanjikan Selasa sore.', createdAt: iso(-0.7), readAt: null, authorId: 'u-dv-tek', authorName: 'Andi Wijaya', authorRole: 'KEPALA_DIVISI', mine: false },
  ],
}
const reviews: Record<string, { id: string; reviewedAt: string; reviewer: string; mine: boolean }[]> = {}

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
          options: { divisions: role === 'KEPALA_DIVISI' ? [{ id: 'dv-tek', name: 'Teknologi', entityName: 'PT Ratu Karya' }] : [], projects: projectSnapshots(role).slice(0, 4).map((p) => ({ id: p.id, name: p.name, code: p.code })) },
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
        const d = summaryFor(role).divisions.find((x) => x.id === div) ?? summaryFor(role).divisions[0]
        const list = (comments[d.weekly.id ?? ''] ?? []).map((c) => ({ ...c, mine: c.authorRole === 'KEPALA_DIVISI' }))
        return json({
          divisionId: d.id, divisionName: d.name, canReply: role === 'KEPALA_DIVISI',
          unread: list.filter((c) => !c.mine && !c.readAt).length,
          reports: list.length ? [{ weeklyReportId: d.weekly.id, label: `M${mockWeek()}`, isoYear: 2026, isoWeek: mockWeek(), comments: list }] : [],
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

  if (path === '/api/project-stages' && role !== 'PIC_PROYEK' && method === 'GET') {
    const id = sp.get('projectId') ?? ''
    const p = projectSnapshots(role).find((x) => x.id === id)
    if (!p) return json({ projectId: id, targetEndDate: null, proposedEndDate: null, canEdit: false, done: 0, total: 0, items: [] })
    const n = STAGE_NAMES.length
    const doneCount = Math.min(n - 1, Math.floor((p.progress / 100) * n))
    const start = Date.parse(p.startDate ?? new Date().toISOString())
    const span = (Date.parse(p.targetEndDate ?? new Date().toISOString()) - start) / n
    const items = STAGE_NAMES.map((name, i) => ({
      id: `${id}-s${i}`, name, position: i,
      startDate: new Date(start + i * span).toISOString(), dueDate: new Date(start + (i + 1) * span).toISOString(),
      status: i < doneCount ? 'SELESAI' : i === doneCount ? (p.status === 'risk' || p.status === 'late' ? 'TERTAHAN' : 'BERJALAN') : 'BELUM_MULAI',
      note: i === doneCount && p.reason ? p.reason : null,
      updatedAt: now,
    }))
    return json({ projectId: id, targetEndDate: p.targetEndDate, proposedEndDate: null, canEdit: false, done: doneCount, total: n, items })
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
  if (role === 'AUDITOR' && method !== 'GET') return json({ error: 'Peran Anda hanya dapat membaca.' }, 403)
  const extra = oversightExtras(path, _url, init, role) // [F2-DIREKTUR]
  if (extra) return extra
  if (path === '/api/ringkasan' && method === 'GET') return json(dataFor(role))
  if (path === '/api/ringkasan/laporan-dibaca') {
    const b = JSON.parse(String(init?.body ?? '{}')) as { weeklyReportId?: string }
    if (!dataFor(role).viewer.canMarkRead) return json({ error: 'Peran Anda tidak menandai laporan.' }, 403)
    if (b.weeklyReportId) {
      if (method === 'DELETE') weeklyReads.delete(b.weeklyReportId)
      else weeklyReads.set(b.weeklyReportId, new Date().toISOString())
    }
    return json({ ok: true, readAt: new Date().toISOString() })
  }
  if (path === '/api/notifications/remind' && method === 'POST') {
    if (!can(role, 'notify:remind')) return json({ error: 'Peran Anda tidak mengirim pengingat.' }, 403)
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
