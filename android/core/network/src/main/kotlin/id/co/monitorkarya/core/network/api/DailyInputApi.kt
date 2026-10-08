package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.DailyInputGetResponse
import id.co.monitorkarya.core.network.dto.DailyInputPutResponse
import id.co.monitorkarya.core.network.dto.DailyInputRequest
import id.co.monitorkarya.core.network.dto.OkResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Meja laporan harian (src/app/api/daily-input/route.ts).
 *
 * GET membaca proyek dari SESI (PIC: proyeknya; Admin PT: PT-nya) — bukan dari
 * parameter; satu-satunya query adalah [tanggal] "YYYY-MM-DD" (null = hari ini).
 * Tulis ditolak 409 {error, locked, frozen?, reportId?} setelah diteruskan/
 * dikunci/lewat 17.00 kecuali buka kunci berlaku (lihat ApiError.Konflik).
 */
interface DailyInputApi {

    /** Satu hari kerja: semua proyek yang terlihat + laporan + status kuncinya. */
    @GET("api/daily-input")
    suspend fun meja(@Query("date") tanggal: String? = null): Response<DailyInputGetResponse>

    /** Simpan draf (action "save") atau kirim (action "submit"). */
    @PUT("api/daily-input")
    suspend fun simpan(@Body body: DailyInputRequest): Response<DailyInputPutResponse>

    /** Hapus laporan (bawaan hari ini) selama belum diteruskan ke holding. */
    @DELETE("api/daily-input")
    suspend fun hapus(
        @Query("projectId") projectId: String,
        @Query("date") tanggal: String? = null,
    ): Response<OkResponse>
}
