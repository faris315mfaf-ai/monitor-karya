// Format tampilan bersama dua tab: tanggal WIB, persen, angka, inisial, dan
// kosakata status (warna + ikon + kata lewat MkStatus). Semua fungsi murni
// agar bisa diuji tanpa Compose.
package id.co.monitorkarya.feature.entitas.ui

import id.co.monitorkarya.core.domain.status.PitaKepatuhan
import id.co.monitorkarya.core.domain.status.pitaKepatuhan
import id.co.monitorkarya.designsystem.components.MkStatus
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

internal val LOKAL_ID: Locale = Locale.forLanguageTag("id-ID")
internal val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")

private val fmtTanggal = DateTimeFormatter.ofPattern("d MMM yyyy", LOKAL_ID).withZone(ZONA_WIB)
private val fmtTanggalPanjang = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", LOKAL_ID).withZone(ZONA_WIB)
private val fmtWaktu = DateTimeFormatter.ofPattern("d MMMM yyyy, HH.mm", LOKAL_ID).withZone(ZONA_WIB)
private val fmtBulan = DateTimeFormatter.ofPattern("MMMM yyyy", LOKAL_ID)
private val fmtHariPendek = DateTimeFormatter.ofPattern("EEE d", LOKAL_ID).withZone(ZONA_WIB)

private fun instan(iso: String?): Instant? = iso?.takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** ISO -> "9 Okt 2026" (WIB); null bila kosong/rusak. */
fun tanggalWib(iso: String?): String? = instan(iso)?.let(fmtTanggal::format)

/** ISO -> "Jumat, 9 Oktober 2026" (WIB). */
fun tanggalPanjangWib(iso: String?): String? = instan(iso)?.let(fmtTanggalPanjang::format)

/** ISO -> "9 Oktober 2026, 19.00" (WIB). */
fun waktuWib(iso: String?): String? = instan(iso)?.let(fmtWaktu::format)

/** ISO -> "Jum 9" (WIB) untuk chip hari. */
fun hariPendekWib(iso: String?): String? = instan(iso)?.let(fmtHariPendek::format)

/** "2026-10" -> "Oktober 2026"; kunci lain dikembalikan apa adanya. */
fun labelPeriode(kunci: String): String {
    val m = Regex("""^(\d{4})-(\d{2})$""").find(kunci) ?: return kunci
    val (tahun, bulan) = m.destructured
    return runCatching { fmtBulan.format(LocalDate.of(tahun.toInt(), bulan.toInt(), 1)) }
        .getOrDefault(kunci)
        .replaceFirstChar { it.titlecase(LOKAL_ID) }
}

/** 87.456 -> "87%"; [desimal] angka di belakang koma (koma Indonesia). */
fun persen(nilai: Double, desimal: Int = 0): String {
    val f = NumberFormat.getNumberInstance(LOKAL_ID).apply {
        minimumFractionDigits = desimal
        maximumFractionDigits = desimal
    }
    return f.format(nilai) + "%"
}

/** 1234 -> "1.234". */
fun angka(nilai: Int): String = NumberFormat.getIntegerInstance(LOKAL_ID).format(nilai)

/** Dua huruf awal nama; awalan "PT"/"Holding" diabaikan. */
fun inisial(nama: String): String = nama
    .replace(Regex("""^(PT\.?|Holding)\s+""", RegexOption.IGNORE_CASE), "")
    .split(' ')
    .filter { it.isNotBlank() }
    .take(2)
    .joinToString("") { it.first().uppercaseChar().toString() }
    .ifEmpty { "?" }

/** Persen bulat 0..100 untuk bilah progres. */
fun porsi(persen: Int): Float = (persen.coerceIn(0, 100) / 100f)

/** Pembulatan aman Double -> Int. */
fun bulat(nilai: Double): Int = nilai.roundToInt()

// ------------------------------------------------------------------
// Kosakata status (status-badges.tsx + constants.ts web)
// ------------------------------------------------------------------

/**
 * Ambang skor kepatuhan tunggal (complianceStatus web → complianceBand,
 * KEPUTUSAN-AMBANG-KEPATUHAN.md): ≥90 Baik (on), 75–89 Perlu perhatian
 * (risk), <75 Kritis (late). Skor mentah, tanpa pembulatan.
 */
fun statusKepatuhan(skor: Double): MkStatus = when (pitaKepatuhan(skor)) {
    PitaKepatuhan.BAIK -> MkStatus.ON
    PitaKepatuhan.PERHATIAN -> MkStatus.RISK
    PitaKepatuhan.KRITIS -> MkStatus.LATE
}

/** Kata kepatuhan (complianceLabel web): Baik / Perlu perhatian / Kritis. */
fun kataKepatuhan(skor: Double): String = pitaKepatuhan(skor).label

/** Lencana kepatuhan lengkap: "Baik 92,5%". */
fun teksKepatuhan(skor: Double): String = "${kataKepatuhan(skor)} ${persen(skor, 1)}"

data class StatusKata(val status: MkStatus, val kata: String)

