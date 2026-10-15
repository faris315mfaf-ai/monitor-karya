/**
 * Aturan murni laporan subholding (16 Okt 2026) — docs/zcode/KONTRAK-SUBHOLDING-16-OKT.md.
 *
 * Tanpa akses basis data, jadi aman diimpor dari server maupun klien (UI boleh
 * memakai label, batas panjang, dan aturan status yang sama dengan API).
 *
 * Status: MENUNGGU → (DISETUJUI | PERLU_PERBAIKAN). PERLU_PERBAIKAN → admin
 * mengubah → kembali MENUNGGU. Admin boleh mengubah/menarik saat MENUNGGU dan
 * mengubah saat PERLU_PERBAIKAN. DISETUJUI terkunci (kecuali Super Admin).
 */

export const SH_STATUSES = ['MENUNGGU', 'PERLU_PERBAIKAN', 'DISETUJUI'] as const
export type ShStatus = (typeof SH_STATUSES)[number]

export const SH_STATUS_LABELS: Record<ShStatus, string> = {
  MENUNGGU: 'Menunggu',
  PERLU_PERBAIKAN: 'Perlu perbaikan',
  DISETUJUI: 'Disetujui',
}

export const SH_TITLE_KINDS = ['MANAJER', 'KEPALA'] as const
export type ShTitleKind = (typeof SH_TITLE_KINDS)[number]

export const SH_TITLE_KIND_LABELS: Record<ShTitleKind, string> = {
  MANAJER: 'Manajer',
  KEPALA: 'Kepala',
}

/** KOMENTAR (supervisor), PERBAIKAN (minta perbaikan), SETUJU (catatan setuju), BALASAN (admin). */
export const SH_COMMENT_KINDS = ['KOMENTAR', 'PERBAIKAN', 'SETUJU', 'BALASAN'] as const
export type ShCommentKind = (typeof SH_COMMENT_KINDS)[number]

/** targetType Evidence untuk bukti laporan subholding. */
export const SH_EVIDENCE_TARGET = 'SUBHOLDING_REPORT'

/** targetType AuditLog untuk laporan subholding. */
export const SH_AUDIT_TARGET = 'SUBHOLDING_REPORT'

export const SH_LIMITS = {
  kegiatan: 200,
  deskripsi: 4000,
  reporterName: 120,
  reporterTitleField: 80,
  comment: 2000,
  note: 2000,
  /** Catatan "minta perbaikan" minimal sekian huruf. */
  reviseNoteMinLetters: 5,
  /** Ukuran halaman bawaan dan maksimum daftar laporan. */
  pageSize: 50,
  maxPageSize: 200,
  /** Rentang tanggal riwayat maksimum (hari). */
  maxRangeDays: 366,
} as const

export function isShStatus(v: unknown): v is ShStatus {
  return typeof v === 'string' && (SH_STATUSES as readonly string[]).includes(v)
}

export function isShTitleKind(v: unknown): v is ShTitleKind {
  return typeof v === 'string' && (SH_TITLE_KINDS as readonly string[]).includes(v)
}

/** "MANAJER" + "Proyek" → "Manajer Proyek". */
export function reporterTitle(kind: string, field: string): string {
  const label = isShTitleKind(kind) ? SH_TITLE_KIND_LABELS[kind] : kind
  return `${label} ${field}`.trim()
}

/** Admin subholding boleh mengubah isian laporan. */
export function adminCanEdit(status: string): boolean {
  return status === 'MENUNGGU' || status === 'PERLU_PERBAIKAN'
}

/** Admin subholding boleh menarik (menghapus) laporan. */
export function adminCanWithdraw(status: string): boolean {
  return status === 'MENUNGGU'
}

/** Bukti boleh ditambah/dihapus admin selama laporan masih bisa diubah. */
export function evidenceWritable(status: string): boolean {
  return adminCanEdit(status)
}

/** Supervisor hanya memutuskan laporan yang sedang menunggu. */
export function canDecide(status: string): boolean {
  return status === 'MENUNGGU'
}

/** Status setelah admin menyimpan perubahan: selalu kembali ke antrean. */
export function statusAfterAdminEdit(): ShStatus {
  return 'MENUNGGU'
}

