package id.co.monitorkarya.designsystem

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.MkKartuPapan
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.sheetFooterIkutGulir
import id.co.monitorkarya.designsystem.components.sheetRingkas
import id.co.monitorkarya.designsystem.components.sheetSamping
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** E2E-1 #3 / E2E-2 BUG-05: tata letak MkSheet dari jendela, bukan area tab. */
class SheetTataLetakTest {

    @Test
    fun ragam_samping_dari_lebar_jendela() {
        assertFalse(sheetSamping(411.dp)) // ponsel potret
        assertTrue(sheetSamping(914.dp)) // ponsel lanskap
        assertTrue(sheetSamping(1280.dp)) // tablet
        assertFalse(sheetSamping(839.dp))
    }

    @Test
    fun tinggi_pendek_menggulir_kepala_dan_footer_bersama() {
        // Lanskap ponsel 411dp tinggi − bilah/keyboard → isi tidak boleh terjepit ke 0.
        assertTrue(sheetRingkas(160.dp))
        assertTrue(sheetRingkas(378.dp))
        assertFalse(sheetRingkas(740.dp))
        assertFalse(sheetRingkas(Dp.Infinity))
    }

    @Test
    fun e2er2_n5_footer_menempel_di_lanskap_ponsel() {
        // Lanskap ponsel ±350dp: kepala ikut gulir, footer tetap menempel.
        assertFalse(sheetFooterIkutGulir(350.dp))
        assertFalse(sheetFooterIkutGulir(Dp.Infinity))
        // Keyboard terbuka di lanskap: semuanya satu gulir.
        assertTrue(sheetFooterIkutGulir(160.dp))
    }

    @Test
    fun kartu_papan_membawa_kata_status_persis() {
        assertEquals("Belum mulai", MkKartuPapan("1", "x", MkStatus.NEUTRAL, 0).let { it.label ?: it.status.label })
        assertEquals("N/A", MkKartuPapan("1", "x", MkStatus.NEUTRAL, 0, label = "N/A").label)
    }
}
