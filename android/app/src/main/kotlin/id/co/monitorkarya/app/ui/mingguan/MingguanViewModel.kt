// Layar Capaian mingguan Kepala Divisi (T6-C5 Fase 2). Padanan web:
// src/components/views/weekly-input-view.tsx → DivisionWeeklyDesk, rute
// src/app/api/weekly-input/route.ts (GET/PUT/PATCH/DELETE/POST), aturan kunci
// src/lib/lock.ts (weeklyDeadlines: serah Kamis 17.00 WIB, kunci Jumat 17.00).
//
// Alur status laporan: DRAFT --serahkan--> MENUNGGU_PERSETUJUAN --setujui-->
// DISETUJUI --(Admin PT meneruskan)--> beku. Menyunting butir menarik laporan
// kembali ke draf (backToDraft route); papan Android hanya membuka tulisan pada
// DRAFT supaya tidak ada penarikan diam-diam sebelum disetujui. 409 {error,
// locked, frozen, reason} = beku/terkunci → pesan + tombol "Ajukan buka kunci"
// (reportId diambil dari laporan termuat; alurnya dipegang layar lain).
//
// Luring (A1-LURING.md §6): simpan/hapus butir, serahkan, dan setujui yang
// gagal karena JARINGAN (bukan jawaban server) masuk outbox berkunci
// "mingguan:<divisi>:<minggu>" dengan minggu sasaran dipaku (week=kunciMinggu)
// supaya tidak tertulis ke minggu berikutnya bila terkirim setelah pergantian
// minggu; 409/422 dari server tetap tampil seketika seperti sebelumnya.
// Urutan kartu (pindah) TIDAK diantre: posisi dihitung dari potret papan saat
// itu dan basi bila papan berubah — gagal = kembalikan + banner.
//
// Jaringan: WeeklyInputApi + DTO T6-C1 (core/network). Saat tugas ini jalan
// T6-C1 belum menyediakan module Hilt-nya, jadi MingguanModule di bawah
// menyediakan antarmuka itu dari Retrofit tunggal AppModule — hapus saat
// penyedianya sudah ada (pola yang sama dengan T5-B5, lihat
// docs/fase2/T6-C5-LAPORAN.md).
//
// G1 (keputusan pemilik 13 Okt 2026): Sheet butir yang ditutup (Papan/geser/
// Kembali) atau ditinggal proses mati dengan perubahan belum tersimpan →
// draf otomatis per (uid, butir / butir baru divisi, minggu), dipulihkan saat
// dibuka lagi dengan penanda "Draf dipulihkan" + "Buang draf"; tanpa dialog.
package id.co.monitorkarya.app.ui.mingguan

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import id.co.monitorkarya.app.ui.draf.PESAN_DRAF_TERSIMPAN
import id.co.monitorkarya.app.ui.draf.PencatatDraf
import id.co.monitorkarya.core.data.outbox.AntreanOutbox
import id.co.monitorkarya.core.data.repo.DrafSunting
import id.co.monitorkarya.core.data.sync.JenisOutbox
import id.co.monitorkarya.core.data.sync.KunciOutbox
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.app.ui.laporan.GalatBerkas
import id.co.monitorkarya.app.ui.laporan.PenyiapBukti
import id.co.monitorkarya.core.network.Idempotensi
import id.co.monitorkarya.core.network.api.EvidenceApi
import id.co.monitorkarya.core.network.api.WeeklyInputApi
import id.co.monitorkarya.core.network.dto.WeeklyAksiRequest
import id.co.monitorkarya.core.network.dto.WeeklyDivisiDto
import id.co.monitorkarya.core.network.dto.WeeklyInputResponse
import id.co.monitorkarya.core.network.dto.WeeklyItemDto
import id.co.monitorkarya.core.network.dto.WeeklyPekanDto
import id.co.monitorkarya.core.network.dto.WeeklyReportHeadDto
import id.co.monitorkarya.core.network.dto.WeeklyItemSaveRequest
import id.co.monitorkarya.core.network.dto.WeeklySubtaskInputDto
import id.co.monitorkarya.core.network.dto.WeeklyMoveDto
import id.co.monitorkarya.core.network.dto.WeeklyMovesRequest
import id.co.monitorkarya.designsystem.components.MkStatus
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import retrofit2.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

// ------------------------------------------------------------------
// Model tampilan
// ------------------------------------------------------------------

/** Pilihan aspek/prioritas dari GET (aspects/priorities root). */
data class OpsiPilihan(val id: String, val label: String)

/**
 * Satu butir capaian mingguan (subset WeeklyItemDto yang dipakai papan).
 * [hariKerjaKunci] kunci "YYYY-MM-DD" WIB lajur papan web (null = lajur
 * Mingguan) — dikirim balik saat menyusun ulang agar kartu tidak pindah lajur.
 */
data class ButirMingguan(
    val id: String,
    val pekerjaan: String,
    val target: String,
    val picNama: String,
    val picJabatan: String,
    val aspekId: String,
    val aspekNama: String,
    val prioritasId: String,
    val prioritasNama: String,
    val status: String,
    val progres: Int,
    val capaian: String,
    val kendala: String?,
    val tindakLanjut: String?,
    val hariKerjaIso: String?,
    val hariKerjaKunci: String?,
    val posisi: Int,
    val jumlahBukti: Int,
    val dibuatIso: String,
    /** Tag butir — dikirim balik saat menyimpan (rute mengganti daftar, bukan menambah). */
    val tanda: List<String> = emptyList(),
    /** Subtask butir — idem [tanda]; Android belum menyuntingnya, hanya mempertahankan. */
    val subtasks: List<SubtaskButir> = emptyList(),
    /**
     * Bukti nyata butir (baris Evidence WEEKLY_ITEM dari GET). [jumlahBukti] =
     * ukuran daftar ini — server memvalidasi serah/setujui dari baris nyata,
     * bukan cache evidenceCount (E2E-1 #2).
     */
    val bukti: List<BuktiButir> = emptyList(),
)

/** Satu lampiran bukti butir mingguan. */
data class BuktiButir(val id: String, val nama: String, val mime: String, val ukuran: Int)

/** Status butir yang mewajibkan minimal 1 bukti (weeklyRequiresEvidence lock.ts). */
internal fun butirWajibBukti(status: String): Boolean = status !in setOf("BELUM_MULAI", "NA")

/** Butir yang akan ditolak serah/setujui karena belum berbukti. */
internal fun butirTanpaBukti(butir: List<ButirMingguan>): List<ButirMingguan> =
    butir.filter { butirWajibBukti(it.status) && it.jumlahBukti < 1 }

