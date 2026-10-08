// Statistik Admin PT (T8-A1, keputusan pemilik 9 Okt — paritas web T8).
// Tab statistik baru Admin PT sementara MEMAKAI tab "Divisi" di navigasi
// (lihat komentar pemetaan di MKShell) sampai NavTabId statistik ditambahkan
// ke RoleTabs android. Layar ini hanya membungkus modul Kepatuhan yang sudah
// ada (T6-C8: GET /api/admin/compliance + pengingat) dengan judul seksi —
// meja akun/penerimaan lama (MejaAdminScreen) TIDAK dipasang lagi di navigasi
// sejak T8-A1; berkasnya dibiarkan tanpa rujukan.
package id.co.monitorkarya.app.ui.admin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import id.co.monitorkarya.app.ui.kepatuhan.KepatuhanScreen
import id.co.monitorkarya.app.ui.kepatuhan.KepatuhanViewModel
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing

/**
 * Judul seksi + KepatuhanScreen (modul statistik). Tanpa padding horizontal
 * di sini — KepatuhanScreen memasang margin layarnya sendiri (12dp) supaya
 * tidak ada jarak ganda (keputusan pemilik 9 Okt 2026).
 */
@Composable
fun StatistikAdminScreen(
    offline: Boolean = false,
    vm: KepatuhanViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    Column(modifier = modifier.fillMaxSize()) {
        Text(
            text = "Statistik",
            style = MaterialTheme.typography.displaySmall,
            color = warna.ink,
            modifier = Modifier
                .padding(start = MkSpacing.space3, end = MkSpacing.space3, top = MkSpacing.space4),
        )
        KepatuhanScreen(vm = vm, offline = offline)
    }
}
