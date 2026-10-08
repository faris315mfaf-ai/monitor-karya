// Kerangka beranda ponsel (port src/components/shell.tsx versi <600px untuk
// Fase 0): Scaffold + NavigationBar bawah berisi tab sesuai ROLE_TABS peran.
// Navigasi tingkat tab memakai NavHost sendiri; RINGKASAN selalu tab pertama
// (beranda). Tab lain menampilkan PlaceholderTabScreen sampai fasenya tiba.
package id.co.monitorkarya.app.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import id.co.monitorkarya.app.R
import id.co.monitorkarya.app.ui.placeholder.PlaceholderTabScreen
import id.co.monitorkarya.app.ui.ringkasan.RingkasanScreen
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.core.domain.model.PeranPengguna
import id.co.monitorkarya.core.domain.roles.TabId
import id.co.monitorkarya.core.domain.roles.tabsUntuk

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
    val tabs = remember(pengguna.peran) { tabsUntuk(pengguna.peran) }
    // RINGKASAN = beranda; jatuh ke tab pertama bila suatu saat ada peran tanpa itu.
    val tabAwal = remember(tabs) { tabs.firstOrNull { it == TabId.RINGKASAN } ?: tabs.first() }
    val navTab = rememberNavController()
    val backStack by navTab.currentBackStackEntryAsState()
    val ruteAktif = backStack?.destination?.route

    Scaffold(
        topBar = {
            val namaApp = stringResource(R.string.app_name)
            TopAppBar(
                title = {
                    Text(
                        text = "$namaApp · " + pengguna.peran.labelIndonesia,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                actions = {
                    onKeluar?.let { keluar ->
                        IconButton(onClick = keluar) {
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
            NavigationBar {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = ruteAktif == tab.rute(),
                        onClick = {
                            navTab.navigate(tab.rute()) {
                                popUpTo(navTab.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            Icon(imageVector = ikonTab(tab), contentDescription = null)
                        },
                        label = { Text(text = labelTab(pengguna.peran, tab)) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navTab,
            startDestination = tabAwal.rute(),
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            tabs.forEach { tab ->
                composable(tab.rute()) {
                    if (tab == TabId.RINGKASAN) {
                        // offline = false dulu: pemantau konektivitas belum ada di Fase 0.
                        RingkasanScreen(vm = hiltViewModel())
                    } else {
                        PlaceholderTabScreen(label = labelTab(pengguna.peran, tab))
                    }
                }
            }
        }
    }
}

/** Rute tingkat tab: "tab/ringkasan", "tab/proyek", ... */
private fun TabId.rute(): String = "tab/" + name.lowercase()

/** Ikon material per TabId (padanan TAB_ICONS di shell.tsx). */
private fun ikonTab(tab: TabId): ImageVector = when (tab) {
    TabId.RINGKASAN -> Icons.Outlined.Dashboard
    TabId.MEJA_KERJA -> Icons.Outlined.Work
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
