// Layar Penerimaan Admin PT (T6-C7 Fase 2). Padanan web:
// src/components/views/inbox-view.tsx + rute src/app/api/inbox/route.ts.
//
// Satu GET /api/inbox memberi dua arus (harian per proyek dari PIC, mingguan
// per divisi dari kepala divisi) beserta status serah terimanya; POST
// meneruskan SATU laporan ke holding (respons {ok, undoToken?}). Penerusan
// harian sekaligus membekukan laporannya, jadi galat 409 ("sudah diteruskan")
// menandai baris "Beku — perlu buka kunci" TANPA memutus loop teruskan semua;
// sukses dengan undoToken ditawarkan "Urungkan" (Snackbar aksi) yang memanggil
// UndoApi (POST /api/undo; tiket 15 menit, sekali pakai — kontrak T5-B1).
package id.co.monitorkarya.app.ui.penerimaan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.InboxApi
import id.co.monitorkarya.core.network.api.UndoApi
import id.co.monitorkarya.core.network.dto.InboxHarianDto
import id.co.monitorkarya.core.network.dto.InboxMingguanDto
import id.co.monitorkarya.core.network.dto.InboxResponse
import id.co.monitorkarya.core.network.dto.InboxWeekDto
import id.co.monitorkarya.core.network.dto.TeruskanRequest
import id.co.monitorkarya.core.network.dto.UndoRequest
import id.co.monitorkarya.designsystem.components.MkStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit

// ------------------------------------------------------------------
// Penyedia dependensi (dari Retrofit tunggal AppModule)
// ------------------------------------------------------------------

/**
 * InboxApi (T6-C2) + UndoApi (T5-B1) dari Retrofit bersama AppModule — pola
 * yang sama dengan LaporanModule. Bila penyedia pusat untuk salah satunya
 * ditambahkan nanti, hapus @Provides yang kembar di sini (Hilt menolak
 * binding ganda untuk jenis yang sama).
 */
// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Dua arus penerimaan; [nilai] dipakai sebagai `kind` badan POST /api/inbox. */
enum class JenisLaporan(val nilai: String) {
    HARIAN("daily"),
    MINGGUAN("weekly");

    /** Badan POST penerusan untuk laporan jenis ini. */
    fun permintaan(idLaporan: String): TeruskanRequest =
        if (this == MINGGUAN) TeruskanRequest.mingguan(idLaporan) else TeruskanRequest.harian(idLaporan)
}

/**
 * Lencana satu baris antrean (padanan MkStatus + kata): BARU laporan draf
 * PIC, SIAP diteruskan, DITERUSKAN ke holding, BEKU 409 (perlu buka kunci),
 * BELUM_MASUK tanpa laporan, MENUNGGU persetujuan kadiv.
 */
enum class StatusAntrean(val lencana: MkStatus, val label: String) {
    BARU(MkStatus.INFO, "Baru"),
    SIAP(MkStatus.ON, "Siap diteruskan"),
    DITERUSKAN(MkStatus.DONE, "Diteruskan"),
    BEKU(MkStatus.LATE, "Beku"),
    BELUM_MASUK(MkStatus.NEUTRAL, "Belum masuk"),
    MENUNGGU(MkStatus.RISK, "Menunggu kadiv"),
}

/** Satu baris antrean: judul proyek/divisi, sub pengirim·waktu, dan statusnya. */
data class AntreanItem(
    val jenis: JenisLaporan,
    /** Id laporan (bukan id proyek/divisi) — dipakai badan POST penerusan. */
    val idLaporan: String,
    val judul: String,
    val sub: String,
    val status: StatusAntrean,
    /** Menampilkan tombol "Teruskan" dan ikut dihitung "Teruskan semua". */
    val siap: Boolean,
)

/** Meja penerimaan satu hari/pekan beserta kalimat jawaban di layar. */
data class MejaPenerimaan(
    /** "Kamis, 8 Oktober 2026 · M41 2026". */
    val konteks: String,
    val jawaban: String,
    /** Kalimat dukungan (belum masuk + hitung mundur kunci); null bila kosong. */
    val dukungan: String?,
    val harian: List<AntreanItem>,
    val mingguan: List<AntreanItem>,
) {
    val siapHarian: Int get() = harian.count { it.siap }
    val siapMingguan: Int get() = mingguan.count { it.siap }
    val siapTotal: Int get() = siapHarian + siapMingguan

    /** Antrean "Teruskan semua": harian dulu, lalu mingguan. */
    val antreanSiap: List<AntreanItem> get() = harian.filter { it.siap } + mingguan.filter { it.siap }
}

