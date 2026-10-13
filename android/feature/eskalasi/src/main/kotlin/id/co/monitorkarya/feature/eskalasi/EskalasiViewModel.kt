// ViewModel tab Eskalasi: tarik daftar bersaring, buka detail di Sheet,
// jalankan tinjau/putuskan/tutup, tawarkan Urungkan dari undoToken server.
// Galat selalu lewat ApiError.dari(...).pesanTampil(); 403 menyembunyikan
// tombol aksi yang ditolak, 409 memuat ulang karena eskalasi sudah berubah.
package id.co.monitorkarya.feature.eskalasi

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.repo.CacheLayar
import id.co.monitorkarya.core.data.sync.ConnectivityObserver
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.UndoApi
import id.co.monitorkarya.core.network.dto.UndoRequest
import java.io.IOException
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import retrofit2.HttpException
import retrofit2.Response

/** Status layar: Memuat (kerangka) → Siap (papan) atau Galat (pesan + coba lagi). */
sealed interface EskalasiUiState {
    data object Memuat : EskalasiUiState
    /** [tersimpanPada] = waktu potret Room (B6, server tak terjangkau); null = segar. */
    data class Siap(val papan: PapanEskalasi, val memuatUlang: Boolean = false, val tersimpanPada: Long? = null) : EskalasiUiState
    data class Galat(val pesan: String) : EskalasiUiState
}

/** Keadaan Sheet detail satu eskalasi. */
data class DetailEskalasi(
    val item: EskalasiItem,
    /** Formulir keputusan terbuka (menggantikan tombol aksi di kaki Sheet). */
    val memutuskan: Boolean = false,
    val teksKeputusan: String = "",
    /** Aksi yang sedang dikirim; null = diam. */
    val sibuk: AksiEskalasi? = null,
    /** Galat aksi terakhir, tampil di dalam Sheet. */
    val galat: String? = null,
) {
    val keputusanSah: Boolean get() = teksKeputusan.trim().length >= MIN_KEPUTUSAN
}

/** Snackbar satu-kali; [undoToken] null = tanpa tombol Urungkan. */
data class NotifikasiEskalasi(val id: Long, val pesan: String, val undoToken: String? = null)

