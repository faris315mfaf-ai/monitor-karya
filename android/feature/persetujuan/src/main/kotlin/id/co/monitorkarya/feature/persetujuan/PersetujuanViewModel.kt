// ViewModel tab Persetujuan: antrean keputusan dari /api/ringkasan + riwayat
// 14 hari, setujui/tolak (alasan wajib) per jenis, Urungkan 15 menit, dan
// tautan berkas pendukung. Izin hanya dari server (viewer.canDecide*,
// decisions `mine`); 403 mencabut tombol baris itu, 409 memuat ulang antrean.
package id.co.monitorkarya.feature.persetujuan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.UndoApi
import id.co.monitorkarya.core.network.dto.UndoRequest
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import retrofit2.Response

sealed interface PersetujuanUiState {
    data object Memuat : PersetujuanUiState
    data class Siap(val meja: MejaPersetujuan) : PersetujuanUiState
    data class Galat(val pesan: String) : PersetujuanUiState
}

/** Sheet rincian satu baris; [menolak] = formulir alasan penolakan terbuka. */
data class DetailPersetujuan(
    val kunci: String,
    val menolak: Boolean = false,
    val alasan: String = "",
    val galat: String? = null,
) {
    val alasanSah: Boolean get() = alasan.trim().length >= MIN_ALASAN
}

/** Cara mengurungkan keputusan terakhir. */
sealed interface TiketUrungkan {
    val jenis: JenisAntrean
    val kunci: String

    /** PATCH {id, action: "undo"} ke rute asal (permintaan / usulan tenggat). */
    data class Patch(override val jenis: JenisAntrean, val id: String) : TiketUrungkan {
        override val kunci: String get() = ItemPersetujuan.kunci(jenis, id)
    }

    /** POST /api/undo dengan tiket dari respons (pengajuan proyek). */
    data class Token(override val jenis: JenisAntrean, val id: String, val token: String) : TiketUrungkan {
        override val kunci: String get() = ItemPersetujuan.kunci(jenis, id)
    }
}

data class NotifikasiPersetujuan(val id: Long, val pesan: String, val urungkan: TiketUrungkan? = null)

/** Tautan bertanda tangan siap dibuka (satu kali). */
data class TautanBerkas(val id: Long, val url: String)

