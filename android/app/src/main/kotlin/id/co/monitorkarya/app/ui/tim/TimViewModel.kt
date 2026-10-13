// Layar Tim kepala divisi (T6-C6 Fase 2). Padanan web:
// src/components/kadiv/team-cards.tsx (TeamDailyCard) + rute
// src/app/api/kadiv/team/route.ts (GET) — DTO T6-C1 core/network.
//
// Satu GET /api/kadiv/team?divisionId= menghasilkan seluruh meja tim: divisi,
// tenggat 17.00 WIB (cutoffLabel/locked), dan anggota dengan status laporan
// harian hari ini (report.state TERKIRIM/BELUM/ABSEN/TIDAK_WAJIB, submittedAt,
// remindedAt), proyek yang dipikul, capaian/kendala hari ini, dan beban kerja.
// Baris anggota = MkListRow nama·peran + StatusBadge lapor hari ini; detail
// ringkas per orang dibuka di Sheet (tidak pindah halaman, docs/design/05).
// E2E-1 #1 (paritas member-sheet.tsx): Sheet anggota kini membawa aksi
// "Ingatkan <nama>" (POST remind), "Tandai sudah dibaca" + Urungkan (POST
// read/unread), dan kehadiran hari ini + Urungkan (POST/DELETE /api/attendance).
// Ringkasan mingguan ke Direktur dibuka dari kartu tim (RingkasanDirekturSheet).
// Aksi ini tidak diantre luring: pengingat memicu notifikasi orang lain dan
// kehadiran mengubah penyebut laporan hari itu — gagal jaringan = pesan galat.
package id.co.monitorkarya.app.ui.tim

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.AttendanceApi
import id.co.monitorkarya.core.network.api.KadivApi
import id.co.monitorkarya.core.network.dto.KadivAnggotaDto
import id.co.monitorkarya.core.network.dto.KadivTeamAksiRequest
import id.co.monitorkarya.core.network.dto.KadivTeamResponse
import id.co.monitorkarya.core.network.dto.KehadiranSimpanRequest
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Response

// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Status laporan harian satu anggota hari ini (DailyState types.ts). */
enum class LaporanAnggota { TERKIRIM, BELUM, ABSEN, TIDAK_WAJIB }

/** Label kehadiran (ATTENDANCE_LABELS types.ts). */
internal fun labelKehadiran(status: String?): String = when (status) {
    "HADIR" -> "Hadir"
    "TERLAMBAT" -> "Terlambat"
    "CUTI" -> "Cuti"
    "SAKIT" -> "Sakit"
    "IZIN" -> "Izin"
    else -> "Tanpa catatan kehadiran"
}

/** Label peran singkat (ROLE_LABELS src/lib/constants.ts). */
internal fun labelPeran(peran: String?): String? = when (peran) {
    "ADMIN_PT" -> "Admin PT"
    "KEPALA_DIVISI" -> "Kepala divisi"
    "PIC_PROYEK" -> "Manager / PIC proyek"
    "DIREKTUR_ENTITAS" -> "Direktur entitas"
    "DIREKTUR_SDM_GA" -> "Direksi holding (SDM & GA)"
    "MANAJEMEN" -> "Manajemen"
    "TI" -> "Tim TI"
    "SUPERADMIN" -> "Super Admin"
    "AUDITOR" -> "Auditor"
    null, "" -> null
    else -> peran
}

