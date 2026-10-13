package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.LaporanDibacaRequest
import id.co.monitorkarya.core.network.dto.LaporanDibacaResponse
import id.co.monitorkarya.core.network.dto.OkResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.HTTP
import retrofit2.http.POST

/**
 * Tanda "Sudah dibaca" laporan mingguan divisi oleh pengawas
 * (/api/ringkasan/laporan-dibaca) — POST menandai (idempoten), DELETE
 * membatalkan (dipakai toast "Urungkan"). Kedua metode memakai badan
 * {weeklyReportId} — route membaca JSON dari badan, bukan kueri.
 *
 * Hanya laporan yang sudah diserahkan (status selain DRAFT) dan berada di
 * cakupan entitas pemanggil (peran MANAJEMEN, DIREKTUR_ENTITAS,
 * DIREKTUR_SDM_GA, SUPERADMIN); laporan di luar cakupan dijawab 404 sama
 * dengan yang tidak ada, agar keberadaannya tidak bocor.
 */
interface LaporanDibacaApi {

    @POST("api/ringkasan/laporan-dibaca")
    suspend fun tandaiDibaca(@Body body: LaporanDibacaRequest): Response<LaporanDibacaResponse>

    // D1: Retrofit menolak `@DELETE` + `@Body` ("Non-body HTTP method cannot
    // contain @Body") saat dipanggil — pakai @HTTP(hasBody = true). Route web
    // DELETE membaca `req.json()` (src/app/api/ringkasan/laporan-dibaca/route.ts).
    @HTTP(method = "DELETE", path = "api/ringkasan/laporan-dibaca", hasBody = true)
    suspend fun batalTandai(@Body body: LaporanDibacaRequest): Response<OkResponse>
}
