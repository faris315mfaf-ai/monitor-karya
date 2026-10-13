// ViewModel layar Direktur entitas (B1) — padanan DirectorDashboard +
// useWeeklyActions (src/components/oversight/director-dashboard.tsx,
// weekly-reports.tsx). Satu sumber /api/ringkasan; saringan divisi dan status
// lokal; tanda "sudah dibaca" (dengan Urungkan) dan pengingat kepala divisi
// jujur daring — hasil server final, tidak diantrekan.
package id.co.monitorkarya.feature.ringkasangrup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.repo.CacheLayar
import id.co.monitorkarya.core.data.sync.ConnectivityObserver
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.feature.ringkasangrup.data.AksiPengawasApi
import id.co.monitorkarya.feature.ringkasangrup.data.DivisiGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.IngatkanDivisiRequest
import id.co.monitorkarya.feature.ringkasangrup.data.KunciPotret
import id.co.monitorkarya.feature.ringkasangrup.data.LaporanHarianGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupApi
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.TandaDibacaRequest
import id.co.monitorkarya.feature.ringkasangrup.data.ambilDaringDulu
import id.co.monitorkarya.feature.ringkasangrup.logika.KeadaanMingguan
import id.co.monitorkarya.feature.ringkasangrup.logika.StatusRingkas
import id.co.monitorkarya.feature.ringkasangrup.logika.kunciLaporanDivisi
import id.co.monitorkarya.feature.ringkasangrup.logika.kunciMingguLaporan
import id.co.monitorkarya.feature.ringkasangrup.logika.labelDivisiUnik
import id.co.monitorkarya.feature.ringkasangrup.logika.pengingatTercatat
import id.co.monitorkarya.feature.ringkasangrup.logika.teksHasilIngatkan
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** Pesan satu kali (snackbar); [urungkanDivisi] terisi untuk tanda baca yang bisa diurungkan. */
data class PesanDirektur(val id: Long, val teks: String, val urungkanDivisi: String? = null)

data class RingkasanDirekturUi(
    val ringkasan: Bagian<RingkasanGrupDto> = Bagian.Memuat,
    /** Saringan divisi; null = semua divisi. */
    val divisiId: String? = null,
    /** Saringan status kartu proyek; null = semua. */
    val saringStatus: StatusRingkas? = null,
    /** Penimpaan keadaan laporan mingguan per kunci laporan (tandai dibaca/urungkan). */
    val timpaKeadaan: Map<String, String> = emptyMap(),
    /** Divisi yang sudah diingatkan dari layar ini. */
    val diingatkan: Set<String> = emptySet(),
    /**
     * Divisi yang sedang diproses — per divisi (C4 P2-5): aksi divisi lain yang
     * selesai lebih dulu tidak mengaktifkan kembali tombol divisi ini.
     */
    val sibuk: Set<String> = emptySet(),
    /** Sheet laporan mingguan divisi terbuka. */
    val sheetDivisi: String? = null,
    /** Sheet proyek terbuka + laporan hariannya (dimuat malas). */
    val sheetProyek: String? = null,
    val laporanProyek: Bagian<List<LaporanHarianGrupDto>> = Bagian.Memuat,
    /** Titik tren output terpilih; null = minggu terakhir. */
    val titikTren: Int? = null,
    val pesan: PesanDirektur? = null,
    /** B6: waktu potret Room yang tampil karena server tak terjangkau; null = data segar. */
    val tersimpanPada: Long? = null,
) {
    private val data: RingkasanGrupDto? get() = (ringkasan as? Bagian.Siap)?.data

    /** Kunci minggu laporan untuk pengingat & kunci laporan. */
    val kunciMinggu: String? get() = kunciMingguLaporan(data?.reportWeek)

    /** Keadaan laporan mingguan divisi setelah penimpaan lokal. */
    fun keadaan(d: DivisiGrupDto): String = timpaKeadaan[kunciLaporanDivisi(d, kunciMinggu)] ?: d.weekly.state
}

