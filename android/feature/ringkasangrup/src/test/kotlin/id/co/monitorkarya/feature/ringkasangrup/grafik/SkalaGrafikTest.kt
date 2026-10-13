package id.co.monitorkarya.feature.ringkasangrup.grafik

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SkalaGrafikTest {

    @Test
    fun batasRapi_kelipatan_1_2_5() {
        assertEquals(1.0, SkalaGrafik.batasRapi(0.0), 0.0)
        assertEquals(1.0, SkalaGrafik.batasRapi(-5.0), 0.0)
        assertEquals(10.0, SkalaGrafik.batasRapi(7.0), 0.0)
        assertEquals(20.0, SkalaGrafik.batasRapi(12.0), 0.0)
        assertEquals(50.0, SkalaGrafik.batasRapi(31.0), 0.0)
        assertEquals(100.0, SkalaGrafik.batasRapi(92.0), 0.0)
        assertEquals(100.0, SkalaGrafik.batasRapi(100.0), 0.0)
        assertEquals(200.0, SkalaGrafik.batasRapi(142.0), 0.0)
    }

    @Test
    fun porsi_terpotong_0_sampai_1() {
        assertEquals(0.5f, SkalaGrafik.porsi(5.0, 10.0), 0f)
        assertEquals(1f, SkalaGrafik.porsi(15.0, 10.0), 0f)
        assertEquals(0f, SkalaGrafik.porsi(-1.0, 10.0), 0f)
        assertEquals(0f, SkalaGrafik.porsi(5.0, 0.0), 0f)
    }

    @Test
    fun busurDonat_menjumlah_360_dan_mulai_jam_12() {
        val b = SkalaGrafik.busurDonat(listOf(1.0, 1.0, 2.0))
        assertEquals(-90f, b[0].mulai, 0.001f)
        assertEquals(90f, b[0].sapuan, 0.001f)
        assertEquals(0f, b[1].mulai, 0.001f)
        assertEquals(180f, b[2].sapuan, 0.001f)
        assertEquals(360f, b.sumOf { it.sapuan.toDouble() }.toFloat(), 0.001f)
    }

    @Test
    fun busurDonat_nilai_nol_tetap_berindeks_dan_celah_dipotong() {
        val b = SkalaGrafik.busurDonat(listOf(3.0, 0.0, 1.0), celah = 2f)
        assertEquals(3, b.size)
        assertEquals(0f, b[1].sapuan, 0f)
        assertEquals(268f, b[0].sapuan, 0.001f)
        assertEquals(-89f, b[0].mulai, 0.001f)
        // Semua nol → tanpa busur.
        assertTrue(SkalaGrafik.busurDonat(listOf(0.0, 0.0)).all { it.sapuan == 0f })
        // Satu nilai saja → lingkaran penuh tanpa celah.
        assertEquals(360f, SkalaGrafik.busurDonat(listOf(5.0), celah = 2f).first().sapuan, 0.001f)
    }

    @Test
    fun titikTren_memetakan_nilai_ke_koordinat() {
        val t = SkalaGrafik.titikTren(listOf(0.0, 50.0, 100.0), lebar = 220f, tinggi = 120f, batas = 100.0, tepiX = 10f, tepiAtas = 20f)
        assertEquals(10f, t[0].x, 0.001f)
        assertEquals(110f, t[1].x, 0.001f)
        assertEquals(210f, t[2].x, 0.001f)
        assertEquals(120f, t[0].y, 0.001f)
        assertEquals(70f, t[1].y, 0.001f)
        assertEquals(20f, t[2].y, 0.001f)
        val satu = SkalaGrafik.titikTren(listOf(40.0), 200f, 100f, 100.0)
        assertEquals(100f, satu.first().x, 0.001f)
        assertTrue(SkalaGrafik.titikTren(emptyList(), 100f, 100f, 1.0).isEmpty())
    }

    @Test
    fun indeksDariX_dan_persenBagian() {
        assertEquals(0, SkalaGrafik.indeksDariX(5f, 400f, 4))
        assertEquals(2, SkalaGrafik.indeksDariX(250f, 400f, 4))
        assertEquals(3, SkalaGrafik.indeksDariX(999f, 400f, 4))
        assertEquals(-1, SkalaGrafik.indeksDariX(5f, 400f, 0))
        assertEquals(33, SkalaGrafik.persenBagian(1, 3))
        assertEquals(0, SkalaGrafik.persenBagian(1, 0))
    }

    @Test
    fun langkahLabel_selang_bila_teks_lebih_lebar_dari_slot() {
        assertEquals(1, SkalaGrafik.langkahLabel(30f, 40f))
        assertEquals(1, SkalaGrafik.langkahLabel(32f, 40f, celah = 8f))
        assertEquals(2, SkalaGrafik.langkahLabel(33f, 40f, celah = 8f))
        assertEquals(3, SkalaGrafik.langkahLabel(100f, 40f))
        // Masukan rusak/nol → semua ditulis.
        assertEquals(1, SkalaGrafik.langkahLabel(30f, 0f))
        assertEquals(1, SkalaGrafik.langkahLabel(Float.NaN, 40f))
        assertEquals(1, SkalaGrafik.langkahLabel(0f, 40f))
    }

    @Test
    fun indeksTampil_tertambat_ke_akhir_dan_terpilih_selalu_tertulis() {
        assertEquals(setOf(0, 1, 2, 3, 4, 5), SkalaGrafik.indeksTampil(6, 1, 5))
        // Langkah 2, terpilih terakhir: 5, 3, 1.
        assertEquals(setOf(1, 3, 5), SkalaGrafik.indeksTampil(6, 2, 5))
        // Terpilih 2 (bukan tambatan): tetangga 1 dan 3 dilewati agar tidak menimpa.
        assertEquals(setOf(2, 5), SkalaGrafik.indeksTampil(6, 2, 2))
        // Terpilih di luar rentang → hanya tambatan.
        assertEquals(setOf(0, 3, 6), SkalaGrafik.indeksTampil(7, 3, -1))
        assertTrue(SkalaGrafik.indeksTampil(0, 2, 0).isEmpty())
    }
}
