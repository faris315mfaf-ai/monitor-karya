package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/** Varian ubin: INSET isian fill1 di dalam kartu (bawaan), SURFACE kartu kecil berdiri sendiri. */
enum class MkStatVariant { INSET, SURFACE }

/** Arah delta KPI: UP naik, DOWN turun, FLAT datar. */
enum class MkTrend { UP, DOWN, FLAT }

/**
 * Warna delta KPI: UP memakai statusOn, DOWN statusRisk, datar/tanpa tren statusNeutral;
 * parameter [tone] menimpa pemetaan bawaan (mis. "proyek terlambat naik" ke LATE).
 */
@Composable
fun warnaDelta(trend: MkTrend? = null, tone: MkStatus? = null): Color {
    if (tone != null) return warnaStatus(tone)
    val warna = LocalMkColors.current
    return when (trend) {
        MkTrend.UP -> warna.statusOn
        MkTrend.DOWN -> warna.statusRisk
        else -> warna.statusNeutral
    }
}

/**
 * Ubin KPI (port StatTile web): label kecil ink2, angka besar tabular (title2),
 * dan delta footnote dengan panah opsional yang ikut warna delta.
 */
@Composable
fun StatTile(
    modifier: Modifier = Modifier,
    label: String,
    value: Any,
    delta: String? = null,
    trend: MkTrend? = null,
    tone: MkStatus? = null,
    variant: MkStatVariant = MkStatVariant.INSET,
) {
    val warna = LocalMkColors.current
    val bentuk: RoundedCornerShape
    val latar: Color
    val pad: Dp
    when (variant) {
        MkStatVariant.INSET -> {
            bentuk = MkShapes.md
            latar = warna.fill1
            pad = MkSpacing.space4
        }
        MkStatVariant.SURFACE -> {
            bentuk = MkShapes.kartu
            latar = warna.surface
            pad = MkSpacing.space5
        }
    }
    Column(
        modifier = modifier
            .clip(bentuk)
            .background(latar, bentuk)
            .then(
                if (variant == MkStatVariant.SURFACE) {
                    Modifier.border(1.dp, warna.line, bentuk)
                } else {
                    Modifier
                }
            )
            .padding(pad),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Text(
            text = label,
            color = warna.ink2,
            style = MkTypography.footnote,
            maxLines = 1,
        )
        Text(
            text = value.toString(),
            color = warna.ink,
            style = MkTypography.title2.tabular,
            maxLines = 1,
        )
        if (delta != null) {
            val warnaDeltaIni = warnaDelta(trend = trend, tone = tone)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1),
            ) {
                when (trend) {
                    MkTrend.UP -> Icon(
                        imageVector = Icons.Outlined.ArrowUpward,
                        contentDescription = null,
                        tint = warnaDeltaIni,
                        modifier = Modifier.size(14.dp),
                    )
                    MkTrend.DOWN -> Icon(
                        imageVector = Icons.Outlined.ArrowDownward,
                        contentDescription = null,
                        tint = warnaDeltaIni,
                        modifier = Modifier.size(14.dp),
                    )
                    else -> Unit
                }
                Text(
                    text = delta,
                    color = warnaDeltaIni,
                    style = MkTypography.footnote.copy(fontWeight = FontWeight.SemiBold),
                    maxLines = 2,
                )
            }
        }
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun StatTilePreview() {
    MKTheme {
        Column(
            modifier = Modifier.padding(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            StatTile(
                modifier = Modifier.fillMaxWidth(),
                label = "Output minggu ini",
                value = 142,
                delta = "+9% dari minggu lalu",
                trend = MkTrend.UP,
            )
            StatTile(
                modifier = Modifier.fillMaxWidth(),
                label = "Proyek terlambat",
                value = 3,
                delta = "+1 dari minggu lalu",
                trend = MkTrend.UP,
                tone = MkStatus.LATE,
            )
            StatTile(
                modifier = Modifier.fillMaxWidth(),
                label = "Persetujuan",
                value = 5,
                delta = "1 lewat 24 jam",
                trend = MkTrend.DOWN,
                tone = MkStatus.RISK,
                variant = MkStatVariant.SURFACE,
            )
            StatTile(
                modifier = Modifier.fillMaxWidth(),
                label = "Kepatuhan laporan",
                value = "96%",
                delta = "sama seperti minggu lalu",
                trend = MkTrend.FLAT,
                variant = MkStatVariant.SURFACE,
            )
        }
    }
}
