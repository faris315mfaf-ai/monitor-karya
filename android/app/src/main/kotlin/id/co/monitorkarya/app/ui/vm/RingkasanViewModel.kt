// ViewModel Ringkasan Fase 0 — menarik /api/ringkasan sebagai JsonObject mentah
// (RingkasanApi dari :core-network) lalu mem-parse-nya secara defensif: semua
// field opsional, bentuk lama/baru sama-sama diterima. Bentuk respons acuan:
// src/app/api/ringkasan/route.ts (kind RINGKASAN, scope.entities, projects,
// counts {on,risk,late,done,neutral}, viewer).
package id.co.monitorkarya.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.network.api.RingkasanApi
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/** Status UI Ringkasan: Memuat → Sukses(ringkas) atau Galat(pesan). */
sealed interface RingkasanUiState {
    data object Memuat : RingkasanUiState

    data class Sukses(val data: RingkasanRingkas) : RingkasanUiState

    data class Galat(val pesan: String) : RingkasanUiState
}

/** Hasil parse ringkas /api/ringkasan — semua field opsional (defensif). */
data class RingkasanRingkas(
    val namaPengguna: String?,
    val peran: String?,
    val jumlahProyek: Int?,
    val sesuai: Int?,
    val total: Int?,
    val jumlahEntitas: Int?,
)

@HiltViewModel
class RingkasanViewModel @Inject constructor(
    private val api: RingkasanApi,
) : ViewModel() {

    private val _state = MutableStateFlow<RingkasanUiState>(RingkasanUiState.Memuat)

    /** Status layar Ringkasan. */
    val state: StateFlow<RingkasanUiState> = _state.asStateFlow()

    init {
        muat()
    }

    /** Menarik ringkasan; status kembali ke Memuat dulu supaya layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = RingkasanUiState.Memuat
            _state.value = try {
                val respons = api.ringkasan()
                val isi = respons.body() ?: JsonObject(emptyMap())
                RingkasanUiState.Sukses(parseRingkasan(isi))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Pesan generik — detail teknis tidak dibawa ke UI (padanan serverError web).
                RingkasanUiState.Galat("Ringkasan belum bisa dimuat. Periksa koneksi Anda lalu coba lagi.")
            }
        }
    }

    /** Coba lagi setelah galat. */
    fun ulang() = muat()
}

/**
 * Parse defensif JsonObject → RingkasanRingkas. Semua akses lewat helper aman;
 * field hilang atau salah tipe menjadi null, bukan melempar.
 */
internal fun parseRingkasan(root: JsonObject): RingkasanRingkas {
    val scope = root["scope"].sebagaiObjek()
    val projects = root["projects"].sebagaiArray()
    val counts = root["counts"].sebagaiObjek()
    val on = counts?.angka("on")
    val risk = counts?.angka("risk")
    val late = counts?.angka("late")
    val done = counts?.angka("done")
    val neutral = counts?.angka("neutral")

    // "Sesuai" = on + done (status selesai ikut dihitung beres).
    val sesuai = if (on == null && done == null) null else (on ?: 0) + (done ?: 0)
    val jumlahCounts = if (on == null && risk == null && late == null && done == null && neutral == null) {
        null
    } else {
        (on ?: 0) + (risk ?: 0) + (late ?: 0) + (done ?: 0) + (neutral ?: 0)
    }
    // Total dari counts; bila counts kosong/nol, pakai jumlah proyek.
    val total = jumlahCounts?.takeIf { it > 0 } ?: projects?.size

    // Nama/peran pembuka belum ada di /api/ringkasan saat ini; diterima dari
    // viewer bila kelak ditambah (nama/name, peran/role), selain itu null dan
    // layar memakai sapaan tanpa nama.
    val viewer = root["viewer"].sebagaiObjek()
    val namaPengguna = viewer?.teks("nama") ?: viewer?.teks("name") ?: root.teks("namaPengguna")
    val peran = viewer?.teks("peran") ?: viewer?.teks("role") ?: root.teks("peran")

    return RingkasanRingkas(
        namaPengguna = namaPengguna,
        peran = peran,
        jumlahProyek = projects?.size,
        sesuai = sesuai,
        total = total,
        jumlahEntitas = scope?.angka("entities"),
    )
}

// ---- Helper aman kotlinx.serialization (semua field opsional) ----

private fun JsonElement?.sebagaiObjek(): JsonObject? = this as? JsonObject

private fun JsonElement?.sebagaiArray(): JsonArray? = this as? JsonArray

private fun JsonObject.angka(kunci: String): Int? = (this[kunci] as? JsonPrimitive)?.intOrNull

private fun JsonObject.teks(kunci: String): String? =
    (this[kunci] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotEmpty() }
