// Model tampilan + logika murni laporan harian PIC multi-entri (agen A1,
// 13 Okt 2026). Padanan fungsi pembantu di src/components/views/daily-input-view.tsx
// (composeReportBody, composeAchievement, reportState, isLockedFor, cutoffText,
// validasi EntrySheet). Tanpa Android — diuji di app/src/test.
package id.co.monitorkarya.app.ui.laporan

import id.co.monitorkarya.core.data.outbox.IdLokal
import id.co.monitorkarya.core.data.outbox.StatusKirim
import id.co.monitorkarya.core.network.ApiError
import id.co.monitorkarya.core.network.dto.DailyInputGetResponse
import id.co.monitorkarya.core.network.dto.DailyInputProjectDto
import id.co.monitorkarya.core.network.dto.EntriHariResponse
import id.co.monitorkarya.core.network.dto.EntriLaporanDto
import id.co.monitorkarya.core.network.dto.SubtaskInputDto
import id.co.monitorkarya.designsystem.components.MkStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// ------------------------------------------------------------------
// Model meja (GET /api/daily-input)
// ------------------------------------------------------------------

/** Meja laporan satu hari. */
data class DeskLaporan(
    /** Kunci "YYYY-MM-DD" WIB tanggal yang dibuka. */
    val tanggalKunci: String,
    /** reportDate ISO — dipakai format tanggal panjang. */
    val tanggalIso: String,
    val hariIni: Boolean,
    /** Kunci "YYYY-MM-DD" WIB hari ini menurut server. */
    val hariIniKunci: String,
    /** lockAt ISO — titik kunci menurut aturan PT (jam kustom / akhir hari 24/7). */
    val kunciIso: String?,
    /** Tanggal ini sudah lewat titik kunci PT (locked). */
    val lewatTenggat: Boolean,
    /** Aturan PT 24/7 (countdown null): tanpa jam batas. */
    val mode247: Boolean,
    /** canRequestUnlock — akun boleh mengajukan buka kunci. */
    val bolehAjukanBuka: Boolean,
    /** Laporan tanggal lain yang sedang dibuka lewat buka kunci. */
    val hariDibuka: List<HariDibuka>,
    val proyek: List<ProyekLaporan>,
)

/** Satu laporan hari lain yang sedang dibuka (openDays). */
data class HariDibuka(
    val reportId: String,
    val proyekId: String,
    val namaProyek: String,
    /** "YYYY-MM-DD". */
    val tanggal: String,
    val sampaiIso: String?,
)

/** Satu proyek di meja laporan. */
data class ProyekLaporan(
    val id: String,
    val kode: String,
    val nama: String,
    val fase: String,
    val jumlahEntri: Int,
    /** editable dari server: tidak beku/terkunci, atau sedang dibuka. */
    val bisaEdit: Boolean,
    /** FORWARDED | LOCKED | TIME | null. */
    val alasanKunci: String?,
    val bukaKunci: BukaKunciInfo?,
    val laporan: LaporanTersimpan?,
)

/** Buka kunci yang masih diproses (DIAJUKAN/DISETUJUI) atau sedang berlaku (DIEKSEKUSI). */
data class BukaKunciInfo(val status: String, val sampaiIso: String?)

/** Ringkasan laporan tersimpan satu proyek. */
data class LaporanTersimpan(
    val id: String,
    val status: String,
    val progres: Int,
    val jumlahBukti: Int,
    val terkirimIso: String?,
    val diteruskanIso: String?,
    val terkunci: Boolean,
)

/** Status UI meja: Memuat → Siap(meja) atau Galat(pesan). */
sealed interface LaporanUiState {
    data object Memuat : LaporanUiState
    data class Siap(val desk: DeskLaporan) : LaporanUiState
    data class Galat(val pesan: String) : LaporanUiState
}

internal fun DailyInputGetResponse.keDesk(): DeskLaporan = DeskLaporan(
    tanggalKunci = reportDateKey,
    tanggalIso = reportDate,
    hariIni = today,
    hariIniKunci = todayKey,
    kunciIso = lockAt.takeIf { it.isNotBlank() },
    lewatTenggat = locked,
    mode247 = countdown == null,
    bolehAjukanBuka = canRequestUnlock,
    hariDibuka = openDays
        .filter { it.date != reportDateKey }
        .map { HariDibuka(it.reportId, it.projectId, it.projectName, it.date, it.unlockUntil) },
    proyek = projects.map { it.keProyek() },
)

