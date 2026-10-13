package id.co.monitorkarya.designsystem

import androidx.compose.ui.graphics.Color
import id.co.monitorkarya.designsystem.theme.MkAccent
import id.co.monitorkarya.designsystem.theme.MkColorsGelap
import id.co.monitorkarya.designsystem.theme.MkColorsTerang
import id.co.monitorkarya.designsystem.theme.warnaNavigasi
import org.junit.Assert.assertTrue
import org.junit.Test

/** E2E-1 #6 / E2E-2 BUG-07: label tab aktif terbaca di semua aksen dan kedua tema. */
class WarnaNavigasiTest {

    @Test
    fun label_aktif_dan_pasif_lolos_kontras_teks_di_semua_aksen() {
        for (gelap in listOf(false, true)) {
            val c = if (gelap) MkColorsGelap else MkColorsTerang
            for (aksen in MkAccent.entries) {
                val w = warnaNavigasi(c, aksen.colors(gelap))
                assertTrue("label aktif $aksen gelap=$gelap", kontras(w.labelAktif, w.latar) >= 4.5)
                assertTrue("label pasif $aksen gelap=$gelap", kontras(w.labelPasif, w.latar) >= 4.5)
                // Ikon = grafis non-teks: minimal 3:1 terhadap indikator di belakangnya.
                assertTrue("ikon aktif $aksen gelap=$gelap", kontras(w.ikonAktif, w.indikator) >= 3.0)
            }
        }
    }

    @Test
    fun label_aktif_bukan_fill1_lagi() {
        val w = warnaNavigasi(MkColorsTerang, MkAccent.MERAH.terang())
        assertTrue(w.labelAktif != MkColorsTerang.fill1)
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
