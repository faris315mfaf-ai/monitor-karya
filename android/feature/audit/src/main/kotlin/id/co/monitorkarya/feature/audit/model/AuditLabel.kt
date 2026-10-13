// Label + nada aksi log aktivitas — port PERSIS peta ACTIONS dan TARGET_LABELS
// di src/components/views/audit-view.tsx. Aksi baru tanpa label tampil sebagai
// kodenya. Nada: INFO = buat/kirim, RISK = ubah, DONE = setujui/selesai,
// LATE = hapus/tolak/kunci, NEUTRAL = akses & sistem. Nada selalu tampil
// bersama ikon + kata (StatusBadge), tidak pernah warna saja.
package id.co.monitorkarya.feature.audit.model

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.designsystem.components.MkStatus

data class AksiAudit(val label: String, val nada: MkStatus)

private fun a(label: String, nada: MkStatus) = AksiAudit(label, nada)

private val I = MkStatus.INFO
private val R = MkStatus.RISK
private val D = MkStatus.DONE
private val L = MkStatus.LATE
private val N = MkStatus.NEUTRAL

/** Urutan dipertahankan dari web. */
val AKSI_AUDIT: Map<String, AksiAudit> = linkedMapOf(
    // Masuk & akun
    "LOGIN" to a("Masuk", N),
    "LOGIN_FAILED" to a("Gagal masuk", L),
    "LOGOUT" to a("Keluar", N),
    "CHANGE_OWN_PASSWORD" to a("Ganti kata sandi sendiri", N),
    "RESET_PASSWORD" to a("Atur ulang kata sandi", R),
    "UPDATE_PROFILE" to a("Ubah profil", R),
    "CREATE_ACCOUNT" to a("Buat akun", I),
    "UPDATE_ACCOUNT" to a("Ubah akun", R),
    "DELETE_ACCOUNT" to a("Hapus akun", L),
    // E2E-3 B8: aksi server yang belum berlabel (juga belum ada di audit-view web).
    "UPDATE_REPORT_SETTINGS" to a("Ubah aturan pelaporan", R),
    "ISSUE_ACCOUNT_ACTIVATION" to a("Terbitkan tautan aktivasi akun", I),
    "ACTIVATE_ACCOUNT" to a("Aktifkan akun", D),
    // Permintaan & akses
    "REQUEST_ACCESS" to a("Ajukan permintaan akses", I),
    "APPROVE_ACCESS_REQUEST" to a("Setujui permintaan akses", D),
    "REJECT_ACCESS_REQUEST" to a("Tolak permintaan akses", L),
    "GRANT_TEMP_ACCESS" to a("Beri akses sementara", R),
    "TEMP_ACCESS_EXPIRED" to a("Akses sementara berakhir", N),
    // Perusahaan & divisi
    "CREATE_COMPANY" to a("Buat perusahaan", I),
    "UPDATE_COMPANY" to a("Ubah perusahaan", R),
    "DELETE_COMPANY" to a("Hapus perusahaan", L),
    "SET_DIVISION_MEMBER" to a("Atur anggota divisi", R),
    "SET_PROJECT_DIVISION" to a("Atur divisi proyek", R),
    "SET_ATTENDANCE" to a("Catat kehadiran", I),
    // Kepala divisi
    "KADIV_READ_DAILY" to a("Tandai laporan harian dibaca", I),
    "KADIV_UNREAD_DAILY" to a("Batalkan tanda baca laporan harian", I),
    "KADIV_SAVE_WEEKLY_SUMMARY" to a("Simpan draf ringkasan mingguan", I),
    "KADIV_SEND_WEEKLY_SUMMARY" to a("Kirim ringkasan mingguan ke Direktur", D),
    "KADIV_UNSEND_WEEKLY_SUMMARY" to a("Tarik ringkasan mingguan", R),
    // Proyek
    "PROPOSE_PROJECT" to a("Ajukan proyek", I),
    "CREATE_PROJECT" to a("Buat proyek", I),
    "CREATE_PROJECT_NO_APPROVAL" to a("Buat proyek tanpa persetujuan", I),
    "APPROVE_PROJECT" to a("Setujui proyek", D),
    "REJECT_PROJECT" to a("Tolak proyek", L),
    "RESUBMIT_PROJECT" to a("Ajukan ulang proyek", I),
    "UPDATE_PROJECT" to a("Ubah proyek", R),
    "DELETE_PROJECT" to a("Hapus proyek", L),
    "CREATE_PROJECT_STAGE" to a("Tambah tahapan", I),
    "UPDATE_PROJECT_STAGE" to a("Ubah tahapan", R),
    "DELETE_PROJECT_STAGE" to a("Hapus tahapan", L),
    "REORDER_PROJECT_STAGES" to a("Urutkan tahapan", N),
    "PROPOSE_DEADLINE" to a("Usulkan geser tenggat", I),
    "APPROVE_DEADLINE" to a("Setujui geser tenggat", D),
    "REJECT_DEADLINE" to a("Tolak geser tenggat", L),
    "WITHDRAW_DEADLINE" to a("Tarik usulan tenggat", N),
    "CREATE_PROJECT_NOTE" to a("Kirim catatan proyek", I),
    "ARCHIVE_PROJECT" to a("Arsipkan proyek", N),
    "REVIEW_PROJECT" to a("Tinjau proyek", I),
    "UNDO_REVIEW_PROJECT" to a("Urungkan tinjau proyek", N),
    "UNDO_DEADLINE_DECISION" to a("Urungkan keputusan tenggat", N),
    // Persetujuan materi (approval-requests)
    "CREATE_APPROVAL_REQUEST" to a("Ajukan persetujuan", I),
    "ATTACH_APPROVAL_FILE" to a("Lampirkan berkas persetujuan", I),
    "APPROVE_APPROVAL_REQUEST" to a("Setujui permintaan persetujuan", D),
    "REJECT_APPROVAL_REQUEST" to a("Tolak permintaan persetujuan", L),
    "WITHDRAW_APPROVAL_REQUEST" to a("Tarik permintaan persetujuan", N),
    "REOPEN_APPROVAL_REQUEST" to a("Buka ulang permintaan persetujuan", I),
    "UNDO_APPROVAL_DECISION" to a("Urungkan keputusan persetujuan", N),
    // Output
    "CREATE_OUTPUT" to a("Buat output", I),
    "OUTPUT_UPDATE" to a("Ubah output", R),
    "OUTPUT_SUBMIT" to a("Kirim output", I),
    "OUTPUT_WITHDRAW" to a("Batalkan kirim output", N),
    "OUTPUT_ACCEPT" to a("Terima output", D),
    "OUTPUT_REVISE" to a("Minta revisi output", R),
    "OUTPUT_REVIEW_UNDO" to a("Urungkan review output", N),
    "DELETE_OUTPUT" to a("Hapus output", L),
    // Laporan harian & progres
    "CREATE_REPORT" to a("Buat laporan", I),
    "UPDATE_REPORT" to a("Ubah laporan", R),
    "SAVE_DAILY_REPORT" to a("Simpan laporan harian", R),
    "SUBMIT_DAILY_REPORT" to a("Kirim laporan harian", I),
    "FORWARD_DAILY_REPORT" to a("Teruskan laporan harian", D),
    "DELETE_DAILY_REPORT" to a("Hapus laporan harian", L),
    "SAVE_PROGRESS_REPORT" to a("Simpan laporan progres", R),
    "SUBMIT_PROGRESS_REPORT" to a("Kirim laporan progres", I),
    "DELETE_PROGRESS_REPORT" to a("Hapus laporan progres", L),
    // Laporan mingguan
    "CREATE_WEEKLY_ITEM" to a("Tambah butir mingguan", I),
    "UPDATE_WEEKLY_ITEM" to a("Ubah butir mingguan", R),
    "DELETE_WEEKLY_ITEM" to a("Hapus butir mingguan", L),
    "REORDER_WEEKLY_ITEMS" to a("Urutkan butir mingguan", N),
    "SUBMIT_WEEKLY_REPORT" to a("Serahkan laporan mingguan", I),
    "APPROVE_WEEKLY" to a("Setujui mingguan", D),
    "FORWARD_WEEKLY_REPORT" to a("Teruskan laporan mingguan", D),
    "READ_WEEKLY_REPORT" to a("Tandai mingguan dibaca", N),
    "UNREAD_WEEKLY_REPORT" to a("Tandai mingguan belum dibaca", N),
    "COMMENT_WEEKLY_REPORT" to a("Tanggapi laporan mingguan", I),
    "UNDO_WEEKLY_COMMENT" to a("Urungkan tanggapan mingguan", N),
    // Tugas & bukti
    "CREATE_TASK" to a("Tambah tugas", I),
    "UPDATE_TASK" to a("Ubah tugas", R),
    "DELETE_TASK" to a("Hapus tugas", L),
    "REORDER_TASKS" to a("Urutkan tugas", N),
    "UPLOAD_EVIDENCE" to a("Unggah bukti", I),
    "ATTACH_EVIDENCE" to a("Lampirkan bukti", I),
    "REMOVE_EVIDENCE" to a("Hapus bukti", L),
    // Kunci & buka kunci
    "LOCK_REPORT" to a("Kunci laporan", L),
    "REQUEST_UNLOCK" to a("Ajukan buka kunci", I),
    "APPROVE_UNLOCK" to a("Setujui buka kunci", D),
    "REJECT_UNLOCK" to a("Tolak buka kunci", L),
    "UNLOCK_EXECUTE" to a("Buka kunci", I),
    "RELOCK_REPORT" to a("Kunci ulang laporan", L),
    // Eskalasi
    "CREATE_ESCALATION" to a("Buat eskalasi", R),
    "REVIEW_ESCALATION" to a("Tinjau eskalasi", I),
    "DECIDE_ESCALATION" to a("Putuskan eskalasi", D),
    "CLOSE_ESCALATION" to a("Tutup eskalasi", D),
    // Pengingat & sistem
    "REMIND_PIC" to a("Ingatkan PIC", I),
    "SEND_DIVISION_REMINDERS" to a("Ingatkan divisi", I),
    "CRON_DIVISION_REMINDERS" to a("Pengingat divisi terjadwal", N),
    "UPDATE_REMINDER_RULE" to a("Ubah aturan pengingat", R),
    "AUTO_REMINDER" to a("Pengingat otomatis", N),
    "KPI_SNAPSHOT" to a("Perbarui KPI harian", N),
    "EXPORT_AUDIT_LOG" to a("Unduh log aktivitas", N),
    // Urungkan lewat toast
    "UNDO_APPROVE_PROJECT" to a("Urungkan persetujuan proyek", N),
    "UNDO_REJECT_PROJECT" to a("Urungkan penolakan proyek", N),
    "UNDO_RESUBMIT_PROJECT" to a("Urungkan pengajuan ulang", N),
    "UNDO_ARCHIVE_PROJECT" to a("Urungkan pengarsipan proyek", N),
    "UNDO_REVIEW_ESCALATION" to a("Urungkan tinjau eskalasi", N),
    "UNDO_DECIDE_ESCALATION" to a("Urungkan keputusan eskalasi", N),
    "UNDO_CLOSE_ESCALATION" to a("Urungkan penutupan eskalasi", N),
    "UNDO_FORWARD_DAILY_REPORT" to a("Urungkan penerusan laporan harian", N),
    "UNDO_FORWARD_WEEKLY_REPORT" to a("Urungkan penerusan capaian mingguan", N),
)

