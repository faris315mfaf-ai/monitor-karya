// Kontrak jaringan tab Persetujuan (Fase 3, gelombang A1). Padanan web
// src/components/oversight/approvals-view.tsx yang membaca:
//  - GET  api/ringkasan                 antrean (approvalRequests, deadlineProposals,
//                                       decisions proyek, escalations) + viewer.canDecide*
//  - GET  api/approval-requests?decided=1   riwayat keputusan 14 hari
//  - PATCH api/approval-requests        {id, action approve|reject|undo, note?}
//  - GET  api/approval-requests/berkas  ?id= → {url} tautan bertanda tangan 5 menit
//  - PATCH api/deadline-proposals       {id, action approve|reject|undo, note?}
//  - POST api/projects/approve          {projectId, decision DISETUJUI|DITOLAK, note?}
// Respons ringkasan besar; DTO di sini hanya memetakan kolom yang dipakai tab
// (mkJson ignoreUnknownKeys), semua kolom opsional diberi bawaan.
package id.co.monitorkarya.feature.persetujuan

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Query

/** Berkas pendukung permintaan (tanpa kunci penyimpanan — hanya nama/jenis/ukuran). */
@Serializable
data class BerkasDto(
    val name: String = "",
    val mime: String? = null,
    val size: Long? = null,
)

/** Permintaan materi/anggaran/cuti (shapeApprovals di src/lib/oversight.ts). */
@Serializable
data class PermintaanDto(
    val id: String,
    /** MATERI | ANGGARAN | CUTI. */
    val type: String = "",
    val title: String = "",
    val description: String? = null,
    val amount: Long? = null,
    val entityId: String = "",
    val entityName: String = "",
    val entityCode: String = "",
    val divisionId: String? = null,
    val divisionName: String? = null,
    val projectId: String? = null,
    val projectName: String? = null,
    val requestedById: String = "",
    val requester: String = "Pengaju",
    val requesterRole: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    /** DIAJUKAN | DISETUJUI | DITOLAK | DITARIK. */
    val status: String = "",
    val decidedBy: String? = null,
    val decidedById: String? = null,
    val decidedAt: String? = null,
    val decisionNote: String? = null,
    val file: BerkasDto? = null,
    val createdAt: String? = null,
)

/** Usulan geser tenggat dari PIC (ringkasan.deadlineProposals). */
@Serializable
data class UsulanTenggatDto(
    val id: String,
    val projectId: String = "",
    val projectName: String = "",
    val entityName: String = "",
    val divisionId: String? = null,
    val proposer: String = "",
    val proposedAt: String? = null,
    val previousDate: String? = null,
    val proposedDate: String? = null,
    val reason: String = "",
)

/** Pengajuan proyek yang slot rantainya milik akun ini (ringkasan.decisions, sudah disaring `mine`). */
@Serializable
data class PengajuanProyekDto(
    val id: String,
    val name: String = "",
    val entityName: String = "",
    val proposer: String = "Pengaju",
    val proposedAt: String? = null,
    val slot: String? = null,
)

/** Eskalasi terbuka (DIAJUKAN/DITINJAU) dalam cakupan — ringkasan.escalations. */
@Serializable
data class EskalasiTerbukaDto(
    val id: String,
    val summary: String = "",
    val needed: String = "",
    val status: String = "",
    val raisedAt: String? = null,
    val raisedBy: String? = null,
    val entityName: String = "",
    val entityCode: String = "",
    val ageDays: Int = 0,
    val overdue: Boolean = false,
)

/** Cakupan pembaca ringkasan. */
@Serializable
data class CakupanDto(
    val entities: Int = 0,
    val divisions: Int = 0,
    val global: Boolean = false,
)

/**
 * Izin dari server (ringkasan.viewer). Null = respons lama tanpa kolom; web
 * memperlakukannya sebagai boleh (`!== false`), server tetap menegakkan 403.
 */
@Serializable
data class PemirsaDto(
    val canDecideDeadline: Boolean? = null,
    val canDecideApproval: Boolean? = null,
)

/** Bagian /api/ringkasan yang dipakai tab Persetujuan. */
@Serializable
data class RingkasanPersetujuanResponse(
    val scope: CakupanDto = CakupanDto(),
    val viewer: PemirsaDto? = null,
    val approvalRequests: List<PermintaanDto> = emptyList(),
    val deadlineProposals: List<UsulanTenggatDto> = emptyList(),
    val decisions: List<PengajuanProyekDto> = emptyList(),
    val escalations: List<EskalasiTerbukaDto> = emptyList(),
)

/** GET /api/approval-requests (bawaan / ?decided=1). */
@Serializable
data class DaftarPermintaanResponse(
    val canDecide: Boolean = false,
    val undoMinutes: Int = 15,
    val items: List<PermintaanDto> = emptyList(),
    val pendingMigration: Boolean = false,
)

/** Badan PATCH approval-requests / deadline-proposals; `note` null tidak dikirim. */
@Serializable
data class KeputusanRequest(
    val id: String,
    val action: String,
    val note: String? = null,
) {
    companion object {
        const val SETUJUI = "approve"
        const val TOLAK = "reject"
        const val URUNGKAN = "undo"
    }
}

/** Respons PATCH sukses `{ok, status?, undoMinutes?}` / `{ok, proposal?}`. */
@Serializable
data class KeputusanResponse(
    val ok: Boolean = false,
    val status: String? = null,
    val undoMinutes: Int? = null,
)

/** Badan POST projects/approve. */
@Serializable
data class KeputusanProyekRequest(
    val projectId: String,
    /** DISETUJUI | DITOLAK. */
    val decision: String,
    val note: String? = null,
)

/** Respons POST projects/approve `{ok, lifecycle, pending, approvals, undoToken?}`. */
@Serializable
data class KeputusanProyekResponse(
    val ok: Boolean = false,
    val lifecycle: String? = null,
    val pending: String? = null,
    val undoToken: String? = null,
)

/** Respons GET berkas `{url}`. */
@Serializable
data class TautanBerkasResponse(val url: String = "")

interface PersetujuanApi {

    @GET("api/ringkasan")
    suspend fun ringkasan(): Response<RingkasanPersetujuanResponse>

    @GET("api/approval-requests")
    suspend fun riwayat(@Query("decided") decided: String = "1"): Response<DaftarPermintaanResponse>

    @PATCH("api/approval-requests")
    suspend fun putuskanPermintaan(@Body body: KeputusanRequest): Response<KeputusanResponse>

    @GET("api/approval-requests/berkas")
    suspend fun tautanBerkas(@Query("id") id: String): Response<TautanBerkasResponse>

    @PATCH("api/deadline-proposals")
    suspend fun putuskanTenggat(@Body body: KeputusanRequest): Response<KeputusanResponse>

    @POST("api/projects/approve")
    suspend fun putuskanProyek(@Body body: KeputusanProyekRequest): Response<KeputusanProyekResponse>
}

/** PersetujuanApi dari Retrofit bersama AppModule. */
@Module
@InstallIn(SingletonComponent::class)
object PersetujuanModule {

    @Provides
    @Singleton
    fun persetujuanApi(retrofit: Retrofit): PersetujuanApi = retrofit.create(PersetujuanApi::class.java)
}
