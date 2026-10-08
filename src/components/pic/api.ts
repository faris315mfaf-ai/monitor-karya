'use client'

/**
 * Data fitur PIC proyek (05-pic-proyek.md): output, catatan kepala divisi,
 * tahapan bertanggal, usulan geser tenggat. Tipe di sini cermin JSON dari
 * /api/outputs, /api/project-notes, /api/project-stages, /api/deadline-proposals.
 */

import { useResource } from '@/hooks/use-resource'
import type { Status } from '@/components/mk'

export type OutputStatus = 'DIKERJAKAN' | 'MENUNGGU_REVIEW' | 'PERLU_REVISI' | 'DITERIMA'

export type OutputItem = {
  id: string
  projectId: string
  title: string
  description: string | null
  status: OutputStatus
  dueDate: string | null
  ownerId: string
  reviewerId: string | null
  revisionNote: string | null
  submittedAt: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  projectName: string
  projectCode: string
  ownerName: string
  reviewerName: string | null
  evidenceCount: number
}

export type OutputsData = { items: OutputItem[]; counts: Record<OutputStatus, number>; total: number }

export const OUTPUT_META: Record<OutputStatus, { label: string; status: Status }> = {
  DIKERJAKAN: { label: 'Dikerjakan', status: 'info' },
  MENUNGGU_REVIEW: { label: 'Menunggu review', status: 'neutral' },
  PERLU_REVISI: { label: 'Perlu revisi', status: 'risk' },
  DITERIMA: { label: 'Diterima', status: 'done' },
}

/** Urutan chip saringan di spesifikasi. */
export const OUTPUT_FILTERS: { value: 'ALL' | OutputStatus; label: string; status?: Status }[] = [
  { value: 'ALL', label: 'Semua' },
  { value: 'PERLU_REVISI', label: 'Perlu revisi', status: 'risk' },
  { value: 'DIKERJAKAN', label: 'Dikerjakan', status: 'info' },
  { value: 'MENUNGGU_REVIEW', label: 'Menunggu review', status: 'neutral' },
  { value: 'DITERIMA', label: 'Diterima', status: 'done' },
]

export type EvidenceItem = { id: string; fileName: string; mime: string; size: number; url: string | null; createdAt: string }

export type NoteItem = {
  id: string
  body: string
  createdAt: string
  readAt: string | null
  authorId: string
  authorName: string
  authorRole: string
  mine: boolean
}
export type NotesData = { projectId: string; projectName: string; unread: number; heads?: string[]; items: NoteItem[] }

export type StageStatus = 'BELUM_MULAI' | 'BERJALAN' | 'TERTAHAN' | 'SELESAI'
export type StageItem = {
  id: string
  name: string
  position: number
  startDate: string | null
  dueDate: string | null
  status: StageStatus
  note: string | null
  updatedAt: string
}
export type StagesData = {
  projectId: string
  targetEndDate: string | null
  proposedEndDate: string | null
  canEdit: boolean
  done: number
  total: number
  items: StageItem[]
}

export const STAGE_META: Record<StageStatus, { label: string; flow: 'done' | 'current' | 'todo' | 'blocked' }> = {
  BELUM_MULAI: { label: 'Belum mulai', flow: 'todo' },
  BERJALAN: { label: 'Berjalan', flow: 'current' },
  TERTAHAN: { label: 'Tertahan', flow: 'blocked' },
  SELESAI: { label: 'Selesai', flow: 'done' },
}

export type ProposalItem = {
  id: string
  projectId: string
  previousDate: string | null
  proposedDate: string
  reason: string
  status: 'DIAJUKAN' | 'DISETUJUI' | 'DITOLAK'
  proposedById: string
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
  projectName: string
  projectCode: string
  currentTargetDate: string | null
  proposedByName: string
  decidedByName: string | null
}
export type ProposalsData = { items: ProposalItem[]; canDecide: boolean }