/** Snackbar satu-kali; [undoToken] berisi tiket "Urungkan" (kosong = tanpa aksi). */
data class NotifikasiPenerimaan(
    val id: Long,
    val pesan: String,
    val undoToken: List<String> = emptyList(),
)

/** Keadaan sibuk + notifikasi layar (dikumpulkan satu agar layar ramping). */
data class AktivitasPenerimaan(
    /** Id laporan yang sedang diteruskan tunggal; null = tidak ada. */
    val sedangTerusSatu: String? = null,
    val sedangTerusSemua: Boolean = false,
    /** Progres "Teruskan semua" — selesai/total untuk label "Meneruskan (2/5)…". */
    val progresSelesai: Int = 0,
    val progresTotal: Int = 0,
    val notifikasi: NotifikasiPenerimaan? = null,
)

/** Status UI layar: Memuat → Siap(meja) atau Galat(pesan). */
sealed interface PenerimaanUiState {
    data object Memuat : PenerimaanUiState
    data class Siap(val meja: MejaPenerimaan) : PenerimaanUiState
    data class Galat(val pesan: String) : PenerimaanUiState
}

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class PenerimaanViewModel @Inject constructor(
    private val inboxApi: InboxApi,
    private val undoApi: UndoApi,
) : ViewModel() {

    private val _state = MutableStateFlow<PenerimaanUiState>(PenerimaanUiState.Memuat)

    /** Status layar Penerimaan. */
    val state: StateFlow<PenerimaanUiState> = _state.asStateFlow()

    private val _aktivitas = MutableStateFlow(AktivitasPenerimaan())

    /** Tombol sibuk + snackbar satu-kali. */
    val aktivitas: StateFlow<AktivitasPenerimaan> = _aktivitas.asStateFlow()

    /**
     * Id laporan yang mendapat 409 saat diteruskan. Tanda BEKU bertahan melewati
     * muat ulang (laporan memang dikunci begitu diteruskan) sampai status
     * penerusannya berubah di sisi server.
     */
    private val bekuIds = mutableSetOf<String>()

    init {
        muat()
    }

    /** Menarik meja; status kembali ke Memuat dulu supaya layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = PenerimaanUiState.Memuat
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
     * POST /api/inbox untuk satu laporan. Sukses → snackbar "… diteruskan ke
     * holding." + "Urungkan" bila ada undoToken; 409 → baris ditandai BEKU
     * (perlu buka kunci) lalu meja dimuat ulang; galat lain → snackbar pesan.
     */
    fun teruskanSatu(idLaporan: String, jenis: JenisLaporan) {
        if (sibuk()) return
        val nama = namaItem(idLaporan)
        viewModelScope.launch {
            _aktivitas.value = _aktivitas.value.copy(sedangTerusSatu = idLaporan)
            try {
                val res = inboxApi.teruskan(jenis.permintaan(idLaporan))
                if (res.isSuccessful) {
                    muatInternal()
                    kirimNotifikasi(
                        pesan = "$nama diteruskan ke holding.",
                        undoToken = listOfNotNull(res.body()?.undoToken),
                    )
                } else if (res.code() == 409) {
                    bekuIds += idLaporan
                    muatInternal()
                    kirimNotifikasi(pesanGalat(res))
                } else {
                    kirimNotifikasi(pesanGalat(res))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                kirimNotifikasi(ApiError.dari(e).pesanTampil())
            } finally {
                _aktivitas.value = _aktivitas.value.copy(sedangTerusSatu = null)
            }
        }
    }

    /**
     * Teruskan berurutan seluruh antrean siap (harian lalu mingguan). Satu
     * kegagalan tidak memutus loop: hasilnya parsial "x berhasil, y gagal"
     * dengan pesan galat terakhir; 409 menandai baris BEKU. Setiap sukses
     * mengumpulkan undoToken — "Urungkan" membatalkan semuanya bergiliran.
     */
    fun teruskanSemua() {
        if (sibuk()) return
        val antrean = (state.value as? PenerimaanUiState.Siap)?.meja?.antreanSiap ?: return
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
                            if (res.code() == 409) bekuIds += item.idLaporan
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
     * ulang meja karena laporan yang diurungkan kembali siap diteruskan.
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
                gagal == 0 -> pesanSukses ?: "Penerusan diurungkan."
                berhasil > 0 -> listOfNotNull("$berhasil diurungkan, $gagal gagal.", pesanGagal).joinToString(" ")
                else -> pesanGagal ?: "Tindakan belum bisa diurungkan. Coba lagi."
            }
            kirimNotifikasi(pesan)
        }
    }

    /** Ada operasi penerusan/urungkan berjalan — abaikan perintah baru. */
    private fun sibuk(): Boolean {
        val a = _aktivitas.value
        return a.sedangTerusSemua || a.sedangTerusSatu != null
    }

    /** Nama baris untuk snackbar; "Laporan" bila meja sudah berganti. */
    private fun namaItem(idLaporan: String): String {
        val meja = (state.value as? PenerimaanUiState.Siap)?.meja ?: return "Laporan"
        return (meja.harian + meja.mingguan).firstOrNull { it.idLaporan == idLaporan }?.judul ?: "Laporan"
    }

    /** Menarik meja tanpa mengubah status ke Memuat (dipakai usai aksi). */
    private suspend fun muatInternal() {
        _state.value = try {
            val res = inboxApi.inbox()
            if (res.isSuccessful) {
                PenerimaanUiState.Siap(parseMeja(res.body() ?: mejaKosong(), bekuIds))
            } else {
                PenerimaanUiState.Galat(pesanGalat(res))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            PenerimaanUiState.Galat(ApiError.dari(e).pesanTampil())
        }
    }

    private fun kirimNotifikasi(pesan: String, undoToken: List<String> = emptyList()) {
        _aktivitas.value = _aktivitas.value.copy(
            notifikasi = NotifikasiPenerimaan(id = System.nanoTime(), pesan = pesan, undoToken = undoToken),
        )
    }

    /** "3 laporan diteruskan ke holding." / "2 laporan diteruskan, 1 gagal. <pesan>". */
    private fun pesanHasil(berhasil: Int, gagal: Int, pesanGagal: String?): String = when {
        berhasil > 0 && gagal == 0 -> "$berhasil laporan diteruskan ke holding."
        berhasil > 0 -> listOfNotNull("$berhasil laporan diteruskan, $gagal gagal.", pesanGagal).joinToString(" ")
        else -> pesanGagal ?: "Tidak ada laporan yang diteruskan."
    }

    /** Respons tidak sukses → pesan siap tampil lewat ApiError terpusat. */
    private fun pesanGalat(res: Response<*>): String = ApiError.dari(HttpException(res)).pesanTampil()
}

