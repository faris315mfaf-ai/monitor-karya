// Tab Sistem & akses (Tim TI / Super Admin) — padanan
// src/components/views/system-view.tsx + access-requests-card.tsx.
// Kesehatan sistem (kalimat + 4 KPI + kesiapan server), antrean permintaan
// akses (setujui/tolak dengan "Urungkan" 5 detik seperti web), proses
// otomatis, penguncian ringkas + per PT (locking.perEntity[]), pengingat per
// PT (baca saja di ponsel), kesehatan akun, hak akses per peran (Sheet akun
// dari /api/roles), volume data, aktivitas terakhir, dan 25 akun terakhir.
package id.co.monitorkarya.feature.audit.sistem

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.feature.audit.data.KelompokPeranDto
import id.co.monitorkarya.feature.audit.data.KunciPtDto
import id.co.monitorkarya.feature.audit.data.PengajuanAksesDto
import id.co.monitorkarya.feature.audit.data.PutusanAksesRequest
import id.co.monitorkarya.feature.audit.data.SistemApi
import id.co.monitorkarya.feature.audit.data.SistemDto
import id.co.monitorkarya.feature.audit.model.angka
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

sealed interface Muatan<out T> {
    data object Memuat : Muatan<Nothing>
    data class Galat(val pesan: String) : Muatan<Nothing>
    data class Siap<T>(val data: T) : Muatan<T>
}

/** Hasil /api/health/ready. */
enum class KesiapanServer { SIAP, TERDEGRADASI, MATI, TAK_TERBACA }

data class AntreanAkses(
    val items: List<PengajuanAksesDto>,
    val menunggu: Int,
    val bolehPutuskan: Boolean,
    /**
     * Baris yang ditampilkan, urutannya TETAP selama layar terbuka (E2E-3 B2):
     * permintaan yang baru diputus tetap di posisinya dengan status barunya,
     * sehingga tombol baris lain tidak bergeser ke bawah jari pengguna.
     */
    val tampil: List<PengajuanAksesDto> = SistemAksesViewModel.urutAntrean(items),
)

enum class Putusan(val kode: String) { SETUJUI("approve"), TOLAK("reject") }

/** Pesan satu-kali; [urungkanId] = tampilkan aksi "Urungkan" untuk permintaan itu. */
data class PesanSistem(val id: Long, val teks: String, val urungkanId: String? = null)

/** Kalimat kesehatan + daftar masalah (port `issues` system-view.tsx). */
data class RingkasanKesehatan(val sehat: Boolean, val kalimat: String, val dukungan: String)

