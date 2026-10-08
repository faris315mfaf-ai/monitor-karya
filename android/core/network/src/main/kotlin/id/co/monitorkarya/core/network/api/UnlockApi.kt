package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.UnlockCreateRequest
import id.co.monitorkarya.core.network.dto.UnlockCreateResponse
import id.co.monitorkarya.core.network.dto.UnlockListResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Buka kunci laporan (src/app/api/unlock-requests/route.ts).
 * Fase 1 (PIC): GET daftar miliknya + POST mengajukan. PATCH approve/reject/
 * execute/relock milik Admin PT — ditambahkan di Fase 2.
 */
interface UnlockApi {

    /** Daftar pengajuan dalam cakupan akun (PIC: miliknya sendiri). */
    @GET("api/unlock-requests")
    suspend fun daftar(
        @Query("page") halaman: Int? = null,
        @Query("pageSize") ukuranHalaman: Int? = null,
        /** "DIAJUKAN" | "DISETUJUI" | "DITOLAK" | "DIEKSEKUSI". */
        @Query("status") status: String? = null,
    ): Response<UnlockListResponse>

    /** Ajukan buka kunci satu laporan (targetType DAILY_REPORT/WEEKLY_REPORT). */
    @POST("api/unlock-requests")
    suspend fun ajukan(@Body body: UnlockCreateRequest): Response<UnlockCreateResponse>
}