/** Satu anggota divisi hasil pemetaan KadivAnggotaDto (subset yang dipakai layar). */
data class AnggotaUi(
    val id: String,
    val nama: String,
    /** title — jabatan; bisa kosong. */
    val jabatan: String?,
    /** role — label peran dipakai bila jabatan kosong. */
    val peran: String?,
    val inisial: String,
    /** attendance — HADIR/TERLAMBAT/CUTI/SAKIT/IZIN. */
    val kehadiran: String?,
    val proyek: List<String>,
    val laporan: LaporanAnggota,
    /** report.required — proyek yang wajib lapor hari ini. */
    val wajibLapor: Int,
    /** report.sent — yang sudah terkirim. */
    val sudahMasuk: Int,
    /** report.submittedAt (ISO) — kiriman terakhir hari ini. */
    val dikirimIso: String?,
    /** report.remindedAt (ISO) — sudah diingatkan hari ini. */
    val diingatkanIso: String?,
    /** report.readAt (ISO) — laporan hari ini sudah ditandai dibaca kepala divisi. */
    val dibacaIso: String? = null,
    /** load.pct — beban kerja minggu ini; null = tanpa kapasitas. */
    val bebanPersen: Int?,
    /** load.openTasks. */
    val tugasTerbuka: Int,
    /** today.achievements — capaian hari ini dari laporan yang masuk. */
    val capaian: List<String>,
    /** today.obstacles. */
    val kendala: List<String>,
    /** today.plans — rencana besok. */
    val rencana: List<String> = emptyList(),
    /** today.tasks — task hari ini (judul · proyek · progres · status). */
    val tugas: List<TugasAnggotaUi> = emptyList(),
    /** load.openMinutes — sisa menit task terbuka minggu ini. */
    val sisaMenit: Int = 0,
)

/** Satu task anggota hari ini (KadivAnggotaTugasDto). */
data class TugasAnggotaUi(
    val id: String,
    val judul: String,
    val status: String,
    val progres: Int,
    val proyek: String,
)

/** Meja tim hasil pemetaan KadivTeamResponse (subset yang dipakai layar). */
data class TimUi(
    val divisiId: String?,
    val divisiNama: String?,
    /** cutoffLabel — label tenggat, mis. "17.00". */
    val tenggatLabel: String?,
    /** locked — laporan hari ini sudah dikunci tenggat. */
    val terkunci: Boolean,
    /** summary.reported — anggota wajib lapor yang sudah masuk. */
    val sudahMasuk: Int,
    /** summary.reporters — anggota wajib lapor (cuti tidak dihitung). */
    val wajibLapor: Int,
    val anggota: List<AnggotaUi>,
    /** lockAt (ISO) — cadangan label tenggat bila cutoffLabel kosong. */
    val kunciIso: String? = null,
)

/** Urungkan aksi terakhir (snackbar "Urungkan"). */
sealed interface UrungkanTim {
    /** Batalkan tanda baca laporan harian [userId]. */
    data class Baca(val userId: String) : UrungkanTim

    /** Kembalikan kehadiran [userId] ke [status]/[catatan]; status null = hapus catatan. */
    data class Kehadiran(val userId: String, val status: String?, val catatan: String?) : UrungkanTim
}

/** Pesan satu-kali layar Tim (snackbar), opsional dengan "Urungkan". */
data class PesanTim(val id: Long, val teks: String, val urungkan: UrungkanTim? = null)

/** Aksi utama footer Sheet anggota (padanan footer member-sheet.tsx). */
sealed interface AksiAnggota {
    /** Laporan terkirim dan belum dibaca. */
    data object TandaiDibaca : AksiAnggota

    /** Laporan belum masuk; [aktif] false bila sudah diingatkan/terkunci. */
    data class Ingatkan(val label: String, val aktif: Boolean) : AksiAnggota

    data object Tutup : AksiAnggota
}

/** Status kehadiran yang bisa dicatat (ATTENDANCE_LABELS web, urutan sama). */
internal val STATUS_KEHADIRAN = listOf("HADIR", "TERLAMBAT", "CUTI", "SAKIT", "IZIN")

/** firstName web: buang sapaan Bpk./Bapak/Ibu/Sdr./Sdri. lalu ambil kata pertama. */
internal fun namaDepan(nama: String): String =
    nama.trim()
        .replace(Regex("^(Bpk\\.?|Bapak|Ibu|Sdr\\.?|Sdri\\.?)\\s+", RegexOption.IGNORE_CASE), "")
        .split(Regex("\\s+"))
        .firstOrNull { it.isNotEmpty() }
        ?: nama

