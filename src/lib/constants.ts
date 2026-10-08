// Shared constants and lookup maps for the monitoring app

export const ROLE_LABELS: Record<string, string> = {
  ADMIN_PT: 'Admin PT',
  KEPALA_DIVISI: 'Kepala divisi',
  PIC_PROYEK: 'Manager / PIC proyek',
  DIREKTUR_ENTITAS: 'Direktur entitas',
  DIREKTUR_SDM_GA: 'Direksi holding (SDM & GA)',
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
  { role: 'KEPALA_DIVISI', label: 'Kepala divisi', hint: 'Capaian mingguan divisinya' },
  { role: 'PIC_PROYEK', label: 'Manager proyek', hint: 'Laporan harian proyek yang dipegang' },
  { role: 'DIREKTUR_ENTITAS', label: 'Direktur perusahaan', hint: 'Mengawasi & menyetujui di perusahaannya' },
]

export const HOLDING_POSITION_OPTIONS: { role: string; label: string; hint: string }[] = [
  { role: 'MANAJEMEN', label: 'Manajemen holding', hint: 'Membaca seluruh grup, memutuskan eskalasi' },
  { role: 'DIREKTUR_SDM_GA', label: 'Direksi holding (SDM & GA)', hint: 'Pemilik proses, menyetujui buka kunci' },
  { role: 'SUPERADMIN', label: 'Super Admin', hint: 'Kelola perusahaan & akun seluruh grup' },
  { role: 'TI', label: 'Tim TI', hint: 'Konsol sistem & akses' },
  { role: 'AUDITOR', label: 'Auditor', hint: 'Baca-saja + jejak audit' },
]

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  HOLDING: 'Holding',
  SUB_HOLDING: 'Sub-holding',
  SECTOR: 'Sektor',
  REGION: 'Wilayah',
  PT: 'PT',
  UNIT: 'Unit',
}

export const ENTITY_TYPE_COLORS: Record<string, string> = {
  HOLDING: 'from-data-1 to-data-4',
  SUB_HOLDING: 'from-data-1 to-data-6',
  SECTOR: 'from-data-6 to-data-2',
  REGION: 'from-data-1 to-data-6',
  PT: 'from-accent to-accent-fill',
  UNIT: 'from-ink-3 to-fill-2',
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
  RENDAH: { label: 'Rendah', bg: 'bg-fill-2', text: 'text-ink-2', dot: 'bg-ink-3', hint: 'Bisa menunggu' },
  SEDANG: { label: 'Sedang', bg: 'bg-info-soft', text: 'text-info', dot: 'bg-info', hint: 'Sesuai jadwal' },
  TINGGI: { label: 'Tinggi', bg: 'bg-waspada-soft', text: 'text-waspada', dot: 'bg-waspada', hint: 'Prioritaskan hari ini' },
  KRITIS: { label: 'Kritis', bg: 'bg-bahaya-soft', text: 'text-bahaya', dot: 'bg-bahaya', hint: 'Menghambat proyek' },
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
  PENGINGAT_HARIAN_PIC: 'Pengingat laporan harian PIC',
  RINGKASAN_MINGGUAN_DIVISI: 'Ringkasan mingguan kepala divisi', // [F2-KADIV]
}

/** Nama slot di rantai persetujuan proyek; slot Manajemen = satu tingkat di atas Direktur. */
export const PROJECT_APPROVER_LABELS: Record<string, string> = {
  ADMIN_PT: 'Admin PT',
  DIREKTUR_ENTITAS: 'Direktur entitas',
  DIREKTUR_SDM_GA: 'Direksi holding',
  MANAJEMEN: 'Manajemen holding',
}

// Daily report status colors and labels
export const DAILY_STATUS_META: Record<string, { label: string; color: string; bg: string; text: string; dot: string }> = {
  SELESAI: { label: 'Selesai', color: 'emerald', bg: 'bg-sukses-soft', text: 'text-sukses', dot: 'bg-sukses' },
  ON_PROGRESS: { label: 'Berjalan', color: 'blue', bg: 'bg-info-soft', text: 'text-info', dot: 'bg-info' },
  TERKENDALA: { label: 'Terkendala', color: 'amber', bg: 'bg-waspada-soft', text: 'text-waspada', dot: 'bg-waspada' },
  MENUNGGU_KEPUTUSAN: { label: 'Menunggu keputusan', color: 'violet', bg: 'bg-info-soft', text: 'text-info', dot: 'bg-info' },
  TIDAK_ADA_PERUBAHAN: { label: 'Tidak ada perubahan', color: 'slate', bg: 'bg-fill-2', text: 'text-ink-2', dot: 'bg-ink-3' },
}

