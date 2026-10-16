/**
 * Logika murni layar Persetujuan Supervisor (papan 5 mockup subholding,
 * kontrak 16 Okt 2026): bentuk data, gerbang tombol keputusan, laporan
 * berikutnya setelah memutuskan, dan pesan galat yang ramah.
 */

import type { Status } from '@/components/mk'

export type ShStatus = 'MENUNGGU' | 'PERLU_PERBAIKAN' | 'DISETUJUI'

export type ShComment = {
  id: string
  kind: 'KOMENTAR' | 'PERBAIKAN' | 'SETUJU' | 'BALASAN' | string
  body: string
  authorName: string
  authorRole: string
  createdAt: string
  mine: boolean
}

export type ShEvidence = { id: string; fileName: string; mime: string | null; size?: number | null; url?: string | null }

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
  reporterTitleKind: string
  reporterTitleField: string
  reporterTitle: string
  status: ShStatus
  submittedAt: string | null
  decidedAt: string | null
  decidedByName: string | null
  evidenceCount: number
  evidence: ShEvidence[]
  comments: ShComment[]
  canEdit?: boolean
  canWithdraw?: boolean
  /** Sorotan untuk manajemen (diisi supervisor saat menyetujui). */
  highlight?: boolean
  highlightNote?: string | null
}

export type ReviewData = {
  items: ShReport[]
  counts: Partial<Record<ShStatus, number>>
  subholdings: { id: string; name: string; waiting: number }[]
}

export const STATUS_TABS: { value: ShStatus; label: string }[] = [
  { value: 'MENUNGGU', label: 'Menunggu' },
  { value: 'PERLU_PERBAIKAN', label: 'Diminta perbaikan' },
  { value: 'DISETUJUI', label: 'Disetujui' },
]

/** Status laporan → StatusBadge (warna + ikon + kata). */
export const STATUS_META: Record<ShStatus, { status: Status; label: string }> = {
  MENUNGGU: { status: 'risk', label: 'Menunggu' },
  PERLU_PERBAIKAN: { status: 'late', label: 'Perlu perbaikan' },
  DISETUJUI: { status: 'done', label: 'Disetujui' },
}

export const COMMENT_KIND_LABEL: Record<string, string> = {
  KOMENTAR: 'Komentar',
  PERBAIKAN: 'Minta perbaikan',
  SETUJU: 'Disetujui',
  BALASAN: 'Balasan admin',
}

/** Minimal huruf komentar untuk "Minta perbaikan" (sama dengan API). */
export const MIN_REVISE_LETTERS = 5

/** Jumlah huruf (semua aksara) — sama dengan `letterCount` server; spasi, angka & tanda baca tidak dihitung. */
export function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length
}

/** Catatan sorotan untuk manajemen: minimal sekian huruf, maksimal sekian karakter (sama dengan API). */
export const HIGHLIGHT_NOTE_MIN_LETTERS = 5
export const HIGHLIGHT_NOTE_MAX = 280

export type HighlightNoteCheck = {
  ok: boolean
  /** Panjang setelah dirapikan (yang dihitung server terhadap batas maksimum). */
  length: number
  letters: number
  /** Sisa karakter sebelum batas; negatif bila kelebihan. */
  remaining: number
  /** Penghitung "n/280". */
  counter: string
  /** Nada penghitung: biasa, hampir penuh (≤20 sisa), atau kelebihan. */
  tone: 'normal' | 'near' | 'over'
  /** Kalimat penjelas bila belum sah (null = sah). */
  hint: string | null
}

/** Validasi catatan sorotan: ≥5 huruf dan ≤280 karakter setelah spasi tepi dibuang. */
export function highlightNoteCheck(note: string): HighlightNoteCheck {
  const clean = note.trim()
  const length = clean.length
  const letters = letterCount(clean)
  const remaining = HIGHLIGHT_NOTE_MAX - length
  const hint =
    letters < HIGHLIGHT_NOTE_MIN_LETTERS
      ? `Tulis catatan untuk manajemen minimal ${HIGHLIGHT_NOTE_MIN_LETTERS} huruf.`
      : remaining < 0
        ? `Catatan untuk manajemen maksimal ${HIGHLIGHT_NOTE_MAX} karakter. Persingkat ${-remaining} karakter lagi.`
        : null
  return {
    ok: hint === null,
    length,
    letters,
    remaining,
    counter: `${length}/${HIGHLIGHT_NOTE_MAX}`,
    tone: remaining < 0 ? 'over' : remaining <= 20 ? 'near' : 'normal',
    hint,
  }
}

/** Label tombol setujui sesuai sakelar sorotan. */
export function approveLabel(highlight: boolean): string {
  return highlight ? 'Setujui & sorot' : 'Setujui'
}

/** Teks kecil di bawah tombol: akibat menyetujui bagi dashboard manajemen. */
export function approveConsequence(highlight: boolean): string {
  return highlight
    ? 'Laporan tampil di Sorotan manajemen setelah disetujui'
    : 'Laporan tampil di daftar biasa manajemen'
}

export type DecisionAction = 'comment' | 'revise' | 'approve'

