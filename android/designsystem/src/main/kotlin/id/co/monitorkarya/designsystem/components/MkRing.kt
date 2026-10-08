package id.co.monitorkarya.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkEasing
import id.co.monitorkarya.designsystem.theme.MkMotion
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/**
 * Cincin progres satu sasaran (padanan ProgressRing web, digambar dengan Canvas):
 * isian tebal dari token aksen (accent-fill) atau token lain lewat [warna], sisa
 * lingkaran fill-1, dan nilai persen tabular di tengah. Isian beranimasi selama
 * MkMotion.Data dengan kurva standar; saat LocalReducedMotion aktif nilai langsung
 * tampil tanpa animasi isi.
 *
 * @param diameter ukuran cincin; angka tengah mengikuti 0.24 × diameter.
 * @param tebal tebal garis; [Dp.Unspecified] → max(6dp, diameter/11).
 * @param warna warna isian token; [Color.Unspecified] → accent-fill aksen aktif
 *   (mis. `warnaStatus(MkStatus.ON)` untuk cincin status).
 */
@Composable
fun MkRing(
    modifier: Modifier = Modifier,
    nilai: Int,
    diameter: Dp = 160.dp,
    tebal: Dp = Dp.Unspecified,
    warna: Color = Color.Unspecified,
) {
    val palet = LocalMkColors.current
    val warnaGaris = if (warna == Color.Unspecified) LocalAccent.current.fill else warna
    val ketebalan = if (tebal == Dp.Unspecified) (diameter / 11).coerceAtLeast(6.dp) else tebal
    val isi = nilai.coerceIn(0, 100)

    val gerakDikurangi = LocalReducedMotion.current
    val porsi by animateFloatAsState(
        targetValue = isi / 100f,
        animationSpec = if (gerakDikurangi) snap() else tween(MkMotion.Data, easing = MkEasing.Standard),
        label = "mkRingIsi",
    )

    Box(
        modifier = modifier
            .size(diameter)
            .semantics(mergeDescendants = true) {
                progressBarRangeInfo = ProgressBarRangeInfo(isi / 100f, 0f..1f)
                contentDescription = "$isi%"
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val gores = ketebalan.toPx()
            val radius = (size.minDimension - gores) / 2f
            // Sisa trek: fill-1 (spesifikasi T6-C4; web memakai warna nada @16% — beda disengaja).
            drawCircle(color = palet.fill1, radius = radius, style = Stroke(width = gores))
            // Isian token, mulai dari pukul 12, ujung membulat.
            if (porsi > 0f) {
                drawArc(
                    color = warnaGaris,
                    startAngle = -90f,
                    sweepAngle = 360f * porsi,
                    useCenter = false,
                    style = Stroke(width = gores, cap = StrokeCap.Round),
                )
            }
        }
        Text(
            text = "$isi%",
            style = gayaAngka(diameter = diameter),
            color = palet.ink,
            maxLines = 1,
        )
    }
}

/**
 * Gaya angka tengah (padanan `.mk-ring__value` web): display tebal, tabular,
 * 0.24 × diameter, line-height 1. Tracking -0.03em hanya bila >=20sp;
 * ukuran tidak turun di bawah 12sp (aturan tipografi mk).
 */
private fun gayaAngka(diameter: Dp): TextStyle {
    val ukuranSp = (diameter.value * 0.24f).coerceAtLeast(12f)
    return MkTypography.title2
        .copy(
            fontSize = ukuranSp.sp,
            lineHeight = ukuranSp.sp,
            letterSpacing = if (ukuranSp >= 20f) (-0.03f).em else 0.em,
        ).tabular
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkRingPreview() {
    MKTheme {
        Column(
            modifier = Modifier
                .background(color = LocalMkColors.current.bg)
                .padding(all = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space4),
            ) {
                MkRing(nilai = 72) // aksen aktif, 160dp
                MkRing(nilai = 45, diameter = 120.dp, warna = warnaStatus(MkStatus.ON))
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space4),
            ) {
                MkRing(nilai = 0, diameter = 72.dp, tebal = 8.dp)
                MkRing(nilai = 100, diameter = 72.dp, tebal = 8.dp, warna = warnaStatus(MkStatus.DONE))
                MkRing(nilai = 88, diameter = 72.dp, tebal = 8.dp, warna = warnaStatus(MkStatus.LATE))
            }
        }
    }
}