// ------------------------------------------------------------------
// Parsing GET (murni — bekuIds disuntik agar tanda BEKU bertahan)
// ------------------------------------------------------------------

/** Fallback bila respons sukses tanpa badan — tetap ter parse tanpa melempar. */
internal fun mejaKosong(): InboxResponse = InboxResponse(
    reportDate = "",
    dailyLockAt = "",
    week = InboxWeekDto(isoYear = 0, isoWeek = 0, handoverBy = "", lockAt = ""),
)

/** InboxResponse → MejaPenerimaan; kalimat jawaban/dukungan disusun di sini. */
internal fun parseMeja(isi: InboxResponse, bekuIds: Set<String> = emptySet()): MejaPenerimaan {
    val harian = isi.daily.map { barisHarian(it, bekuIds) }
    val mingguan = isi.weekly.map { barisMingguan(it, bekuIds) }
    val siapTotal = harian.count { it.siap } + mingguan.count { it.siap }
    val jawaban = when {
        siapTotal > 0 -> "$siapTotal laporan siap diteruskan ke holding."
        harian.isEmpty() && mingguan.isEmpty() -> "Belum ada proyek atau divisi yang melapor ke Anda."
        else -> "Tidak ada laporan yang menunggu diteruskan."
    }
    return MejaPenerimaan(
        konteks = susunKonteks(isi),
        jawaban = jawaban,
        dukungan = susunDukungan(isi),
        harian = harian,
        mingguan = mingguan,
    )
}

