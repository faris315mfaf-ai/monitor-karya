// ViewModel meja kerja Kepala divisi (B1) — padanan WorkDeskView cabang
// KADIV (src/components/views/work-desk-view.tsx): GET /api/work-desk (riwayat
// 6 minggu) + GET /api/weekly-input (papan minggu berjalan) dimuat paralel;
// Serahkan/Setujui lewat POST /api/weekly-input jujur daring — galat 409/422
// server final (422 membawa errors[] per butir, ditampilkan sebagai daftar
// "Perbaiki dulu sebelum menyerahkan").
package id.co.monitorkarya.app.ui.mejakadiv

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.WeeklyInputApi
import id.co.monitorkarya.core.network.dto.WeeklyAksiRequest
import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.core.network.mkJson
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import retrofit2.HttpException
import retrofit2.Response

sealed interface MejaKadivState {
    data object Memuat : MejaKadivState
    data class Siap(val meja: MejaKadivDto, val papan: WeeklyInputResponse) : MejaKadivState
    data class Galat(val pesan: String) : MejaKadivState
}

data class PesanKadiv(val id: Long, val teks: String)

data class MejaKadivUi(
    val state: MejaKadivState = MejaKadivState.Memuat,
    val divisiId: String? = null,
    /** "submit" | "approve" saat tombol sedang bekerja. */
    val sibuk: String? = null,
    /** errors[] dari 422 serah/setujui. */
    val masalah: List<String> = emptyList(),
    /** Batang riwayat terpilih; null = minggu terakhir. */
    val batang: Int? = null,
    val pesan: PesanKadiv? = null,
)

@HiltViewModel
class MejaKadivViewModel @Inject constructor(
    private val api: MejaKadivApi,
    private val mingguan: WeeklyInputApi,
) : ViewModel() {

    private val _ui = MutableStateFlow(MejaKadivUi())
    val ui: StateFlow<MejaKadivUi> = _ui.asStateFlow()
    private var nomor = 0L

    /** C3-R7: muat terakhir; muat baru membatalkannya supaya respons lama tidak menimpa yang baru. */
    private var muatJob: Job? = null

    init {
        muat()
    }

    fun muat(diam: Boolean = false) {
        if (!diam) _ui.update { it.copy(state = MejaKadivState.Memuat) }
        muatJob?.cancel()
        muatJob = viewModelScope.launch {
            val hasil = try {
                coroutineScope {
                    val m = async { api.meja() }
                    val p = async { mingguan.papan() }
                    val rm = m.await()
                    val rp = p.await()
                    val meja = rm.body()?.let(::uraiMejaKadiv)
                    val papan = rp.body()
                    when {
                        !rm.isSuccessful -> MejaKadivState.Galat(ApiError.dari(HttpException(rm)).pesanTampil())
                        !rp.isSuccessful -> MejaKadivState.Galat(ApiError.dari(HttpException(rp)).pesanTampil())
                        meja == null || papan == null -> MejaKadivState.Galat("Jawaban server kosong. Coba lagi.")
                        else -> MejaKadivState.Siap(meja, papan)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                MejaKadivState.Galat(ApiError.dari(e).pesanTampil())
            }
            _ui.update { s ->
                val divisiSah = (hasil as? MejaKadivState.Siap)?.papan?.divisions?.any { it.id == s.divisiId } == true
                s.copy(state = hasil, divisiId = if (divisiSah) s.divisiId else null)
            }
        }
    }

    fun ulang() = muat()

    fun pilihDivisi(id: String) = _ui.update { it.copy(divisiId = id, masalah = emptyList(), batang = null) }

    fun pilihBatang(i: Int) = _ui.update { it.copy(batang = i) }

    fun pesanTampil() = _ui.update { it.copy(pesan = null) }

    fun serahkan() = aksi(WeeklyAksiRequest.SUBMIT)

    fun setujui() = aksi(WeeklyAksiRequest.APPROVE)

    private fun aksi(jenis: String) {
        val siap = _ui.value.state as? MejaKadivState.Siap ?: return
        val divisi = siap.papan.divisions.firstOrNull { it.id == _ui.value.divisiId } ?: siap.papan.divisions.firstOrNull() ?: return
        // C3-S7: pagar klik ganda — aksi kedua sebelum tombol nonaktif = 409 palsu.
        if (_ui.value.sibuk != null) return
        _ui.update { it.copy(sibuk = jenis, masalah = emptyList()) }
        viewModelScope.launch {
            val badan = WeeklyAksiRequest(divisionId = divisi.id, week = siap.papan.week.key, action = jenis)
            try {
                val res = mingguan.aksi(badan)
                if (res.isSuccessful) {
                    val teks = if (jenis == WeeklyAksiRequest.SUBMIT) {
                        "Capaian ${divisi.name} diserahkan ke Admin PT."
                    } else {
                        "Capaian ${divisi.name} disetujui."
                    }
                    _ui.update { it.copy(sibuk = null, pesan = PesanKadiv(++nomor, teks)) }
                    muat(diam = true)
                } else {
                    val (pesan, masalah) = galatAksi(res)
                    _ui.update { it.copy(sibuk = null, masalah = masalah, pesan = PesanKadiv(++nomor, pesan)) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _ui.update { it.copy(sibuk = null, pesan = PesanKadiv(++nomor, ApiError.dari(e).pesanTampil())) }
            }
        }
    }
}

/** Pesan + errors[] dari badan galat POST weekly-input (dibaca sekali). */
internal fun galatAksi(res: Response<*>): Pair<String, List<String>> {
    val mentah = runCatching { res.errorBody()?.string() }.getOrNull()
    val obj = mentah?.let { runCatching { mkJson.parseToJsonElement(it) as? JsonObject }.getOrNull() }
    val badan = uraiGalatSerah(obj)
    val pesan = badan.error?.takeIf { it.isNotBlank() } ?: "Belum berhasil. Coba lagi."
    return pesan to badan.errors
}
