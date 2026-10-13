// ViewModel Ringkasan peran pelaksana (B1): GET /api/my-dashboard (cabang
// PIC/KADIV) lewat DasborPeranApi, diurai defensif oleh uraiDasborPeran.
// Baca-saja; tindakan membuka tab lain (Laporan harian, Capaian mingguan, …).
package id.co.monitorkarya.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.app.ui.ringkasan.DasborPeran
import id.co.monitorkarya.app.ui.ringkasan.DasborPeranApi
import id.co.monitorkarya.app.ui.ringkasan.denganBuktiNyata
import id.co.monitorkarya.core.network.api.WeeklyInputApi
import id.co.monitorkarya.app.ui.ringkasan.uraiDasborPeran
import id.co.monitorkarya.core.network.ApiError
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

sealed interface DasborPelaksanaState {
    data object Memuat : DasborPelaksanaState
    data class Siap(val dasbor: DasborPeran) : DasborPelaksanaState
    data class Galat(val pesan: String) : DasborPelaksanaState
}

data class RingkasanPelaksanaUi(
    val state: DasborPelaksanaState = DasborPelaksanaState.Memuat,
    /** Indeks proyek terpilih (PIC multi-proyek). */
    val proyek: Int = 0,
    /** Saringan status butir (Kadiv); null = semua. */
    val saringButir: String? = null,
)

@HiltViewModel
class RingkasanPelaksanaViewModel @Inject constructor(
    private val api: DasborPeranApi,
    private val mingguan: WeeklyInputApi,
) : ViewModel() {

    private val _ui = MutableStateFlow(RingkasanPelaksanaUi())
    val ui: StateFlow<RingkasanPelaksanaUi> = _ui.asStateFlow()

    private var jobMuat: Job? = null

    private val _menyegarkan = MutableStateFlow(false)

    /** Tarik-untuk-muat-ulang sedang berjalan. */
    val menyegarkan: StateFlow<Boolean> = _menyegarkan.asStateFlow()

    init {
        muat()
    }

    fun muat() {
        _ui.update { it.copy(state = DasborPelaksanaState.Memuat) }
        jobMuat = viewModelScope.launch { _ui.update { it.copy(state = tarik()) } }
    }

    /**
     * E2E-R2 N3: tab Ringkasan tampil lagi → muat ulang diam-diam (tanpa
     * kerangka). Galat muat ulang diam tidak menghapus ringkasan yang tampil.
     */
    fun saatTampil() {
        if (jobMuat?.isActive == true) return
        if (_ui.value.state !is DasborPelaksanaState.Siap) {
            muat()
            return
        }
        jobMuat = viewModelScope.launch { terapkanDiam(tarik()) }
    }

    /** Tarik-untuk-muat-ulang. */
    fun segarkan() {
        if (_menyegarkan.value) return
        if (_ui.value.state !is DasborPelaksanaState.Siap) {
            muat()
            return
        }
        _menyegarkan.value = true
        jobMuat = viewModelScope.launch {
            try {
                terapkanDiam(tarik())
            } finally {
                _menyegarkan.value = false
            }
        }
    }

    private fun terapkanDiam(hasil: DasborPelaksanaState) {
        if (hasil is DasborPelaksanaState.Siap) _ui.update { it.copy(state = hasil) }
    }

    private suspend fun tarik(): DasborPelaksanaState = try {
        val res = api.dasbor()
        val badan = res.body()
        when {
            !res.isSuccessful -> DasborPelaksanaState.Galat(ApiError.dari(HttpException(res)).pesanTampil())
            badan == null -> DasborPelaksanaState.Galat("Jawaban server kosong. Coba lagi.")
            else -> DasborPelaksanaState.Siap(buktiNyata(uraiDasborPeran(badan)))
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        DasborPelaksanaState.Galat(ApiError.dari(e).pesanTampil())
    }

    /** N5: Kadiv — hitungan bukti dari baris nyata weekly-input; gagal → angka my-dashboard. */
    private suspend fun buktiNyata(d: DasborPeran): DasborPeran {
        if (d !is DasborPeran.Kadiv) return d
        val papan = try {
            mingguan.papan().takeIf { it.isSuccessful }?.body()
        } catch (e: CancellationException) {
            throw e
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            null
        } ?: return d
        return DasborPeran.Kadiv(d.data.denganBuktiNyata(papan))
    }

    fun ulang() = muat()

    fun pilihProyek(i: Int) = _ui.update { it.copy(proyek = i) }

    fun saringButir(status: String?) = _ui.update { it.copy(saringButir = status) }
}