private fun DailyInputProjectDto.keProyek(): ProyekLaporan = ProyekLaporan(
    id = id,
    kode = code,
    nama = name,
    fase = phase,
    jumlahEntri = taskCount,
    bisaEdit = editable,
    alasanKunci = lockReason,
    bukaKunci = unlock?.let { BukaKunciInfo(status = it.status, sampaiIso = it.unlockUntil) },
    laporan = report?.let {
        LaporanTersimpan(
            id = it.id,
            status = it.status,
            progres = it.progressPct,
            jumlahBukti = it.evidenceCount,
            terkirimIso = it.submittedAt,
            diteruskanIso = it.forwardedAt,
            terkunci = it.isLocked,
        )
    },
)

// ------------------------------------------------------------------
// Model entri (GET /api/tasks?projectId=&date=)
// ------------------------------------------------------------------

/** Satu bukti yang menempel pada entri. */
data class Bukti(
    val id: String,
    val nama: String,
    val mime: String,
    val ukuran: Int,
    /** Tautan luar (http/https) — null untuk berkas unggahan. */
    val tautan: String?,
    /** B2: bukti yang masih di antrean unggah (null = sudah di server). */
    val statusKirim: StatusKirim? = null,
    val galatKirim: String? = null,
) {
    /** Foto unggahan di server → thumbnail; lainnya (termasuk yang menunggu kirim) baris teks. */
    val foto: Boolean get() = tautan == null && mime.startsWith("image/") && statusKirim == null
}

/** Satu entri laporan (task HARIAN hari itu). */
data class Entri(
    val id: String,
    val judul: String,
    val deskripsi: String?,
    val pelaksana: String?,
    val picUserId: String?,
    val status: String,
    val progres: Int,
    val hasil: String?,
    val kendala: String?,
    val keputusan: String?,
    val rencana: String?,
    val eskalasi: Boolean,
    val escalationId: String?,
    val tags: List<String>,
    val urgensi: String,
    val mulaiIso: String?,
    val selesaiIso: String?,
    val subtugas: List<SubtaskInputDto>,
    val bukti: List<Bukti>,
    /** B2: perubahan entri ini masih di antrean ("Menunggu kirim"/"Gagal kirim"); null = sinkron. */
    val statusKirim: StatusKirim? = null,
    /** Pesan server bila [statusKirim] GAGAL. */
    val galatKirim: String? = null,
    /** id pesan TAMBAH_ENTRI pemilik entri lokal ("lokal:<n>"). */
    val idOutbox: Long? = null,
    /** "HH:MM" dari payload antrean (entri lokal belum punya mulaiIso). */
    val jamMulai: String? = null,
    val jamSelesai: String? = null,
) {
    /** Entri yang ditambahkan saat luring dan belum punya id server. */
    val lokal: Boolean get() = IdLokal.adalah(id)
}

/** Daftar entri satu proyek pada satu hari + status kuncinya. */
data class EntriHari(
    val terkunci: Boolean,
    /** FORWARDED | LOCKED | null. */
    val beku: String?,
    val reportId: String?,
    val bukaSampaiIso: String?,
    val entri: List<Entri>,
)

/** Status muat daftar entri proyek terpilih. */
sealed interface EntriUiState {
    data object Memuat : EntriUiState
    data class Siap(val hari: EntriHari) : EntriUiState
    data class Galat(val pesan: String) : EntriUiState
}

internal fun EntriLaporanDto.keEntri(): Entri = Entri(
    id = id,
    judul = title,
    deskripsi = description,
    pelaksana = picName,
    picUserId = picUserId,
    status = status,
    progres = progressPct,
    hasil = achievementToday,
    kendala = obstacle,
    keputusan = decisionNeeded,
    rencana = followUp,
    eskalasi = needsEscalation,
    escalationId = escalationId,
    tags = tags,
    urgensi = urgency,
    mulaiIso = startAt,
    selesaiIso = endAt,
    subtugas = subtasks.map { SubtaskInputDto(title = it.title, isDone = it.isDone) },
    bukti = evidence.map { Bukti(id = it.id, nama = it.fileName, mime = it.mime, ukuran = it.size, tautan = it.url) },
)

