/**
 * [F2-DIREKTUR] Aturan & label bersama fitur Direktur/Manajemen (klien dan server):
 * tanggapan laporan mingguan, tinjauan proyek, persetujuan materi/anggaran/cuti,
 * pencarian. Tanpa akses basis data supaya aman diimpor komponen klien.
 */

/** Peran pengawas yang membaca, menandai, dan menanggapi laporan mingguan divisi. */
export const WEEKLY_READER_ROLES = ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN'] as const

/** Peran yang menandai proyek "sudah ditinjau" dan mengirim catatan ke PIC dari detail proyek. */
export const PROJECT_OVERSEER_ROLES = ['MANAJEMEN', 'DIREKTUR_ENTITAS', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI'] as const

/** Peran yang mengajukan persetujuan materi/anggaran/cuti. */
export const APPROVAL_REQUESTER_ROLES = ['KEPALA_DIVISI', 'PIC_PROYEK'] as const

/**
 * Peran pemutus persetujuan. Direktur entitas hanya untuk PT dalam cakupannya;
 * peran lain untuk seluruh grup. Pengaju tidak pernah memutuskan permintaannya sendiri.
 */
export const APPROVAL_DECIDER_ROLES = ['DIREKTUR_ENTITAS', 'MANAJEMEN', 'DIREKTUR_SDM_GA', 'SUPERADMIN', 'TI'] as const

export const isWeeklyReader = (role: string) => (WEEKLY_READER_ROLES as readonly string[]).includes(role)
export const isProjectOverseer = (role: string) => (PROJECT_OVERSEER_ROLES as readonly string[]).includes(role)
export const isApprovalRequester = (role: string) => (APPROVAL_REQUESTER_ROLES as readonly string[]).includes(role)
export const isApprovalDecider = (role: string) => (APPROVAL_DECIDER_ROLES as readonly string[]).includes(role)

export const APPROVAL_TYPES = ['MATERI', 'ANGGARAN', 'CUTI'] as const
export type ApprovalType = (typeof APPROVAL_TYPES)[number]

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  MATERI: 'Materi',
  ANGGARAN: 'Anggaran',
  CUTI: 'Cuti',
}

export const APPROVAL_STATUSES = ['DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'DITARIK'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  DIAJUKAN: 'Menunggu keputusan',
  DISETUJUI: 'Disetujui',
  DITOLAK: 'Ditolak',
  DITARIK: 'Ditarik',
}

/** Batas masukan (dipakai formulir & API). */
export const APPROVAL_LIMITS = {
  title: 160,
  description: 2000,
  note: 1000,
  /** Rp 10 triliun — jauh di atas anggaran proyek mana pun, di bawah batas aman Number. */
  amount: 10_000_000_000_000,
  /** Cuti paling panjang dalam satu permintaan (hari kalender). */
  leaveDays: 30,
} as const

/** Lama "Urungkan" setelah keputusan, tanggapan, atau tinjauan (menit). */
export const UNDO_WINDOW_MINUTES = 15

export const COMMENT_MAX = 2000

/** "Rp 48,5 jt" untuk ringkas di baris, "Rp 48.500.000" lengkap di detail. */
export function formatAmountShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}

/** Hasil pencarian header (⌘K) — /api/search. */
export type SearchKind = 'project' | 'division' | 'user' | 'weekly'

export type SearchHit = {
  kind: SearchKind
  id: string
  title: string
  sub: string
  /** Tab tujuan bila dipilih; null = tidak ada modul yang cocok untuk peran ini. */
  tab: string | null
  /** Proyek: status turunan (on/risk/late/done/neutral). */
  status?: string
  /** Laporan mingguan: divisi pemiliknya. */
  divisionId?: string
  /** Orang: kontak, hanya untuk peran yang boleh menghubungi (pengawas & Admin PT). */
  email?: string | null
  phone?: string | null
}

export type SearchResult = { q: string; hits: SearchHit[] }

/** Event yang dikirim palet saat hasil dipilih; layar yang terbuka boleh menanganinya. */
export const SEARCH_SELECT_EVENT = 'mk:cari-pilih'
export const SEARCH_OPEN_EVENT = 'mk:cari-buka'
