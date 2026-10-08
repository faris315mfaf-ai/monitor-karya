package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.OkResponse
import id.co.monitorkarya.core.network.dto.WeeklyAksiRequest
import id.co.monitorkarya.core.network.dto.WeeklyAksiResponse
import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.core.network.dto.WeeklyItemSaveRequest
import id.co.monitorkarya.core.network.dto.WeeklyItemSaveResponse
import id.co.monitorkarya.core.network.dto.WeeklyMovesRequest
import id.co.monitorkarya.core.network.dto.WeeklyMovesResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Meja capaian mingguan divisi (/api/weekly-input) — papan butir per hari
 * plus lajur "Mingguan" untuk capaian tanpa hari tertentu.
 *
 *   GET ?entityId=&week=  — divisi yang dijawab akun + laporan minggu itu.
 *                           Admin PT terpaku PT-nya; TI/Super Admin boleh
 *                           memilih PT lewat entityId.
 *   PUT                   — tambah/perbarui satu butir. Suntingan menarik
 *                           laporan yang sudah diserahkan/disetujui kembali
 *                           ke DRAFT; laporan yang sudah diteruskan Admin PT
 *                           ke holding ditolak 409 (beku) — koreksi hanya
 *                           lewat buka kunci, dan tetap mempertahankan status.
 *   PATCH                 — pindahkan/urutkan kartu antar hari (tidak menarik
 *                           laporan kembali ke draf).
 *   DELETE ?itemId=       — hapus satu butir beserta seluruh buktinya; butir
 *                           yang sudah dieskalasi tidak boleh dihapus (409).
 *   POST                  — serahkan ("submit", hanya DRAFT) / setujui
 *                           ("approve", hanya MENUNGGU_PERSETUJUAN).
 *
 * Tulisan hanya untuk minggu berjalan sampai Jumat 17.00 WIB (kunci pekan);
 * tenggat serah ke Admin PT Kamis 17.00 WIB. Buka kunci (unlock) yang sedang
 * berlaku membuka semuanya sampai unlockUntil. Galat 409 membawa
 * {error, locked: true, frozen, reason} — lihat KonflikDto.
 */
interface WeeklyInputApi {

    @GET("api/weekly-input")
    suspend fun papan(
        @Query("entityId") entityId: String? = null,
        @Query("week") week: String? = null,
    ): Response<WeeklyInputResponse>

    @PUT("api/weekly-input")
    suspend fun simpanButir(@Body body: WeeklyItemSaveRequest): Response<WeeklyItemSaveResponse>

    @PATCH("api/weekly-input")
    suspend fun pindahkanButir(@Body body: WeeklyMovesRequest): Response<WeeklyMovesResponse>

    @DELETE("api/weekly-input")
    suspend fun hapusButir(@Query("itemId") itemId: String): Response<OkResponse>

    @POST("api/weekly-input")
    suspend fun aksi(@Body body: WeeklyAksiRequest): Response<WeeklyAksiResponse>
}
