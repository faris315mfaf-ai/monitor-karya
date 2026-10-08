// Layar Kepatuhan laporan Admin PT (T6-C8 Fase 2). Padanan web:
// src/components/admin/compliance.tsx + rute src/app/api/admin/compliance(+remind).
//
// Satu GET /api/admin/compliance memberi seluruh meja: totals, divisi (wajib/
// sudah/belum + remindedAt hari ini + mingguan), kunci 17.00 WIB, dan
// canRemind. POST remind mengingatkan satu orang / satu divisi; respons
// {people, sent, skipped} dipakai menandai orang bersangkutan di data lokal
// (tanpa muat ulang) lalu snackbar "x orang diingatkan". Galat 409 membawa
// {error, locked} (lewat tenggat) atau {error, remindedAt} (sudah diingatkan
// hari ini) — keduanya diurai dari GalatDto agar UI ikut bergerak.
//
// AdminComplianceApi (T6-C2) sudah ada di :core-network tetapi belum
// disediakan AppModule; KepatuhanModule di bawah menyediakannya dari Retrofit
// tunggal — hapus saat penyediaannya dipusatkan (lihat docs/fase2/T6-C8-LAPORAN.md).
package id.co.monitorkarya.app.ui.kepatuhan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.api.AdminComplianceApi
import id.co.monitorkarya.core.network.dto.DivisiKepatuhanDto
import id.co.monitorkarya.core.network.dto.GalatDto
import id.co.monitorkarya.core.network.dto.IngatkanRequest
import id.co.monitorkarya.core.network.dto.IngatkanResponse
import id.co.monitorkarya.core.network.dto.KepatuhanResponse
import id.co.monitorkarya.core.network.dto.KepatuhanTotalsDto
import id.co.monitorkarya.core.network.dto.KepatuhanWeekDto
import id.co.monitorkarya.core.network.dto.MingguanDivisiDto
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.designsystem.components.MkStatus
import java.time.Instant
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

/** Module penyedia AdminComplianceApi dari Retrofit tunggal AppModule — hapus saat dipusatkan di AppModule. */
// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Jenis laporan yang ditinjau — padanan SegmentedControl Harian/Mingguan web. */
enum class ModeKepatuhan { HARIAN, MINGGUAN }

/** Status serah terima laporan mingguan (WEEKLY_STATE_LABELS admin-compliance.ts). */
enum class StatusMingguan(val label: String) {
    MASUK("Masuk"),
    TERLAMBAT("Terlambat"),
    BELUM("Belum masuk"),
}

/** Orang yang belum melaporkan semua proyeknya hari ini. */
data class OrangBelumLapor(
    val id: String,
    val nama: String,
    /** Label peran, mis. "Manager / PIC proyek". */
    val peran: String,
    /** Kiriman terakhir (mana pun proyeknya), ISO; null = belum pernah. */
    val terakhirLaporIso: String?,
    /** Pengingat pertama hari ini, ISO; null = belum diingatkan. */
    val diingatkanIso: String?,
    /** Nama proyek yang belum terkirim hari ini. */
    val proyek: List<String>,
) {
    val sudahDiingatkan: Boolean get() = diingatkanIso != null
}

/** Satu divisi: hitungan harian, daftar belum lapor, dan status mingguan. */
data class DivisiKepatuhan(
    val id: String,
    val nama: String,
    val kepalaNama: String?,
    val kepalaEmail: String?,
    val kepalaTelepon: String?,
    /** Wajib lapor hari ini (tanpa yang cuti/izin). */
    val wajib: Int,
    val sudah: Int,
    val cuti: Int,
    val belumLapor: List<OrangBelumLapor>,
    val mingguan: StatusMingguan,
    val diserahkanIso: String?,
    val disetujuiIso: String?,
    val diteruskanIso: String?,
) {
    /** Persen lapor harian (pctOf admin-compliance.ts). */
    val persen: Int get() = if (wajib > 0) Math.round(sudah * 100f / wajib) else 0

    /** Dari yang belum lapor, berapa yang sudah diingatkan hari ini. */
    val jumlahDiingatkan: Int get() = belumLapor.count { it.sudahDiingatkan }

    /** Yang masih bisa diingatkan (belum lapor dan belum diingatkan). */
    val belumDiingatkan: Int get() = belumLapor.count { !it.sudahDiingatkan }
}

