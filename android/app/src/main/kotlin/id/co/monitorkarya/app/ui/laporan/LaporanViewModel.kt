// Layar Laporan harian PIC (T5-B5 Fase 1). Padanan web:
// src/components/views/daily-input-view.tsx + rute src/app/api/daily-input/route.ts.
//
// Satu GET /api/daily-input (tanpa projectId — rute mengembalikan seluruh meja
// kerja: semua proyek tanggung jawab akun + laporan harian masing-masing).
// PUT menyimpan draf/mengirim; 409 = beku/terkunci (ApiError.Konflik + tombol
// "Ajukan buka kunci"), 422 = validasi (pesan field dari validateDailyReport
// src/lib/lock.ts: status & capaian wajib; kendala wajib untuk Terkendala/
// Menunggu keputusan; tindak lanjut wajib untuk Terkendala; bukti minimal 1
// kecuali Tanpa perubahan).
//
// Kontrak T5-B1: `DailyInputApi` versi core/network belum ada saat tugas ini
// jalan, jadi antarmuka Retrofit yang sama dideklarasikan lokal di paket ini
// (dibangun dari Retrofit tunggal AppModule). Saat T5-B1 hadir, hapus
// deklarasi + LaporanModule di bawah lalu ganti impor — bentuknya dipetakan
// 1:1 dari rute (lihat docs/fase1/T5-B5-LAPORAN.md).
package id.co.monitorkarya.app.ui.laporan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.core.network.ApiError
import javax.inject.Inject
import javax.inject.Singleton
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Query

// ------------------------------------------------------------------
// Kontrak jaringan (T5-B1, port lokal sementara)
// ------------------------------------------------------------------

/**
 * Rute /api/daily-input. GET tanpa parameter = hari ini; PUT menyimpan draf
 * (`action="save"`) atau mengirim (`action="submit"`). DELETE ada di rute tetapi
 * belum dipakai layar Fase 1 (dipakai task T5 lanjutan bersama pelampiran bukti).
 */
interface LaporanDeskApi {

    @GET("api/daily-input")
    suspend fun desk(@Query("date") tanggal: String? = null): Response<JsonObject>

    @PUT("api/daily-input")
    suspend fun simpan(@Body isi: SimpanLaporanRequest): Response<SimpanLaporanResponse>
}

/** Isi PUT /api/daily-input — nama field persis seperti rute. */
@Serializable
data class SimpanLaporanRequest(
    val projectId: String,
    /** "save" = simpan draf, "submit" = kirim ke Admin PT. */
    val action: String,
    val status: String? = null,
    val progressPct: Int = 0,
    val achievementToday: String = "",
    val obstacle: String? = null,
    val followUp: String? = null,
    /** "YYYY-MM-DD" hanya bila membuka tanggal lampau (Fase 1: hari ini saja). */
    val reportDate: String? = null,
)

/**
 * Jawaban PUT. `ok/reportId/submitted/derivedFromTasks` ada hari ini; `undoToken`
 * dan `isLate` diurai defensif untuk hari saat rute menambahkannya (padanan
 * escalations/actions yang mengirim undoToken).
 */
@Serializable
data class SimpanLaporanResponse(
    val ok: Boolean = false,
    val reportId: String? = null,
    val submitted: Boolean = false,
    val derivedFromTasks: Boolean = false,
    val undoToken: String? = null,
    val isLate: Boolean = false,
)

// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Meja kerja laporan satu hari hasil GET /api/daily-input. */
data class DeskLaporan(
    /** Kunci "YYYY-MM-DD" WIB tanggal yang dibuka. */
    val tanggalKunci: String,
    /** reportDate ISO — dipakai format tanggal panjang. */
    val tanggalIso: String,
    val hariIni: Boolean,
    /** lockAt ISO (tenggat 17.00 WIB tanggal itu). */
    val kunciIso: String?,
    /** Tanggal sudah lewat tenggat (locked). */
    val lewatTenggat: Boolean,
    /** Teks hitung mundur "x jam y menit lagi"; null bila sudah lewat. */
    val hitungMundur: String?,
    /** canRequestUnlock — PIC boleh mengajukan buka kunci sendiri. */
    val bolehAjukanBuka: Boolean,
    val proyek: List<ProyekLaporan>,
)

/** Satu baris "Proyek Anda hari ini". */
data class ProyekLaporan(
    val id: String,
    val kode: String,
    val nama: String,
    val fase: String,
    val jumlahTugas: Int,
    /** derived: hari punya task → status & progres dihitung server. */
    val diringkas: Boolean,
    /** editable: boleh ditulis (tidak beku/terkunci lewat jam, atau sedang dibuka). */
    val bisaEdit: Boolean,
    /** FORWARDED | LOCKED | TIME | null — kenapa tidak bisa diedit. */
    val alasanKunci: String?,
    val bukaKunci: BukaKunciInfo?,
    val laporan: LaporanTersimpan?,
)

