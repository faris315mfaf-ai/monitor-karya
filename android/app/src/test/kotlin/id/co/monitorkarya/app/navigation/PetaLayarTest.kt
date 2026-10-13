package id.co.monitorkarya.app.navigation

import id.co.monitorkarya.app.ui.mejaumum.teksMejaTanpaPt
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.roles.ROLE_TABS
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.core.domain.roles.tabsUntuk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Kelengkapan peta (peran, tab) → layar (B1). Setiap tab ROLE_TABS mendapat
 * layar nyata yang cocok dengan view web; tidak ada layar tunggu.
 */
class PetaLayarTest {

    /** Layar yang boleh muncul untuk satu TabId (padanan TAB_VIEWS shell.tsx). */
    private val sahUntukTab: Map<TabId, Set<LayarTab>> = mapOf(
        TabId.RINGKASAN to setOf(
            LayarTab.DASBOR_ADMIN, LayarTab.RINGKASAN_DIREKTUR, LayarTab.RINGKASAN_GRUP, LayarTab.RINGKASAN_PELAKSANA,
        ),
        TabId.MEJA_KERJA to setOf(LayarTab.MEJA_PIC, LayarTab.MEJA_KADIV, LayarTab.MEJA_ADMIN, LayarTab.MEJA_TANPA_PT),
        TabId.STATISTIK to setOf(LayarTab.STATISTIK),
        TabId.LAPORAN_HARIAN to setOf(LayarTab.LAPORAN_HARIAN),
        TabId.CAPAIAN_MINGGUAN to setOf(LayarTab.CAPAIAN_MINGGUAN),
        TabId.PEMBAGIAN_DIVISI to setOf(LayarTab.DIVISI, LayarTab.TIM_KADIV),
        TabId.PENERIMAAN to setOf(LayarTab.PENERIMAAN),
        TabId.PROYEK to setOf(LayarTab.PROYEK),
        TabId.ESKALASI to setOf(LayarTab.ESKALASI),
        TabId.PERSETUJUAN to setOf(LayarTab.PERSETUJUAN),
        TabId.ENTITAS to setOf(LayarTab.ENTITAS),
        TabId.PERUSAHAAN to setOf(LayarTab.PERUSAHAAN),
        TabId.LOG_AUDIT to setOf(LayarTab.LOG_AUDIT),
        TabId.SISTEM_AKSES to setOf(LayarTab.SISTEM_AKSES),
    )

    @Test
    fun setiap_peran_dan_tab_memuat_layar_yang_sesuai_tab() {
        var kombinasi = 0
        for (peran in Peran.entries) {
            for (tab in tabsUntuk(peran)) {
                for (adaPt in listOf(true, false)) {
                    val layar = layarUntuk(peran, tab, adaPt)
                    assertTrue("$peran/$tab → $layar", layar in sahUntukTab.getValue(tab))
                    kombinasi++
                }
            }
        }
        // 9 peran × tab masing-masing × 2 keadaan PT.
        assertEquals(ROLE_TABS.values.sumOf { it.size } * 2, kombinasi)
    }

    @Test
    fun e2e3_b17_label_bilah_bawah_pendek_seperti_web() {
        assertEquals("Perusahaan", labelPendek(Peran.SUPERADMIN, TabId.PERUSAHAAN))
        assertEquals("Laporan", labelPendek(Peran.TI, TabId.LAPORAN_HARIAN))
        assertEquals("Hari ini", labelPendek(Peran.PIC_PROYEK, TabId.RINGKASAN))
        assertEquals("Tim", labelPendek(Peran.MANAJEMEN, TabId.PEMBAGIAN_DIVISI))
        // Semua label pendek muat di butir bilah bawah (≤ 11 huruf, satu kata).
        for (peran in Peran.entries) {
            for (tab in tabsUntuk(peran)) {
                val l = labelPendek(peran, tab)
                assertTrue("$peran/$tab → $l", l.length <= 11 && '&' !in l)
            }
        }
    }

    @Test
    fun e2e3_b6_tab_pemantau_mendapat_banner_luring_dari_shell() {
        for (peran in listOf(Peran.MANAJEMEN, Peran.AUDITOR, Peran.TI, Peran.SUPERADMIN)) {
            assertTrue(bannerLuringDariShell(layarUntuk(peran, TabId.RINGKASAN, adaPt = false)))
            for (tab in tabsUntuk(peran).filter { it in setOf(TabId.PROYEK, TabId.ESKALASI, TabId.ENTITAS, TabId.LOG_AUDIT) }) {
                assertTrue("$peran/$tab", bannerLuringDariShell(layarUntuk(peran, tab, adaPt = false)))
            }
        }
        // Layar yang sudah memasang banner sendiri tidak mendapat banner ganda.
        assertFalse(bannerLuringDariShell(LayarTab.DASBOR_ADMIN))
        assertFalse(bannerLuringDariShell(LayarTab.LAPORAN_HARIAN))
        assertFalse(bannerLuringDariShell(LayarTab.TIM_KADIV))
        assertFalse(bannerLuringDariShell(LayarTab.PENERIMAAN))
    }

