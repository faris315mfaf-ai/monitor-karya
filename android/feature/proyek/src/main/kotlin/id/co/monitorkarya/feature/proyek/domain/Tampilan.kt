// Logika tampilan murni tab Proyek — port fungsi pembantu projects-view.tsx
// (projectState, answerFor, supportFor, approvalSteps) + label konstanta web
// (PROJECT_PHASE_LABELS, PROJECT_LIFECYCLE_LABELS, PROJECT_APPROVER_LABELS,
// STAGE_META, OUTPUT_META, DAILY_STATUS_META, ESCALATION_*). Tanpa Compose
// supaya bisa diuji JVM; lapisan UI memetakan [Nada] ke MkStatus.
package id.co.monitorkarya.feature.proyek.domain

import id.co.monitorkarya.core.domain.model.LaporanHarian
import id.co.monitorkarya.core.domain.model.MkStatusDomain
import id.co.monitorkarya.core.domain.status.StatusProyek
import id.co.monitorkarya.feature.proyek.data.ProyekDto
import id.co.monitorkarya.feature.proyek.data.RingkasanProyekDto
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Nada status (kosakata StatusBadge web): warna + ikon + kata di UI. */
enum class Nada { ON, RISK, LATE, DONE, NEUTRAL, INFO }

/** Status tampilan satu proyek; [label] null = kata bawaan status. */
data class StatusTampil(
    val nada: Nada,
    val label: String?,
    val alasan: String?,
    val progres: Int,
)

/** Satu langkah rantai persetujuan (padanan FlowStep web). */
data class LangkahPersetujuan(
    val judul: String,
    val sub: String?,
    val keadaan: Keadaan,
    val meta: String,
) {
    enum class Keadaan { SELESAI, DITOLAK, GILIRAN, MENUNGGU }
}

val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")
private val LOKAL_ID: Locale = Locale.forLanguageTag("id-ID")

/** Saringan siklus hidup (chip web, urutan sama). */
val SIKLUS_SARINGAN: List<Pair<String, String>> = listOf(
    "AKTIF" to "Aktif",
    "DIUSULKAN" to "Diusulkan",
    "DITOLAK" to "Ditolak",
    "DITUTUP" to "Ditutup",
    "DIARSIPKAN" to "Diarsipkan",
    "ALL" to "Semua status",
)

val LABEL_FASE: Map<String, String> = linkedMapOf(
    "INISIASI" to "Inisiasi",
    "PERENCANAAN" to "Perencanaan",
    "PELAKSANAAN" to "Pelaksanaan",
    "PENYELESAIAN" to "Penyelesaian",
)

val LABEL_SIKLUS: Map<String, String> = mapOf(
    "DIUSULKAN" to "Diusulkan",
    "AKTIF" to "Aktif",
    "DITOLAK" to "Ditolak",
    "DITUTUP" to "Ditutup",
    "DIARSIPKAN" to "Diarsipkan",
)

val LABEL_PENYETUJU: Map<String, String> = mapOf(
    "ADMIN_PT" to "Admin PT",
    "DIREKTUR_ENTITAS" to "Direktur entitas",
    "DIREKTUR_SDM_GA" to "Direksi holding",
    "MANAJEMEN" to "Manajemen holding",
)

/** Status tahap: label + nada (STAGE_META + warna baris editor tahapan web). */
val STATUS_TAHAP: Map<String, Pair<String, Nada>> = linkedMapOf(
    "BELUM_MULAI" to ("Belum mulai" to Nada.NEUTRAL),
    "BERJALAN" to ("Berjalan" to Nada.ON),
    "TERTAHAN" to ("Tertahan" to Nada.RISK),
    "SELESAI" to ("Selesai" to Nada.DONE),
)

val STATUS_OUTPUT: Map<String, Pair<String, Nada>> = mapOf(
    "DIKERJAKAN" to ("Dikerjakan" to Nada.INFO),
    "MENUNGGU_REVIEW" to ("Menunggu review" to Nada.NEUTRAL),
    "PERLU_REVISI" to ("Perlu revisi" to Nada.RISK),
    "DITERIMA" to ("Diterima" to Nada.DONE),
)

val STATUS_LAPORAN: Map<String, Pair<String, Nada>> = mapOf(
    "SELESAI" to ("Selesai" to Nada.DONE),
    "ON_PROGRESS" to ("Berjalan" to Nada.ON),
    "TERKENDALA" to ("Terkendala" to Nada.RISK),
    "MENUNGGU_KEPUTUSAN" to ("Menunggu keputusan" to Nada.INFO),
    "TIDAK_ADA_PERUBAHAN" to ("Tidak ada perubahan" to Nada.NEUTRAL),
)

