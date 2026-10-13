// Teks tenggat Kepatuhan dari data server (BUG-11). Dulu "17.00 WIB" dan
// "Kamis 17.00 WIB" ditulis keras; kini:
//   - tenggat serah mingguan diformat dari week.handoverBy /api/admin/compliance
//     (server sudah memakai weeklyCutoffHour ReportSettings PT);
//   - banner terkunci harian memakai jam batas ReportSettings bila diketahui
//     (panel Aturan pelaporan Statistik), tanpa jam bila 24/7 atau tidak diketahui.
// Padanan web: handoverText() src/components/admin/compliance.tsx.
package id.co.monitorkarya.app.ui.kepatuhan

import java.time.DayOfWeek
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Ringkas aturan pelaporan PT yang memengaruhi teks tenggat. Null di layar =
 * aturan belum diketahui (teks tanpa jam). [jamHarian]/[jamMingguan] null = 24/7.
 */
data class AturanTenggat(
    val jamHarian: Int?,
    val harianBuka: Boolean,
    val jamMingguan: Int?,
    val mingguanBuka: Boolean,
)

private val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")
private val FORMAT_JAM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH.mm").withZone(ZONA_WIB)

/** Nama hari bahasa Indonesia (tetap, tidak bergantung data lokal JVM). */
internal fun namaHari(hari: DayOfWeek): String = when (hari) {
    DayOfWeek.MONDAY -> "Senin"
    DayOfWeek.TUESDAY -> "Selasa"
    DayOfWeek.WEDNESDAY -> "Rabu"
    DayOfWeek.THURSDAY -> "Kamis"
    DayOfWeek.FRIDAY -> "Jumat"
    DayOfWeek.SATURDAY -> "Sabtu"
    DayOfWeek.SUNDAY -> "Minggu"
}

/** Jam batas "17.00 WIB" dari jam bulat (0..23). */
internal fun labelJamWib(jam: Int): String = "${jam.toString().padStart(2, '0')}.00 WIB"

/** "Kamis 17.00 WIB" dari ISO tenggat server; null bila ISO kosong/rusak. */
internal fun hariJamWib(iso: String?): String? {
    val t = cobaIso(iso) ?: return null
    val hari = namaHari(t.atZone(ZONA_WIB).dayOfWeek)
    return "$hari ${FORMAT_JAM.format(t)} WIB"
}

/** Nama hari WIB dari ISO; null bila rusak. */
internal fun hariWib(iso: String?): String? = cobaIso(iso)?.let { namaHari(it.atZone(ZONA_WIB).dayOfWeek) }

/**
 * Kalimat tenggat serah terima mingguan.
 *  - capaian mingguan ditutup → kalimat ditutup;
 *  - tanpa jam batas mingguan (24/7) → hari saja, tanpa jam;
 *  - selain itu hari + jam dari week.handoverBy server.
 */
internal fun teksTenggatMingguan(handoverIso: String?, aturan: AturanTenggat?): String {
    if (aturan != null && !aturan.mingguanBuka) return "Capaian mingguan sedang ditutup melalui aturan pelaporan."
    if (aturan != null && aturan.jamMingguan == null) {
        return hariWib(handoverIso)
            ?.let { "Tenggat serah terima hari $it, tanpa jam batas." }
            ?: "Serah terima mingguan tanpa jam batas."
    }
    return hariJamWib(handoverIso)
        ?.let { "Tenggat serah terima $it." }
        ?: "Tenggat serah terima mengikuti aturan pelaporan perusahaan."
}

/** Banner saat laporan harian hari ini terkunci (compliance.locked). */
internal fun teksBannerTerkunci(aturan: AturanTenggat?): String = when {
    aturan == null -> "Sudah lewat tenggat laporan harian — tombol pengingat aktif lagi besok."
    !aturan.harianBuka -> "Pengisian laporan harian sedang ditutup — tombol pengingat nonaktif."
    aturan.jamHarian == null -> "Laporan harian hari ini sudah dikunci — tombol pengingat nonaktif."
    else -> "Sudah lewat tenggat ${labelJamWib(aturan.jamHarian)} — tombol pengingat aktif lagi besok."
}