internal fun EntriHariResponse.keEntriHari(): EntriHari = EntriHari(
    terkunci = locked,
    beku = frozen,
    reportId = reportId,
    bukaSampaiIso = unlockUntil,
    entri = tasks.filter { it.scope == "HARIAN" }.map { it.keEntri() },
)

// ------------------------------------------------------------------
// Isian Sheet "Tambah/Ubah entri"
// ------------------------------------------------------------------

/** Isian satu entri — padanan state EntrySheet web. */
data class IsianEntri(
    val judul: String = "",
    val deskripsi: String = "",
    val pelaksana: String = "",
    val status: String = "BERJALAN",
    val progres: Int = 0,
    val hasil: String = "",
    val kendala: String = "",
    val eskalasi: Boolean = false,
    val keputusan: String = "",
    val rencana: String = "",
) {
    val wajibKendala: Boolean get() = status == "TERKENDALA"
    val wajibKeputusan: Boolean get() = eskalasi || status == "MENUNGGU_KEPUTUSAN"
    val wajibRencana: Boolean get() = status == "TERKENDALA"
}

/** Pilihan status entri (keputusan pemilik 10 Okt 2026). */
internal val PILIHAN_STATUS_ENTRI: List<Pair<String, String>> = listOf(
    "BERJALAN" to "Berjalan",
    "SELESAI" to "Selesai",
    "TERKENDALA" to "Terkendala",
)

/** Pilihan status untuk satu isian: status lama di luar tiga pilihan tetap terwakili. */
internal fun pilihanStatusUntuk(status: String): List<Pair<String, String>> =
    if (status.isBlank() || PILIHAN_STATUS_ENTRI.any { it.first == status }) {
        PILIHAN_STATUS_ENTRI
    } else {
        PILIHAN_STATUS_ENTRI + (status to labelStatusEntri(status))
    }

internal fun Entri.keIsian(): IsianEntri = IsianEntri(
    judul = judul,
    deskripsi = deskripsi.orEmpty(),
    pelaksana = pelaksana.orEmpty(),
    status = status,
    progres = progres,
    hasil = hasil.orEmpty(),
    kendala = kendala.orEmpty(),
    eskalasi = eskalasi,
    keputusan = keputusan.orEmpty(),
    rencana = rencana.orEmpty(),
)

/** Ganti status: Selesai mendorong progres ke 100 (perilaku web). */
internal fun IsianEntri.denganStatus(baru: String): IsianEntri =
    copy(status = baru, progres = if (baru == "SELESAI" && progres < 100) 100 else progres)

/** Validasi klien sebelum simpan — pesan sama dengan EntrySheet web. */
internal fun validasiEntri(isian: IsianEntri): List<String> = buildList {
    if (isian.judul.isBlank()) add("Judul entri wajib diisi.")
    if (isian.wajibKendala && isian.kendala.isBlank()) add("Uraian kendala wajib diisi untuk status Terkendala.")
    if (isian.wajibKeputusan && isian.keputusan.isBlank()) {
        add("Keputusan yang dibutuhkan wajib diisi bila entri ini butuh eskalasi atau keputusan.")
    }
    if (isian.wajibRencana && isian.rencana.isBlank()) add("Rencana besok wajib diisi untuk status Terkendala.")
}

/**
 * E2E-R2 N7: galat Sheet setelah isian berubah. Galat validasi yang sudah
 * tidak berlaku untuk isian baru dibuang seketika (dulu basi sampai Simpan
 * berikutnya); galat lain (jawaban server) dibiarkan. Galat validasi BARU
 * tidak ditambahkan sebelum Simpan ditekan.
 */
internal fun galatSetelahUbah(galat: List<String>, isianLama: IsianEntri, isianBaru: IsianEntri): List<String> {
    if (galat.isEmpty()) return galat
    val validasiLama = validasiEntri(isianLama).toSet()
    val validasiBaru = validasiEntri(isianBaru).toSet()
    return galat.filter { it !in validasiLama || it in validasiBaru }
}

// ------------------------------------------------------------------
// Gabungan narasi entri → isi laporan (composeReportBody web, pemisah " | ")
// ------------------------------------------------------------------

/** Isi teks laporan harian hasil gabungan entri. */
data class NarasiLaporan(val capaian: String, val kendala: String?, val rencana: String?)

