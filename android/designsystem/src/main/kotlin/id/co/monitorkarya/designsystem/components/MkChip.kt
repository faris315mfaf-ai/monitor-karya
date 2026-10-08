package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Chip filter kapsul (port Chip web): tinggi 36dp, latar fill1; yang terpilih
 * berlatar ink dengan teks surface agar tidak bersaing dengan tombol primer.
 * Titik warna status opsional dan lencana jumlah kecil (angka selalu tampil, termasuk 0).
 * Tekan mengecilkan ke 0.96; hormati LocalReducedMotion.
 */
@Composable
fun MkChip(
    modifier: Modifier = Modifier,
    label: String,
    selected: Boolean = false,
    count: Any? = null,
    status: MkStatus? = null,
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    val interactionSource = remember { MutableInteractionSource() }
    val skala = mkTekanSkala(interactionSource, 0.96f)
    val latar = if (selected) warna.ink else warna.fill1
    val isi = if (selected) warna.surface else warna.ink
    Row(
        modifier = modifier
            .height(36.dp)
            .clip(MkShapes.penuh)
            .graphicsLayer {
                scaleX = skala
                scaleY = skala
            }
            .background(latar, MkShapes.penuh)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled && onClick != null,
                role = Role.Button,
                onClick = { onClick?.invoke() },
            )
            .semantics { this.selected = selected }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        if (status != null) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(warnaStatus(status)),
            )
        }
        Text(
            text = label,
            color = isi,
            style = MkTypography.callout,
            maxLines = 1,
        )
        if (count != null) {
            // Lencana jumlah kecil di atas latar surface agar terbaca di kedua keadaan chip.
            Text(
                text = count.toString(),
                color = if (selected) warna.ink else warna.ink2,
                style = MkTypography.caption,
                maxLines = 1,
                modifier = Modifier
                    .clip(MkShapes.penuh)
                    .background(warna.surface)
                    .padding(horizontal = 5.dp, vertical = 1.dp),
            )
        }
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkChipPreview() {
    MKTheme {
        Column(
            modifier = Modifier.padding(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkChip(label = "Semua", count = 24, selected = true, onClick = {})
                MkChip(label = "Sesuai jadwal", count = 18, status = MkStatus.ON, onClick = {})
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkChip(label = "Perlu perhatian", count = 4, status = MkStatus.RISK, onClick = {})
                MkChip(label = "Terlambat", count = 2, status = MkStatus.LATE, onClick = {})
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                MkChip(label = "Belum mulai", count = 0, status = MkStatus.NEUTRAL, onClick = {})
                MkChip(label = "Tanpa jumlah", onClick = {})
            }
        }
    }
}
