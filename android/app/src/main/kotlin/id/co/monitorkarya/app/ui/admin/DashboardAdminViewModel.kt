// Dasbor Admin PT (T8-A1, keputusan pemilik 9 Okt — paritas web T8). Padanan
// tab Ringkasan ADMIN_PT: satu kalimat jawaban "x laporan diterima · y sudah
// diteruskan" (GET /api/inbox), dua StatTile, dan satu tombol primer "Teruskan
// laporan ke Direksi (n)" yang meneruskan SELURUH antrean siap berurutan
// mengikuti pola PenerimaanViewModel (T6-C7): kegagalan satu laporan tidak
// memutus loop — hasil parsial "x berhasil, y gagal" tetap dilaporkan, tiap
// sukses mengumpulkan undoToken untuk snackbar "Urungkan" (UndoApi, tiket 15
// menit sekali pakai). Penerusan harian sekaligus membekukan laporannya,
// karena itu tombol dikonfirmasi lewat dialog sebelum loop berjalan.
// LURING (A1-LURING.md §6): "Teruskan laporan ke Direksi" TIDAK diantre — sama
// dengan Penerimaan: pengesahan isi saat itu + jendela Urungkan 15 menit.
package id.co.monitorkarya.app.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.app.ui.penerimaan.AntreanItem
import id.co.monitorkarya.app.ui.penerimaan.MejaPenerimaan
import id.co.monitorkarya.app.ui.penerimaan.NotifikasiPenerimaan
import id.co.monitorkarya.app.ui.penerimaan.StatusAntrean
import id.co.monitorkarya.app.ui.penerimaan.mejaKosong
import id.co.monitorkarya.app.ui.penerimaan.parseMeja
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.InboxApi
import id.co.monitorkarya.core.network.api.UndoApi
import id.co.monitorkarya.core.network.dto.UndoRequest
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import retrofit2.Response

// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Isi dasbor Admin PT dari satu GET /api/inbox. */
data class DasborAdmin(
    /** "Kamis, 8 Oktober 2026 · M41 2026". */
    val konteks: String,
    /** Laporan harian + mingguan yang sudah masuk (reportId terisi). */
    val diterima: Int,
    /** Laporan yang sudah diteruskan ke Direksi (forwardedAt terisi). */
    val diteruskan: Int,
    /** Antrean "Teruskan laporan ke Direksi": harian dulu, lalu mingguan. */
    val antreanSiap: List<AntreanItem>,
) {
    val siapTotal: Int get() = antreanSiap.size

    /** Satu kalimat jawaban di atas dasbor. */
    val jawaban: String get() = "$diterima laporan diterima · $diteruskan sudah diteruskan."
}

/** Status UI layar: Memuat → Siap(dasbor) atau Galat(pesan). */
sealed interface DashboardAdminUiState {
    data object Memuat : DashboardAdminUiState
    data class Siap(val dasbor: DasborAdmin) : DashboardAdminUiState
    data class Galat(val pesan: String) : DashboardAdminUiState
}