internal fun gabungNarasi(entri: List<Entri>): NarasiLaporan {
    fun gabung(nilai: List<String?>): String? =
        nilai.mapNotNull { it?.trim()?.takeIf(String::isNotEmpty) }.takeIf { it.isNotEmpty() }?.joinToString(" | ")
    val capaian = gabung(entri.map { it.hasil }) ?: susunCapaian(entri)
    val kendala = gabung(
        entri
            .filter { !it.kendala.isNullOrBlank() || !it.keputusan.isNullOrBlank() }
            .map { e -> "${e.judul}: ${e.kendala?.trim()?.takeIf(String::isNotEmpty) ?: e.keputusan?.trim()}" },
    )
    val rencana = gabung(entri.map { it.rencana })
    return NarasiLaporan(capaian = capaian, kendala = kendala, rencana = rencana)
}

/** Ringkasan bila entri belum punya narasi (composeAchievement roll-up). */
internal fun susunCapaian(entri: List<Entri>): String {
    val selesai = entri.filter { it.status == "SELESAI" }
    val jalan = entri.filter { it.status == "BERJALAN" }
    val bagian = buildList {
        if (selesai.isNotEmpty()) add("Selesai: ${selesai.joinToString("; ") { it.judul }}")
        if (jalan.isNotEmpty()) add("Berjalan: ${jalan.joinToString("; ") { "${it.judul} (${it.progres}%)" }}")
        if (isEmpty()) add("${entri.size} entri tercatat, belum ada yang selesai atau berjalan.")
    }
    return bagian.joinToString(". ")
}

/** "3 entri · 1 selesai · 1 terkendala" (footer kirim). */
internal fun ringkasEntri(entri: List<Entri>): String {
    if (entri.isEmpty()) return "Belum ada entri"
    val selesai = entri.count { it.status == "SELESAI" }
    val kendala = entri.count { it.status == "TERKENDALA" || it.status == "MENUNGGU_KEPUTUSAN" }
    return "${entri.size} entri · $selesai selesai · $kendala terkendala"
}

/**
 * Bukti laporan kurang? Jumlah bukti laporan dirawat roll-up server; entri yang
 * buktinya belum terhitung (draf belum tersimpan) ikut dihitung dari daftar
 * entri agar tombol kirim tidak tertahan tanpa alasan.
 */
internal fun buktiKurang(entri: List<Entri>, laporan: LaporanTersimpan?): Boolean {
    if (entri.isEmpty()) return false
    val total = maxOf(laporan?.jumlahBukti ?: 0, entri.sumOf { it.bukti.size })
    return total < 1
}

/** Petunjuk di atas footer kirim. */
internal fun petunjukKirim(entri: List<Entri>, laporan: LaporanTersimpan?): String? = when {
    entri.isEmpty() -> "Tambahkan minimal satu entri sebelum mengirim laporan."
    buktiKurang(entri, laporan) -> "Lampirkan minimal 1 bukti pada entri sebelum mengirim laporan."
    else -> null
}

// ------------------------------------------------------------------
// Keadaan laporan (reportState web)
// ------------------------------------------------------------------

/** Tidak bisa ditulis menurut server (editable dihitung server: beku, lewat jam PT, kecuali dibuka). */
internal val ProyekLaporan.terkunci: Boolean get() = !bisaEdit

internal val ProyekLaporan.dibuka: Boolean get() = bukaKunci?.status == "DIEKSEKUSI"

/** Status + label laporan satu proyek dalam kosakata desain. */
internal fun keadaanLaporan(p: ProyekLaporan, terkunci: Boolean): Pair<MkStatus, String> {
    val r = p.laporan
    return when {
        p.dibuka -> MkStatus.INFO to "Dibuka sampai ${tanggalJamWib(p.bukaKunci?.sampaiIso) ?: "-"}"
        r?.diteruskanIso != null -> MkStatus.DONE to "Diteruskan ke holding"
        r?.terkirimIso != null -> MkStatus.DONE to "Terkirim ${jamWib(r.terkirimIso) ?: ""}".trim()
        r != null -> if (terkunci) MkStatus.LATE to "Draf terkunci" else MkStatus.RISK to "Draf belum dikirim"
        else -> if (terkunci) MkStatus.LATE to "Tidak dikirim" else MkStatus.NEUTRAL to "Belum diisi"
    }
}

