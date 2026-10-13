// Meja kerja Admin PT (T8-A1, keputusan pemilik 9 Okt — paritas web T8).
// Tab MEJA_KERJA ADMIN_PT: dua seksi akordeon "Laporan proyek" (harian PIC)
// dan "Laporan divisi" (mingguan kepala divisi) dari satu GET /api/inbox;
// kedua seksi terbuka otomatis. Mengetuk satu pelapor membuka sheet rincian
// BACA-SAJA (tanpa tulis):
//  - proyek: identitas + progres + capaian + kendala dari GET /api/daily-
//    reports?projectId&pageSize=1 (data inbox dipakai bila laporan belum ada),
//    lalu bukti GET /api/evidence?targetType=DAILY_REPORT&targetId saat sheet
//    terbuka — berkas gambar dimuat sebagai grid (tautan bertanda 5 menit dari
//    GET /api/evidence/{id}), tautan/berkas non-gambar jadi baris berkas;
//  - divisi: ringkas butir + status header dari GET /api/weekly-reports
//    (saring nama divisi + pekan ISO, cocokkan divisionId).
package id.co.monitorkarya.app.ui.admin

import id.co.monitorkarya.core.domain.teks.labelPic
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.app.ui.laporan.labelStatusHarian
import id.co.monitorkarya.app.ui.penerimaan.JenisLaporan
import id.co.monitorkarya.app.ui.penerimaan.StatusAntrean
import id.co.monitorkarya.app.ui.penerimaan.jamWib
import id.co.monitorkarya.app.ui.penerimaan.mejaKosong
import id.co.monitorkarya.app.ui.penerimaan.tanggalPanjang
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.DailyReportsApi
import id.co.monitorkarya.core.network.api.EvidenceApi
import id.co.monitorkarya.core.network.api.InboxApi
import id.co.monitorkarya.core.network.api.WeeklyReportsApi
import id.co.monitorkarya.core.network.dto.EvidenceItemDto
import id.co.monitorkarya.core.network.dto.InboxHarianDto
import id.co.monitorkarya.core.network.dto.InboxMingguanDto
import id.co.monitorkarya.core.network.dto.InboxResponse
import id.co.monitorkarya.core.network.dto.InboxWeekDto
import id.co.monitorkarya.core.network.dto.WeeklyReportRowDto
import id.co.monitorkarya.designsystem.components.MkStatus
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import retrofit2.Response

/** targetType bukti laporan harian (kontrak /api/evidence). */
private const val TARGET_LAPORAN_HARIAN = "DAILY_REPORT"

// ------------------------------------------------------------------
// Model tampilan — daftar pelapor
// ------------------------------------------------------------------

/** Satu baris pelapor di meja kerja Admin PT (bisa diklik untuk sheet rincian). */
data class BarisPelapor(
    val jenis: JenisLaporan,
    /** Id proyek (baris harian); kosong untuk baris divisi. */
    val idProyek: String,
    /** Id divisi (baris mingguan); kosong untuk baris proyek. */
    val idDivisi: String,
    /** Id laporan hari/pekan berjalan; null = belum melapor. */
    val idLaporan: String?,
    val judul: String,
    val sub: String,
    val status: StatusAntrean,
    /** Status header laporan mingguan (DRAFT/MENUNGGU_PERSETUJUAN/…); null untuk harian. */
    val statusHeader: String? = null,
)

/** Meja kerja: dua seksi pelapor + kalimat jawaban. */
data class MejaAdminKerja(
    /** "Kamis, 8 Oktober 2026 · M41 2026". */
    val konteks: String,
    val jawaban: String,
    val harian: List<BarisPelapor>,
    val mingguan: List<BarisPelapor>,
)

/** Status UI layar: Memuat → Siap(meja) atau Galat(pesan). */
sealed interface MejaKerjaAdminUiState {
    data object Memuat : MejaKerjaAdminUiState
    data class Siap(val meja: MejaAdminKerja) : MejaKerjaAdminUiState
    data class Galat(val pesan: String) : MejaKerjaAdminUiState
}

