// Sheet Ringkasan mingguan untuk Direktur (T6-C6 Fase 2). Padanan web:
// src/components/kadiv/weekly-summary-card.tsx + rute
// src/app/api/kadiv/weekly-summary/route.ts — DTO T6-C1 core/network.
//
// GET memuat draf otomatis + baris tersimpan; poin disunting sebagai baris
// MkField (tambah/hapus, 1–3 baris, 280 huruf). PUT menyimpan draf;
// POST "send" mengirim ke Direktur (409 PENDING_REVIEW ditangani dengan
// konfirmasi "Kirim tetap" — confirmPending true; 409 lain SENT/LOCKED/
// FORWARDED/NOT_CURRENT_WEEK ditampilkan pesannya); POST "unsend" menarik
// kembali ke draf (hanya pengirim, jendela undoMinutes = 15 menit; di luar
// itu 409 dengan pesan). Status TERKIRIM + waktu kirim selalu ditampilkan.
package id.co.monitorkarya.app.ui.tim

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.KadivApi
import id.co.monitorkarya.core.network.dto.KonflikDto
import id.co.monitorkarya.core.network.dto.WeeklySummarySaveRequest
import id.co.monitorkarya.core.network.dto.WeeklySummarySendRequest
import id.co.monitorkarya.core.network.dto.WeeklySummaryResponse
import id.co.monitorkarya.core.network.mkJson
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.ResponseBody.Companion.toResponseBody

/** Batas poin per baris (normalizePoints src/lib/kadiv-math.ts). */
internal const val POIN_MAKS_HURUF = 280

/** Jumlah poin minimal/maksimal (1–3, sama dengan rute). */
internal const val POIN_MIN = 1
internal const val POIN_MAKS = 3

/** Pesan validasi persis rute (PUT/POST 422). */
internal const val PESAN_POIN = "Tulis 1 sampai 3 poin, masing-masing paling banyak 280 huruf"

// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/**
 * Ringkasan mingguan hasil pemetaan WeeklySummaryResponse. Angka yang
 * ditampilkan sudah dipilih seperti web: baris tersimpan bila TERKIRIM,
 * selain itu angka live.
 */
data class RingkasanDirekturUi(
    val divisiId: String,
    val divisiNama: String,
    /** week.key, mis. "2026-W41". */
    val mingguKunci: String,
    val isoMinggu: Int,
    /** Tenggat serah ke Admin PT (Kamis 17.00 WIB), ISO. */
    val batasSerahIso: String,
    /** Kunci pekan (Jumat 17.00 WIB), ISO. */
    val kunciIso: String,
    val outputDiterima: Int,
    val targetOutput: Int,
    val proyekSesuai: Int,
    val totalProyek: Int,
    val kendalaTerbuka: Int,
    val menungguReview: Int,
    /** saved.status == "TERKIRIM". */
    val terkirim: Boolean,
    /** saved.points bila ada isinya; null bila belum pernah disimpan. */
    val poinTersimpan: List<String>?,
    /** live.points — draf otomatis untuk "Pakai draf otomatis". */
    val poinOtomatis: List<String>,
    /** saved.sentAt (ISO) — waktu kirim ke Direktur. */
    val terkirimIso: String?,
    /** saved.updatedAt (ISO). */
    val diperbaruiIso: String?,
    /** Nama direktur penerima. */
    val direktur: List<String>,
    /** blocked.message — alasan terkunci; null = boleh disunting/dikirim. */
    val terblokirPesan: String?,
    /** Jendela "tarik kembali" setelah kirim, menit. */
    val undoMenit: Int,
)

/** Status UI sheet: Memuat → Siap(ringkasan) atau Galat(pesan). */
sealed interface RingkasanUiState {
    data object Memuat : RingkasanUiState

    data class Siap(val data: RingkasanDirekturUi) : RingkasanUiState

