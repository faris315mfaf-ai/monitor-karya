package id.co.monitorkarya.feature.audit.data

import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Query
import retrofit2.http.Streaming

/**
 * Log aktivitas (rute audit-logs).
 *
 *   GET daftar — page, pageSize (maks 200), actorId, action, targetType,
 *   role (peran pelaku), dateFrom/dateTo "YYYY-MM-DD" (hari WIB; dateTo
 *   mencakup seluruh hari). Pemegang audit:read membaca cakupannya; peran
 *   lain hanya jejaknya sendiri. 400 bila tanggal/peran tidak valid.
 *
 *   GET export — CSV (BOM UTF-8) rentang paling panjang 366 hari, paling
 *   banyak 5000 baris; 403 bila peran tidak mengunduh, 422 rentang salah,
 *   429 bila lebih dari 10 unduhan per 10 menit. Setiap unduhan tercatat.
 */
interface AuditLogApi {

    @GET("api/audit-logs")
    suspend fun daftar(
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int,
        @Query("actorId") actorId: String? = null,
        @Query("action") action: String? = null,
        @Query("targetType") targetType: String? = null,
        @Query("role") role: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
    ): Response<AuditLogListDto>

    @Streaming
    @GET("api/audit-logs/export")
    suspend fun ekspor(
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("action") action: String? = null,
    ): Response<ResponseBody>
}

/**
 * Konsol Sistem & akses (Tim TI / Super Admin).
 *
 *   GET system — 403 bila tanpa users:manage.
 *   GET access-requests?status=all — pemutus melihat seluruh grup.
 *   PATCH access-requests {id, decision, note?} — 403 di luar wewenang,
 *   404 tidak ditemukan, 409 sudah diputuskan, 422 gagal diterapkan.
 *   GET roles — direktori akun per peran (peran global saja).
 *   GET health/ready — {ok, status}; 503 bila tidak tersedia.
 */
interface SistemApi {

    @GET("api/system")
    suspend fun sistem(): Response<SistemDto>

    @GET("api/access-requests")
    suspend fun pengajuanAkses(@Query("status") status: String = "all"): Response<PengajuanAksesListDto>

    @PATCH("api/access-requests")
    suspend fun putuskan(@Body body: PutusanAksesRequest): Response<PutusanAksesResponse>

    @GET("api/roles")
    suspend fun peran(): Response<PeranListDto>

    @GET("api/health/ready")
    suspend fun kesiapan(): Response<KesiapanDto>
}
