package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Satu pilihan untuk kontrol tersegmentasi dan dropdown (padanan `{value,label}`
 * SegmentedControl web + jumlah opsional ala lencana chip).
 */
data class MkOpsi(
    val value: String,
    val label: String,
    /** Lencana jumlah kecil di samping label (angka selalu tampil, termasuk 0). */
    val count: Any? = null,
)

/**
 * Kontrol tersegmentasi kapsul (port SegmentedControl web): wadah pill fill-1,
 * opsi aktif berlatar ink dengan teks surface agar tidak bersaing dengan tombol
 * primer; opsi lain transparan berwarna ink-2. Tekan opsi mengecilkan ke 0.96
 * (hormati LocalReducedMotion). Satu grup pilihan tunggal (semantik selectableGroup).
 */
@Composable
fun MkSegmentedControl(
    modifier: Modifier = Modifier,
    options: List<MkOpsi>,
    terpilih: String,
    onPilih: (String) -> Unit,
) {
    val warna = LocalMkColors.current
    Row(
        // Padding 3dp + jarak 2dp mengikuti padanan web .mk-seg (padding 3px, gap 2px).
        modifier = modifier
            .clip(MkShapes.penuh)
            .background(warna.fill1)
            .selectableGroup()
            .padding(3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { opsi ->
            OpsiSegment(
                opsi = opsi,
                aktif = opsi.value == terpilih,
                onPilih = onPilih,
            )
        }
    }
}

/** Satu opsi dalam segmented: pill 34dp, aktif ink/surface, tekan 0.96. */
@Composable
private fun OpsiSegment(
    opsi: MkOpsi,
    aktif: Boolean,
    onPilih: (String) -> Unit,
) {
    val warna = LocalMkColors.current
    val interactionSource = remember { MutableInteractionSource() }
    val skala = mkTekanSkala(interactionSource, 0.96f)
    Row(
        modifier = Modifier
            .height(34.dp)
            .clip(MkShapes.penuh)
            .graphicsLayer {
                scaleX = skala
                scaleY = skala
            }
            .then(if (aktif) Modifier.background(warna.ink, MkShapes.penuh) else Modifier)
            .selectable(
                selected = aktif,
                interactionSource = interactionSource,
                indication = null,
                role = Role.Button,
                onClick = { onPilih(opsi.value) },
            )
            .padding(horizontal = MkSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Text(
            text = opsi.label,
            color = if (aktif) warna.surface else warna.ink2,
            style = if (aktif) {
                MkTypography.callout.copy(fontWeight = FontWeight.SemiBold)
            } else {
                MkTypography.callout
            },
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (opsi.count != null) {
            // Lencana jumlah di atas latar surface agar terbaca di kedua keadaan opsi.
            Text(
                text = opsi.count.toString(),
                color = if (aktif) warna.ink else warna.ink2,
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
private fun MkSegmentedControlPreview() {
    MKTheme {
        Row(
            modifier = Modifier.padding(MkSpacing.space4),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            MkSegmentedControl(
                options = listOf(
                    MkOpsi(value = "harian", label = "Harian"),
                    MkOpsi(value = "mingguan", label = "Mingguan", count = 4),
                    MkOpsi(value = "bulanan", label = "Bulanan", count = 0),
                ),
                terpilih = "harian",
                onPilih = {},
            )
            MkSegmentedControl(
                options = listOf(
                    MkOpsi(value = "semua", label = "Semua", count = 24),
                    MkOpsi(value = "belum", label = "Belum dikirim", count = 3),
                ),
                terpilih = "belum",
                onPilih = {},
            )
        }
    }
}
