package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Tombol ikon bulat 44dp transparan untuk aksi yang sudah dikenal (cari, notifikasi, tutup).
 * Ikon 20dp; tekan mengecilkan ke 0.94 (hormati LocalReducedMotion).
 * Parameter [label] wajib — dibacakan pembaca layar.
 */
@Composable
fun MkIconBtn(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    label: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val warna = LocalMkColors.current
    val interactionSource = remember { MutableInteractionSource() }
    val skala = mkTekanSkala(interactionSource, 0.94f)
    Box(
        modifier = modifier
            .size(44.dp)
            .clip(CircleShape)
            .graphicsLayer {
                scaleX = skala
                scaleY = skala
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = warna.ink,
            modifier = Modifier.size(20.dp),
        )
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkIconBtnPreview() {
    MKTheme {
        Row {
            MkIconBtn(icon = Icons.Outlined.Search, label = "Cari", onClick = {})
            MkIconBtn(icon = Icons.Outlined.Notifications, label = "Notifikasi", onClick = {})
            MkIconBtn(icon = Icons.Outlined.Notifications, label = "Notifikasi", enabled = false, onClick = {})
        }
    }
}