val STATUS_ESKALASI: Map<String, Pair<String, Nada>> = mapOf(
    "DIAJUKAN" to ("Diajukan" to Nada.INFO),
    "DITINJAU" to ("Ditinjau" to Nada.RISK),
    "DIPUTUSKAN" to ("Diputuskan" to Nada.DONE),
    "DITUTUP" to ("Ditutup" to Nada.NEUTRAL),
)

val KEBUTUHAN_ESKALASI: Map<String, String> = mapOf(
    "KEPUTUSAN" to "Keputusan",
    "ANGGARAN" to "Anggaran",
    "DUKUNGAN_LINTAS_FUNGSI" to "Dukungan lintas fungsi",
)

fun labelPenyetuju(peran: String?): String = LABEL_PENYETUJU[peran.orEmpty()] ?: peran ?: "persetujuan"

/** Catatan slot yang menolak (alasan penolakan), bila ada. */
fun catatanPenolakan(p: ProyekDto): String? = p.approvals.firstOrNull { it.decision == "DITOLAK" }?.note

/**
 * Port `projectState` web: pengajuan & arsip memakai status siklus hidupnya;
 * proyek berjalan memakai satu sumber StatusProyek (core:domain, port
 * project-status.ts) dengan tenggat sebagai INSTAN seperti server.
 */
fun statusTampil(p: ProyekDto, sekarang: ZonedDateTime = ZonedDateTime.now(ZONA_WIB)): StatusTampil {
    if (p.lifecycle == "DIUSULKAN") {
        return StatusTampil(Nada.INFO, "Menunggu ${labelPenyetuju(p.pendingRole)}", null, 0)
    }
    if (p.lifecycle == "DITOLAK") return StatusTampil(Nada.LATE, "Ditolak", catatanPenolakan(p), 0)
    val r = p.latestReport
    val laporan = r?.let {
        LaporanHarian(
            id = "",
            proyekId = p.id,
            tanggal = tanggalWib(it.reportDate) ?: sekarang.toLocalDate(),
            status = it.status,
            progresPct = it.progressPct,
            capaian = "",
            kendala = it.obstacle,
            terlambat = it.isLate,
        )
    }
    val h = StatusProyek.hitungLengkap(
        tenggat = null,
        terakhir = laporan,
        sekarang = sekarang,
        siklusHidup = p.lifecycle,
        perluEskalasi = r?.needsEscalation ?: false,
        tenggatInstan = instan(p.targetEndDate),
    )
    return when (p.lifecycle) {
        "DIARSIPKAN" -> StatusTampil(Nada.NEUTRAL, "Diarsipkan", null, h.progres)
        "DITUTUP" -> StatusTampil(Nada.DONE, "Ditutup", null, h.progres)
        else -> StatusTampil(nadaDari(h.status), null, h.alasan, h.progres)
    }
}

fun nadaDari(s: MkStatusDomain): Nada = when (s) {
    MkStatusDomain.ON -> Nada.ON
    MkStatusDomain.RISK -> Nada.RISK
    MkStatusDomain.LATE -> Nada.LATE
    MkStatusDomain.DONE -> Nada.DONE
    MkStatusDomain.NEUTRAL -> Nada.NEUTRAL
}

/** Port `answerFor`: satu kalimat jawaban di atas daftar. */
fun kalimatJawaban(siklus: String, total: Int, tersaring: Boolean): String {
    if (total == 0) {
        if (tersaring) return "Tidak ada proyek yang cocok dengan saringan ini."
        return when (siklus) {
            "DIUSULKAN" -> "Tidak ada pengajuan yang menunggu persetujuan."
            "DITOLAK" -> "Tidak ada pengajuan yang ditolak."
            "DITUTUP" -> "Belum ada proyek yang ditutup."
            "DIARSIPKAN" -> "Belum ada proyek yang diarsipkan."
            "AKTIF" -> "Belum ada proyek aktif."
            else -> "Belum ada proyek."
        }
    }
    val n = angka(total)
    val akhiran = if (tersaring) " yang cocok dengan saringan" else ""
    return when (siklus) {
        "DIUSULKAN" -> "$n pengajuan menunggu persetujuan$akhiran."
        "DITOLAK" -> "$n pengajuan ditolak$akhiran."
        "DITUTUP" -> "$n proyek ditutup$akhiran."
        "DIARSIPKAN" -> "$n proyek diarsipkan$akhiran."
        "AKTIF" -> "$n proyek aktif$akhiran."
        else -> "$n proyek di semua status$akhiran."
    }
}

