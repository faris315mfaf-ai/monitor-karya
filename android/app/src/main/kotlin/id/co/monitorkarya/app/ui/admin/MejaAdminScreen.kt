package id.co.monitorkarya.app.ui.admin

// Gabungan tiga meja Admin PT dalam satu tab PENERIMAAN (integrasi F2):
// ROLE_TABS tidak memberi tab khusus Kepatuhan/Akun untuk ADMIN_PT — di web
// keduanya kartu di Ringkasan; di ponsel digabung dengan segmented agar tetap
// satu gerbang. Zona parent (Zcode), 8 Okt 2026.

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.app.ui.akun.AkunScreen
import id.co.monitorkarya.app.ui.kepatuhan.KepatuhanScreen
import id.co.monitorkarya.app.ui.kepatuhan.KepatuhanViewModel
import id.co.monitorkarya.app.ui.penerimaan.PenerimaanScreen
import id.co.monitorkarya.app.ui.penerimaan.PenerimaanViewModel
import id.co.monitorkarya.designsystem.components.MkOpsi
import id.co.monitorkarya.designsystem.components.MkSegmentedControl

@Composable
fun MejaAdminScreen(
    offline: Boolean = false,
    penerimaanVm: PenerimaanViewModel = hiltViewModel(),
    kepatuhanVm: KepatuhanViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    var pilihan by rememberSaveable { mutableStateOf("penerimaan") }
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = id.co.monitorkarya.designsystem.theme.MkSpacing.space4),
    ) {
        MkSegmentedControl(
            options = listOf(
                MkOpsi("penerimaan", "Penerimaan"),
                MkOpsi("kepatuhan", "Kepatuhan"),
                MkOpsi("akun", "Akun"),
            ),
            terpilih = pilihan,
            onPilih = { pilihan = it },
        )
        when (pilihan) {
            "kepatuhan" -> KepatuhanScreen(vm = kepatuhanVm, offline = offline)
            "akun" -> AkunScreen(offline = offline)
            else -> PenerimaanScreen(vm = penerimaanVm, offline = offline)
        }
    }
}
