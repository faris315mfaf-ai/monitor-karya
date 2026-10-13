// ViewModel dashboard pemantau grup. Lima sumber dimuat paralel dan berdiri
// sendiri-sendiri (Bagian): galat/403 satu kartu tidak menjatuhkan seluruh
// layar — sama dengan web yang memuat tiap kartu lewat useFetch terpisah.
// Drill-down Sheet: perusahaan → proyek (laporan harian 14 terakhir dimuat
// malas) + eskalasi dari data ringkasan.
package id.co.monitorkarya.feature.ringkasangrup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.repo.CacheLayar
import id.co.monitorkarya.core.data.sync.ConnectivityObserver
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.feature.ringkasangrup.data.GrafikManajemenDto
import id.co.monitorkarya.feature.ringkasangrup.data.HalamanInsidenDto
import id.co.monitorkarya.feature.ringkasangrup.data.KunciPotret
import id.co.monitorkarya.feature.ringkasangrup.data.LaporanHarianGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.PetaKepatuhanDto
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupApi
import id.co.monitorkarya.feature.ringkasangrup.data.RingkasanGrupDto
import id.co.monitorkarya.feature.ringkasangrup.data.TrenKpiDto
import id.co.monitorkarya.feature.ringkasangrup.data.ambilDaringDulu
import id.co.monitorkarya.feature.ringkasangrup.logika.MetrikKpi
import id.co.monitorkarya.feature.ringkasangrup.logika.PERAN_PEMANTAU
import id.co.monitorkarya.feature.ringkasangrup.logika.trenDariGrafik
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
import kotlinx.serialization.KSerializer
import retrofit2.HttpException
import retrofit2.Response

/** Keadaan satu bagian layar. [Ditolak] = 403 dari server (izin peran/cakupan). */
sealed interface Bagian<out T> {
    data object Memuat : Bagian<Nothing>
    data class Siap<T>(val data: T) : Bagian<T>
    data class Galat(val pesan: String) : Bagian<Nothing>
    data class Ditolak(val pesan: String) : Bagian<Nothing>
}

/** Sheet drill-down: perusahaan terbuka, dan proyek bila sudah turun satu tingkat. */
data class SheetDrill(val entityId: String, val proyekId: String? = null)

data class RingkasanGrupUi(
    /** False bila peran bukan pemantau — layar menampilkan catatan, tanpa memuat. */
    val pemantau: Boolean = true,
    val ringkasan: Bagian<RingkasanGrupDto> = Bagian.Memuat,
    val grafik: Bagian<GrafikManajemenDto> = Bagian.Memuat,
    val tren: Bagian<TrenKpiDto> = Bagian.Memuat,
    val peta: Bagian<PetaKepatuhanDto> = Bagian.Memuat,
    val insiden: Bagian<HalamanInsidenDto> = Bagian.Memuat,
    val sheet: SheetDrill? = null,
    val laporanProyek: Bagian<List<LaporanHarianGrupDto>> = Bagian.Memuat,
    val metrik: MetrikKpi = MetrikKpi.KEPATUHAN,
    /** Titik tren KPI yang dipilih; null = titik terakhir. */
    val titikTren: Int? = null,
    /** Batang tren laporan 8 minggu yang dipilih; null = minggu terakhir. */
    val batangMinggu: Int? = null,
    /** B6: waktu potret Room per sumber yang tampil karena server tak terjangkau. */
    val tersimpan: Map<String, Long> = emptyMap(),
) {
    /** Potret tertua yang tampil (penanda "Luring · data tersimpan HH.MM"); null = semua segar. */
    val tersimpanPada: Long? get() = tersimpan.values.minOrNull()
}

