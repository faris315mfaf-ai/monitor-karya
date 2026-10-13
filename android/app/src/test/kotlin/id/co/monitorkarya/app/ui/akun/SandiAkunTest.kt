package id.co.monitorkarya.app.ui.akun

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** C3-T1: sandi setel ulang (bentuk) + nilai rahasia tidak bocor lewat toString. */
class SandiAkunTest {

    @Test
    fun sandiAcak_panjangDanAlfabet() {
        repeat(50) {
            val sandi = sandiAcak()
            assertEquals(PANJANG_SANDI_ACAK, sandi.length)
            assertTrue(sandi.all { it in ALFABET_SANDI })
        }
        assertNotEquals(sandiAcak(), sandiAcak())
    }

    @Test
    fun alfabet_tanpaKarakterMudahTertukar() {
        listOf('0', 'O', '1', 'l', 'I', 'o').forEach { assertFalse("$it", it in ALFABET_SANDI) }
    }

    @Test
    fun rahasia_disamarkanDiToStringPembungkus() {
        val sandi = SandiBaru(idAkun = "u1", username = "citra", sandi = Rahasia("RahasiaSekali9"))
        val sheet = SheetAkun(
            akun = AkunBaris(id = "u1", nama = "Citra", peran = "PIC_PROYEK"),
            bisaKelola = true,
            adalahSaya = false,
            namaPt = "PT Contoh",
            sandiBaru = sandi,
        )
        assertFalse(sandi.toString().contains("RahasiaSekali9"))
        assertFalse(sheet.toString().contains("RahasiaSekali9"))
        assertEquals("RahasiaSekali9", sandi.sandi.nilai)
    }
}
