// Format angka & waktu id-ID dengan zona WIB (padanan src/lib/format.ts).
// Nama hari/bulan ditulis sendiri supaya hasilnya sama di semua perangkat/JVM
// (data lokal ICU Android dan CLDR JDK kadang berbeda).
package id.co.monitorkarya.feature.ringkasangrup.logika

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeParseException
import kotlin.math.roundToLong

internal object FormatWib {

    val WIB: ZoneId = ZoneId.of("Asia/Jakarta")

    private val BULAN = listOf(
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    )
    private val BULAN_PENDEK = listOf(
        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
    )
    private val HARI = listOf("Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")

    /** ISO (instan "…Z" atau tanggal "YYYY-MM-DD") → waktu WIB; null bila tak terbaca. */
    fun urai(iso: String?): ZonedDateTime? {
        if (iso.isNullOrBlank()) return null
        return try {
            Instant.parse(iso).atZone(WIB)
        } catch (_: DateTimeParseException) {
            try {
                LocalDate.parse(iso.take(10)).atStartOfDay(WIB)
            } catch (_: DateTimeParseException) {
                null
            }
        }
    }

    /** "5 Okt 2026". */
    fun tanggal(iso: String?): String {
        val w = urai(iso) ?: return "-"
        return "${w.dayOfMonth} ${BULAN_PENDEK[w.monthValue - 1]} ${w.year}"
    }

    /** "Senin, 5 Oktober 2026". */
    fun tanggalPanjang(w: ZonedDateTime): String =
        "${HARI[w.dayOfWeek.value - 1]}, ${w.dayOfMonth} ${BULAN[w.monthValue - 1]} ${w.year}"

    /** "14.20". */
    fun jam(iso: String?): String {
        val w = urai(iso) ?: return "-"
        return "%02d.%02d".format(w.hour, w.minute)
    }

    /** formatRelative web: "Baru saja", "5 menit lalu", "Kemarin", "3 hari lalu", lalu tanggal. */
    fun relatif(iso: String?, sekarang: ZonedDateTime = ZonedDateTime.now(WIB)): String {
        val w = urai(iso) ?: return "-"
        val detik = java.time.Duration.between(w, sekarang).seconds
        val menit = detik / 60
        val jam = menit / 60
        val hari = jam / 24
        return when {
            hari > 7 -> tanggal(iso)
            hari == 1L -> "Kemarin"
            hari > 0 -> "$hari hari lalu"
            jam > 0 -> "$jam jam lalu"
            menit > 0 -> "$menit menit lalu"
            else -> "Baru saja"
        }
    }

    /** 1466 → "1.466". */
    fun angka(n: Number): String {
        val bulat = n.toDouble().roundToLong()
        val teks = kotlin.math.abs(bulat).toString().reversed().chunked(3).joinToString(".").reversed()
        return if (bulat < 0) "-$teks" else teks
    }

    /** 68.54 → "68,5"; 70.0 → "70"; -0.5 → "-0,5" (maks satu desimal, koma desimal). */
    fun desimal(n: Double): String {
        val r = Math.round(n * 10) / 10.0
        return if (r == Math.floor(r)) angka(r) else {
            // Tanda ditulis terpisah: bagian bulat -0 kehilangan tandanya (C4 P3-11).
            val tanda = if (r < 0) "-" else ""
            val bulat = angka(kotlin.math.floor(kotlin.math.abs(r)))
            val pecahan = Math.round(kotlin.math.abs(r) * 10) % 10
            "$tanda$bulat,$pecahan"
        }
    }
}
