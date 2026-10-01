// Shared constants and lookup maps for the monitoring app

export const ROLE_LABELS: Record<string, string> = {
  ADMIN_PT: 'Admin PT',
  KEPALA_DIVISI: 'Kepala Divisi',
  PIC_PROYEK: 'Manager / PIC Proyek',
  DIREKTUR_ENTITAS: 'Direktur Entitas',
  DIREKTUR_SDM_GA: 'Direksi Holding (SDM & GA)',
  MANAJEMEN: 'Manajemen',
  TI: 'Tim TI',
  SUPERADMIN: 'Super Admin',
  AUDITOR: 'Auditor',
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN_PT: 'Input & ubah data entitas; unggah bukti; ajukan proyek',
  KEPALA_DIVISI: 'Lihat isian divisinya; menyetujui laporan mingguan',
  PIC_PROYEK: 'Melaporkan kemajuan proyek yang dipegangnya; mengajukan proyek baru',
  DIREKTUR_ENTITAS: 'Lihat semua data di cakupannya; buat eskalasi',
  DIREKTUR_SDM_GA: 'Semua hak Direktur + kelola daftar induk grup',
  MANAJEMEN: 'Read-only seluruh data + memutuskan eskalasi',
  TI: 'Kelola akun & assignment; eksekusi buka kunci',
  SUPERADMIN: 'Kelola perusahaan, posisi, akun, dan kata sandi seluruh grup',
  AUDITOR: 'Read-only seluruh data + audit trail',
}

/**
 * Posisi yang bisa ditambahkan Super Admin ke sebuah perusahaan (10 Sep 2026),
 * dan posisi tingkat holding yang tidak terpaku pada satu perusahaan.
 */
/**
 * Penanda di `Project.approvedByName` untuk proyek tahap awal yang didaftarkan
 * tanpa melewati rantai persetujuan (1 Okt 2026). Disimpan sebagai teks supaya
 * tetap terbaca di mana pun nama penyetuju ditampilkan.
 */
export const NO_APPROVAL_LABEL = 'Tanpa persetujuan (tahap awal)'

export const POSITION_OPTIONS: { role: string; label: string; hint: string }[] = [
  { role: 'ADMIN_PT', label: 'Admin PT', hint: 'Mengisi & meneruskan laporan perusahaan' },
  { role: 'KEPALA_DIVISI', label: 'Kepala Divisi', hint: 'Capaian mingguan divisinya' },
  { role: 'PIC_PROYEK', label: 'Manager Proyek', hint: 'Laporan harian proyek yang dipegang' },
  { role: 'DIREKTUR_ENTITAS', label: 'Direktur Perusahaan', hint: 'Mengawasi & menyetujui di perusahaannya' },
]

export const HOLDING_POSITION_OPTIONS: { role: string; label: string; hint: string }[] = [
  { role: 'MANAJEMEN', label: 'Manajemen Holding', hint: 'Membaca seluruh grup, memutuskan eskalasi' },
  { role: 'DIREKTUR_SDM_GA', label: 'Direksi Holding (SDM & GA)', hint: 'Pemilik proses, menyetujui buka kunci' },
  { role: 'SUPERADMIN', label: 'Super Admin', hint: 'Kelola perusahaan & akun seluruh grup' },
  { role: 'TI', label: 'Tim TI', hint: 'Konsol sistem & akses' },
  { role: 'AUDITOR', label: 'Auditor', hint: 'Baca-saja + jejak audit' },
]

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  HOLDING: 'Holding',
  SUB_HOLDING: 'Sub-Holding',
  SECTOR: 'Sektor',
  REGION: 'Wilayah',
  PT: 'PT',
  UNIT: 'Unit',
}

