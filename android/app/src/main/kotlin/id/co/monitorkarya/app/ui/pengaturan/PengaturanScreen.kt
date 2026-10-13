// Pengaturan Admin PT (B1) — padanan bagian "Akun & pengguna" di
// src/components/settings-dialog.tsx: pengelola akun membuka meja akun dari
// Pengaturan, bukan dari tab. Dibuka layar penuh dari ikon Pengaturan di top
// bar (MKShell); tombol kembali sistem/ikon tutup menutupnya. Isi meja akun =
// AkunScreen (ui/akun, T6-C9) yang sudah dipagari ADMIN_PT_MANAGED_ROLES.
package id.co.monitorkarya.app.ui.pengaturan

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import id.co.monitorkarya.app.R
import id.co.monitorkarya.app.ui.akun.AkunScreen
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography

@Composable
fun PengaturanScreen(onTutup: () -> Unit, modifier: Modifier = Modifier) {
    BackHandler(onBack = onTutup)
    val warna = LocalMkColors.current
    // N-03 / BUG-12: kepala Pengaturan ikut tergulir bersama daftar akun
    // (satu LazyColumn di AkunScreen) — di lanskap kepala tetap dulu menghabiskan
    // seluruh tinggi sehingga daftar setinggi 0.
    AkunScreen(
        modifier = modifier.fillMaxSize(),
        kepala = {
            Column {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                    modifier = Modifier.padding(start = MkSpacing.space1, end = MkSpacing.space3, top = MkSpacing.space2),
                ) {
                    MkIconBtn(
                        icon = Icons.AutoMirrored.Outlined.ArrowBack,
                        label = stringResource(R.string.b1_kembali),
                        onClick = onTutup,
                    )
                    Column {
                        Text(
                            stringResource(R.string.b1_pengaturan),
                            style = MkTypography.title2,
                            color = warna.ink,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(stringResource(R.string.b1_pengaturan_sub), style = MkTypography.footnote, color = warna.ink2)
                    }
                }
                Column(
                    modifier = Modifier.padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space3),
                    verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
                ) {
                    Text(
                        stringResource(R.string.b1_akun_pengguna),
                        style = MkTypography.headline,
                        color = warna.ink,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(stringResource(R.string.b1_akun_pengguna_isi), style = MkTypography.footnote, color = warna.ink2)
                }
            }
        },
    )
}
