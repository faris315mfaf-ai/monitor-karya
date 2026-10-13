// Meja kerja PIC (agen A1, 13 Okt 2026 — selaras web terbaru). Padanan
// src/components/work-desk/pic-desk.tsx (PicDeskView + AgendaCard), data dari
// GET /api/work-desk (cabang PIC) + GET /api/tasks?projectId= untuk agenda
// proyek terpilih. Jam batas mengikuti aturan PT (lockAt/countdown/cutoffLabel
// dari ReportSettings; "24.00 WIB" = mode 24/7).
package id.co.monitorkarya.app.ui.mejakerja

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.core.data.outbox.AntreanOutbox
import id.co.monitorkarya.core.data.outbox.IdLokal
import id.co.monitorkarya.core.data.outbox.PesanOutbox
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.core.data.repo.CacheLayar
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.core.domain.time.Wib
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.Idempotensi
import id.co.monitorkarya.core.network.api.TasksApi
import id.co.monitorkarya.core.network.api.WorkDeskApi
import id.co.monitorkarya.core.network.dto.EntriSimpanRequest
import id.co.monitorkarya.core.network.dto.PayloadHapusEntri
import id.co.monitorkarya.core.network.dto.PicProyekDto
import id.co.monitorkarya.core.network.dto.SubtaskInputDto
import id.co.monitorkarya.core.network.dto.TaskDto
import id.co.monitorkarya.core.network.dto.TaskSaveRequest
import id.co.monitorkarya.core.network.dto.TasksDayResponse
import id.co.monitorkarya.core.network.dto.WorkDeskPicResponse
import id.co.monitorkarya.core.network.mkJson
import id.co.monitorkarya.designsystem.components.MkStatus
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import retrofit2.HttpException
import retrofit2.Response

// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Keadaan satu sel riwayat 10 hari kerja (DayStrip web). */
enum class KeadaanHari(val label: String) {
    TEPAT("Tepat waktu"),
    TERLAMBAT("Terlambat"),
    TIDAK_DIKIRIM("Tidak dikirim"),
    HARI_INI("Hari ini"),
    MENUNGGU("Hari ini · belum dikirim"),
}

data class HariRiwayat(val tanggal: String, val keadaan: KeadaanHari, val keterangan: String?)

/** Satu proyek di antrean laporan hari ini. */
data class ProyekMeja(
    val id: String,
    val nama: String,
    /** "PRJ-1 · Pelaksanaan · progres 40% · 2 bukti". */
    val meta: String,
    val status: MkStatus,
    val statusLabel: String,
    val tugasTotal: Int,
    val tugasSelesai: Int,
    val tugasTerkendala: Int,
    /** "Diingatkan Rani pukul 09.12" bila laporan belum dikirim. */
    val pengingat: String?,
    val riwayat: List<HariRiwayat>,
    val tepatWaktu: Int,
    val terkirim: Boolean,
)

/** Meja kerja PIC tersusun. */
data class MejaKerjaData(
    val proyekKosong: Boolean,
    /** "Meja kerja · Senin, 13 Oktober". */
    val eyebrow: String,
    val jawaban: String,
    val dukungan: String,
    val terkunci: Boolean,
    val mode247: Boolean,
    val laporanTotal: Int,
    val laporanTerkirim: Int,
    val tugasTotal: Int,
    val tugasSelesai: Int,
    val tugasTerkendala: Int,
    val tepatWaktuPct: Int,
    val tepatWaktuJumlah: Int,
    val riwayatTotal: Int,
    /** Subjudul antrean: "Kirim sebelum 17.00 WIB" / "Terkunci sejak …" / 24/7. */
    val subAntrean: String,
    val proyek: List<ProyekMeja>,
) {
    val belumTerkirim: Int get() = laporanTotal - laporanTerkirim
}