/** Keadaan sibuk + notifikasi layar (dikumpulkan satu agar layar ramping). */
data class AktivitasDasbor(
    val sedangTerusSemua: Boolean = false,
    /** Progres penerusan — selesai/total untuk label "Meneruskan (2/5)…". */
    val progresSelesai: Int = 0,
    val progresTotal: Int = 0,
    /** Snackbar satu-kali; undoToken berisi tiket "Urungkan" (kosong = tanpa aksi). */
    val notifikasi: NotifikasiPenerimaan? = null,
)

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class DashboardAdminViewModel @Inject constructor(
    private val inboxApi: InboxApi,
    private val undoApi: UndoApi,
) : ViewModel() {

    private val _state = MutableStateFlow<DashboardAdminUiState>(DashboardAdminUiState.Memuat)

    /** Status layar dasbor Admin PT. */
    val state: StateFlow<DashboardAdminUiState> = _state.asStateFlow()

    private val _aktivitas = MutableStateFlow(AktivitasDasbor())

    /** Tombol sibuk + snackbar satu-kali. */
    val aktivitas: StateFlow<AktivitasDasbor> = _aktivitas.asStateFlow()

    init {
        muat()
    }

    /** Menarik dasbor; status kembali ke Memuat dulu supaya layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = DashboardAdminUiState.Memuat
            muatInternal()
        }
    }

    /** Coba lagi setelah galat. */
    fun ulang() = muat()

    /** Snackbar sudah tampil — bersihkan agar tidak berulang. */
    fun notifikasiTampil() {
        _aktivitas.value = _aktivitas.value.copy(notifikasi = null)
    }

    /**
     * Teruskan berurutan seluruh antrean siap (harian lalu mingguan) — dipanggil
     * setelah pengguna mengonfirmasi dialog. Satu kegagalan tidak memutus loop:
     * hasilnya parsial "x berhasil, y gagal" dengan pesan galat terakhir. Setiap
     * sukses mengumpulkan undoToken — "Urungkan" membatalkan semuanya bergiliran.
     */
    fun teruskanSemua() {
        if (_aktivitas.value.sedangTerusSemua) return
        val antrean = (_state.value as? DashboardAdminUiState.Siap)?.dasbor?.antreanSiap ?: return
        if (antrean.isEmpty()) return
        viewModelScope.launch {
            _aktivitas.value = _aktivitas.value.copy(
                sedangTerusSemua = true,
                progresSelesai = 0,
                progresTotal = antrean.size,
            )
            var berhasil = 0
            var gagal = 0
            var pesanGagal: String? = null
            val tiket = mutableListOf<String>()
            try {
                antrean.forEachIndexed { indeks, item ->
                    try {
                        val res = inboxApi.teruskan(item.jenis.permintaan(item.idLaporan))
                        if (res.isSuccessful) {
                            berhasil++
                            res.body()?.undoToken?.let { tiket.add(it) }
                        } else {
                            gagal++
                            pesanGagal = pesanGalat(res)
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        gagal++
                        pesanGagal = ApiError.dari(e).pesanTampil()
                    }
                    _aktivitas.value = _aktivitas.value.copy(progresSelesai = indeks + 1)
                }
                muatInternal()
                kirimNotifikasi(pesanHasil(berhasil, gagal, pesanGagal), tiket)
            } finally {
                _aktivitas.value = _aktivitas.value.copy(
                    sedangTerusSemua = false,
                    progresSelesai = 0,
                    progresTotal = 0,
                )
            }
        }
    }

    /**
     * Aksi "Urungkan" pada snackbar — urungkan semua tiket penerusan yang
     * terkumpul (masing-masing sekali pakai) memakai POST /api/undo, lalu muat
     * ulang dasbor karena laporan yang diurungkan kembali siap diteruskan.
     */
    fun urungkan() {
        val tiket = _aktivitas.value.notifikasi?.undoToken?.takeIf { it.isNotEmpty() } ?: return
        _aktivitas.value = _aktivitas.value.copy(notifikasi = null)
        viewModelScope.launch {
            var berhasil = 0
            var gagal = 0
            var pesanGagal: String? = null
            var pesanSukses: String? = null
            for (token in tiket) {
                try {
                    val res = undoApi.urungkan(UndoRequest(token))
                    if (res.isSuccessful) {
                        berhasil++
                        pesanSukses = res.body()?.message?.takeIf { it.isNotBlank() }
                    } else {
                        gagal++
                        pesanGagal = pesanGalat(res)
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    gagal++
                    pesanGagal = ApiError.dari(e).pesanTampil()
                }
            }
            muatInternal()
            val pesan = when {
                // BUG-13: tiket campuran harian + mingguan — pesan server tiket
                // terakhir ("Penerusan capaian mingguan diurungkan.") menyesatkan.
                gagal == 0 && berhasil > 1 -> "Penerusan $berhasil laporan ke Direksi diurungkan."
                gagal == 0 -> pesanSukses ?: "Penerusan diurungkan."
                berhasil > 0 -> listOfNotNull("$berhasil diurungkan, $gagal gagal.", pesanGagal).joinToString(" ")
                else -> pesanGagal ?: "Tindakan belum bisa diurungkan. Coba lagi."
            }
            kirimNotifikasi(pesan)
        }
    }

    /** Menarik dasbor tanpa mengubah status ke Memuat (dipakai usai aksi). */
    private suspend fun muatInternal() {
        _state.value = try {
            val res = inboxApi.inbox()
            if (res.isSuccessful) {
                DashboardAdminUiState.Siap(petaDasbor(parseMeja(res.body() ?: mejaKosong())))
            } else {
                DashboardAdminUiState.Galat(pesanGalat(res))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            DashboardAdminUiState.Galat(ApiError.dari(e).pesanTampil())
        }
    }

    /** MejaPenerimaan (parsing bersama Penerimaan) → hitungan dasbor. */
    private fun petaDasbor(meja: MejaPenerimaan): DasborAdmin {
        val semua = meja.harian + meja.mingguan
        return DasborAdmin(
            konteks = meja.konteks,
            diterima = semua.count { it.idLaporan.isNotEmpty() },
            diteruskan = semua.count { it.status == StatusAntrean.DITERUSKAN },
            antreanSiap = meja.antreanSiap,
        )
    }

    private fun kirimNotifikasi(pesan: String, undoToken: List<String> = emptyList()) {
        _aktivitas.value = _aktivitas.value.copy(
            notifikasi = NotifikasiPenerimaan(id = System.nanoTime(), pesan = pesan, undoToken = undoToken),
        )
    }

    /** "3 laporan diteruskan ke Direksi." / "2 laporan diteruskan, 1 gagal. <pesan>". */
    private fun pesanHasil(berhasil: Int, gagal: Int, pesanGagal: String?): String = when {
        berhasil > 0 && gagal == 0 -> "$berhasil laporan diteruskan ke Direksi."
        berhasil > 0 -> listOfNotNull("$berhasil laporan diteruskan, $gagal gagal.", pesanGagal).joinToString(" ")
        else -> pesanGagal ?: "Tidak ada laporan yang diteruskan."
    }

    /** Respons tidak sukses → pesan siap tampil lewat ApiError terpusat. */
    private fun pesanGalat(res: Response<*>): String = ApiError.dari(HttpException(res)).pesanTampil()
}
