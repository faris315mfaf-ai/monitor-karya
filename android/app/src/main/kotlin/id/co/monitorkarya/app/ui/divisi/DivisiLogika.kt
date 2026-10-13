// Fungsi murni tab Divisi (B1) — port src/components/views/divisions-view.tsx:
// kalimat jawaban/pendukung arsip laporan mingguan, rincian status butir,
// label aspek & prioritas, dan pemetaan peran → mode layar (isian + arsip
// atau arsip saja, can(role,'weekly:input') di src/lib/rbac.ts).
package id.co.monitorkarya.app.ui.divisi

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.network.dto.WeeklyItemDto
import id.co.monitorkarya.designsystem.components.MkStatus
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale

/** Peran dengan kapabilitas weekly:input (ROLE_CAPABILITIES rbac.ts). */
internal val PERAN_ISI_MINGGUAN: Set<Peran> = setOf(Peran.ADMIN_PT, Peran.KEPALA_DIVISI, Peran.TI, Peran.SUPERADMIN)

/** Peran ini menyusun capaian mingguan divisi di tab Divisi (meja isian + arsip). */
internal fun bolehIsiMingguan(peran: Peran): Boolean = peran in PERAN_ISI_MINGGUAN

/** STATUS_OPTIONS divisions-view: nilai statusHeader (null = semua) + label. */
internal val SARINGAN_STATUS_HEADER: List<Pair<String?, String>> = listOf(
    null to "Semua status",
    "DRAFT" to "Draf",
    "MENUNGGU_PERSETUJUAN" to "Menunggu persetujuan",
    "DISETUJUI" to "Disetujui",
    "TERKUNCI" to "Terkunci",
)

/** Ukuran halaman arsip (divisions-view: pageSize 10). */
internal const val UKURAN_HALAMAN_DIVISI = 10

internal fun angkaId(n: Int): String = NumberFormat.getIntegerInstance(Locale.forLanguageTag("id-ID")).format(n)

private val WIB: ZoneId = ZoneId.of("Asia/Jakarta")
private val BULAN_PENDEK = listOf("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")
private val BULAN = listOf(
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
)

private fun wib(iso: String?): ZonedDateTime? = iso?.let {
    runCatching { Instant.parse(it).atZone(WIB) }.getOrNull()
        ?: runCatching { LocalDate.parse(it.take(10)).atStartOfDay(WIB) }.getOrNull()
}

/** "5 Okt" (formatDateShort web). */
internal fun tanggalPendek(iso: String?): String = wib(iso)?.let { "${it.dayOfMonth} ${BULAN_PENDEK[it.monthValue - 1]}" } ?: "-"

/** "5 Oktober 2026" (formatDate web). */
internal fun tanggalSedang(iso: String?): String =
    wib(iso)?.let { "${it.dayOfMonth} ${BULAN[it.monthValue - 1]} ${it.year}" } ?: "-"

/** Kalimat jawaban di atas arsip. */
internal fun jawabanArsip(total: Int, tersaring: Boolean): String = when {
    total == 0 && tersaring -> "Tidak ada laporan mingguan dengan saringan ini."
    total == 0 -> "Belum ada laporan mingguan divisi."
    else -> "${angkaId(total)} laporan mingguan divisi${if (tersaring) " cocok dengan saringan" else " tercatat"}."
}

/** Kalimat pendukung: menunggu/terlambat, atau ajakan membuka laporan. */
internal fun pendukungArsip(menunggu: Int, terlambat: Int, adaLaporan: Boolean): String? {
    val bagian = listOfNotNull(
        menunggu.takeIf { it > 0 }?.let { "$it menunggu persetujuan" },
        terlambat.takeIf { it > 0 }?.let { "$it terlambat" },
    )
    return when {
        bagian.isNotEmpty() -> bagian.joinToString(", ") + "."
        adaLaporan -> "Ketuk laporan untuk membaca butir, capaian, dan kendalanya."
        else -> null
    }
}

/** Jumlah halaman (minimal 1). */
internal fun jumlahHalaman(total: Int, ukuran: Int): Int = if (ukuran <= 0) 1 else maxOf(1, (total + ukuran - 1) / ukuran)

private val URUT_RINCIAN = listOf(
    "SELESAI" to "selesai",
    "ON_PROGRESS" to "berjalan",
    "BELUM_MULAI" to "belum mulai",
    "TERKENDALA" to "terkendala",
    "NA" to "N/A",
)

/** Hitungan butir per status. */
internal fun hitungButir(items: List<WeeklyItemDto>): Map<String, Int> = items.groupingBy { it.status }.eachCount()

/** "2 selesai · 1 berjalan" (BREAKDOWN divisions-view); kosong bila tanpa butir. */
internal fun rincianButir(items: List<WeeklyItemDto>): String {
    val c = hitungButir(items)
    return URUT_RINCIAN.filter { (c[it.first] ?: 0) > 0 }.joinToString(" · ") { "${c[it.first]} ${it.second}" }
}

/** ASPECT_CATEGORY_LABELS constants.ts; cadangan nama dari server. */
internal fun labelAspek(kode: String, nama: String): String = when (kode) {
    "OPS" -> "Operasional"
    "KEU" -> "Keuangan"
    "PAT" -> "Kepatuhan"
    "SDM" -> "SDM"
    "HSE" -> "HSE"
    "PRJ" -> "Proyek"
    "SYS" -> "Sistem"
    "KOM" -> "Komersial"
    else -> nama
}

/** PriorityBadge: label + status (TINGGI late, SEDANG risk, RENDAH info). */
internal fun lencanaPrioritas(kode: String, nama: String): Pair<MkStatus, String> = when (kode) {
    "TINGGI" -> MkStatus.LATE to "Tinggi"
    "SEDANG" -> MkStatus.RISK to "Sedang"
    "RENDAH" -> MkStatus.INFO to "Rendah"
    else -> MkStatus.NEUTRAL to nama
}
