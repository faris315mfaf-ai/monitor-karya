package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.dto.KadivMemberPutRequest
import id.co.monitorkarya.core.network.dto.KadivMemberPutResponse
import id.co.monitorkarya.core.network.dto.KadivMembersResponse
import id.co.monitorkarya.core.network.dto.KadivRemindResponse
import id.co.monitorkarya.core.network.dto.KadivTandaiBacaResponse
import id.co.monitorkarya.core.network.dto.KadivTeamAksiRequest
import id.co.monitorkarya.core.network.dto.KadivTeamResponse
import id.co.monitorkarya.core.network.dto.WeeklySummaryResponse
import id.co.monitorkarya.core.network.dto.WeeklySummarySaveRequest
import id.co.monitorkarya.core.network.dto.WeeklySummarySaveResponse
import id.co.monitorkarya.core.network.dto.WeeklySummarySendRequest
import id.co.monitorkarya.core.network.dto.WeeklySummarySendResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Fitur kepala divisi rute /api/kadiv — tim, keanggotaan, dan ringkasan
 * mingguan untuk Direktur. Semua rute hanya boleh diakses untuk divisi yang
 * akun pimpin (atau, untuk members, Admin PT PT-nya / Super Admin / TI);
 * di luar itu 403 "Divisi ini di luar tanggung jawab Anda".
 *
 *   GET  api/kadiv/team?divisionId=     — ringkasan tim hari ini: anggota,
 *                                         kehadiran, laporan, beban, tren,
 *                                         aktivitas, KPI tepat waktu 30 hari.
 *   POST api/kadiv/team                 — ingatkan anggota yang belum lapor
 *                                         ("remind"), atau tandai/batalkan
 *                                         tanda baca laporan harian satu
 *                                         anggota ("read"/"unread").
 *   GET  api/kadiv/members?divisionId=  — anggota, kandidat (akun PIC di PT
 *                                         yang sama), dan proyek PT.
 *   PUT  api/kadiv/members              — masukkan/keluarkan anggota, atau
 *                                         tautkan/lepas proyek.
 *   GET  api/kadiv/weekly-summary?divisionId=&week= — draf ringkasan + status.
 *   PUT  api/kadiv/weekly-summary       — simpan draf (1–3 poin, 280 huruf).
 *   POST api/kadiv/weekly-summary       — kirim ke Direktur / tarik kembali.
 *
 * Ringkasan ikut ritme laporan mingguan: capaian diserahkan ke Admin PT
 * sebelum Kamis 17.00 WIB, lalu diteruskan ke holding; setelah diteruskan
 * ringkasan ikut beku (409 FORWARDED) dan sejak Jumat 17.00 WIB semua
 * perubahan terkunci (409 LOCKED). Kirim dapat pula terhalang 409
 * PENDING_REVIEW bila masih ada output menunggu review sebelum tenggat serah
 * — lewati dengan confirmPending = true.
 */
interface KadivApi {

    @GET("api/kadiv/team")
    suspend fun tim(@Query("divisionId") divisionId: String? = null): Response<KadivTeamResponse>

    /** POST "remind" — respons {ok, sent[], skipped}. */
    @POST("api/kadiv/team")
    suspend fun ingatkanTim(@Body body: KadivTeamAksiRequest): Response<KadivRemindResponse>

    /** POST "read"/"unread" — respons {ok, reportIds[]}. */
    @POST("api/kadiv/team")
    suspend fun tandaiBacaTim(@Body body: KadivTeamAksiRequest): Response<KadivTandaiBacaResponse>

    @GET("api/kadiv/members")
    suspend fun anggota(@Query("divisionId") divisionId: String): Response<KadivMembersResponse>

    @PUT("api/kadiv/members")
    suspend fun ubahAnggota(@Body body: KadivMemberPutRequest): Response<KadivMemberPutResponse>

    /** [week] kunci ISO "2026-W41"; null = minggu berjalan. */
    @GET("api/kadiv/weekly-summary")
    suspend fun ringkasan(
        @Query("divisionId") divisionId: String? = null,
        @Query("week") week: String? = null,
    ): Response<WeeklySummaryResponse>

    @PUT("api/kadiv/weekly-summary")
    suspend fun simpanRingkasan(@Body body: WeeklySummarySaveRequest): Response<WeeklySummarySaveResponse>

    @POST("api/kadiv/weekly-summary")
    suspend fun kirimRingkasan(@Body body: WeeklySummarySendRequest): Response<WeeklySummarySendResponse>
}
