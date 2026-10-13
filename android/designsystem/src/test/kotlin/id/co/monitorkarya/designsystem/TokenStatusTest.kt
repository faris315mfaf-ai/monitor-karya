package id.co.monitorkarya.designsystem

import androidx.compose.ui.graphics.Color
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.theme.MkColorsGelap
import id.co.monitorkarya.designsystem.theme.MkColorsTerang
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** C4: kosakata status = web (core.tsx STATUS) dan token grafik = tokens.css. */
class TokenStatusTest {

    @Test
    fun ikon_dan_kata_status_sama_dengan_web() {
        assertEquals("Perlu perhatian", MkStatus.RISK.label)
        assertEquals("Outlined.Warning", MkStatus.RISK.ikon.name) // peringatan (segitiga)
        assertEquals("Terlambat", MkStatus.LATE.label)
        assertEquals("Outlined.Schedule", MkStatus.LATE.ikon.name) // waktu (jam)
        assertEquals("Informasi", MkStatus.INFO.label)
        assertEquals("Outlined.Info", MkStatus.INFO.ikon.name)
        assertEquals("Outlined.CheckCircle", MkStatus.ON.ikon.name)
        assertEquals("Outlined.CheckCircle", MkStatus.DONE.ikon.name)
    }

    @Test
    fun token_grafik_terang_dan_gelap_dari_tokens_css() {
        assertEquals(Color(0xFF8E8E93), MkColorsTerang.chartIdle)
        assertEquals(Color(0xFFEDEDF0), MkColorsTerang.chartGrid)
        assertEquals(Color(0xFF6C6C70), MkColorsGelap.chartIdle)
        assertEquals(Color(0xFF222228), MkColorsGelap.chartGrid)
        assertEquals(6, MkColorsTerang.data.size)
        assertEquals(6, MkColorsGelap.data.size)
        assertEquals(Color(0xFF0A66D6), MkColorsTerang.data[0])
        assertEquals(Color(0xFF3CC9C9), MkColorsGelap.data[5])
    }

    @Test
    fun batang_idle_lolos_kontras_3_banding_1_di_surface() {
        // WCAG 1.4.11: chart-idle >= 3:1 terhadap surface di kedua tema (fill-2 lama ~1.3:1).
        assertTrue(kontras(MkColorsTerang.chartIdle, MkColorsTerang.surface) >= 3.0)
        assertTrue(kontras(MkColorsGelap.chartIdle, MkColorsGelap.surface) >= 3.0)
        // Teks tombol nonaktif (ink-2 di fill-1) >= 4.5:1.
        assertTrue(kontras(MkColorsTerang.ink2, MkColorsTerang.fill1) >= 4.5)
        assertTrue(kontras(MkColorsGelap.ink2, MkColorsGelap.fill1) >= 4.5)
    }

    private fun kontras(a: Color, b: Color): Double {
        val la = luminans(a)
        val lb = luminans(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    private fun luminans(c: Color): Double {
        fun kanal(v: Float): Double = if (v <= 0.03928f) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        return 0.2126 * kanal(c.red) + 0.7152 * kanal(c.green) + 0.0722 * kanal(c.blue)
    }
}
