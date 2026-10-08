package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.WeeklyReportsListResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Arsip laporan mingguan divisi (/api/weekly-reports) — hanya GET.
 *
 * Terpaginasi (bawaan halaman 1, ukuran 20; ukuran maks 200), urut isoYear
 * turun, isoWeek turun, updatedAt turun. Cakupan mengikuti sesi: peran grup
 * (Manajemen/Super Admin) membaca seluruh grup, lainnya terbatas entitasnya.
 *
 * Saringan (semua opsional, null tidak dikirim):
 *   entityId     — persempit ke satu PT;
 *   statusHeader — DRAFT | MENUNGGU_PERSETUJUAN | DISETUJUI | TERKUNCI;
 *   search       — cocok nama divisi, nama PT, atau region (tidak peka huruf);
 *   isoYear/isoWeek — satu pekan ISO tertentu (mis. 2026 + 41).
 *
 * Ringkasan [WeeklyReportsListResponse.summary] menghitung waiting
 * (MENUNGGU_PERSETUJUAN) dan late (isLate) pada saringan yang sama.
 */
interface WeeklyReportsApi {

    @GET("api/weekly-reports")
    suspend fun daftar(
        @Query("page") page: Int? = null,
        @Query("pageSize") pageSize: Int? = null,
        @Query("entityId") entityId: String? = null,
        @Query("statusHeader") statusHeader: String? = null,
        @Query("search") search: String? = null,
        @Query("isoYear") isoYear: Int? = null,
        @Query("isoWeek") isoWeek: Int? = null,
    ): Response<WeeklyReportsListResponse>
}
