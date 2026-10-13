// ViewModel arsip laporan mingguan divisi (B1) — GET /api/weekly-reports
// (WeeklyReportsApi) dengan saringan statusHeader, cari, dan halaman 10 baris,
// padanan DivisionsView di src/components/views/divisions-view.tsx. Cakupan
// entitas diberlakukan server menurut sesi (grup/PT). Baca-saja.
package id.co.monitorkarya.app.ui.divisi

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.WeeklyReportsApi
import id.co.monitorkarya.core.network.dto.WeeklyReportsListResponse
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** Data arsip: Memuat (tanpa data lama), Siap, atau Galat. */
sealed interface ArsipData {
    data object Memuat : ArsipData
    data class Siap(val isi: WeeklyReportsListResponse) : ArsipData
    data class Galat(val pesan: String) : ArsipData
}

data class DivisiUi(
    val data: ArsipData = ArsipData.Memuat,
    /** Sedang memuat ulang di atas data lama (daftar diredupkan). */
    val menyegarkan: Boolean = false,
    val halaman: Int = 1,
    val cari: String = "",
    val statusHeader: String? = null,
    /** Laporan yang dibuka di Sheet. */
    val detailId: String? = null,
) {
    val tersaring: Boolean get() = statusHeader != null || cari.isNotBlank()
}

/** Jeda ketik sebelum pencarian dikirim. */
private const val JEDA_CARI_MS = 350L

@HiltViewModel
class DivisiViewModel @Inject constructor(
    private val api: WeeklyReportsApi,
) : ViewModel() {

    private val _ui = MutableStateFlow(DivisiUi())
    val ui: StateFlow<DivisiUi> = _ui.asStateFlow()

    private var tugas: Job? = null

    init {
        muat()
    }

    fun muat(jeda: Long = 0L) {
        tugas?.cancel()
        _ui.update { it.copy(menyegarkan = it.data is ArsipData.Siap, data = if (it.data is ArsipData.Siap) it.data else ArsipData.Memuat) }
        val s = _ui.value
        tugas = viewModelScope.launch {
            if (jeda > 0) delay(jeda)
            val hasil = try {
                val res = api.daftar(
                    page = s.halaman,
                    pageSize = UKURAN_HALAMAN_DIVISI,
                    statusHeader = s.statusHeader,
                    search = s.cari.trim().ifEmpty { null },
                )
                val badan = res.body()
                when {
                    res.isSuccessful && badan != null -> ArsipData.Siap(badan)
                    res.isSuccessful -> ArsipData.Galat("Jawaban server kosong. Coba lagi.")
                    else -> ArsipData.Galat(ApiError.dari(HttpException(res)).pesanTampil())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ArsipData.Galat(ApiError.dari(e).pesanTampil())
            }
            _ui.update { it.copy(data = hasil, menyegarkan = false) }
        }
    }

    fun ulang() = muat()

    fun pilihStatus(statusHeader: String?) {
        _ui.update { it.copy(statusHeader = statusHeader, halaman = 1) }
        muat()
    }

    fun ubahCari(teks: String) {
        _ui.update { it.copy(cari = teks, halaman = 1) }
        muat(jeda = JEDA_CARI_MS)
    }

    fun hapusSaringan() {
        _ui.update { it.copy(cari = "", statusHeader = null, halaman = 1) }
        muat()
    }

    fun halamanSebelumnya() {
        if (_ui.value.halaman <= 1) return
        _ui.update { it.copy(halaman = it.halaman - 1) }
        muat()
    }

    fun halamanBerikutnya() {
        val isi = (_ui.value.data as? ArsipData.Siap)?.isi ?: return
        if (_ui.value.halaman * isi.pageSize >= isi.total) return
        _ui.update { it.copy(halaman = it.halaman + 1) }
        muat()
    }

    fun buka(id: String) = _ui.update { it.copy(detailId = id) }

    fun tutup() = _ui.update { it.copy(detailId = null) }
}
