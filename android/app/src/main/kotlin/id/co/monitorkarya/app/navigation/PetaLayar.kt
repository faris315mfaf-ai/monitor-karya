// Peta (peran, tab) → layar nyata (B1, 13 Okt 2026). Fungsi murni supaya
// kelengkapannya diuji (PetaLayarTest): setiap kombinasi ROLE_TABS memuat
// layar dengan paritas web, tanpa layar tunggu "menyusul". Padanan web:
// TAB_VIEWS di src/components/shell.tsx + percabangan peran di tiap view
// (dashboard-view → role-dashboards/oversight-dashboard, work-desk-view,
// divisions-view, statistik-view). D1: Statistik kini TabId biasa (paritas
// ROLE_TABS web); tujuan di luar ROLE_TABS hanya Pengaturan → meja akun
// ([bolehPengaturan], ikon top bar).
package id.co.monitorkarya.app.navigation

import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.roles.TabId

/** Layar yang dipasang untuk satu (peran, tab). */
enum class LayarTab {
    /** DashboardAdminScreen — dasbor penerusan Admin PT. */
    DASBOR_ADMIN,

    /** RingkasanDirekturTab — layar Direktur (saringan divisi), jatuh ke grup bila tanpa divisi. */
    RINGKASAN_DIREKTUR,

    /** RingkasanGrupTab — layar Manajemen/pemantau grup. */
    RINGKASAN_GRUP,

    /** RingkasanPelaksanaScreen — role-dashboards web (PIC "Hari ini", Kepala divisi) dari /api/my-dashboard. */
    RINGKASAN_PELAKSANA,

    /** MejaKerjaScreen — tugas & laporan PIC hari ini. */
    MEJA_PIC,

    /** MejaKadivScreen — daftar periksa penyerahan capaian mingguan. */
    MEJA_KADIV,

    /** MejaKerjaAdminScreen — pemeriksaan laporan masuk PT (akun terikat satu PT). */
    MEJA_ADMIN,

    /** MejaTanpaPtScreen — catatan web untuk akun tanpa PT (TI/Super Admin grup). */
    MEJA_TANPA_PT,

    /** LaporanHarianScreen — DailyInputView (PIC: proyeknya; Admin PT/TI/Super Admin: proyek cakupannya). */
    LAPORAN_HARIAN,

    /** MingguanScreen — papan capaian mingguan (DivisionWeeklyDesk). */
    CAPAIAN_MINGGUAN,

    /** TimScreen — ringkasan tim kepala divisi. */
    TIM_KADIV,

    /** DivisiScreen — divisions-view (meja isian bila weekly:input + arsip laporan mingguan). */
    DIVISI,

    /** StatistikAdminScreen — statistik-view: kepatuhan per divisi + peta panas 10 hari. */
    STATISTIK,

    PENERIMAAN,
    PROYEK,
    ESKALASI,
    PERSETUJUAN,
    ENTITAS,
    PERUSAHAAN,
    LOG_AUDIT,
    SISTEM_AKSES,

    // Model subholding — penampung "buka versi web" sampai layar aslinya
    // dibangun: Fase 2 (SH_DASHBOARD/SH_INBOX/SH_HISTORY), Fase 3 (SH_REVIEW),
    // Fase 4 (SH_OVERVIEW).
    SH_DASHBOARD,
    SH_INBOX,
    SH_HISTORY,
    SH_REVIEW,
    SH_OVERVIEW,
}

/** Peran pemantau grup yang memakai layar Manajemen di Ringkasan. */
private val PERAN_RINGKASAN_GRUP = setOf(
    Peran.MANAJEMEN,
    Peran.DIREKTUR_SDM_GA,
    Peran.AUDITOR,
    Peran.TI,
    Peran.SUPERADMIN,
)

/**
 * Layar untuk [tab] peran [peran]. [adaPt] = akun terikat satu PT
 * (scopeEntityId) — meja kerja Admin hanya berlaku untuk akun ber-PT, sama
 * dengan work-desk-view web.
 */
fun layarUntuk(peran: Peran, tab: TabId, adaPt: Boolean): LayarTab = when (tab) {
    TabId.RINGKASAN -> when {
        peran == Peran.ADMIN_PT -> LayarTab.DASBOR_ADMIN
        peran == Peran.DIREKTUR_ENTITAS -> LayarTab.RINGKASAN_DIREKTUR
        peran in PERAN_RINGKASAN_GRUP -> LayarTab.RINGKASAN_GRUP
        else -> LayarTab.RINGKASAN_PELAKSANA
    }
    TabId.MEJA_KERJA -> when {
        peran == Peran.PIC_PROYEK -> LayarTab.MEJA_PIC
        peran == Peran.KEPALA_DIVISI -> LayarTab.MEJA_KADIV
        adaPt -> LayarTab.MEJA_ADMIN
        else -> LayarTab.MEJA_TANPA_PT
    }
    TabId.STATISTIK -> LayarTab.STATISTIK
    TabId.LAPORAN_HARIAN -> LayarTab.LAPORAN_HARIAN
    TabId.CAPAIAN_MINGGUAN -> LayarTab.CAPAIAN_MINGGUAN
    TabId.PEMBAGIAN_DIVISI -> if (peran == Peran.KEPALA_DIVISI) LayarTab.TIM_KADIV else LayarTab.DIVISI
    TabId.PENERIMAAN -> LayarTab.PENERIMAAN
    TabId.PROYEK -> LayarTab.PROYEK
    TabId.ESKALASI -> LayarTab.ESKALASI
    TabId.PERSETUJUAN -> LayarTab.PERSETUJUAN
    TabId.ENTITAS -> LayarTab.ENTITAS
    TabId.PERUSAHAAN -> LayarTab.PERUSAHAAN
    TabId.LOG_AUDIT -> LayarTab.LOG_AUDIT
    TabId.SISTEM_AKSES -> LayarTab.SISTEM_AKSES
    TabId.SH_DASHBOARD -> LayarTab.SH_DASHBOARD
    TabId.SH_INBOX -> LayarTab.SH_INBOX
    TabId.SH_HISTORY -> LayarTab.SH_HISTORY
    TabId.SH_REVIEW -> LayarTab.SH_REVIEW
    TabId.SH_OVERVIEW -> LayarTab.SH_OVERVIEW
}

