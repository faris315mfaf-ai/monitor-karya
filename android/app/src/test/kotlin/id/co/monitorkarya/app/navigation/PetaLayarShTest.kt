package id.co.monitorkarya.app.navigation

import id.co.monitorkarya.app.ui.bukaweb.TEKS_PENAMPUNG
import id.co.monitorkarya.app.ui.bukaweb.teksPeranTakDidukung
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.core.domain.roles.tabAwal
import id.co.monitorkarya.core.domain.roles.tabsUntuk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Peran model subholding (Fase 1): tab, layar penampung, bilah bawah, teks layar buka-web. */
class PetaLayarShTest {

    @Test
    fun `tab dan layar tiap peran subholding`() {
        val harap = mapOf(
            Peran.ADMIN_SUBHOLDING to listOf(LayarTab.SH_DASHBOARD, LayarTab.SH_INBOX, LayarTab.SH_HISTORY),
            Peran.SUPERVISOR to listOf(LayarTab.SH_REVIEW),
            Peran.SUPERUSER to listOf(LayarTab.SH_OVERVIEW),
            Peran.MANAJEMEN to listOf(LayarTab.SH_OVERVIEW),
        )
        for ((peran, layar) in harap) {
            assertEquals(peran.name, layar, tabsUntuk(peran).map { layarUntuk(peran, it, adaPt = false) })
        }
        assertEquals(TabId.SH_DASHBOARD, tabAwal(Peran.ADMIN_SUBHOLDING))
        assertEquals(TabId.SH_REVIEW, tabAwal(Peran.SUPERVISOR))
    }

    @Test
    fun `bilah bawah peran subholding tanpa Lainnya dan label pendek seperti web`() {
        for (peran in listOf(Peran.ADMIN_SUBHOLDING, Peran.SUPERVISOR, Peran.SUPERUSER, Peran.MANAJEMEN)) {
            val (bawah, lain) = bagiTabBawah(peran, tabsUntuk(peran), 5)
            assertEquals(peran.name, tabsUntuk(peran), bawah)
            assertTrue(peran.name, lain.isEmpty())
        }
        assertEquals(
            listOf("Dashboard", "Pesan", "Riwayat"),
            tabsUntuk(Peran.ADMIN_SUBHOLDING).map { labelPendek(Peran.ADMIN_SUBHOLDING, it) },
        )
        assertEquals("Persetujuan", labelPendek(Peran.SUPERVISOR, TabId.SH_REVIEW))
    }

    @Test
    fun `teks layar buka web tanpa tanda seru`() {
        val t = teksPeranTakDidukung("KETUA_UMUM")
        assertTrue(t.contains("\"KETUA_UMUM\""))
        assertTrue(t.contains("versi web"))
        assertFalse('!' in t)
        assertFalse('!' in TEKS_PENAMPUNG)
    }
}