/** Aksi utama Sheet anggota: tandai dibaca / ingatkan / tutup (canRemind web). */
internal fun aksiUtamaAnggota(anggota: AnggotaUi, terkunci: Boolean): AksiAnggota = when {
    anggota.laporan == LaporanAnggota.TERKIRIM && anggota.dibacaIso == null -> AksiAnggota.TandaiDibaca
    anggota.laporan == LaporanAnggota.BELUM -> {
        val jam = jamWib(anggota.diingatkanIso)
        AksiAnggota.Ingatkan(
            label = if (jam != null) "Diingatkan $jam" else "Ingatkan ${namaDepan(anggota.nama)}",
            aktif = jam == null && !terkunci,
        )
    }
    else -> AksiAnggota.Tutup
}

/**
 * Subjudul kartu "x dari y masuk · tenggat 17.00 WIB" (E2E-1 #8): cutoffLabel
 * server sudah memuat "WIB" — jangan menambah lagi; tanpa label pakai lockAt,
 * tanpa keduanya tanda hubung (bukan jam tebakan, padanan team-cards.tsx).
 */
internal fun teksTenggatTim(tim: TimUi): String {
    val masuk = if (tim.wajibLapor > 0) "${tim.sudahMasuk} dari ${tim.wajibLapor} masuk · " else ""
    val label = tim.tenggatLabel?.trim()?.takeIf { it.isNotEmpty() }
        ?.let { if (it.contains("WIB")) it else "$it WIB" }
        ?: jamWib(tim.kunciIso)?.let { "$it WIB" }
        ?: "—"
    return "${masuk}tenggat $label"
}

/** Status UI layar Tim: Memuat → Siap(tim) atau Galat(pesan). */
sealed interface TimUiState {
    data object Memuat : TimUiState

    data class Siap(val tim: TimUi) : TimUiState