/**
 * Pengaturan (settings-dialog.tsx) memuat meja akun untuk pengelola akun.
 * Admin PT (accounts:manage) satu-satunya yang membutuhkannya di ponsel —
 * Super Admin mengelola akun di tab Perusahaan & akun.
 */
fun bolehPengaturan(peran: Peran): Boolean = peran == Peran.ADMIN_PT

/**
 * ROLE_COMPACT_TABS rbac.ts (C3-R2): peran dengan set tab ringkas di
 * spesifikasi — empat tab utama berurutan, sisanya ke "Lainnya".
 */
private val TAB_RINGKAS: Map<Peran, List<TabId>> = mapOf(
    // Manajemen tidak lagi di sini: sejak model subholding (16 Okt 2026) tabnya
    // hanya sh-overview, jadi set ringkas lamanya akan menghasilkan bilah kosong.
    Peran.DIREKTUR_ENTITAS to listOf(TabId.RINGKASAN, TabId.PROYEK, TabId.ESKALASI, TabId.PEMBAGIAN_DIVISI),
)

/**
 * Bagi [tabs] peran ke bilah bawah dan Sheet "Lainnya". Peran ber-set ringkas
 * (padanan compactTabsFor web, disaring canSeeTab) memakai urutan itu; peran
 * lain: semua tab bila muat [maksButir], selain itu (maksButir − 1) tab
 * pertama + "Lainnya".
 */
fun bagiTabBawah(peran: Peran, tabs: List<TabId>, maksButir: Int): Pair<List<TabId>, List<TabId>> {
    val ringkas = TAB_RINGKAS[peran]?.filter { it in tabs }
    if (ringkas != null) return ringkas to tabs.filter { it !in ringkas }
    return if (tabs.size <= maksButir) {
        tabs to emptyList()
    } else {
        tabs.take(maksButir - 1) to tabs.drop(maksButir - 1)
    }
}

/**
 * Label pendek bilah bawah ponsel — padanan `NAV_TABS[].short` web
 * (constants.ts) + tabLabel(role, id, short = true) di shell.tsx. E2E-3 B17:
 * label penuh ("Perusahaan & akun", "Laporan harian") terpotong tanpa elipsis
 * di bilah bawah. Label penuh tetap dipakai di Sheet "Lainnya".
 */
fun labelPendek(peran: Peran, tab: TabId): String = when (tab) {
    TabId.RINGKASAN -> if (peran == Peran.PIC_PROYEK) "Hari ini" else "Ringkasan"
    TabId.MEJA_KERJA -> "Kerja"
    TabId.STATISTIK -> "Statistik"
    TabId.LAPORAN_HARIAN -> "Laporan"
    TabId.PROYEK -> "Proyek"
    TabId.PEMBAGIAN_DIVISI -> if (peran == Peran.MANAJEMEN) "Tim" else "Divisi"
    TabId.CAPAIAN_MINGGUAN -> "Mingguan"
    TabId.PENERIMAAN -> "Masuk"
    TabId.ESKALASI -> "Eskalasi"
    TabId.PERSETUJUAN -> "Persetujuan"
    TabId.ENTITAS -> "Entitas"
    TabId.PERUSAHAAN -> "Perusahaan"
    TabId.LOG_AUDIT -> "Log"
    TabId.SISTEM_AKSES -> "Sistem"
    // NAV_TABS[].short web untuk tab sh-*.
    TabId.SH_DASHBOARD -> "Dashboard"
    TabId.SH_INBOX -> "Pesan"
    TabId.SH_HISTORY -> "Riwayat"
    TabId.SH_REVIEW -> "Persetujuan"
    TabId.SH_OVERVIEW -> "Dashboard"
}

/**
 * E2E-3 B6: layar pemantau yang tidak memasang banner luring sendiri (modul
 * :feature:* tanpa cache Room, plus Divisi/Meja tanpa PT). Shell memasang
 * [id.co.monitorkarya.app.ui.luring.BannerLuring] di atasnya saat perangkat
 * luring, supaya pengguna tahu data di layar tidak diperbarui.
 */
private val LAYAR_BANNER_SHELL: Set<LayarTab> = setOf(
    LayarTab.RINGKASAN_GRUP,
    LayarTab.RINGKASAN_DIREKTUR,
    LayarTab.PROYEK,
    LayarTab.ESKALASI,
    LayarTab.PERSETUJUAN,
    LayarTab.ENTITAS,
    LayarTab.PERUSAHAAN,
    LayarTab.LOG_AUDIT,
    LayarTab.SISTEM_AKSES,
    LayarTab.DIVISI,
    LayarTab.MEJA_TANPA_PT,
)

fun bannerLuringDariShell(layar: LayarTab): Boolean = layar in LAYAR_BANNER_SHELL
