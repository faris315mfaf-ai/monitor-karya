// Meja kerja PIC (T5-B4 Fase 1). Padanan web:
// src/components/views/work-desk-view.tsx + src/components/work-desk/pic-desk.tsx,
// data dari GET /api/work-desk (cabang PIC, route src/app/api/work-desk/route.ts).
//
// WorkDeskApi (T5-B1, core/network) hanya memuat ringkasan per proyek — judul dan
// jam tugas harian diambil dari GET /api/tasks?projectId= per proyek (TasksApi,
// juga T5-B1) secara paralel; kegagalan satu proyek tidak menjatuhkan meja
// (daftar tugas proyek itu kosong, angka ringkasan tetap dari work-desk yang
// otoritatif). Dekode respons untuk KADIV/ADMIN memang gagal — Fase 2 (lihat
// DtosFase1.kt); layar ini hanya dipasang untuk PIC di MKShell.
//
// Kontrak T5-B8: MejaKerjaScreen(vm, onBukaLaporan, onBukaTugas) di paket ini.
// Penyedia DI mengikuti pola modul lokal layar tetangga (LaporanModule) karena
// WorkDeskApi/TasksApi belum dibinding pusat di AppModule — saat dipindah ke
// AppModule, hapus MejaKerjaModule di bawah tanpa mengubah pemakaian.
package id.co.monitorkarya.app.ui.mejakerja

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.api.WorkDeskApi
import id.co.monitorkarya.core.network.dto.CountdownDto
import id.co.monitorkarya.core.network.dto.TaskDto
import id.co.monitorkarya.core.network.dto.WorkDeskPicResponse
import java.time.Instant
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import retrofit2.Retrofit

// ------------------------------------------------------------------
// Penyedia DI (pola LaporanModule — hapus saat AppModule membinding pusat)
// ------------------------------------------------------------------

/** Module penyedia WorkDeskApi + TasksApi dari Retrofit tunggal AppModule. */

// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Satu baris tugas hari ini: judul, sub "proyek · jam", dan status mentah. */
data class TugasMeja(
    val id: String,
    val judul: String,
    /** "SIM RS Bhakti Rahayu · 08.00–10.00 WIB" — null bila keduanya kosong. */
    val sub: String?,
    /** Status mentah task: BELUM_MULAI | BERJALAN | SELESAI | TERKENDALA | MENUNGGU_KEPUTUSAN. */
    val status: String,
)

/** Meja kerja PIC hasil susunan WorkDeskApi + TasksApi. */
data class MejaKerjaData(
    /** true bila PIC tidak memegang proyek aktif apa pun. */
    val proyekKosong: Boolean,
    val tugasTotal: Int,
    val tugasSelesai: Int,
    val tugasTerkendala: Int,
    val laporanTotal: Int,
    /** Laporan hari ini yang belum dikirim (submittedAt null). */
    val laporanBelumTerkirim: Int,
    /** Hari sudah lewat tenggat 17.00 WIB. */
    val terkunci: Boolean,
    /** "17.00 WIB" — label tenggat harian dari server. */
    val cutoffLabel: String,
    /** "2 jam 15 menit" — sisa waktu menuju tenggat; null bila sudah lewat. */
    val sisaTeks: String?,
    /** "Rani mengingatkan pukul 09.12" — pengingat terakhir yang belum dijawab laporan. */
    val pengingatTeks: String?,
    /** Daftar tugas hari ini seluruh proyek, urut jam mulai. */
    val tugas: List<TugasMeja>,
)

