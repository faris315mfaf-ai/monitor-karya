// Port ROLE_TABS + ROLE_DUTIES dari src/lib/rbac.ts (PERSIS, urutan dipertahankan);
// label tab dari NAV_TABS di src/lib/constants.ts.
package id.co.monitorkarya.core.domain.roles

import id.co.monitorkarya.core.domain.model.Peran

/** Padanan NavTabId (constants.ts); label = NAV_TABS[id].label. */
enum class TabId(val label: String) {
    RINGKASAN("Ringkasan"),
    MEJA_KERJA("Meja kerja"),
    LAPORAN_HARIAN("Laporan harian"),
    PROYEK("Proyek"),
    PEMBAGIAN_DIVISI("Divisi"),
    CAPAIAN_MINGGUAN("Capaian mingguan"),
    PENERIMAAN("Penerimaan"),
    ESKALASI("Eskalasi"),
    PERSETUJUAN("Persetujuan"),
    ENTITAS("Entitas"),
    PERUSAHAAN("Perusahaan & akun"),
    LOG_AUDIT("Log aktivitas"),
    SISTEM_AKSES("Sistem & akses"),
}

/** Tab per peran, urut; entri pertama = tab pendarat peran itu (ROLE_TABS rbac.ts). */
val ROLE_TABS: Map<Peran, List<TabId>> = mapOf(
    Peran.PIC_PROYEK to listOf(
        TabId.RINGKASAN, TabId.MEJA_KERJA, TabId.LAPORAN_HARIAN, TabId.PROYEK,
    ),
    Peran.KEPALA_DIVISI to listOf(
        TabId.RINGKASAN, TabId.MEJA_KERJA, TabId.CAPAIAN_MINGGUAN, TabId.PEMBAGIAN_DIVISI,
    ),
    Peran.ADMIN_PT to listOf(
        TabId.RINGKASAN, TabId.MEJA_KERJA, TabId.PENERIMAAN, TabId.LAPORAN_HARIAN,
        TabId.PROYEK, TabId.PEMBAGIAN_DIVISI, TabId.ESKALASI,
    ),
    Peran.DIREKTUR_ENTITAS to listOf(
        TabId.RINGKASAN, TabId.PROYEK, TabId.PEMBAGIAN_DIVISI, TabId.ESKALASI,
        TabId.PERSETUJUAN, TabId.ENTITAS,
    ),
    Peran.DIREKTUR_SDM_GA to listOf(
        TabId.RINGKASAN, TabId.PROYEK, TabId.PEMBAGIAN_DIVISI, TabId.ESKALASI,
        TabId.ENTITAS, TabId.LOG_AUDIT,
    ),
    Peran.TI to listOf(
        TabId.RINGKASAN, TabId.MEJA_KERJA, TabId.PENERIMAAN, TabId.LAPORAN_HARIAN,
        TabId.CAPAIAN_MINGGUAN, TabId.PROYEK, TabId.PEMBAGIAN_DIVISI, TabId.ESKALASI,
        TabId.ENTITAS, TabId.LOG_AUDIT, TabId.SISTEM_AKSES,
    ),
    Peran.SUPERADMIN to listOf(
        TabId.RINGKASAN, TabId.PERUSAHAAN, TabId.PROYEK, TabId.PEMBAGIAN_DIVISI,
        TabId.ESKALASI, TabId.ENTITAS, TabId.MEJA_KERJA, TabId.PENERIMAAN,
        TabId.LAPORAN_HARIAN, TabId.CAPAIAN_MINGGUAN, TabId.LOG_AUDIT, TabId.SISTEM_AKSES,
    ),
    Peran.MANAJEMEN to listOf(
        TabId.RINGKASAN, TabId.ESKALASI, TabId.PROYEK, TabId.PEMBAGIAN_DIVISI,
        TabId.PERSETUJUAN, TabId.ENTITAS, TabId.LOG_AUDIT,
    ),
    Peran.AUDITOR to listOf(
        TabId.RINGKASAN, TabId.PROYEK, TabId.PEMBAGIAN_DIVISI, TabId.ENTITAS, TabId.LOG_AUDIT,
    ),
)

/** FALLBACK_TABS di rbac.ts. */
private val TAB_CADANGAN: List<TabId> = listOf(TabId.RINGKASAN)

/** tabsForRole di rbac.ts. */
fun tabsUntuk(peran: Peran): List<TabId> = ROLE_TABS[peran] ?: TAB_CADANGAN

/** defaultTabForRole di rbac.ts: tab pertama = tab pendarat. */
fun tabAwal(peran: Peran): TabId = tabsUntuk(peran).first()

/** canSeeTab di rbac.ts. */
fun bolehLihatTab(peran: Peran, tab: TabId): Boolean = tabsUntuk(peran).contains(tab)

/** Satu kalimat tugas peran di dashboardnya (ROLE_DUTIES rbac.ts, persis). */
val ROLE_DUTIES: Map<Peran, String> = mapOf(
    Peran.PIC_PROYEK to
        "Sampaikan perkembangan proyek kepada Admin PT setiap hari kerja, termasuk kendala dan bukti pendukung.",
    Peran.KEPALA_DIVISI to
        "Serahkan capaian mingguan divisi kepada Admin PT paling lambat hari Kamis, lalu setujui isian sebelum dikunci.",
    Peran.ADMIN_PT to
        "Input seluruh data sesuai jadwal, pastikan setiap item lolos validasi, dan teruskan ke tingkat berikutnya.",
    Peran.DIREKTUR_ENTITAS to
        "Pastikan kepatuhan pelaporan di entitas Anda dan tindak lanjuti item berstatus Terkendala.",
    Peran.DIREKTUR_SDM_GA to
        "Pemilik proses di holding: tinjau dashboard, susun catatan dan daftar eskalasi, lalu sampaikan laporan kepada Manajemen.",
    Peran.TI to
        "Jaga ketersediaan sistem, kelola hak akses, pencadangan data, serta mekanisme penguncian dan notifikasi.",
    Peran.SUPERADMIN to
        "Kelola perusahaan, posisi, dan akun seluruh grup: tambah perusahaan, atur jabatan, setel ulang kata sandi.",
    Peran.MANAJEMEN to
        "Terima laporan, putuskan isu yang dieskalasi, dan pantau indikator kepatuhan seluruh grup.",
    Peran.AUDITOR to
        "Telaah data dan jejak audit seluruh grup secara baca-saja.",
)
