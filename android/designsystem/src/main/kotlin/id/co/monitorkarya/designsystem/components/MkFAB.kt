package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Tombol aksi mengambang kapsul aksen (ikon + label, isian accent-fill dengan
 * teks on-accent; maksimal satu aksi utama per layar — docs/design/01).
 * Tinggi 52dp (nyaman dijangkau ibu jari), bayangan 6dp (konvensi elevasi FAB M3),
 * tekan mengecilkan ke 0.97 (hormati LocalReducedMotion). Nonaktif (C4 P1-1): latar
 * fill-1 dan isi ink-2 (>=4.5:1), tanpa aksen dan tanpa bayangan, tanpa klik.
 *
 * Pemasangan: posisi mengambang diatur pemanggil — di Scaffold tempatkan di
 * `floatingActionButton` dengan `Modifier.padding(bottom = MkSpacing.space4)` agar
 * naik 16dp dari tepi bawah (lihat pratinjau untuk tata letak bebas di Box).
 */
@Composable
fun MkFAB(
    modifier: Modifier = Modifier,
    label: String,
    ikon: ImageVector,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    val aksen = LocalAccent.current
    val warna = LocalMkColors.current
    val interactionSource = remember { MutableInteractionSource() }
    val skala = mkTekanSkala(interactionSource, 0.97f)
    val latar = if (enabled) aksen.fill else warna.fill1
    val isi = if (enabled) aksen.on else warna.ink2
    Row(
        modifier = modifier
            .height(52.dp)
            .graphicsLayer {
                scaleX = skala
                scaleY = skala
            }
            .shadow(elevation = if (enabled) 6.dp else 0.dp, shape = MkShapes.penuh)
            .clip(MkShapes.penuh)
            .background(latar, MkShapes.penuh)
            .mkCincinFokus(interactionSource, MkShapes.penuh)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = MkSpacing.space5),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Icon(
            imageVector = ikon,
            contentDescription = null,
            tint = isi,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = label,
            color = isi,
            style = MkTypography.bodyStrong,
            maxLines = 1,
        )
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkFABPreview() {
    MKTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(MkSpacing.space4),
        ) {
            // Contoh pemasangan: menempel kanan-bawah dengan jarak 16dp dari tepi.
            MkFAB(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(bottom = MkSpacing.space4),
                label = "Kirim laporan",
                ikon = Icons.AutoMirrored.Outlined.Send,
                onClick = {},
            )
        }
    }
}
