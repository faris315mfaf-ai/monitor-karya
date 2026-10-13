// Kontrak jaringan tab Eskalasi (Fase 3, gelombang A1).
// Padanan server: src/app/api/escalations/route.ts (GET daftar bersaring) dan
// src/app/api/escalations/actions/route.ts (POST review/decide/close).
// Seluruh DTO toleran kolom tambahan (mkJson ignoreUnknownKeys) dan kolom
// opsional diberi bawaan agar respons lama tetap terbaca.
package id.co.monitorkarya.feature.eskalasi

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
import retrofit2.http.POST
import retrofit2.http.Query

/** Entitas (PT) pemilik eskalasi — `include.entity` di GET. */
@Serializable
data class EntitasEskalasiDto(
    val id: String = "",
    val name: String = "",
    val code: String = "",
    val region: String? = null,
)

/** Orang pengaju/pemutus — `include.raisedBy` / `include.decidedBy`. */
@Serializable
data class OrangEskalasiDto(
    val id: String = "",
    val name: String = "",
    val email: String? = null,
)

/**
 * Izin aksi per eskalasi untuk akun ini — kolom `perms` GET daftar (B3),
 * dihitung server dengan `escalationPerms` bersama web. Absen pada server lama:
 * item menjadi baca saja (lihat [keIzin]).
 */
@Serializable
data class IzinEskalasiDto(
    val mayReview: Boolean = false,
    val mayDecide: Boolean = false,
    val mayClose: Boolean = false,
)

/** Satu baris `items[]` GET daftar eskalasi (model Prisma + ageDays/isOverdue). */
@Serializable
data class EskalasiDto(
    val id: String,
    /** TASK | DAILY_REPORT | WEEKLY_ITEM. */
    val sourceType: String = "",
    val sourceId: String = "",
    val summary: String = "",
    /** KEPUTUSAN | ANGGARAN | DUKUNGAN_LINTAS_FUNGSI. */
    val needed: String = "",
    /** DIAJUKAN | DITINJAU | DIPUTUSKAN | DITUTUP. */
    val status: String = "",
    val raisedAt: String? = null,
    val slaDays: Int = 7,
    val ageDays: Int = 0,
    val isOverdue: Boolean = false,
    val decidedAt: String? = null,
    val decisionText: String? = null,
    val entityId: String = "",
    val entity: EntitasEskalasiDto? = null,
    val raisedById: String? = null,
    val raisedBy: OrangEskalasiDto? = null,
    val decidedById: String? = null,
    val decidedBy: OrangEskalasiDto? = null,
    val perms: IzinEskalasiDto? = null,
)

/** Respons GET daftar eskalasi `{items, total, page, pageSize}`. */
@Serializable
data class EskalasiDaftarResponse(
    val items: List<EskalasiDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 50,
)

/** Badan POST aksi: `{action, id, decisionText?}` — kolom null tidak dikirim. */
@Serializable
data class AksiEskalasiRequest(
    val action: String,
    val id: String,
    val decisionText: String? = null,
) {
    companion object {
        const val TINJAU = "review"
        const val PUTUSKAN = "decide"
        const val TUTUP = "close"

        fun tinjau(id: String) = AksiEskalasiRequest(TINJAU, id)
        fun putuskan(id: String, keputusan: String) = AksiEskalasiRequest(PUTUSKAN, id, keputusan)
        fun tutup(id: String) = AksiEskalasiRequest(TUTUP, id)
    }
}

/** Respons sukses aksi `{ok, escalation, undoToken?}`; tiket urungkan 15 menit. */
@Serializable
data class AksiEskalasiResponse(
    val ok: Boolean = false,
    val undoToken: String? = null,
)

/** Rute eskalasi (baseUrl diakhiri "/"). */
interface EskalasiApi {

    /** Daftar bersaring; `overdue` = "true" untuk hanya yang lewat SLA. */
    @GET("api/escalations")
    suspend fun daftar(
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = UKURAN_HALAMAN,
        @Query("status") status: String? = null,
        @Query("needed") needed: String? = null,
        @Query("overdue") overdue: String? = null,
    ): Response<EskalasiDaftarResponse>

    /** Tinjau / putuskan / tutup satu eskalasi. */
    @POST("api/escalations/actions")
    suspend fun aksi(@Body body: AksiEskalasiRequest): Response<AksiEskalasiResponse>

    companion object {
        /** Sama dengan web (pageSize 100). */
        const val UKURAN_HALAMAN = 100
    }
}

/** EskalasiApi dari Retrofit bersama AppModule (cookie jar + baseUrl tunggal). */
@Module
@InstallIn(SingletonComponent::class)
object EskalasiModule {

    @Provides
    @Singleton
    fun eskalasiApi(retrofit: Retrofit): EskalasiApi = retrofit.create(EskalasiApi::class.java)
}