@HiltViewModel
class SistemAksesViewModel @Inject constructor(
    private val api: SistemApi,
) : ViewModel() {

    private val _sistem = MutableStateFlow<Muatan<SistemDto>>(Muatan.Memuat)
    val sistem: StateFlow<Muatan<SistemDto>> = _sistem.asStateFlow()

    private val _kesiapan = MutableStateFlow(KesiapanServer.TAK_TERBACA)
    val kesiapan: StateFlow<KesiapanServer> = _kesiapan.asStateFlow()

    private val _akses = MutableStateFlow<Muatan<AntreanAkses>>(Muatan.Memuat)
    val akses: StateFlow<Muatan<AntreanAkses>> = _akses.asStateFlow()

    private val _lokal = MutableStateFlow<Map<String, Putusan>>(emptyMap())

    /** Putusan yang masih ditahan untuk "Urungkan" (belum dikirim). */
    val lokal: StateFlow<Map<String, Putusan>> = _lokal.asStateFlow()

    private val _sibuk = MutableStateFlow<String?>(null)
    val sibuk: StateFlow<String?> = _sibuk.asStateFlow()

    private val _pesan = MutableStateFlow<PesanSistem?>(null)
    val pesan: StateFlow<PesanSistem?> = _pesan.asStateFlow()

    private val _pengajuanTerbuka = MutableStateFlow<PengajuanAksesDto?>(null)
    val pengajuanTerbuka: StateFlow<PengajuanAksesDto?> = _pengajuanTerbuka.asStateFlow()

    private val _ptTerbuka = MutableStateFlow<KunciPtDto?>(null)
    val ptTerbuka: StateFlow<KunciPtDto?> = _ptTerbuka.asStateFlow()

    private val _peranTerbuka = MutableStateFlow<String?>(null)

    /** Kode peran yang Sheet akunnya terbuka. */
    val peranTerbuka: StateFlow<String?> = _peranTerbuka.asStateFlow()

    private val _direktori = MutableStateFlow<Muatan<List<KelompokPeranDto>>?>(null)

    /** Direktori akun per peran (/api/roles), dimuat saat Sheet peran pertama dibuka. */
    val direktori: StateFlow<Muatan<List<KelompokPeranDto>>?> = _direktori.asStateFlow()

    private val tertahan = mutableMapOf<String, Pair<Job, () -> Unit>>()

    /** Lingkup pengiriman putusan yang tertahan saat ViewModel dibersihkan (padanan keepalive web). */
    internal var lingkupSusulan: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var tugasAkses: Job? = null

    init {
        muatSemua()
    }

    fun muatSemua() {
        muatSistem()
        muatAkses()
        muatKesiapan()
    }

    fun muatSistem() {
        viewModelScope.launch {
            _sistem.value = Muatan.Memuat
            _sistem.value = ambil { api.sistem() }
        }
    }

    /** Muat ulang atas permintaan pengguna: urutan baris disusun ulang. */
    fun muatAkses() = muatAntrean(pertahankanUrutan = false)

    /**
     * [pertahankanUrutan] = true untuk muat ulang internal (mis. sesudah 409):
     * baris yang sudah tampil tetap di posisinya (E2E-3 B2). Muat yang sedang
     * berjalan dibatalkan agar jawaban lama tidak menimpa jawaban baru.
     */
    private fun muatAntrean(pertahankanUrutan: Boolean) {
        tugasAkses?.cancel()
        tugasAkses = viewModelScope.launch {
            val lama = (_akses.value as? Muatan.Siap)?.data?.tampil?.map { it.id }
            if (_akses.value !is Muatan.Siap) _akses.value = Muatan.Memuat
            _akses.value = when (val h = ambil { api.pengajuanAkses("all") }) {
                is Muatan.Siap -> Muatan.Siap(
                    AntreanAkses(
                        items = h.data.items,
                        menunggu = h.data.pending,
                        bolehPutuskan = h.data.canDecide,
                        tampil = susunTampil(h.data.items, if (pertahankanUrutan) lama else null),
                    ),
                )
                is Muatan.Galat -> h
                Muatan.Memuat -> Muatan.Memuat
            }
        }
    }

    /**
     * True selama ada putusan yang ditahan (jendela Urungkan) atau sedang
     * dikirim. Selama itu tombol Setujui/Tolak baris lain nonaktif (E2E-3 B2).
     */
    val adaAksiBerjalan: Boolean get() = tertahan.isNotEmpty() || _sibuk.value != null

    private fun muatKesiapan() {
        viewModelScope.launch {
            _kesiapan.value = try {
                val res = api.kesiapan()
                val isi = res.body()
                when {
                    res.isSuccessful && isi?.status == "ready" -> KesiapanServer.SIAP
                    res.isSuccessful && isi?.ok == true -> KesiapanServer.TERDEGRADASI
                    res.code() == KODE_TIDAK_TERSEDIA -> KesiapanServer.MATI
                    else -> KesiapanServer.TAK_TERBACA
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                KesiapanServer.TAK_TERBACA
            }
        }
    }

    // ---------------- Permintaan akses ----------------

    /** Setujui/Tolak: ditahan 5 detik agar bisa diurungkan, lalu PATCH. */
    fun putuskan(item: PengajuanAksesDto, putusan: Putusan) {
        if (item.id in tertahan || !item.canDecide || item.status != "DIAJUKAN") return
        // Satu putusan sekaligus: ketukan pada baris lain selama jendela Urungkan
        // atau pengiriman diabaikan (pagar kedua selain tombol nonaktif di layar).
        if (adaAksiBerjalan || item.id in _lokal.value) return
        _pengajuanTerbuka.value = null
        _lokal.value = _lokal.value + (item.id to putusan)
        val kirim = { lingkupSusulan.launch { kirim(item, putusan) }; Unit }
        val tugas = viewModelScope.launch {
            delay(TAHAN_MS)
            tertahan.remove(item.id)
            kirim(item, putusan)
        }
        tertahan[item.id] = tugas to kirim
        _pesan.value = PesanSistem(
            id = System.nanoTime(),
            teks = "${item.title} ${if (putusan == Putusan.SETUJUI) "disetujui" else "ditolak"}. " +
                if (putusan == Putusan.SETUJUI) {
                    "Perubahan diterapkan dalam 5 detik dan tercatat di log aktivitas."
                } else {
                    "Pengaju akan diberi tahu."
                },
            urungkanId = item.id,
        )
    }

    /** "Urungkan" — batalkan putusan yang belum terkirim. */
    fun urungkan(id: String) {
        val tahanan = tertahan.remove(id)
        if (tahanan == null) {
            // Jendela 5 detik sudah lewat: PATCH sudah/ sedang terkirim. Beri tahu,
            // jangan diam — dan jangan pernah menyentuh permintaan lain.
            kabari(PESAN_TERLAMBAT_URUNG)
            return
        }
        tahanan.first.cancel()
        _lokal.value = _lokal.value - id
    }

    private suspend fun kirim(item: PengajuanAksesDto, putusan: Putusan) {
        _sibuk.value = item.id
        try {
            val res = api.putuskan(PutusanAksesRequest(id = item.id, decision = putusan.kode))
            val baru = res.body()?.item
            if (res.isSuccessful) {
                _lokal.value = _lokal.value - item.id
                val siap = _akses.value as? Muatan.Siap
                if (siap != null && baru != null) {
                    // Ganti di tempat — baris tetap di posisinya dengan status barunya.
                    _akses.value = Muatan.Siap(
                        siap.data.copy(
                            items = siap.data.items.map { if (it.id == baru.id) baru else it },
                            menunggu = (siap.data.menunggu - 1).coerceAtLeast(0),
                            tampil = siap.data.tampil.map { if (it.id == baru.id) baru else it },
                        ),
                    )
                } else {
                    muatAntrean(pertahankanUrutan = true)
                }
                if (putusan == Putusan.SETUJUI && item.type == "AKUN_BARU") {
                    kabari(PESAN_AKTIVASI)
                }
            } else {
                _lokal.value = _lokal.value - item.id
                kabari(ApiError.dari(HttpException(res)).pesanTampil())
                if (res.code() == KODE_KONFLIK) muatAntrean(pertahankanUrutan = true)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _lokal.value = _lokal.value - item.id
            kabari(ApiError.dari(e).pesanTampil())
        } finally {
            if (_sibuk.value == item.id) _sibuk.value = null
        }
    }

    fun bukaPengajuan(item: PengajuanAksesDto) {
        _pengajuanTerbuka.value = item
    }

    fun tutupPengajuan() {
        _pengajuanTerbuka.value = null
    }

    // ---------------- Sheet PT & peran ----------------

    fun bukaPt(pt: KunciPtDto) {
        _ptTerbuka.value = pt
    }

    fun tutupPt() {
        _ptTerbuka.value = null
    }

    fun bukaPeran(role: String) {
        _peranTerbuka.value = role
        if (_direktori.value !is Muatan.Siap) muatDirektori()
    }

    fun tutupPeran() {
        _peranTerbuka.value = null
    }

    fun muatDirektori() {
        viewModelScope.launch {
            _direktori.value = Muatan.Memuat
            _direktori.value = when (val h = ambil { api.peran() }) {
                is Muatan.Siap -> Muatan.Siap(h.data.roles)
                is Muatan.Galat -> h
                Muatan.Memuat -> Muatan.Memuat
            }
        }
    }

    /** Pesan selesai ditampilkan; [id] mencegah terhapusnya pesan lebih baru. */
    fun pesanTampil(id: Long? = null) {
        if (id == null || _pesan.value?.id == id) _pesan.value = null
    }

    /**
     * Kirim semua putusan tertahan SEKARANG (layar ditinggalkan). Dipanggil
     * selagi sesi masih aktif sehingga PATCH tidak tertunda sampai onCleared
     * (yang bisa terjadi setelah keluar akun, tanpa cookie).
     */
    fun kirimTertahanSekarang() {
        val sisa = tertahan.values.toList()
        tertahan.clear()
        sisa.forEach { (tugas, kirimSegera) ->
            tugas.cancel()
            kirimSegera()
        }
    }

    private fun kabari(teks: String) {
        _pesan.value = PesanSistem(System.nanoTime(), teks)
    }

    private suspend fun <T : Any> ambil(panggil: suspend () -> retrofit2.Response<T>): Muatan<T> = try {
        val res = panggil()
        val isi = res.body()
        if (res.isSuccessful && isi != null) {
            Muatan.Siap(isi)
        } else {
            Muatan.Galat(ApiError.dari(HttpException(res)).pesanTampil())
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Muatan.Galat(ApiError.dari(e).pesanTampil())
    }

    /** Putusan yang masih tertahan tetap dikirim bila layar ditutup (seperti unmount web). */
    override fun onCleared() {
        kirimTertahanSekarang()
        super.onCleared()
    }

    companion object {
        const val TAHAN_MS = 5_000L
        private const val KODE_KONFLIK = 409
        private const val KODE_TIDAK_TERSEDIA = 503

        const val PESAN_TERLAMBAT_URUNG =
            "Putusan sudah terkirim dan tidak bisa diurungkan lagi. Periksa log aktivitas bila perlu."

        const val PESAN_AKTIVASI =
            "Akun baru disetujui. Serahkan tautan aktivasinya lewat web: Sistem & akses, Permintaan akses, Kelola aktivasi."

        /** Kalimat Hero kesehatan (port system-view.tsx). */
        fun ringkas(d: SistemDto): RingkasanKesehatan {
            val t = d.technical
            val terlambat = t?.cron?.filter { it.health == "late" }.orEmpty()
            val gagal = t?.notifications?.failed7d ?: d.notifications.failed
            val masalah = listOfNotNull(
                terlambat.takeIf { it.isNotEmpty() }?.joinToString(" dan ") {
                    it.label.replaceFirstChar { c -> c.lowercaseChar() }
                }?.let { "$it terlambat berjalan" },
                gagal.takeIf { it > 0 }?.let { "${angka(it)} notifikasi gagal terkirim" },
                d.access.noPassword.takeIf { it > 0 }?.let { "${angka(it)} akun belum punya kata sandi" },
                t?.unlocks?.waitingExecution?.takeIf { it > 0 }?.let { "${angka(it)} buka kunci menunggu dibuka" },
            )
            val sehat = masalah.isEmpty()
            val kalimat = if (sehat) {
                "Sistem sehat, tidak ada yang perlu ditangani."
            } else {
                "${masalah.size} hal perlu ditangani: ${masalah.joinToString(", ")}."
            }
            val k = d.locking
            val sisa = if (k.dailyLocked) {
                "hari ini sudah terkunci"
            } else {
                "${k.dailyCountdown.hours} jam ${k.dailyCountdown.minutes} menit lagi"
            }
            val dukungan = "Kunci harian ${k.dailyCutoff}, $sisa. ${angka(k.lockedToday)} laporan terkunci hari ini."
            return RingkasanKesehatan(sehat, kalimat, dukungan)
        }

        /** Jumlah buka kunci menunggu (StatTile web). */
        fun bukaKunciMenunggu(d: SistemDto): Int =
            d.technical?.let { it.unlocks.waitingApproval + it.unlocks.waitingExecution } ?: d.locking.pendingUnlocks

        /**
         * Susunan baris tampil. Tanpa [urutanLama] = [urutAntrean]. Dengan
         * [urutanLama], baris yang masih ada tetap di posisinya (status boleh
         * berubah) dan permintaan menunggu yang baru ditambahkan di bawah —
         * tidak ada baris yang bergeser ke posisi tombol yang baru diketuk.
         */
        fun susunTampil(items: List<PengajuanAksesDto>, urutanLama: List<String>?, batas: Int = 8): List<PengajuanAksesDto> {
            if (urutanLama == null) return urutAntrean(items, batas)
            val perId = items.associateBy { it.id }
            val tetap = urutanLama.mapNotNull { perId[it] }
            val sudah = tetap.mapTo(HashSet()) { it.id }
            val baru = items.filter { it.id !in sudah && it.status == "DIAJUKAN" }
            return tetap + baru
        }

        /** Urutan tampil antrean: yang menunggu dulu, lalu yang sudah diputuskan, maksimal [batas]. */
        fun urutAntrean(items: List<PengajuanAksesDto>, batas: Int = 8): List<PengajuanAksesDto> {
            val terbuka = items.filter { it.status == "DIAJUKAN" }
            val selesai = items.filter { it.status != "DIAJUKAN" }.take((batas - terbuka.size).coerceAtLeast(0))
            return (terbuka + selesai).take(batas.coerceAtLeast(terbuka.size))
        }
    }
}