/** Buka kunci yang masih diproses (DIAJUKAN/DISETUJUI) atau sedang berlaku (DIEKSEKUSI). */
data class BukaKunciInfo(val status: String, val sampaiIso: String?)

/** Laporan tersimpan satu proyek (subset field yang dipakai layar). */
data class LaporanTersimpan(
    val id: String,
    val status: String,
    val progres: Int,
    val capaian: String,
    val kendala: String?,
    val tindakLanjut: String?,
    val jumlahBukti: Int,
    val terkirimIso: String?,
    val diteruskanIso: String?,
    val terkunci: Boolean,
)

/** Isian formulir yang dikirim layar ke ViewModel. */
data class IsianLaporan(
    val status: String,
    val progres: Int,
    val capaian: String,
    val kendala: String,
    val tindakLanjut: String,
)

/** Aksi PUT: simpan draf atau kirim ke Admin PT. */
enum class AksiLaporan(val nilai: String) { SIMPAN("save"), KIRIM("submit") }

/** Galat dalam sheet setelah PUT gagal. */
sealed interface GalatForm {
    /** 409 — laporan beku/terkunci; `reportId` untuk tombol "Ajukan buka kunci". */
    data class Beku(val pesan: String, val reportId: String?) : GalatForm

    /** 422 — pesan validasi field dari server. */
    data class Validasi(val pesan: String, val medan: List<String>) : GalatForm

    data class Umum(val pesan: String) : GalatForm
}

/** Notifikasi satu-kali (snackbar): pesan + undoToken bila server mengirim. */
data class NotifikasiLaporan(val id: Long, val pesan: String, val undoToken: String? = null)