/** Subtask butir yang dipertahankan saat menyunting dari Android. */
data class SubtaskButir(val judul: String, val selesai: Boolean)

/** Laporan mingguan satu divisi beserta butirnya (urut posisi, lalu dibuat). */
data class LaporanMingguan(
    val id: String,
    val statusHeader: String,
    val diserahkanIso: String?,
    val disetujuiIso: String?,
    val butir: List<ButirMingguan>,
)

/** Satu divisi yang dipimpin akun ini beserta laporan minggu berjalannya. */
data class DivisiMingguan(
    val id: String,
    val nama: String,
    val tipe: String,
    val kepalaNama: String?,
    /** writable — boleh ditulis sekarang; kalau tidak, [alasanKunci] menjelaskan. */
    val bisaTulis: Boolean,
    val alasanKunci: String?,
    /** Laporan sudah diteruskan Admin PT → dibekukan. */
    val beku: Boolean,
    val bukaSampaiIso: String?,
    val laporan: LaporanMingguan?,
)

/** Meja capaian mingguan hasil GET /api/weekly-input (minggu berjalan). */
data class PapanMingguan(
    val mingguKe: Int,
    val kunciMinggu: String,
    val mulaiIso: String,
    val selesaiIso: String,
    val serahIso: String?,
    val kunciIso: String?,
    /** Kalimat tenggat serah + hitung mundur sederhana ("Serah paling lambat …"). */
    val teksSerah: String,
    /** canApprove — akun boleh menyetujui laporan yang menunggu. */
    val bisaSetujui: Boolean,
    val divisi: List<DivisiMingguan>,
    val aspek: List<OpsiPilihan>,
    val prioritas: List<OpsiPilihan>,
    /**
     * D1: PT yang boleh dilaporkan (`entities`). TI/Super Admin (peran master,
     * [entitasTerpaku] = false) memilih PT seperti DivisionWeeklyDesk web;
     * peran berlingkup terpaku pada PT-nya.
     */
    val entitas: List<OpsiPilihan> = emptyList(),
    /** PT yang sedang ditampilkan server (`entityId`). */
    val entitasId: String? = null,
    val entitasTerpaku: Boolean = true,
)

/** Isian ButirSheet yang dikirim layar ke ViewModel. */
data class IsianButir(
    val aspekId: String,
    val prioritasId: String,
    val pekerjaan: String,
    val target: String,
    val picNama: String,
    val status: String,
    val progres: Int,
    val capaian: String,
    val kendala: String,
    val tindakLanjut: String,
)

/**
 * Sheet yang terbuka: [butir] null = menambah butir baru. [keBukti] = Sheet
 * dibuka dari tautan "Lampirkan bukti" — langsung gulir ke bagian Bukti
 * (E2E-R2 N6). G1: [draf] = isian draf otomatis yang dipulihkan (penanda
 * "Draf dipulihkan"), [drafPada] = kapan draf itu disimpan (epoch millis).
 */
data class SheetButir(
    val divisiId: String,
    val butir: ButirMingguan?,
    val keBukti: Boolean = false,
    val draf: IsianButir? = null,
    val drafPada: Long? = null,
)

/** Galat aksi tingkat layar (serah/setujui/pindah/hapus) — ditampilkan sebagai banner. */
sealed interface GalatAksi {
    /** 409 — laporan beku/terkunci; [reportId] untuk tombol "Ajukan buka kunci". */
    data class Beku(val pesan: String, val reportId: String?) : GalatAksi

    /** 422 — validasi serah (daftar masalah per butir). */
    data class Validasi(val pesan: String, val medan: List<String>) : GalatAksi

    data class Umum(val pesan: String) : GalatAksi
}

/** Galat PUT di dalam ButirSheet — sheet tetap terbuka. */
sealed interface GalatSheet {
    data class Beku(val pesan: String, val reportId: String?) : GalatSheet
    data class Validasi(val pesan: String, val medan: List<String>) : GalatSheet
    data class Umum(val pesan: String) : GalatSheet
}

/** Notifikasi satu-kali (snackbar). */
data class NotifikasiMingguan(val id: Long, val pesan: String)

/** Status UI layar: Memuat → Sukses(papan) atau Galat(pesan). */
sealed interface MingguanUiState {
    data object Memuat : MingguanUiState
    data class Sukses(val papan: PapanMingguan) : MingguanUiState
    data class Galat(val pesan: String) : MingguanUiState
}

/** Arah pindah urutan butir. */
enum class ArahPindah { NAIK, TURUN }

// ------------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------------