@HiltViewModel
class RingkasanGrupViewModel @Inject constructor(
    private val api: RingkasanGrupApi,
    /** Potret luring (B6); null di tes JVM tanpa Room. */
    private val cache: CacheLayar? = null,
    /** Pengamat jaringan (B6/N1); null di tes JVM. */
    private val konektivitas: ConnectivityObserver? = null,
) : ViewModel() {

    private val _ui = MutableStateFlow(RingkasanGrupUi())
    val ui: StateFlow<RingkasanGrupUi> = _ui.asStateFlow()

    private var peranAktif: Peran? = null
    private var tugasLaporan: Job? = null

    /** Muat bagian yang sedang berjalan; dibatalkan saat muat ulang (C4 P2-4). */
    private var tugasMuat: List<Job> = emptyList()

    /** Dipanggil layar dengan peran sesi; memuat sekali per peran. */
    fun mulai(peran: Peran) {
        if (peranAktif == peran) return
        peranAktif = peran
        if (peran !in PERAN_PEMANTAU) {
            _ui.value = RingkasanGrupUi(pemantau = false)
            return
        }
        muatUlang()
    }

    /**
     * Muat ulang semua bagian (tarik-segarkan / Coba lagi). Muat sebelumnya yang
     * masih berjalan dibatalkan lebih dulu agar respons basi (mis. galat timeout
     * yang tiba terakhir) tidak menimpa hasil yang lebih baru.
     *
     * Tren KPI diturunkan dari /api/management-charts `trend` (sumber web, C4 P2-7),
     * bukan /api/kpi-trends — satu permintaan lebih sedikit dan cakupan sama.
     */
    fun muatUlang() {
        if (!_ui.value.pemantau) return
        tugasMuat.forEach { it.cancel() }
        _ui.update {
            it.copy(
                ringkasan = Bagian.Memuat,
                grafik = Bagian.Memuat,
                tren = Bagian.Memuat,
                peta = Bagian.Memuat,
                insiden = Bagian.Memuat,
                tersimpan = emptyMap(),
            )
        }
        // E2E-3 B9: panggilan jaringan TIDAK boleh berada di dalam lambda
        // `_ui.update { … }`. update() adalah loop compare-and-set: bila bagian
        // lain memperbarui _ui selagi permintaan berjalan, lambdanya diulang —
        // dulu satu ketukan Muat ulang mengirim GET /api/ringkasan hingga 4×.
        // B6: tiap sumber daring-dulu; saat server tak terjangkau potret Room hari ini dipakai.
        tugasMuat = listOf(
            viewModelScope.launch {
                val (ringkasan, t) = ambilPotret(KunciPotret.ringkasan(), RingkasanGrupDto.serializer()) { api.ringkasan() }
                _ui.update { it.copy(ringkasan = ringkasan, tersimpan = it.tersimpan.tandai(SUMBER_RINGKASAN, t)) }
            },
            viewModelScope.launch {
                val (grafik, t) = ambilPotret(KunciPotret.grafik(), GrafikManajemenDto.serializer()) { api.grafikManajemen() }
                _ui.update { it.copy(grafik = grafik, tren = trenDari(grafik), tersimpan = it.tersimpan.tandai(SUMBER_GRAFIK, t)) }
            },
            viewModelScope.launch {
                val (peta, t) = ambilPotret(KunciPotret.peta(), PetaKepatuhanDto.serializer()) { api.petaKepatuhan() }
                _ui.update { it.copy(peta = peta, tersimpan = it.tersimpan.tandai(SUMBER_PETA, t)) }
            },
            viewModelScope.launch {
                val (insiden, t) = ambilPotret(KunciPotret.insiden(), HalamanInsidenDto.serializer()) { api.insidenTerlambat() }
                _ui.update { it.copy(insiden = insiden, tersimpan = it.tersimpan.tandai(SUMBER_INSIDEN, t)) }
            },
        )
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
                if (_ui.value.let { u -> u.tersimpanPada != null || u.ringkasan is Bagian.Galat || u.grafik is Bagian.Galat || u.peta is Bagian.Galat || u.insiden is Bagian.Galat }) muatUlang()
            }
        }
    }

    fun bukaPerusahaan(entityId: String) {
        tugasLaporan?.cancel()
        _ui.update { it.copy(sheet = SheetDrill(entityId = entityId)) }
    }

    /** Turun ke proyek: laporan harian 14 terakhir dimuat malas. */
    fun bukaProyek(proyekId: String) {
        val sheet = _ui.value.sheet ?: return
        _ui.update { it.copy(sheet = sheet.copy(proyekId = proyekId), laporanProyek = Bagian.Memuat) }
        muatLaporan(proyekId)
    }

    fun ulangLaporan() {
        val id = _ui.value.sheet?.proyekId ?: return
        _ui.update { it.copy(laporanProyek = Bagian.Memuat) }
        muatLaporan(id)
    }

    /** Kembali dari proyek ke perusahaan; dari perusahaan menutup sheet. */
    fun kembali() {
        val sheet = _ui.value.sheet ?: return
        if (sheet.proyekId != null) {
            tugasLaporan?.cancel()
            _ui.update { it.copy(sheet = sheet.copy(proyekId = null)) }
        } else {
            tutupSheet()
        }
    }

    fun tutupSheet() {
        tugasLaporan?.cancel()
        _ui.update { it.copy(sheet = null) }
    }

    fun pilihMetrik(m: MetrikKpi) = _ui.update { it.copy(metrik = m) }

    fun pilihTitikTren(i: Int) = _ui.update { it.copy(titikTren = i) }

    fun pilihBatangMinggu(i: Int) = _ui.update { it.copy(batangMinggu = i) }

    private suspend fun <T> ambilPotret(
        kunci: String,
        serializer: KSerializer<T>,
        panggil: suspend () -> Response<T>,
    ): Pair<Bagian<T>, Long?> {
        val c = cache ?: return ambil(panggil) to null
        return ambilDaringDulu(panggil, { c.simpan(kunci, serializer, it) }, { c.ambil(kunci, serializer) })
    }

    private fun muatLaporan(proyekId: String) {
        tugasLaporan?.cancel()
        tugasLaporan = viewModelScope.launch {
            val hasil = ambil { api.laporanProyek(proyekId) }
            // Abaikan jawaban basi bila pengguna sudah berpindah proyek/menutup sheet.
            if (_ui.value.sheet?.proyekId != proyekId) return@launch
            val laporan: Bagian<List<LaporanHarianGrupDto>> = when (hasil) {
                is Bagian.Siap -> Bagian.Siap(hasil.data.items)
                is Bagian.Galat -> hasil
                is Bagian.Ditolak -> hasil
                Bagian.Memuat -> Bagian.Memuat
            }
            _ui.update { it.copy(laporanProyek = laporan) }
        }
    }

    companion object {
        private const val SUMBER_RINGKASAN = "ringkasan"
        private const val SUMBER_GRAFIK = "grafik"
        private const val SUMBER_PETA = "peta"
        private const val SUMBER_INSIDEN = "insiden"

        /** Catat (t ≠ null) atau hapus (t = null) waktu potret satu sumber. */
        internal fun Map<String, Long>.tandai(sumber: String, t: Long?): Map<String, Long> =
            if (t == null) this - sumber else this + (sumber to t)

        /** Bagian tren mengikuti bagian grafik manajemen (Siap → peta trend; galat/403 sama). */
        internal fun trenDari(grafik: Bagian<GrafikManajemenDto>): Bagian<TrenKpiDto> = when (grafik) {
            is Bagian.Siap -> Bagian.Siap(trenDariGrafik(grafik.data.trend))
            is Bagian.Galat -> grafik
            is Bagian.Ditolak -> grafik
            Bagian.Memuat -> Bagian.Memuat
        }

        /**
         * Jalankan satu panggilan dan terjemahkan hasilnya. 403 → [Bagian.Ditolak]
         * (izin dari server); kode lain lewat ApiError terpusat (401/409/422/5xx).
         */
        internal suspend fun <T> ambil(panggil: suspend () -> Response<T>): Bagian<T> = try {
            val res = panggil()
            val badan = res.body()
            when {
                res.isSuccessful && badan != null -> Bagian.Siap(badan)
                res.isSuccessful -> Bagian.Galat("Jawaban server kosong. Coba lagi.")
                res.code() == 403 -> Bagian.Ditolak(ApiError.dari(HttpException(res)).pesanTampil())
                else -> Bagian.Galat(ApiError.dari(HttpException(res)).pesanTampil())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Bagian.Galat(ApiError.dari(e).pesanTampil())
        }
    }
}