@HiltViewModel
class PersetujuanViewModel @Inject constructor(
    private val api: PersetujuanApi,
    private val undoApi: UndoApi,
) : ViewModel() {

    private val _state = MutableStateFlow<PersetujuanUiState>(PersetujuanUiState.Memuat)
    val state: StateFlow<PersetujuanUiState> = _state.asStateFlow()

    private val _riwayat = MutableStateFlow(RiwayatPersetujuan())
    val riwayat: StateFlow<RiwayatPersetujuan> = _riwayat.asStateFlow()

    private val _detail = MutableStateFlow<DetailPersetujuan?>(null)
    val detail: StateFlow<DetailPersetujuan?> = _detail.asStateFlow()

    /** Kunci baris yang sedang dikirim keputusannya. */
    private val _sibuk = MutableStateFlow<String?>(null)
    val sibuk: StateFlow<String?> = _sibuk.asStateFlow()

    private val _notifikasi = MutableStateFlow<NotifikasiPersetujuan?>(null)
    val notifikasi: StateFlow<NotifikasiPersetujuan?> = _notifikasi.asStateFlow()

    private val _tautan = MutableStateFlow<TautanBerkas?>(null)
    val tautan: StateFlow<TautanBerkas?> = _tautan.asStateFlow()

    private var mulaiSudah = false
    private var ringkasan: RingkasanPersetujuanResponse? = null
    private val diputuskan = mutableMapOf<String, Keputusan>()

    /** Baris yang ditolak server (403) — tampil baca saja. */
    private val izinDicabut = mutableSetOf<String>()

    /**
     * Tiket urungkan per baris (kunci -> tiket + waktu keputusan). Keputusan
     * berikutnya tidak lagi menimpa tiket sebelumnya; tiap baris yang meredup
     * punya tombol Urungkan sendiri selama [JENDELA_URUNGKAN_MS] (C1-R4).
     */
    private val tiketBaris = mutableMapOf<String, Pair<TiketUrungkan, Long>>()

    /** Jam (ms) — dapat diganti di tes. */
    internal var jam: () -> Long = { System.currentTimeMillis() }

    /** Muat pertama; peran tidak dipakai untuk izin (izin dari server). */
    @Suppress("UNUSED_PARAMETER")
    fun mulai(peran: Peran) {
        if (mulaiSudah) return
        mulaiSudah = true
        muat()
    }

    fun muat() {
        viewModelScope.launch {
            _state.value = PersetujuanUiState.Memuat
            diputuskan.clear()
            // Izin bisa berubah (mis. slot sebelumnya sudah menandatangani):
            // muat ulang = percaya lagi pada izin server (C1-S7).
            izinDicabut.clear()
            tiketBaris.clear()
            coroutineScope {
                val a = async { muatAntrean() }
                val b = async { muatRiwayat() }
                a.await()
                b.await()
            }
        }
    }

    fun ulang() = muat()

    private suspend fun muatAntrean() {
        try {
            val res = api.ringkasan()
            if (!res.isSuccessful) {
                _state.value = PersetujuanUiState.Galat("Data belum termuat. ${pesanGalat(res)}")
                return
            }
            ringkasan = res.body() ?: RingkasanPersetujuanResponse()
            susunUlang()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.value = PersetujuanUiState.Galat("Data belum termuat. ${ApiError.dari(e).pesanTampil()}")
        }
    }

    private suspend fun muatRiwayat() {
        _riwayat.value = try {
            val res = api.riwayat()
            if (res.isSuccessful) {
                RiwayatPersetujuan(items = res.body()?.items.orEmpty().mapNotNull { it.keRiwayat() })
            } else {
                RiwayatPersetujuan(galat = pesanGalat(res))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            RiwayatPersetujuan(galat = ApiError.dari(e).pesanTampil())
        }
    }

    private fun susunUlang() {
        val r = ringkasan ?: return
        val sekarang = jam()
        tiketBaris.entries.removeAll { sekarang - it.value.second >= JENDELA_URUNGKAN_MS }
        val meja = susunMeja(r, diputuskan).let { m ->
            fun List<ItemPersetujuan>.sesuaikan() = map {
                it.copy(
                    bisaPutuskan = it.bisaPutuskan && it.kunci !in izinDicabut,
                    bisaUrungkan = it.keputusan != null && it.kunci in tiketBaris,
                )
            }
            m.copy(permintaan = m.permintaan.sesuaikan(), tenggat = m.tenggat.sesuaikan(), proyek = m.proyek.sesuaikan())
        }
        _state.value = PersetujuanUiState.Siap(meja)
        // Sheet ditutup bila barisnya hilang setelah muat ulang.
        _detail.value?.let { d -> if (meja.semua.none { it.kunci == d.kunci }) _detail.value = null }
    }

    private fun item(kunci: String): ItemPersetujuan? =
        (state.value as? PersetujuanUiState.Siap)?.meja?.semua?.firstOrNull { it.kunci == kunci }

    // ---------------------------------------------------------------- Sheet

    fun buka(kunci: String) {
        if (item(kunci) != null) _detail.value = DetailPersetujuan(kunci)
    }

    /** Tolak dari baris: langsung membuka Sheet dengan formulir alasan. */
    fun mintaTolak(kunci: String) {
        if (item(kunci) != null) _detail.value = DetailPersetujuan(kunci, menolak = true)
    }

    fun mulaiTolak() {
        _detail.value = _detail.value?.copy(menolak = true, galat = null)
    }

    fun batalTolak() {
        _detail.value = _detail.value?.copy(menolak = false, alasan = "", galat = null)
    }

    fun ubahAlasan(teks: String) {
        _detail.value = _detail.value?.copy(alasan = teks.take(1000))
    }

    fun tutupSheet() {
        if (_sibuk.value != null && _sibuk.value == _detail.value?.kunci) return
        _detail.value = null
    }

    // ---------------------------------------------------------------- Keputusan

    fun setujui(kunci: String) = putuskan(kunci, setuju = true, alasan = null)

    fun tolak() {
        val d = _detail.value ?: return
        if (!d.alasanSah) {
            _detail.value = d.copy(galat = "Tulis alasan penolakan, minimal $MIN_ALASAN huruf.")
            return
        }
        putuskan(d.kunci, setuju = false, alasan = d.alasan.trim())
    }

    private fun putuskan(kunci: String, setuju: Boolean, alasan: String?) {
        if (_sibuk.value != null) return
        val target = item(kunci) ?: return
        if (!target.bisaPutuskan || target.keputusan != null) return
        viewModelScope.launch {
            _sibuk.value = kunci
            _detail.value?.takeIf { d -> d.kunci == kunci }?.let { d -> _detail.value = d.copy(galat = null) }
            try {
                val hasil = kirim(target, setuju, alasan)
                val res = hasil.first
                if (res.isSuccessful) {
                    diputuskan[kunci] = if (setuju) Keputusan.DISETUJUI else Keputusan.DITOLAK
                    if (_detail.value?.kunci == kunci) _detail.value = null
                    val tiket = when (target.jenis) {
                        JenisAntrean.PERMINTAAN, JenisAntrean.TENGGAT -> TiketUrungkan.Patch(target.jenis, target.id)
                        JenisAntrean.PROYEK -> hasil.second?.let { t -> TiketUrungkan.Token(target.jenis, target.id, t) }
                    }
                    tiket?.let { tiketBaris[kunci] = it to jam() }
                    susunUlang()
                    kabar(pesanKeputusan(target, setuju), tiket)
                    if (target.jenis == JenisAntrean.PERMINTAAN) muatRiwayat()
                } else {
                    tanganiGagal(kunci, res)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                tampilGalat(kunci, ApiError.dari(e).pesanTampil())
            } finally {
                _sibuk.value = null
            }
        }
    }

    /** Kirim ke rute sesuai jenis; kembalikan respons + undoToken (proyek). */
    private suspend fun kirim(item: ItemPersetujuan, setuju: Boolean, alasan: String?): Pair<Response<*>, String?> {
        val aksi = if (setuju) KeputusanRequest.SETUJUI else KeputusanRequest.TOLAK
        return when (item.jenis) {
            JenisAntrean.PERMINTAAN -> api.putuskanPermintaan(KeputusanRequest(item.id, aksi, alasan)) to null
            JenisAntrean.TENGGAT -> api.putuskanTenggat(KeputusanRequest(item.id, aksi, alasan)) to null
            JenisAntrean.PROYEK -> {
                val res = api.putuskanProyek(
                    KeputusanProyekRequest(item.id, if (setuju) "DISETUJUI" else "DITOLAK", alasan),
                )
                res to res.body()?.undoToken
            }
        }
    }

    private suspend fun tanganiGagal(kunci: String, res: Response<*>) {
        val pesan = pesanGalat(res)
        when (res.code()) {
            403 -> {
                izinDicabut += kunci
                susunUlang()
            }
            409 -> muatAntrean()
        }
        tampilGalat(kunci, pesan)
    }

    /** Galat tampil di Sheet bila baris itu sedang terbuka, selain itu snackbar. */
    private fun tampilGalat(kunci: String, pesan: String) {
        val d = _detail.value
        if (d != null && d.kunci == kunci) _detail.value = d.copy(galat = pesan) else kabar(pesan, null)
    }

    // ---------------------------------------------------------------- Urungkan

    /** Urungkan dari snackbar (keputusan terakhir). */
    fun urungkan() {
        val tiket = _notifikasi.value?.urungkan ?: return
        _notifikasi.value = null
        jalankanUrungkan(tiket)
    }

    /** Urungkan dari tombol di baris yang meredup (keputusan mana pun, 15 menit). */
    fun urungkanBaris(kunci: String) {
        val (tiket, waktu) = tiketBaris[kunci] ?: return
        if (jam() - waktu >= JENDELA_URUNGKAN_MS) {
            tiketBaris.remove(kunci)
            susunUlang()
            kabar("Batas urungkan 15 menit sudah lewat.", null)
            return
        }
        if (_notifikasi.value?.urungkan?.kunci == kunci) _notifikasi.value = null
        jalankanUrungkan(tiket)
    }

    private fun jalankanUrungkan(tiket: TiketUrungkan) {
        // Sekali pakai: tombol baris dan snackbar tidak bisa mengirim dua kali.
        tiketBaris.remove(tiket.kunci)
        susunUlang()
        viewModelScope.launch {
            try {
                val res: Response<*> = when (tiket) {
                    is TiketUrungkan.Patch -> {
                        val badan = KeputusanRequest(tiket.id, KeputusanRequest.URUNGKAN)
                        if (tiket.jenis == JenisAntrean.TENGGAT) api.putuskanTenggat(badan) else api.putuskanPermintaan(badan)
                    }
                    is TiketUrungkan.Token -> undoApi.urungkan(UndoRequest(tiket.token))
                }
                if (res.isSuccessful) {
                    diputuskan.remove(tiket.kunci)
                    susunUlang()
                    kabar(pesanUrungkan(tiket.jenis), null)
                    if (tiket.jenis == JenisAntrean.PERMINTAAN) muatRiwayat()
                    if (tiket.jenis == JenisAntrean.PROYEK) muatAntrean()
                } else {
                    kabar(pesanGalat(res), null)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                kabar(ApiError.dari(e).pesanTampil(), null)
            }
        }
    }

    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    // ---------------------------------------------------------------- Berkas

    /** Minta tautan bertanda tangan (5 menit) lalu serahkan ke layar untuk dibuka. */
    fun bukaBerkas(idPermintaan: String) {
        viewModelScope.launch {
            try {
                val res = api.tautanBerkas(idPermintaan)
                val url = res.body()?.url
                if (res.isSuccessful && !url.isNullOrBlank() && tautanAman(url)) {
                    _tautan.value = TautanBerkas(System.nanoTime(), url)
                } else if (res.isSuccessful) {
                    kabar("Berkas belum bisa dibuka.", null)
                } else {
                    kabar(pesanGalat(res), null)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                kabar(ApiError.dari(e).pesanTampil(), null)
            }
        }
    }

    fun tautanTerbuka() {
        _tautan.value = null
    }

    /** Dipanggil layar bila tidak ada aplikasi yang bisa membuka tautan. */
    fun tautanGagal() {
        _tautan.value = null
        kabar("Berkas belum bisa dibuka di perangkat ini.", null)
    }

    private fun kabar(pesan: String, urungkan: TiketUrungkan?) {
        _notifikasi.value = NotifikasiPersetujuan(System.nanoTime(), pesan, urungkan)
    }

    private fun pesanGalat(res: Response<*>): String = ApiError.dari(HttpException(res)).pesanTampil()

    private companion object {
        /** Jendela urungkan server (approval-requests / undo token). */
        const val JENDELA_URUNGKAN_MS = 15 * 60 * 1000L
    }
}
