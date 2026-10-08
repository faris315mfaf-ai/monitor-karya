/**
 * Kalimat log aktivitas untuk Admin PT dan berkas "Unduh log" [F2-ADMIN].
 * Aman dipakai di server maupun klien (tanpa impor server).
 *
 * `AUDIT_LABELS` menyalin label aksi dari src/components/views/audit-view.tsx
 * (berkas klien, tidak bisa diimpor dari route API). Bila aksi baru
 * ditambahkan, tambahkan di kedua tempat; aksi tanpa label tampil sebagai kodenya.
 * `AUDIT_VERBS` adalah frasa kerja untuk kalimat "<nama> <frasa> <sasaran>".
 */

export const AUDIT_LABELS: Record<string, string> = {
  LOGIN: 'Masuk',
  LOGIN_FAILED: 'Gagal masuk',
  LOGOUT: 'Keluar',
  CHANGE_OWN_PASSWORD: 'Ganti kata sandi sendiri',
  RESET_PASSWORD: 'Atur ulang kata sandi',
  UPDATE_PROFILE: 'Ubah profil',
  CREATE_ACCOUNT: 'Buat akun',
  UPDATE_ACCOUNT: 'Ubah akun',
  DELETE_ACCOUNT: 'Hapus akun',
  REQUEST_ACCESS: 'Ajukan permintaan akses',
  APPROVE_ACCESS_REQUEST: 'Setujui permintaan akses',
  REJECT_ACCESS_REQUEST: 'Tolak permintaan akses',
  GRANT_TEMP_ACCESS: 'Beri akses sementara',
  TEMP_ACCESS_EXPIRED: 'Akses sementara berakhir',
  CREATE_COMPANY: 'Buat perusahaan',
  UPDATE_COMPANY: 'Ubah perusahaan',
  DELETE_COMPANY: 'Hapus perusahaan',
  SET_DIVISION_MEMBER: 'Atur anggota divisi',
  SET_PROJECT_DIVISION: 'Atur divisi proyek',
  SET_ATTENDANCE: 'Catat kehadiran',
  PROPOSE_PROJECT: 'Ajukan proyek',
  CREATE_PROJECT: 'Buat proyek',
  CREATE_PROJECT_NO_APPROVAL: 'Buat proyek tanpa persetujuan',
  APPROVE_PROJECT: 'Setujui proyek',
  REJECT_PROJECT: 'Tolak proyek',
  RESUBMIT_PROJECT: 'Ajukan ulang proyek',
  UPDATE_PROJECT: 'Ubah proyek',
  DELETE_PROJECT: 'Hapus proyek',
  CREATE_PROJECT_STAGE: 'Tambah tahapan',
  UPDATE_PROJECT_STAGE: 'Ubah tahapan',
  DELETE_PROJECT_STAGE: 'Hapus tahapan',
  REORDER_PROJECT_STAGES: 'Urutkan tahapan',
  PROPOSE_DEADLINE: 'Usulkan geser tenggat',
  APPROVE_DEADLINE: 'Setujui geser tenggat',
  REJECT_DEADLINE: 'Tolak geser tenggat',
  WITHDRAW_DEADLINE: 'Tarik usulan tenggat',
  CREATE_PROJECT_NOTE: 'Kirim catatan proyek',
  CREATE_OUTPUT: 'Buat output',
  OUTPUT_UPDATE: 'Ubah output',
  OUTPUT_SUBMIT: 'Kirim output',
  OUTPUT_WITHDRAW: 'Batalkan kirim output',
  OUTPUT_ACCEPT: 'Terima output',
  OUTPUT_REVISE: 'Minta revisi output',
  OUTPUT_REVIEW_UNDO: 'Urungkan review output',
  DELETE_OUTPUT: 'Hapus output',
  CREATE_REPORT: 'Buat laporan',
  UPDATE_REPORT: 'Ubah laporan',
  SAVE_DAILY_REPORT: 'Simpan laporan harian',
  SUBMIT_DAILY_REPORT: 'Kirim laporan harian',
  FORWARD_DAILY_REPORT: 'Teruskan laporan harian',
  DELETE_DAILY_REPORT: 'Hapus laporan harian',
  SAVE_PROGRESS_REPORT: 'Simpan laporan progres',
  SUBMIT_PROGRESS_REPORT: 'Kirim laporan progres',
  DELETE_PROGRESS_REPORT: 'Hapus laporan progres',
  CREATE_WEEKLY_ITEM: 'Tambah butir mingguan',
  UPDATE_WEEKLY_ITEM: 'Ubah butir mingguan',
  DELETE_WEEKLY_ITEM: 'Hapus butir mingguan',
  REORDER_WEEKLY_ITEMS: 'Urutkan butir mingguan',
  SUBMIT_WEEKLY_REPORT: 'Serahkan laporan mingguan',
  APPROVE_WEEKLY: 'Setujui mingguan',
  FORWARD_WEEKLY_REPORT: 'Teruskan laporan mingguan',
  READ_WEEKLY_REPORT: 'Tandai mingguan dibaca',
  UNREAD_WEEKLY_REPORT: 'Tandai mingguan belum dibaca',
  CREATE_TASK: 'Tambah tugas',
  UPDATE_TASK: 'Ubah tugas',
  DELETE_TASK: 'Hapus tugas',
  REORDER_TASKS: 'Urutkan tugas',
  UPLOAD_EVIDENCE: 'Unggah bukti',
  ATTACH_EVIDENCE: 'Lampirkan bukti',
  REMOVE_EVIDENCE: 'Hapus bukti',
  LOCK_REPORT: 'Kunci laporan',
  REQUEST_UNLOCK: 'Ajukan buka kunci',
  APPROVE_UNLOCK: 'Setujui buka kunci',
  REJECT_UNLOCK: 'Tolak buka kunci',
  UNLOCK_EXECUTE: 'Buka kunci',
  RELOCK_REPORT: 'Kunci ulang laporan',
  CREATE_ESCALATION: 'Buat eskalasi',
  REVIEW_ESCALATION: 'Tinjau eskalasi',
  DECIDE_ESCALATION: 'Putuskan eskalasi',
  CLOSE_ESCALATION: 'Tutup eskalasi',
  REMIND_PIC: 'Ingatkan PIC',
  SEND_DIVISION_REMINDERS: 'Ingatkan divisi',
  CRON_DIVISION_REMINDERS: 'Pengingat divisi terjadwal',
  UPDATE_REMINDER_RULE: 'Ubah aturan pengingat',
  AUTO_REMINDER: 'Pengingat otomatis',
  KPI_SNAPSHOT: 'Perbarui KPI harian',
  EXPORT_AUDIT_LOG: 'Unduh log aktivitas',
  // [F2-KADIV]
  KADIV_READ_DAILY: 'Tandai laporan harian dibaca',
  KADIV_UNREAD_DAILY: 'Batalkan tanda baca laporan harian',
  KADIV_SAVE_WEEKLY_SUMMARY: 'Simpan draf ringkasan mingguan',
  KADIV_SEND_WEEKLY_SUMMARY: 'Kirim ringkasan mingguan ke Direktur',
  KADIV_UNSEND_WEEKLY_SUMMARY: 'Tarik ringkasan mingguan',
  // [F2-URUNGKAN] urungkan lewat toast (POST /api/undo)
  UNDO_APPROVE_PROJECT: 'Urungkan persetujuan proyek',
  UNDO_REJECT_PROJECT: 'Urungkan penolakan proyek',
  UNDO_RESUBMIT_PROJECT: 'Urungkan pengajuan ulang',
  UNDO_ARCHIVE_PROJECT: 'Urungkan pengarsipan proyek',
  UNDO_REVIEW_ESCALATION: 'Urungkan tinjau eskalasi',
  UNDO_DECIDE_ESCALATION: 'Urungkan keputusan eskalasi',
  UNDO_CLOSE_ESCALATION: 'Urungkan penutupan eskalasi',
  UNDO_FORWARD_DAILY_REPORT: 'Urungkan penerusan laporan harian',
  UNDO_FORWARD_WEEKLY_REPORT: 'Urungkan penerusan capaian mingguan',
}