/**
 * Label aksi; aksi tak dikenal tampil sebagai kodenya (seperti web). E2E-3 B8:
 * semua kode aksi yang ditulis server (auditPic/audit*) kini berlabel.
 */
fun labelAksi(kode: String): String = AKSI_AUDIT[kode]?.label ?: kode

/** Nada aksi; tak dikenal = NEUTRAL. */
fun nadaAksi(kode: String): MkStatus = AKSI_AUDIT[kode]?.nada ?: MkStatus.NEUTRAL

/** Opsi saringan aksi urut abjad label (localeCompare 'id' web). */
val OPSI_AKSI: List<Pair<String, String>> =
    AKSI_AUDIT.entries.map { it.key to it.value.label }.sortedBy { it.second.lowercase() }

/** TARGET_LABELS web. */
val LABEL_SASARAN: Map<String, String> = mapOf(
    "DAILY_REPORT" to "Laporan harian",
    "WEEKLY_REPORT" to "Laporan mingguan",
    "WEEKLY_ITEM" to "Butir mingguan",
    "PROGRESS_REPORT" to "Laporan progres",
    "ESCALATION" to "Eskalasi",
    "USER" to "Akun",
    "ENTITY" to "Perusahaan",
    "PROJECT" to "Proyek",
    "PROJECT_STAGE" to "Tahapan proyek",
    "PROJECT_NOTE" to "Catatan proyek",
    "OUTPUT" to "Output",
    "TASK" to "Tugas",
    "UNLOCK_REQUEST" to "Permintaan buka kunci",
    "ACCESS_REQUEST" to "Permintaan akses",
    "REMINDER_RULE" to "Aturan pengingat",
    "KPI_SNAPSHOT" to "KPI harian",
    // E2E-3 B8
    "REPORT_SETTINGS" to "Aturan pelaporan",
    "AUDIT_LOG" to "Log aktivitas",
    "APPROVAL_REQUEST" to "Permintaan persetujuan",
    "WEEKLY_SUMMARY" to "Ringkasan mingguan divisi",
)