// ------------------------------------------------------------------
// Model tampilan — rincian di sheet
// ------------------------------------------------------------------

/** Rincian laporan harian satu proyek (identitas + progres + capaian + kendala). */
data class RincianProyek(
    val judul: String,
    val sub: String,
    val statusLabel: String,
    val status: MkStatus,
    val progres: Int,
    /** Tanggal laporan "YYYY-MM-DD"; null = belum melapor. */
    val tanggal: String?,
    val diserahkanIso: String?,
    val diteruskanIso: String?,
    val capaian: String?,
    val kendala: String?,
) {
    /** Ada laporan yang bisa ditinjau (capaian/kendala/bukti tersedia). */
    val adaLaporan: Boolean get() = tanggal != null
}

/** Satu butir capaian mingguan diringkas untuk daftar di sheet divisi. */
data class ButirRingkas(
    val id: String,
    val uraian: String,
    val statusLabel: String,
    val status: MkStatus,
    val progres: Int,
    val capaian: String?,
)

/** Rincian laporan mingguan satu divisi (status header + ringkas butir). */
data class RincianDivisi(
    val judul: String,
    val sub: String,
    val statusLabel: String,
    val status: MkStatus,
    val diserahkanIso: String?,
    val disetujuiIso: String?,
    val diteruskanIso: String?,
    val butir: List<ButirRingkas>,
)

/** Bukti gambar siap dimuat AsyncImage (url bertanda 5 menit atau tautan luar). */
data class BuktiGambar(val id: String, val url: String, val nama: String)

/** Bukti non-gambar sebagai baris berkas; [url] terisi untuk tautan luar. */
data class BuktiBerkas(val id: String, val nama: String, val ukuran: String, val url: String?)

/** Status pemuatan bukti di sheet proyek. */
sealed interface BuktiUiState {
    data object Memuat : BuktiUiState
    data class Siap(val gambar: List<BuktiGambar>, val berkas: List<BuktiBerkas>) : BuktiUiState
    data class Galat(val pesan: String) : BuktiUiState
}

