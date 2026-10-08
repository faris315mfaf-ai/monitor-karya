// Port dari src/lib/wib.ts dan src/lib/lock.ts (bagian harian WIB).
// Zona bisnis: Asia/Jakarta (WIB, UTC+7); basis data menyimpan UTC/epoch millis.
package id.co.monitorkarya.core.domain.time

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

object Wib {
    /** Zona WIB — padanan WIB_OFFSET_MS = 7*3600*1000 di wib.ts/lock.ts. */
    val ZONA: ZoneId = ZoneId.of("Asia/Jakarta")

    /** Tanggal hari ini menurut kalender WIB (padanan startOfTodayWIB/toWIB). */
    fun hariIni(): LocalDate = LocalDate.now(ZONA)

    /** Tengah malam WIB tanggal t sebagai epoch millis — nilai kanonik kolom tanggal laporan. */
    fun keEpochMillis(t: LocalDate): Long = t.atStartOfDay(ZONA).toInstant().toEpochMilli()

    /** Kebalikan keEpochMillis: epoch millis menjadi tanggal kalender WIB. */
    fun dariEpochMillis(ms: Long): LocalDate = Instant.ofEpochMilli(ms).atZone(ZONA).toLocalDate()

    /** Batas kunci laporan harian: 17.00 WIB hari t (DAILY_CUTOFF_HOUR = 17 di lock.ts). */
    fun kunciHarian(t: LocalDate): ZonedDateTime = t.atTime(17, 0).atZone(ZONA)

    /** Apakah laporan harian tanggal t sudah terkunci (isDailyLocked di lock.ts). */
    fun terkunciHarian(t: LocalDate, sekarang: ZonedDateTime = ZonedDateTime.now(ZONA)): Boolean =
        !sekarang.isBefore(kunciHarian(t))

    /** Label jam "HH.mm" (pemisah titik) untuk pesan antarmuka, selalu dalam WIB. */
    fun labelJam(z: ZonedDateTime): String =
        DateTimeFormatter.ofPattern("HH.mm").format(z.withZoneSameInstant(ZONA))
}
