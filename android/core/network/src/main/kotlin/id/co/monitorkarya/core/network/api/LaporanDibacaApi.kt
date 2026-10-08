package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.LaporanDibacaRequest
import id.co.monitorkarya.core.network.dto.LaporanDibacaResponse
import id.co.monitorkarya.core.network.dto.OkResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
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

    @DELETE("api/ringkasan/laporan-dibaca")
    suspend fun batalTandai(@Body body: LaporanDibacaRequest): Response<OkResponse>
}