@HiltViewModel
class EskalasiViewModel @Inject constructor(
    private val api: EskalasiApi,
    private val undoApi: UndoApi,
    /** Potret luring daftar (B6); null di tes JVM tanpa Room. */
    private val cache: CacheLayar? = null,
    /** Pengamat jaringan (B6/N1); null di tes JVM. */
    private val konektivitas: ConnectivityObserver? = null,
) : ViewModel() {

    private val _state = MutableStateFlow<EskalasiUiState>(EskalasiUiState.Memuat)
    val state: StateFlow<EskalasiUiState> = _state.asStateFlow()

    private val _saringan = MutableStateFlow(SaringanEskalasi())
    val saringan: StateFlow<SaringanEskalasi> = _saringan.asStateFlow()

    private val _detail = MutableStateFlow<DetailEskalasi?>(null)
    val detail: StateFlow<DetailEskalasi?> = _detail.asStateFlow()

    private val _notifikasi = MutableStateFlow<NotifikasiEskalasi?>(null)
    val notifikasi: StateFlow<NotifikasiEskalasi?> = _notifikasi.asStateFlow()

    private var peran: Peran? = null
    private var mentah: List<EskalasiDto> = emptyList()
    private var total: Int = 0

    /** Waktu potret Room daftar yang tampil; null = data segar dari server. */
    private var tersimpanPada: Long? = null

    /** Aksi per eskalasi yang ditolak server (403) — tombolnya disembunyikan. */
    private val ditolak = mutableMapOf<String, MutableSet<AksiEskalasi>>()

    /** Aksi yang masih dikirim per id eskalasi (Sheet yang dibuka ulang tetap terkunci). */
    private val berjalan = mutableMapOf<String, AksiEskalasi>()
    private var muatJob: Job? = null

    /** Dipanggil layar dengan peran sesi; idempoten untuk peran yang sama. */
    fun mulai(peranSesi: Peran) {
        if (peran == peranSesi) return
        // Izin per item (termasuk "pengaju boleh menutup") dihitung server lewat `perms`.
        peran = peranSesi
        muat()
    }

    fun ulang() = muat()

    /**
     * B6/N1: layar tersembunyi (tab lain) tidak ikut disusun ulang MKShell saat
     * daring kembali. Saat transisi luring → daring, isi yang berasal dari
     * potret Room atau galat dimuat ulang sendiri, jadi penanda "data
     * tersimpan" tidak tertinggal setelah tersambung lagi.
     */
    init {
        amatiDaring()
    }

    private fun amatiDaring() {
        val k = konektivitas ?: return
        viewModelScope.launch {
            k.daring.distinctUntilChanged().drop(1).filter { it }.collect {
                if (_state.value.let { s -> (s is EskalasiUiState.Siap && s.tersimpanPada != null) || s is EskalasiUiState.Galat }) muat()
            }
        }
    }

    fun pilihStatus(status: StatusEskalasi?) = ubahSaringan(_saringan.value.copy(status = status))

    fun pilihKebutuhan(kebutuhan: KebutuhanEskalasi?) = ubahSaringan(_saringan.value.copy(kebutuhan = kebutuhan))

    fun alihLewatSla() = ubahSaringan(_saringan.value.copy(lewatSla = !_saringan.value.lewatSla))

    fun hapusSaringan() = ubahSaringan(SaringanEskalasi())

    private fun ubahSaringan(baru: SaringanEskalasi) {
        if (baru == _saringan.value) return
        _saringan.value = baru
        muat()
    }

    /** Tarik ulang daftar; data lama tetap tampil (memuatUlang) bila sudah ada. */
    fun muat() {
        if (peran == null) return
        muatJob?.cancel()
        muatJob = viewModelScope.launch {
            val kini = _state.value
            _state.value = if (kini is EskalasiUiState.Siap) kini.copy(memuatUlang = true) else EskalasiUiState.Memuat
            muatInternal()
        }
    }

    private suspend fun muatInternal() {
        val s = _saringan.value
        val kunci = kunciPotret(s)
        try {
            val res = api.daftar(
                status = s.status?.nilai,
                needed = s.kebutuhan?.nilai,
                overdue = if (s.lewatSla) "true" else null,
            )
            if (!res.isSuccessful) {
                _state.value = EskalasiUiState.Galat("Papan eskalasi belum termuat. ${pesanGalat(res)}")
                return
            }
            val isi = res.body() ?: EskalasiDaftarResponse()
            cache?.simpan(kunci, EskalasiDaftarResponse.serializer(), isi)
            mentah = isi.items
            total = isi.total
            tersimpanPada = null
            susunUlang()
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            // B6: server tak terjangkau → potret hari ini untuk saringan yang sama.
            val potret = cache?.ambil(kunci, EskalasiDaftarResponse.serializer())
            if (potret == null) {
                _state.value = EskalasiUiState.Galat("Papan eskalasi belum termuat. ${ApiError.dari(e).pesanTampil()}")
                return
            }
            mentah = potret.nilai.items
            total = potret.nilai.total
            tersimpanPada = potret.disimpanPada
            susunUlang()
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            _state.value = EskalasiUiState.Galat("Papan eskalasi belum termuat. ${ApiError.dari(e).pesanTampil()}")
        }
    }

    /** Hitung ulang item + papan + detail terbuka dari data mentah terakhir. */
    private fun susunUlang() {
        val items = mentah.map { it.keItem(ditolak[it.id].orEmpty()) }
        _state.value = EskalasiUiState.Siap(susunPapan(items, total, _saringan.value), tersimpanPada = tersimpanPada)
        _detail.value?.let { d ->
            val segar = items.firstOrNull { it.id == d.item.id }
            // Izin putuskan dicabut server: mode Putuskan ditutup (C2 S6).
            if (segar != null) _detail.value = d.copy(item = segar, memutuskan = d.memutuskan && segar.izin.putuskan)
        }
    }

    private fun adaDiDaftar(id: String): Boolean = mentah.any { it.id == id }

    // ---------------------------------------------------------------- Sheet

    fun buka(id: String) {
        val item = (state.value as? EskalasiUiState.Siap)?.papan?.items?.firstOrNull { it.id == id } ?: return
        _detail.value = DetailEskalasi(item = item, sibuk = berjalan[id])
    }

    /**
     * Sheet boleh selalu ditutup: ModalBottomSheet sudah tersembunyi sebelum
     * onDismissRequest, jadi menahannya meninggalkan modal tak terlihat yang
     * mengunci layar (C2 S5). Aksi yang berjalan tetap selesai; hasilnya
     * dilaporkan lewat snackbar.
     */
    fun tutupSheet() {
        _detail.value = null
    }

    fun mulaiPutuskan() {
        val d = _detail.value ?: return
        if (!d.item.izin.putuskan) return
        _detail.value = d.copy(memutuskan = true, galat = null)
    }

    fun batalPutuskan() {
        _detail.value = _detail.value?.copy(memutuskan = false, teksKeputusan = "", galat = null)
    }

    fun ubahKeputusan(teks: String) {
        _detail.value = _detail.value?.copy(teksKeputusan = teks.take(4000))
    }

    fun tinjau() = jalankan(AksiEskalasi.TINJAU)

    fun simpanKeputusan() {
        val d = _detail.value ?: return
        if (!d.keputusanSah) {
            _detail.value = d.copy(galat = "Isi keputusan minimal $MIN_KEPUTUSAN karakter agar jelas bagi pelaksana.")
            return
        }
        jalankan(AksiEskalasi.PUTUSKAN)
    }

    fun tutupEskalasi() = jalankan(AksiEskalasi.TUTUP)

    private fun jalankan(aksi: AksiEskalasi) {
        val d = _detail.value ?: return
        if (d.sibuk != null) return
        if (peran == null) return
        val id = d.item.id
        if (berjalan.containsKey(id)) return
        val badan = when (aksi) {
            AksiEskalasi.TINJAU -> AksiEskalasiRequest.tinjau(id)
            AksiEskalasi.PUTUSKAN -> AksiEskalasiRequest.putuskan(id, d.teksKeputusan.trim())
            AksiEskalasi.TUTUP -> AksiEskalasiRequest.tutup(id)
        }
        berjalan[id] = aksi
        _detail.value = d.copy(sibuk = aksi, galat = null)
        viewModelScope.launch {
            try {
                val res = api.aksi(badan)
                berjalan.remove(id)
                if (res.isSuccessful) {
                    // Tutup hanya Sheet eskalasi ini — bukan eskalasi lain yang dibuka sesudahnya.
                    if (_detail.value?.item?.id == id) _detail.value = null
                    kirim(pesanSukses(aksi), res.body()?.undoToken)
                    muatInternal()
                    return@launch
                }
                val pesan = ApiError.dari(HttpException(res)).pesanTampil()
                val kode = res.code()
                when (kode) {
                    // Server menolak peran/cakupan: tombol aksi itu tidak ditawarkan lagi.
                    403 -> {
                        ditolak.getOrPut(id) { mutableSetOf() }.add(aksi)
                        susunUlang()
                    }
                    // Eskalasi berubah di pihak lain: tarik keadaan terbaru.
                    409 -> muatInternal()
                }
                laporGalat(id, pesan, tutupModePutuskan = kode == 403 || kode == 409)
            } catch (e: CancellationException) {
                berjalan.remove(id)
                throw e
            } catch (e: Exception) {
                berjalan.remove(id)
                laporGalat(id, ApiError.dari(e).pesanTampil(), tutupModePutuskan = false)
            }
        }
    }

    /**
     * Galat aksi ke Sheet eskalasi asal bila masih terbuka; bila Sheet sudah
     * ditutup/berganti, atau eskalasi keluar dari daftar setelah dimuat ulang
     * (409), Sheet ditutup dan pesan tampil di snackbar (C2 S5/S6).
     */
    private fun laporGalat(id: String, pesan: String, tutupModePutuskan: Boolean) {
        val d = _detail.value
        when {
            d == null || d.item.id != id -> kirim(pesan, null)
            tutupModePutuskan && !adaDiDaftar(id) -> {
                _detail.value = null
                kirim(pesan, null)
            }
            else -> _detail.value = d.copy(
                sibuk = null,
                galat = pesan,
                memutuskan = d.memutuskan && !tutupModePutuskan && d.item.izin.putuskan,
            )
        }
    }

    // ---------------------------------------------------------------- Urungkan

    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    /** POST /api/undo dengan tiket dari aksi terakhir, lalu muat ulang. */
    fun urungkan() {
        val token = _notifikasi.value?.undoToken ?: return
        if (peran == null) return
        _notifikasi.value = null
        viewModelScope.launch {
            val pesan = try {
                val res = undoApi.urungkan(UndoRequest(token))
                if (res.isSuccessful) {
                    res.body()?.message?.takeIf { it.isNotBlank() } ?: "Tindakan diurungkan."
                } else {
                    pesanGalat(res)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ApiError.dari(e).pesanTampil()
            }
            muatInternal()
            kirim(pesan, null)
        }
    }

    private fun kirim(pesan: String, undoToken: String?) {
        _notifikasi.value = NotifikasiEskalasi(System.nanoTime(), pesan, undoToken)
    }

    private fun pesanGalat(res: Response<*>): String = ApiError.dari(HttpException(res)).pesanTampil()

    private companion object {
        /** Kunci CacheLayar per hari WIB + saringan (uid ditambahkan CacheLayar). */
        fun kunciPotret(s: SaringanEskalasi): String =
            "pemantau:eskalasi:${Wib.hariIni()}:${s.status?.nilai.orEmpty()}:${s.kebutuhan?.nilai.orEmpty()}:${s.lewatSla}"
    }
}