/** Status laporan harian (DAILY_STATUS_META). */
fun statusHarian(kode: String): StatusKata = when (kode) {
    "SELESAI" -> StatusKata(MkStatus.DONE, "Selesai")
    "ON_PROGRESS" -> StatusKata(MkStatus.ON, "Berjalan")
    "TERKENDALA" -> StatusKata(MkStatus.RISK, "Terkendala")
    "MENUNGGU_KEPUTUSAN" -> StatusKata(MkStatus.INFO, "Menunggu keputusan")
    "TIDAK_ADA_PERUBAHAN" -> StatusKata(MkStatus.NEUTRAL, "Tidak ada perubahan")
    else -> StatusKata(MkStatus.NEUTRAL, kode.ifBlank { "Tanpa status" })
}

/** Status kepala laporan mingguan (WEEKLY_HEADER_META). */
fun statusMingguan(kode: String): StatusKata = when (kode) {
    "DRAFT" -> StatusKata(MkStatus.INFO, "Draf")
    "MENUNGGU_PERSETUJUAN" -> StatusKata(MkStatus.RISK, "Menunggu persetujuan")
    "DISETUJUI" -> StatusKata(MkStatus.DONE, "Disetujui")
    "TERKUNCI" -> StatusKata(MkStatus.NEUTRAL, "Terkunci")
    else -> StatusKata(MkStatus.NEUTRAL, kode.ifBlank { "Tanpa status" })
}

/** Status butir mingguan divisi (WEEKLY_STATUS_META). */
fun statusButir(kode: String): StatusKata = when (kode) {
    "SELESAI" -> StatusKata(MkStatus.DONE, "Selesai")
    "ON_PROGRESS" -> StatusKata(MkStatus.ON, "Berjalan")
    "BELUM_MULAI" -> StatusKata(MkStatus.NEUTRAL, "Belum mulai")
    "TERKENDALA" -> StatusKata(MkStatus.RISK, "Terkendala")
    "NA" -> StatusKata(MkStatus.NEUTRAL, "N/A")
    else -> StatusKata(MkStatus.NEUTRAL, kode.ifBlank { "Tanpa status" })
}

/** Status task (TASK_STATUS_META). */
fun statusTugas(kode: String): StatusKata = when (kode) {
    "BELUM_MULAI" -> StatusKata(MkStatus.NEUTRAL, "Belum mulai")
    "BERJALAN" -> StatusKata(MkStatus.ON, "Berjalan")
    "SELESAI" -> StatusKata(MkStatus.DONE, "Selesai")
    "TERKENDALA" -> StatusKata(MkStatus.RISK, "Terkendala")
    "MENUNGGU_KEPUTUSAN" -> StatusKata(MkStatus.INFO, "Menunggu keputusan")
    else -> StatusKata(MkStatus.NEUTRAL, kode.ifBlank { "Belum mulai" })
}

/** Urgensi task (URGENCY_META + URGENCY_TONE). */
fun statusUrgensi(kode: String): StatusKata = when (kode) {
    "KRITIS" -> StatusKata(MkStatus.LATE, "Kritis")
    "TINGGI" -> StatusKata(MkStatus.RISK, "Tinggi")
    "SEDANG" -> StatusKata(MkStatus.INFO, "Sedang")
    "RENDAH" -> StatusKata(MkStatus.NEUTRAL, "Rendah")
    else -> StatusKata(MkStatus.INFO, "Sedang")
}

/** Prioritas butir divisi (PRIORITY_META + PRIORITY_TONE). */
fun statusPrioritas(kode: String): StatusKata = when (kode) {
    "TINGGI" -> StatusKata(MkStatus.LATE, "Tinggi")
    "SEDANG" -> StatusKata(MkStatus.RISK, "Sedang")
    "RENDAH" -> StatusKata(MkStatus.INFO, "Rendah")
    else -> StatusKata(MkStatus.NEUTRAL, kode.ifBlank { "Tanpa prioritas" })
}

/** Label tipe entitas (ENTITY_TYPE_LABELS). */
fun labelTipe(tipe: String): String = when (tipe) {
    "HOLDING" -> "Holding"
    "SUB_HOLDING" -> "Sub-holding"
    "SECTOR" -> "Sektor"
    "REGION" -> "Wilayah"
    "PT" -> "PT"
    "UNIT" -> "Unit"
    else -> tipe
}

/** Label fase proyek (PROJECT_PHASE_LABELS). */
fun labelFase(fase: String): String = when (fase) {
    "INISIASI" -> "Inisiasi"
    "PERENCANAAN" -> "Perencanaan"
    "PELAKSANAAN" -> "Pelaksanaan"
    "PENYELESAIAN" -> "Penyelesaian"
    else -> fase
}

/** Label siklus hidup proyek (PROJECT_LIFECYCLE_LABELS). */
fun labelSiklus(siklus: String): String = when (siklus) {
    "DIUSULKAN" -> "Diusulkan"
    "AKTIF" -> "Aktif"
    "DITOLAK" -> "Ditolak"
    "DITUTUP" -> "Ditutup"
    "DIARSIPKAN" -> "Diarsipkan"
    else -> siklus
}
