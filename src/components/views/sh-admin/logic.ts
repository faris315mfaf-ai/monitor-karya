/**
 * Logika murni layar Admin subholding (tanpa React): validasi isian, alur simpan
 * laporan → unggah bukti, saringan riwayat, dan CSV. Dipisah dari komponen agar
 * bisa diuji di Node (tests/ui/sh-admin-*.test.ts).
 *
 * Kontrak API: docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md.
 */

import type { Status } from '@/components/mk/core'
import type {
  ShComment,
  ShCommentKind,
  ShInbox,
  ShInboxItem,
  ShReminder,
  ShReport,
  ShReporter,
  ShStatus,
  ShTitleKind,
} from './types'

/* ---------- Status & label ---------- */

/** Status laporan → StatusBadge (warna + ikon + kata). */
export const SH_STATUS_META: Record<ShStatus, { status: Status; label: string }> = {
  MENUNGGU: { status: 'info', label: 'Menunggu tinjauan' },
  PERLU_PERBAIKAN: { status: 'risk', label: 'Perlu perbaikan' },
  DISETUJUI: { status: 'done', label: 'Disetujui' },
}

export const SH_STATUSES: ShStatus[] = ['MENUNGGU', 'PERLU_PERBAIKAN', 'DISETUJUI']

export const TITLE_KIND_LABEL: Record<ShTitleKind, string> = { MANAJER: 'Manajer', KEPALA: 'Kepala' }

/** Pratinjau jabatan seperti yang tersimpan: "Manajer Proyek". */
export function titleLabel(kind: ShTitleKind, field: string): string {
  const f = field.replace(/\s+/g, ' ').trim()
  return f ? `${TITLE_KIND_LABEL[kind]} ${f}` : TITLE_KIND_LABEL[kind]
}

/* ---------- Batas isian (selaras server) ---------- */

export const LIMITS = { kegiatan: 200, deskripsi: 4000, reporterName: 120, titleField: 80, linkName: 200, linkUrl: 2000 }
export const MAX_BUKTI_BYTES = 20 * 1024 * 1024

/** Jenis berkas yang diterima POST /api/evidence/upload. */
export const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]
export const ACCEPT_DOCS = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*'

/**
 * Kelas tambahan untuk input/textarea/select: teks 17px (token body-lg) di ponsel
 * dan layar sentuh, agar Safari iOS tidak memperbesar halaman saat fokus (<16px).
 * Bertanda penting karena gaya .mk-input tidak berlapis dan menang atas utilitas.
 */
export const TOUCH_TEXT = 'max-sm:text-body-lg! pointer-coarse:text-body-lg!'
/** Sama untuk SearchField (kelasnya terpasang di pembungkus, bukan di input). */
export const TOUCH_TEXT_SEARCH = 'max-sm:[&_input]:text-body-lg! pointer-coarse:[&_input]:text-body-lg!'

/* ---------- Isian ---------- */

export type ShForm = {
  kegiatan: string
  deskripsi: string
  ptId: string
  reporterName: string
  titleKind: ShTitleKind
  titleField: string
}

export const EMPTY_FORM: ShForm = { kegiatan: '', deskripsi: '', ptId: '', reporterName: '', titleKind: 'MANAJER', titleField: '' }

export type FormField = keyof ShForm | 'bukti'
export type FormErrors = Partial<Record<FormField, string>>

/**
 * Semua isian bertanda * wajib. `buktiCount` = bukti yang sudah melekat (mode ubah)
 * ditambah bukti yang dipilih dan menunggu unggah.
 */
export function validateForm(form: ShForm, buktiCount: number): FormErrors {
  const e: FormErrors = {}
  const kegiatan = form.kegiatan.trim()
  const deskripsi = form.deskripsi.trim()
  const nama = form.reporterName.trim()
  const bidang = form.titleField.trim()
  if (!kegiatan) e.kegiatan = 'Isi nama kegiatan atau proyek.'
  else if (kegiatan.length > LIMITS.kegiatan) e.kegiatan = `Kegiatan paling banyak ${LIMITS.kegiatan} karakter.`
  if (!deskripsi) e.deskripsi = 'Isi deskripsi kegiatan.'
  else if (deskripsi.length > LIMITS.deskripsi) e.deskripsi = `Deskripsi paling banyak ${LIMITS.deskripsi} karakter.`
  if (!form.ptId) e.ptId = 'Pilih PT pelaksana.'
  if (!nama) e.reporterName = 'Isi nama pelapor.'
  else if (nama.length > LIMITS.reporterName) e.reporterName = `Nama paling banyak ${LIMITS.reporterName} karakter.`
  if (form.titleKind !== 'MANAJER' && form.titleKind !== 'KEPALA') e.titleKind = 'Pilih Manajer atau Kepala.'
  if (!bidang) e.titleField = 'Isi bidang jabatan, mis. Proyek.'
  else if (bidang.length > LIMITS.titleField) e.titleField = `Bidang paling banyak ${LIMITS.titleField} karakter.`
  if (buktiCount < 1) e.bukti = 'Lampirkan minimal satu bukti: foto, dokumen, atau tautan.'
  return e
}