@HiltViewModel
class RingkasanDirekturViewModel @Inject constructor(
    private val api: RingkasanGrupApi,
    private val aksi: AksiPengawasApi,
    /** Potret luring (B6); null di tes JVM tanpa Room. */
    private val cache: CacheLayar? = null,
    /** Pengamat jaringan (B6/N1); null di tes JVM. */
    private val konektivitas: ConnectivityObserver? = null,
) : ViewModel() {

    private val _ui = MutableStateFlow(RingkasanDirekturUi())
    val ui: StateFlow<RingkasanDirekturUi> = _ui.asStateFlow()

    private var dimulai = false
    private var tugasLaporan: Job? = null
    private var tugasRingkasan: Job? = null
    private var nomorPesan = 0L

    /** Dipanggil layar sekali; muat ulang lewat [muatUlang]. */
    fun mulai() {
        if (dimulai) return
        dimulai = true
        muatUlang()
    }

    /** Muat ulang; muat sebelumnya dibatalkan agar respons basi tidak menimpa (C4 P2-4). */
    fun muatUlang() {
        tugasRingkasan?.cancel()
        _ui.update { it.copy(ringkasan = Bagian.Memuat, tersimpanPada = null) }
        tugasRingkasan = viewModelScope.launch {
            val c = cache
            val kunci = KunciPotret.ringkasan()
            val (hasil, t) = if (c == null) {
                RingkasanGrupViewModel.ambil { api.ringkasan() } to null
            } else {
                ambilDaringDulu(
                    panggil = { api.ringkasan() },
                    simpan = { c.simpan(kunci, RingkasanGrupDto.serializer(), it) },
                    potret = { c.ambil(kunci, RingkasanGrupDto.serializer()) },
                )
            }
            _ui.update { s ->
                // Laporan baru dari server menggantikan penimpaan lokal.
                s.copy(ringkasan = hasil, timpaKeadaan = emptyMap(), tersimpanPada = t)
            }
        }
    }

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
                if (dimulai && (_ui.value.tersimpanPada != null || _ui.value.ringkasan is Bagian.Galat)) muatUlang()
            }
        }
    }

    fun pilihDivisi(id: String?) = _ui.update { it.copy(divisiId = id) }

    fun pilihStatus(s: StatusRingkas?) = _ui.update { it.copy(saringStatus = s) }

    fun pilihTitikTren(i: Int) = _ui.update { it.copy(titikTren = i) }

    fun bukaLaporanDivisi(id: String) = _ui.update { it.copy(sheetDivisi = id) }

    fun tutupLaporanDivisi() = _ui.update { it.copy(sheetDivisi = null) }

    fun bukaProyek(id: String) {
        _ui.update { it.copy(sheetProyek = id, laporanProyek = Bagian.Memuat) }
        muatLaporan(id)
    }

    fun ulangLaporanProyek() {
        val id = _ui.value.sheetProyek ?: return
        _ui.update { it.copy(laporanProyek = Bagian.Memuat) }
        muatLaporan(id)
    }

    fun tutupProyek() {
        tugasLaporan?.cancel()
        _ui.update { it.copy(sheetProyek = null) }
    }

    fun pesanTampil() = _ui.update { it.copy(pesan = null) }

    /** Tandai laporan mingguan divisi sudah dibaca; snackbar membawa Urungkan. */
    fun tandaiDibaca(divisiId: String) {
        val d = divisi(divisiId) ?: return
        val idLaporan = d.weekly.id ?: return
        val kunci = kunciLaporanDivisi(d, _ui.value.kunciMinggu)
        if (!mulaiSibuk(d.id)) return
        viewModelScope.launch {
            val galat = jalankan { aksi.tandaiDibaca(TandaDibacaRequest(idLaporan)) }
            _ui.update { s ->
                if (galat == null) {
                    s.copy(
                        sibuk = s.sibuk - d.id,
                        timpaKeadaan = s.timpaKeadaan + (kunci to KeadaanMingguan.DIBACA),
                        // E2E-2 BUG-04: sheet (ModalBottomSheet, jendela sendiri) menutupi
                        // snackbar Urungkan — tutup sheet divisi ini supaya Urungkan terlihat.
                        sheetDivisi = s.sheetDivisi.takeUnless { it == d.id },
                        pesan = pesanBaru("Laporan Divisi ${labelDivisi(d)} ditandai sudah dibaca.", urungkan = d.id),
                    )
                } else {
                    s.copy(sibuk = s.sibuk - d.id, pesan = pesanBaru(galat))
                }
            }
        }
    }

    /** Urungkan tanda baca: keadaan kembali seperti sebelum ditandai (dibaca → terkirim). */
    fun urungkanDibaca(divisiId: String) {
        val d = divisi(divisiId) ?: return
        val idLaporan = d.weekly.id ?: return
        val kunci = kunciLaporanDivisi(d, _ui.value.kunciMinggu)
        viewModelScope.launch {
            val galat = jalankan { aksi.batalDibaca(TandaDibacaRequest(idLaporan)) }
            _ui.update { s ->
                if (galat == null) {
                    val semula = d.weekly.state.takeUnless { it == KeadaanMingguan.DIBACA } ?: KeadaanMingguan.TERKIRIM
                    s.copy(timpaKeadaan = s.timpaKeadaan + (kunci to semula))
                } else {
                    s.copy(pesan = pesanBaru(galat))
                }
            }
        }
    }

    /** Ingatkan kepala divisi yang belum mengirim laporan minggu yang tampil. */
    fun ingatkan(divisiId: String) {
        val d = divisi(divisiId) ?: return
        if (!mulaiSibuk(d.id)) return
        viewModelScope.launch {
            val badan = IngatkanDivisiRequest(entityId = d.entityId, divisionId = d.id, week = _ui.value.kunciMinggu)
            val hasil = try {
                val res = aksi.ingatkanDivisi(badan)
                if (res.isSuccessful) {
                    Result.success(res.body()?.results?.firstOrNull()?.outcome)
                } else {
                    Result.failure(IllegalStateException(ApiError.dari(HttpException(res)).pesanTampil()))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(IllegalStateException(ApiError.dari(e).pesanTampil()))
            }
            _ui.update { s ->
                hasil.fold(
                    onSuccess = { outcome ->
                        s.copy(
                            sibuk = s.sibuk - d.id,
                            diingatkan = if (pengingatTercatat(outcome)) s.diingatkan + d.id else s.diingatkan,
                            pesan = pesanBaru(teksHasilIngatkan(outcome, d)),
                        )
                    },
                    onFailure = { e -> s.copy(sibuk = s.sibuk - d.id, pesan = pesanBaru(e.message ?: "Pengingat belum terkirim. Coba lagi.")) },
                )
            }
        }
    }

    /** Tandai divisi sibuk secara atomik; false bila aksi divisi itu masih berjalan (ketuk ganda). */
    private fun mulaiSibuk(id: String): Boolean {
        var diterima = false
        _ui.update { s ->
            if (id in s.sibuk) {
                diterima = false
                s
            } else {
                diterima = true
                s.copy(sibuk = s.sibuk + id)
            }
        }
        return diterima
    }

    /** Label divisi yang bisa dibedakan antar-PT (BUG-09). */
    private fun labelDivisi(d: DivisiGrupDto): String {
        val semua = (_ui.value.ringkasan as? Bagian.Siap)?.data?.divisions ?: return d.name
        return labelDivisiUnik(semua)[d.id] ?: d.name
    }

    private fun divisi(id: String): DivisiGrupDto? =
        (_ui.value.ringkasan as? Bagian.Siap)?.data?.divisions?.firstOrNull { it.id == id }

    private fun pesanBaru(teks: String, urungkan: String? = null) = PesanDirektur(++nomorPesan, teks, urungkan)

    /** Jalankan satu tulisan; null = sukses, selain itu pesan galat siap tampil. */
    private suspend fun jalankan(panggil: suspend () -> retrofit2.Response<*>): String? = try {
        val res = panggil()
        if (res.isSuccessful) null else ApiError.dari(HttpException(res)).pesanTampil()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        ApiError.dari(e).pesanTampil()
    }

    private fun muatLaporan(proyekId: String) {
        tugasLaporan?.cancel()
        tugasLaporan = viewModelScope.launch {
            val hasil = RingkasanGrupViewModel.ambil { api.laporanProyek(proyekId) }
            if (_ui.value.sheetProyek != proyekId) return@launch
            val laporan: Bagian<List<LaporanHarianGrupDto>> = when (hasil) {
                is Bagian.Siap -> Bagian.Siap(hasil.data.items)
                is Bagian.Galat -> hasil
                is Bagian.Ditolak -> hasil
                Bagian.Memuat -> Bagian.Memuat
            }
            _ui.update { it.copy(laporanProyek = laporan) }
        }
    }
}
