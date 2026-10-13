// Kontrak GET /api/work-desk cabang KADIV (src/app/api/work-desk/route.ts,
// kadivDesk) — WorkDeskApi di :core:network hanya mendekode cabang PIC, jadi
// meja kepala divisi punya antarmuka sempit sendiri di zona B1. Bentuk JSON:
//   {kind:"KADIV", today: ISO awal hari WIB,
//    divisions:[{id, name, entityName,
//      history:[{label:"M36", done, total, status|null, onTime}] ×6]}]}
// Modul :app tidak memasang plugin kotlinx-serialization, jadi respons dibaca
// sebagai JsonObject (serializer bawaan pustaka) lalu diurai defensif di sini.
package id.co.monitorkarya.app.ui.mejakadiv

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.GET

interface MejaKadivApi {
    @GET("api/work-desk")
    suspend fun meja(): Response<JsonObject>
}

data class MejaKadivDto(
    val kind: String = "KADIV",
    val today: String = "",
    val divisions: List<MejaKadivDivisiDto> = emptyList(),
)

data class MejaKadivDivisiDto(
    val id: String,
    val name: String = "",
    val entityName: String = "",
    /** Enam minggu terakhir, lama → baru (minggu berjalan terakhir). */
    val history: List<RiwayatMingguKadivDto> = emptyList(),
)

data class RiwayatMingguKadivDto(
    val label: String = "",
    val done: Int = 0,
    val total: Int = 0,
    val status: String? = null,
    val onTime: Boolean = false,
)

/** Badan galat POST /api/weekly-input (422: errors[] per butir). */
data class GalatSerahDto(
    val error: String? = null,
    val errors: List<String> = emptyList(),
)

private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
private fun JsonElement?.arr(): JsonArray? = this as? JsonArray
private fun JsonObject.teks(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
private fun JsonObject.angka(k: String): Int = (this[k] as? JsonPrimitive)?.intOrNull ?: 0
private fun JsonObject.benar(k: String): Boolean = (this[k] as? JsonPrimitive)?.booleanOrNull ?: false

/** Urai respons GET /api/work-desk cabang KADIV; kolom hilang → bawaan. */
fun uraiMejaKadiv(o: JsonObject): MejaKadivDto = MejaKadivDto(
    kind = o.teks("kind") ?: "KADIV",
    today = o.teks("today").orEmpty(),
    divisions = o["divisions"].arr().orEmpty().mapNotNull { e ->
        val d = e.obj() ?: return@mapNotNull null
        val id = d.teks("id") ?: return@mapNotNull null
        MejaKadivDivisiDto(
            id = id,
            name = d.teks("name").orEmpty(),
            entityName = d.teks("entityName").orEmpty(),
            history = d["history"].arr().orEmpty().mapNotNull { h ->
                h.obj()?.let {
                    RiwayatMingguKadivDto(
                        label = it.teks("label").orEmpty(),
                        done = it.angka("done"),
                        total = it.angka("total"),
                        status = it.teks("status"),
                        onTime = it.benar("onTime"),
                    )
                }
            },
        )
    },
)

/** Urai badan galat {error, errors[]} (null bila bukan JSON). */
fun uraiGalatSerah(o: JsonObject?): GalatSerahDto = GalatSerahDto(
    error = o?.teks("error"),
    errors = o?.get("errors").arr().orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull },
)

/** API meja kepala divisi dari Retrofit bersama AppModule (cookie & baseUrl tunggal). */
@Module
@InstallIn(SingletonComponent::class)
object MejaKadivModule {
    @Provides
    @Singleton
    fun mejaKadivApi(retrofit: Retrofit): MejaKadivApi = retrofit.create(MejaKadivApi::class.java)
}
