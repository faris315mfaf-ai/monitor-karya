package id.co.monitorkarya.app.ui.tim

import id.co.monitorkarya.core.data.repo.KunciDraf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** G1: draf otomatis poin Ringkasan untuk Direktur. */
class DrafRingkasanTest {

    private fun data(terkirim: Boolean = false, blokir: String? = null) = RingkasanDirekturUi(
        divisiId = "d1", divisiNama = "SDM", mingguKunci = "2026-W42", isoMinggu = 42,
        batasSerahIso = "", kunciIso = "", outputDiterima = 0, targetOutput = 0, proyekSesuai = 0,
        totalProyek = 0, kendalaTerbuka = 0, menungguReview = 0, terkirim = terkirim,
        poinTersimpan = null, poinOtomatis = listOf("a"), terkirimIso = null, diperbaruiIso = null,
        direktur = emptyList(), terblokirPesan = blokir, undoMenit = 15,
    )

    @Test
    fun kunci_per_divisi_per_minggu() {
        assertEquals(KunciDraf(KunciDraf.RINGKASAN_DIREKTUR, "d1", "2026-W42"), kunciDrafRingkasan(data()))
    }

    @Test
    fun hanya_poin_berubah_pada_ringkasan_terbuka_yang_menjadi_draf() {
        assertNull(isiDrafRingkasan(listOf("a"), listOf("a"), bolehSunting = true))
        assertNotNull(isiDrafRingkasan(listOf("a", "b"), listOf("a"), bolehSunting = true))
        assertNull(isiDrafRingkasan(listOf("a", "b"), listOf("a"), bolehSunting = false))
        assertTrue(bolehSuntingRingkasan(data()))
        assertFalse(bolehSuntingRingkasan(data(terkirim = true)))
        assertFalse(bolehSuntingRingkasan(data(blokir = "Terkunci")))
    }

    @Test
    fun json_poin_bolak_balik_dan_dibatasi() {
        val poin = listOf("Satu", "", "Tiga")
        assertEquals(poin, poinDariJson(poinKeJson(poin)))
        val panjang = listOf("x".repeat(400), "b", "c", "d")
        val pulih = poinDariJson(poinKeJson(panjang))!!
        assertEquals(POIN_MAKS, pulih.size)
        assertEquals(POIN_MAKS_HURUF, pulih[0].length)
        assertNull(poinDariJson("rusak"))
        assertNull(poinDariJson("""{"poin":[]}"""))
    }
}