/** Isian yang dikirim ke POST/PATCH /api/sh/reports (isian 1–5, sudah dirapikan). */
export function formPayload(form: ShForm) {
  return {
    kegiatan: form.kegiatan.trim(),
    deskripsi: form.deskripsi.trim(),
    ptId: form.ptId,
    reporterName: form.reporterName.replace(/\s+/g, ' ').trim(),
    reporterTitleKind: form.titleKind,
    reporterTitleField: form.titleField.replace(/\s+/g, ' ').trim(),
  }
}

export function formFromReport(r: ShReport): ShForm {
  return {
    kegiatan: r.kegiatan,
    deskripsi: r.deskripsi,
    ptId: r.ptId,
    reporterName: r.reporterName,
    titleKind: r.reporterTitleKind === 'KEPALA' ? 'KEPALA' : 'MANAJER',
    titleField: r.reporterTitleField,
  }
}

/* ---------- Bukti yang dipilih sebelum simpan ---------- */

export type PendingBukti =
  | {
      key: string
      kind: 'file'
      file: File
      name: string
      size: number
      isImage: boolean
      /** true selama foto masih dikompres di peramban (belum boleh diunggah/disimpan ke draf). */
      compressing?: boolean
    }
  | { key: string; kind: 'link'; name: string; url: string }

let seq = 0
/** Kunci lokal; juga dipakai sebagai dasar Idempotency-Key unggahan (8–64 karakter). */
export function newKey(prefix = 'shb'): string {
  seq += 1
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `${prefix}-${rnd.slice(0, 24)}-${seq}`
}

/** Galat berkas sebelum dipilih (ukuran/jenis); null bila boleh. */
export function validateFile(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return `${file.name} kosong.`
  if (file.size > MAX_BUKTI_BYTES) return `${file.name} melebihi 20 MB.`
  if (!ALLOWED_MIME.includes(file.type)) return `${file.name}: jenis berkas tidak didukung. Gunakan foto, PDF, dokumen Office, atau teks.`
  return null
}

/** Batas berkas foto ASLI sebelum dikompres; hasil kompres tetap wajib ≤ 20 MB. */
export const MAX_RAW_PHOTO_BYTES = 60 * 1024 * 1024

/**
 * Galat saat memilih. Foto yang akan dikompres boleh melebihi 20 MB (hasilnya
 * diperiksa lagi dengan `validateFile` setelah dikompres), asal ≤ 60 MB.
 */
export function validatePick(file: { name: string; size: number; type: string }, willCompress: boolean): string | null {
  if (!willCompress || file.size <= MAX_BUKTI_BYTES) return validateFile(file)
  if (file.size > MAX_RAW_PHOTO_BYTES) return `${file.name} melebihi 20 MB.`
  // Ukuran diperiksa ulang setelah kompres; di sini cukup jenis berkasnya.
  return validateFile({ name: file.name, type: file.type, size: MAX_BUKTI_BYTES })
}

/** Bukti berkas; `key` diteruskan saat mengganti berkas asli dengan hasil kompres. */
export function fileBukti(file: File, key: string = newKey()): Extract<PendingBukti, { kind: 'file' }> {
  return { key, kind: 'file', file, name: file.name, size: file.size, isImage: file.type.startsWith('image/') }
}

/** Ada foto yang masih dikompres → tombol kirim/unggah menunggu. */
export function anyCompressing(items: PendingBukti[]): boolean {
  return items.some((b) => b.kind === 'file' && !!b.compressing)
}