@HiltViewModel
class MingguanViewModel @Inject constructor(
    private val api: WeeklyInputApi,
    private val antrean: AntreanOutbox,
    private val evidenceApi: EvidenceApi,
    private val penyiap: PenyiapBukti,
    draf: DrafSunting,
) : ViewModel() {

    /** G1: draf otomatis Sheet butir (antrean tulis berurutan + jeda saat mengetik). */
    private val pencatat = PencatatDraf(viewModelScope, draf)

    /** Isian terakhir Sheet yang terbuka (dilaporkan layar); null = belum berubah. */
    private var isianKini: IsianButir? = null

    private val _buktiSibuk = MutableStateFlow<String?>(null)

    /** "unggah" selama unggahan berjalan, atau id bukti yang sedang dihapus. */
    val buktiSibuk: StateFlow<String?> = _buktiSibuk.asStateFlow()

    private val _state = MutableStateFlow<MingguanUiState>(MingguanUiState.Memuat)

    /** Status layar papan capaian minggu berjalan. */
    val state: StateFlow<MingguanUiState> = _state.asStateFlow()

    private val _divisiTerpilih = MutableStateFlow<String?>(null)

    /** PT pilihan TI/Super Admin untuk GET ?entityId= (null = bawaan server: PT pertama). */
    private var entitasTerpilih: String? = null
    private var jobMuat: Job? = null

    /** Id divisi yang papannya ditampilkan (bawaan divisi pertama). */
    val divisiTerpilih: StateFlow<String?> = _divisiTerpilih.asStateFlow()

    private val _sheet = MutableStateFlow<SheetButir?>(null)

    /** ButirSheet terbuka (butir null = tambah baru); null = papan. */
    val sheet: StateFlow<SheetButir?> = _sheet.asStateFlow()

    private val _galatAksi = MutableStateFlow<GalatAksi?>(null)

    /** Galat aksi terakhir di luar sheet — banner di atas footer. */
    val galatAksi: StateFlow<GalatAksi?> = _galatAksi.asStateFlow()

    private val _galatSheet = MutableStateFlow<GalatSheet?>(null)

    /** Galat PUT terakhir, ditampilkan di dalam ButirSheet. */
    val galatSheet: StateFlow<GalatSheet?> = _galatSheet.asStateFlow()

    private val _sibuk = MutableStateFlow(false)

    /** Sedang ada permintaan berjalan — tombol dinonaktifkan. */
    val sibuk: StateFlow<Boolean> = _sibuk.asStateFlow()

    private val _notifikasi = MutableStateFlow<NotifikasiMingguan?>(null)

    /** Snackbar satu-kali. */
    val notifikasi: StateFlow<NotifikasiMingguan?> = _notifikasi.asStateFlow()

    private val _versiForm = MutableStateFlow(0)

    /**
     * Naik setiap muat ulang berhasil — ButirSheet mengikat ulang isian dari
     * butir termuat sehingga penanda "kotor" ikut reset (mis. usai 409 beku).
     */
    val versiForm: StateFlow<Int> = _versiForm.asStateFlow()

    init {
        muat()
    }

    /** Menarik meja minggu berjalan; status kembali ke Memuat agar layar menampilkan kerangka. */
    fun muat() {
        // Pilihan PT beruntun: hanya muat terakhir yang boleh terbit.
        jobMuat?.cancel()
        jobMuat = viewModelScope.launch {
            _state.value = MingguanUiState.Memuat
            muatInternal()
        }
    }

    /**
     * PT yang dilaporkan (TI/Super Admin, web DivisionWeeklyDesk "Entitas yang
     * dilaporkan"). Ganti PT = divisi kembali ke divisi pertama PT itu.
     */
    fun pilihEntitas(id: String) {
        val papan = (_state.value as? MingguanUiState.Sukses)?.papan
        if (papan?.entitasTerpaku == true || id == (entitasTerpilih ?: papan?.entitasId)) return
        entitasTerpilih = id
        _divisiTerpilih.value = null
        _galatAksi.value = null
        muat()
    }

    fun ulang() = muat()

    /** Divisi yang dipilih kepala divisi (GET membawa semua divisi yang dipimpin). */
    fun pilihDivisi(id: String) {
        _divisiTerpilih.value = id
        _galatAksi.value = null
    }

    /** Membuka ButirSheet untuk menambah butir pada divisi terpilih. */
    fun bukaTambah() {
        val divisi = divisiTerpilihSekarang() ?: return
        bukaDenganDraf(SheetButir(divisiId = divisi.id, butir = null), bolehSuntingButir(divisi))
    }

    /** Membuka ButirSheet untuk mengubah/membaca satu butir. */
    fun bukaUbah(butirId: String) = bukaUbah(butirId, keBukti = false)

    /** Tautan "Lampirkan bukti · {butir}": Sheet butir terbuka di bagian Bukti. */
    fun bukaBukti(butirId: String) = bukaUbah(butirId, keBukti = true)

    private fun bukaUbah(butirId: String, keBukti: Boolean) {
        val divisi = divisiTerpilihSekarang() ?: return
        val butir = divisi.laporan?.butir?.firstOrNull { it.id == butirId } ?: return
        bukaDenganDraf(SheetButir(divisiId = divisi.id, butir = butir, keBukti = keBukti), bolehSuntingButir(divisi))
    }

    /** G1: baca draf Sheet ini (bila papan bisa ditulis) lalu buka Sheet dengan draf terpasang. */
    private fun bukaDenganDraf(buka: SheetButir, bolehSunting: Boolean) {
        val minggu = papanSekarang()?.kunciMinggu
        isianKini = null
        _galatSheet.value = null
        if (minggu == null || !bolehSunting) {
            _sheet.value = buka
            return
        }
        viewModelScope.launch {
            val draf = pencatat.ambil(kunciDrafButir(buka.divisiId, buka.butir, minggu))
            val isian = drafButirUntuk(draf, buka.butir)
            isianKini = isian
            _sheet.value = buka.copy(draf = isian, drafPada = draf?.disimpanPada?.takeIf { isian != null })
        }
    }

    /** Layar melaporkan isian Sheet setiap berubah — dicatat sebagai draf setelah jeda. */
    fun catatIsian(isian: IsianButir) {
        isianKini = isian
        kunciDrafSheet()?.let { (kunci, buka, boleh) -> pencatat.catat(kunci, isiDrafButir(isian, buka.butir, boleh)) }
    }

    /** "Buang draf": Sheet kembali ke isian tersimpan, draf dihapus. */
    fun buangDraf() {
        val buka = _sheet.value ?: return
        isianKini = null
        _sheet.value = buka.copy(draf = null, drafPada = null)
        kunciDrafSheet()?.let { (kunci, _, _) -> pencatat.segera(kunci, null) }
    }

    /**
     * Tutup Sheet (Papan/geser/Kembali). G1: perubahan belum tersimpan tidak
     * dibuang dan tanpa dialog — ditulis sebagai draf otomatis.
     */
    fun tutupSheet() {
        val isian = isianKini
        val alamat = kunciDrafSheet()
        tutupTanpaDraf()
        if (alamat != null) {
            val (kunci, buka, boleh) = alamat
            val json = isian?.let { isiDrafButir(it, buka.butir, boleh) }
            pencatat.segera(kunci, json)
            if (json != null) _notifikasi.value = NotifikasiMingguan(System.nanoTime(), PESAN_DRAF_TERSIMPAN)
        }
    }

    /** Tutup setelah simpan/hapus sukses atau diantre — draf Sheet itu dibuang. */
    private fun tutupDanBuangDraf() {
        kunciDrafSheet()?.let { (kunci, _, _) -> pencatat.segera(kunci, null) }
        tutupTanpaDraf()
    }

    private fun tutupTanpaDraf() {
        isianKini = null
        _sheet.value = null
        _galatSheet.value = null
    }

    /** (kunci draf, Sheet, boleh sunting) untuk Sheet yang terbuka; null bila papan belum termuat. */
    private fun kunciDrafSheet(): Triple<id.co.monitorkarya.core.data.repo.KunciDraf, SheetButir, Boolean>? {
        val buka = _sheet.value ?: return null
        val papan = papanSekarang() ?: return null
        val divisi = papan.divisi.firstOrNull { it.id == buka.divisiId } ?: return null
        return Triple(kunciDrafButir(buka.divisiId, buka.butir, papan.kunciMinggu), buka, bolehSuntingButir(divisi))
    }

    /** Snackbar sudah tampil — bersihkan agar tidak berulang. */
    fun notifikasiTampil() {
        _notifikasi.value = null
    }

    /** Banner galat aksi ditutup pengguna. */
    fun galatAksiTampil() {
        _galatAksi.value = null
    }

    /**
     * PUT /api/weekly-input — tambah/ubah butir. Sukses: snackbar + muat ulang
     * + sheet ditutup. 422 tetap membuka sheet (galat field); 409 beku memuat
     * ulang papan tapi membiarkan pesan terbaca di sheet.
     */
    fun simpanButir(isian: IsianButir) {
        val buka = _sheet.value ?: return
        // C3-S7: pagar klik ganda — ketukan kedua sebelum tombol nonaktif tidak
        // boleh membuat butir kembar. Ditandai sinkron sebelum launch.
        if (_sibuk.value) return
        _sibuk.value = true
        viewModelScope.launch {
            _galatSheet.value = null
            val permintaan = WeeklyItemSaveRequest(
                divisionId = buka.divisiId,
                itemId = buka.butir?.id,
                workItem = isian.pekerjaan,
                targetOutput = isian.target,
                picName = isian.picNama,
                picTitle = isian.picNama.takeIf { it.isNotBlank() },
                status = isian.status,
                achievementThisWeek = isian.capaian,
                obstacleFollowUp = isian.kendala.trim().ifEmpty { null },
                followUp = isian.tindakLanjut.trim().ifEmpty { null },
                progressPct = isian.progres.coerceIn(0, 100),
                aspectCategoryId = isian.aspekId,
                priorityId = isian.prioritasId,
                // Rute MENGGANTI tags dan daftar subtask dengan yang dikirim
                // (array hilang dibaca kosong) — kirim balik yang termuat
                // supaya suntingan Android tidak menghapus keduanya.
                tags = buka.butir?.tanda ?: emptyList(),
                subtasks = buka.butir?.subtasks?.map {
                    WeeklySubtaskInputDto(title = it.judul, isDone = it.selesai)
                } ?: emptyList(),
            )
            try {
                val res = api.simpanButir(permintaan)
                if (res.isSuccessful) {
                    val idBaru = res.body()?.itemId.takeIf { buka.butir == null }
                    tutupDanBuangDraf()
                    muatInternal()
                    // E2E-1 #2: butir baru → Sheet dibuka lagi pada butir tersimpan
                    // supaya bukti bisa langsung dilampirkan (pola entri PIC).
                    val baru = idBaru?.let { id ->
                        divisiTerpilihSekarang()?.laporan?.butir?.firstOrNull { it.id == id }
                    }
                    if (baru != null) {
                        _sheet.value = SheetButir(divisiId = buka.divisiId, butir = baru)
                        _notifikasi.value = NotifikasiMingguan(
                            System.nanoTime(),
                            if (butirWajibBukti(baru.status)) "Butir tersimpan. Lampirkan bukti pendukung." else "Butir tersimpan",
                        )
                    } else {
                        _notifikasi.value = NotifikasiMingguan(System.nanoTime(), "Butir tersimpan")
                    }
                } else {
                    _galatSheet.value = petakanGalatSheet(res)
                    // 409: laporan barusan dibekukan/dikunci — muat ulang agar
                    // papan ikut terkunci (padanan perilaku web saat res.status === 409).
                    if (_galatSheet.value is GalatSheet.Beku) muat()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val papan = papanSekarang()
                val label = (if (buka.butir == null) "Tambah butir" else "Ubah butir") +
                    " \"${isian.pekerjaan.trim().take(LABEL_MAKS)}\""
                val diantre = luring(e) && papan != null && antreMingguan(
                    jenis = JenisOutbox.SIMPAN_BUTIR_MINGGUAN,
                    serializer = WeeklyItemSaveRequest.serializer(),
                    payload = permintaan.copy(week = papan.kunciMinggu),
                    divisiId = buka.divisiId,
                    label = "$label · minggu ${papan.mingguKe}",
                )
                if (diantre) tutupDanBuangDraf() else _galatSheet.value = GalatSheet.Umum(ApiError.dari(e).pesanTampil())
            } finally {
                _sibuk.value = false
            }
        }
    }

    /** DELETE ?itemId= — butir (beserta lampiran) dihapus dari laporan. */
    fun hapusButir(butirId: String) {
        val divisi = divisiTerpilihSekarang()
        val nama = divisi?.laporan?.butir?.firstOrNull { it.id == butirId }?.pekerjaan.orEmpty()
        if (_sibuk.value) return // C3-S7: hapus kedua kali = 404 palsu
        _sibuk.value = true
        viewModelScope.launch {
            try {
                val res = api.hapusButir(butirId)
                if (res.isSuccessful) {
                    _notifikasi.value = NotifikasiMingguan(System.nanoTime(), "Butir dihapus")
                    tutupDanBuangDraf()
                    muatInternal()
                } else {
                    _galatAksi.value = petakanGalatAksi(res)
                    if (_galatAksi.value is GalatAksi.Beku) muat()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val papan = papanSekarang()
                val diantre = luring(e) && papan != null && divisi != null && antre(
                    jenis = JenisOutbox.HAPUS_BUTIR_MINGGUAN,
                    payloadJson = buildJsonObject { put("itemId", butirId) }.toString(),
                    kunci = KunciOutbox.mingguan(divisi.id, papan.kunciMinggu),
                    label = "Hapus butir \"${nama.take(LABEL_MAKS)}\" · minggu ${papan.mingguKe}",
                )
                if (diantre) tutupDanBuangDraf() else _galatAksi.value = GalatAksi.Umum(ApiError.dari(e).pesanTampil())
            } finally {
                _sibuk.value = false
            }
        }
    }

    /**
     * Naik/turunkan satu butir di kolomnya. Papan web berlaju per hari, papan
     * Android per status, jadi tukar posisi hanya dengan tetangga SELAJUR
     * (hari kerja sama) di kolom yang sama — urutan lajur server tetap kaku.
     * Optimistik: daftar lokal diperbarui lebih dulu, PATCH menyusul; gagal →
     * muat ulang + banner.
     */
    fun pindah(butirId: String, arah: ArahPindah) {
        val sukses = _state.value as? MingguanUiState.Sukses ?: return
        val divisi = divisiTerpilihSekarang(sukses) ?: return
        val laporan = divisi.laporan ?: return
        val semua = laporan.butir
        val diklik = semua.firstOrNull { it.id == butirId } ?: return
        val kolom = semua.filter { kolomStatus(it.status) == kolomStatus(diklik.status) }
        val indeks = kolom.indexOfFirst { it.id == butirId }
        if (indeks < 0) return
        val tetanggaIdx = (if (arah == ArahPindah.NAIK) indeks - 1 downTo 0 else indeks + 1 until kolom.size)
            .firstOrNull { kolom[it].hariKerjaKunci == kolom[indeks].hariKerjaKunci }
            ?: return
        val tetangga = kolom[tetanggaIdx]

        // Tukar urutan dua butir di salinan papan (optimistik).
        perbaruiDivisi(
            sukses,
            divisi.copy(laporan = laporan.copy(butir = tukarUrutan(laporan.butir, butirId, tetangga.id))),
        )

        viewModelScope.launch {
            try {
                val res = api.pindahkanButir(
                    WeeklyMovesRequest(
                        divisionId = divisi.id,
                        moves = listOf(
                            WeeklyMoveDto(
                                itemId = butirId,
                                workDate = diklik.hariKerjaKunci,
                                position = tetangga.posisi,
                            ),
                            WeeklyMoveDto(
                                itemId = tetangga.id,
                                workDate = tetangga.hariKerjaKunci,
                                position = diklik.posisi,
                            ),
                        ),
                    ),
                )
                if (!res.isSuccessful) {
                    _galatAksi.value = petakanGalatAksi(res)
                    muat()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _galatAksi.value = GalatAksi.Umum(ApiError.dari(e).pesanTampil())
                muat()
            }
        }
    }

    /**
     * Unggah bukti ke butir [butirId] (POST /api/evidence/upload, targetType
     * WEEKLY_ITEM). Foto dikompres sama dengan laporan PIC (PenyiapBukti: sisi
     * ≤2048 px, JPEG 85, ≤20 MB). Hanya daring: bukti tidak diantre luring.
     * Muat ulang TIDAK menaikkan versiForm — isian Sheet yang belum disimpan tetap.
     */
    fun unggahBukti(butirId: String, uri: Uri) {
        if (_buktiSibuk.value != null) return
        _buktiSibuk.value = UNGGAH
        _galatSheet.value = null
        viewModelScope.launch {
            try {
                val berkas = try {
                    penyiap.siapkan(uri)
                } catch (e: GalatBerkas) {
                    _galatSheet.value = GalatSheet.Umum(e.message.orEmpty())
                    return@launch
                }
                val teks = "text/plain".toMediaType()
                val res = evidenceApi.unggah(
                    berkas = MultipartBody.Part.createFormData("file", berkas.nama, berkas.isi.toRequestBody(berkas.mime.toMediaType())),
                    targetType = TARGET_BUKTI.toRequestBody(teks),
                    targetId = butirId.toRequestBody(teks),
                    kunciIdempotensi = Idempotensi.kunciBaru(),
                )
                if (res.isSuccessful) {
                    _notifikasi.value = NotifikasiMingguan(System.nanoTime(), "Bukti terlampir")
                    muatInternal(naikkanVersi = false)
                } else {
                    _galatSheet.value = petakanGalatSheet(res)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _galatSheet.value = GalatSheet.Umum(
                    if (luring(e)) PESAN_BUKTI_LURING else ApiError.dari(e).pesanTampil(),
                )
            } finally {
                _buktiSibuk.value = null
            }
        }
    }

    /** DELETE /api/evidence/{id} — konfirmasi di layar (aturan: konfirmasi untuk hapus). */
    fun hapusBukti(buktiId: String) {
        if (_buktiSibuk.value != null) return
        _buktiSibuk.value = buktiId
        _galatSheet.value = null
        viewModelScope.launch {
            try {
                val res = evidenceApi.hapus(buktiId)
                if (res.isSuccessful) {
                    _notifikasi.value = NotifikasiMingguan(System.nanoTime(), "Bukti dihapus")
                    muatInternal(naikkanVersi = false)
                } else {
                    _galatSheet.value = petakanGalatSheet(res)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _galatSheet.value = GalatSheet.Umum(
                    if (luring(e)) PESAN_BUKTI_LURING else ApiError.dari(e).pesanTampil(),
                )
            } finally {
                _buktiSibuk.value = null
            }
        }
    }

    /** Tautan buka bukti (GET /api/evidence/{id}: tautan luar atau URL bertanda 5 menit). */
    suspend fun urlBukti(buktiId: String): String? = try {
        evidenceApi.buka(buktiId).body()?.url
    } catch (e: CancellationException) {
        throw e
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
        _galatSheet.value = GalatSheet.Umum(ApiError.dari(e).pesanTampil())
        null
    }

    /**
     * "Simpan draf" (footer): setiap butir tersimpan saat diedit, jadi aksi ini
     * menutup suntingan yang terbuka, menarik ulang draf dari server (menyerap
     * perubahan bersamaan), lalu memastikan pengguna lewat snackbar.
     */
    fun simpanDraf() {
        viewModelScope.launch {
            tutupSheet()
            muatInternal()
            _notifikasi.value = NotifikasiMingguan(System.nanoTime(), "Semua perubahan butir tersimpan")
        }
    }

    /** POST action "submit" — serahkan laporan draf kepada Admin PT. */
    fun serahkan() {
        val divisi = divisiTerpilihSekarang() ?: return
        aksiLaporan(
            WeeklyAksiRequest.serahkan(divisi.id),
            suksesPesan = "Laporan diserahkan ke Admin PT",
            labelAntre = "Serahkan capaian · ${divisi.nama}",
        )
    }

    /** POST action "approve" — setujui laporan yang menunggu persetujuan. */
    fun setujui() {
        val divisi = divisiTerpilihSekarang() ?: return
        aksiLaporan(
            WeeklyAksiRequest.setujui(divisi.id),
            suksesPesan = "Laporan disetujui",
            labelAntre = "Setujui capaian · ${divisi.nama}",
        )
    }

    /** POST /api/weekly-input (submit/approve) — status laporan berubah, muat ulang. */
    private fun aksiLaporan(badan: WeeklyAksiRequest, suksesPesan: String, labelAntre: String) {
        if (_sibuk.value) return // C3-S7: serah/setujui kedua kali = 409 palsu
        _sibuk.value = true
        viewModelScope.launch {
            _galatAksi.value = null
            try {
                val res = api.aksi(badan)
                if (res.isSuccessful) {
                    _notifikasi.value = NotifikasiMingguan(System.nanoTime(), suksesPesan)
                    muatInternal()
                } else {
                    _galatAksi.value = petakanGalatAksi(res)
                    // Status laporan bisa berubah di luar layar ini — muat ulang
                    // agar tombol kontekstual mengikuti keadaan sebenarnya.
                    muat()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val papan = papanSekarang()
                val diantre = luring(e) && papan != null && antreMingguan(
                    jenis = JenisOutbox.AKSI_MINGGUAN,
                    serializer = WeeklyAksiRequest.serializer(),
                    payload = badan.copy(week = papan.kunciMinggu),
                    divisiId = badan.divisionId,
                    label = "$labelAntre · minggu ${papan.mingguKe}",
                )
                if (!diantre) _galatAksi.value = GalatAksi.Umum(ApiError.dari(e).pesanTampil())
            } finally {
                _sibuk.value = false
            }
        }
    }

    // ------------------------------------------------------------------
    // Pembantu internal
    // ------------------------------------------------------------------

    /** Menarik meja tanpa mengubah status ke Memuat (dipakai usai aksi). */
    private suspend fun muatInternal(naikkanVersi: Boolean = true) {
        _state.value = try {
            val res = api.papan(entityId = entitasTerpilih)
            if (res.isSuccessful) {
                val papan = papanDari(res.body() ?: WeeklyInputResponse(week = PEKAN_KOSONG))
                entitasTerpilih = entitasSetelahMuat(papan)
                if (_divisiTerpilih.value == null || papan.divisi.none { it.id == _divisiTerpilih.value }) {
                    _divisiTerpilih.value = papan.divisi.firstOrNull()?.id
                }
                if (naikkanVersi) _versiForm.value += 1
                MingguanUiState.Sukses(papan)
            } else {
                MingguanUiState.Galat(ApiError.dari(retrofit2.HttpException(res)).pesanTampil())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            MingguanUiState.Galat(ApiError.dari(e).pesanTampil())
        }
    }

    // ------------------------------------------------------------------
    // Antrean luring
    // ------------------------------------------------------------------

    /** Gagal karena jaringan (tanpa jawaban server) — satu-satunya yang diantre. */
    private fun luring(e: Exception): Boolean = ApiError.dari(e) is ApiError.Jaringan

    private fun papanSekarang(): PapanMingguan? =
        (_state.value as? MingguanUiState.Sukses)?.papan?.takeIf { it.kunciMinggu.isNotBlank() }

    private suspend fun <T> antreMingguan(
        jenis: String,
        serializer: KSerializer<T>,
        payload: T,
        divisiId: String,
        label: String,
    ): Boolean {
        val papan = papanSekarang() ?: return false
        return antre(
            jenis = jenis,
            payloadJson = id.co.monitorkarya.core.network.mkJson.encodeToString(serializer, payload),
            kunci = KunciOutbox.mingguan(divisiId, papan.kunciMinggu),
            label = label,
        )
    }

    /** Masukkan ke outbox + snackbar; false bila penyimpanan lokal gagal. */
    private suspend fun antre(jenis: String, payloadJson: String, kunci: String, label: String): Boolean =
        try {
            antrean.antre(jenis = jenis, payloadJson = payloadJson, kunci = kunci, label = label)
            _notifikasi.value = NotifikasiMingguan(System.nanoTime(), PESAN_DIANTRE)
            true
        } catch (e: CancellationException) {
            throw e
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            false
        }

    private fun divisiTerpilihSekarang(sukses: MingguanUiState.Sukses? = null): DivisiMingguan? {
        val papan = sukses?.papan ?: (_state.value as? MingguanUiState.Sukses)?.papan ?: return null
        val id = _divisiTerpilih.value ?: papan.divisi.firstOrNull()?.id
        return papan.divisi.firstOrNull { it.id == id }
    }

    /** Ganti satu divisi di papan termuat (pembaruan optimistik urutan). */
    private fun perbaruiDivisi(sukses: MingguanUiState.Sukses, baru: DivisiMingguan) {
        _state.value = MingguanUiState.Sukses(
            sukses.papan.copy(divisi = sukses.papan.divisi.map { if (it.id == baru.id) baru else it }),
        )
    }

    /** Menukar posisi dua butir dalam daftar, menjaga urutan lain. */
    private fun tukarUrutan(butir: List<ButirMingguan>, a: String, b: String): List<ButirMingguan> {
        val dari = butir.first { it.id == a }
        val ke = butir.first { it.id == b }
        return butir.map { saat ->
            when (saat.id) {
                a -> ke.copy(posisi = saat.posisi)
                b -> dari.copy(posisi = saat.posisi)
                else -> saat
            }
        }
    }

    /**
     * Response tidak sukses → GalatSheet. 409 dibaca lewat ApiError.Konflik
     * ({error, locked, frozen, reason}); reportId tidak dikirim rute ini,
     * diambil dari laporan divisi yang sedang dibuka.
     */
    private fun petakanGalatSheet(res: Response<*>): GalatSheet {
        val idLaporan = _sheet.value?.let { buka ->
            divisiTerpilihSekarang()?.takeIf { it.id == buka.divisiId }?.laporan?.id
        } ?: divisiTerpilihSekarang()?.laporan?.id
        return when (val galat = ApiError.dari(retrofit2.HttpException(res))) {
            is ApiError.Konflik -> GalatSheet.Beku(galat.pesan, idLaporan)
            is ApiError.Validasi -> GalatSheet.Validasi(galat.pesan, galat.errors)
            else -> GalatSheet.Umum(galat.pesanTampil())
        }
    }

    /** Response tidak sukses → GalatAksi (serah/setujui/pindah/hapus). */
    private fun petakanGalatAksi(res: Response<*>): GalatAksi {
        val idLaporan = divisiTerpilihSekarang()?.laporan?.id
        return when (val galat = ApiError.dari(retrofit2.HttpException(res))) {
            is ApiError.Konflik -> GalatAksi.Beku(galat.pesan, idLaporan)
            is ApiError.Validasi -> GalatAksi.Validasi(galat.pesan, galat.errors)
            else -> GalatAksi.Umum(galat.pesanTampil())
        }
    }
}

// ------------------------------------------------------------------
// Pemetaan DTO (WeeklyInputResponse T6-C1) → model tampilan
// ------------------------------------------------------------------

/** Snackbar saat tulisan masuk antrean luring. */
internal const val PESAN_DIANTRE = "Anda luring. Perubahan disimpan dan dikirim otomatis saat daring."

/** targetType bukti butir mingguan (EVIDENCE_TARGETS evidence-access.ts). */
internal const val TARGET_BUKTI = "WEEKLY_ITEM"

/** Penanda unggahan berjalan di [MingguanViewModel.buktiSibuk]. */
internal const val UNGGAH = "unggah"

/** Unggah/hapus bukti tidak diantre — perlu jawaban server. */
internal const val PESAN_BUKTI_LURING = "Bukti hanya bisa dilampirkan atau dihapus saat daring. Coba lagi setelah tersambung."

/** Panjang maksimum nama butir di label antrean. */
private const val LABEL_MAKS = 60

/** Pekan kosong untuk body null yang tidak seharusnya terjadi. */
private val PEKAN_KOSONG = WeeklyPekanDto(
    key = "",
    isoYear = 0,
    isoWeek = 0,
    start = "",
    end = "",
    handoverBy = "",
    lockAt = "",
)

internal fun papanDari(dto: WeeklyInputResponse): PapanMingguan = PapanMingguan(
    mingguKe = dto.week.isoWeek,
    kunciMinggu = dto.week.key,
    mulaiIso = dto.week.start,
    selesaiIso = dto.week.end,
    serahIso = dto.week.handoverBy.takeIf { it.isNotBlank() },
    kunciIso = dto.week.lockAt.takeIf { it.isNotBlank() },
    teksSerah = teksSerah(dto.week.handoverBy.takeIf { it.isNotBlank() }, dto.week.lockAt.takeIf { it.isNotBlank() }),
    bisaSetujui = dto.canApprove,
    divisi = dto.divisions.map(::divisiDari),
    aspek = dto.aspects.filter { it.isActive }.map { OpsiPilihan(it.id, it.name) }.filter { it.id.isNotBlank() },
    prioritas = dto.priorities.map { OpsiPilihan(it.id, it.name) }.filter { it.id.isNotBlank() },
    entitas = dto.entities.map { OpsiPilihan(it.id, it.name.ifBlank { it.code }) }.filter { it.id.isNotBlank() },
    entitasId = dto.entityId,
    entitasTerpaku = dto.entityPinned,
)

/**
 * PT untuk muat berikutnya (aksi/muat ulang tetap di PT yang sama): peran
 * master memakai PT yang dipilih server; peran terpaku tidak mengirim entityId.
 */
internal fun entitasSetelahMuat(papan: PapanMingguan): String? =
    if (papan.entitasTerpaku) null else papan.entitasId

private fun divisiDari(d: WeeklyDivisiDto): DivisiMingguan =
    DivisiMingguan(
        id = d.id,
        nama = d.name,
        tipe = d.type,
        kepalaNama = d.headName,
        bisaTulis = d.writable,
        alasanKunci = d.lockReason,
        beku = d.frozen,
        bukaSampaiIso = d.unlockUntil,
        laporan = d.report?.let(::laporanDari),
    )

private fun laporanDari(r: WeeklyReportHeadDto): LaporanMingguan =
    LaporanMingguan(
        id = r.id,
        statusHeader = r.statusHeader,
        diserahkanIso = r.submittedAt,
        disetujuiIso = r.approvedAt,
        butir = r.items.map(::butirDari).sortedWith(compareBy({ it.posisi }, { it.dibuatIso })),
    )

private fun butirDari(i: WeeklyItemDto): ButirMingguan = ButirMingguan(
    id = i.id,
    pekerjaan = i.workItem,
    target = i.targetOutput,
    picNama = i.picName,
    picJabatan = i.picTitle,
    aspekId = i.aspectCategoryId,
    aspekNama = i.aspectCategory.name,
    prioritasId = i.priorityId,
    prioritasNama = i.priority.name.ifBlank { i.priority.code },
    status = i.status,
    progres = i.progressPct,
    capaian = i.achievementThisWeek,
    kendala = i.obstacleFollowUp,
    tindakLanjut = i.followUp,
    hariKerjaIso = i.workDate,
    // Server mengirim workDate sebagai ISO datetime (tengah malam WIB sebagai
    // UTC); toleran juga bila suatu saat berupa kunci "YYYY-MM-DD".
    hariKerjaKunci = i.workDate?.let { kunciHari(it) },
    posisi = i.position,
    // Hitungan dari baris bukti nyata (validasi server), bukan cache evidenceCount.
    jumlahBukti = i.evidence.size,
    dibuatIso = i.createdAt,
    tanda = i.tags,
    subtasks = i.subtasks.map { SubtaskButir(judul = it.title, selesai = it.isDone) },
    bukti = i.evidence.map { BuktiButir(id = it.id, nama = it.fileName, mime = it.mime, ukuran = it.size) },
)

/** ISO datetime/kunci tanggal → kunci "YYYY-MM-DD" WIB; null bila tak terbaca. */
internal fun kunciHari(workDate: String): String? =
    cobaIso(workDate)?.atZone(WIB)?.toLocalDate()?.toString() ?: workDate.takeIf { PATRON_KUNCI.matches(it) }

private val PATRON_KUNCI = Regex("""\d{4}-\d{2}-\d{2}""")

// ------------------------------------------------------------------
// Kosakata status & waktu (dipakai layar)
// ------------------------------------------------------------------

/** Zona waktu tampilan — laporan hidup di WIB. */
internal val WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val NAMA_HARI = mapOf(
    DayOfWeek.MONDAY to "Senin",
    DayOfWeek.TUESDAY to "Selasa",
    DayOfWeek.WEDNESDAY to "Rabu",
    DayOfWeek.THURSDAY to "Kamis",
    DayOfWeek.FRIDAY to "Jumat",
    DayOfWeek.SATURDAY to "Sabtu",
    DayOfWeek.SUNDAY to "Minggu",
)

/** Singkatan hari untuk meta kartu berhari. */
internal fun singkatanHari(iso: String?): String? {
    val hari = cobaIso(iso)?.atZone(WIB)?.dayOfWeek ?: return null
    return when (hari) {
        DayOfWeek.MONDAY -> "Sen"
        DayOfWeek.TUESDAY -> "Sel"
        DayOfWeek.WEDNESDAY -> "Rab"
        DayOfWeek.THURSDAY -> "Kam"
        DayOfWeek.FRIDAY -> "Jum"
        DayOfWeek.SATURDAY -> "Sab"
        DayOfWeek.SUNDAY -> "Min"
    }
}

/** ISO → Instant; null bila rusak. */
internal fun cobaIso(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** "HH.mm" WIB dari ISO; null bila ISO rusak. */
private val formatJam = DateTimeFormatter.ofPattern("HH.mm").withZone(WIB)

internal fun jamWib(iso: String?): String? = cobaIso(iso)?.let { formatJam.format(it) }

/** "5–11 Oktober 2026" (atau "28 Sep–4 Okt 2026" bila lintas bulan). */
internal fun rentangMingguan(mulaiIso: String?, selesaiIso: String?): String? {
    val mulai = cobaIso(mulaiIso)?.atZone(WIB)?.toLocalDate() ?: return null
    val selesai = cobaIso(selesaiIso)?.atZone(WIB)?.toLocalDate() ?: return null
    val panjang = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("id-ID"))
    val pendek = DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("id-ID"))
    return if (mulai.month == selesai.month) {
        "${mulai.dayOfMonth}–${panjang.format(selesai)}"
    } else {
        "${pendek.format(mulai)}–${pendek.format(selesai)} ${selesai.year}"
    }
}

/** "3 hari", "3 hari 5 jam", "5 jam", "5 jam 20 menit", "20 menit"; null bila sudah lewat. */
internal fun hitungSisa(target: Instant?, dari: Instant = Instant.now()): String? {
    val t = target ?: return null
    val sisa = Duration.between(dari, t)
    if (sisa.isNegative || sisa.isZero) return null
    val hari = sisa.toDays()
    val jam = sisa.toHours() % 24
    val menit = sisa.toMinutes() % 60
    return buildString {
        if (hari > 0) append("$hari hari")
        if (jam > 0) {
            if (isNotEmpty()) append(' ')
            append("$jam jam")
        }
        if (hari == 0L && jam == 0L && menit > 0) append("$menit menit")
        if (isEmpty()) append("kurang dari 1 menit")
    }
}

/**
 * Kalimat tenggat serah (padanan web "Serahkan paling lambat Kamis … minggu
 * dikunci Jumat …") + hitung mundur sederhana — dihitung sekali saat memuat.
 */
internal fun teksSerah(serahIso: String?, kunciIso: String?): String {
    val sekarang = Instant.now()
    val serah = cobaIso(serahIso)
    val kunci = cobaIso(kunciIso)
    // Tanpa handoverBy dari server: jangan menebak jam (aturan pelaporan per PT).
    if (serah == null) return "Tenggat serah mengikuti aturan pelaporan PT"
    val hariSerah = NAMA_HARI[serah.atZone(WIB).dayOfWeek] ?: "Kamis"
    val jamSerah = formatJam.format(serah)
    if (sekarang.isBefore(serah)) {
        val sisa = hitungSisa(serah, sekarang)
        return "Serah paling lambat $hariSerah $jamSerah WIB" + (sisa?.let { " · sisa $it" } ?: "")
    }
    if (kunci != null && sekarang.isBefore(kunci)) {
        val hariKunci = NAMA_HARI[kunci.atZone(WIB).dayOfWeek] ?: "Jumat"
        val jamKunci = formatJam.format(kunci)
        return "Tenggat serah $hariSerah $jamSerah WIB sudah lewat · minggu dikunci $hariKunci $jamKunci WIB"
    }
    return "Minggu ini sudah dikunci — perubahan hanya lewat permohonan buka kunci"
}

/** Label Indonesia status butir (WEEKLY_STATUS_META src/lib/constants.ts). */
internal fun labelStatusButir(status: String): String = when (status) {
    "SELESAI" -> "Selesai"
    "ON_PROGRESS" -> "Berjalan"
    "BELUM_MULAI" -> "Belum mulai"
    "TERKENDALA" -> "Terkendala"
    "NA" -> "N/A"
    else -> status
}

/** Kosakata status desain dari status butir (padanan WEEKLY_STATUS_META). */
internal fun mkStatusButir(status: String): MkStatus = when (status) {
    "SELESAI" -> MkStatus.DONE
    "ON_PROGRESS" -> MkStatus.ON
    "TERKENDALA" -> MkStatus.RISK
    else -> MkStatus.NEUTRAL
}

/** Label Indonesia status kepala laporan (WEEKLY_HEADER_META). */
internal fun labelStatusHeader(statusHeader: String): String = when (statusHeader) {
    "DRAFT" -> "Draf"
    "MENUNGGU_PERSETUJUAN" -> "Menunggu persetujuan"
    "DISETUJUI" -> "Disetujui"
    "TERKUNCI" -> "Terkunci"
    else -> if (statusHeader.isBlank()) "Belum dimulai" else statusHeader
}

/** Kosakata status desain dari statusHeader. */
internal fun mkStatusHeader(statusHeader: String): MkStatus = when (statusHeader) {
    "MENUNGGU_PERSETUJUAN" -> MkStatus.RISK
    "DISETUJUI" -> MkStatus.DONE
    "TERKUNCI" -> MkStatus.LATE
    else -> MkStatus.NEUTRAL
}

/**
 * Butir yang dihitung dalam "x dari y selesai" (E2E-1 #9): N/A tidak dihitung —
 * sama dengan Meja kerja (kadiv-desk.tsx `counted`) dan riwayat my-dashboard.
 */
internal fun butirDihitung(butir: List<ButirMingguan>): List<ButirMingguan> = butir.filter { it.status != "NA" }

/** "2 dari 3 butir selesai · 1 N/A" — kalimat ringkas kepala papan. */
internal fun teksHitungButir(butir: List<ButirMingguan>): String {
    if (butir.isEmpty()) return "Belum ada butir capaian minggu ini."
    val dihitung = butirDihitung(butir)
    val selesai = dihitung.count { it.status == "SELESAI" }
    val na = butir.size - dihitung.size
    return "$selesai dari ${dihitung.size} butir selesai" + if (na > 0) " · $na N/A tidak dihitung" else ""
}

/**
 * Kolom papan dari status butir: "belum" | "berjalan" | "selesai" | "na".
 * E2E-1 #7: N/A punya kolom sendiri (tidak lagi tercampur "Belum" dan tidak
 * ikut hitungan belum mulai); kolomnya hanya tampil bila ada butir N/A.
 */
internal fun kolomStatus(status: String): String = when (status) {
    "SELESAI" -> "selesai"
    "ON_PROGRESS", "TERKENDALA" -> "berjalan"
    "NA" -> "na"
    else -> "belum" // BELUM_MULAI, nilai tak dikenal
}

/** Butir dibagi kolom status, urutan asli (posisi lalu dibuat) dipertahankan; "na" hanya bila ada. */
internal fun bagiKolom(butir: List<ButirMingguan>): Map<String, List<ButirMingguan>> {
    val peta = linkedMapOf(
        "belum" to butir.filter { kolomStatus(it.status) == "belum" },
        "berjalan" to butir.filter { kolomStatus(it.status) == "berjalan" },
        "selesai" to butir.filter { kolomStatus(it.status) == "selesai" },
    )
    val na = butir.filter { kolomStatus(it.status) == "na" }
    if (na.isNotEmpty()) peta["na"] = na
    return peta
}

/** Adakah tetangga selajur (hari kerja sama) di arah itu — tombol naik/turun aktif? */
internal fun bisaPindah(semua: List<ButirMingguan>, id: String, arah: ArahPindah): Boolean {
    val diklik = semua.firstOrNull { it.id == id } ?: return false
    val kolom = semua.filter { kolomStatus(it.status) == kolomStatus(diklik.status) }
    val indeks = kolom.indexOfFirst { it.id == id }
    if (indeks < 0) return false
    return (if (arah == ArahPindah.NAIK) indeks - 1 downTo 0 else indeks + 1 until kolom.size)
        .any { kolom[it].hariKerjaKunci == diklik.hariKerjaKunci }
}