/** Status UI layar: Memuat → Sukses(data) atau Galat(pesan). */
sealed interface MejaKerjaUiState {
    data object Memuat : MejaKerjaUiState
    data class Sukses(val data: MejaKerjaData) : MejaKerjaUiState
    data class Galat(val pesan: String) : MejaKerjaUiState
}

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class MejaKerjaViewModel @Inject constructor(
    private val workDeskApi: WorkDeskApi,
    private val tasksApi: TasksApi,
) : ViewModel() {

    private val _state = MutableStateFlow<MejaKerjaUiState>(MejaKerjaUiState.Memuat)

    /** Status layar meja kerja. */
    val state: StateFlow<MejaKerjaUiState> = _state.asStateFlow()

    init {
        muat()
    }

    /** Menarik meja kerja; status kembali ke Memuat agar layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = MejaKerjaUiState.Memuat
            _state.value = try {
                val res = workDeskApi.meja()
                if (!res.isSuccessful) throw HttpException(res)
                val desk = res.body() ?: throw IllegalStateException("Respons meja kerja kosong")
                MejaKerjaUiState.Sukses(susunMeja(desk, ambilTugas(desk)))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                MejaKerjaUiState.Galat(ApiError.dari(e).pesanTampil())
            }
        }
    }

    fun ulang() = muat()

    /**
     * Tugas hari ini seluruh proyek PIC, ditarik paralel tanpa parameter tanggal
     * (server menganggap hari ini). Kegagalan satu proyek ditelan — daftarnya
     * kosong dan angka ringkasan tetap memakai hitungan work-desk.
     */
    private suspend fun ambilTugas(desk: WorkDeskPicResponse): List<TaskDto> = coroutineScope {
        desk.projects
            .map { proyek ->
                async {
                    runCatching {
                        val res = tasksApi.perHari(proyek.id)
                        if (res.isSuccessful) res.body()?.tasks.orEmpty() else emptyList()
                    }.getOrDefault(emptyList())
                }
            }
            .awaitAll()
            .flatten()
    }
}

// ------------------------------------------------------------------
// Susunan data (murni — mudah diuji)
// ------------------------------------------------------------------

/** Gabungkan work-desk (ringkasan otoritatif) + daftar tugas per proyek. */
internal fun susunMeja(desk: WorkDeskPicResponse, tugasHariIni: List<TaskDto>): MejaKerjaData {
    val namaProyek = desk.projects.associate { it.id to it.name }
    val pengingat = desk.projects.firstOrNull { it.remindedAt != null && it.report?.submittedAt == null }
    return MejaKerjaData(
        proyekKosong = desk.projects.isEmpty(),
        tugasTotal = desk.projects.sumOf { it.tasks.total },
        tugasSelesai = desk.projects.sumOf { it.tasks.done },
        tugasTerkendala = desk.projects.sumOf { it.tasks.blocked },
        laporanTotal = desk.projects.size,
        laporanBelumTerkirim = desk.projects.count { it.report?.submittedAt == null },
        terkunci = desk.locked,
        cutoffLabel = desk.cutoffLabel,
        sisaTeks = sisaTeks(desk.countdown),
        pengingatTeks = pengingat?.let {
            "${it.remindedBy ?: "Admin PT"} mengingatkan pukul ${jamWib(it.remindedAt) ?: "-"}"
        },
        tugas = tugasHariIni
            .filter { it.scope == "HARIAN" }
            .sortedWith(compareBy({ it.startAt ?: "\uffff" }, { it.title }))
            .map { t ->
                TugasMeja(
                    id = t.id,
                    judul = t.title,
                    sub = subTugas(namaProyek[t.projectId].orEmpty(), t.startAt, t.endAt),
                    status = t.status,
                )
            },
    )
}

/** "2 jam 15 menit" dari countdown; null bila tenggat sudah lewat. */
internal fun sisaTeks(countdown: CountdownDto): String? {
    if (countdown.passed) return null
    val jam = if (countdown.hours > 0) "${countdown.hours} jam" else null
    val menit = if (countdown.minutes > 0 || jam == null) "${countdown.minutes} menit" else null
    return listOfNotNull(jam, menit).joinToString(separator = " ")
}

/** Subjudul baris tugas: "Nama proyek · 08.00–10.00 WIB" (bagian jam opsional). */
internal fun subTugas(namaProyek: String, mulaiIso: String?, selesaiIso: String?): String? {
    val jam = when {
        mulaiIso != null && selesaiIso != null ->
            "${jamWib(mulaiIso) ?: "-"}–${jamWib(selesaiIso) ?: "-"} WIB"
        mulaiIso != null -> "mulai ${jamWib(mulaiIso) ?: "-"} WIB"
        selesaiIso != null -> "sampai ${jamWib(selesaiIso) ?: "-"} WIB"
        else -> null
    }
    return listOfNotNull(namaProyek.takeIf { it.isNotBlank() }, jam)
        .joinToString(separator = " · ")
        .ifEmpty { null }
}

// ------------------------------------------------------------------
// Waktu WIB
// ------------------------------------------------------------------

private val formatJam = DateTimeFormatter.ofPattern("HH.mm").withZone(Wib.ZONA)

/** ISO → "HH.mm" WIB; null bila ISO rusak. */
internal fun jamWib(iso: String?): String? =
    iso?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { formatJam.format(it) }
