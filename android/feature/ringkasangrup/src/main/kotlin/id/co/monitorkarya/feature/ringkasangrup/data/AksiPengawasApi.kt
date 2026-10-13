package id.co.monitorkarya.feature.ringkasangrup.data

import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.HTTP
import retrofit2.http.POST

/**
 * Aksi tulis layar Direktur (B1) — padanan useWeeklyActions di
 * src/components/oversight/weekly-reports.tsx:
 *  - POST/DELETE /api/ringkasan/laporan-dibaca {weeklyReportId}: tandai sudah
 *    dibaca / urungkan. DELETE membawa badan JSON, jadi dideklarasikan lewat
 *    `@HTTP(hasBody = true)` (Retrofit menolak `@DELETE` + `@Body`).
 *  - POST /api/notifications/remind {entityId, divisionId, week}: ingatkan
 *    kepala divisi yang belum mengirim laporan minggu yang tampil; hasil per
 *    divisi di results[].outcome (TERKIRIM | SUDAH_HARI_INI | TANPA_KEPALA).
 * Izin tetap di server (notify:remind; pembaca READERS ringkasan).
 */
interface AksiPengawasApi {

    @POST("api/ringkasan/laporan-dibaca")
    suspend fun tandaiDibaca(@Body body: TandaDibacaRequest): Response<TandaDibacaResponse>

    @HTTP(method = "DELETE", path = "api/ringkasan/laporan-dibaca", hasBody = true)
    suspend fun batalDibaca(@Body body: TandaDibacaRequest): Response<TandaDibacaResponse>

    @POST("api/notifications/remind")
    suspend fun ingatkanDivisi(@Body body: IngatkanDivisiRequest): Response<HasilIngatkanDto>
}

@Serializable
data class TandaDibacaRequest(val weeklyReportId: String)

@Serializable
data class TandaDibacaResponse(
    val ok: Boolean = false,
    val readAt: String? = null,
)

/** [week] "2026-W41"; null tidak dikirim (server memakai minggu berjalan). */
@Serializable
data class IngatkanDivisiRequest(
    val entityId: String,
    val divisionId: String,
    val week: String? = null,
)

@Serializable
data class HasilIngatkanDto(
    val sent: Int = 0,
    val results: List<HasilIngatkanDivisiDto> = emptyList(),
)

@Serializable
data class HasilIngatkanDivisiDto(
    val divisionId: String? = null,
    val outcome: String = "",
)
