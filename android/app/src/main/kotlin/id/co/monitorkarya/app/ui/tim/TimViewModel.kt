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
// Aksi remind/read/unread rute ini TIDAK dipakai layar ini (tugas lain).
package id.co.monitorkarya.app.ui.tim

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.KadivApi
import id.co.monitorkarya.core.network.dto.KadivAnggotaDto
import id.co.monitorkarya.core.network.dto.KadivTeamResponse
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Retrofit

// ------------------------------------------------------------------
// Penyedia dependensi (dari Retrofit tunggal AppModule)
// ------------------------------------------------------------------

/**
 * KadivApi (T6-C1) dari Retrofit bersama AppModule — pola yang sama dengan
 * LaporanModule/PenerimaanModule. Bila penyedia pusat untuk KadivApi
 * ditambahkan nanti, hapus @Provides yang kembar di sini (Hilt menolak
 * duplikat binding).
 */
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
    /** load.pct — beban kerja minggu ini; null = tanpa kapasitas. */
    val bebanPersen: Int?,
    /** load.openTasks. */
    val tugasTerbuka: Int,
    /** today.achievements — capaian hari ini dari laporan yang masuk. */
    val capaian: List<String>,
    /** today.obstacles. */
    val kendala: List<String>,
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
)

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
) : ViewModel() {

    private val _state = MutableStateFlow<TimUiState>(TimUiState.Memuat)

    /** Status layar daftar anggota. */
    val state: StateFlow<TimUiState> = _state.asStateFlow()

    private val _terpilih = MutableStateFlow<String?>(null)

    /** Id anggota yang sheet ringkasnya terbuka; null = daftar. */
    val terpilih: StateFlow<String?> = _terpilih.asStateFlow()

    init {
        muat()
    }

    /** Menarik meja tim; status kembali ke Memuat dulu supaya layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = TimUiState.Memuat
            _state.value = try {
                val res = api.tim()
                val isi = res.body()
                when {
                    res.isSuccessful && isi != null -> TimUiState.Siap(isi.keTimUi())
                    res.isSuccessful -> TimUiState.Galat("Data tim belum termuat. Coba lagi.")
                    else -> TimUiState.Galat(ApiError.dari(retrofit2.HttpException(res)).pesanTampil())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                TimUiState.Galat(ApiError.dari(e).pesanTampil())
            }
        }
    }

    /** Coba lagi setelah galat. */
    fun ulang() = muat()

    /** Membuka/menutup sheet ringkas satu anggota; id null menutup. */
    fun pilih(anggotaId: String?) {
        _terpilih.value = anggotaId
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
    bebanPersen = load.pct,
    tugasTerbuka = load.openTasks,
    capaian = today.achievements,
    kendala = today.obstacles,
)

/** Dua huruf pertama kata-kata pertama nama (padanan initials server bila kosong). */
private fun inisialDari(nama: String): String =
    nama.split(' ', limit = 3)
        .filter { it.isNotEmpty() }
        .take(2)
        .joinToString("") { kata -> kata.first().uppercase() }
        .ifEmpty { "?" }