    @Test
    fun celah_yang_diketahui_terisi_layar_web() {
        // Meja kerja: Kadiv = daftar periksa penyerahan; TI/Super Admin = admin bila ber-PT, catatan bila grup.
        assertEquals(LayarTab.MEJA_KADIV, layarUntuk(Peran.KEPALA_DIVISI, TabId.MEJA_KERJA, adaPt = true))
        assertEquals(LayarTab.MEJA_ADMIN, layarUntuk(Peran.TI, TabId.MEJA_KERJA, adaPt = true))
        assertEquals(LayarTab.MEJA_TANPA_PT, layarUntuk(Peran.TI, TabId.MEJA_KERJA, adaPt = false))
        assertEquals(LayarTab.MEJA_TANPA_PT, layarUntuk(Peran.SUPERADMIN, TabId.MEJA_KERJA, adaPt = false))
        assertEquals(LayarTab.MEJA_ADMIN, layarUntuk(Peran.ADMIN_PT, TabId.MEJA_KERJA, adaPt = true))
        // Laporan harian Admin PT/TI/Super Admin = DailyInputView yang sama (proyek cakupan).
        for (p in listOf(Peran.ADMIN_PT, Peran.TI, Peran.SUPERADMIN)) {
            assertEquals(LayarTab.LAPORAN_HARIAN, layarUntuk(p, TabId.LAPORAN_HARIAN, adaPt = false))
        }
        // Capaian mingguan TI/Super Admin = papan mingguan.
        assertEquals(LayarTab.CAPAIAN_MINGGUAN, layarUntuk(Peran.TI, TabId.CAPAIAN_MINGGUAN, adaPt = false))
        // Divisi: divisions-view untuk semua kecuali kepala divisi (tim).
        for (p in Peran.entries.filter { TabId.PEMBAGIAN_DIVISI in tabsUntuk(it) }) {
            val harap = if (p == Peran.KEPALA_DIVISI) LayarTab.TIM_KADIV else LayarTab.DIVISI
            assertEquals(p.name, harap, layarUntuk(p, TabId.PEMBAGIAN_DIVISI, adaPt = true))
        }
        // Ringkasan Direktur entitas = layar Direktur; peran grup lain = Manajemen.
        assertEquals(LayarTab.RINGKASAN_DIREKTUR, layarUntuk(Peran.DIREKTUR_ENTITAS, TabId.RINGKASAN, adaPt = true))
        for (p in listOf(Peran.MANAJEMEN, Peran.DIREKTUR_SDM_GA, Peran.AUDITOR, Peran.TI, Peran.SUPERADMIN)) {
            assertEquals(LayarTab.RINGKASAN_GRUP, layarUntuk(p, TabId.RINGKASAN, adaPt = false))
        }
        assertEquals(LayarTab.DASBOR_ADMIN, layarUntuk(Peran.ADMIN_PT, TabId.RINGKASAN, adaPt = true))
        assertEquals(LayarTab.RINGKASAN_PELAKSANA, layarUntuk(Peran.PIC_PROYEK, TabId.RINGKASAN, adaPt = false))
        assertEquals(LayarTab.RINGKASAN_PELAKSANA, layarUntuk(Peran.KEPALA_DIVISI, TabId.RINGKASAN, adaPt = true))
    }

    @Test
    fun admin_pt_mendapat_tab_statistik_dan_pengaturan_peran_lain_tidak() {
        // D1: Statistik = tab biasa (ROLE_TABS web), bukan tujuan ekstra.
        assertTrue(TabId.STATISTIK in tabsUntuk(Peran.ADMIN_PT))
        assertEquals(LayarTab.STATISTIK, layarUntuk(Peran.ADMIN_PT, TabId.STATISTIK, adaPt = true))
        assertTrue(bolehPengaturan(Peran.ADMIN_PT))
        for (p in Peran.entries.filter { it != Peran.ADMIN_PT }) {
            assertFalse(TabId.STATISTIK in tabsUntuk(p))
            assertFalse(bolehPengaturan(p))
        }
    }

    @Test
    fun divisi_admin_pt_adalah_divisions_view_bukan_statistik() {
        assertEquals(LayarTab.DIVISI, layarUntuk(Peran.ADMIN_PT, TabId.PEMBAGIAN_DIVISI, adaPt = true))
        assertFalse(TabId.PENERIMAAN in tabsUntuk(Peran.ADMIN_PT))
        // Urutan bilah = ROLE_TABS web tanpa 'pesan'.
        assertEquals(
            listOf(
                TabId.RINGKASAN, TabId.MEJA_KERJA, TabId.STATISTIK, TabId.LAPORAN_HARIAN,
                TabId.PROYEK, TabId.PEMBAGIAN_DIVISI, TabId.ESKALASI,
            ),
            tabsUntuk(Peran.ADMIN_PT),
        )
        // Kepala divisi kini punya tab Proyek (web: ajukan proyek).
        assertEquals(LayarTab.PROYEK, layarUntuk(Peran.KEPALA_DIVISI, TabId.PROYEK, adaPt = true))
    }

    @Test
    fun catatan_meja_tanpa_pt_sama_dengan_web() {
        assertEquals(
            "Akun ${Peran.TI.labelIndonesia} tidak terikat pada satu PT, sehingga tidak punya meja kerja harian. " +
                "Pantau perusahaan dari Ringkasan.",
            teksMejaTanpaPt(Peran.TI),
        )
    }

}
