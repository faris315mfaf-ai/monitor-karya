package id.co.monitorkarya.feature.notifikasi

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.repo.HasilBaca
import id.co.monitorkarya.core.data.repo.KotakMasuk
import id.co.monitorkarya.core.data.repo.KotakMasukRepo
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Lonceng notifikasi dalam aplikasi: GET /api/notifications?inbox=1 (30
 * terbaru + jumlah belum dibaca), PATCH {ids ≤200} atau {all:true}.
 *
 * D1 (S2): daftar, jumlah belum dibaca, tanda baca optimistis, dan penjaga
 * balapan C1-S5 kini tinggal di [KotakMasukRepo] (:core:data) yang juga dibaca
 * ikon Pesan — lencana lonceng dan Pesan selalu sama. ViewModel ini hanya
 * memegang keadaan tampil (memuat/galat) dan membatalkan muat lamanya sendiri.
 */
@HiltViewModel
class NotifikasiViewModel @Inject constructor(
    private val repo: KotakMasukRepo,
) : ViewModel() {

    private val _ui = MutableStateFlow(LoncengUi())

    val ui: StateFlow<LoncengUi> = _ui.asStateFlow()

    private var jobMuat: Job? = null

    init {
        // Tanda baca dari Kotak masuk (repo bersama) ikut menurunkan lencana di sini.
        viewModelScope.launch { repo.keadaan.collect { salin(it) } }
    }

    /** Tarik ulang daftar sekarang (Sheet dibuka, "Coba lagi"). */
    fun muat() = jalankanMuat { repo.muat() }

    /**
     * Tarik berkala ±60 detik: dilewati bila ikon Pesan baru saja menarik data
     * yang sama dari repo bersama (C4 P3-1 — satu permintaan per menit, bukan dua).
     */
    fun muatBerkala() = jalankanMuat { repo.muatBerkala() }

    private fun jalankanMuat(tarik: suspend () -> HasilBaca<KotakMasuk>) {
        jobMuat?.cancel()
        jobMuat = viewModelScope.launch {
            _ui.update { it.copy(memuat = true) }
            when (val h = tarik()) {
                is HasilBaca.Sukses -> {
                    salin(h.data)
                    _ui.update { it.copy(memuat = false, galat = null) }
                }
                is HasilBaca.Gagal -> _ui.update { it.copy(memuat = false, galat = h.pesan) }
            }
        }
    }

    /** Tandai satu pesan dibaca (ketuk baris). */
    fun tandaiBaca(id: String) {
        val n = _ui.value.daftar.firstOrNull { it.id == id } ?: return
        if (n.dibaca) return
        kirim(listOf(id))
    }

    /** "Tandai semua dibaca". */
    fun tandaiSemua() {
        if (_ui.value.belumDibaca == 0) return
        kirim(null)
    }

    /** Tandai sekumpulan id (repo memotong ≤200 per panggilan sesuai batas server). */
    fun tandaiBanyak(ids: List<String>) {
        if (ids.isEmpty()) return
        kirim(ids)
    }

    /** Gagal → repo melepas tanda lokal dan memuat ulang dari server sendiri. */
    private fun kirim(ids: List<String>?) {
        viewModelScope.launch {
            repo.tandai(ids)
            salin(repo.keadaan.value)
        }
        // Optimistis: repo sudah menerbitkan tanda lokal secara sinkron.
        salin(repo.keadaan.value)
    }

    private fun salin(k: KotakMasuk) {
        _ui.update {
            it.copy(
                belumDibaca = k.belumDibaca,
                daftar = k.items.map { n -> n.keNotifikasi() },
                termuat = k.termuat,
            )
        }
    }
}