/** Galat tautan; null bila boleh. */
export function validateLink(name: string, url: string): string | null {
  const n = name.trim()
  const u = url.trim()
  if (!u) return 'Isi alamat tautan.'
  if (u.length > LIMITS.linkUrl || !/^https?:\/\/\S+$/i.test(u)) return 'Alamat tautan harus diawali http:// atau https://.'
  if (n.length > LIMITS.linkName) return `Nama tautan paling banyak ${LIMITS.linkName} karakter.`
  return null
}

export function linkBukti(name: string, url: string): PendingBukti {
  const u = url.trim()
  let fallback = u
  try {
    fallback = new URL(u).hostname || u
  } catch {}
  return { key: newKey(), kind: 'link', name: name.trim() || fallback, url: u }
}

/* ---------- Pemanggil API ---------- */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type CallResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

const OFFLINE = 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.'

export async function callJson<T>(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<CallResult<T>> {
  let res: Response
  try {
    res = await fetchImpl(url, init)
  } catch {
    return { ok: false, status: 0, error: OFFLINE }
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) return { ok: false, status: res.status, error: json?.error || `Permintaan belum berhasil (HTTP ${res.status}).` }
  return { ok: true, data: json }
}

function jsonInit(method: string, body: unknown, extra?: Record<string, string>): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) }
}

/** Unggah satu bukti untuk laporan; galat dikembalikan sebagai teks. */
export async function uploadOne(fetchImpl: FetchLike, reportId: string, item: PendingBukti): Promise<string | null> {
  if (item.kind === 'link') {
    const r = await callJson(fetchImpl, '/api/evidence', jsonInit('POST', {
      targetType: 'SUBHOLDING_REPORT',
      targetId: reportId,
      fileName: item.name,
      url: item.url,
    }))
    return r.ok ? null : r.error
  }
  const fd = new FormData()
  fd.set('file', item.file)
  fd.set('targetType', 'SUBHOLDING_REPORT')
  fd.set('targetId', reportId)
  const r = await callJson(fetchImpl, '/api/evidence/upload', {
    method: 'POST',
    body: fd,
    headers: { 'Idempotency-Key': `up-${item.key}`.slice(0, 64) },
  })
  return r.ok ? null : r.error
}

export type UploadOutcome = { uploaded: PendingBukti[]; failed: { item: PendingBukti; error: string }[] }

/* ---------- Antrean unggah (konkurensi terbatas) ---------- */

/** Unggahan berjalan paling banyak 2 sekaligus: cukup cepat tanpa membuat ponsel tersendat. */
export const UPLOAD_CONCURRENCY = 2

export type PoolResult<R> = { ok: true; value: R } | { ok: false; error: unknown }
export type PoolEvent<R> =
  | { index: number; phase: 'mulai' }
  | { index: number; phase: 'selesai'; value: R }
  | { index: number; phase: 'gagal'; error: unknown }

/**
 * Jalankan `worker` untuk tiap item dengan paling banyak `limit` sekaligus.
 * Item dimulai sesuai urutan masukan; galat satu item tidak menghentikan yang
 * lain. Hasil dikembalikan sesuai urutan masukan (bukan urutan selesai).
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R> | R,
  onStatus?: (event: PoolEvent<R>) => void
): Promise<PoolResult<R>[]> {
  const n = items.length
  const results: PoolResult<R>[] = new Array(n)
  const lanes = Math.min(n, Math.max(1, Math.floor(limit) || 1))
  const emit = (e: PoolEvent<R>) => {
    try {
      onStatus?.(e)
    } catch {}
  }
  let next = 0
  async function lane() {
    while (next < n) {
      const index = next
      next += 1
      emit({ index, phase: 'mulai' })
      try {
        const value = await worker(items[index], index)
        results[index] = { ok: true, value }
        emit({ index, phase: 'selesai', value })
      } catch (error) {
        results[index] = { ok: false, error }
        emit({ index, phase: 'gagal', error })
      }
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => lane()))
  return results
}

/** Status per bukti di layar. */
export type BuktiStatus = 'menunggu' | 'mengompres' | 'mengunggah' | 'terkirim' | 'gagal'
export type BuktiState = { status: BuktiStatus; error?: string }

export const BUKTI_STATUS_TEXT: Record<BuktiStatus, string> = {
  menunggu: 'Menunggu…',
  mengompres: 'Mengompres…',
  mengunggah: 'Mengunggah…',
  terkirim: 'Terkirim',
  gagal: 'Gagal',
}

