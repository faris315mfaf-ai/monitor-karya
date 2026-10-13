// Statistik Admin PT (T8-A1, keputusan pemilik 9–10 Okt — paritas web
// src/components/views/statistik-view.tsx). Sejak D1 Statistik adalah tab biasa
// (TabId.STATISTIK → LayarTab.STATISTIK di navigation/PetaLayar.kt).
//
// Susunan (BUG-02): judul → modul Kepatuhan (GET /api/admin/compliance +
// pengingat) → peta panas 10 hari kerja (data yang sama) → kartu Aturan
// pelaporan (GET/PUT /api/admin/report-settings). Aturan yang termuat juga
// dipakai teks tenggat modul Kepatuhan (BUG-11), dan setiap simpanan aturan
// memuat ulang kepatuhan karena kunci harian/tenggat mingguan ikut berubah.
package id.co.monitorkarya.app.ui.admin

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.app.ui.kepatuhan.KepatuhanScreen
import id.co.monitorkarya.app.ui.kepatuhan.KepatuhanViewModel
import id.co.monitorkarya.app.ui.luring.rememberStatusLuring
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing

@Composable
fun StatistikAdminScreen(
    offline: Boolean = false,
    vm: KepatuhanViewModel = hiltViewModel(),
    aturanVm: AturanPelaporanViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    val luring by rememberStatusLuring()
    val sedangLuring = offline || luring.luring

    val kepatuhan by vm.state.collectAsStateWithLifecycle()
    val aturanState by aturanVm.state.collectAsStateWithLifecycle()
    val menyimpan by aturanVm.menyimpan.collectAsStateWithLifecycle()
    val galatSimpan by aturanVm.galatSimpan.collectAsStateWithLifecycle()
    val notifikasi by aturanVm.notifikasi.collectAsStateWithLifecycle()
    val versiTersimpan by aturanVm.versiTersimpan.collectAsStateWithLifecycle()

    // Simpanan aturan sukses → kunci harian / tenggat mingguan di server berubah.
    LaunchedEffect(versiTersimpan) {
        if (versiTersimpan > 0) vm.muat(diam = true)
    }

    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(notifikasi?.id) {
        notifikasi?.let { n ->
            snackbar.showSnackbar(
                message = n.pesan,
                duration = if (n.galat) SnackbarDuration.Long else SnackbarDuration.Short,
            )
            aturanVm.notifikasiTampil()
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        KepatuhanScreen(
            vm = vm,
            offline = offline,
            aturan = (aturanState as? AturanUiState.Siap)?.aturan?.keTenggat(),
            kepala = {
                Text(
                    text = "Statistik",
                    style = MaterialTheme.typography.displaySmall,
                    color = warna.ink,
                )
            },
            bawah = {
                PetaPanasKartu(state = kepatuhan, onUlang = vm::ulang)
                AturanPelaporanKartu(
                    state = aturanState,
                    menyimpan = menyimpan,
                    galatSimpan = galatSimpan,
                    luring = sedangLuring,
                    onSimpan = { aturanVm.simpan(it, luring = sedangLuring) },
                    onUlang = aturanVm::muat,
                )
            },
        )
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = MkSpacing.space10),
        )
    }
}