/** Badge + pesan kunci (LockNotice web); null bila tidak terkunci dan tidak dibuka. */
data class InfoKunci(
    val status: MkStatus,
    val label: String,
    val pesan: String,
    /** Status buka kunci yang sedang diproses: "DIAJUKAN"/"DISETUJUI" atau null. */
    val prosesBuka: String?,
    /** Tombol "Ajukan buka kunci" tampil. */
    val bolehAjukan: Boolean,
    /** Catatan pengganti tombol bila tidak bisa mengajukan. */
    val catatan: String?,
)

internal fun infoKunci(
    p: ProyekLaporan,
    terkunci: Boolean,
    desk: DeskLaporan,
    reportIdEntri: String?,
): InfoKunci? {
    val r = p.laporan
    val kataHari = if (desk.hariIni) "hari ini" else "hari itu"
    if (p.dibuka) {
        return InfoKunci(
            status = MkStatus.INFO,
            label = "Dibuka sampai ${tanggalJamWib(p.bukaKunci?.sampaiIso) ?: "-"}",
            pesan = "Buka kunci disetujui. Perbaiki laporan lalu kirim ulang; setiap perubahan tercatat di log aktivitas dan laporan dikunci kembali otomatis.",
            prosesBuka = null,
            bolehAjukan = false,
            catatan = null,
        )
    }
    if (!terkunci) return null
    val alasan = p.alasanKunci ?: when {
        r?.diteruskanIso != null -> "FORWARDED"
        r?.terkunci == true -> "LOCKED"
        else -> "TIME"
    }
    val pesan = when (alasan) {
        "FORWARDED" -> "Laporan ini sudah diteruskan ke holding${r?.diteruskanIso?.let { " pukul ${jamWib(it)}" } ?: ""} dan dibekukan. Perubahan hanya lewat buka kunci yang disetujui."
        "LOCKED" -> "Laporan ini dikunci. Perubahan hanya lewat buka kunci yang disetujui."
        else -> if (desk.mode247) {
            "Pengisian laporan $kataHari sedang ditutup atau harinya sudah lewat."
        } else {
            "Laporan $kataHari sudah melewati pukul ${jamWib(desk.kunciIso) ?: "-"} WIB dan terkunci."
        }
    }
    val (status, label) = when {
        alasan == "FORWARDED" -> MkStatus.DONE to "Diteruskan · dibekukan"
        alasan == "LOCKED" || r?.terkirimIso != null -> MkStatus.NEUTRAL to "Terkunci"
        else -> (if (desk.lewatTenggat) MkStatus.LATE else MkStatus.NEUTRAL) to "Terkunci setelah tenggat"
    }
    val proses = p.bukaKunci?.status?.takeIf { it == "DIAJUKAN" || it == "DISETUJUI" }
    val adaLaporan = r != null || reportIdEntri != null
    return InfoKunci(
        status = status,
        label = label,
        pesan = pesan,
        prosesBuka = proses,
        bolehAjukan = proses == null && adaLaporan && desk.bolehAjukanBuka,
        catatan = when {
            proses != null -> null
            !adaLaporan -> "Belum ada laporan tersimpan untuk $kataHari, jadi tidak ada yang bisa dibuka."
            !desk.bolehAjukanBuka -> "Minta Admin PT mengajukan buka kunci bila laporan ini perlu diubah."
            else -> null
        },
    )
}

// ------------------------------------------------------------------
// Kalimat jawaban dan tenggat
// ------------------------------------------------------------------

/** Satu kalimat jawaban di atas layar (answer web). */
internal fun kalimatJawaban(desk: DeskLaporan): String {
    val kataHari = if (desk.hariIni) "hari ini" else "tanggal ${tanggalPendek(desk.tanggalIso) ?: desk.tanggalKunci}"
    val tunggal = desk.proyek.singleOrNull()
    if (tunggal != null) {
        val r = tunggal.laporan
        return when {
            tunggal.dibuka -> "Laporan ${tunggal.nama} $kataHari sedang dibuka untuk diperbaiki."
            r?.diteruskanIso != null -> "Laporan ${tunggal.nama} $kataHari sudah diteruskan ke holding."
            r?.terkirimIso != null -> "Laporan ${tunggal.nama} $kataHari sudah terkirim ke Admin PT."
            tunggal.terkunci -> "Laporan ${tunggal.nama} $kataHari tidak terkirim sebelum tenggat."
            else -> "Laporan ${tunggal.nama} $kataHari belum dikirim."
        }
    }
    val terkirim = desk.proyek.count { it.laporan?.terkirimIso != null }
    val sisa = desk.proyek.size - terkirim
    return if (sisa == 0) {
        "Semua ${desk.proyek.size} laporan $kataHari sudah terkirim."
    } else {
        "$sisa dari ${desk.proyek.size} laporan $kataHari belum dikirim."
    }
}