export type DecisionGate = {
  /** Tombol keputusan (Setujui/Minta perbaikan) ditampilkan sama sekali. */
  decidable: boolean
  canComment: boolean
  canRevise: boolean
  /** Setujui sah: ada bukti, tidak sibuk, dan catatan sorotan sah bila sakelar aktif. */
  canApprove: boolean
  /** Kalimat penjelas kenapa tombol tidak bisa dipakai (null = bisa). */
  reviseHint: string | null
  approveHint: string | null
  /** Penjelas catatan sorotan yang belum sah (null = sah atau sakelar mati). */
  highlightHint: string | null
}

/**
 * Gerbang tombol: keputusan hanya untuk laporan MENUNGGU; minta perbaikan
 * wajib komentar ≥5 huruf; setujui wajib ≥1 bukti, dan bila ditandai untuk
 * manajemen wajib catatan sorotan 5–280; komentar saja wajib isi.
 * Selama satu permintaan berjalan, semua tombol dikunci.
 */
export function decisionGate(input: {
  status: ShStatus
  note: string
  evidenceCount: number
  busy: boolean
  highlight?: boolean
  highlightNote?: string
}): DecisionGate {
  const decidable = input.status === 'MENUNGGU'
  const letters = letterCount(input.note)
  const reviseHint = !decidable
    ? 'Laporan ini sudah diputuskan.'
    : letters < MIN_REVISE_LETTERS
      ? `Tulis komentar minimal ${MIN_REVISE_LETTERS} huruf agar admin tahu apa yang harus diperbaiki.`
      : null
  const approveHint = !decidable
    ? 'Laporan ini sudah diputuskan.'
    : input.evidenceCount < 1
      ? 'Laporan tanpa bukti belum bisa disetujui. Minta perbaikan agar admin melampirkan bukti.'
      : null
  const highlightHint = decidable && input.highlight ? highlightNoteCheck(input.highlightNote ?? '').hint : null
  return {
    decidable,
    canComment: !input.busy && input.note.trim().length > 0,
    canRevise: !input.busy && reviseHint === null,
    canApprove: !input.busy && approveHint === null && highlightHint === null,
    reviseHint,
    approveHint,
    highlightHint,
  }
}

export type DecisionBody =
  | { action: 'revise'; note?: string }
  | { action: 'approve'; note?: string; highlight: boolean; highlightNote?: string }

/**
 * Isi POST /api/sh/reports/:id/decision. Minta perbaikan tidak pernah membawa
 * sorotan; setujui selalu menyebut `highlight`, dan `highlightNote` hanya bila aktif.
 */
export function decisionBody(
  action: 'revise' | 'approve',
  input: { note: string; highlight?: boolean; highlightNote?: string }
): DecisionBody {
  const note = input.note.trim()
  const withNote = note ? { note } : {}
  if (action === 'revise') return { action, ...withNote }
  const highlight = input.highlight === true
  return highlight
    ? { action, ...withNote, highlight, highlightNote: (input.highlightNote ?? '').trim() }
    : { action, ...withNote, highlight }
}

/** Laporan disetujui yang ditandai sorotan (lencana bintang + catatan). */
export function isHighlighted(r: Pick<ShReport, 'status' | 'highlight'>): boolean {
  return r.status === 'DISETUJUI' && r.highlight === true
}

/**
 * Laporan yang dibuka setelah keputusan: yang sesudahnya di antrean, atau
 * sebelumnya bila yang diputuskan ada di ujung; null bila antrean habis.
 */
export function nextAfterDecision(queue: Pick<ShReport, 'id'>[], decidedId: string): string | null {
  const i = queue.findIndex((r) => r.id === decidedId)
  const rest = queue.filter((r) => r.id !== decidedId)
  if (rest.length === 0) return null
  if (i < 0) return rest[0].id
  return (rest[i] ?? rest[i - 1] ?? rest[0]).id
}

/** Pilihan aktif: yang dipilih bila masih ada di daftar, selain itu yang pertama. */
export function resolveSelected(items: Pick<ShReport, 'id'>[], selected: string | null): string | null {
  if (selected && items.some((r) => r.id === selected)) return selected
  return items[0]?.id ?? null
}

/** Pesan galat ramah per status HTTP; 409 = laporan sudah berubah di tempat lain. */
export function friendlyError(status: number, serverMessage: string | undefined, action: DecisionAction): string {
  if (status === 409) {
    if (action === 'approve' && serverMessage && /bukti/i.test(serverMessage)) return serverMessage
    return 'Laporan ini sudah diputuskan atau diubah admin sebelum keputusan Anda tersimpan. Daftar dimuat ulang.'
  }
  if (status === 422) return serverMessage || 'Isian belum lengkap. Periksa komentar Anda.'
  if (status === 403) return serverMessage || 'Peran Anda tidak bisa meninjau laporan ini.'
  if (status === 404) return 'Laporan tidak ditemukan; mungkin sudah ditarik admin. Daftar dimuat ulang.'
  if (status === 0) return 'Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.'
  return serverMessage || 'Keputusan belum tersimpan. Coba lagi.'
}

/** Status 409/404 berarti data di layar sudah usang: muat ulang daftar. */
export function shouldReload(status: number): boolean {
  return status === 409 || status === 404
}

/** Jumlah menunggu pada chip "Semua subholding". */
export function totalWaiting(subholdings: ReviewData['subholdings']): number {
  return subholdings.reduce((n, s) => n + (s.waiting ?? 0), 0)
}
