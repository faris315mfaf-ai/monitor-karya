package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Kalimat tenang untuk keadaan kosong (port EmptyNote web): ikon material besar
 * ink-2, teks body ink-2, aksi opsional → MkButton SECONDARY S. Varian `done`
 * memakai ikon centang berwarna status sukses.
 */
@Composable
fun EmptyNote(
    modifier: Modifier = Modifier,
    teks: String,
    done: Boolean = false,
    ikon: ImageVector? = null,
    teksAksi: String? = null,
    onAksi: (() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = MkSpacing.space6, vertical = MkSpacing.space8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        val gambar = ikon ?: if (done) Icons.Outlined.CheckCircle else Icons.Outlined.Inbox
        Icon(
            imageVector = gambar,
            contentDescription = null,
            tint = if (done) warna.statusOn else warna.ink2.copy(alpha = 0.9f),
            modifier = Modifier.size(size = 44.dp),
        )
        Text(
            text = teks,
            style = MkTypography.body,
            color = warna.ink2,
            textAlign = TextAlign.Center,
        )
        if (teksAksi != null && onAksi != null) {
            MkButton(
                label = teksAksi,
                onClick = onAksi,
                variant = MkButtonVariant.SECONDARY,
                size = MkButtonSize.S,
            )
        }
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun EmptyNotePreview() {
    MKTheme {
        Column(modifier = Modifier.background(color = LocalMkColors.current.bg)) {
            EmptyNote(
                teks = "Belum ada proyek pada periode ini",
                teksAksi = "Muat ulang",
                onAksi = {},
            )
            EmptyNote(
                teks = "Semua laporan hari ini sudah dikirim",
                done = true,
            )
        }
    }
}