/** Isi sheet rincian menurut jenis pelapor. */
sealed interface RincianAdminUiState {
    data object Memuat : RincianAdminUiState
    data class Proyek(val rincian: RincianProyek, val bukti: BuktiUiState) : RincianAdminUiState
    data class Divisi(val rincian: RincianDivisi) : RincianAdminUiState
    data class Galat(val pesan: String) : RincianAdminUiState
}

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class MejaKerjaAdminViewModel @Inject constructor(
    private val inboxApi: InboxApi,
    private val dailyReportsApi: DailyReportsApi,
    private val evidenceApi: EvidenceApi,
    private val weeklyReportsApi: WeeklyReportsApi,
) : ViewModel() {

    private val _state = MutableStateFlow<MejaKerjaAdminUiState>(MejaKerjaAdminUiState.Memuat)

    /** Status layar meja kerja. */
    val state: StateFlow<MejaKerjaAdminUiState> = _state.asStateFlow()

    private val _terpilih = MutableStateFlow<BarisPelapor?>(null)

    /** Baris yang sheet rinciannya sedang terbuka; null = tertutup. */
    val terpilih: StateFlow<BarisPelapor?> = _terpilih.asStateFlow()

    private val _rincian = MutableStateFlow<RincianAdminUiState?>(null)

    /** Isi sheet rincian baris terpilih; null saat sheet tertutup. */
    val rincian: StateFlow<RincianAdminUiState?> = _rincian.asStateFlow()

    /** Pekan ISO terakhir dari inbox (isoYear ke isoWeek) untuk saringan mingguan. */
    private var pekanIso: Pair<Int, Int> = 0 to 0

    init {
        muat()
    }

    /** Menarik meja; status kembali ke Memuat dulu supaya layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = MejaKerjaAdminUiState.Memuat
            _state.value = try {
                val res = inboxApi.inbox()
                if (res.isSuccessful) {
                    val isi = res.body() ?: mejaKosong()
                    pekanIso = isi.week.isoYear to isi.week.isoWeek
                    MejaKerjaAdminUiState.Siap(petaMejaAdmin(isi))
                } else {
                    MejaKerjaAdminUiState.Galat(pesanGalat(res))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                MejaKerjaAdminUiState.Galat(ApiError.dari(e).pesanTampil())
            }
        }
    }

    /** Coba lagi setelah galat. */
    fun ulang() = muat()

    /**
     * Membuka sheet rincian satu pelapor. Identitas/progres tampil begitu
     * datanya tiba; bukti proyek dimuat menyusul setelah identitas siap.
     */
    fun bukaRincian(baris: BarisPelapor) {
        val sudahDimuat = _terpilih.value == baris &&
            _rincian.value != null &&
            _rincian.value !is RincianAdminUiState.Galat
        if (sudahDimuat) return
        _terpilih.value = baris
        _rincian.value = RincianAdminUiState.Memuat
        viewModelScope.launch {
            try {
                when (baris.jenis) {
                    JenisLaporan.HARIAN -> muatRincianProyek(baris)
                    JenisLaporan.MINGGUAN -> muatRincianDivisi(baris)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (_terpilih.value == baris) {
                    _rincian.value = RincianAdminUiState.Galat(ApiError.dari(e).pesanTampil())
                }
            }
        }
    }

    /** Menutup sheet rincian. */
    fun tutupRincian() {
        _terpilih.value = null
        _rincian.value = null
    }

    /**
     * Rincian proyek: laporan harian terbaru lewat GET /api/daily-reports?
     * projectId&pageSize=1. Bila proyek belum melapor, data inbox cukup untuk
     * menampilkan identitas + "belum melapor" tanpa permintaan tambahan.
     */
    private suspend fun muatRincianProyek(baris: BarisPelapor) {
        val res = dailyReportsApi.daftar(projectId = baris.idProyek, ukuranHalaman = 1)
        if (!res.isSuccessful) {
            if (_terpilih.value == baris) {
                _rincian.value = RincianAdminUiState.Galat(pesanGalat(res))
            }
            return
        }
        val laporan = res.body()?.items?.firstOrNull()
        // Pengguna bisa menutup/mengganti baris selagi permintaan berjalan —
        // jangan menimpa rincian baris lain dengan hasil yang sudah basi.
        if (_terpilih.value != baris) return
        _rincian.value = RincianAdminUiState.Proyek(
            rincian = if (laporan != null) {
                RincianProyek(
                    judul = baris.judul,
                    sub = baris.sub,
                    statusLabel = labelStatusHarian(laporan.status),
                    status = mkStatusHarian(laporan.status),
                    progres = laporan.progressPct,
                    // E2E-2 BUG-10: tanggal WIB Indonesia ("Selasa, 13 Oktober 2026"),
                    // bukan ISO UTC mentah (tengah malam WIB = 17.00Z hari sebelumnya).
                    tanggal = tanggalPanjang(laporan.reportDate) ?: laporan.reportDate,
                    diserahkanIso = laporan.submittedAt,
                    diteruskanIso = laporan.forwardedAt,
                    capaian = laporan.achievementToday.takeIf { it.isNotBlank() },
                    kendala = laporan.obstacle?.takeIf { it.isNotBlank() },
                )
            } else {
                RincianProyek(
                    judul = baris.judul,
                    sub = baris.sub,
                    statusLabel = "Belum melapor",
                    status = MkStatus.NEUTRAL,
                    progres = 0,
                    tanggal = null,
                    diserahkanIso = null,
                    diteruskanIso = null,
                    capaian = null,
                    kendala = null,
                )
            },
            bukti = BuktiUiState.Memuat,
        )

        // Bukti dimuat setelah identitas tampil — grid menyusul di sheet terbuka.
        val idLaporan = laporan?.id ?: baris.idLaporan
        if (idLaporan == null) {
            perbaruiBukti(baris, BuktiUiState.Siap(emptyList(), emptyList()))
            return
        }
        val bukti = try {
            val daftar = evidenceApi.daftar(targetType = TARGET_LAPORAN_HARIAN, targetId = idLaporan)
            if (daftar.isSuccessful) {
                susunBukti(daftar.body()?.items.orEmpty())
            } else {
                BuktiUiState.Galat(pesanGalat(daftar))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            BuktiUiState.Galat(ApiError.dari(e).pesanTampil())
        }
        perbaruiBukti(baris, bukti)
    }

    /**
     * Rincian divisi: cari laporan mingguan pekan berjalan lewat GET
     * /api/weekly-reports (saring nama divisi + pekan ISO, cocokkan
     * divisionId), lalu ringkas butir-butirnya. Laporan belum diserahkan →
     * cukup status header dari inbox tanpa permintaan tambahan.
     */
    private suspend fun muatRincianDivisi(baris: BarisPelapor) {
        if (baris.idLaporan == null) {
            _rincian.value = RincianAdminUiState.Divisi(
                RincianDivisi(
                    judul = baris.judul,
                    sub = baris.sub,
                    statusLabel = "Belum masuk",
                    status = MkStatus.NEUTRAL,
                    diserahkanIso = null,
                    disetujuiIso = null,
                    diteruskanIso = null,
                    butir = emptyList(),
                ),
            )
            return
        }
        val res = weeklyReportsApi.daftar(
            search = baris.judul,
            isoYear = pekanIso.first.takeIf { it > 0 },
            isoWeek = pekanIso.second.takeIf { it > 0 },
            pageSize = 50,
        )
        if (!res.isSuccessful) {
            if (_terpilih.value == baris) {
                _rincian.value = RincianAdminUiState.Galat(pesanGalat(res))
            }
            return
        }
        val laporan = res.body()?.items
            ?.firstOrNull { it.id == baris.idLaporan || it.divisionId == baris.idDivisi }
        if (_terpilih.value != baris) return
        _rincian.value = RincianAdminUiState.Divisi(
            if (laporan != null) petaRincianDivisi(baris, laporan) else petaRincianDivisi(baris),
        )
    }

    /** Menempel status bukti terbaru ke rincian proyek yang masih terbuka. */
    private fun perbaruiBukti(baris: BarisPelapor, bukti: BuktiUiState) {
        if (_terpilih.value != baris) return
        val saatIni = _rincian.value as? RincianAdminUiState.Proyek ?: return
        _rincian.value = saatIni.copy(bukti = bukti)
    }

    /**
     * Memilah bukti: unggahan gambar (MIME image, url null) dan tautan
     * gambar masuk grid — unggahan meminta tautan bertanda 5 menit dari GET
     * /api/evidence/{id}; selain itu (pdf, docx, tautan non-gambar, galat
     * tautan) menjadi baris berkas.
     */
    private suspend fun susunBukti(items: List<EvidenceItemDto>): BuktiUiState {
        val gambar = mutableListOf<BuktiGambar>()
        val berkas = mutableListOf<BuktiBerkas>()
        for (b in items) {
            val urlLuar = b.url
            when {
                urlLuar != null && b.mime.startsWith("image/") ->
                    gambar += BuktiGambar(id = b.id, url = urlLuar, nama = b.fileName)
                urlLuar != null ->
                    berkas += BuktiBerkas(b.id, b.fileName, "Tautan", urlLuar)
                b.mime.startsWith("image/") -> {
                    val url = try {
                        val r = evidenceApi.buka(b.id)
                        if (r.isSuccessful) r.body()?.url else null
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        null
                    }
                    if (url != null) {
                        gambar += BuktiGambar(id = b.id, url = url, nama = b.fileName)
                    } else {
                        berkas += BuktiBerkas(b.id, b.fileName, formatUkuran(b.size), null)
                    }
                }
                else -> berkas += BuktiBerkas(b.id, b.fileName, formatUkuran(b.size), null)
            }
        }
        return BuktiUiState.Siap(gambar, berkas)
    }

    /** Respons tidak sukses → pesan siap tampil lewat ApiError terpusat. */
    private fun pesanGalat(res: Response<*>): String = ApiError.dari(HttpException(res)).pesanTampil()

    /** Pengecualian jaringan → pesan siap tampil. */
    private fun pesanDari(e: Exception): String = ApiError.dari(e).pesanTampil()
}

// ------------------------------------------------------------------
// Pemetaan DTO → model tampilan
// ------------------------------------------------------------------

/** InboxResponse → meja kerja dua seksi + kalimat jawaban. */
internal fun petaMejaAdmin(isi: InboxResponse): MejaAdminKerja {
    val harian = isi.daily.map(::petaBarisHarian)
    val mingguan = isi.weekly.map(::petaBarisMingguan)
    val masuk = harian.count { it.idLaporan != null } + mingguan.count { it.idLaporan != null }
    val total = harian.size + mingguan.size
    val jawaban = when {
        total == 0 -> "Belum ada proyek atau divisi yang melapor ke Anda."
        masuk == total -> "Semua pelapor sudah melapor."
        else -> "$masuk dari $total pelapor sudah melapor."
    }
    return MejaAdminKerja(
        konteks = susunKonteksMeja(isi.reportDate, isi.week),
        jawaban = jawaban,
        harian = harian,
        mingguan = mingguan,
    )
}

private fun petaBarisHarian(d: InboxHarianDto): BarisPelapor = BarisPelapor(
    jenis = JenisLaporan.HARIAN,
    idProyek = d.projectId,
    idDivisi = "",
    idLaporan = d.reportId,
    judul = d.name.ifBlank { d.code },
    sub = listOfNotNull(
        d.code.takeIf { it.isNotBlank() },
        d.picName?.let { labelPic(it) }, // BUG-14a: tanpa "PIC PIC …"
        jamWib(d.submittedAt)?.let { "dikirim $it WIB" },
        if (d.reportId != null) "${d.evidenceCount} bukti" else null,
    ).joinToString(" · "),
    status = when {
        d.forwardedAt != null -> StatusAntrean.DITERUSKAN
        d.reportId != null -> StatusAntrean.BARU
        else -> StatusAntrean.BELUM_MASUK
    },
)

private fun petaBarisMingguan(w: InboxMingguanDto): BarisPelapor = BarisPelapor(
    jenis = JenisLaporan.MINGGUAN,
    idProyek = "",
    idDivisi = w.divisionId,
    idLaporan = w.reportId,
    judul = w.name,
    sub = listOfNotNull(
        w.headName?.let { "Kadiv $it" },
        jamWib(w.submittedAt)?.let { "diserahkan $it WIB" },
        if (w.itemCount > 0) "${w.itemCount} item" else null,
    ).joinToString(" · "),
    status = when {
        w.forwardedAt != null -> StatusAntrean.DITERUSKAN
        w.reportId != null && !w.readyToForward -> StatusAntrean.MENUNGGU
        w.reportId != null -> StatusAntrean.BARU
        else -> StatusAntrean.BELUM_MASUK
    },
    statusHeader = w.statusHeader,
)

/** Rincian divisi dari baris arsip mingguan utuh (butir ikut diringkas). */
private fun petaRincianDivisi(baris: BarisPelapor, laporan: WeeklyReportRowDto): RincianDivisi {
    val lencana = lencanaStatusHeader(laporan)
    return RincianDivisi(
        judul = baris.judul,
        sub = baris.sub,
        statusLabel = lencana.second,
        status = lencana.first,
        diserahkanIso = laporan.submittedAt,
        disetujuiIso = laporan.approvedAt,
        diteruskanIso = laporan.forwardedAt,
        butir = laporan.items.map { butir ->
            val lencanaButir = lencanaButir(butir.status)
            ButirRingkas(
                id = butir.id,
                uraian = butir.workItem,
                statusLabel = lencanaButir.second,
                status = lencanaButir.first,
                progres = butir.progressPct,
                capaian = butir.achievementThisWeek.takeIf { it.isNotBlank() },
            )
        },
    )
}

/** Rincian divisi tanpa arsip (laporan tidak ditemukan) — info header dari inbox. */
private fun petaRincianDivisi(baris: BarisPelapor): RincianDivisi = RincianDivisi(
    judul = baris.judul,
    sub = baris.sub,
    statusLabel = baris.statusHeader?.let { lencanaStatusHeaderTeks(it).second } ?: "Tidak ditemukan",
    status = baris.statusHeader?.let { lencanaStatusHeaderTeks(it).first } ?: MkStatus.NEUTRAL,
    diserahkanIso = null,
    disetujuiIso = null,
    diteruskanIso = null,
    butir = emptyList(),
)

/** "Kamis, 8 Oktober 2026 · M41 2026"; pekan dilewati bila kosong. */
private fun susunKonteksMeja(reportDate: String, week: InboxWeekDto): String {
    val tanggal = tanggalPanjang(reportDate) ?: reportDate
    val pekan = if (week.isoWeek > 0) " · M${week.isoWeek} ${week.isoYear}" else ""
    return "$tanggal$pekan"
}

/** Status → warna lencana (label dari labelStatusHarian ui/laporan). */
private fun mkStatusHarian(status: String?): MkStatus = when (status) {
    "SELESAI" -> MkStatus.DONE
    "ON_PROGRESS" -> MkStatus.ON
    "TERKENDALA" -> MkStatus.RISK
    "MENUNGGU_KEPUTUSAN" -> MkStatus.INFO
    else -> MkStatus.NEUTRAL
}

/** Lencana status header laporan mingguan (termasuk tanda diteruskan). */
private fun lencanaStatusHeader(laporan: WeeklyReportRowDto): Pair<MkStatus, String> {
    val (status, label) = lencanaStatusHeaderTeks(laporan.statusHeader)
    return when {
        laporan.forwardedAt != null -> MkStatus.DONE to (label + " · diteruskan")
        else -> status to label
    }
}

private fun lencanaStatusHeaderTeks(statusHeader: String?): Pair<MkStatus, String> = when (statusHeader) {
    "DISETUJUI" -> MkStatus.ON to "Disetujui"
    "MENUNGGU_PERSETUJUAN" -> MkStatus.INFO to "Menunggu persetujuan"
    "TERKUNCI" -> MkStatus.LATE to "Terkunci"
    "DRAFT" -> MkStatus.NEUTRAL to "Draf"
    else -> MkStatus.NEUTRAL to "Tidak diketahui"
}

/** Lencana status satu butir capaian mingguan. */
private fun lencanaButir(status: String): Pair<MkStatus, String> = when (status) {
    "SELESAI" -> MkStatus.DONE to "Selesai"
    "ON_PROGRESS" -> MkStatus.ON to "Dikerjakan"
    "TERKENDALA" -> MkStatus.RISK to "Terkendala"
    "BELUM_MULAI" -> MkStatus.NEUTRAL to "Belum mulai"
    else -> MkStatus.NEUTRAL to "N/A"
}

/** Ukuran berkas ramah baca: "1,2 MB" / "340 KB" / "800 B" (desimal Indonesia). */
internal fun formatUkuran(byte: Int): String {
    val locale = Locale.forLanguageTag("id-ID")
    return when {
        byte >= 1_048_576 -> String.format(locale, "%.1f MB", byte / 1_048_576.0)
        byte >= 1_024 -> String.format(locale, "%.0f KB", byte / 1_024.0)
        else -> "$byte B"
    }
}
