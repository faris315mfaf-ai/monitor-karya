package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.IngatkanRequest
import id.co.monitorkarya.core.network.dto.IngatkanResponse
import id.co.monitorkarya.core.network.dto.KepatuhanResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Kepatuhan laporan Admin PT (/api/admin/compliance) [F2-ADMIN].
 *
 *   GET ?entityId= — per divisi: wajib lapor (expected), sudah (reported),
 *   yang belum beserta remindedAt hari ini, peta panas 10 hari kerja
 *   (history), status mingguan MASUK/TERLAMBAT/BELUM, dan kontak kepala
 *   divisi. Admin PT/Direktur selalu PT-nya; peran grup boleh mempersempit
 *   dengan entityId (404 bila PT tidak ditemukan).
 *
 *   POST remind — ingatkan PIC yang belum lapor: tepat satu dari
 *   {userId} | {divisionId} | {all: true}. Respons {ok, people, sent,
 *   skipped}. Galat: 409 {error, locked: true} bila laporan hari ini sudah
 *   dikunci 17.00 WIB; 409 {error, remindedAt} bila orang itu sudah
 *   diingatkan hari ini; 429 bila terlalu sering (limitReminders).
 */
interface AdminComplianceApi {

    @GET("api/admin/compliance")
    suspend fun kepatuhan(@Query("entityId") entityId: String? = null): Response<KepatuhanResponse>

    @POST("api/admin/compliance/remind")
    suspend fun ingatkan(@Body body: IngatkanRequest): Response<IngatkanResponse>
}