/** Port `supportFor`: kalimat dukungan dari ringkasan server. */
fun kalimatDukungan(s: RingkasanProyekDto?): String? {
    if (s == null) return null
    val bagian = buildList {
        if (s.waiting > 0) add("${s.waiting} pengajuan menunggu keputusan Anda")
        if (s.resubmit > 0) add("${s.resubmit} pengajuan bisa Anda ajukan ulang")
        if (s.late > 0) add("${s.late} terlambat")
        if (s.risk > 0) add("${s.risk} perlu perhatian")
        if (s.silent > 0) add("${s.silent} belum punya laporan harian")
    }
    if (bagian.isNotEmpty()) return bagian.joinToString(", ") + "."
    if (s.running > 0) return "Semua proyek aktif sesuai jadwal."
    return null
}

/** Port `approvalSteps`: siapa sudah, siapa giliran, siapa menolak. */
fun langkahPersetujuan(p: ProyekDto): List<LangkahPersetujuan> = p.approvals.map { a ->
    val setuju = a.decision == "DISETUJUI"
    val tolak = a.decision == "DITOLAK"
    val giliran = a.role == p.pendingRole
    val siapa = a.decidedByName?.let { nama -> nama + (tanggalJam(a.decidedAt)?.let { " · $it" } ?: "") }
    val catatan = a.note?.takeIf { it.isNotBlank() }
    LangkahPersetujuan(
        judul = labelPenyetuju(a.role),
        sub = siapa,
        keadaan = when {
            setuju -> LangkahPersetujuan.Keadaan.SELESAI
            tolak -> LangkahPersetujuan.Keadaan.DITOLAK
            giliran -> LangkahPersetujuan.Keadaan.GILIRAN
            else -> LangkahPersetujuan.Keadaan.MENUNGGU
        },
        meta = when {
            setuju -> if (catatan != null) "Disetujui · $catatan" else "Disetujui"
            tolak -> if (catatan != null) "Ditolak · $catatan" else "Ditolak"
            giliran -> "Giliran sekarang"
            else -> "Menunggu"
        },
    )
}

/* ------------------------------------------------------------------ */
/* Tanggal & angka (WIB, id-ID)                                         */
/* ------------------------------------------------------------------ */

private val fmtTanggal = DateTimeFormatter.ofPattern("d MMMM yyyy", LOKAL_ID)
private val fmtPendek = DateTimeFormatter.ofPattern("d MMM yyyy", LOKAL_ID)
private val fmtJam = DateTimeFormatter.ofPattern("d MMM yyyy · HH.mm", LOKAL_ID)
private val fmtKunci = DateTimeFormatter.ISO_LOCAL_DATE

fun instan(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** Tanggal kalender WIB dari instan ISO server. */
fun tanggalWib(iso: String?): LocalDate? = instan(iso)?.atZone(ZONA_WIB)?.toLocalDate()

/** "5 Oktober 2026" (formatDate web) atau null. */
fun tanggal(iso: String?): String? = tanggalWib(iso)?.format(fmtTanggal)

/** "5 Okt 2026" atau null. */
fun tanggalPendek(iso: String?): String? = tanggalWib(iso)?.format(fmtPendek)?.replace(".", "")

/** "5 Okt 2026 · 14.20" WIB atau null. */
fun tanggalJam(iso: String?): String? = instan(iso)?.atZone(ZONA_WIB)?.format(fmtJam)?.replace("..", ".")

/** ISO server → "YYYY-MM-DD" WIB untuk isian tanggal (toDateInput web). */
fun kunciTanggal(iso: String?): String = tanggalWib(iso)?.format(fmtKunci).orEmpty()

/** "YYYY-MM-DD" → LocalDate, null bila kosong/rusak. */
fun dariKunci(kunci: String): LocalDate? =
    kunci.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

/** LocalDate → "5 Okt 2026". */
fun tampilKunci(kunci: String): String? = dariKunci(kunci)?.format(fmtPendek)?.replace(".", "")

/** Sisa hari ke tenggat (WIB, per tanggal); negatif = lewat. Port daysUntil web. */
fun sisaHari(iso: String?, hariIni: LocalDate = LocalDate.now(ZONA_WIB)): Long? =
    tanggalWib(iso)?.let { java.time.temporal.ChronoUnit.DAYS.between(hariIni, it) }

/** Angka format id-ID: 1.466. */
fun angka(n: Int): String = String.format(LOKAL_ID, "%,d", n)

/** Inisial dua huruf untuk avatar. */
fun inisial(nama: String?): String {
    val bagian = nama.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        bagian.isEmpty() -> "-"
        bagian.size == 1 -> bagian[0].take(2).uppercase(LOKAL_ID)
        else -> (bagian[0].take(1) + bagian[1].take(1)).uppercase(LOKAL_ID)
    }
}