export const AUDIT_TARGET_LABELS: Record<string, string> = {
  DAILY_REPORT: 'Laporan harian',
  WEEKLY_REPORT: 'Laporan mingguan',
  WEEKLY_ITEM: 'Butir mingguan',
  PROGRESS_REPORT: 'Laporan progres',
  ESCALATION: 'Eskalasi',
  USER: 'Akun',
  ENTITY: 'Perusahaan',
  PROJECT: 'Proyek',
  PROJECT_STAGE: 'Tahapan proyek',
  PROJECT_NOTE: 'Catatan proyek',
  OUTPUT: 'Output',
  TASK: 'Tugas',
  UNLOCK_REQUEST: 'Permintaan buka kunci',
  ACCESS_REQUEST: 'Permintaan akses',
  REMINDER_RULE: 'Aturan pengingat',
  KPI_SNAPSHOT: 'KPI harian',
  AUDIT_LOG: 'Log aktivitas',
}

/** Frasa kerja untuk log aktivitas Admin PT ("Maya Lestari meneruskan laporan harian …"). */
export const AUDIT_VERBS: Record<string, string> = {
  CREATE_ACCOUNT: 'membuat akun',
  UPDATE_ACCOUNT: 'mengubah akun',
  DELETE_ACCOUNT: 'menghapus akun',
  RESET_PASSWORD: 'mengatur ulang kata sandi',
  REQUEST_ACCESS: 'mengajukan permintaan akses',
  APPROVE_ACCESS_REQUEST: 'menyetujui permintaan akses',
  REJECT_ACCESS_REQUEST: 'menolak permintaan akses',
  GRANT_TEMP_ACCESS: 'memberi akses sementara',
  TEMP_ACCESS_EXPIRED: 'mencabut akses sementara yang berakhir',
  SET_DIVISION_MEMBER: 'mengatur anggota divisi',
  SET_PROJECT_DIVISION: 'mengatur divisi proyek',
  SET_ATTENDANCE: 'mencatat kehadiran',
  PROPOSE_PROJECT: 'mengajukan proyek',
  CREATE_PROJECT: 'membuat proyek',
  CREATE_PROJECT_NO_APPROVAL: 'membuat proyek tanpa persetujuan',
  APPROVE_PROJECT: 'menyetujui proyek',
  REJECT_PROJECT: 'menolak proyek',
  RESUBMIT_PROJECT: 'mengajukan ulang proyek',
  UPDATE_PROJECT: 'mengubah proyek',
  DELETE_PROJECT: 'menghapus proyek',
  SUBMIT_DAILY_REPORT: 'mengirim laporan harian',
  FORWARD_DAILY_REPORT: 'meneruskan laporan harian',
  DELETE_DAILY_REPORT: 'menghapus laporan harian',
  SUBMIT_WEEKLY_REPORT: 'menyerahkan laporan mingguan',
  APPROVE_WEEKLY: 'menyetujui laporan mingguan',
  FORWARD_WEEKLY_REPORT: 'meneruskan laporan mingguan',
  REQUEST_UNLOCK: 'mengajukan buka kunci',
  APPROVE_UNLOCK: 'menyetujui buka kunci',
  REJECT_UNLOCK: 'menolak buka kunci',
  UNLOCK_EXECUTE: 'membuka kunci',
  RELOCK_REPORT: 'mengunci ulang laporan',
  CREATE_ESCALATION: 'membuat eskalasi',
  REVIEW_ESCALATION: 'meninjau eskalasi',
  DECIDE_ESCALATION: 'memutuskan eskalasi',
  CLOSE_ESCALATION: 'menutup eskalasi',
  // [F2-URUNGKAN]
  UNDO_APPROVE_PROJECT: 'mengurungkan persetujuan proyek',
  UNDO_REJECT_PROJECT: 'mengurungkan penolakan proyek',
  UNDO_RESUBMIT_PROJECT: 'mengurungkan pengajuan ulang proyek',
  UNDO_ARCHIVE_PROJECT: 'mengurungkan pengarsipan proyek',
  UNDO_REVIEW_ESCALATION: 'mengurungkan tinjau eskalasi',
  UNDO_DECIDE_ESCALATION: 'mengurungkan keputusan eskalasi',
  UNDO_CLOSE_ESCALATION: 'mengurungkan penutupan eskalasi',
  UNDO_FORWARD_DAILY_REPORT: 'mengurungkan penerusan laporan harian',
  UNDO_FORWARD_WEEKLY_REPORT: 'mengurungkan penerusan laporan mingguan',
  REMIND_PIC: 'mengingatkan PIC',
  SEND_DIVISION_REMINDERS: 'mengingatkan kepala divisi',
  KADIV_SEND_WEEKLY_SUMMARY: 'mengirim ringkasan mingguan ke Direktur', // [F2-KADIV]
  KADIV_UNSEND_WEEKLY_SUMMARY: 'menarik ringkasan mingguan', // [F2-KADIV]
  UPDATE_REMINDER_RULE: 'mengubah aturan pengingat',
  EXPORT_AUDIT_LOG: 'mengunduh log aktivitas',
  OUTPUT_ACCEPT: 'menerima output',
  OUTPUT_REVISE: 'meminta revisi output',
  APPROVE_DEADLINE: 'menyetujui geser tenggat',
  REJECT_DEADLINE: 'menolak geser tenggat',
  PROPOSE_DEADLINE: 'mengusulkan geser tenggat',
  WITHDRAW_DEADLINE: 'menarik usulan tenggat',
  CREATE_TASK: 'menambah tugas',
  UPDATE_TASK: 'mengubah tugas',
  DELETE_TASK: 'menghapus tugas',
  UPLOAD_EVIDENCE: 'mengunggah bukti',
  ATTACH_EVIDENCE: 'melampirkan bukti',
  REMOVE_EVIDENCE: 'menghapus bukti',
  CREATE_WEEKLY_ITEM: 'menambah butir mingguan',
  UPDATE_WEEKLY_ITEM: 'mengubah butir mingguan',
  DELETE_WEEKLY_ITEM: 'menghapus butir mingguan',
  CREATE_PROJECT_NOTE: 'mengirim catatan proyek',
  CREATE_OUTPUT: 'membuat output',
  OUTPUT_UPDATE: 'mengubah output',
  OUTPUT_SUBMIT: 'mengirim output',
  OUTPUT_WITHDRAW: 'membatalkan kiriman output',
  OUTPUT_REVIEW_UNDO: 'mengurungkan review output',
  DELETE_OUTPUT: 'menghapus output',
  CREATE_PROJECT_STAGE: 'menambah tahapan',
  UPDATE_PROJECT_STAGE: 'mengubah tahapan',
  DELETE_PROJECT_STAGE: 'menghapus tahapan',
  SUBMIT_PROGRESS_REPORT: 'mengirim laporan progres',
  DELETE_PROGRESS_REPORT: 'menghapus laporan progres',
  LOCK_REPORT: 'mengunci laporan',
  CREATE_COMPANY: 'membuat perusahaan',
  UPDATE_COMPANY: 'mengubah perusahaan',
}