/** Teks & nada (kelas mk-text--…) untuk satu status bukti. */
export function buktiStatusView(s: BuktiState): { tone: 'info' | 'done' | 'late' | 'neutral'; text: string } {
  if (s.status === 'gagal') return { tone: 'late', text: s.error ? `Gagal: ${s.error}` : BUKTI_STATUS_TEXT.gagal }
  if (s.status === 'terkirim') return { tone: 'done', text: BUKTI_STATUS_TEXT.terkirim }
  if (s.status === 'menunggu') return { tone: 'neutral', text: BUKTI_STATUS_TEXT.menunggu }
  return { tone: 'info', text: BUKTI_STATUS_TEXT[s.status] }
}

const UPLOAD_FAILED = 'Bukti gagal diunggah. Coba lagi.'

export type UploadOptions = {
  onProgress?: (done: number, total: number) => void
  onStatus?: (key: string, state: BuktiState) => void
  limit?: number
}

/**
 * Unggah bukti ke satu laporan, paling banyak 2 sekaligus. Galat satu bukti
 * tidak menghentikan sisanya. Idempotency-Key per bukti (`up-${key}`) tetap
 * sama saat dicoba ulang, jadi ulangan tidak membuat bukti ganda.
 * `uploaded`/`failed` mengikuti urutan masukan.
 */
export async function uploadAll(
  fetchImpl: FetchLike,
  reportId: string,
  items: PendingBukti[],
  opts: UploadOptions = {}
): Promise<UploadOutcome> {
  const { onProgress, onStatus } = opts
  for (const item of items) onStatus?.(item.key, { status: 'menunggu' })
  let done = 0
  const results = await runPool(items, opts.limit ?? UPLOAD_CONCURRENCY, async (item) => {
    onStatus?.(item.key, { status: 'mengunggah' })
    let err: string | null
    try {
      err = await uploadOne(fetchImpl, reportId, item)
    } catch {
      err = UPLOAD_FAILED
    }
    onStatus?.(item.key, err ? { status: 'gagal', error: err } : { status: 'terkirim' })
    done += 1
    onProgress?.(done, items.length)
    return err
  })
  const out: UploadOutcome = { uploaded: [], failed: [] }
  results.forEach((r, i) => {
    const err = r.ok ? r.value : UPLOAD_FAILED
    if (err) out.failed.push({ item: items[i], error: err })
    else out.uploaded.push(items[i])
  })
  return out
}

export type SubmitResult =
  | { ok: false; error: string }
  | ({ ok: true; report: ShReport } & UploadOutcome)

/**
 * Simpan laporan (POST baru / PATCH ubah) lalu unggah bukti yang sudah dipilih.
 * Laporan tetap tersimpan walau sebagian bukti gagal — hasil `failed` dipakai
 * layar untuk menawarkan unggah ulang ke laporan yang sama.
 */
export async function submitReport(opts: {
  fetchImpl: FetchLike
  form: ShForm
  bukti: PendingBukti[]
  editId?: string | null
  idempotencyKey?: string
  onProgress?: (done: number, total: number) => void
  onStatus?: (key: string, state: BuktiState) => void
}): Promise<SubmitResult> {
  const body = formPayload(opts.form)
  const saved = opts.editId
    ? await callJson<{ report?: ShReport }>(opts.fetchImpl, `/api/sh/reports/${encodeURIComponent(opts.editId)}`, jsonInit('PATCH', body))
    : await callJson<{ report?: ShReport }>(
        opts.fetchImpl,
        '/api/sh/reports',
        jsonInit('POST', body, opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined)
      )
  if (!saved.ok) return { ok: false, error: saved.error }
  const report = saved.data.report
  if (!report?.id) return { ok: false, error: 'Balasan server tidak memuat laporan. Muat ulang lalu periksa daftar.' }
  const up = await uploadAll(opts.fetchImpl, report.id, opts.bukti, { onProgress: opts.onProgress, onStatus: opts.onStatus })
  return { ok: true, report, ...up }
}

/* ---------- Tanggal WIB & periode ---------- */

const WIB_MS = 7 * 3600 * 1000

/** "YYYY-MM-DD" kalender WIB. */
export function wibDateKey(d: Date | string): string {
  const t = typeof d === 'string' ? Date.parse(d) : d.getTime()
  return new Date(t + WIB_MS).toISOString().slice(0, 10)
}

