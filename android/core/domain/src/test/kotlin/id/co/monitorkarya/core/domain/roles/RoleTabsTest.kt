package id.co.monitorkarya.core.domain.roles

import id.co.monitorkarya.core.domain.model.Peran
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * D1: paritas ROLE_TABS Android dengan src/lib/rbac.ts. [WEB_ROLE_TABS] adalah
 * salinan LITERAL web (16 Okt 2026, model subholding) — bila web berubah, perbarui salinan ini
 * dan RoleTabs.kt bersamaan. Pengecualian tunggal: 'pesan' (ikon top bar).
 */
class RoleTabsTest {

    private val WEB_ROLE_TABS: Map<String, List<String>> = mapOf(
        "PIC_PROYEK" to listOf("dashboard", "pesan", "work-desk", "daily-input", "projects"),
        "KEPALA_DIVISI" to listOf("dashboard", "pesan", "work-desk", "weekly-input", "divisions", "projects"),
        "ADMIN_PT" to listOf(
            "dashboard", "pesan", "work-desk", "statistik", "daily-input", "projects", "divisions", "escalations",
        ),
        "DIREKTUR_ENTITAS" to listOf(
            "dashboard", "pesan", "projects", "divisions", "escalations", "approvals", "entities",
        ),
        "DIREKTUR_SDM_GA" to listOf("dashboard", "pesan", "projects", "divisions", "escalations", "entities", "audit"),
        "TI" to listOf(
            "dashboard", "pesan", "work-desk", "inbox", "daily-input", "weekly-input", "projects", "divisions",
            "escalations", "entities", "audit", "system",
        ),
        "SUPERADMIN" to listOf("companies", "pesan", "escalations", "audit", "system"),
        "MANAJEMEN" to listOf("sh-overview"),
        "AUDITOR" to listOf("dashboard", "pesan", "projects", "divisions", "entities", "audit"),
        "ADMIN_SUBHOLDING" to listOf("sh-dashboard", "sh-inbox", "sh-history"),
        "SUPERVISOR" to listOf("sh-review"),
        "SUPERUSER" to listOf("sh-overview"),
    )

    /** NAV_TABS id (constants.ts) → TabId; 'pesan' sengaja tidak ada. */
    private val NAV_KE_TAB: Map<String, TabId> = mapOf(
        "dashboard" to TabId.RINGKASAN,
        "companies" to TabId.PERUSAHAAN,
        "work-desk" to TabId.MEJA_KERJA,
        "statistik" to TabId.STATISTIK,
        "daily-input" to TabId.LAPORAN_HARIAN,
        "weekly-input" to TabId.CAPAIAN_MINGGUAN,
        "inbox" to TabId.PENERIMAAN,
        "projects" to TabId.PROYEK,
        "divisions" to TabId.PEMBAGIAN_DIVISI,
        "approvals" to TabId.PERSETUJUAN,
        "escalations" to TabId.ESKALASI,
        "entities" to TabId.ENTITAS,
        "audit" to TabId.LOG_AUDIT,
        "system" to TabId.SISTEM_AKSES,
        "sh-dashboard" to TabId.SH_DASHBOARD,
        "sh-inbox" to TabId.SH_INBOX,
        "sh-history" to TabId.SH_HISTORY,
        "sh-review" to TabId.SH_REVIEW,
        "sh-overview" to TabId.SH_OVERVIEW,
    )

    @Test
    fun role_tabs_sama_dengan_web_kecuali_pesan_dan_urutan_dipertahankan() {
        assertEquals(WEB_ROLE_TABS.keys, Peran.entries.map { it.name }.toSet())
        for (peran in Peran.entries) {
            val harap = WEB_ROLE_TABS.getValue(peran.name)
                .filter { it != "pesan" }
                .map { NAV_KE_TAB[it] ?: error("NavTabId '$it' belum punya TabId") }
            assertEquals(peran.name, harap, tabsUntuk(peran))
        }
    }

    @Test
    fun setiap_tab_id_dipakai_paling_tidak_satu_peran() {
        val terpakai = ROLE_TABS.values.flatten().toSet()
        assertEquals(TabId.entries.toSet(), terpakai)
        assertEquals(TabId.entries.toSet(), NAV_KE_TAB.values.toSet())
    }

    @Test
    fun admin_pt_punya_statistik_tanpa_penerimaan_dan_kadiv_punya_proyek() {
        assertTrue(bolehLihatTab(Peran.ADMIN_PT, TabId.STATISTIK))
        assertFalse(bolehLihatTab(Peran.ADMIN_PT, TabId.PENERIMAAN))
        assertTrue(bolehLihatTab(Peran.KEPALA_DIVISI, TabId.PROYEK))
        assertEquals("Statistik", TabId.STATISTIK.label)
        for (p in Peran.entries.filter { it != Peran.ADMIN_PT }) {
            assertFalse(p.name, bolehLihatTab(p, TabId.STATISTIK))
        }
    }
}
