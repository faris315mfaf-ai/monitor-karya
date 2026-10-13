package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.AturanPelaporanResponse
import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Aturan pelaporan per PT (/api/admin/report-settings) — panel Statistik
 * Admin PT (BUG-02, padanan src/components/admin/report-settings-card.tsx).
 *
 *   GET ?entityId= — `{ settings }`; Admin PT selalu PT-nya sendiri. 403 bila
 *   peran tidak punya daily:forward / companies:manage atau di luar cakupan.
 *
 *   PUT — badan `{ entityId, ...perubahan }`. Hanya field yang DIKIRIM yang
 *   diubah; `dailyCutoffHour: null` / `weeklyCutoffHour: null` = tanpa jam
 *   batas (24/7). Jam dibulatkan dan dijepit 0..23 oleh server. Galat:
 *   400 {error} entityId kosong / JSON rusak, 403 {error} peran/cakupan,
 *   404 {error} PT tidak ditemukan, 422 {error} hari kerja tidak sah.
 *   Badan dirakit sebagai JsonObject karena mkJson tidak mengirim nilai bawaan
 *   (null eksplisit akan hilang bila memakai DTO ber-default).
 */
interface ReportSettingsApi {

    @GET("api/admin/report-settings")
    suspend fun ambil(@Query("entityId") entityId: String? = null): Response<AturanPelaporanResponse>

    @PUT("api/admin/report-settings")
    suspend fun simpan(@Body body: JsonObject): Response<AturanPelaporanResponse>
}
