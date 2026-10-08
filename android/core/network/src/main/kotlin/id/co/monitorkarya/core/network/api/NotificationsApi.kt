package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.NotificationListResponse
import id.co.monitorkarya.core.network.dto.NotificationsInboxResponse
import id.co.monitorkarya.core.network.dto.TandaiBacaRequest
import id.co.monitorkarya.core.network.dto.TandaiBacaResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Query

/**
 * Notifikasi (src/app/api/notifications/route.ts). Dua cabang GET: [kotakMasuk]
 * (inbox=1) untuk lonceng dalam aplikasi — 30 terakhir plus jumlah belum dibaca;
 * [riwayat] untuk log kiriman semua kanal milik akun sendiri.
 */
interface NotificationsApi {

    /** Lonceng dalam aplikasi (channel APLIKASI), terbaru dulu. */
    @GET("api/notifications")
    suspend fun kotakMasuk(@Query("inbox") kotak: String = "1"): Response<NotificationsInboxResponse>

    /** Log kiriman milik akun sendiri, tersaring kanal/status/template. */
    @GET("api/notifications")
    suspend fun riwayat(
        @Query("page") halaman: Int? = null,
        @Query("pageSize") ukuranHalaman: Int? = null,
        @Query("status") status: String? = null,
        /** "EMAIL" | "WHATSAPP" | "APLIKASI". */
        @Query("channel") kanal: String? = null,
        @Query("template") template: String? = null,
    ): Response<NotificationListResponse>

    /** Tandai sejumlah pesan (atau semua) sebagai dibaca. */
    @PATCH("api/notifications")
    suspend fun tandaiBaca(@Body body: TandaiBacaRequest): Response<TandaiBacaResponse>
}
