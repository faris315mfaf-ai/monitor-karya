// Navigasi akar + gerbang sesi. Tiga rute: "login", "ganti_sandi", "beranda".
// SesiViewModel menentukan rute tujuan; perpindahan rute mengosongkan tumpukan
// (popUpTo graph) sehingga kembali dari beranda keluar aplikasi, bukan ke login.
// C3-K1: pengosongan memakai popUpTo(graph.id) inclusive — BUKAN popUpTo(start
// destination), yang diabaikan NavController begitu "login" sudah tidak ada di
// tumpukan. Akibatnya setiap perpindahan (masuk, keluar, 401, wajib ganti sandi)
// membuang SEMUA entri lama beserta ViewModelStore-nya; akun berikutnya
// mendapat entri beranda + ViewModel baru. Akun berganti tanpa rute berubah
// (Siap A → Siap B lewat muat()) juga memicu entri baru ([perluPindahRute]),
// dan key(uid) di sekitar MKShell menyusun ulang seluruh subtree per akun.
// Fase 1 (T5-B8): rute tab PIC (meja/laporan/proyek) TIDAK ditambahkan di sini —
// navigasi tab hidup di NavHost MKShell sendiri; gerbang sesi F0 tetap utuh.
package id.co.monitorkarya.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import id.co.monitorkarya.app.R
import id.co.monitorkarya.app.ui.bukaweb.PeranTakDidukungScreen
import id.co.monitorkarya.app.ui.bukaweb.bukaVersiWeb
import id.co.monitorkarya.app.ui.login.GantiSandiScreen
import id.co.monitorkarya.app.ui.login.LoginScreen
import id.co.monitorkarya.app.vm.SesiUiState
import id.co.monitorkarya.app.vm.SesiViewModel

internal const val RUTE_LOGIN = "login"
internal const val RUTE_GANTI_SANDI = "ganti_sandi"
internal const val RUTE_BERANDA = "beranda"
internal const val RUTE_PERAN_TAK_DIDUKUNG = "peran_tak_didukung"

@Composable
fun MkNavHost(vm: SesiViewModel = hiltViewModel()) {
    val navController = rememberNavController()
    val status by vm.status.collectAsStateWithLifecycle()

    val target: String? = when (val s = status) {
        SesiUiState.Memuat -> null
        SesiUiState.TanpaSesi -> RUTE_LOGIN
        is SesiUiState.WajibGantiSandi -> RUTE_GANTI_SANDI
        is SesiUiState.Siap -> RUTE_BERANDA
        is SesiUiState.PeranTakDidukung -> RUTE_PERAN_TAK_DIDUKUNG
    }

    // Pemilik entri rute saat ini (uid akun). Saveable supaya pemulihan proses
    // untuk akun yang sama tidak membuang tumpukan tab yang dipulihkan.
    val uidAkun: String? = when (val s = status) {
        is SesiUiState.Siap -> s.pengguna.id
        is SesiUiState.WajibGantiSandi -> s.pengguna.id
        else -> null
    }
    var uidRute by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(target, uidAkun) {
        if (perluPindahRute(navController.currentDestination?.route, target, uidRute, uidAkun)) {
            navController.navigate(checkNotNull(target)) {
                // Kosongkan SELURUH tumpukan (C3-K1), termasuk entri yang tujuan awalnya sudah dibuang.
                popUpTo(navController.graph.id) { inclusive = true }
                launchSingleTop = true
            }
            uidRute = uidAkun
        }
    }

    // E2E-1 #4: jendela tanpa ActionBar + edge-to-edge — latar token --bg di akar,
    // layar masuk/ganti sandi menjauhi status bar, bilah navigasi, dan keyboard
    // (safeDrawing). Shell beranda mengurus insetnya sendiri lewat Scaffold.
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        NavHost(navController = navController, startDestination = RUTE_LOGIN) {
            composable(RUTE_LOGIN) {
                val sibuk by vm.sibuk.collectAsStateWithLifecycle()
                val galat by vm.pesanGalat.collectAsStateWithLifecycle()
                LoginScreen(
                    modifier = Modifier.safeDrawingPadding(),
                    memuat = sibuk,
                    pesanGalat = galat,
                    onMasuk = vm::masuk,
                )
            }
            composable(RUTE_GANTI_SANDI) {
                val sibuk by vm.sibuk.collectAsStateWithLifecycle()
                val galat by vm.pesanGalat.collectAsStateWithLifecycle()
                GantiSandiScreen(
                    modifier = Modifier.safeDrawingPadding(),
                    memuat = sibuk,
                    pesan = galat,
                    // Kolom "ulangi sandi" sudah divalidasi di layar; abaikan di sini.
                    onGanti = { kini, baru, _ -> vm.gantiSandi(kini, baru) },
                    // C3-T2: jalan keluar akun (padanan "Keluar dari akun" web).
                    onKeluar = vm::keluar,
                )
            }
            composable(RUTE_PERAN_TAK_DIDUKUNG) {
                val s = status
                val konteks = LocalContext.current
                if (s is SesiUiState.PeranTakDidukung) {
                    PeranTakDidukungScreen(
                        modifier = Modifier.safeDrawingPadding(),
                        nama = s.nama,
                        peranMentah = s.peranMentah,
                        onBukaWeb = { bukaVersiWeb(konteks) },
                        onKeluar = vm::keluar,
                    )
                } else {
                    LayarMemuat()
                }
            }
            composable(RUTE_BERANDA) {
                val s = status
                if (s is SesiUiState.Siap) {
                    // Sabuk pengaman C3-K1: subtree shell (NavController tab,
                    // state tersimpan, ViewModel tab) tersusun ulang per akun.
                    key(s.pengguna.id) {
                        MKShell(pengguna = s.pengguna, onKeluar = vm::keluar)
                    }
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

/**
 * Perlu berpindah rute akar? Ya bila tujuan sudah diketahui dan (a) rute aktif
 * berbeda, atau (b) rute sama tetapi milik akun lain (Siap A → Siap B tanpa
 * melewati layar masuk) — entri lama tidak boleh dipakai ulang untuk akun baru.
 */
internal fun perluPindahRute(
    ruteKini: String?,
    target: String?,
    uidRute: String?,
    uidAkun: String?,
): Boolean = target != null && (ruteKini != target || uidRute != uidAkun)

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