/** Status UI layar: Memuat → Siap(meja) atau Galat(pesan). */
sealed interface LaporanUiState {
    data object Memuat : LaporanUiState
    data class Siap(val desk: DeskLaporan) : LaporanUiState
    data class Galat(val pesan: String) : LaporanUiState
}

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class LaporanViewModel @Inject constructor(
    private val api: LaporanDeskApi,
) : ViewModel() {

    private val _state = MutableStateFlow<LaporanUiState>(LaporanUiState.Memuat)

    /** Status layar daftar "Proyek Anda hari ini". */
    val state: StateFlow<LaporanUiState> = _state.asStateFlow()

    private val _terpilih = MutableStateFlow<String?>(null)

    /** Id proyek yang sheet-nya terbuka; null = daftar. */
    val terpilih: StateFlow<String?> = _terpilih.asStateFlow()

    private val _galatForm = MutableStateFlow<GalatForm?>(null)

    /** Galat PUT terakhir, ditampilkan di dalam sheet. */
    val galatForm: StateFlow<GalatForm?> = _galatForm.asStateFlow()

    private val _mengirim = MutableStateFlow(false)

    /** Sedang menyimpan/mengirim — tombol footer dinonaktifkan. */
    val mengirim: StateFlow<Boolean> = _mengirim.asStateFlow()

    private val _notifikasi = MutableStateFlow<NotifikasiLaporan?>(null)

    /** Snackbar satu-kali ("Laporan terkirim" / "Draf disimpan"). */
    val notifikasi: StateFlow<NotifikasiLaporan?> = _notifikasi.asStateFlow()

    private val _versiForm = MutableStateFlow(0)

    /**
     * Naik setelah simpan berhasil + meja termuat ulang — sheet mengikat ulang
     * isian dari laporan tersimpan sehingga penanda "kotor" ikut reset.
     */
    val versiForm: StateFlow<Int> = _versiForm.asStateFlow()

    private val _terlambat = MutableStateFlow(false)

    /** Kiriman barusan melewati tenggat (lewat buka kunci) — banner kecil di sheet. */
    val terlambat: StateFlow<Boolean> = _terlambat.asStateFlow()

    private val _undoToken = MutableStateFlow<String?>(null)

    /** undoToken terakhir bila server mengirim (menunggu UndoApi T5-B1). */
    val undoToken: StateFlow<String?> = _undoToken.asStateFlow()

    init {
        muat()
    }

    /** Menarik meja kerja hari ini; status kembali ke Memuat agar layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = LaporanUiState.Memuat
            muatInternal()
        }
    }

    fun ulang() = muat()

    /** Membuka/menutup sheet satu proyek; id null menutup. */
    fun pilih(projectId: String?) {
        _terpilih.value = projectId
        _galatForm.value = null
        _terlambat.value = false
    }

    /** Snackbar sudah tampil — bersihkan agar tidak berulang. */
    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    /**
     * "Urungkan" dari snackbar — hanya muncul bila server mengirim undoToken
     * (rute daily-input belum mengirimnya hari ini). Panggilan UndoApi T5-B1
     * disambung di sini saat kontraknya hadir.
     */
    fun urungkan() {
        _undoToken.value = null
        _notifikasi.value = null
    }

    /**
     * PUT /api/daily-input untuk proyek yang sheet-nya terbuka.
     * Sukses: snackbar + muat ulang; kirim tertutup sheet (tetap terbuka bila
     * tercatat terlambat agar banner terbaca), draf membiarkan sheet terbuka.
     */
    fun simpan(aksi: AksiLaporan, isian: IsianLaporan) {
        val proyekId = _terpilih.value ?: return
        val lewatSaatKirim = (state.value as? LaporanUiState.Siap)?.desk?.lewatTenggat ?: false
        viewModelScope.launch {
            _mengirim.value = true
            _galatForm.value = null
            try {
                val res = api.simpan(
                    SimpanLaporanRequest(
                        projectId = proyekId,
                        action = aksi.nilai,
                        status = isian.status.ifBlank { null },
                        progressPct = isian.progres.coerceIn(0, 100),
                        achievementToday = isian.capaian,
                        obstacle = isian.kendala.trim().ifEmpty { null },
                        followUp = isian.tindakLanjut.trim().ifEmpty { null },
                    ),
                )
                if (res.isSuccessful) {
                    val isi = res.body()
                    val token = isi?.undoToken
                    _undoToken.value = token
                    _notifikasi.value = NotifikasiLaporan(
                        id = System.nanoTime(),
                        pesan = if (aksi == AksiLaporan.KIRIM) "Laporan terkirim" else "Draf disimpan",
                        undoToken = token,
                    )
                    muatInternal()
                    _versiForm.value += 1
                    if (aksi == AksiLaporan.KIRIM) {
                        if (isi?.isLate == true || lewatSaatKirim) {
                            _terlambat.value = true
                        } else {
                            pilih(null)
                        }
                    }
                } else {
                    _galatForm.value = petakanGalat(res)
                    // 409: laporan baru saja dibekukan/dikunci — muat ulang agar
                    // formulir ikut terkunci (padanan onSaved() web saat res.status === 409).
                    if (_galatForm.value is GalatForm.Beku) muat()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _galatForm.value = GalatForm.Umum(ApiError.dari(e).pesanTampil())
            } finally {
                _mengirim.value = false
            }
        }
    }

    /** Menarik meja tanpa mengubah status ke Memuat (dipakai usai simpan). */
    private suspend fun muatInternal() {
        _state.value = try {
            val res = api.desk()
            if (res.isSuccessful) {
                LaporanUiState.Siap(parseDesk(res.body() ?: JsonObject(emptyMap())))
            } else {
                LaporanUiState.Galat(ApiError.dari(retrofit2.HttpException(res)).pesanTampil())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            LaporanUiState.Galat(ApiError.dari(e).pesanTampil())
        }
    }

    /**
     * Response tidak sukses → GalatForm. 409 dibaca sendiri karena dipetakan
     * ApiError.Konflik dengan pesan + reportId dari isi (`{error, locked,
     * frozen, reportId}`); sisanya lewat ApiError.dari terpusat (422 → Validasi
     * dengan daftar errors).
     */
    private fun petakanGalat(res: Response<SimpanLaporanResponse>): GalatForm {
        if (res.code() == 409) {
            val obj = bacaIsiGalat(res)
            val pesan = obj.teks("error") ?: "Laporan ini terkunci. Ajukan buka kunci untuk mengubahnya."
            return GalatForm.Beku(pesan = pesan, reportId = obj.teks("reportId"))
        }
        return when (val galat = ApiError.dari(retrofit2.HttpException(res))) {
            is ApiError.Validasi -> GalatForm.Validasi(galat.pesan, galat.errors)
            else -> GalatForm.Umum(galat.pesanTampil())
        }
    }

    /** Body galat sebagai JsonObject — sekali baca, toleran bila bukan JSON. */
    private fun bacaIsiGalat(res: Response<SimpanLaporanResponse>): JsonObject =
        runCatching { res.errorBody()?.string() }
            .getOrNull()
            ?.let { runCatching { kotlinx.serialization.json.Json.parseToJsonElement(it) as? JsonObject }.getOrNull() }
            ?: JsonObject(emptyMap())
}

// ------------------------------------------------------------------
// Parsing GET (defensif — semua field opsional, bentuk lama tetap diterima)
// ------------------------------------------------------------------

internal fun parseDesk(root: JsonObject): DeskLaporan {
    val hitung = root["countdown"].objek()
    val jam = hitung?.angka("hours")
    val menit = hitung?.angka("minutes")
    val sudahLewat = hitung?.flag("passed") ?: false
    val hitungMundur = if (sudahLewat || jam == null) null else "${jam} jam ${menit ?: 0} menit lagi"
    return DeskLaporan(
        tanggalKunci = root.teks("reportDateKey") ?: root.teks("todayKey") ?: "",
        tanggalIso = root.teks("reportDate") ?: "",
        hariIni = root.flag("today") ?: true,
        kunciIso = root.teks("lockAt"),
        lewatTenggat = root.flag("locked") ?: false,
        hitungMundur = hitungMundur,
        bolehAjukanBuka = root.flag("canRequestUnlock") ?: false,
        proyek = (root["projects"] as? JsonArray)?.mapNotNull { baris ->
            (baris as? JsonObject)?.let(::parseProyek)
        }.orEmpty(),
    )
}

private fun parseProyek(p: JsonObject): ProyekLaporan {
    val laporan = p["report"].objek()?.let(::parseLaporan)
    val jumlahTugas = p.angka("taskCount") ?: 0
    return ProyekLaporan(
        id = p.teks("id").orEmpty(),
        kode = p.teks("code").orEmpty(),
        nama = p.teks("name").orEmpty(),
        fase = p.teks("phase").orEmpty(),
        jumlahTugas = jumlahTugas,
        diringkas = (p.flag("derived") ?: (jumlahTugas > 0)) && laporan != null,
        bisaEdit = p.flag("editable") ?: true,
        alasanKunci = p.teks("lockReason"),
        bukaKunci = p["unlock"].objek()?.let {
            BukaKunciInfo(status = it.teks("status").orEmpty(), sampaiIso = it.teks("unlockUntil"))
        },
        laporan = laporan,
    )
}

private fun parseLaporan(r: JsonObject): LaporanTersimpan = LaporanTersimpan(
    id = r.teks("id").orEmpty(),
    status = r.teks("status").orEmpty(),
    progres = r.angka("progressPct") ?: 0,
    capaian = r.teks("achievementToday").orEmpty(),
    kendala = r.teks("obstacle"),
    tindakLanjut = r.teks("followUp"),
    jumlahBukti = r.angka("evidenceCount") ?: 0,
    terkirimIso = r.teks("submittedAt"),
    diteruskanIso = r.teks("forwardedAt"),
    terkunci = r.flag("isLocked") ?: false,
)

private fun JsonElement?.objek(): JsonObject? = this as? JsonObject

private fun JsonObject.teks(kunci: String): String? =
    (this[kunci] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotEmpty() && it != "null" }

private fun JsonObject.angka(kunci: String): Int? = (this[kunci] as? JsonPrimitive)?.intOrNull

private fun JsonObject.flag(kunci: String): Boolean? = (this[kunci] as? JsonPrimitive)?.booleanOrNull

// ------------------------------------------------------------------
// Kosakata status & waktu (dipakai layar)
// ------------------------------------------------------------------

/** Label Indonesia status laporan harian; null (Belum) bila belum ada laporan. */
internal fun labelStatusHarian(status: String?): String = when (status) {
    "SELESAI" -> "Selesai"
    "ON_PROGRESS" -> "Dikerjakan"
    "TERKENDALA" -> "Terkendala"
    "MENUNGGU_KEPUTUSAN" -> "Menunggu keputusan"
    "TIDAK_ADA_PERUBAHAN" -> "Tanpa perubahan"
    else -> "Belum"
}

/** Zona waktu tampilan — laporan hidup di WIB. */
private val WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val formatJam = DateTimeFormatter.ofPattern("HH.mm").withZone(WIB)

private val formatTanggal = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale.forLanguageTag("id-ID")).withZone(WIB)

/** ISO → Instant; null bila rusak. */
internal fun cobaIso(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** "HH.mm" WIB dari ISO; null bila ISO rusak. */
internal fun jamWib(iso: String?): String? = cobaIso(iso)?.let { formatJam.format(it) }

/** "Kamis, 8 Oktober 2026" dari ISO; null bila rusak. */
internal fun tanggalPanjang(iso: String?): String? = cobaIso(iso)?.let { formatTanggal.format(it) }

/** Kirim terjadi setelah tenggat (tercatat terlambat)? */
internal fun kirimSetelahTenggat(terkirimIso: String?, kunciIso: String?): Boolean {
    val kirim = cobaIso(terkirimIso) ?: return false
    val kunci = cobaIso(kunciIso) ?: return false
    return kirim.isAfter(kunci)
}
