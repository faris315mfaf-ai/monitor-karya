package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Catatan galat (port ErrorNote web, setara role="alert"): ikon error berwarna
 * status Terlambat, pesan body, tombol "Coba lagi" (MkButton S) bila ada
 * penanganan ulang.
 */
@Composable
fun ErrorNote(
    modifier: Modifier = Modifier,
    pesan: String,
    onCobaLagi: (() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    Column(
        modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Assertive }
            .padding(horizontal = MkSpacing.space6, vertical = MkSpacing.space8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Icon(
            imageVector = Icons.Outlined.Error,
            contentDescription = null,
            tint = warna.statusLate,
            modifier = Modifier.size(size = 44.dp),
        )
        Text(
            text = pesan,
            style = MkTypography.body,
            color = warna.ink,
            textAlign = TextAlign.Center,
        )
        if (onCobaLagi != null) {
            MkButton(
                label = "Coba lagi",
                onClick = onCobaLagi,
                variant = MkButtonVariant.PRIMARY,
                size = MkButtonSize.S,
            )
        }
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun ErrorNotePreview() {
    MKTheme {
        Column(modifier = Modifier.background(color = LocalMkColors.current.bg)) {
            ErrorNote(
                pesan = "Data belum termuat. Periksa koneksi Anda lalu coba lagi.",
                onCobaLagi = {},
            )
        }
    }
}
