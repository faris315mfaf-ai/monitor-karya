// Fungsi murni kotak masuk — port pesan-view.tsx (kindOf, KIND_META),
// NOTIFICATION_TEMPLATE_LABELS (constants.ts), canSeeTab (rbac.ts) dan
// formatDateTime/formatRelative (format.ts) dengan zona WIB.
package id.co.monitorkarya.feature.pesan.logika

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.core.domain.roles.bolehLihatTab
import id.co.monitorkarya.feature.pesan.data.PesanDto
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Jenis pesan — selalu ikon + kata. */
enum class JenisPesan(val label: String) {
    KOMENTAR("Komentar"),
    PERSETUJUAN("Persetujuan"),
    PENGINGAT("Pengingat"),
    PEMBERITAHUAN("Pemberitahuan"),
}

/** Saringan daftar. */
enum class Saring { SEMUA, BELUM }

/**
 * Jenis ditebak dari template (penulisnya di src/lib/reminders*.ts dan API
 * keputusan); template tak dikenal ditebak dari judul dan isi.
 */
fun jenisPesan(p: PesanDto): JenisPesan {
    val t = p.template
    if (t == "REVIEW_OUTPUT" || t.contains("KOMENTAR")) return JenisPesan.KOMENTAR
    if (t.startsWith("KEPUTUSAN_")) return JenisPesan.PERSETUJUAN
    if (t.startsWith("PENGINGAT_") || t == "ESKALASI_KADIV_HARIAN") return JenisPesan.PENGINGAT
    val teks = "${p.title} ${p.body}".lowercase()
    return when {
        teks.contains("komentar") -> JenisPesan.KOMENTAR
        teks.contains("persetujuan") || teks.contains("disetujui") || teks.contains("ditolak") -> JenisPesan.PERSETUJUAN
        teks.contains("pengingat") || teks.contains("diingatkan") -> JenisPesan.PENGINGAT
        else -> JenisPesan.PEMBERITAHUAN
    }
}

/** NOTIFICATION_TEMPLATE_LABELS; null bila template tidak berlabel. */
fun labelTemplate(template: String): String? = when (template) {
    "PENGINGAT_MINGGUAN_DIVISI" -> "Pengingat laporan mingguan divisi"
    "PENGINGAT_HARIAN_PIC" -> "Pengingat laporan harian PIC"
    "RINGKASAN_MINGGUAN_DIVISI" -> "Ringkasan mingguan kepala divisi"
    else -> null
}

/** NavTabId web → TabId Android (tab tanpa padanan → null). */
fun tabDariWeb(id: String?): TabId? = when (id) {
    "dashboard" -> TabId.RINGKASAN
    "companies" -> TabId.PERUSAHAAN
    "work-desk" -> TabId.MEJA_KERJA
    "statistik" -> TabId.STATISTIK
    "daily-input" -> TabId.LAPORAN_HARIAN
    "weekly-input" -> TabId.CAPAIAN_MINGGUAN
    "inbox" -> TabId.PENERIMAAN
    "projects" -> TabId.PROYEK
    "divisions" -> TabId.PEMBAGIAN_DIVISI
    "approvals" -> TabId.PERSETUJUAN
    "escalations" -> TabId.ESKALASI
    "entities" -> TabId.ENTITAS
    "audit" -> TabId.LOG_AUDIT
    "system" -> TabId.SISTEM_AKSES
    "sh-dashboard" -> TabId.SH_DASHBOARD
    "sh-inbox" -> TabId.SH_INBOX
    "sh-history" -> TabId.SH_HISTORY
    "sh-review" -> TabId.SH_REVIEW
    "sh-overview" -> TabId.SH_OVERVIEW
    else -> null
}

/** Tab tindak lanjut pesan — hanya bila peran boleh melihatnya (canSeeTab). */
fun tabTerkait(p: PesanDto, peran: Peran): TabId? =
    tabDariWeb(p.tab)?.takeIf { bolehLihatTab(peran, it) }

/** Daftar sesuai saringan. */
fun saringPesan(items: List<PesanDto>, s: Saring): List<PesanDto> =
    if (s == Saring.BELUM) items.filter { !it.dibaca } else items

/** Satu kalimat jawaban di atas daftar. */
fun kalimatJawaban(belum: Int): String =
    if (belum > 0) "$belum pesan belum dibaca." else "Semua pesan sudah dibaca."

/**
 * Teks lencana ikon: 1–9, lalu "9+" — sama dengan lonceng dan web (shell.tsx)
 * agar angka yang sama tidak tampil berbeda di dua ikon bersebelahan (C4 P3-2).
 */
fun teksLencana(n: Int): String? = when {
    n <= 0 -> null
    n > 9 -> "9+"
    else -> n.toString()
}

/** Format waktu WIB (tanpa bergantung data lokal perangkat). */
object WaktuPesan {
    val WIB: ZoneId = ZoneId.of("Asia/Jakarta")
    private val BULAN = listOf("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")

    fun urai(iso: String?): ZonedDateTime? {
        if (iso.isNullOrBlank()) return null
        return try {
            Instant.parse(iso).atZone(WIB)
        } catch (_: DateTimeParseException) {
            null
        }
    }

    /** "10 Okt 2026". */
    fun tanggal(iso: String?): String {
        val w = urai(iso) ?: return "-"
        return "${w.dayOfMonth} ${BULAN[w.monthValue - 1]} ${w.year}"
    }

    /** "10 Okt 2026 14.20" (formatDateTime). */
    fun tanggalJam(iso: String?): String {
        val w = urai(iso) ?: return "-"
        // Locale.ROOT: digit Latin di semua locale perangkat (C1-R10).
        return "${tanggal(iso)} ${String.format(Locale.ROOT, "%02d.%02d", w.hour, w.minute)}"
    }

    /**
     * formatRelative: "Baru saja" … "Kemarin" … tanggal bila > 7 hari. Di atas
     * 24 jam memakai selisih HARI KALENDER WIB, bukan kelipatan 24 jam (C1-R9).
     */
    fun relatif(iso: String?, sekarang: ZonedDateTime = ZonedDateTime.now(WIB)): String {
        val w = urai(iso) ?: return "-"
        val menit = Duration.between(w, sekarang).seconds / 60
        val jam = menit / 60
        if (jam < 24) {
            return when {
                jam > 0 -> "$jam jam lalu"
                menit > 0 -> "$menit menit lalu"
                else -> "Baru saja"
            }
        }
        val hari = ChronoUnit.DAYS.between(w.toLocalDate(), sekarang.withZoneSameInstant(WIB).toLocalDate())
        return when {
            hari > 7 -> tanggal(iso)
            hari <= 1L -> "Kemarin"
            else -> "$hari hari lalu"
        }
    }
}
