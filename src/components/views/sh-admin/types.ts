/**
 * Bentuk data API laporan SUBHOLDING untuk layar Admin subholding.
 * Sumber kebenaran: docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md (bagian API).
 */

export type ShStatus = 'MENUNGGU' | 'PERLU_PERBAIKAN' | 'DISETUJUI'
export type ShTitleKind = 'MANAJER' | 'KEPALA'
export type ShCommentKind = 'KOMENTAR' | 'PERBAIKAN' | 'SETUJU' | 'BALASAN'

export type ShEvidence = { id: string; fileName: string; mime: string; size: number; url: string }

export type ShComment = {
  id: string
  kind: ShCommentKind
  body: string
  authorName: string
  authorRole: string
  createdAt: string
  editedAt?: string | null
  mine: boolean
}

export type ShReport = {
  id: string
  subholdingId: string
  subholdingName: string
  ptId: string
  ptName: string
  reportDate: string
  kegiatan: string
  deskripsi: string
  reporterName: string
  reporterTitleKind: ShTitleKind
  reporterTitleField: string
  reporterTitle: string
  status: ShStatus
  submittedAt: string | null
  decidedAt: string | null
  decidedByName: string | null
  evidenceCount: number
  evidence: ShEvidence[]
  comments: ShComment[]
  canEdit: boolean
  canWithdraw: boolean
}

export type ShCounts = Record<ShStatus, number>

export type ShReportList = { items: ShReport[]; total: number; counts: ShCounts }

export type ShReporter = { name: string; titleKind: ShTitleKind; titleField: string }

export type ShOptions = {
  subholding: { id: string; name: string }
  pts: { id: string; code: string; name: string }[]
  reporters: ShReporter[]
}

export type ShInboxItem = {
  id: string
  kind: ShCommentKind
  body: string
  createdAt: string
  unread: boolean
  authorName: string
  report: {
    id: string
    kegiatan: string
    ptName: string
    status: ShStatus
    reporterName: string
    reporterTitle: string
    submittedAt: string | null
    evidenceCount: number
  }
}

export type ShReminder = { id: string; text: string; createdAt: string }

export type ShInbox = { items: ShInboxItem[]; reminders: ShReminder[]; unreadCount: number }