    data class Galat(val pesan: String) : RingkasanUiState
}

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class RingkasanDirekturViewModel @Inject constructor(
    private val api: KadivApi,
) : ViewModel() {

    private val _state = MutableStateFlow<RingkasanUiState>(RingkasanUiState.Memuat)

    /** Status isi sheet. */
    val state: StateFlow<RingkasanUiState> = _state.asStateFlow()

    private val _poin = MutableStateFlow<List<String>>(emptyList())

    /** Baris poin yang sedang disunting (1–3 baris; sinkron ulang tiap muat). */
    val poin: StateFlow<List<String>> = _poin.asStateFlow()

    private val _konfirmasiPending = MutableStateFlow(false)

    /** Kirim terhalang output menunggu review — menunggu "Kirim tetap". */
    val konfirmasiPending: StateFlow<Boolean> = _konfirmasiPending.asStateFlow()

    private val _konfirmasiJumlah = MutableStateFlow(0)

    /** Jumlah output yang masih menunggu review (mengisi catatan konfirmasi). */
    val konfirmasiJumlah: StateFlow<Int> = _konfirmasiJumlah.asStateFlow()

    private val _pesan = MutableStateFlow<String?>(null)

    /** Pesan hasil aksi (sukses/galat 409) — satu-kali, dihapus pesanTampil(). */
    val pesan: StateFlow<String?> = _pesan.asStateFlow()

    private val _sibuk = MutableStateFlow(false)

    /** Sedang PUT/POST — tombol footer dinonaktifkan. */
    val sibuk: StateFlow<Boolean> = _sibuk.asStateFlow()

    init {
        muat()
    }

    /** Menarik ringkasan minggu berjalan; poin disunting diarahkan ulang dari tampilan. */
    fun muat() {
        viewModelScope.launch {
            _state.value = RingkasanUiState.Memuat
            muatInternal(hapusPesan = true)
        }
    }

    /** Coba lagi setelah galat. */
    fun ulang() = muat()

    /** Mengubah satu baris poin; lebih dari 280 huruf dipangkas (validasi ramah). */
    fun ubahPoin(indeks: Int, nilai: String) {
        if (indeks !in _poin.value.indices) return
        _poin.value = _poin.value.toMutableList().apply {
            set(indeks, nilai.take(POIN_MAKS_HURUF))
        }
    }

    /** Menambah baris poin kosong (maks 3). */
    fun tambahPoin() {
        if (_poin.value.size < POIN_MAKS) _poin.value = _poin.value + ""
    }

    /** Menghapus satu baris poin (minimal 1). */
    fun hapusPoin(indeks: Int) {
        if (_poin.value.size > POIN_MIN) {
            _poin.value = _poin.value.filterIndexed { i, _ -> i != indeks }
        }
    }

    /** "Pakai draf otomatis" — kembalikan poin ke draf server. */
    fun pakaiOtomatis() {
        val otomatis = (state.value as? RingkasanUiState.Siap)?.data?.poinOtomatis ?: return
        _poin.value = otomatis.ifEmpty { List(POIN_MIN) { "" } }
    }

    /** Pesan sudah terbaca — bersihkan. */
    fun pesanTampil() {
        _pesan.value = null
    }

    /** Membatalkan konfirmasi "Kirim tetap" (kembali ke tombol kirim biasa). */
    fun batalKonfirmasi() {
        _konfirmasiPending.value = false
        _konfirmasiJumlah.value = 0
    }

    /** PUT /api/kadiv/weekly-summary — simpan draf 1–3 poin. */
    fun simpanDraf() {
        val data = (state.value as? RingkasanUiState.Siap)?.data ?: return
        val bersih = poinBersih() ?: run {
            _pesan.value = PESAN_POIN
            return
        }
        aksi {
            val res = api.simpanRingkasan(WeeklySummarySaveRequest(divisionId = data.divisiId, points = bersih))
            if (res.isSuccessful) {
                _pesan.value = "Draf ringkasan disimpan."
                muatInternal(hapusPesan = false)
            } else {
                _pesan.value = when (val g = pesanGalat(res.code(), res.errorBody()?.string())) { is GalatRingkasan.Pesan -> g.pesan; is GalatRingkasan.Pending -> g.pesan }
            }
        }
    }

    /**
     * POST "send" — kirim ke Direktur. [konfirmasi] true = lewati pagar
     * PENDING_REVIEW (tombol "Kirim tetap ke Direktur"). Sukses mengunci
     * tampilan ke status TERKIRIM + waktu kirim.
     */
    fun kirim(konfirmasi: Boolean = false) {
        val data = (state.value as? RingkasanUiState.Siap)?.data ?: return
        val bersih = poinBersih() ?: run {
            _pesan.value = PESAN_POIN
            return
        }
        aksi {
            val res = api.kirimRingkasan(
                WeeklySummarySendRequest.kirim(
                    divisionId = data.divisiId,
                    points = bersih,
                    confirmPending = konfirmasi.takeIf { it },
                ),
            )
            if (res.isSuccessful) {
                _konfirmasiPending.value = false
                val isi = res.body()
                val nama = isi?.directors?.joinToString(", ") { it.name }.orEmpty()
                _pesan.value = if (nama.isNotEmpty()) "Ringkasan terkirim ke $nama." else "Ringkasan terkirim ke Direktur."
                muatInternal(hapusPesan = false)
            } else {
                val galat = pesanGalat(res.code(), res.errorBody()?.string())
                if (galat is GalatRingkasan.Pending) {
                    // 409 PENDING_REVIEW: satu-satunya 409 yang bisa diteruskan
                    // pengguna — tampilkan konfirmasi, bukan pesan galat.
                    _konfirmasiPending.value = true
                    _konfirmasiJumlah.value = galat.jumlah
                } else {
                    _pesan.value = (galat as GalatRingkasan.Pesan).pesan
                }
            }
        }
    }

    /** POST "unsend" — tarik kembali ke draf (jendela undoMinutes; 409 = pesan). */
    fun tarik() {
        val data = (state.value as? RingkasanUiState.Siap)?.data ?: return
        aksi {
            val res = api.kirimRingkasan(WeeklySummarySendRequest.tarik(divisionId = data.divisiId))
            if (res.isSuccessful) {
                _pesan.value = "Ringkasan ditarik kembali ke draf."
                muatInternal(hapusPesan = false)
            } else {
                _pesan.value = when (val g = pesanGalat(res.code(), res.errorBody()?.string())) { is GalatRingkasan.Pesan -> g.pesan; is GalatRingkasan.Pending -> g.pesan }
            }
        }
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    /** Poin dirapikan (pangkas spasi, buang kosong); null bila tidak lolos 1–3. */
    private fun poinBersih(): List<String>? {
        val bersih = _poin.value.map { it.trim() }.filter { it.isNotEmpty() }
        if (bersih.size !in POIN_MIN..POIN_MAKS) return null
        if (bersih.any { it.length > POIN_MAKS_HURUF }) return null
        return bersih
    }

    /** Menarik ulang tanpa mengubah status ke Memuat; [hapusPesan] menjaga pesan sukses. */
    private suspend fun muatInternal(hapusPesan: Boolean) {
        if (hapusPesan) _pesan.value = null
        _konfirmasiPending.value = false
        _konfirmasiJumlah.value = 0
        _state.value = try {
            val res = api.ringkasan()
            val isi = res.body()
            when {
                res.isSuccessful && isi != null -> {
                    val data = isi.keRingkasanUi()
                    _poin.value = (data.poinTersimpan?.ifEmpty { null } ?: data.poinOtomatis)
                        .ifEmpty { List(POIN_MIN) { "" } }
                    RingkasanUiState.Siap(data)
                }
                res.isSuccessful -> RingkasanUiState.Galat("Ringkasan mingguan belum termuat. Coba lagi.")
                else -> RingkasanUiState.Galat(ApiError.dari(retrofit2.HttpException(res)).pesanTampil())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            RingkasanUiState.Galat(ApiError.dari(e).pesanTampil())
        }
    }

    /** Pembungkus aksi tulis: penanda sibuk + penerjemahan kegagalan jaringan. */
    private fun aksi(blok: suspend () -> Unit) {
        viewModelScope.launch {
            _sibuk.value = true
            try {
                blok()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _pesan.value = ApiError.dari(e).pesanTampil()
            } finally {
                _sibuk.value = false
            }
        }
    }

    /**
     * Badan galat (kode HTTP + teks) → GalatRingkasan. 409 diurai KonflikDto
     * {error, code, pendingReview}; sisanya lewat ApiError.dari terpusat.
     */
    private fun pesanGalat(kode: Int, badan: String?): GalatRingkasan {
        if (kode == 409) {
            val isi = badan?.let {
                runCatching { mkJson.decodeFromString(KonflikDto.serializer(), it) }.getOrNull()
            }
            val pesan = isi?.error ?: "Ringkasan belum terkirim"
            val kodeGalat = isi?.code
            return when {
                kodeGalat == "PENDING_REVIEW" && isi != null -> GalatRingkasan.Pending(
                    jumlah = isi.pendingReview ?: 0,
                    pesan = pesan,
                )
                kodeGalat == "SENT" -> GalatRingkasan.Pesan(
                    "Ringkasan minggu ini sudah dikirim. Tarik kembali dulu bila ingin menyuntingnya.",
                )
                else -> GalatRingkasan.Pesan(pesan)
            }
        }
        val sintetis = retrofit2.HttpException(
            retrofit2.Response.error<Any>(kode, (badan ?: "").toResponseBody(null)),
        )
        return GalatRingkasan.Pesan(ApiError.dari(sintetis).pesanTampil())
    }
}

/** Hasil penerjemahan galat aksi kirim/tarik/simpan. */
internal sealed interface GalatRingkasan {

    /** 409 PENDING_REVIEW — bisa diteruskan dengan konfirmasi. */
    data class Pending(val jumlah: Int, val pesan: String) : GalatRingkasan

    /** Pesan biasa untuk ditampilkan. */
    data class Pesan(val pesan: String) : GalatRingkasan
}

// ------------------------------------------------------------------
// Pemetaan DTO → model tampilan
// ------------------------------------------------------------------

/** WeeklySummaryResponse → RingkasanDirekturUi (angka tampil seperti web). */
internal fun WeeklySummaryResponse.keRingkasanUi(): RingkasanDirekturUi {
    val tersimpan = saved
    val terkirim = tersimpan?.status == "TERKIRIM"
    val sumber = if (terkirim && tersimpan != null) tersimpan else null
    return RingkasanDirekturUi(
        divisiId = division.id,
        divisiNama = division.name,
        mingguKunci = week.key,
        isoMinggu = week.isoWeek,
        batasSerahIso = week.handoverBy,
        kunciIso = week.lockAt,
        outputDiterima = sumber?.outputsAccepted ?: live.outputsAccepted,
        targetOutput = sumber?.outputsTarget ?: live.outputsTarget,
        proyekSesuai = sumber?.projectsOnTrack ?: live.projectsOnTrack,
        totalProyek = sumber?.projectsTotal ?: live.projectsTotal,
        kendalaTerbuka = sumber?.openObstacles ?: live.openObstacles,
        menungguReview = sumber?.pendingReview ?: live.pendingReview,
        terkirim = terkirim,
        poinTersimpan = tersimpan?.points?.ifEmpty { null },
        poinOtomatis = live.points,
        terkirimIso = tersimpan?.sentAt,
        diperbaruiIso = tersimpan?.updatedAt,
        direktur = directors.map { it.name },
        terblokirPesan = blocked?.message,
        undoMenit = undoMinutes,
    )
}
