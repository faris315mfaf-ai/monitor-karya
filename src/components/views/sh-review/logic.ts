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

export type ReviewSubholding = {
  id: string
  name: string
  waiting: number
  /** Kiriman menunggu terlama (ISO) — untuk "Terlama n hari". */
  oldestAt?: string | null
}

/** Keputusan peninjau ini sejak 00.00 WIB (rekap saat antrean habis). */
export type ReviewToday = { approved: number; highlighted: number; revised: number }

export type ReviewData = {
  items: ShReport[]
  counts: Partial<Record<ShStatus, number>>
  subholdings: ReviewSubholding[]
  today?: ReviewToday
}

export const STATUS_TABS: { value: ShStatus; label: string }[] = [
  { value: 'MENUNGGU', label: 'Menunggu' },
  { value: 'PERLU_PERBAIKAN', label: 'Perbaikan' },
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

/* ---------- Antrean (papan S-Tablet-* & S-Ponsel-*, 16 Okt 2026) ---------- */

const WIB_MS = 7 * 3600_000
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'] as const
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const

/** Laporan menunggu sekian hari kalender atau lebih ditandai kuning. */
export const LONG_WAIT_DAYS = 2

function wibParts(iso: string | null | undefined) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const d = new Date(t + WIB_MS)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() }
}

function dayNumber(p: { y: number; m: number; d: number }): number {
  return Math.round(Date.UTC(p.y, p.m, p.d) / 86_400_000)
}

/** Selisih hari kalender WIB antara kiriman dan sekarang (0 = hari yang sama, tidak pernah negatif). */
export function waitDays(iso: string | null | undefined, now: Date = new Date()): number {
  const a = wibParts(iso)
  const b = wibParts(now.toISOString())
  if (!a || !b) return 0
  return Math.max(0, dayNumber(b) - dayNumber(a))
}

/** "Hari ini" / "1 hari" / "3 hari". */
export function ageLabel(days: number): string {
  return days >= 1 ? `${days} hari` : 'Hari ini'
}

/** Laporan menunggu yang sudah dikirim ulang setelah diminta perbaikan. */
export function isResent(r: Pick<ShReport, 'status' | 'comments'>): boolean {
  return r.status === 'MENUNGGU' && (r.comments ?? []).some((c) => c.kind === 'PERBAIKAN')
}

export type QueueFlag = 'no-evidence' | 'resent' | 'highlight' | null

/** Satu penanda per baris antrean, urut kepentingan. */
export function queueFlag(r: Pick<ShReport, 'status' | 'comments' | 'evidenceCount' | 'evidence' | 'highlight'>): QueueFlag {
  if (r.status === 'MENUNGGU') {
    if (Math.max(r.evidenceCount ?? 0, r.evidence?.length ?? 0) < 1) return 'no-evidence'
    if (isResent(r)) return 'resent'
    return null
  }
  return isHighlighted(r) ? 'highlight' : null
}

export const FLAG_LABEL: Record<Exclude<QueueFlag, null>, string> = {
  'no-evidence': 'Tanpa bukti',
  resent: 'Dikirim ulang',
  highlight: 'Sorotan',
}

export type QueueGroup<T> = { key: string; title: string; warn: boolean; items: T[] }

/**
 * Kelompok antrean ponsel: Menunggu dibagi "Lebih dari sehari" (kuning) dan
 * "Masuk hari ini"; status lain satu kelompok. Kelompok kosong dibuang.
 */
export function queueGroups<T extends Pick<ShReport, 'submittedAt'>>(items: T[], status: ShStatus, now: Date = new Date()): QueueGroup<T>[] {
  if (status !== 'MENUNGGU') return items.length ? [{ key: 'all', title: `${items.length} laporan`, warn: false, items }] : []
  const old = items.filter((r) => waitDays(r.submittedAt, now) >= 1)
  const fresh = items.filter((r) => waitDays(r.submittedAt, now) < 1)
  return [
    { key: 'old', title: `Lebih dari sehari · ${old.length}`, warn: true, items: old },
    { key: 'today', title: `Masuk hari ini · ${fresh.length}`, warn: false, items: fresh },
  ].filter((g) => g.items.length > 0)
}

/** Jumlah laporan menunggu ≥ LONG_WAIT_DAYS hari. */
export function longWaitCount(items: Pick<ShReport, 'status' | 'submittedAt'>[], now: Date = new Date()): number {
  return items.filter((r) => r.status === 'MENUNGGU' && waitDays(r.submittedAt, now) >= LONG_WAIT_DAYS).length
}

