package id.co.monitorkarya.core.network.dto

import kotlinx.serialization.Serializable

/**
 * DTO aturan pelaporan per PT (BUG-02). Bentuknya persis dari rute
 * src/app/api/admin/report-settings/route.ts: GET dan PUT sama-sama menjawab
 * `{ settings }` — baris Prisma ReportSettings, atau `null` bila PT belum
 * pernah mengatur (server lalu memakai DEFAULT_SETTINGS: 17.00, Senin–Jumat).
 *
 *   dailyCutoffHour  null = 24/7 (tanpa jam batas harian), selain itu 0..23 WIB
 *   workingDays      hari ISO 1 (Senin)..7 (Minggu); kosong = setiap hari
 *   dailyOpen        false = pengisian laporan harian ditutup
 *   weeklyCutoffHour null = tanpa jam batas mingguan, selain itu 0..23 WIB
 *   weeklyOpen       false = capaian mingguan ditutup
 *
 * Badan PUT sengaja tidak memakai DTO ini: field yang tidak dikirim berarti
 * "jangan diubah", sedangkan `null` eksplisit berarti 24/7. Pemanggil merakit
 * JsonObject sendiri (lihat ReportSettingsApi).
 */
@Serializable
data class AturanPelaporanResponse(
    val settings: AturanPelaporanDto? = null,
)

@Serializable
data class AturanPelaporanDto(
    val entityId: String? = null,
    val dailyCutoffHour: Int? = null,
    val workingDays: List<Int> = emptyList(),
    val dailyOpen: Boolean = true,
    val weeklyCutoffHour: Int? = null,
    val weeklyOpen: Boolean = true,
    val updatedAt: String? = null,
)