/** Meja kepatuhan satu hari hasil GET /api/admin/compliance. */
data class MejaKepatuhan(
    /** Laporan hari ini sudah dikunci pukul 17.00 WIB — tombol Ingatkan mati. */
    val terkunci: Boolean,
    /** Akun ini boleh mengirim pengingat (terikat satu PT). */
    val bolehIngatkan: Boolean,
    /** Total orang berbeda lintas divisi (tidak dihitung dua kali). */
    val wajib: Int,
    val sudah: Int,
    val cuti: Int,
    val diingatkan: Int,
    /** PIC aktif yang tidak tergabung di divisi mana pun. */
    val tanpaDivisi: Int,
    /** Nomor minggu ISO pekan berjalan (M41). */
    val isoMinggu: Int,
    /** Tenggat serah terima mingguan (Kamis 17.00) sudah lewat. */
    val serahLewat: Boolean,
    val divisi: List<DivisiKepatuhan>,
)

/** Lencana status satu divisi — status selalu warna + ikon + kata. */
data class LencanaDivisi(val status: MkStatus, val teks: String)

/** Snackbar satu-kali ("x orang diingatkan" / pesan galat). */
data class NotifikasiKepatuhan(val id: Long, val pesan: String)

/** Status UI layar: Memuat → Siap(meja) atau Galat(pesan). */
sealed interface KepatuhanUiState {
    data object Memuat : KepatuhanUiState
    data class Siap(val meja: MejaKepatuhan) : KepatuhanUiState
    data class Galat(val pesan: String) : KepatuhanUiState
}

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class KepatuhanViewModel @Inject constructor(
    private val api: AdminComplianceApi,
) : ViewModel() {

    private val _state = MutableStateFlow<KepatuhanUiState>(KepatuhanUiState.Memuat)

    /** Status layar Kepatuhan. */
    val state: StateFlow<KepatuhanUiState> = _state.asStateFlow()

    private val _mode = MutableStateFlow(ModeKepatuhan.HARIAN)

    /** Jenis laporan yang sedang ditinjau (Harian/Mingguan). */
    val mode: StateFlow<ModeKepatuhan> = _mode.asStateFlow()

    private val _terbuka = MutableStateFlow<String?>(null)

    /** Id divisi yang daftarnya sedang dibentangkan; null = semua tertutup. */
    val terbuka: StateFlow<String?> = _terbuka.asStateFlow()

    private val _mengirim = MutableStateFlow<String?>(null)

    /** Kunci aksi yang sedang dikirim ("user:x"/"divisi:y"); tombol lain menunggu. */
    val mengirim: StateFlow<String?> = _mengirim.asStateFlow()

    private val _notifikasi = MutableStateFlow<NotifikasiKepatuhan?>(null)

    /** Snackbar satu-kali hasil aksi Ingatkan. */
    val notifikasi: StateFlow<NotifikasiKepatuhan?> = _notifikasi.asStateFlow()

    init {
        muat()
    }

    /** Menarik meja kepatuhan; status kembali ke Memuat agar layar menampilkan kerangka. */
    fun muat() {
        viewModelScope.launch {
            _state.value = KepatuhanUiState.Memuat
            _state.value = try {
                val res = api.kepatuhan()
                if (res.isSuccessful) {
                    KepatuhanUiState.Siap(petaMeja(res.body() ?: mejaKosongDto()))
                } else {
                    KepatuhanUiState.Galat(ApiError.dari(HttpException(res)).pesanTampil())
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                KepatuhanUiState.Galat(ApiError.dari(e).pesanTampil())
            }
        }
    }

    fun ulang() = muat()

    /** Mengganti jenis laporan yang ditinjau (segmented Harian/Mingguan). */
    fun pilihMode(mode: ModeKepatuhan) {
        _mode.value = mode
    }

    /** Membentangkan/menutup daftar belum lapor satu divisi; id sama menutup. */
    fun bukaTutupDivisi(id: String?) {
        _terbuka.value = if (_terbuka.value == id) null else id
    }

    /** Snackbar sudah tampil — bersihkan agar tidak berulang. */
    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    /** POST remind {userId} — ingatkan satu orang untuk semua proyeknya yang belum terkirim. */
    fun ingatkanOrang(userId: String) {
        kirimIngatkan(IngatkanRequest.orang(userId), kunci = "user:$userId", userId = userId)
    }

    /** POST remind {divisionId} — ingatkan semua orang divisi itu yang belum lapor. */
    fun ingatkanDivisi(divisionId: String) {
        kirimIngatkan(IngatkanRequest.divisi(divisionId), kunci = "divisi:$divisionId", userId = null)
    }

    private fun kirimIngatkan(body: IngatkanRequest, kunci: String, userId: String?) {
        viewModelScope.launch {
            _mengirim.value = kunci
            try {
                val res = api.ingatkan(body)
                if (res.isSuccessful) {
                    val isi = res.body() ?: IngatkanResponse()
                    tandaiDiingatkan(isi.people.map { it.userId to (it.remindedAt ?: sekarangIso()) })
                    _notifikasi.value = NotifikasiKepatuhan(
                        id = System.nanoTime(),
                        pesan = pesanSukses(isi, userId),
                    )
                } else {
                    val galat = bacaGalat(res)
                    // 409 terkunci: hari ini sudah lewat 17.00 — kunci meja lokal
                    // agar banner + tombol nonaktif muncul tanpa menunggu muat ulang.
                    if (galat.locked == true) tandaiTerkunci()
                    // 409 "sudah diingatkan": tandai orang itu agar lencana ikut bergerak.
                    if (galat.remindedAt != null && userId != null) {
                        galat.remindedAt?.let { tandaiDiingatkan(listOf(userId to it)) }
                    }
                    _notifikasi.value = NotifikasiKepatuhan(
                        id = System.nanoTime(),
                        pesan = galat.error ?: ApiError.dari(HttpException(res)).pesanTampil(),
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _notifikasi.value = NotifikasiKepatuhan(
                    id = System.nanoTime(),
                    pesan = ApiError.dari(e).pesanTampil(),
                )
            } finally {
                _mengirim.value = null
            }
        }
    }

    /** Menandai orang terkait sudah diingatkan pada data lokal (padanan sendReminder web). */
    private fun tandaiDiingatkan(stempel: List<Pair<String, String>>) {
        if (stempel.isEmpty()) return
        val peta = stempel.toMap()
        val siap = _state.value as? KepatuhanUiState.Siap ?: return
        _state.value = siap.copy(
            meja = siap.meja.copy(
                diingatkan = siap.meja.diingatkan + stempel.size,
                divisi = siap.meja.divisi.map { d ->
                    d.copy(
                        belumLapor = d.belumLapor.map { o ->
                            if (o.id in peta && !o.sudahDiingatkan) o.copy(diingatkanIso = peta[o.id]) else o
                        },
                    )
                },
            ),
        )
    }

    /** Menandai meja terkunci (409 locked) tanpa memuat ulang. */
    private fun tandaiTerkunci() {
        val siap = _state.value as? KepatuhanUiState.Siap ?: return
        _state.value = siap.copy(meja = siap.meja.copy(terkunci = true))
    }

    /** Toast sukses — "x orang diingatkan" (orang tunggal menyebut namanya). */
    private fun pesanSukses(isi: IngatkanResponse, userId: String?): String {
        val orang = isi.people
        return when {
            orang.isEmpty() -> "Tidak ada yang perlu diingatkan."
            userId != null -> "${orang.first().name} diingatkan. Tercatat di log aktivitas."
            else -> "${orang.size} orang diingatkan. Tercatat di log aktivitas."
        }
    }

    /** Body galat sebagai GalatDto ({error, locked, remindedAt, …}); toleran bila bukan JSON. */
    private fun bacaGalat(res: Response<IngatkanResponse>): GalatDto =
        runCatching { res.errorBody()?.string() }
            .getOrNull()
            ?.let { runCatching { mkJson.decodeFromString(GalatDto.serializer(), it) }.getOrNull() }
            ?: GalatDto()
}

// ------------------------------------------------------------------
// Pemetaan DTO → model tampilan
// ------------------------------------------------------------------

/** Respons kosong bila body hilang — layar menampilkan keadaan hampa, bukan melempar. */
private fun mejaKosongDto(): KepatuhanResponse = KepatuhanResponse(
    today = "",
    week = KepatuhanWeekDto(isoYear = 0, isoWeek = 0, handoverBy = "", lockAt = ""),
    totals = KepatuhanTotalsDto(),
)

internal fun petaMeja(r: KepatuhanResponse): MejaKepatuhan = MejaKepatuhan(
    terkunci = r.locked,
    bolehIngatkan = r.canRemind,
    wajib = r.totals.expected,
    sudah = r.totals.reported,
    cuti = r.totals.onLeave,
    diingatkan = r.totals.reminded,
    tanpaDivisi = r.totals.unassigned,
    isoMinggu = r.week.isoWeek,
    serahLewat = r.week.handoverPassed,
    divisi = r.divisions.map(::petaDivisi),
)

private fun petaDivisi(d: DivisiKepatuhanDto): DivisiKepatuhan = DivisiKepatuhan(
    id = d.id,
    nama = d.name,
    kepalaNama = d.head?.name,
    kepalaEmail = d.head?.email,
    kepalaTelepon = d.head?.phone,
    wajib = d.expected,
    sudah = d.reported,
    cuti = d.onLeave,
    belumLapor = d.missing.map { o ->
        OrangBelumLapor(
            id = o.id,
            nama = o.name,
            peran = o.role,
            terakhirLaporIso = o.lastReportAt,
            diingatkanIso = o.remindedAt,
            proyek = o.projects,
        )
    },
    mingguan = when (d.weekly.state) {
        MingguanDivisiDto.STATE_MASUK -> StatusMingguan.MASUK
        MingguanDivisiDto.STATE_TERLAMBAT -> StatusMingguan.TERLAMBAT
        else -> StatusMingguan.BELUM
    },
    diserahkanIso = d.weekly.submittedAt,
    disetujuiIso = d.weekly.approvedAt,
    diteruskanIso = d.weekly.forwardedAt,
)

private fun sekarangIso(): String = Instant.now().toString()

// ------------------------------------------------------------------
// Lencana status per divisi (port dailyBadge/weeklyBadge compliance.tsx)
// ------------------------------------------------------------------

/** Lencana harian: Lengkap / Diingatkan / "n belum" / Semua cuti-izin / Tanpa PIC. */
internal fun lencanaHarian(d: DivisiKepatuhan, terkunci: Boolean): LencanaDivisi {
    val belum = d.belumLapor.size
    return when {
        d.wajib == 0 -> LencanaDivisi(MkStatus.NEUTRAL, if (d.cuti > 0) "Semua cuti/izin" else "Tanpa PIC")
        belum == 0 -> LencanaDivisi(MkStatus.DONE, "Lengkap")
        d.jumlahDiingatkan == belum -> LencanaDivisi(if (terkunci) MkStatus.LATE else MkStatus.INFO, "Diingatkan")
        else -> LencanaDivisi(if (terkunci) MkStatus.LATE else MkStatus.RISK, "$belum belum")
    }
}

/** Lencana mingguan: Masuk / Terlambat / Belum masuk (Belum jadi Terlambat setelah tenggat Kamis). */
internal fun lencanaMingguan(d: DivisiKepatuhan, serahLewat: Boolean): LencanaDivisi {
    val status = when (d.mingguan) {
        StatusMingguan.MASUK -> MkStatus.DONE
        StatusMingguan.TERLAMBAT -> MkStatus.RISK
        StatusMingguan.BELUM -> if (serahLewat) MkStatus.LATE else MkStatus.NEUTRAL
    }
    val ekstra = when {
        d.diteruskanIso != null -> " · diteruskan"
        d.disetujuiIso != null -> " · disetujui"
        else -> ""
    }
    return LencanaDivisi(status, d.mingguan.label + ekstra)
}
