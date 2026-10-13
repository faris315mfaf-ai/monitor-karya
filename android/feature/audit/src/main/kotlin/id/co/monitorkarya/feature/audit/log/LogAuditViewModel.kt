// Tab Log aktivitas — padanan src/components/views/audit-view.tsx.
// Daftar berhalaman (append "Muat lebih banyak", 20 per halaman), saringan
// pelaku/aksi/target/peran pelaku/tanggal WIB, Sheet rincian before/after
// sebagai teks, dan unduhan CSV (bila server memberi canExport) yang ditulis
// ke berkas pilihan pengguna lewat Storage Access Framework.
package id.co.monitorkarya.feature.audit.log

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.feature.audit.data.AuditLogApi
import id.co.monitorkarya.feature.audit.data.AuditLogDto
import id.co.monitorkarya.feature.audit.model.angka
import id.co.monitorkarya.feature.audit.model.relatif
import java.io.OutputStream
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.HttpException

/** Saringan aktif. Nilai null = tidak disaring. Tanggal = kalender WIB. */
data class SaringanAudit(
    val actorId: String? = null,
    /** Nama pelaku untuk chip ("Pelaku: …"); tidak dikirim ke server. */
    val actorNama: String? = null,
    val action: String? = null,
    val targetType: String? = null,
    val role: String? = null,
    val dari: LocalDate? = null,
    val sampai: LocalDate? = null,
) {
    /** Jumlah kelompok saringan aktif (filterCount web + pelaku). */
    val jumlah: Int
        get() = listOf(
            actorId != null,
            action != null,
            targetType != null,
            role != null,
            dari != null || sampai != null,
        ).count { it }

    val aktif: Boolean get() = jumlah > 0
}

sealed interface LogAuditUiState {
    data object Memuat : LogAuditUiState
    data class Galat(val pesan: String) : LogAuditUiState
    data class Siap(
        val items: List<AuditLogDto>,
        val total: Int,
        val halaman: Int,
        val ukuranHalaman: Int,
        val bolehEkspor: Boolean,
        val memuatLagi: Boolean = false,
        val galatLagi: String? = null,
    ) : LogAuditUiState {
        val adaLagi: Boolean get() = items.size < total
    }
}

/** Pesan satu-kali untuk snackbar. */
data class PesanAudit(val id: Long, val teks: String)