export const WEEKLY_STATUS_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  SELESAI: { label: 'Selesai', bg: 'bg-sukses-soft', text: 'text-sukses', dot: 'bg-sukses' },
  ON_PROGRESS: { label: 'Berjalan', bg: 'bg-info-soft', text: 'text-info', dot: 'bg-info' },
  BELUM_MULAI: { label: 'Belum mulai', bg: 'bg-fill-2', text: 'text-ink-2', dot: 'bg-ink-3' },
  TERKENDALA: { label: 'Terkendala', bg: 'bg-waspada-soft', text: 'text-waspada', dot: 'bg-waspada' },
  NA: { label: 'N/A', bg: 'bg-fill-1', text: 'text-ink-2 ', dot: 'bg-ink-3' },
}

export const WEEKLY_HEADER_META: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT: { label: 'Draf', bg: 'bg-fill-2', text: 'text-ink-2' },
  MENUNGGU_PERSETUJUAN: { label: 'Menunggu persetujuan', bg: 'bg-waspada-soft', text: 'text-waspada' },
  DISETUJUI: { label: 'Disetujui', bg: 'bg-sukses-soft', text: 'text-sukses' },
  TERKUNCI: { label: 'Terkunci', bg: 'bg-bahaya-soft', text: 'text-bahaya' },
}

export const ESCALATION_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  DIAJUKAN: { label: 'Diajukan', bg: 'bg-info-soft', text: 'text-info' },
  DITINJAU: { label: 'Ditinjau', bg: 'bg-waspada-soft', text: 'text-waspada' },
  DIPUTUSKAN: { label: 'Diputuskan', bg: 'bg-sukses-soft', text: 'text-sukses' },
  DITUTUP: { label: 'Ditutup', bg: 'bg-fill-2', text: 'text-ink-2' },
}

export const ESCALATION_NEEDED_LABELS: Record<string, string> = {
  KEPUTUSAN: 'Keputusan',
  ANGGARAN: 'Anggaran',
  DUKUNGAN_LINTAS_FUNGSI: 'Dukungan lintas fungsi',
}

export const PRIORITY_META: Record<string, { label: string; bg: string; text: string }> = {
  TINGGI: { label: 'Tinggi', bg: 'bg-bahaya-soft', text: 'text-bahaya' },
  SEDANG: { label: 'Sedang', bg: 'bg-waspada-soft', text: 'text-waspada' },
  RENDAH: { label: 'Rendah', bg: 'bg-info-soft', text: 'text-info ' },
}

export const UNLOCK_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  DIAJUKAN: { label: 'Diajukan', bg: 'bg-info-soft', text: 'text-info' },
  DISETUJUI: { label: 'Disetujui', bg: 'bg-sukses-soft', text: 'text-sukses' },
  DITOLAK: { label: 'Ditolak', bg: 'bg-bahaya-soft', text: 'text-bahaya' },
  DIEKSEKUSI: { label: 'Dieksekusi', bg: 'bg-info-soft', text: 'text-info' },
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
  if (score >= 90) return { bg: 'bg-sukses-soft', text: 'text-sukses', ring: 'ring-sukses/30' }
  if (score >= 75) return { bg: 'bg-info-soft', text: 'text-info', ring: 'ring-info/30' }
  if (score >= 60) return { bg: 'bg-waspada-soft', text: 'text-waspada', ring: 'ring-waspada/30' }
  return { bg: 'bg-bahaya-soft', text: 'text-bahaya', ring: 'ring-bahaya/30' }
}

export const NAV_TABS = [
  { id: 'dashboard', label: 'Ringkasan', short: 'Ringkasan' },
  { id: 'companies', label: 'Perusahaan & akun', short: 'Perusahaan' },
  { id: 'work-desk', label: 'Meja kerja', short: 'Kerja' },
  { id: 'daily-input', label: 'Laporan harian', short: 'Laporan' },
  { id: 'weekly-input', label: 'Capaian mingguan', short: 'Mingguan' },
  { id: 'inbox', label: 'Penerimaan', short: 'Masuk' },
  { id: 'projects', label: 'Proyek', short: 'Proyek' },
  { id: 'divisions', label: 'Divisi', short: 'Divisi' },
  // [F2-DIREKTUR] antrean keputusan pengawas: materi/anggaran/cuti, usulan tenggat, pengajuan proyek
  { id: 'approvals', label: 'Persetujuan', short: 'Persetujuan' },
  { id: 'escalations', label: 'Eskalasi', short: 'Eskalasi' },
  { id: 'entities', label: 'Entitas', short: 'Entitas' },
  { id: 'audit', label: 'Log aktivitas', short: 'Log' },
  { id: 'system', label: 'Sistem & akses', short: 'Sistem' },
] as const

export type NavTabId = typeof NAV_TABS[number]['id']