/**
 * Kalimat tenggat. Sisa waktu dihitung dari lockAt server (bukan countdown):
 * GET daily-input mengirim countdown berbasis jam env 17.00 walau PT memakai
 * jam kustom, sedangkan lockAt sudah mengikuti aturan PT.
 */
internal fun teksTenggat(desk: DeskLaporan, sekarang: Instant = Instant.now()): String {
    val kataHari = if (desk.hariIni) "hari ini" else "hari itu"
    val sisa = desk.proyek.count { it.laporan?.terkirimIso == null }
    val ajakan = if (sisa > 0) " Catat entri, lampirkan bukti, lalu kirim." else ""
    val jam = jamWib(desk.kunciIso) ?: "-"
    return when {
        desk.lewatTenggat && desk.mode247 -> "Pengisian laporan $kataHari sedang ditutup. Ajukan buka kunci bila perlu mengubahnya."
        desk.lewatTenggat && sisa > 0 -> "Tenggat $jam WIB sudah lewat, jadi laporan $kataHari terkunci. Ajukan buka kunci bila perlu mengubahnya."
        desk.lewatTenggat -> "Tenggat $jam WIB sudah lewat; laporan $kataHari terkunci."
        desk.mode247 -> "Tersedia 24/7 · kirim kapan saja.$ajakan"
        else -> {
            val sisaWaktu = sisaWaktu(desk.kunciIso, sekarang)
            if (sisaWaktu == null) "Tenggat $jam WIB.$ajakan" else "Tenggat $jam WIB · $sisaWaktu lagi.$ajakan"
        }
    }
}

/** Label tenggat singkat untuk subjudul kartu (cutoffText web). */
internal fun labelTenggat(desk: DeskLaporan): String =
    if (desk.mode247) "Mode 24/7" else "Tenggat ${jamWib(desk.kunciIso) ?: "-"}"

/** "2 jam 15 menit" menuju [kunciIso]; null bila sudah lewat atau ISO rusak. */
internal fun sisaWaktu(kunciIso: String?, sekarang: Instant = Instant.now()): String? {
    val kunci = cobaIso(kunciIso) ?: return null
    val ms = kunci.toEpochMilli() - sekarang.toEpochMilli()
    if (ms <= 0) return null
    val jam = ms / 3_600_000
    val menit = (ms % 3_600_000) / 60_000
    return if (jam > 0) "$jam jam $menit menit" else "$menit menit"
}

// ------------------------------------------------------------------
// Galat tulis → tampilan
// ------------------------------------------------------------------

/** Galat tulis yang sudah dipetakan untuk layar. */
sealed interface GalatTulis {
    val pesan: String

    /** 409 — laporan beku/terkunci; meja dimuat ulang agar tampilan ikut terkunci. */
    data class Beku(override val pesan: String, val reportId: String?) : GalatTulis

    /** 422/400 — daftar pesan validasi server. */
    data class Validasi(override val pesan: String, val daftar: List<String>) : GalatTulis

    data class Umum(override val pesan: String) : GalatTulis
}

internal fun petakanGalat(galat: ApiError): GalatTulis = when (galat) {
    is ApiError.Konflik -> GalatTulis.Beku(
        pesan = galat.pesan.ifBlank { "Laporan ini terkunci. Ajukan buka kunci untuk mengubahnya." },
        reportId = galat.reportId,
    )
    is ApiError.Validasi -> GalatTulis.Validasi(
        pesan = galat.pesan,
        daftar = galat.errors.ifEmpty { listOf(galat.pesan) },
    )
    else -> GalatTulis.Umum(galat.pesanTampil())
}

/** Daftar pesan untuk kotak galat Sheet. */
internal fun GalatTulis.daftarPesan(): List<String> = when (this) {
    is GalatTulis.Validasi -> daftar
    else -> listOf(pesan)
}

// ------------------------------------------------------------------
// Kosakata status & waktu
// ------------------------------------------------------------------

