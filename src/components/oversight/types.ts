import type { Status } from '@/components/mk'
import type { ProjectLite } from '@/components/views/dash-common'

/** Bentuk respons /api/ringkasan (src/app/api/ringkasan/route.ts). */

export type OversightProject = ProjectLite & {
  entityId: string
  entityCode: string
  startDate: string | null
  reportedToday: boolean
  /** Tambahan P2-D; bisa absen pada respons lama. */
  divisionId?: string | null
  divisionName?: string | null
  outputsDone?: number
  outputsTotal?: number
  /** [F2-DIREKTUR] Tinjauan terakhir (siapa pun) dan tinjauan saya. */
  lastReview?: { at: string; by: string | null } | null
  reviewedByMeAt?: string | null
  /** Keputusan pemilik 8 Okt 2026 (drill-down per perusahaan): eskalasi laporan harian pada proyek ini. */
  escalations?: { id: string; summary: string; needed: string; status: string; raisedAt: string; raisedBy: string | null; ageDays: number; overdue: boolean }[]
}

/** Lencana laporan mingguan: Terkirim / Terlambat masuk / Belum masuk / Sudah dibaca. */
export type WeeklyState = 'sent' | 'late' | 'missing' | 'read'

export type DivisionSummary = {
  id: string
  name: string
  typeName: string
  entityId: string
  entityName: string
  entityCode: string
  /** [F2-DIREKTUR] email/telepon untuk "Hubungi <kadiv>". */
  head: { id: string; name: string; email?: string | null; phone?: string | null } | null
  projects: number
  weekly: {
    id: string | null
    state: WeeklyState
    statusHeader: string | null
    submittedAt: string | null
    submittedBy: string | null
    readAt: string | null
    itemsTotal: number
    itemsDone: number
    summary: string | null
    points: string[]
    obstacles: string[]
    /** [F2-DIREKTUR] jumlah tanggapan pada laporan ini. */
    comments?: number
    /** [F2-DIREKTUR] ringkasan yang dikirim kepala divisi ("Kirim ke Direktur", F2-KADIV). */
    headSummary?: { points: string[]; sentAt: string | null; outputsAccepted: number; outputsTarget: number; openObstacles: number } | null
  }
  outputs: { total: number; done: number; active: number; review: number; onTime: number; withDue: number; trend: number[] }
  onTime: { pct: number; ok: number; total: number; basis: 'output' | 'laporan' } | null
}

export type DeadlineProposalLite = {
  id: string
  projectId: string
  projectName: string
  entityName: string
  divisionId: string | null
  proposer: string
  proposedAt: string
  previousDate: string | null
  proposedDate: string
  reason: string
}

export type TrendPoint = { label: string; value: number }

/** [F2-DIREKTUR] Permintaan persetujuan (/api/approval-requests, src/lib/oversight.ts → shapeApprovals). */
export type ApprovalRequestLite = {
  id: string
  type: 'MATERI' | 'ANGGARAN' | 'CUTI'
  title: string
  description: string | null
  amount: number | null
  entityId: string
  entityName: string
  entityCode: string
  divisionId: string | null
  divisionName: string | null
  projectId: string | null
  projectName: string | null
  requestedById: string
  requester: string
  requesterRole: string | null
  startDate: string | null
  endDate: string | null
  status: 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK' | 'DITARIK'
  decidedBy: string | null
  decidedById: string | null
  decidedAt: string | null
  decisionNote: string | null
  file: { name: string; mime: string | null; size: number | null } | null
  createdAt: string
}

export type RingkasanData = {
  kind: 'RINGKASAN'
  week: number
  scope: { entities: number; divisions: number; global: boolean }
  projects: OversightProject[]
  counts: Record<'on' | 'risk' | 'late' | 'done' | 'neutral', number>
  daily: { expected: number; submitted: number; onTime30Pct: number; onTime30: number; total30: number }
  weekly: { expected: number; submitted: number; approved: number }
  trend: { label: string; submitted: number; onTimePct: number }[]
  byEntity: { id: string; name: string; code: string; onTimePct: number | null; onTime: number; total: number; projects: number; reportedToday: number }[]
  decisions: { id: string; name: string; entityName: string; proposer: string; proposedAt: string; slot: string | null }[]
  escalations: { id: string; divisionId?: string | null; summary: string; needed: string; status: string; raisedAt: string; raisedBy: string | null; entityName: string; entityCode: string; ageDays: number; overdue: boolean }[]
  activity: { id: string; who: string; role: string | null; text: string; at: string }[]
  // ---- Tambahan P2-D (opsional agar respons lama tetap terbaca)
  reportWeek?: { isoYear: number; isoWeek: number; label: string; handoverBy: string; current: boolean }
  divisions?: DivisionSummary[]
  outputs?: {
    total: number
    done: number
    active: number
    review: number
    onTime: number
    withDue: number
    trend: { week: TrendPoint[]; month: TrendPoint[]; quarter: TrendPoint[] }
  }
  deadlineProposals?: DeadlineProposalLite[]
  /** Kehadiran hari ini; null bila data kehadiran belum tersedia. */
  attendance?: { people: number; present: number; leave: number; late?: number } | null
  viewer?: {
    canRemind: boolean
    canMarkRead: boolean
    canDecideDeadline: boolean
    // [F2-DIREKTUR]
    canComment?: boolean
    canReview?: boolean
    canNote?: boolean
    canDecideApproval?: boolean
  }
  /** [F2-DIREKTUR] permintaan materi/anggaran/cuti yang menunggu keputusan Anda. */
  approvalRequests?: ApprovalRequestLite[]
}

export const WEEKLY_BADGE: Record<WeeklyState, { status: Status; label: string }> = {
  sent: { status: 'on', label: 'Terkirim' },
  late: { status: 'risk', label: 'Terlambat masuk' },
  missing: { status: 'late', label: 'Belum masuk' },
  read: { status: 'done', label: 'Sudah dibaca' },
}

export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
