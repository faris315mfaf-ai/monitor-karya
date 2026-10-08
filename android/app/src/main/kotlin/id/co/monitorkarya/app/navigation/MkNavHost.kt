// Navigasi akar + gerbang sesi. Tiga rute: "login", "ganti_sandi", "beranda".
// SesiViewModel menentukan rute tujuan; perpindahan rute mengosongkan tumpukan
// (popUpTo graph) sehingga kembali dari beranda keluar aplikasi, bukan ke login.
// Fase 1 (T5-B8): rute tab PIC (meja/laporan/proyek) TIDAK ditambahkan di sini —
// navigasi tab hidup di NavHost MKShell sendiri; gerbang sesi F0 tetap utuh.
package id.co.monitorkarya.app.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import id.co.monitorkarya.app.R
import id.co.monitorkarya.app.ui.login.GantiSandiScreen
import id.co.monitorkarya.app.ui.login.LoginScreen
import id.co.monitorkarya.app.vm.SesiUiState
import id.co.monitorkarya.app.vm.SesiViewModel

internal const val RUTE_LOGIN = "login"
internal const val RUTE_GANTI_SANDI = "ganti_sandi"
internal const val RUTE_BERANDA = "beranda"

@Composable
fun MkNavHost(vm: SesiViewModel = hiltViewModel()) {
    val navController = rememberNavController()
    val status by vm.status.collectAsStateWithLifecycle()

    val target: String? = when (val s = status) {
        SesiUiState.Memuat -> null
        SesiUiState.TanpaSesi -> RUTE_LOGIN
        is SesiUiState.WajibGantiSandi -> RUTE_GANTI_SANDI
        is SesiUiState.Siap -> RUTE_BERANDA
    }

    LaunchedEffect(target) {
        if (target != null && navController.currentDestination?.route != target) {
            navController.navigate(target) {
                popUpTo(navController.graph.findStartDestination().id) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(navController = navController, startDestination = RUTE_LOGIN) {
            composable(RUTE_LOGIN) {
                val sibuk by vm.sibuk.collectAsStateWithLifecycle()
                val galat by vm.pesanGalat.collectAsStateWithLifecycle()
                LoginScreen(
                    memuat = sibuk,
                    pesanGalat = galat,
                    onMasuk = vm::masuk,
                )
            }
            composable(RUTE_GANTI_SANDI) {
                val sibuk by vm.sibuk.collectAsStateWithLifecycle()
                val galat by vm.pesanGalat.collectAsStateWithLifecycle()
                GantiSandiScreen(
                    memuat = sibuk,
                    pesan = galat,
                    // Kolom "ulangi sandi" sudah divalidasi di layar; abaikan di sini.
                    onGanti = { kini, baru, _ -> vm.gantiSandi(kini, baru) },
                )
            }
            composable(RUTE_BERANDA) {
                val s = status
                if (s is SesiUiState.Siap) {
                    MKShell(pengguna = s.pengguna, onKeluar = vm::keluar)
                } else {
                    LayarMemuat()
                }
            }
        }
        // Selimut penuh selama pemeriksaan sesi awal supaya layar masuk
        // tidak berkedip sebelum gerbang tahu arahnya.
        if (status == SesiUiState.Memuat) {
            LayarMemuat()
        }
    }
}

/** Tahanan pemeriksaan sesi: indikator + kata "Memuat…". */
@Composable
private fun LayarMemuat(modifier: Modifier = Modifier) {
    Surface(modifier = modifier.fillMaxSize()) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        ) {
            CircularProgressIndicator()
            Text(text = stringResource(R.string.umum_memuat))
        }
    }
}
