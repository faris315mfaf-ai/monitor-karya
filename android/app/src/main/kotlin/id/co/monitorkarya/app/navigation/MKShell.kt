// Kerangka beranda ponsel (port src/components/shell.tsx versi <600px):
// Scaffold + bilah bawah berisi tab sesuai ROLE_TABS peran (maks 5 butir; sisa
// tab masuk Sheet "Lainnya"), top bar berisi Pesan, lonceng notifikasi, dan
// keluar (dengan konfirmasi bila masih ada antrean outbox). Isi tab nyata dari
// app/ui/* (Fase 1–2) dan modul :feature:* (Fase 3). B1: peta (peran, tab) →
// layar di PetaLayar.kt (tanpa layar tunggu); Admin PT mendapat ikon
// Pengaturan (meja akun) di top bar. D1: Statistik = tab biasa (ROLE_TABS);
// NavTabId 'pesan' web = ikon Pesan di top bar, bukan tab.
// C3-S6: Pesan/Pengaturan tampil sebagai LAPISAN di atas NavHost tab (NavHost
// tetap tersusun) sehingga posisi gulir, saringan, dan isian tab aktif utuh
// setelah lapisan ditutup. C3-R2: bilah bawah mengikuti ROLE_COMPACT_TABS web
// ([bagiTabBawah]) — Persetujuan Manajemen tidak lagi terselip di "Lainnya".
package id.co.monitorkarya.app.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.QueryStats
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.warnaNavigasi
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import id.co.monitorkarya.app.R
import id.co.monitorkarya.app.ui.admin.DashboardAdminScreen
import id.co.monitorkarya.app.ui.admin.MejaKerjaAdminScreen
import id.co.monitorkarya.app.ui.admin.StatistikAdminScreen
import id.co.monitorkarya.app.ui.bukaweb.ShPenampungScreen
import id.co.monitorkarya.app.ui.bukaweb.bukaVersiWeb
import id.co.monitorkarya.app.ui.divisi.DivisiScreen
import id.co.monitorkarya.app.ui.laporan.LaporanHarianScreen
import id.co.monitorkarya.app.ui.luring.BannerLuring
import id.co.monitorkarya.app.ui.luring.LuringViewModel
import id.co.monitorkarya.app.ui.luring.TEKS_LURING_PEMANTAU
import id.co.monitorkarya.app.ui.mejakadiv.MejaKadivScreen
import id.co.monitorkarya.app.ui.mejakerja.MejaKerjaScreen
import id.co.monitorkarya.app.ui.mejaumum.MejaTanpaPtScreen
import id.co.monitorkarya.app.ui.mingguan.MingguanScreen
import id.co.monitorkarya.app.ui.pengaturan.PengaturanScreen
import id.co.monitorkarya.app.ui.penerimaan.PenerimaanScreen
import id.co.monitorkarya.app.ui.ringkasan.RingkasanPelaksanaScreen
import id.co.monitorkarya.app.ui.tim.TimScreen
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.model.PeranPengguna
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.core.domain.roles.bolehLihatTab
import id.co.monitorkarya.core.domain.roles.tabsUntuk
import id.co.monitorkarya.feature.audit.LogAuditTab
import id.co.monitorkarya.feature.audit.SistemAksesTab
import id.co.monitorkarya.feature.entitas.EntitasTab
import id.co.monitorkarya.feature.entitas.PerusahaanTab
import id.co.monitorkarya.feature.eskalasi.EskalasiTab
import id.co.monitorkarya.feature.notifikasi.LoncengNotifikasi
import id.co.monitorkarya.feature.persetujuan.PersetujuanTab
import id.co.monitorkarya.feature.pesan.PesanIkon
import id.co.monitorkarya.feature.pesan.PesanLayar
import id.co.monitorkarya.feature.proyek.ProyekTab
import id.co.monitorkarya.feature.ringkasangrup.RingkasanDirekturTab
import id.co.monitorkarya.feature.ringkasangrup.RingkasanGrupTab

/** Bilah bawah ponsel memuat paling banyak lima butir (empat tab + "Lainnya"). */
private const val MAKS_BUTIR_BAWAH = 5

