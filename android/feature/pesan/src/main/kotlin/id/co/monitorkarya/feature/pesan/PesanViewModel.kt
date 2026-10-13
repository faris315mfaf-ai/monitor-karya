// ViewModel Kotak masuk (pesan-view.tsx). Membuka pesan = buka Sheet detail
// sekaligus PATCH tandai dibaca; tanda baca yang gagal tidak menutup detail,
// hanya memunculkan snackbar. "Tandai semua dibaca" memakai {all:true}.
// D1 (S2): daftar + jumlah belum dibaca dibaca dari KotakMasukRepo (:core:data)
// yang sama dengan lonceng — tanda baca di satu tempat langsung terlihat di
// tempat lain.
package id.co.monitorkarya.feature.pesan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.repo.HasilBaca
import id.co.monitorkarya.core.data.repo.KotakMasuk
import id.co.monitorkarya.core.data.repo.KotakMasukRepo
import id.co.monitorkarya.feature.pesan.data.KotakMasukDto
import id.co.monitorkarya.feature.pesan.data.PesanDto
import id.co.monitorkarya.feature.pesan.data.keKotak
import id.co.monitorkarya.feature.pesan.logika.Saring
import id.co.monitorkarya.feature.pesan.logika.saringPesan
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Snackbar satu-kali. */
data class NotifikasiPesan(val id: Long, val pesan: String)

data class PesanUi(
    /** Muat pertama (belum ada data) → kerangka. */
    val memuat: Boolean = true,
    /** Muat ulang saat data sudah ada → daftar diredupkan. */
    val menyegarkan: Boolean = false,
    val data: KotakMasukDto? = null,
    val galat: String? = null,
    val saring: Saring = Saring.SEMUA,
    val terbukaId: String? = null,
    val menandaiSemua: Boolean = false,
    val notifikasi: NotifikasiPesan? = null,
) {
    val tampil: List<PesanDto> get() = saringPesan(data?.items.orEmpty(), saring)
    val belumDibaca: Int get() = data?.unread ?: 0

    /** Versi terbaru pesan yang sedang terbuka (status baca ikut berubah). */
    val terbuka: PesanDto? get() = terbukaId?.let { id -> data?.items?.firstOrNull { it.id == id } }
}

@HiltViewModel
class PesanViewModel @Inject constructor(
    private val repo: KotakMasukRepo,
) : ViewModel() {

    private val _ui = MutableStateFlow(PesanUi())
    val ui: StateFlow<PesanUi> = _ui.asStateFlow()

    init {
        // Perubahan dari lonceng / ikon (repo bersama) ikut tampil di sini.
        viewModelScope.launch { repo.keadaan.collect { salin(it) } }
        muat()
    }

    fun muat() {
        _ui.update { it.copy(memuat = it.data == null, menyegarkan = it.data != null, galat = null) }
        viewModelScope.launch { muatInternal() }
    }

    private var pernahDibuka = false

    /**
     * Dipanggil setiap Kotak masuk dibuka (C1-S3). ViewModel hidup sepanjang
     * sesi, jadi pembukaan berikutnya menyegarkan daftar (data lama tetap
     * tampil, diredupkan). Pembukaan pertama sudah dimuat oleh init.
     */
    fun dibuka() {
        if (!pernahDibuka) {
            pernahDibuka = true
            return
        }
        muat()
    }

    fun saring(s: Saring) = _ui.update { it.copy(saring = s) }

    /** Buka detail; pesan belum dibaca langsung ditandai (optimistis di repo lalu muat ulang). */
    fun buka(p: PesanDto) {
        _ui.update { it.copy(terbukaId = p.id) }
        if (p.dibaca) return
        viewModelScope.launch {
            when (val h = repo.tandai(listOf(p.id))) {
                is HasilBaca.Sukses -> muatInternal()
                is HasilBaca.Gagal -> kirimNotifikasi(gagalTandai(h.pesan))
            }
            salin(repo.keadaan.value)
        }
    }

    fun tutup() = _ui.update { it.copy(terbukaId = null) }

    fun tandaiSemua() {
        if (_ui.value.menandaiSemua) return
        _ui.update { it.copy(menandaiSemua = true) }
        viewModelScope.launch {
            try {
                when (val h = repo.tandai(null)) {
                    is HasilBaca.Sukses -> muatInternal()
                    is HasilBaca.Gagal -> kirimNotifikasi(gagalTandai(h.pesan))
                }
                salin(repo.keadaan.value)
            } finally {
                _ui.update { it.copy(menandaiSemua = false) }
            }
        }
    }

    fun notifikasiTampil() = _ui.update { it.copy(notifikasi = null) }

    private suspend fun muatInternal() {
        when (val h = repo.muat()) {
            is HasilBaca.Sukses -> _ui.update {
                it.copy(memuat = false, menyegarkan = false, data = h.data.keKotak(), galat = null)
            }
            is HasilBaca.Gagal -> _ui.update {
                // Data lama tetap tampil bila muat ulang gagal; galat penuh hanya tanpa data.
                if (it.data != null) {
                    it.copy(memuat = false, menyegarkan = false, notifikasi = NotifikasiPesan(System.nanoTime(), h.pesan))
                } else {
                    it.copy(memuat = false, menyegarkan = false, galat = h.pesan)
                }
            }
        }
    }

    /** Salin potret repo bersama; potret kosong (belum termuat/di-reset) tidak menghapus galat/kerangka. */
    private fun salin(k: KotakMasuk) {
        _ui.update { if (k.termuat) it.copy(data = k.keKotak()) else it.copy(data = null) }
    }

    private fun kirimNotifikasi(pesan: String) =
        _ui.update { it.copy(notifikasi = NotifikasiPesan(System.nanoTime(), pesan)) }

    private fun gagalTandai(pesan: String): String =
        pesan.ifBlank { "Pesan belum ditandai dibaca. Coba lagi." }
}

/** ViewModel ringan untuk ikon + lencana belum dibaca (angka sama dengan lonceng). */
@HiltViewModel
class PesanIkonViewModel @Inject constructor(
    private val repo: KotakMasukRepo,
) : ViewModel() {

    val belumDibaca: StateFlow<Int> = repo.belumDibaca

    init {
        // ViewModel ini terikat entri beranda (satu per sesi masuk): sesi baru
        // tidak boleh mewarisi angka akun sebelumnya dari repo @Singleton (C1-R8).
        repo.reset()
    }

    /**
     * Tarik jumlah terbaru; galat diabaikan (lencana mempertahankan angka terakhir).
     * Lewat muatBerkala: bila lonceng baru saja menarik, permintaan ini dilewati (C4 P3-1).
     */
    fun segarkan() {
        viewModelScope.launch { repo.muatBerkala() }
    }

    /** Entri beranda dibuang = keluar akun: jangan sisakan angka untuk akun berikutnya. */
    override fun onCleared() {
        repo.reset()
        super.onCleared()
    }
}
