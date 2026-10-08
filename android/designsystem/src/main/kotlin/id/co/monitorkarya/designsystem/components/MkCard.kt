package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Kartu permukaan Monitor Karya: latar surface, radius kartu 22 (MkShapes.kartu),
 * garis 1dp line. Bila [onClick] diisi, seluruh kartu dapat diklik dengan ripple
 * yang terpotong mengikuti sudut.
 */
@Composable
fun MkCard(
    modifier: Modifier = Modifier,
    padding: Dp = MkSpacing.space5,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val warna = LocalMkColors.current
    val dasar = modifier
        .clip(MkShapes.kartu)
        .background(warna.surface, MkShapes.kartu)
        .border(1.dp, warna.line, MkShapes.kartu)
    if (onClick == null) {
        Column(
            modifier = dasar.padding(padding),
            content = content,
        )
    } else {
        val interactionSource = remember { MutableInteractionSource() }
        Column(
            modifier = dasar.clickable(
                interactionSource = interactionSource,
                onClick = onClick,
            ).padding(padding),
            content = content,
        )
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkCardPreview() {
    MKTheme {
        Column(modifier = Modifier.padding(MkSpacing.space4)) {
            MkCard(modifier = Modifier.fillMaxWidth()) {
                Text("Kinerja divisi", style = MkTypography.headline, color = LocalMkColors.current.ink)
                Text(
                    "Tepat waktu · target 85%",
                    style = MkTypography.footnote,
                    color = LocalMkColors.current.ink2,
                )
            }
            MkCard(
                modifier = Modifier.fillMaxWidth().padding(top = MkSpacing.space3),
                onClick = {},
            ) {
                Text("Kartu yang bisa diklik", style = MkTypography.headline, color = LocalMkColors.current.ink)
                Text(
                    "Ripple terpotong mengikuti sudut kartu",
                    style = MkTypography.footnote,
                    color = LocalMkColors.current.ink2,
                )
            }
        }
    }
}
