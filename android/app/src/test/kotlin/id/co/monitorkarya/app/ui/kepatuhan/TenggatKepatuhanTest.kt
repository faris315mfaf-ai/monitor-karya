package id.co.monitorkarya.app.ui.kepatuhan

import id.co.monitorkarya.core.network.dto.KepatuhanResponse
import id.co.monitorkarya.core.network.mkJson
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * BUG-11: teks tenggat Kepatuhan mengikuti data server (week.handoverBy
 * /api/admin/compliance + ReportSettings), bukan "17.00 WIB" tertulis keras.
 */
class TenggatKepatuhanTest {

    private val aturan24 = AturanTenggat(jamHarian = null, harianBuka = true, jamMingguan = null, mingguanBuka = true)
    private val aturan15 = AturanTenggat(jamHarian = 15, harianBuka = true, jamMingguan = 15, mingguanBuka = true)

    @Test
    fun hariJamDariIsoServer() {
        // Kamis 15 Okt 2026 10.00 UTC = 17.00 WIB.
        assertEquals("Kamis 17.00 WIB", hariJamWib("2026-10-15T10:00:00.000Z"))
        // Jam kustom 15.00 WIB = 08.00 UTC.
        assertEquals("Kamis 15.00 WIB", hariJamWib("2026-10-15T08:00:00Z"))
        assertNull(hariJamWib(""))
        assertNull(hariJamWib("bukan-iso"))
    }

    @Test
    fun tenggatMingguanMengikutiHandoverBy() {
        assertEquals(
            "Tenggat serah terima Kamis 15.00 WIB.",
            teksTenggatMingguan("2026-10-15T08:00:00Z", aturan = null),
        )
        assertEquals(
            "Tenggat serah terima Kamis 15.00 WIB.",
            teksTenggatMingguan("2026-10-15T08:00:00Z", aturan15),
        )
    }

    @Test
    fun tenggatMingguan247TanpaJam() {
        val teks = teksTenggatMingguan("2026-10-15T10:00:00Z", aturan24)
        assertEquals("Tenggat serah terima hari Kamis, tanpa jam batas.", teks)
        assertFalse(teks.contains("17.00"))
        assertEquals("Serah terima mingguan tanpa jam batas.", teksTenggatMingguan(null, aturan24))
    }

    @Test
    fun tenggatMingguanDitutupDanIsoRusak() {
        assertEquals(
            "Capaian mingguan sedang ditutup melalui aturan pelaporan.",
            teksTenggatMingguan("2026-10-15T10:00:00Z", aturan15.copy(mingguanBuka = false)),
        )
        assertEquals(
            "Tenggat serah terima mengikuti aturan pelaporan perusahaan.",
            teksTenggatMingguan("", aturan = null),
        )
    }

    @Test
    fun bannerTerkunciMengikutiAturan() {
        assertEquals(
            "Sudah lewat tenggat 15.00 WIB — tombol pengingat aktif lagi besok.",
            teksBannerTerkunci(aturan15),
        )
        assertEquals(
            "Sudah lewat tenggat 09.00 WIB — tombol pengingat aktif lagi besok.",
            teksBannerTerkunci(aturan15.copy(jamHarian = 9)),
        )
        assertEquals(
            "Pengisian laporan harian sedang ditutup — tombol pengingat nonaktif.",
            teksBannerTerkunci(aturan24.copy(harianBuka = false)),
        )
        // 24/7: tidak ada jam yang disebut.
        assertFalse(teksBannerTerkunci(aturan24).contains("WIB"))
        assertFalse(teksBannerTerkunci(null).contains("17.00"))
    }

    @Test
    fun petaMejaMembawaHariRiwayatDanTenggat() {
        val r = mkJson.decodeFromString<KepatuhanResponse>(
            """
            {"today":"2026-10-12T17:00:00.000Z","days":["2026-10-11T17:00:00.000Z","2026-10-12T17:00:00.000Z"],
             "locked":false,
             "week":{"isoYear":2026,"isoWeek":42,"handoverBy":"2026-10-15T08:00:00.000Z","lockAt":"2026-10-16T08:00:00.000Z","handoverPassed":false},
             "totals":{"expected":2,"reported":1,"onLeave":0,"reminded":0,"unassigned":0},
             "divisions":[{"id":"d1","name":"Teknologi","entityId":"pt","head":null,"expected":2,"reported":1,"onLeave":0,
               "missing":[],"history":[50,null],
               "weekly":{"state":"BELUM","statusHeader":null,"submittedAt":null,"approvedAt":null,"forwardedAt":null}}],
             "canRemind":true}
            """.trimIndent(),
        )
        val meja = petaMeja(r)
        assertEquals(listOf("2026-10-11T17:00:00.000Z", "2026-10-12T17:00:00.000Z"), meja.hari)
        assertEquals(listOf(50, null), meja.divisi.single().riwayat)
        assertEquals("2026-10-15T08:00:00.000Z", meja.tenggatSerahIso)
        assertEquals("Tenggat serah terima Kamis 15.00 WIB.", teksPenunjang(meja, ModeKepatuhan.MINGGUAN))
        assertTrue(teksPenunjang(meja, ModeKepatuhan.MINGGUAN, aturan24)!!.contains("tanpa jam batas"))
    }
}