fun labelSasaran(kode: String): String = LABEL_SASARAN[kode] ?: kode

/** TARGET_TYPE_OPTIONS web (chip saringan target). Nilai null = semua. */
val OPSI_SASARAN: List<Pair<String?, String>> = listOf(
    null to "Semua target",
    "DAILY_REPORT" to "Laporan harian",
    "WEEKLY_REPORT" to "Laporan mingguan",
    "ESCALATION" to "Eskalasi",
)

/** ROLE_LABELS (constants.ts) lewat enum domain; kode tak dikenal tampil apa adanya. */
fun labelPeran(kode: String?): String? {
    if (kode.isNullOrBlank()) return null
    return Peran.entries.firstOrNull { it.name == kode }?.labelIndonesia ?: kode
}

/** Inisial dua huruf (initialsOf web). */
fun inisial(nama: String?): String {
    val bagian = nama.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        bagian.isEmpty() -> "?"
        bagian.size == 1 -> bagian[0].take(2).uppercase()
        else -> (bagian[0].take(1) + bagian[1].take(1)).uppercase()
    }
}

/** REMINDER_TITLES (admin-meta.ts). */
fun judulPengingat(kind: String): String = when (kind) {
    "HARIAN" -> "Pengingat laporan harian"
    "MINGGUAN" -> "Pengingat laporan mingguan"
    "ESKALASI_KADIV" -> "Eskalasi ke kepala divisi"
    "RINGKASAN_MANAJEMEN" -> "Ringkasan untuk manajemen"
    else -> kind
}
