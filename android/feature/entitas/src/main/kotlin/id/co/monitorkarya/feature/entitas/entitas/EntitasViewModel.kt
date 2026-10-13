// ViewModel tab Entitas. Padanan web: src/components/views/entities-view.tsx
// (pohon + sheet rincian) dan entity-activity-board.tsx (aktivitas per PT,
// di sini dipersempit ke PT yang sedang dibuka di sheet).
//
// Izin selalu dari server: GET /api/entities/[id] menolak PIC proyek dan
// kepala divisi (403, T12) — ViewModel tidak menyembunyikan tombol menurut
// peran, melainkan menerjemahkan 403 menjadi DetailUi.Ditolak dengan pesan
// ramah di layar.
package id.co.monitorkarya.feature.entitas.entitas

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.repo.CacheLayar
import id.co.monitorkarya.core.data.sync.ConnectivityObserver
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.feature.entitas.data.AktivitasEntitasResponse
import id.co.monitorkarya.feature.entitas.data.DetailEntitasResponse
import id.co.monitorkarya.feature.entitas.data.EntitasApi
import id.co.monitorkarya.feature.entitas.data.Jawab
import id.co.monitorkarya.feature.entitas.data.PohonEntitasResponse
import id.co.monitorkarya.feature.entitas.data.SimpulEntitasDto
import id.co.monitorkarya.feature.entitas.data.panggil
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Status pohon. */
sealed interface PohonUi {
    data object Memuat : PohonUi
    data class Galat(val pesan: String) : PohonUi
    /** [tersimpanPada] = waktu potret Room (B6, server tak terjangkau); null = segar. */
    data class Siap(val pohon: List<SimpulEntitasDto>, val periodKey: String, val tersimpanPada: Long? = null) : PohonUi
}

/** Status rincian satu entitas di sheet. */
sealed interface DetailUi {
    data object Memuat : DetailUi
    data class Siap(val data: DetailEntitasResponse) : DetailUi

    /** 403 dari server: peran/cakupan tidak boleh membuka rincian ini. */
    data class Ditolak(val pesanServer: String) : DetailUi
    data class Galat(val pesan: String) : DetailUi
}

/** Status papan aktivitas di sheet PT. */
data class AktivitasUi(
    val kadens: Kadens = Kadens.HARIAN,
    val prioritas: SkalaPrioritas = SkalaPrioritas.SEMUA,
    /** Tanggal jangkar YYYY-MM-DD; null = hari ini (server). */
    val tanggal: String? = null,
    val memuat: Boolean = false,
    val jawaban: AktivitasEntitasResponse? = null,
    val galat: String? = null,
    /** 403 dari server untuk papan aktivitas. */
    val ditolak: Boolean = false,
)

