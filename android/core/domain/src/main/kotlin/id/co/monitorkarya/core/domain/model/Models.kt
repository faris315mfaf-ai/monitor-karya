// Model inti Monitor Karya — port dari src/lib/rbac.ts (nama peran),
// src/lib/constants.ts (ROLE_LABELS), dan src/components/mk/core.tsx (STATUS).
package id.co.monitorkarya.core.domain.model

import java.time.LocalDate
import java.time.ZonedDateTime

/** Nama peran sama dengan basis data web; label dari ROLE_LABELS (constants.ts). */
enum class Peran(val labelIndonesia: String) {
    PIC_PROYEK("Manager / PIC proyek"),
    KEPALA_DIVISI("Kepala divisi"),
    ADMIN_PT("Admin PT"),
    DIREKTUR_ENTITAS("Direktur entitas"),
    DIREKTUR_SDM_GA("Direksi holding (SDM & GA)"),
    MANAJEMEN("Manajemen"),
    TI("Tim TI"),
    AUDITOR("Auditor"),
    SUPERADMIN("Super Admin"),
}

/** Kosakata status proyek (project-status.ts): on/risk/late/done/neutral. */
enum class MkStatusDomain(val label: String) {
    ON("Sesuai jadwal"),
    RISK("Perlu perhatian"),
    LATE("Terlambat"),
    DONE("Selesai"),
    NEUTRAL("Belum mulai"),
}

/** Akun yang sedang masuk (padanan hasil /api/auth/me). */
data class PeranPengguna(
    val id: String,
    val nama: String,
    val email: String,
    val peran: Peran,
    val scopeEntitasId: String?,
)

/** Baris proyek untuk daftar/ringkasan (padanan /api/ringkasan). */
data class ProyekRingkas(
    val id: String,
    val kode: String,
    val nama: String,
    val namaEntitas: String,
    val namaPic: String?,
    val status: MkStatusDomain,
    val progres: Int,
    val tenggat: LocalDate?,
    val laporanTerakhir: ZonedDateTime?,
    val namaDivisi: String?,
)

/** Laporan harian proyek (padanan DailyProjectReport + validasi lock.ts). */
data class LaporanHarian(
    val id: String,
    val proyekId: String,
    val tanggal: LocalDate,
    val status: String,
    val progresPct: Int,
    val capaian: String,
    val kendala: String?,
    val terlambat: Boolean,
)

/** Baris daftar eskalasi. */
data class EskalasiRingkas(
    val id: String,
    val ringkasan: String,
    val dibutuhkan: String,
    val status: String,
    val umurHari: Int,
    val lewatSla: Boolean,
)