/** Status UI layar: Memuat → Sukses(data) atau Galat(pesan). */
sealed interface MejaKerjaUiState {
    data object Memuat : MejaKerjaUiState
    data class Sukses(val data: MejaKerjaData) : MejaKerjaUiState
    data class Galat(val pesan: String) : MejaKerjaUiState
}

/** Satu baris agenda task hari ini. */
data class TugasAgenda(
    val id: String,
    val judul: String,
    val meta: String?,
    val jam: String?,
    val selesai: Boolean,
    val terkendala: Boolean,
    val statusLabel: String,
    /** B2: centang/entri ini masih di antrean; null = sinkron. */
    val statusKirim: StatusKirim? = null,
    val galatKirim: String? = null,
) {
    /** Entri yang ditambahkan luring — belum bisa dicentang sampai terkirim. */
    val lokal: Boolean get() = IdLokal.adalah(id)
}

/** Agenda proyek terpilih. */
sealed interface AgendaUi {
    data object Memuat : AgendaUi
    data class Siap(val tugas: List<TugasAgenda>, val terkunci: Boolean) : AgendaUi
    data class Galat(val pesan: String) : AgendaUi
}

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class MejaKerjaViewModel @Inject constructor(
    private val workDeskApi: WorkDeskApi,
    private val tasksApi: TasksApi,
    private val antreanOutbox: AntreanOutbox,
    private val cache: CacheLayar,
) : ViewModel() {

    private val _state = MutableStateFlow<MejaKerjaUiState>(MejaKerjaUiState.Memuat)
    val state: StateFlow<MejaKerjaUiState> = _state.asStateFlow()

    private val _terpilih = MutableStateFlow<String?>(null)

    /** Proyek antrean yang agendanya tampil. */
    val terpilih: StateFlow<String?> = _terpilih.asStateFlow()

    /** Kunci "YYYY-MM-DD" hari ini menurut meja server (kunci outbox laporan). */
    private val _hariIni = MutableStateFlow<String?>(null)

    /** Agenda dari server / potret Room, sebelum ditumpangi antrean. */
    private val _agenda = MutableStateFlow<AgendaUi>(AgendaUi.Memuat)

    /** Pesan antrean laporan harian (MENUNGGU + GAGAL). */
    private val antrean: StateFlow<List<PesanOutbox>> = antreanOutbox.amatiKunci(KunciOutbox.AWALAN_LAPORAN)
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Agenda proyek terpilih + centang/entri yang masih menunggu kirim (B2). */
    val agenda: StateFlow<AgendaUi> = combine(_agenda, antrean, _terpilih, _hariIni) { a, pesan, pid, hari ->
        if (a !is AgendaUi.Siap || pid == null || hari == null) {
            a
        } else {
            val kunci = KunciOutbox.laporanHarian(pid, hari)
            a.copy(tugas = tumpangkanAgenda(a.tugas, pesan.filter { it.kunci == kunci }))
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, AgendaUi.Memuat)

    private val _tersimpanMeja = MutableStateFlow<Long?>(null)
    private val _tersimpanAgenda = MutableStateFlow<Long?>(null)

    /** Epoch millis potret Room yang tampil (luring); null = data segar. */
    val tersimpanPada: StateFlow<Long?> = combine(_tersimpanMeja, _tersimpanAgenda) { a, b -> listOfNotNull(a, b).minOrNull() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val _sibuk = MutableStateFlow<String?>(null)

    /** Id task yang sedang dicentang. */
    val sibuk: StateFlow<String?> = _sibuk.asStateFlow()

    private val _pesan = MutableStateFlow<String?>(null)

    /** Pesan satu-kali (galat centang / menunggu kirim). */
    val pesan: StateFlow<String?> = _pesan.asStateFlow()

    private var tugasMentah: List<TaskDto> = emptyList()
    private var terkunciHari = false

    init {
        muat()
        // Pesan antrean hilang = terkirim/dibuang → segarkan diam-diam dari server.
        viewModelScope.launch {
            var sebelumnya: Set<Long>? = null
            antrean.collect { daftar ->
                val kini = daftar.map { it.id }.toSet()
                val lama = sebelumnya
                sebelumnya = kini
                if (lama != null && (lama - kini).isNotEmpty() && _state.value is MejaKerjaUiState.Sukses) muatMeja()
            }
        }
    }

    fun muat() {
        viewModelScope.launch {
            _state.value = MejaKerjaUiState.Memuat
            muatMeja()
        }
    }

    fun ulang() = muat()

    fun pilih(id: String) {
        if (_terpilih.value == id) return
        _terpilih.value = id
        viewModelScope.launch { muatAgenda(diam = false) }
    }

    fun pesanTampil() {
        _pesan.value = null
    }

    private suspend fun muatMeja() {
        // C5-T4: potret dikunci per tanggal WIB — mulai luring esok hari tidak
        // menampilkan meja kemarin sebagai "hari ini" (galat luring jujur).
        val hari = Wib.hariIni().toString()
        when (val h = baca(CacheLayar.mejaKerjaPic(hari), WorkDeskPicResponse.serializer()) { workDeskApi.meja() }) {
            is Baca.Ok -> {
                val desk = h.data
                _tersimpanMeja.value = h.tersimpanPada
                _hariIni.value = kunciHari(desk.today)
                // Sisa waktu dihitung dari lockAt (aturan PT) terhadap jam kini —
                // tetap benar untuk potret Room yang dibaca belakangan.
                val sisa = sisaMenuju(desk.lockAt, Instant.now()) ?: desk.countdown.totalMs
                val data = susunMeja(desk, sisa)
                terkunciHari = data.terkunci
                _state.value = MejaKerjaUiState.Sukses(data)
                val kini = _terpilih.value
                if (kini == null || desk.projects.none { it.id == kini }) {
                    _terpilih.value = (desk.projects.firstOrNull { it.report?.submittedAt == null } ?: desk.projects.firstOrNull())?.id
                }
                muatAgenda(diam = _agenda.value is AgendaUi.Siap)
            }
            is Baca.Galat -> if (_state.value !is MejaKerjaUiState.Sukses) {
                _state.value = MejaKerjaUiState.Galat(h.pesan)
            } else {
                _pesan.value = h.pesan
            }
        }
    }

    private suspend fun muatAgenda(diam: Boolean) {
        val pid = _terpilih.value ?: return
        if (!diam) _agenda.value = AgendaUi.Memuat
        val hari = Wib.hariIni().toString()
        _agenda.value = when (val h = baca(CacheLayar.agendaMejaKerja(pid, hari), TasksDayResponse.serializer()) { tasksApi.perHari(pid) }) {
            is Baca.Ok -> {
                _tersimpanAgenda.value = h.tersimpanPada
                tugasMentah = h.data.tasks.filter { it.scope == "HARIAN" }
                AgendaUi.Siap(tugas = tugasMentah.map { it.keAgenda() }, terkunci = terkunciHari || h.data.locked)
            }
            is Baca.Galat -> AgendaUi.Galat(h.pesan)
        }
    }

    fun ulangAgenda() {
        viewModelScope.launch { muatAgenda(diam = false) }
    }

    /**
     * Centang/lepas satu task (optimistis). Daring dulu; luring atau ada
     * tulisan laporan hari ini yang masih tertunda → diantre (FIFO per laporan)
     * dan tampil "Menunggu kirim". 409/422 daring dikembalikan + pesan server.
     */
    fun centang(id: String) {
        val t = tugasMentah.firstOrNull { it.id == id } ?: return
        val dasar = _agenda.value as? AgendaUi.Siap ?: return
        val pid = _terpilih.value ?: return
        val hari = _hariIni.value ?: return
        if (dasar.terkunci || _sibuk.value != null) return
        val kunci = KunciOutbox.laporanHarian(pid, hari)
        // Keadaan TAMPIL (sudah ditumpangi centang tertunda) yang dibalik.
        val tampil = (agenda.value as? AgendaUi.Siap)?.tugas?.firstOrNull { it.id == id }
        val berikut = !(tampil?.selesai ?: (t.status == "SELESAI"))
        _agenda.value = dasar.copy(tugas = dasar.tugas.map { if (it.id == id) it.copy(selesai = berikut) else it })
        viewModelScope.launch {
            _sibuk.value = id
            val tertunda = antreanOutbox.aktifKunci(kunci)
            // Gelombang E: satu kunci idempotensi untuk centang ini — kiriman daring
            // yang putus jaringan diantre dengan kunci + badan yang SAMA.
            val kunciIdem = Idempotensi.kunciBaru()
            val galat: String? = if (tertunda.isNotEmpty()) {
                antreCentang(t, berikut, kunci, tertunda)
            } else {
                try {
                    val res = tasksApi.ubah(badanCentang(t, berikut), kunciIdem)
                    if (res.isSuccessful) null else ApiError.dari(HttpException(res)).pesanTampil()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: IOException) {
                    antreCentang(t, berikut, kunci, tertunda, kunciIdem)
                } catch (e: Exception) {
                    ApiError.dari(e).pesanTampil()
                }
            }
            _sibuk.value = null
            when {
                galat == ANTRE -> _pesan.value = "Centang menunggu kirim. Terkirim otomatis saat daring."
                galat != null -> {
                    _agenda.update { a ->
                        (a as? AgendaUi.Siap)?.copy(tugas = a.tugas.map { if (it.id == id) it.copy(selesai = !berikut) else it }) ?: a
                    }
                    _pesan.value = galat
                }
                else -> muatMeja()
            }
        }
    }

    /**
     * Masukkan centang ke antrean. Bila entri ini punya UBAH_ENTRI tertunda
     * (diubah di Laporan harian saat luring), centang dibangun dari payload
     * entri TERBARU itu — PUT server mengganti utuh, jadi membangun dari data
     * server lama akan menimpa suntingan yang belum terkirim.
     * [kunciDaring] = kunci idempotensi kiriman daring yang gagal jaringan;
     * HANYA dipakai bila badan antrean sama persis (UBAH_TUGAS dari
     * badanCentang) — badan lain wajib kunci baru (kunci sama + badan beda
     * akan dibalas server dengan respons badan lama).
     * @return [ANTRE] atau pesan galat simpan lokal.
     */
    private suspend fun antreCentang(
        t: TaskDto,
        selesai: Boolean,
        kunci: String,
        tertunda: List<PesanOutbox>,
        kunciDaring: String? = null,
    ): String = try {
        val entriTerbaru = tertunda.asReversed().firstNotNullOfOrNull { p ->
            if (p.jenis != JenisOutbox.UBAH_ENTRI) {
                null
            } else {
                runCatching { mkJson.decodeFromString(EntriSimpanRequest.serializer(), p.payloadJson) }.getOrNull()?.takeIf { it.id == t.id }
            }
        }
        val label = "${if (selesai) "Selesaikan" else "Buka lagi"} task “${t.title.take(60)}”"
        if (entriTerbaru != null) {
            antreanOutbox.antre(JenisOutbox.UBAH_ENTRI, EntriSimpanRequest.serializer(), centangEntri(entriTerbaru, selesai), kunci, label)
        } else {
            antreanOutbox.antre(
                JenisOutbox.UBAH_TUGAS,
                TaskSaveRequest.serializer(),
                badanCentang(t, selesai),
                kunci,
                label,
                kunciIdempotensi = kunciDaring,
            )
        }
        ANTRE
    } catch (e: CancellationException) {
        throw e
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
        "Centang tidak dapat disimpan di perangkat."
    }

    /** Baca daring dulu; luring → potret Room. */
    private suspend fun <T> baca(kunci: String, serializer: KSerializer<T>, blok: suspend () -> Response<T>): Baca<T> = try {
        val res = blok()
        val isi = res.body()
        if (!res.isSuccessful || isi == null) throw HttpException(res)
        cache.simpan(kunci, serializer, isi)
        Baca.Ok(isi, null)
    } catch (e: CancellationException) {
        throw e
    } catch (e: IOException) {
        cache.ambil(kunci, serializer)?.let { Baca.Ok(it.nilai, it.disimpanPada) } ?: Baca.Galat(ApiError.dari(e).pesanTampil())
    } catch (e: Exception) {
        Baca.Galat(ApiError.dari(e).pesanTampil())
    }

    private sealed interface Baca<out T> {
        data class Ok<T>(val data: T, val tersimpanPada: Long?) : Baca<T>
        data class Galat(val pesan: String) : Baca<Nothing>
    }

    private companion object {
        const val ANTRE = "\u0000antre"
    }
}

// ------------------------------------------------------------------
// Susunan data (murni — diuji di app/src/test)
// ------------------------------------------------------------------

private val ID: Locale = Locale.forLanguageTag("id-ID")
private val formatJam = DateTimeFormatter.ofPattern("HH.mm").withZone(Wib.ZONA)
private val formatHari = DateTimeFormatter.ofPattern("EEEE, d MMMM", ID).withZone(Wib.ZONA)

/** ISO → "HH.mm" WIB; null bila ISO rusak. */
internal fun jamWib(iso: String?): String? =
    iso?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { formatJam.format(it) }

/** cutoffLabel "24.00 WIB" = aturan PT 24/7 (dailyCutoffLabelWith). */
internal fun mode247(cutoffLabel: String): Boolean = cutoffLabel.trim().startsWith("24")

/** "2 jam 15 menit" dari milidetik (remainLong web). */
internal fun sisaPanjang(ms: Long): String {
    val menitTotal = (ms / 60_000).coerceAtLeast(0)
    val jam = menitTotal / 60
    val menit = menitTotal % 60
    return when {
        jam > 0 && menit > 0 -> "$jam jam $menit menit"
        jam > 0 -> "$jam jam"
        else -> "$menit menit"
    }
}

/** Status laporan satu proyek (reportStatus web). */
internal fun statusLaporan(p: PicProyekDto, lewat: Boolean): Pair<MkStatus, String> {
    val r = p.report
    return when {
        r?.forwardedAt != null -> MkStatus.DONE to "Diteruskan ke holding"
        r?.submittedAt != null -> (if (r.isLate) MkStatus.RISK else MkStatus.DONE) to
            "${if (r.isLate) "Terlambat masuk" else "Terkirim"} ${jamWib(r.submittedAt) ?: ""}".trim()
        r != null -> (if (lewat) MkStatus.LATE else MkStatus.RISK) to "Draf belum dikirim"
        else -> if (lewat) MkStatus.LATE to "Tidak dikirim" else MkStatus.NEUTRAL to "Belum diisi"
    }
}

/** Sel riwayat (dayCells web). */
internal fun selRiwayat(p: PicProyekDto, hariIni: String): List<HariRiwayat> = p.history.map { h ->
    val kunci = kunciHari(h.date)
    val iniHari = kunci == kunciHari(hariIni)
    val keadaan = when {
        iniHari -> if (h.submitted) KeadaanHari.HARI_INI else KeadaanHari.MENUNGGU
        !h.submitted -> KeadaanHari.TIDAK_DIKIRIM
        h.isLate -> KeadaanHari.TERLAMBAT
        else -> KeadaanHari.TEPAT
    }
    HariRiwayat(
        tanggal = kunci,
        keadaan = keadaan,
        keterangan = if (h.submitted && h.progressPct != null) {
            "${if (h.isLate) "Terlambat" else "Tepat waktu"} · progres ${h.progressPct}%"
        } else {
            null
        },
    )
}

/**
 * @param sisaMs sisa waktu menuju lockAt (VM menghitungnya dari lockAt terhadap
 *   jam kini supaya potret Room tetap benar); bawaan = countdown server.
 */
internal fun susunMeja(desk: WorkDeskPicResponse, sisaMs: Long = desk.countdown.totalMs): MejaKerjaData {
    val proyek = desk.projects
    val terkirim = proyek.count { it.report?.submittedAt != null }
    val sisa = proyek.size - terkirim
    val tugasTotal = proyek.sumOf { it.tasks.total }
    val tugasSelesai = proyek.sumOf { it.tasks.done }
    val terkendala = proyek.sumOf { it.tasks.blocked }
    // "today" dan history[].date sama-sama ISO awal hari WIB; dibandingkan per kunci "YYYY-MM-DD".
    val hariIniKunci = kunciHari(desk.today)
    val lalu = proyek.flatMap { p -> p.history.filter { kunciHari(it.date) != hariIniKunci } }
    val tepat = lalu.count { it.submitted && !it.isLate }
    val tepatPct = if (lalu.isEmpty()) 0 else (tepat * 100.0 / lalu.size).roundToInt()
    val pengingat = proyek.firstOrNull { it.remindedAt != null && it.report?.submittedAt == null }
    val m247 = mode247(desk.cutoffLabel)
    // Potret Room lama bisa saja dibuat sebelum tenggat: lewat jam batas = terkunci.
    val terkunci = desk.locked || (!m247 && sisaMs <= 0)

    val jawaban = when {
        sisa == 0 && proyek.size == 1 -> "Laporan ${proyek[0].name} hari ini sudah terkirim."
        sisa == 0 -> "Semua ${proyek.size} laporan hari ini sudah terkirim."
        proyek.size == 1 -> "Laporan ${proyek[0].name} hari ini belum dikirim."
        else -> "$sisa dari ${proyek.size} laporan hari ini belum dikirim."
    }
    val dukungan = listOfNotNull(
        when {
            terkunci && m247 -> "Pengisian laporan hari ini sedang ditutup."
            terkunci -> "Tenggat ${desk.cutoffLabel} sudah lewat; laporan hari ini terkunci."
            sisa > 0 && m247 -> "Tersedia 24/7 · kirim kapan saja."
            sisa > 0 -> "Tenggat ${desk.cutoffLabel}, ${sisaPanjang(sisaMs)} lagi."
            else -> "Admin PT sudah bisa meneruskannya ke holding."
        },
        if (tugasTotal > 0) "$tugasSelesai dari $tugasTotal task hari ini selesai." else "Belum ada task untuk hari ini.",
        pengingat?.let { "${it.remindedBy ?: "Admin PT"} mengingatkan pukul ${jamWib(it.remindedAt) ?: "-"}." },
    ).joinToString(" ")

    return MejaKerjaData(
        proyekKosong = proyek.isEmpty(),
        eyebrow = "Meja kerja · ${runCatching { formatHari.format(Instant.parse(desk.today)) }.getOrDefault(hariIniKunci)}",
        jawaban = jawaban,
        dukungan = dukungan,
        terkunci = terkunci,
        mode247 = m247,
        laporanTotal = proyek.size,
        laporanTerkirim = terkirim,
        tugasTotal = tugasTotal,
        tugasSelesai = tugasSelesai,
        tugasTerkendala = terkendala,
        tepatWaktuPct = tepatPct,
        tepatWaktuJumlah = tepat,
        riwayatTotal = lalu.size,
        subAntrean = when {
            terkunci -> "Terkunci sejak ${desk.cutoffLabel}"
            m247 -> "Kirim kapan saja · pilih proyek untuk melihat agendanya"
            else -> "Kirim sebelum ${desk.cutoffLabel} · pilih proyek untuk melihat agendanya"
        },
        proyek = proyek.map { p ->
            val (st, label) = statusLaporan(p, terkunci)
            ProyekMeja(
                id = p.id,
                nama = p.name,
                meta = listOfNotNull(
                    p.code,
                    labelFaseMeja(p.phase),
                    p.report?.let { "progres ${it.progressPct}%" },
                    p.report?.evidenceCount?.takeIf { it > 0 }?.let { "$it bukti" },
                ).joinToString(" · "),
                status = st,
                statusLabel = label,
                tugasTotal = p.tasks.total,
                tugasSelesai = p.tasks.done,
                tugasTerkendala = p.tasks.blocked,
                pengingat = if (p.remindedAt != null && p.report?.submittedAt == null) {
                    "Diingatkan ${p.remindedBy ?: "Admin PT"} pukul ${jamWib(p.remindedAt) ?: "-"}"
                } else {
                    null
                },
                riwayat = selRiwayat(p, hariIniKunci),
                tepatWaktu = p.history.count { it.submitted && !it.isLate },
                terkirim = p.report?.submittedAt != null,
            )
        },
    )
}

/** ISO awal hari WIB → "YYYY-MM-DD"; teks "YYYY-MM-DD" dibiarkan. */
internal fun kunciHari(iso: String): String =
    runCatching { Instant.parse(iso).atZone(Wib.ZONA).toLocalDate().toString() }.getOrDefault(iso.take(10))

private fun labelFaseMeja(fase: String): String =
    fase.lowercase(ID).replace('_', ' ').replaceFirstChar { it.titlecase(ID) }

internal fun TaskDto.keAgenda(): TugasAgenda {
    val terkendala = status == "TERKENDALA" || status == "MENUNGGU_KEPUTUSAN"
    val langkahSelesai = subtasks.count { it.isDone }
    return TugasAgenda(
        id = id,
        judul = title,
        meta = listOfNotNull(
            picName?.takeIf { it.isNotBlank() },
            if (subtasks.isNotEmpty()) "$langkahSelesai dari ${subtasks.size} langkah" else null,
            if (terkendala) (obstacle ?: decisionNeeded)?.takeIf { it.isNotBlank() } else null,
        ).joinToString(" · ").ifEmpty { null },
        jam = when {
            startAt != null && endAt != null -> "${jamWib(startAt) ?: "-"}–${jamWib(endAt) ?: "-"}"
            startAt != null -> "mulai ${jamWib(startAt) ?: "-"}"
            else -> null
        },
        selesai = status == "SELESAI",
        terkendala = terkendala,
        statusLabel = when (status) {
            "MENUNGGU_KEPUTUSAN" -> "Menunggu keputusan"
            "TERKENDALA" -> "Terkendala"
            else -> ""
        },
    )
}

/** Badan PUT centang task (AgendaCard.toggle web); kolom narasi entri tidak dikirim → dipertahankan server. */
internal fun badanCentang(t: TaskDto, selesai: Boolean): TaskSaveRequest = TaskSaveRequest(
    title = t.title,
    id = t.id,
    context = "HARIAN",
    description = t.description,
    picName = t.picName,
    picUserId = t.picUserId,
    tags = t.tags,
    status = if (selesai) "SELESAI" else "BERJALAN",
    progressPct = if (selesai) 100 else minOf(t.progressPct, 90),
    urgency = t.urgency,
    obstacle = t.obstacle,
    decisionNeeded = t.decisionNeeded,
    startTime = jamHHMM(t.startAt),
    endTime = jamHHMM(t.endAt),
    subtasks = t.subtasks.map { SubtaskInputDto(title = it.title, isDone = if (selesai) true else it.isDone) },
)

/** ISO → "HH:MM" WIB untuk dikirim balik ke /api/tasks. */
internal fun jamHHMM(iso: String?): String? =
    iso?.let { runCatching { Instant.parse(it) }.getOrNull() }?.atZone(Wib.ZONA)?.let { "%02d:%02d".format(it.hour, it.minute) }

/** Milidetik dari [sekarang] ke [lockAtIso]; null bila ISO rusak. */
internal fun sisaMenuju(lockAtIso: String, sekarang: Instant): Long? =
    runCatching { Instant.parse(lockAtIso).toEpochMilli() - sekarang.toEpochMilli() }.getOrNull()

/** Centang dari payload entri tertunda terbaru (status, progres, subtask; narasi tetap). */
internal fun centangEntri(r: EntriSimpanRequest, selesai: Boolean): EntriSimpanRequest = r.copy(
    status = if (selesai) "SELESAI" else "BERJALAN",
    progressPct = if (selesai) 100 else minOf(r.progressPct, 90),
    subtasks = r.subtasks.map { if (selesai) it.copy(isDone = true) else it },
)

/**
 * Tumpangkan pesan antrean (berkunci laporan hari ini proyek ini, FIFO) ke
 * agenda: centang/ubah tertunda, entri luring baru, hapus tertunda.
 */
internal fun tumpangkanAgenda(tugas: List<TugasAgenda>, pesan: List<PesanOutbox>): List<TugasAgenda> {
    if (pesan.isEmpty()) return tugas
    val daftar = tugas.toMutableList()
    fun tandai(a: TugasAgenda, p: PesanOutbox): TugasAgenda = a.copy(
        statusKirim = if (a.statusKirim == StatusKirim.GAGAL || p.status == StatusKirim.GAGAL) StatusKirim.GAGAL else StatusKirim.MENUNGGU,
        galatKirim = p.pesanGalat ?: a.galatKirim,
    )
    fun terapkan(id: String?, p: PesanOutbox, status: String, judul: String) {
        val i = daftar.indexOfFirst { it.id == id }
        if (i < 0) return
        val terkendala = status == "TERKENDALA" || status == "MENUNGGU_KEPUTUSAN"
        daftar[i] = tandai(
            daftar[i].copy(
                judul = judul,
                selesai = status == "SELESAI",
                terkendala = terkendala,
                statusLabel = labelStatusAgenda(status),
            ),
            p,
        )
    }
    for (p in pesan) {
        when (p.jenis) {
            JenisOutbox.UBAH_TUGAS -> runCatching { mkJson.decodeFromString(TaskSaveRequest.serializer(), p.payloadJson) }.getOrNull()
                ?.let { r -> terapkan(r.id, p, r.status, r.title) }
            JenisOutbox.UBAH_ENTRI -> runCatching { mkJson.decodeFromString(EntriSimpanRequest.serializer(), p.payloadJson) }.getOrNull()
                ?.let { r -> terapkan(r.id, p, r.status, r.title) }
            JenisOutbox.TAMBAH_ENTRI -> runCatching { mkJson.decodeFromString(EntriSimpanRequest.serializer(), p.payloadJson) }.getOrNull()
                ?.let { r ->
                    daftar += tandai(
                        TugasAgenda(
                            id = IdLokal.dari(p.id),
                            judul = r.title,
                            meta = r.picName?.takeIf { it.isNotBlank() },
                            jam = r.startTime?.let { m -> r.endTime?.let { "${m.replace(':', '.')}–${it.replace(':', '.')}" } ?: "mulai ${m.replace(':', '.')}" },
                            selesai = r.status == "SELESAI",
                            terkendala = r.status == "TERKENDALA" || r.status == "MENUNGGU_KEPUTUSAN",
                            statusLabel = labelStatusAgenda(r.status),
                        ),
                        p,
                    )
                }
            JenisOutbox.HAPUS_ENTRI -> runCatching { mkJson.decodeFromString(PayloadHapusEntri.serializer(), p.payloadJson) }.getOrNull()
                ?.let { r ->
                    val i = daftar.indexOfFirst { it.id == r.id }
                    if (i >= 0) {
                        if (p.status == StatusKirim.GAGAL) daftar[i] = tandai(daftar[i], p) else daftar.removeAt(i)
                    }
                }
        }
    }
    return daftar
}

private fun labelStatusAgenda(status: String): String = when (status) {
    "MENUNGGU_KEPUTUSAN" -> "Menunggu keputusan"
    "TERKENDALA" -> "Terkendala"
    else -> ""
}