    data class Galat(val pesan: String) : TimUiState
}

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class TimViewModel @Inject constructor(
    private val api: KadivApi,
    private val kehadiranApi: AttendanceApi,
) : ViewModel() {

    private val _state = MutableStateFlow<TimUiState>(TimUiState.Memuat)

    /** Status layar daftar anggota. */
    val state: StateFlow<TimUiState> = _state.asStateFlow()

    private val _terpilih = MutableStateFlow<String?>(null)

    /** Id anggota yang sheet ringkasnya terbuka; null = daftar. */
    val terpilih: StateFlow<String?> = _terpilih.asStateFlow()

    private val _sibuk = MutableStateFlow<String?>(null)

    /** Aksi yang sedang berjalan ("ingatkan" | "baca" | "hadir"); null = bebas. */
    val sibuk: StateFlow<String?> = _sibuk.asStateFlow()

    private val _pesan = MutableStateFlow<PesanTim?>(null)

    /** Snackbar satu-kali (sukses/galat, opsional Urungkan). */
    val pesan: StateFlow<PesanTim?> = _pesan.asStateFlow()

    private var jobMuat: Job? = null

    private val _menyegarkan = MutableStateFlow(false)

    /** Tarik-untuk-muat-ulang sedang berjalan (indikator di atas daftar). */
    val menyegarkan: StateFlow<Boolean> = _menyegarkan.asStateFlow()

    /** Menarik meja tim; status kembali ke Memuat dulu supaya layar menampilkan kerangka. */
    fun muat() {
        jobMuat = viewModelScope.launch {
            _state.value = TimUiState.Memuat
            muatDiam()
        }
    }

    /**
     * E2E-R2 N3: dipanggil setiap kali tab Divisi tampil lagi (ViewModel
     * bertahan selama sesi, init tidak terulang). Data yang sudah tampil
     * dimuat ulang diam-diam — laporan anggota yang baru masuk ikut terlihat.
     */
    fun saatTampil() {
        if (jobMuat?.isActive == true) return
        if (_state.value is TimUiState.Siap) {
            jobMuat = viewModelScope.launch { muatDiam() }
        } else {
            muat()
        }
    }

    /** Tarik-untuk-muat-ulang: daftar tetap tampil selama memuat. */
    fun segarkan() {
        if (_menyegarkan.value) return
        if (_state.value !is TimUiState.Siap) {
            muat()
            return
        }
        _menyegarkan.value = true
        jobMuat = viewModelScope.launch {
            try {
                muatDiam()
            } finally {
                _menyegarkan.value = false
            }
        }
    }

    init {
        muat()
    }

    /** Muat ulang tanpa kerangka (usai aksi) — Sheet tetap terbuka. */
    private suspend fun muatDiam() {
        _state.value = try {
            val res = api.tim()
            val isi = res.body()
            when {
                res.isSuccessful && isi != null -> TimUiState.Siap(isi.keTimUi())
                _state.value is TimUiState.Siap -> return // galat muat ulang: data lama tetap tampil
                res.isSuccessful -> TimUiState.Galat("Data tim belum termuat. Coba lagi.")
                else -> TimUiState.Galat(ApiError.dari(retrofit2.HttpException(res)).pesanTampil())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (_state.value is TimUiState.Siap) return // data lama tetap tampil
            TimUiState.Galat(ApiError.dari(e).pesanTampil())
        }
    }

    /** Coba lagi setelah galat. */
    fun ulang() = muat()

    /** Membuka/menutup sheet ringkas satu anggota; id null menutup. */
    fun pilih(anggotaId: String?) {
        _terpilih.value = anggotaId
    }

    fun pesanTampil() {
        _pesan.value = null
    }

    /** POST remind satu anggota — "Rani sudah diingatkan." (sent kosong = sebelumnya). */
    fun ingatkan(anggotaId: String) {
        val tim = timSekarang() ?: return
        val anggota = tim.anggota.firstOrNull { it.id == anggotaId } ?: return
        val depan = namaDepan(anggota.nama)
        aksi("ingatkan") {
            val res = api.ingatkanTim(
                KadivTeamAksiRequest(action = KadivTeamAksiRequest.REMIND, userId = anggotaId, divisionId = tim.divisiId),
            )
            if (res.isSuccessful) {
                val terkirim = res.body()?.sent.orEmpty().isNotEmpty()
                tampil(if (terkirim) "$depan sudah diingatkan." else "$depan sudah diingatkan sebelumnya hari ini.")
                muatDiam()
            } else {
                tampil(galatDari(res))
            }
        }
    }

    /** POST read — laporan hari ini ditandai dibaca; snackbar membawa Urungkan. */
    fun tandaiDibaca(anggotaId: String) {
        val tim = timSekarang() ?: return
        val anggota = tim.anggota.firstOrNull { it.id == anggotaId } ?: return
        aksi("baca") {
            val res = api.tandaiBacaTim(
                KadivTeamAksiRequest(action = KadivTeamAksiRequest.READ, userId = anggotaId, divisionId = tim.divisiId),
            )
            if (res.isSuccessful) {
                tampil("Laporan ${namaDepan(anggota.nama)} ditandai sudah dibaca.", UrungkanTim.Baca(anggotaId))
                muatDiam()
            } else {
                tampil(galatDari(res))
            }
        }
    }

    /** Catat kehadiran hari ini; snackbar membawa Urungkan ke catatan sebelumnya. */
    fun aturKehadiran(anggotaId: String, status: String) {
        val tim = timSekarang() ?: return
        val anggota = tim.anggota.firstOrNull { it.id == anggotaId } ?: return
        if (status == anggota.kehadiran || status !in STATUS_KEHADIRAN) return
        val depan = namaDepan(anggota.nama)
        aksi("hadir") {
            val res = kehadiranApi.simpan(KehadiranSimpanRequest(userId = anggotaId, status = status))
            if (res.isSuccessful) {
                val lama = res.body()?.previous
                val teks = if (status == "HADIR") {
                    "$depan dicatat hadir hari ini."
                } else {
                    "$depan dicatat ${labelKehadiran(status).lowercase()} hari ini."
                }
                tampil(teks, UrungkanTim.Kehadiran(anggotaId, lama?.status, lama?.note))
                muatDiam()
            } else {
                tampil(galatDari(res))
            }
        }
    }

    /** Jalankan "Urungkan" dari snackbar. */
    fun urungkan(u: UrungkanTim) {
        val tim = timSekarang() ?: return
        aksi("urungkan") {
            val res: Response<*> = when (u) {
                is UrungkanTim.Baca -> api.tandaiBacaTim(
                    KadivTeamAksiRequest(action = KadivTeamAksiRequest.UNREAD, userId = u.userId, divisionId = tim.divisiId),
                )
                is UrungkanTim.Kehadiran -> if (u.status != null) {
                    kehadiranApi.simpan(KehadiranSimpanRequest(userId = u.userId, status = u.status, note = u.catatan))
                } else {
                    kehadiranApi.hapus(userId = u.userId)
                }
            }
            if (!res.isSuccessful) tampil("Belum berhasil diurungkan. ${galatDari(res)}")
            muatDiam()
        }
    }

    private fun timSekarang(): TimUi? = (_state.value as? TimUiState.Siap)?.tim

    private fun tampil(teks: String, urungkan: UrungkanTim? = null) {
        _pesan.value = PesanTim(System.nanoTime(), teks, urungkan)
    }

    private fun galatDari(res: Response<*>): String = ApiError.dari(retrofit2.HttpException(res)).pesanTampil()

    /** Satu aksi tulis pada satu waktu (pagar klik ganda), galat jaringan jadi pesan. */
    private fun aksi(nama: String, blok: suspend () -> Unit) {
        if (_sibuk.value != null) return
        _sibuk.value = nama
        viewModelScope.launch {
            try {
                blok()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                tampil(ApiError.dari(e).pesanTampil())
            } finally {
                _sibuk.value = null
            }
        }
    }
}

// ------------------------------------------------------------------
// Pemetaan DTO → model tampilan
// ------------------------------------------------------------------

/** KadivTeamResponse → TimUi (subset layar Tim). */
internal fun KadivTeamResponse.keTimUi(): TimUi = TimUi(
    divisiId = division?.id,
    divisiNama = division?.name,
    tenggatLabel = cutoffLabel,
    terkunci = locked,
    sudahMasuk = summary.reported,
    wajibLapor = summary.reporters,
    anggota = members.map { it.keAnggotaUi() },
    kunciIso = lockAt.takeIf { it.isNotBlank() },
)

/** KadivAnggotaDto → AnggotaUi. */
internal fun KadivAnggotaDto.keAnggotaUi(): AnggotaUi = AnggotaUi(
    id = id,
    nama = name,
    jabatan = title?.takeIf { it.isNotEmpty() },
    peran = labelPeran(role),
    inisial = initials.takeIf { it.isNotEmpty() } ?: inisialDari(name),
    kehadiran = attendance,
    proyek = projects.map { it.name },
    laporan = when (report.state) {
        "TERKIRIM" -> LaporanAnggota.TERKIRIM
        "ABSEN" -> LaporanAnggota.ABSEN
        "TIDAK_WAJIB" -> LaporanAnggota.TIDAK_WAJIB
        else -> LaporanAnggota.BELUM
    },
    wajibLapor = report.required,
    sudahMasuk = report.sent,
    dikirimIso = report.submittedAt,
    diingatkanIso = report.remindedAt,
    dibacaIso = report.readAt,
    bebanPersen = load.pct,
    tugasTerbuka = load.openTasks,
    capaian = today.achievements,
    kendala = today.obstacles,
    rencana = today.plans,
    tugas = today.tasks.map { TugasAnggotaUi(it.id, it.title, it.status, it.progressPct, it.projectName) },
    sisaMenit = load.openMinutes,
)

/** Dua huruf pertama kata-kata pertama nama (padanan initials server bila kosong). */
private fun inisialDari(nama: String): String =
    nama.split(' ', limit = 3)
        .filter { it.isNotEmpty() }
        .take(2)
        .joinToString("") { kata -> kata.first().uppercase() }
        .ifEmpty { "?" }