/**
 * @param pengguna pengguna masuk — menentukan daftar tab (ROLE_TABS peran).
 * @param onKeluar dipanggil dari tombol keluar; null menyembunyikan tombol.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MKShell(
    pengguna: PeranPengguna,
    onKeluar: (() -> Unit)? = null,
) {
    val peran = pengguna.peran
    val tabs = remember(peran) { tabsUntuk(peran) }
    // RINGKASAN = beranda; jatuh ke tab pertama bila suatu saat ada peran tanpa itu.
    val tabAwal = remember(tabs) { tabs.firstOrNull { it == TabId.RINGKASAN } ?: tabs.first() }
    val (tabBawah, tabLain) = remember(peran, tabs) { bagiTabBawah(peran, tabs, MAKS_BUTIR_BAWAH) }
    val navTab = rememberNavController()
    val backStack by navTab.currentBackStackEntryAsState()
    val ruteAktif = backStack?.destination?.route

    val luringVm: LuringViewModel = hiltViewModel()
    val statusLuring by luringVm.status.collectAsStateWithLifecycle()
    var pesanTerbuka by rememberSaveable { mutableStateOf(false) }
    var pengaturanTerbuka by rememberSaveable { mutableStateOf(false) }
    var lainnyaTerbuka by rememberSaveable { mutableStateOf(false) }
    var tanyaKeluar by rememberSaveable { mutableStateOf(false) }

    val bukaTab: (TabId) -> Unit = { tab ->
        if (bolehLihatTab(peran, tab)) {
            pesanTerbuka = false
            pengaturanTerbuka = false
            navTab.bukaTab(tab)
        }
    }
    val bukaTujuan: (String?) -> Unit = { tujuan ->
        val tab = tujuan?.let { nama -> TabId.entries.firstOrNull { it.name == nama } }
        if (tab != null) bukaTab(tab)
    }
    val mintaKeluar: () -> Unit = {
        if (statusLuring.menungguKirim + statusLuring.gagalKirim > 0) tanyaKeluar = true
        else onKeluar?.invoke()
    }

    Scaffold(
        topBar = {
            val namaApp = stringResource(R.string.app_name)
            TopAppBar(
                title = {
                    // N-06 / E2E-R2-3 N4: nama aplikasi kecil di baris atas, peran
                    // di baris kedua — peran panjang ("Direksi holding (SDM & GA)",
                    // "Super Admin") tidak lagi terpotong di ponsel potret.
                    Column {
                        Text(
                            text = namaApp,
                            style = MaterialTheme.typography.labelMedium,
                            color = LocalMkColors.current.ink2,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = peran.labelIndonesia,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                actions = {
                    PesanIkon(onBuka = {
                        pengaturanTerbuka = false
                        pesanTerbuka = true
                    })
                    LoncengNotifikasi(onBuka = bukaTujuan)
                    if (bolehPengaturan(peran)) {
                        IconButton(onClick = {
                            pesanTerbuka = false
                            pengaturanTerbuka = true
                        }) {
                            Icon(
                                imageVector = Icons.Outlined.Settings,
                                contentDescription = stringResource(R.string.b1_pengaturan),
                            )
                        }
                    }
                    if (onKeluar != null) {
                        IconButton(onClick = mintaKeluar) {
                            Icon(
                                imageVector = Icons.Outlined.Logout,
                                contentDescription = stringResource(R.string.umum_keluar),
                            )
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (!pesanTerbuka && !pengaturanTerbuka) {
                // E2E-1 #6: warna dari token (label aktif tinta penuh, ikon aksen di
                // atas accent-soft, latar surface) — bawaan M3 memakai fill-1.
                val wn = warnaNavigasi(LocalMkColors.current, LocalAccent.current)
                val warnaItem = NavigationBarItemDefaults.colors(
                    selectedIconColor = wn.ikonAktif,
                    selectedTextColor = wn.labelAktif,
                    indicatorColor = wn.indikator,
                    unselectedIconColor = wn.ikonPasif,
                    unselectedTextColor = wn.labelPasif,
                )
                NavigationBar(containerColor = wn.latar) {
                    tabBawah.forEach { tab ->
                        NavigationBarItem(
                            selected = ruteAktif == tab.rute(),
                            onClick = { navTab.bukaTab(tab) },
                            icon = { Icon(imageVector = ikonTab(tab), contentDescription = null) },
                            // E2E-3 B17: label pendek web (NAV_TABS.short) + elipsis.
                            label = {
                                Text(
                                    text = labelPendek(peran, tab),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            },
                            colors = warnaItem,
                        )
                    }
                    if (tabLain.isNotEmpty()) {
                        NavigationBarItem(
                            selected = tabLain.any { ruteAktif == it.rute() },
                            onClick = { lainnyaTerbuka = true },
                            icon = { Icon(imageVector = Icons.Outlined.MoreHoriz, contentDescription = null) },
                            label = {
                                Text(
                                    text = stringResource(R.string.tab_lainnya),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            },
                            colors = warnaItem,
                        )
                    }
                }
            }
        },
    ) { padding ->
        val lapisanTerbuka = pesanTerbuka || pengaturanTerbuka
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            // NavHost tab SELALU tersusun (C3-S6): SaveableStateHolder-nya tetap
            // hidup selama Pesan/Pengaturan terbuka. Saat tertutup lapisan,
            // isinya disembunyikan dari pembaca layar.
            NavHost(
                navController = navTab,
                startDestination = tabAwal.rute(),
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (lapisanTerbuka) Modifier.clearAndSetSemantics {} else Modifier),
            ) {
                tabs.forEach { tab ->
                    composable(tab.rute()) { IsiTab(pengguna, tab, bukaTab, luring = statusLuring.luring) }
                }
            }
            if (lapisanTerbuka) {
                // Surface menahan sentuhan agar tidak tembus ke tab di bawahnya.
                Surface(modifier = Modifier.fillMaxSize()) {
                    if (pesanTerbuka) {
                        // Didaftarkan SETELAH NavHost tab (lapisan tersusun belakangan)
                        // sehingga Kembali menutup Pesan, bukan memundurkan tab di bawahnya.
                        BackHandler { pesanTerbuka = false }
                        PesanLayar(
                            peran = peran,
                            onTutup = { pesanTerbuka = false },
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        PengaturanScreen(
                            onTutup = { pengaturanTerbuka = false },
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
        }
    }

    if (lainnyaTerbuka) {
        // E2E-3 B12: sheet langsung terbuka penuh (tanpa setengah-buka yang
        // memotong butir terakhir), daftar bisa digulir, dan ada ruang setinggi
        // bilah navigasi sistem supaya butir terakhir tidak menempel di area gestur.
        ModalBottomSheet(
            onDismissRequest = { lainnyaTerbuka = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                tabLain.forEach { tab ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                lainnyaTerbuka = false
                                navTab.bukaTab(tab)
                            }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                    ) {
                        Icon(imageVector = ikonTab(tab), contentDescription = null)
                        Spacer(modifier = Modifier.width(16.dp))
                        Text(text = labelTab(peran, tab), style = MaterialTheme.typography.bodyLarge)
                    }
                }
                Spacer(modifier = Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    if (tanyaKeluar) {
        val jumlah = statusLuring.menungguKirim + statusLuring.gagalKirim
        AlertDialog(
            onDismissRequest = { tanyaKeluar = false },
            title = { Text(text = stringResource(R.string.keluar_antrean_judul)) },
            text = { Text(text = stringResource(R.string.keluar_antrean_isi, jumlah)) },
            confirmButton = {
                TextButton(onClick = {
                    tanyaKeluar = false
                    onKeluar?.invoke()
                }) { Text(text = stringResource(R.string.umum_keluar)) }
            },
            dismissButton = {
                TextButton(onClick = { tanyaKeluar = false }) {
                    Text(text = stringResource(R.string.umum_batal_keluar))
                }
            },
        )
    }
}

/** Pindah ke tab tingkat atas dengan state tab lain dipertahankan. */
private fun NavHostController.bukaTab(tab: TabId) {
    navigate(tab.rute()) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/**
 * Isi satu tab per peran menurut [layarUntuk] (PetaLayar.kt). Layar Fase 1–2
 * dan B1 tinggal di app/ui; layar Fase 3 datang dari modul :feature:*.
 * `when` menyeluruh atas [LayarTab] — tidak ada cabang layar tunggu.
 */
@Composable
private fun IsiTab(pengguna: PeranPengguna, tab: TabId, bukaTab: (TabId) -> Unit, luring: Boolean) {
    val layar = layarUntuk(pengguna.peran, tab, adaPt = pengguna.scopeEntitasId != null)
    if (!bannerLuringDariShell(layar)) {
        IsiLayar(pengguna, layar, bukaTab)
        return
    }
    // E2E-R2-3 N1: layar pemantau tidak mengamati konektivitas sendiri, jadi
    // galat "Anda sedang luring…" bertahan setelah daring kembali. Saat
    // luring → daring, ViewModel tab ini (penyimpan entri NavHost tab) dibuang
    // dan isi disusun ulang dengan kunci baru → ViewModel baru memuat ulang.
    val pemilikVm = LocalViewModelStoreOwner.current
    var versiDaring by remember { mutableIntStateOf(0) }
    var tadiLuring by remember { mutableStateOf(luring) }
    LaunchedEffect(luring) {
        if (tadiLuring && !luring) {
            pemilikVm?.viewModelStore?.clear()
            versiDaring++
        }
        tadiLuring = luring
    }
    // E2E-3 B6: layar pemantau mendapat banner luring dari shell. G1 (masukan
    // G2): banner shell = SATU-SATUNYA penanda status luring di layar pemantau —
    // tetap tampil walau layar memasang MkPenandaTersimpan, karena penanda itu
    // hanya muncul bila isi berasal dari potret Room; data segar yang tetap di
    // layar setelah perangkat luring tidak punya penanda lain. Penanda layar
    // dibaca sebagai baris "umur data" (lihat G1-DRAF-VERIFIKASI.md).
    Column(Modifier.fillMaxSize()) {
        if (luring) {
            BannerLuring(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                tersimpanPadaMs = null,
                teks = TEKS_LURING_PEMANTAU,
            )
        }
        Box(Modifier.weight(1f).fillMaxWidth()) { key(versiDaring) { IsiLayar(pengguna, layar, bukaTab) } }
    }
}

@Composable
private fun IsiLayar(pengguna: PeranPengguna, layar: LayarTab, bukaTab: (TabId) -> Unit) {
    val peran = pengguna.peran
    when (layar) {
        LayarTab.DASBOR_ADMIN -> DashboardAdminScreen()
        LayarTab.RINGKASAN_DIREKTUR -> RingkasanDirekturTab(peran = peran, onBukaTab = bukaTab)
        LayarTab.RINGKASAN_GRUP -> RingkasanGrupTab(peran)
        LayarTab.RINGKASAN_PELAKSANA -> RingkasanPelaksanaScreen(bukaTab = bukaTab)
        LayarTab.MEJA_PIC -> MejaKerjaScreen(
            vm = hiltViewModel(),
            onBukaLaporan = { bukaTab(TabId.LAPORAN_HARIAN) },
            onBukaTugas = { bukaTab(TabId.LAPORAN_HARIAN) },
            onBukaProyek = { bukaTab(TabId.PROYEK) },
        )
        LayarTab.MEJA_KADIV -> MejaKadivScreen(
            onBukaPapan = { bukaTab(TabId.CAPAIAN_MINGGUAN) },
            onBukaTim = { bukaTab(TabId.PEMBAGIAN_DIVISI) },
        )
        LayarTab.MEJA_ADMIN -> MejaKerjaAdminScreen()
        LayarTab.MEJA_TANPA_PT -> MejaTanpaPtScreen(peran = peran, onBukaRingkasan = { bukaTab(TabId.RINGKASAN) })
        LayarTab.LAPORAN_HARIAN -> LaporanHarianScreen(vm = hiltViewModel())
        LayarTab.CAPAIAN_MINGGUAN -> MingguanScreen(vm = hiltViewModel())
        LayarTab.TIM_KADIV -> TimScreen(vm = hiltViewModel())
        LayarTab.DIVISI -> DivisiScreen(peran = peran)
        LayarTab.STATISTIK -> StatistikAdminScreen()
        LayarTab.PENERIMAAN -> PenerimaanScreen(vm = hiltViewModel())
        LayarTab.PROYEK -> ProyekTab(peran)
        LayarTab.ESKALASI -> EskalasiTab(peran)
        LayarTab.PERSETUJUAN -> PersetujuanTab(peran, onBukaEskalasi = { bukaTab(TabId.ESKALASI) })
        LayarTab.ENTITAS -> EntitasTab(peran)
        LayarTab.PERUSAHAAN -> PerusahaanTab(peran)
        LayarTab.LOG_AUDIT -> LogAuditTab(peran)
        LayarTab.SISTEM_AKSES -> SistemAksesTab(peran)
        LayarTab.SH_DASHBOARD -> ShPenampung(TabId.SH_DASHBOARD)
        LayarTab.SH_INBOX -> ShPenampung(TabId.SH_INBOX)
        LayarTab.SH_HISTORY -> ShPenampung(TabId.SH_HISTORY)
        LayarTab.SH_REVIEW -> ShPenampung(TabId.SH_REVIEW)
        LayarTab.SH_OVERVIEW -> ShPenampung(TabId.SH_OVERVIEW)
    }
}

/** Rute tingkat tab: "tab/ringkasan", "tab/proyek", ... */
private fun TabId.rute(): String = "tab/" + name.lowercase()

/** Ikon material per TabId (padanan TAB_ICONS di shell.tsx). */
private fun ikonTab(tab: TabId): ImageVector = when (tab) {
    TabId.RINGKASAN -> Icons.Outlined.Dashboard
    TabId.MEJA_KERJA -> Icons.Outlined.Work
    TabId.STATISTIK -> Icons.Outlined.QueryStats
    TabId.LAPORAN_HARIAN -> Icons.Outlined.Description
    TabId.PROYEK -> Icons.Outlined.FolderOpen
    TabId.PEMBAGIAN_DIVISI -> Icons.Outlined.Groups
    TabId.CAPAIAN_MINGGUAN -> Icons.Outlined.CalendarMonth
    TabId.PENERIMAAN -> Icons.Outlined.Inbox
    TabId.ESKALASI -> Icons.Outlined.Warning
    TabId.PERSETUJUAN -> Icons.Outlined.TaskAlt
    TabId.ENTITAS -> Icons.Outlined.Apartment
    TabId.PERUSAHAAN -> Icons.Outlined.Business
    TabId.LOG_AUDIT -> Icons.Outlined.ReceiptLong
    TabId.SISTEM_AKSES -> Icons.Outlined.Lock
    TabId.SH_DASHBOARD -> Icons.Outlined.Dashboard
    TabId.SH_INBOX -> Icons.Outlined.Inbox
    TabId.SH_HISTORY -> Icons.Outlined.History
    TabId.SH_REVIEW -> Icons.Outlined.TaskAlt
    TabId.SH_OVERVIEW -> Icons.Outlined.Dashboard
}

/** Tab subholding yang layarnya belum dibangun di Android (Fase 2–4). */
@Composable
private fun ShPenampung(tab: TabId) {
    val konteks = LocalContext.current
    ShPenampungScreen(judul = tab.label, onBukaWeb = { bukaVersiWeb(konteks) })
}

/**
 * Label Indonesia dari RoleTabs (TabId.label) dengan dua penyesuaian peran yang
 * dipakai web (tabLabel di shell.tsx): Ringkasan PIC = "Hari ini", Divisi
 * Manajemen = "Tim & divisi".
 */
@Composable
private fun labelTab(peran: Peran, tab: TabId): String = when {
    tab == TabId.RINGKASAN && peran == Peran.PIC_PROYEK -> stringResource(R.string.tab_hari_ini)
    tab == TabId.PEMBAGIAN_DIVISI && peran == Peran.MANAJEMEN -> stringResource(R.string.tab_tim_divisi)
    else -> tab.label
}
