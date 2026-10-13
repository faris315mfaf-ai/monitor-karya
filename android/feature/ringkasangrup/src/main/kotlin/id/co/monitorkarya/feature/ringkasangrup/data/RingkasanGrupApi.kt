package id.co.monitorkarya.feature.ringkasangrup.data

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Route baca-saja dashboard pemantau grup. Izin ditegakkan server:
 * management-charts dan late-incidents menolak peran pelaksana (403),
 * kpi-trends dan compliance-map menolak akun non-global tanpa entitas (403).
 * Cakupan entitas (scopeEntityIds) juga dari server — klien tidak menyaring.
 */
interface RingkasanGrupApi {

    /** Ringkasan pemantau (route ringkasan). */
    @GET("api/ringkasan")
    suspend fun ringkasan(): Response<RingkasanGrupDto>

    /** Laporan harian terbaru satu proyek untuk Sheet drill-down. */
    @GET("api/daily-reports")
    suspend fun laporanProyek(
        @Query("projectId") projectId: String,
        @Query("pageSize") ukuran: Int = 14,
    ): Response<HalamanLaporanDto>

    /** Enam seri grafik kepatuhan grup. */
    @GET("api/management-charts")
    suspend fun grafikManajemen(): Response<GrafikManajemenDto>

    /** Tren KPI bulanan 6 bulan. */
    @GET("api/kpi-trends")
    suspend fun trenKpi(): Response<TrenKpiDto>

    /** Pohon kepatuhan (sub-holding/PT) bulan berjalan. */
    @GET("api/compliance-map")
    suspend fun petaKepatuhan(): Response<PetaKepatuhanDto>

    /** Insiden keterlambatan berulang, terbaru dulu. */
    @GET("api/late-incidents")
    suspend fun insidenTerlambat(@Query("pageSize") ukuran: Int = 20): Response<HalamanInsidenDto>
}
