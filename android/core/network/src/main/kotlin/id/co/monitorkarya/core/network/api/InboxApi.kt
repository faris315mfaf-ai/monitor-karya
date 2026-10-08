package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.InboxResponse
import id.co.monitorkarya.core.network.dto.TeruskanRequest
import id.co.monitorkarya.core.network.dto.TeruskanResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Penerimaan Admin PT (/api/inbox) — dua arus laporan (harian per proyek,
 * mingguan per divisi) beserta status serah terimanya ke holding.
 *
 *   GET  — meja hari/pekan berjalan: siapa sudah kirim, siapa siap diteruskan.
 *   POST — teruskan SATU laporan; body {kind: "daily"|"weekly", id} dengan
 *          id = id laporan (bukan id proyek/divisi). Respons sukses
 *          {ok: true, undoToken?} — undoToken hanya bila tiket urungkan
 *          berhasil diterbitkan (F2-URUNGKAN, 15 menit, sekali pakai).
 *
 * Galat yang mungkin (badan {error}, urai dengan GalatDto bila perlu):
 *   400 id kosong/badan rusak · 403 di luar wewenang/entitas · 404 laporan
 *   tidak ada · 422 PIC belum kirim / kepala divisi belum menyetujui ·
 *   409 "Laporan ini sudah diteruskan" (klik ganda aman: klaim bersyarat).
 * Teruskan harian SEKALIGUS mengunci laporan (dibekukan, 6 Okt 2026).
 */
interface InboxApi {

    @GET("api/inbox")
    suspend fun inbox(): Response<InboxResponse>

    @POST("api/inbox")
    suspend fun teruskan(@Body body: TeruskanRequest): Response<TeruskanResponse>
}