export const ENTITY_TYPE_COLORS: Record<string, string> = {
  HOLDING: 'from-blue-600 to-indigo-600',
  SUB_HOLDING: 'from-blue-500 to-cyan-500',
  SECTOR: 'from-cyan-500 to-teal-500',
  REGION: 'from-sky-400 to-blue-400',
  PT: 'from-blue-400 to-sky-300',
  UNIT: 'from-slate-400 to-slate-300',
}

export const PROJECT_PHASE_LABELS: Record<string, string> = {
  INISIASI: 'Inisiasi',
  PERENCANAAN: 'Perencanaan',
  PELAKSANAAN: 'Pelaksanaan',
  PENYELESAIAN: 'Penyelesaian',
}

export const PROJECT_LIFECYCLE_LABELS: Record<string, string> = {
  DIUSULKAN: 'Diusulkan',
  AKTIF: 'Aktif',
  DITOLAK: 'Ditolak',
  DITUTUP: 'Ditutup',
  DIARSIPKAN: 'Diarsipkan',
}

/** Empat kategori urgensi task harian (7 Sep 2026). */
export const URGENCY_META: Record<string, { label: string; bg: string; text: string; dot: string; hint: string }> = {
  RENDAH: { label: 'Rendah', bg: 'bg-slate-500/15', text: 'text-slate-700 dark:text-slate-300', dot: 'bg-slate-400', hint: 'Bisa menunggu' },
  SEDANG: { label: 'Sedang', bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500', hint: 'Sesuai jadwal' },
  TINGGI: { label: 'Tinggi', bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', hint: 'Prioritaskan hari ini' },
  KRITIS: { label: 'Kritis', bg: 'bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500', hint: 'Menghambat proyek' },
}

/** Kadens laporan kemajuan proyek. */
export const CADENCE_LABELS: Record<string, string> = {
  HARIAN: 'Harian',
  MINGGUAN: 'Mingguan',
  BULANAN: 'Bulanan',
}

/** Nama hari ISO (indeks 0 = Senin) untuk papan mingguan (8 Sep 2026). */
export const DAY_LABELS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
export const DAY_SHORT_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/** Skala prioritas untuk penyaring dashboard: urgensi task dan prioritas item divisi. */
export const ACTIVITY_PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Semua prioritas' },
  { value: 'KRITIS', label: 'Kritis' },
  { value: 'TINGGI', label: 'Tinggi' },
  { value: 'SEDANG', label: 'Sedang' },
  { value: 'RENDAH', label: 'Rendah' },
]

/** Template notifikasi dalam aplikasi. */
export const NOTIFICATION_TEMPLATE_LABELS: Record<string, string> = {
  PENGINGAT_MINGGUAN_DIVISI: 'Pengingat laporan mingguan divisi',
}

/** Nama slot di rantai persetujuan proyek; slot Manajemen = satu tingkat di atas Direktur. */
export const PROJECT_APPROVER_LABELS: Record<string, string> = {
  ADMIN_PT: 'Admin PT',
  DIREKTUR_ENTITAS: 'Direktur Entitas',
  DIREKTUR_SDM_GA: 'Direksi Holding',
  MANAJEMEN: 'Manajemen Holding',
}

// Daily report status colors and labels
export const DAILY_STATUS_META: Record<string, { label: string; color: string; bg: string; text: string; dot: string }> = {
  SELESAI: { label: 'Selesai', color: 'emerald', bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  ON_PROGRESS: { label: 'Berjalan', color: 'blue', bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  TERKENDALA: { label: 'Terkendala', color: 'amber', bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  MENUNGGU_KEPUTUSAN: { label: 'Menunggu Keputusan', color: 'violet', bg: 'bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  TIDAK_ADA_PERUBAHAN: { label: 'Tidak Ada Perubahan', color: 'slate', bg: 'bg-slate-500/15', text: 'text-slate-700 dark:text-slate-300', dot: 'bg-slate-500' },
}

export const WEEKLY_STATUS_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  SELESAI: { label: 'Selesai', bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  ON_PROGRESS: { label: 'Berjalan', bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  BELUM_MULAI: { label: 'Belum Mulai', bg: 'bg-slate-500/15', text: 'text-slate-700 dark:text-slate-300', dot: 'bg-slate-400' },
  TERKENDALA: { label: 'Terkendala', bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  NA: { label: 'N/A', bg: 'bg-zinc-500/15', text: 'text-zinc-700 dark:text-zinc-300', dot: 'bg-zinc-500' },
}

export const WEEKLY_HEADER_META: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT: { label: 'Draft', bg: 'bg-slate-500/15', text: 'text-slate-700 dark:text-slate-300' },
  MENUNGGU_PERSETUJUAN: { label: 'Menunggu Persetujuan', bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' },
  DISETUJUI: { label: 'Disetujui', bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
  TERKUNCI: { label: 'Terkunci', bg: 'bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300' },
}

export const ESCALATION_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  DIAJUKAN: { label: 'Diajukan', bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300' },
  DITINJAU: { label: 'Ditinjau', bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' },
  DIPUTUSKAN: { label: 'Diputuskan', bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
  DITUTUP: { label: 'Ditutup', bg: 'bg-slate-500/15', text: 'text-slate-700 dark:text-slate-300' },
}

export const ESCALATION_NEEDED_LABELS: Record<string, string> = {
  KEPUTUSAN: 'Keputusan',
  ANGGARAN: 'Anggaran',
  DUKUNGAN_LINTAS_FUNGSI: 'Dukungan Lintas Fungsi',
}

export const PRIORITY_META: Record<string, { label: string; bg: string; text: string }> = {
  TINGGI: { label: 'Tinggi', bg: 'bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300' },
  SEDANG: { label: 'Sedang', bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' },
  RENDAH: { label: 'Rendah', bg: 'bg-sky-500/15', text: 'text-sky-700 dark:text-sky-300' },
}

export const UNLOCK_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  DIAJUKAN: { label: 'Diajukan', bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300' },
  DISETUJUI: { label: 'Disetujui', bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
  DITOLAK: { label: 'Ditolak', bg: 'bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300' },
  DIEKSEKUSI: { label: 'Dieksekusi', bg: 'bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300' },
}

export const ASPECT_CATEGORY_LABELS: Record<string, string> = {
  OPS: 'Operasional',
  KEU: 'Keuangan',
  PAT: 'Kepatuhan',
  SDM: 'SDM',
  HSE: 'HSE',
  PRJ: 'Proyek',
  SYS: 'Sistem',
  KOM: 'Komersial',
}

// Compliance score color thresholds (0-100)
export function complianceColor(score: number): { bg: string; text: string; ring: string } {
  if (score >= 90) return { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500/30' }
  if (score >= 75) return { bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', ring: 'ring-blue-500/30' }
  if (score >= 60) return { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300', ring: 'ring-amber-500/30' }
  return { bg: 'bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300', ring: 'ring-rose-500/30' }
}

export const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Beranda' },
  { id: 'companies', label: 'Perusahaan & Akun', short: 'Perusahaan' },
  { id: 'work-desk', label: 'Meja Kerja', short: 'Kerja' },
  { id: 'daily-input', label: 'Laporan Kemajuan', short: 'Laporan' },
  { id: 'weekly-input', label: 'Capaian Mingguan', short: 'Mingguan' },
  { id: 'inbox', label: 'Penerimaan', short: 'Masuk' },
  { id: 'projects', label: 'Modul Proyek', short: 'Proyek' },
  { id: 'divisions', label: 'Modul Divisi', short: 'Divisi' },
  { id: 'escalations', label: 'Eskalasi', short: 'Eskalasi' },
  { id: 'entities', label: 'Entitas', short: 'Entitas' },
  { id: 'audit', label: 'Audit Trail', short: 'Audit' },
  { id: 'system', label: 'Sistem & Akses', short: 'Sistem' },
] as const

export type NavTabId = typeof NAV_TABS[number]['id']