@HiltViewModel
class EntitasViewModel @Inject constructor(
    private val api: EntitasApi,
    /** Potret luring pohon (B6); null di tes JVM tanpa Room. */
    private val cache: CacheLayar? = null,
    /** Pengamat jaringan (B6/N1); null di tes JVM. */
    private val konektivitas: ConnectivityObserver? = null,
) : ViewModel() {

    private val _pohon = MutableStateFlow<PohonUi>(PohonUi.Memuat)
    val pohon: StateFlow<PohonUi> = _pohon.asStateFlow()

    private val _cari = MutableStateFlow("")
    val cari: StateFlow<String> = _cari.asStateFlow()

    /** Ubahan buka/tutup per simpul; nilai menimpa bawaan dua tingkat teratas. */
    private val _ubahan = MutableStateFlow<Map<String, Boolean>>(emptyMap())

    /** Baris pohon yang tampil (sudah disaring dan diratakan). */
    val baris: StateFlow<List<BarisPohon>> = combine(_pohon, _cari, _ubahan) { p, c, u ->
        val pohon = (p as? PohonUi.Siap)?.pohon.orEmpty()
        ratakanPohon(saringPohon(pohon, c), u, mencari = c.isNotBlank())
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Semua cabang sedang terbuka. */
    val semuaTerbuka: StateFlow<Boolean> = combine(_pohon, _ubahan) { p, u ->
        semuaTerbuka((p as? PohonUi.Siap)?.pohon.orEmpty(), u)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val _terpilih = MutableStateFlow<SimpulEntitasDto?>(null)

    /** Simpul yang rinciannya terbuka di sheet; null = sheet tertutup. */
    val terpilih: StateFlow<SimpulEntitasDto?> = _terpilih.asStateFlow()

    private val _detail = MutableStateFlow<DetailUi>(DetailUi.Memuat)
    val detail: StateFlow<DetailUi> = _detail.asStateFlow()

    private val _aktivitas = MutableStateFlow(AktivitasUi())
    val aktivitas: StateFlow<AktivitasUi> = _aktivitas.asStateFlow()

    private var jobDetail: Job? = null
    private var jobAktivitas: Job? = null

    /**
     * Cache jawaban /api/entity-activity per (kadens, prioritas, tanggal).
     * Rute server mengembalikan aktivitas SEMUA PT sekaligus, jadi pindah PT
     * atau bolak-balik periode tidak perlu mengunduh ulang dalam [CACHE_MS].
     * Muat ulang manual (tombol) selalu menarik ulang.
     */
    private val cacheAktivitas = mutableMapOf<Triple<String, String, String?>, Pair<Long, AktivitasEntitasResponse>>()

    /** Jam (ms) — dapat diganti di tes. */
    internal var jam: () -> Long = { System.currentTimeMillis() }

    init {
        muat()
        amatiDaring()
    }

    /**
     * B6/N1: layar tersembunyi (tab lain) tidak ikut disusun ulang MKShell saat
     * daring kembali. Saat transisi luring → daring, isi yang berasal dari
     * potret Room atau galat dimuat ulang sendiri, jadi penanda "data
     * tersimpan" tidak tertinggal setelah tersambung lagi.
     */
    private fun amatiDaring() {
        val k = konektivitas ?: return
        viewModelScope.launch {
            k.daring.distinctUntilChanged().drop(1).filter { it }.collect {
                if (_pohon.value.let { p -> (p is PohonUi.Siap && p.tersimpanPada != null) || p is PohonUi.Galat }) muat()
            }
        }
    }

    /** Tarik pohon; status kembali ke Memuat agar layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _pohon.value = PohonUi.Memuat
            cacheAktivitas.clear()
            // B6: daring dulu; sukses disimpan, server tak terjangkau → potret hari ini.
            val kunci = kunciPotretPohon()
            _pohon.value = when (val j = panggil { api.pohon() }) {
                is Jawab.Ok -> {
                    cache?.simpan(kunci, PohonEntitasResponse.serializer(), j.data)
                    PohonUi.Siap(j.data.tree, j.data.periodKey)
                }
                is Jawab.Gagal -> {
                    val potret = if (j.galat is ApiError.Jaringan) cache?.ambil(kunci, PohonEntitasResponse.serializer()) else null
                    if (potret != null) {
                        PohonUi.Siap(potret.nilai.tree, potret.nilai.periodKey, tersimpanPada = potret.disimpanPada)
                    } else {
                        PohonUi.Galat(j.pesan)
                    }
                }
            }
        }
    }

    fun setCari(teks: String) {
        _cari.value = teks
    }

    /** Buka/tutup satu cabang. */
    fun alih(id: String, kedalaman: Int) {
        _ubahan.update { u -> u + (id to !(u[id] ?: (kedalaman < KEDALAMAN_TERBUKA_BAWAAN))) }
    }

    /** "Buka semua" bila belum semua terbuka, selain itu "Ciutkan semua". */
    fun alihSemua() {
        val pohon = (_pohon.value as? PohonUi.Siap)?.pohon ?: return
        val buka = !semuaTerbuka(pohon, _ubahan.value)
        _ubahan.value = cabang(pohon).associate { (id, _) -> id to buka }
    }

    /**
     * Buka rincian simpul di sheet (null = tutup). Web hanya membuka sheet
     * untuk PT; simpul non-PT di sini juga boleh dibuka (rincian anak entitas)
     * — server yang memutuskan boleh/tidaknya.
     */
    fun pilih(simpul: SimpulEntitasDto?) {
        _terpilih.value = simpul
        jobDetail?.cancel()
        jobAktivitas?.cancel()
        if (simpul == null) return
        muatDetail()
        _aktivitas.value = AktivitasUi()
        if (simpul.type == "PT") tarikAktivitas(paksa = false)
    }

    fun muatDetail() {
        val s = _terpilih.value ?: return
        jobDetail?.cancel()
        jobDetail = viewModelScope.launch {
            _detail.value = DetailUi.Memuat
            _detail.value = when (val j = panggil { api.rincian(s.id) }) {
                is Jawab.Ok -> DetailUi.Siap(j.data)
                is Jawab.Gagal -> if (j.kode == KODE_DITOLAK) DetailUi.Ditolak(j.pesan) else DetailUi.Galat(j.pesan)
            }
        }
    }

    // ------------------------------------------------------------------
    // Aktivitas
    // ------------------------------------------------------------------

    fun setKadens(k: Kadens) {
        if (_aktivitas.value.kadens == k) return
        _aktivitas.update { it.copy(kadens = k) }
        tarikAktivitas(paksa = false)
    }

    fun setPrioritas(p: SkalaPrioritas) {
        if (_aktivitas.value.prioritas == p) return
        _aktivitas.update { it.copy(prioritas = p) }
        tarikAktivitas(paksa = false)
    }

    /** Geser periode memakai tanggal prev/next yang dihitung server. */
    fun periodeSebelumnya() {
        val prev = _aktivitas.value.jawaban?.prev?.takeIf { it.isNotBlank() } ?: return
        _aktivitas.update { it.copy(tanggal = prev) }
        tarikAktivitas(paksa = false)
    }

    fun periodeBerikutnya() {
        val next = _aktivitas.value.jawaban?.next?.takeIf { it.isNotBlank() } ?: return
        _aktivitas.update { it.copy(tanggal = next) }
        tarikAktivitas(paksa = false)
    }

    fun kembaliKeHariIni() {
        if (_aktivitas.value.tanggal == null) return
        _aktivitas.update { it.copy(tanggal = null) }
        tarikAktivitas(paksa = false)
    }

    /** Muat ulang manual (tombol): selalu menarik dari server. */
    fun muatAktivitas() {
        tarikAktivitas(paksa = true)
    }

    private fun tarikAktivitas(paksa: Boolean) {
        if (_terpilih.value?.type != "PT") return
        jobAktivitas?.cancel()
        val a = _aktivitas.value
        val kunci = Triple(a.kadens.kode, a.prioritas.kode, a.tanggal)
        val tersimpan = cacheAktivitas[kunci]?.takeIf { jam() - it.first < CACHE_MS }?.second
        if (!paksa && tersimpan != null) {
            _aktivitas.update { it.copy(memuat = false, galat = null, ditolak = false, jawaban = tersimpan) }
            return
        }
        jobAktivitas = viewModelScope.launch {
            _aktivitas.update { it.copy(memuat = true, galat = null, ditolak = false) }
            when (val j = panggil { api.aktivitas(a.kadens.kode, a.prioritas.kode, a.tanggal) }) {
                is Jawab.Ok -> {
                    cacheAktivitas[kunci] = jam() to j.data
                    _aktivitas.update { it.copy(memuat = false, jawaban = j.data) }
                }
                is Jawab.Gagal -> _aktivitas.update {
                    it.copy(memuat = false, galat = j.pesan, ditolak = j.kode == KODE_DITOLAK)
                }
            }
        }
    }

    private companion object {
        /** Kunci CacheLayar pohon entitas hari WIB ini (uid ditambahkan CacheLayar). */
        fun kunciPotretPohon(): String = "pemantau:entitas-pohon:${Wib.hariIni()}"

        const val KODE_DITOLAK = 403
        const val CACHE_MS = 60_000L
    }
}
