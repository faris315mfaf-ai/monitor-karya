package id.co.monitorkarya.app.navigation

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.core.domain.roles.tabsUntuk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** C3-K1 (keputusan pindah rute akar) + C3-R2 (bilah bawah ringkas). */
class GerbangRuteTest {

    @Test
    fun k1_tujuanBelumDiketahui_tidakPindah() {
        assertFalse(perluPindahRute(RUTE_LOGIN, target = null, uidRute = null, uidAkun = null))
    }

    @Test
    fun k1_awalDiLogin_tanpaSesi_tidakPindah() {
        assertFalse(perluPindahRute(RUTE_LOGIN, RUTE_LOGIN, uidRute = null, uidAkun = null))
    }

    @Test
    fun k1_masuk_keluar_masukAkunLain_selaluPindah() {
        // masuk A
        assertTrue(perluPindahRute(RUTE_LOGIN, RUTE_BERANDA, uidRute = null, uidAkun = "A"))
        // keluar
        assertTrue(perluPindahRute(RUTE_BERANDA, RUTE_LOGIN, uidRute = "A", uidAkun = null))
        // masuk B
        assertTrue(perluPindahRute(RUTE_LOGIN, RUTE_BERANDA, uidRute = null, uidAkun = "B"))
    }

    @Test
    fun k1_berandaSamaTetapiAkunBerganti_tetapPindah() {
        assertTrue(perluPindahRute(RUTE_BERANDA, RUTE_BERANDA, uidRute = "A", uidAkun = "B"))
    }

    @Test
    fun k1_pemulihanProsesAkunSama_tidakMembuangTumpukan() {
        assertFalse(perluPindahRute(RUTE_BERANDA, RUTE_BERANDA, uidRute = "A", uidAkun = "A"))
    }

    @Test
    fun k1_gantiSandiSelesai_pindahKeBeranda() {
        assertTrue(perluPindahRute(RUTE_GANTI_SANDI, RUTE_BERANDA, uidRute = "A", uidAkun = "A"))
    }

    @Test
    fun r2_manajemen_persetujuanDiBilahBawah() {
        val (bawah, lain) = bagiTabBawah(Peran.MANAJEMEN, tabsUntuk(Peran.MANAJEMEN), 5)
        assertEquals(listOf(TabId.RINGKASAN, TabId.PROYEK, TabId.PERSETUJUAN, TabId.PEMBAGIAN_DIVISI), bawah)
        assertEquals(listOf(TabId.ESKALASI, TabId.ENTITAS, TabId.LOG_AUDIT), lain)
    }

    @Test
    fun r2_direkturEntitas_urutanSpesifikasi() {
        val (bawah, lain) = bagiTabBawah(Peran.DIREKTUR_ENTITAS, tabsUntuk(Peran.DIREKTUR_ENTITAS), 5)
        assertEquals(listOf(TabId.RINGKASAN, TabId.PROYEK, TabId.ESKALASI, TabId.PEMBAGIAN_DIVISI), bawah)
        assertEquals(listOf(TabId.PERSETUJUAN, TabId.ENTITAS), lain)
    }

    @Test
    fun r2_peranLain_tetapPotongEmpatPlusLainnya() {
        Peran.entries.filter { it != Peran.MANAJEMEN && it != Peran.DIREKTUR_ENTITAS }.forEach { peran ->
            val tabs = tabsUntuk(peran)
            val (bawah, lain) = bagiTabBawah(peran, tabs, 5)
            assertEquals(peran.name, tabs, bawah + lain)
            assertTrue(peran.name, bawah.size <= 5)
            if (lain.isNotEmpty()) assertEquals(peran.name, 4, bawah.size)
        }
    }
}