export function useOutputs(projectId: string | null) {
  const res = useResource<OutputsData>(projectId ? `/api/outputs?projectId=${encodeURIComponent(projectId)}` : null)
  // useResource mempertahankan snapshot sebelumnya saat kunci berubah.
  const data = !res.loading && projectId && res.data?.items.every((o) => o.projectId === projectId) ? res.data : null
  return { ...res, data }
}
export function useStages(projectId: string | null) {
  return useResource<StagesData>(projectId ? `/api/project-stages?projectId=${encodeURIComponent(projectId)}` : null)
}
export function useProposals(projectId: string | null) {
  return useResource<ProposalsData>(projectId ? `/api/deadline-proposals?projectId=${encodeURIComponent(projectId)}` : null)
}

/** Panggilan JSON; melempar Error berisi pesan server bila gagal. */
export async function call<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('Tidak dapat menghubungi server')
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(json.error || 'Permintaan belum berhasil. Coba lagi.')
  return json
}

/** Unggah satu berkas bukti untuk output. */
export async function uploadOutputEvidence(outputId: string, file: File): Promise<EvidenceItem> {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('targetType', 'OUTPUT')
  fd.set('targetId', outputId)
  let res: Response
  try {
    res = await fetch('/api/evidence/upload', { method: 'POST', body: fd })
  } catch {
    throw new Error('Tidak dapat menghubungi server')
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; evidence?: EvidenceItem }
  if (!res.ok || !json.evidence) throw new Error(json.error || 'Berkas belum terunggah')
  return json.evidence
}

/** Kunci "YYYY-MM-DD" (WIB) dari ISO, untuk isian tanggal. */
export function dateKey(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(Date.parse(iso) + 7 * 3600000)
  return d.toISOString().slice(0, 10)
}

/** Hari dari hari ini (WIB) ke tanggal itu; negatif = sudah lewat. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const today = dateKey(new Date().toISOString())
  return Math.round((Date.parse(dateKey(iso)) - Date.parse(today)) / 86400000)
}

/** Event untuk membuka kolom balas catatan dengan teks awal (dari Sheet output). */
export const ASK_HEAD_EVENT = 'mk:pic-ask-head'
export function askHead(projectId: string, text: string) {
  window.dispatchEvent(new CustomEvent(ASK_HEAD_EVENT, { detail: { projectId, text } }))
}

/** Catatan proyek berubah (mis. pertanyaan dikirim dari Sheet output): kartu catatan memuat ulang. */
export const NOTES_CHANGED_EVENT = 'mk:pic-notes-changed'
export function notesChanged(projectId: string) {
  window.dispatchEvent(new CustomEvent(NOTES_CHANGED_EVENT, { detail: { projectId } }))
}

/* ------------------------------------------------------------------ */
/* GET /api/project-progress — progres vs rencana, tenggat, riwayat    */
/* ------------------------------------------------------------------ */

export type ProgressWeek = { key: string; label: string; start: string; actual: number; plan: number | null; reported: boolean }
export type DeadlineItem = {
  id: string
  kind: 'STAGE_START' | 'STAGE_DUE' | 'OUTPUT' | 'PROJECT'
  date: string
  title: string
  note: string | null
  daysLeft: number
  state: 'late' | 'risk' | 'neutral' | 'on'
  badge: string
}
export type HistoryDay = {
  date: string
  state: 'FORWARDED' | 'SENT' | 'LATE' | 'MISSING' | 'PENDING' | 'DRAFT'
  status: string | null
  progressPct: number | null
  submittedAt: string | null
}
export type ProgressData = {
  projectId: string
  today: { submittedAt: string | null; forwardedAt: string | null; isLate: boolean; progressPct: number } | null
  plan: { source: 'STAGES' | 'LINEAR' | 'NONE'; weeks: ProgressWeek[] }
  deadlines: DeadlineItem[]
  history: HistoryDay[]
}

export function useProjectProgress(projectId: string | null) {
  return useResource<ProgressData>(projectId ? `/api/project-progress?projectId=${encodeURIComponent(projectId)}` : null)
}
