package id.co.monitorkarya.core.network.api

import id.co.monitorkarya.core.network.Idempotensi
import id.co.monitorkarya.core.network.dto.NavBadgesResponse
import id.co.monitorkarya.core.network.dto.ShCommentRequest
import id.co.monitorkarya.core.network.dto.ShDecisionRequest
import id.co.monitorkarya.core.network.dto.ShInboxReadRequest
import id.co.monitorkarya.core.network.dto.ShInboxResponse
import id.co.monitorkarya.core.network.dto.ShOptionsResponse
import id.co.monitorkarya.core.network.dto.ShOverviewResponse
import id.co.monitorkarya.core.network.dto.ShReportListResponse
import id.co.monitorkarya.core.network.dto.ShReportPatchRequest
import id.co.monitorkarya.core.network.dto.ShReportRequest
import id.co.monitorkarya.core.network.dto.ShReportResponse
import id.co.monitorkarya.core.network.dto.ShReviewResponse
import id.co.monitorkarya.core.network.dto.ShReviseRequest
import id.co.monitorkarya.core.network.dto.ShWeekResponse
import id.co.monitorkarya.core.network.dto.SignedRequest
import id.co.monitorkarya.core.network.dto.SignedResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Rute model subholding (web 15–16 Okt 2026). Hak akses ditegakkan server:
 * Admin subholding (options, reports, inbox), Supervisor (review, decision),
 * Superuser & Manajemen (overview). Unggah bukti tetap lewat [EvidenceApi.unggah]
 * dengan targetType `SUBHOLDING_REPORT`.
 */
interface ShApi {

    @GET("api/sh/options")
    suspend fun opsi(): Response<ShOptionsResponse>

    /** `from`/`to` = 'YYYY-MM-DD' WIB; `status` MENUNGGU | PERLU_PERBAIKAN | DISETUJUI; paging 20. */
    @GET("api/sh/reports")
    suspend fun laporan(
        @Query("from") dari: String? = null,
        @Query("to") sampai: String? = null,
        @Query("ptId") ptId: String? = null,
        @Query("status") status: String? = null,
        @Query("q") cari: String? = null,
        @Query("page") halaman: Int? = null,
        @Query("pageSize") ukuran: Int? = null,
    ): Response<ShReportListResponse>

    /** Ulangan berkunci sama dibalas laporan yang sama (tanpa laporan ganda). */
    @POST("api/sh/reports")
    suspend fun buatLaporan(
        @Body body: ShReportRequest,
        @Header(Idempotensi.HEADER) kunciIdempotensi: String? = null,
    ): Response<ShReportResponse>

    @GET("api/sh/reports/{id}")
    suspend fun satuLaporan(@Path("id") id: String): Response<ShReportResponse>

    /** Ubah / kirim ulang (PERLU_PERBAIKAN → MENUNGGU). */
    @PATCH("api/sh/reports/{id}")
    suspend fun ubahLaporan(@Path("id") id: String, @Body body: ShReportPatchRequest): Response<ShReportResponse>

    /** Tarik laporan yang masih menunggu. */
    @DELETE("api/sh/reports/{id}")
    suspend fun tarikLaporan(@Path("id") id: String): Response<Unit>

    @POST("api/sh/reports/{id}/decision")
    suspend fun setujui(@Path("id") id: String, @Body body: ShDecisionRequest): Response<ShReportResponse>

    @POST("api/sh/reports/{id}/decision")
    suspend fun mintaPerbaikan(@Path("id") id: String, @Body body: ShReviseRequest): Response<ShReportResponse>

    @POST("api/sh/reports/{id}/comments")
    suspend fun komentar(@Path("id") id: String, @Body body: ShCommentRequest): Response<ShReportResponse>

    @GET("api/sh/inbox")
    suspend fun kotakMasuk(): Response<ShInboxResponse>

    @POST("api/sh/inbox/read")
    suspend fun tandaiDibaca(@Body body: ShInboxReadRequest): Response<Unit>

    @GET("api/sh/review")
    suspend fun antrean(
        @Query("status") status: String = "MENUNGGU",
        @Query("subholdingId") subholdingId: String? = null,
        @Query("date") tanggal: String? = null,
    ): Response<ShReviewResponse>

    @GET("api/sh/overview")
    suspend fun ringkasan(@Query("date") tanggal: String? = null): Response<ShOverviewResponse>

    @GET("api/sh/overview/week")
    suspend fun pola7Hari(
        @Query("end") akhir: String? = null,
        @Query("subholdingId") subholdingId: String? = null,
    ): Response<ShWeekResponse>

    /** URL bertanda tangan berkelompok (berlaku 5 menit); `size` thumb untuk gambar kecil. */
    @POST("api/evidence/signed")
    suspend fun tautanBertanda(@Body body: SignedRequest): Response<SignedResponse>

    @GET("api/nav-badges")
    suspend fun lencana(): Response<NavBadgesResponse>
}