// ------------------------------------------------------------------
// Validasi masukan
// ------------------------------------------------------------------

// Karakter kendali (kecuali tab/baris baru) dan penimpa arah teks Unicode —
// sama dengan cleanText di src/lib/security.ts, tetapi TANPA memotong: teks
// yang melebihi batas ditolak 422, bukan dipotong diam-diam.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g

export function cleanShText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL, '').trim()
}

/** Jumlah huruf (semua aksara) di teks. */
export function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length
}

export type ShReportInput = {
  kegiatan: string
  deskripsi: string
  ptId: string
  reporterName: string
  reporterTitleKind: ShTitleKind
  reporterTitleField: string
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string; field?: string }

const FIELD_LABELS: Record<string, string> = {
  kegiatan: 'Kegiatan / proyek',
  deskripsi: 'Deskripsi',
  ptId: 'PT pelaksana',
  reporterName: 'Nama pelapor',
  reporterTitleKind: 'Jabatan pelapor',
  reporterTitleField: 'Bidang jabatan pelapor',
}

/** Isian 1–5 laporan (semua wajib). Bukti diunggah sesudahnya. */
export function parseShReportInput(body: unknown): Parsed<ShReportInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Permintaan tidak valid' }
  }
  const b = body as Record<string, unknown>
  const text: Record<string, string> = {}
  const limits: Record<string, number> = {
    kegiatan: SH_LIMITS.kegiatan,
    deskripsi: SH_LIMITS.deskripsi,
    reporterName: SH_LIMITS.reporterName,
    reporterTitleField: SH_LIMITS.reporterTitleField,
    ptId: 64,
  }
  for (const [field, max] of Object.entries(limits)) {
    const v = cleanShText(b[field])
    if (!v) return { ok: false, error: `${FIELD_LABELS[field]} wajib diisi`, field }
    if (v.length > max) {
      return { ok: false, error: `${FIELD_LABELS[field]} maksimal ${max.toLocaleString('id-ID')} karakter`, field }
    }
    text[field] = v
  }
  const kind = typeof b.reporterTitleKind === 'string' ? b.reporterTitleKind.trim().toUpperCase() : ''
  if (!isShTitleKind(kind)) {
    return { ok: false, error: 'Jabatan pelapor harus Manajer atau Kepala', field: 'reporterTitleKind' }
  }
  return {
    ok: true,
    data: {
      kegiatan: text.kegiatan,
      deskripsi: text.deskripsi,
      ptId: text.ptId,
      reporterName: text.reporterName,
      reporterTitleKind: kind,
      reporterTitleField: text.reporterTitleField,
    },
  }
}

export type ShDecisionInput = { action: 'approve' | 'revise'; note: string }

export function parseShDecision(body: unknown): Parsed<ShDecisionInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Permintaan tidak valid' }
  }
  const b = body as Record<string, unknown>
  const action = b.action
  if (action !== 'approve' && action !== 'revise') {
    return { ok: false, error: 'Aksi harus approve atau revise', field: 'action' }
  }
  const note = cleanShText(b.note)
  if (note.length > SH_LIMITS.note) {
    return { ok: false, error: `Catatan maksimal ${SH_LIMITS.note.toLocaleString('id-ID')} karakter`, field: 'note' }
  }
  if (action === 'revise' && letterCount(note) < SH_LIMITS.reviseNoteMinLetters) {
    return {
      ok: false,
      error: `Tulis catatan perbaikan minimal ${SH_LIMITS.reviseNoteMinLetters} huruf`,
      field: 'note',
    }
  }
  return { ok: true, data: { action, note } }
}

export function parseShComment(body: unknown): Parsed<{ body: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Permintaan tidak valid' }
  }
  const text = cleanShText((body as Record<string, unknown>).body)
  if (!text) return { ok: false, error: 'Komentar wajib diisi', field: 'body' }
  if (text.length > SH_LIMITS.comment) {
    return { ok: false, error: `Komentar maksimal ${SH_LIMITS.comment.toLocaleString('id-ID')} karakter`, field: 'body' }
  }
  return { ok: true, data: { body: text } }
}
