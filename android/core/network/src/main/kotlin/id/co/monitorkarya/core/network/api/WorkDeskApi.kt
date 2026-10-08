package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.WorkDeskAksiRequest
import id.co.monitorkarya.core.network.dto.WorkDeskAksiResponse
import id.co.monitorkarya.core.network.dto.WorkDeskPicResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Meja kerja hari ini (src/app/api/work-desk/route.ts) — akun diambil dari sesi,
 * tanpa parameter. GET mengembalikan bentuk menurut peran; Fase 1 memakai
 * [meja] untuk cabang PIC (dekode untuk KADIV/ADMIN menunggu Fase 2).
 */
interface WorkDeskApi {

    /** Meja kerja PIC: proyek yang dipegang, tugas & laporan hari ini, riwayat. */
    @GET("api/work-desk")
    suspend fun meja(): Response<WorkDeskPicResponse>

    /** Aksi Admin PT: "remind-pic" (dengan projectId) / "remind-all-pics". */
    @POST("api/work-desk")
    suspend fun aksi(@Body body: WorkDeskAksiRequest): Response<WorkDeskAksiResponse>
}
