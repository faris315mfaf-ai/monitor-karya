package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.DailyReportsListResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Riwayat laporan harian (src/app/api/daily-reports/route.ts, GET).
 * Filter [projectId] pencocokan persis (param drill-down T3-A1); cakupan
 * entitas tetap diberlakukan server menurut sesi.
 */
interface DailyReportsApi {

    /** Daftar laporan harian tersaring, terbaru dulu. */
    @GET("api/daily-reports")
    suspend fun daftar(
        @Query("projectId") projectId: String? = null,
        @Query("page") halaman: Int? = null,
        @Query("pageSize") ukuranHalaman: Int? = null,
        @Query("entityId") entityId: String? = null,
        @Query("status") status: String? = null,
        /** Tanggal ISO; dateFrom >=, dateTo <=. */
        @Query("dateFrom") dari: String? = null,
        @Query("dateTo") sampai: String? = null,
        /** Cari nama proyek (contains, tidak peka kapital). */
        @Query("search") cari: String? = null,
    ): Response<DailyReportsListResponse>
}