private fun barisHarian(d: InboxHarianDto, bekuIds: Set<String>): AntreanItem {
    val beku = d.reportId != null && d.reportId in bekuIds
    val status = when {
        beku -> StatusAntrean.BEKU
        d.forwardedAt != null -> StatusAntrean.DITERUSKAN
        d.readyToForward -> StatusAntrean.SIAP
        d.reportId != null -> StatusAntrean.BARU // draf PIC, belum dikirim
        else -> StatusAntrean.BELUM_MASUK
    }
    val sub = listOfNotNull(
        d.code.takeIf { it.isNotBlank() },
        d.picName?.let { "PIC $it" },
        jamWib(d.submittedAt)?.let { "dikirim $it WIB" },
        if (d.reportId != null) "${d.evidenceCount} bukti" else null,
        if (beku) "perlu buka kunci" else null,
    ).joinToString(" · ")
    return AntreanItem(
        jenis = JenisLaporan.HARIAN,
        idLaporan = d.reportId.orEmpty(),
        judul = d.name.ifBlank { d.code },
        sub = sub,
        status = status,
        siap = d.readyToForward && !beku,
    )
}

private fun barisMingguan(w: InboxMingguanDto, bekuIds: Set<String>): AntreanItem {
    val beku = w.reportId != null && w.reportId in bekuIds
    val status = when {
        beku -> StatusAntrean.BEKU
        w.forwardedAt != null -> StatusAntrean.DITERUSKAN
        w.readyToForward -> StatusAntrean.SIAP
        w.reportId != null -> StatusAntrean.MENUNGGU
        else -> StatusAntrean.BELUM_MASUK
    }
    val sub = listOfNotNull(
        w.headName?.let { "Kadiv $it" },
        "${w.itemCount} item",
        if (beku) "perlu buka kunci" else null,
    ).joinToString(" · ")
    return AntreanItem(
        jenis = JenisLaporan.MINGGUAN,
        idLaporan = w.reportId.orEmpty(),
        judul = w.name,
        sub = sub,
        status = status,
        siap = w.readyToForward && !beku,
    )
}

/** "Kamis, 8 Oktober 2026 · M41 2026"; pekan dilewati bila kosong. */
private fun susunKonteks(isi: InboxResponse): String {
    val tanggal = tanggalPanjang(isi.reportDate) ?: isi.reportDate
    val pekan = if (isi.week.isoWeek > 0) " · M${isi.week.isoWeek} ${isi.week.isoYear}" else ""
    return "$tanggal$pekan"
}

/** Kalimat dukungan: belum masuk + keadaan kunci harian (padanan Hero web). */
private fun susunDukungan(isi: InboxResponse): String? {
    val belumMasuk = isi.daily.count { it.submittedAt == null }
    val bagianMasuk = when {
        belumMasuk > 0 -> "$belumMasuk laporan harian belum masuk."
        isi.daily.isNotEmpty() -> "Semua laporan harian sudah masuk."
        else -> null
    }
    val jamKunci = jamWib(isi.dailyLockAt)
    val bagianKunci = if (isi.dailyLocked) {
        jamKunci?.let { "Laporan harian sudah dikunci pukul $it WIB." }
    } else {
        val hitung = isi.dailyCountdown
        if (hitung == null || hitung.passed) {
            jamKunci?.let { "Kunci harian pukul $it WIB." }
        } else {
            "Kunci harian ${hitung.hours} jam ${hitung.minutes} menit lagi (${jamKunci ?: "17.00"} WIB)."
        }
    }
    return listOfNotNull(bagianMasuk, bagianKunci).joinToString(" ").ifEmpty { null }
}

// ------------------------------------------------------------------
// Waktu WIB (padanan helper ui/laporan — lokal agar berdiri sendiri)
// ------------------------------------------------------------------

private val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val formatJam = DateTimeFormatter.ofPattern("HH.mm").withZone(ZONA_WIB)

private val formatTanggal = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale.forLanguageTag("id-ID")).withZone(ZONA_WIB)

/** ISO → Instant; null bila rusak. */
internal fun cobaIso(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** "HH.mm" WIB dari ISO; null bila ISO rusak. */
internal fun jamWib(iso: String?): String? = cobaIso(iso)?.let { formatJam.format(it) }

/** "Kamis, 8 Oktober 2026" dari ISO; null bila ISO rusak. */
internal fun tanggalPanjang(iso: String?): String? = cobaIso(iso)?.let { formatTanggal.format(it) }