/** Frasa kerja aksi; aksi tanpa frasa memakai labelnya. */
export function auditVerb(action: string): string {
  return AUDIT_VERBS[action] ?? `mencatat "${auditLabel(action).toLowerCase()}"`
}

/** Aksi yang tidak ditampilkan di log aktivitas Admin (kebisingan / data pribadi). */
export const ACTIVITY_HIDDEN = new Set([
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'CHANGE_OWN_PASSWORD',
  'UPDATE_PROFILE',
  'READ_WEEKLY_REPORT',
  'UNREAD_WEEKLY_REPORT',
  'SAVE_DAILY_REPORT',
  'SAVE_PROGRESS_REPORT',
  'REORDER_TASKS',
  'REORDER_WEEKLY_ITEMS',
  'REORDER_PROJECT_STAGES',
  'KPI_SNAPSHOT',
  'KADIV_READ_DAILY', // [F2-KADIV]
  'KADIV_UNREAD_DAILY', // [F2-KADIV]
  'KADIV_SAVE_WEEKLY_SUMMARY', // [F2-KADIV]
])

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action
}

/** Satu baris log aktivitas Admin PT (/api/admin/activity). Tanpa IP/perangkat/isi sebelum-sesudah. */
export type ActivityEntry = {
  id: string
  at: string
  action: string
  /** Pelaku; null = pekerjaan terjadwal ("Pengingat otomatis"). */
  actor: { id: string; name: string } | null
  /** Frasa setelah nama, mis. "mematikan ringkasan untuk manajemen". */
  text: string
  /** Jumlah kejadian yang digabung (mis. "mengingatkan 4 PIC"). */
  count: number
}

/** Kalimat log tanpa nama pelaku di depannya ("Maya Lestari mematikan …" → "mematikan …"). */
export function stripActor(message: string, actorName: string | null): string {
  const m = message.trim()
  if (actorName && m.startsWith(actorName + ' ')) return m.slice(actorName.length + 1)
  return m
}