@HiltViewModel
class LogAuditViewModel @Inject constructor(
    private val api: AuditLogApi,
) : ViewModel() {

    /** Dispatcher penulisan berkas CSV; diganti di tes. */
    internal var dispatcherIo: CoroutineDispatcher = Dispatchers.IO

    private val _state = MutableStateFlow<LogAuditUiState>(LogAuditUiState.Memuat)
    val state: StateFlow<LogAuditUiState> = _state.asStateFlow()

    private val _saringan = MutableStateFlow(SaringanAudit())
    val saringan: StateFlow<SaringanAudit> = _saringan.asStateFlow()

    private val _terbuka = MutableStateFlow<AuditLogDto?>(null)

    /** Log yang rinciannya sedang dibuka di Sheet. */
    val terbuka: StateFlow<AuditLogDto?> = _terbuka.asStateFlow()

    private val _mengekspor = MutableStateFlow(false)
    val mengekspor: StateFlow<Boolean> = _mengekspor.asStateFlow()

    private val _pesan = MutableStateFlow<PesanAudit?>(null)
    val pesan: StateFlow<PesanAudit?> = _pesan.asStateFlow()

    private var tugasMuat: Job? = null

    init {
        muat()
    }

    /** Memuat halaman pertama untuk saringan aktif (membatalkan muatan sebelumnya). */
    fun muat() {
        tugasMuat?.cancel()
        tugasMuat = viewModelScope.launch {
            _state.value = LogAuditUiState.Memuat
            _state.value = try {
                val res = minta(1)
                val isi = res.body()
                if (res.isSuccessful && isi != null) {
                    LogAuditUiState.Siap(
                        items = isi.items,
                        total = isi.total,
                        halaman = isi.page,
                        ukuranHalaman = isi.pageSize,
                        bolehEkspor = isi.canExport,
                    )
                } else {
                    LogAuditUiState.Galat(ApiError.dari(HttpException(res)).pesanTampil())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                LogAuditUiState.Galat(ApiError.dari(e).pesanTampil())
            }
        }
    }

    /** Halaman berikutnya ditambahkan di bawah; galat ditampilkan di kaki daftar. */
    fun muatLagi() {
        val siap = _state.value as? LogAuditUiState.Siap ?: return
        if (siap.memuatLagi || !siap.adaLagi) return
        tugasMuat = viewModelScope.launch {
            _state.value = siap.copy(memuatLagi = true, galatLagi = null)
            val berikut = siap.halaman + 1
            _state.value = try {
                val res = minta(berikut)
                val isi = res.body()
                if (res.isSuccessful && isi != null) {
                    // Baris baru bisa menggeser halaman: buang duplikat berdasarkan id.
                    val ada = siap.items.mapTo(HashSet()) { it.id }
                    siap.copy(
                        items = siap.items + isi.items.filter { it.id !in ada },
                        total = isi.total,
                        halaman = isi.page,
                        memuatLagi = false,
                        bolehEkspor = isi.canExport,
                    )
                } else {
                    siap.copy(memuatLagi = false, galatLagi = ApiError.dari(HttpException(res)).pesanTampil())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                siap.copy(memuatLagi = false, galatLagi = ApiError.dari(e).pesanTampil())
            }
        }
    }

    private suspend fun minta(halaman: Int) = _saringan.value.let { s ->
        api.daftar(
            page = halaman,
            pageSize = UKURAN_HALAMAN,
            actorId = s.actorId,
            action = s.action,
            targetType = s.targetType,
            role = s.role,
            dateFrom = s.dari?.toString(),
            dateTo = s.sampai?.toString(),
        )
    }

    /** Menerapkan saringan baru (dari Sheet saringan) lalu memuat ulang dari halaman 1. */
    fun terapkan(baru: SaringanAudit) {
        val rapi = if (baru.dari != null && baru.sampai != null && baru.dari.isAfter(baru.sampai)) {
            baru.copy(dari = baru.sampai, sampai = baru.dari)
        } else {
            baru
        }
        if (rapi == _saringan.value) return
        _saringan.value = rapi
        muat()
    }

    fun hapusSaringan() = terapkan(SaringanAudit())

    /** "Lihat semua aktivitas pelaku ini" dari Sheet rincian. */
    fun saringPelaku(log: AuditLogDto) {
        val aktor = log.actor ?: return
        _terbuka.value = null
        terapkan(_saringan.value.copy(actorId = aktor.id.ifBlank { log.actorId }, actorNama = aktor.name))
    }

    fun hapusPelaku() = terapkan(_saringan.value.copy(actorId = null, actorNama = null))

    fun buka(log: AuditLogDto) {
        _terbuka.value = log
    }

    fun tutup() {
        _terbuka.value = null
    }

    fun pesanTampil() {
        _pesan.value = null
    }

    /**
     * Unduh CSV dengan rentang tanggal & aksi yang sama (web: exportHref).
     * [keluaran] membuka aliran ke berkas yang dipilih pengguna; [hapus]
     * membuang berkas kosong itu bila server menolak.
     */
    fun ekspor(keluaran: () -> OutputStream?, hapus: () -> Unit = {}) {
        if (_mengekspor.value) return
        val s = _saringan.value
        viewModelScope.launch {
            _mengekspor.value = true
            try {
                val res = api.ekspor(dateFrom = s.dari?.toString(), dateTo = s.sampai?.toString(), action = s.action)
                val badan = res.body()
                if (!res.isSuccessful || badan == null) {
                    runCatching(hapus)
                    kabari(ApiError.dari(HttpException(res)).pesanTampil())
                    return@launch
                }
                withContext(dispatcherIo) {
                    badan.use { b ->
                        val aliran = keluaran() ?: error("Berkas tujuan tidak bisa dibuka.")
                        aliran.use { o -> b.byteStream().copyTo(o) }
                    }
                }
                val diekspor = res.headers()["X-Exported-Rows"]?.toIntOrNull()
                val total = res.headers()["X-Total-Rows"]?.toIntOrNull()
                // Rute ekspor hanya mengenal rentang tanggal + aksi (C1-S6): sebutkan bedanya.
                kabari(listOfNotNull(pesanEkspor(diekspor, total), catatanCsv(s)).joinToString(" "))
            } catch (e: CancellationException) {
                throw e
            } catch (e: IllegalStateException) {
                runCatching(hapus)
                kabari(e.message ?: "Berkas belum tersimpan.")
            } catch (e: Exception) {
                runCatching(hapus)
                kabari(ApiError.dari(e).pesanTampil())
            } finally {
                _mengekspor.value = false
            }
        }
    }

    private fun kabari(teks: String) {
        _pesan.value = PesanAudit(System.nanoTime(), teks)
    }

    companion object {
        const val UKURAN_HALAMAN = 20

        /** Pesan setelah CSV tersimpan; menyebut batas 5.000 baris bila terpotong. */
        fun pesanEkspor(diekspor: Int?, total: Int?): String = when {
            diekspor == null -> "Log aktivitas tersimpan. Unduhan tercatat di log."
            total != null && total > diekspor ->
                "${angka(diekspor)} dari ${angka(total)} baris tersimpan (batas 5.000 terbaru)."
            else -> "${angka(diekspor)} baris log tersimpan. Unduhan tercatat di log."
        }

        /**
         * Perbedaan isi CSV dengan daftar di layar. Rute ekspor server hanya
         * menerima dateFrom/dateTo/action; pelaku, sasaran, dan peran pelaku
         * tidak ikut, dan tanpa tanggal awal server memakai 30 hari terakhir.
         * null = CSV sama dengan saringan layar.
         */
        fun catatanCsv(s: SaringanAudit): String? {
            val bagian = listOfNotNull(
                if (s.actorId != null || s.targetType != null || s.role != null) {
                    "CSV hanya memakai rentang tanggal dan aksi; saringan pelaku, sasaran, dan peran tidak ikut."
                } else {
                    null
                },
                if (s.dari == null) "Tanpa tanggal awal, CSV berisi 30 hari terakhir." else null,
            )
            return bagian.takeIf { it.isNotEmpty() }?.joinToString(" ")
        }

        /** Kalimat jawaban di atas daftar (answer web). */
        fun kalimatJawaban(siap: LogAuditUiState.Siap, disaring: Boolean, sekarang: Instant = Instant.now()): String {
            if (siap.total == 0) {
                return if (disaring) {
                    "Tidak ada aktivitas yang cocok dengan saringan ini."
                } else {
                    "Belum ada aktivitas yang tercatat."
                }
            }
            val kepala = "${angka(siap.total)} aktivitas tercatat" + if (disaring) " untuk saringan ini" else ""
            val terbaru = siap.items.firstOrNull() ?: return "$kepala."
            return "$kepala; terakhir oleh ${terbaru.actor?.name ?: "sistem"}, ${relatif(terbaru.at, sekarang)}."
        }
    }
}
