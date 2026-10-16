// Layar penunjuk ke versi web (Fase 1 aplikasi subholding, 16 Okt 2026):
//  - PeranTakDidukungScreen: akun sah, tetapi perannya belum dikenal aplikasi
//    ini (server lebih baru). Dulu jatuh diam-diam ke Auditor dan menampilkan
//    layar model lama yang keliru.
//  - ShPenampungScreen: tab subholding yang layarnya belum dibangun di Android
//    (diisi Fase 2 Admin subholding, Fase 3 Persetujuan, Fase 4 Ringkasan).
package id.co.monitorkarya.app.ui.bukaweb

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import id.co.monitorkarya.app.BuildConfig
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography

/** Kalimat penjelas peran yang belum didukung (tanpa tanda seru). */
internal fun teksPeranTakDidukung(peranMentah: String): String =
    "Peran \"$peranMentah\" belum tersedia di aplikasi Android. Gunakan versi web untuk sementara."

/** Kalimat layar penampung tab subholding. */
internal const val TEKS_PENAMPUNG: String = "Layar ini sedang disiapkan. Sementara gunakan versi web."

/** Buka monitorkarya.tech (BASE_URL build ini) di peramban; diam bila tidak ada peramban. */
fun bukaVersiWeb(konteks: Context) {
    val niat = Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.BASE_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        konteks.startActivity(niat)
    } catch (_: ActivityNotFoundException) {
        // Perangkat tanpa peramban: tidak ada yang bisa dilakukan, layar tetap terbuka.
    }
}

@Composable
fun PeranTakDidukungScreen(
    nama: String,
    peranMentah: String,
    onBukaWeb: () -> Unit,
    onKeluar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        Text(
            "Peran belum tersedia",
            style = MkTypography.title1,
            color = warna.ink,
            modifier = Modifier.semantics { heading() },
        )
        if (nama.isNotBlank()) Text("Masuk sebagai $nama", style = MkTypography.footnote, color = warna.ink2)
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(teks = teksPeranTakDidukung(peranMentah), ikon = Icons.Outlined.Language)
        }
        MkButton(
            modifier = Modifier.fillMaxWidth(),
            label = "Buka versi web",
            variant = MkButtonVariant.PRIMARY,
            onClick = onBukaWeb,
        )
        MkButton(modifier = Modifier.fillMaxWidth(), label = "Keluar", onClick = onKeluar)
    }
}

@Composable
fun ShPenampungScreen(judul: String, onBukaWeb: () -> Unit, modifier: Modifier = Modifier) {
    val warna = LocalMkColors.current
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        Text(judul, style = MkTypography.title1, color = warna.ink, modifier = Modifier.semantics { heading() })
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(
                teks = TEKS_PENAMPUNG,
                ikon = Icons.Outlined.Language,
                teksAksi = "Buka versi web",
                onAksi = onBukaWeb,
            )
        }
    }
}