/** Kalimat peringatan antrean lama (null = tidak ada). */
export function longWaitLine(n: number): string | null {
  if (n < 1) return null
  return `${n} laporan sudah menunggu ${LONG_WAIT_DAYS} hari atau lebih. Admin subholding belum bisa melanjutkan sebelum Anda memutuskan.`
}

/** Baris bawah tiap subholding di navigasi: "Terlama 2 hari" / "Semua masuk hari ini" / "Tidak ada antrean". */
export function subLine(s: Pick<ReviewSubholding, 'waiting' | 'oldestAt'>, now: Date = new Date()): { text: string; warn: boolean } {
  if (!s.waiting) return { text: 'Tidak ada antrean', warn: false }
  const d = s.oldestAt ? waitDays(s.oldestAt, now) : 0
  if (d < 1) return { text: 'Semua masuk hari ini', warn: false }
  return { text: `Terlama ${d} hari`, warn: d >= LONG_WAIT_DAYS }
}

/** Umur terlama di antara subholding (untuk baris "Semua subholding"). */
export function oldestOf(subs: Pick<ReviewSubholding, 'waiting' | 'oldestAt'>[]): string | null {
  let best: string | null = null
  for (const s of subs) {
    if (!s.waiting || !s.oldestAt) continue
    if (!best || new Date(s.oldestAt) < new Date(best)) best = s.oldestAt
  }
  return best
}

/** Kepala layar: "6 laporan menunggu" / "Antrean kosong". */
export function waitingHeadline(total: number): string {
  return total > 0 ? `${total} laporan menunggu` : 'Antrean kosong'
}

/** "Rabu 14 Okt, 16.20" (WIB). */
export function stampLabel(iso: string | null | undefined): string {
  const p = wibParts(iso)
  if (!p) return ''
  const hh = String(p.h).padStart(2, '0')
  const mm = String(p.min).padStart(2, '0')
  return `${HARI[p.wd]} ${p.d} ${BULAN_PENDEK[p.m]}, ${hh}.${mm}`
}

/** "Rabu, 14 Oktober 2026" dari kunci 'YYYY-MM-DD'. */
export function reportDateLabel(key: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '')
  if (!m) return key ?? ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Baris waktu di kepala rincian: kapan dikirim/diputuskan + lama menunggu. */
export function sentLine(
  r: Pick<ShReport, 'status' | 'submittedAt' | 'decidedAt' | 'decidedByName' | 'comments'>,
  now: Date = new Date()
): { text: string; wait: string; warn: boolean } {
  if (r.status === 'MENUNGGU') {
    const d = waitDays(r.submittedAt, now)
    return {
      text: `${isResent(r) ? 'Dikirim ulang' : 'Dikirim'} ${stampLabel(r.submittedAt)}`,
      wait: d >= 1 ? ` · menunggu ${d} hari` : '',
      warn: d >= LONG_WAIT_DAYS,
    }
  }
  const by = r.decidedByName ? ` oleh ${r.decidedByName}` : ''
  const verb = r.status === 'DISETUJUI' ? 'Disetujui' : 'Diminta perbaikan'
  return { text: `${verb} ${stampLabel(r.decidedAt ?? r.submittedAt)}${by}`, wait: '', warn: false }
}

/** "2 dari 6". */
export function positionText(index: number, length: number): string {
  return length > 0 && index >= 0 ? `${index + 1} dari ${length}` : ''
}

/** Laporan tetangga (tanpa memutar): null di ujung. */
export function neighborId(items: Pick<ShReport, 'id'>[], currentId: string | null, delta: -1 | 1): string | null {
  const i = items.findIndex((r) => r.id === currentId)
  if (i < 0) return null
  return items[i + delta]?.id ?? null
}

/** Rekap saat antrean habis; null bila belum ada keputusan hari ini. */
export function todayRecap(t: ReviewToday | null | undefined): { total: number; line: string } | null {
  if (!t) return null
  const total = t.approved + t.revised
  if (total < 1) return null
  return { total, line: `Hari ini Anda memutuskan ${total} laporan. Laporan baru dari admin subholding muncul di sini otomatis.` }
}

/** Kelompok percakapan: milik sendiri di kanan. */
export function commentWho(c: Pick<ShComment, 'mine' | 'authorName' | 'kind' | 'createdAt'>): string {
  return [c.mine ? 'Anda' : c.authorName, COMMENT_KIND_LABEL[c.kind] ?? 'Komentar', stampLabel(c.createdAt)].filter(Boolean).join(' · ')
}