export function shiftDateKey(key: string, days: number): string {
  const t = Date.parse(key + 'T00:00:00Z') + days * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

export type Period = 'today' | '7' | '30'

/** Rentang inklusif: hari ini = 1 hari, 7 hari = hari ini + 6 hari sebelumnya. */
export function periodRange(p: Period, now: Date = new Date()): { from: string; to: string } {
  const to = wibDateKey(now)
  const n = p === 'today' ? 1 : Number(p)
  return { from: shiftDateKey(to, -(n - 1)), to }
}

/* ---------- Daftar & riwayat ---------- */

export type HistoryFilter = { ptId?: string; status?: ShStatus | ''; q?: string }

export function filterReports(items: ShReport[], f: HistoryFilter): ShReport[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return items
    .filter((r) => !f.ptId || r.ptId === f.ptId)
    .filter((r) => !f.status || r.status === f.status)
    .filter((r) => !q || `${r.kegiatan} ${r.deskripsi} ${r.reporterName} ${r.reporterTitle} ${r.ptName}`.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
}

function sortKey(r: ShReport): string {
  return r.submittedAt ?? r.reportDate
}

/** PT (milik subholding) yang sudah punya laporan di daftar; dipakai "x dari y PT melapor". */
export function reportedPtCount(items: Pick<ShReport, 'ptId'>[], pts: { id: string }[]): number {
  const own = new Set(pts.map((p) => p.id))
  return new Set(items.map((r) => r.ptId).filter((id) => own.has(id))).size
}

export function countByStatus(items: ShReport[]): Record<ShStatus, number> {
  const c: Record<ShStatus, number> = { MENUNGGU: 0, PERLU_PERBAIKAN: 0, DISETUJUI: 0 }
  for (const r of items) if (r.status in c) c[r.status] += 1
  return c
}

/** Komentar terakhir dari supervisor (bukan balasan admin sendiri). */
export function lastSupervisorComment(r: Pick<ShReport, 'comments'>): ShComment | null {
  const list = (r.comments ?? []).filter((c) => !c.mine && c.kind !== 'BALASAN')
  if (!list.length) return null
  return list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[list.length - 1]
}

/** Saran pelapor: tersimpan lokal lebih dulu, lalu dari server; unik, paling banyak 8. */
export function reporterSuggestions(server: ShReporter[], remembered: ShReporter | null): ShReporter[] {
  const seen = new Set<string>()
  const out: ShReporter[] = []
  for (const r of [...(remembered ? [remembered] : []), ...(server ?? [])]) {
    const name = r?.name?.trim()
    if (!name) continue
    const k = `${name.toLowerCase()}|${r.titleKind}|${(r.titleField ?? '').trim().toLowerCase()}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ name, titleKind: r.titleKind === 'KEPALA' ? 'KEPALA' : 'MANAJER', titleField: (r.titleField ?? '').trim() })
    if (out.length >= 8) break
  }
  return out
}

/* ---------- CSV ---------- */

/** Satu sel CSV: dikutip, kutip digandakan, dan dijaga dari injeksi rumus spreadsheet. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

const CSV_HEAD = [
  'Tanggal laporan',
  'Waktu kirim (WIB)',
  'Kegiatan / proyek',
  'Deskripsi',
  'PT pelaksana',
  'Nama pelapor',
  'Jabatan pelapor',
  'Jumlah bukti',
  'Status',
  'Ditinjau oleh',
  'Waktu tinjau (WIB)',
]

function wibStamp(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t + WIB_MS).toISOString().slice(0, 16).replace('T', ' ')
}

/** CSV (pemisah koma, CRLF, BOM UTF-8 agar Excel membaca huruf Indonesia dengan benar). */
export function historyCsv(items: ShReport[]): string {
  const rows = items.map((r) => [
    r.reportDate,
    wibStamp(r.submittedAt),
    r.kegiatan,
    r.deskripsi,
    r.ptName,
    r.reporterName,
    r.reporterTitle || titleLabel(r.reporterTitleKind, r.reporterTitleField),
    r.evidenceCount,
    SH_STATUS_META[r.status]?.label ?? r.status,
    r.decidedByName ?? '',
    wibStamp(r.decidedAt),
  ])
  return '﻿' + [CSV_HEAD, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function csvFileName(from: string, to: string): string {
  return from === to ? `riwayat-laporan-${from}.csv` : `riwayat-laporan-${from}_${to}.csv`
}

/* ---------- Kotak masuk ---------- */

export type InboxKind = 'PERBAIKAN' | 'SETUJU' | 'KOMENTAR' | 'BALASAN' | 'PENGINGAT'

export const INBOX_KIND_META: Record<InboxKind, { status: Status; label: string }> = {
  PERBAIKAN: { status: 'risk', label: 'Perlu perbaikan' },
  SETUJU: { status: 'done', label: 'Disetujui' },
  KOMENTAR: { status: 'info', label: 'Komentar' },
  BALASAN: { status: 'neutral', label: 'Balasan' },
  PENGINGAT: { status: 'neutral', label: 'Pengingat' },
}

export type InboxEntry =
  | { key: string; type: 'pesan'; kind: ShCommentKind; createdAt: string; unread: boolean; item: ShInboxItem }
  | { key: string; type: 'pengingat'; kind: 'PENGINGAT'; createdAt: string; unread: false; reminder: ShReminder }

/** Pesan + pengingat dalam satu daftar, terbaru di atas. */
export function inboxEntries(inbox: Pick<ShInbox, 'items' | 'reminders'>): InboxEntry[] {
  const a: InboxEntry[] = (inbox.items ?? []).map((item) => ({
    key: 'm:' + item.id,
    type: 'pesan',
    kind: item.kind,
    createdAt: item.createdAt,
    unread: !!item.unread,
    item,
  }))
  const b: InboxEntry[] = (inbox.reminders ?? []).map((reminder) => ({
    key: 'r:' + reminder.id,
    type: 'pengingat',
    kind: 'PENGINGAT',
    createdAt: reminder.createdAt,
    unread: false,
    reminder,
  }))
  return [...a, ...b].sort((x, y) => y.createdAt.localeCompare(x.createdAt))
}

/**
 * Rincian satu laporan untuk percakapan. Kontrak belum memuat GET per id, jadi:
 * coba /api/sh/reports/:id; bila tidak ada, cari lewat daftar 30 hari dengan
 * kata kunci kegiatan. Null bila tetap tidak ditemukan.
 */
export async function loadReportDetail(
  fetchImpl: FetchLike,
  reportId: string,
  hint?: { kegiatan?: string; submittedAt?: string | null },
  now: Date = new Date()
): Promise<ShReport | null> {
  const direct = await callJson<{ report?: ShReport }>(fetchImpl, `/api/sh/reports/${encodeURIComponent(reportId)}`)
  if (direct.ok && direct.data.report?.id === reportId) return direct.data.report
  const to = wibDateKey(now)
  const base = hint?.submittedAt ? wibDateKey(hint.submittedAt) : to
  const from = shiftDateKey(base < to ? base : to, -30)
  const qs = new URLSearchParams({ from, to, pageSize: '100' })
  if (hint?.kegiatan) qs.set('q', hint.kegiatan.slice(0, 80))
  const list = await callJson<{ items?: ShReport[] }>(fetchImpl, `/api/sh/reports?${qs.toString()}`)
  if (!list.ok) return null
  return (list.data.items ?? []).find((r) => r.id === reportId) ?? null
}

/* ---------- Ingat nama & jabatan (kenyamanan per peramban) ---------- */

const REMEMBER_KEY = 'mk-sh-pelapor'

export function loadRemembered(): ShReporter | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(REMEMBER_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<ShReporter>
    if (!v?.name || (v.titleKind !== 'MANAJER' && v.titleKind !== 'KEPALA')) return null
    return { name: String(v.name), titleKind: v.titleKind, titleField: String(v.titleField ?? '') }
  } catch {
    return null
  }
}

export function saveRemembered(r: ShReporter | null) {
  try {
    if (typeof window === 'undefined') return
    if (r) window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(r))
    else window.localStorage.removeItem(REMEMBER_KEY)
  } catch {}
}

/* ---------- Perpindahan Kotak masuk → Dashboard mode ubah ---------- */

let pendingEdit: { id: string; report?: ShReport } | null = null

/** Dipanggil Kotak masuk sebelum pindah tab; Dashboard membacanya saat dipasang. */
export function requestShEdit(id: string, report?: ShReport | null) {
  pendingEdit = { id, report: report ?? undefined }
}
export function peekShEdit() {
  return pendingEdit
}
export function clearShEdit() {
  pendingEdit = null
}