/** Label Indonesia status laporan harian; "Belum" bila belum ada laporan. Dipakai juga meja Admin PT. */
internal fun labelStatusHarian(status: String?): String = when (status) {
    "SELESAI" -> "Selesai"
    "ON_PROGRESS" -> "Dikerjakan"
    "TERKENDALA" -> "Terkendala"
    "MENUNGGU_KEPUTUSAN" -> "Menunggu keputusan"
    "TIDAK_ADA_PERUBAHAN" -> "Tanpa perubahan"
    else -> "Belum"
}

/** Label status entri/task (TASK_STATUS_META web). */
internal fun labelStatusEntri(status: String): String = when (status) {
    "BELUM_MULAI" -> "Belum mulai"
    "BERJALAN" -> "Berjalan"
    "SELESAI" -> "Selesai"
    "TERKENDALA" -> "Terkendala"
    "MENUNGGU_KEPUTUSAN" -> "Menunggu keputusan"
    else -> status
}

/** Nada status entri (TASK_STATUS_META web). */
internal fun nadaStatusEntri(status: String): MkStatus = when (status) {
    "BERJALAN" -> MkStatus.ON
    "SELESAI" -> MkStatus.DONE
    "TERKENDALA" -> MkStatus.RISK
    "MENUNGGU_KEPUTUSAN" -> MkStatus.INFO
    else -> MkStatus.NEUTRAL
}

/** Label fase proyek (PROJECT_PHASE_LABELS web, subset umum). */
internal fun labelFase(fase: String): String = when (fase) {
    "PERENCANAAN" -> "Perencanaan"
    "PELAKSANAAN" -> "Pelaksanaan"
    "PENGUJIAN" -> "Pengujian"
    "SERAH_TERIMA" -> "Serah terima"
    "PEMELIHARAAN" -> "Pemeliharaan"
    "SELESAI" -> "Selesai"
    else -> fase.lowercase(Locale.ROOT).replace('_', ' ').replaceFirstChar { it.titlecase(Locale.ROOT) }
}

/** Zona waktu tampilan — laporan hidup di WIB. */
private val WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val ID: Locale = Locale.forLanguageTag("id-ID")

private val formatJam = DateTimeFormatter.ofPattern("HH.mm").withZone(WIB)

private val formatTanggal = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", ID).withZone(WIB)

private val formatTanggalPendek = DateTimeFormatter.ofPattern("d MMM yyyy", ID).withZone(WIB)

private val formatTanggalJam = DateTimeFormatter.ofPattern("d MMM, HH.mm", ID).withZone(WIB)

/** ISO → Instant; null bila rusak. */
internal fun cobaIso(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** "HH.mm" WIB dari ISO; null bila ISO rusak. */
internal fun jamWib(iso: String?): String? = cobaIso(iso)?.let { formatJam.format(it) }

/** "Senin, 13 Oktober 2026" dari ISO; null bila rusak. */
internal fun tanggalPanjang(iso: String?): String? = cobaIso(iso)?.let { formatTanggal.format(it) }

/** "13 Okt 2026" dari ISO; null bila rusak. */
internal fun tanggalPendek(iso: String?): String? = cobaIso(iso)?.let { formatTanggalPendek.format(it) }

/** "13 Okt, 14.20" dari ISO; null bila rusak. */
internal fun tanggalJamWib(iso: String?): String? = cobaIso(iso)?.let { formatTanggalJam.format(it) }

/** "YYYY-MM-DD" WIB → "13 Okt 2026". */
internal fun tanggalKunciPendek(kunci: String): String =
    runCatching { tanggalPendek(java.time.LocalDate.parse(kunci).atStartOfDay(WIB).toInstant().toString()) }
        .getOrNull() ?: kunci

/** "HH:MM" WIB dari ISO, untuk mengirim balik jam task yang sudah ada. */
internal fun jamKirim(iso: String?): String? =
    cobaIso(iso)?.atZone(WIB)?.let { "%02d:%02d".format(it.hour, it.minute) }

/** Ukuran berkas ramah baca ("1,2 MB", "340 KB"). */
internal fun ukuranLabel(byte: Int): String = when {
    byte >= 1024 * 1024 -> String.format(ID, "%.1f MB", byte / (1024.0 * 1024.0))
    byte >= 1024 -> "${byte / 1024} KB"
    else -> "$byte B"
}
