package id.co.monitorkarya.designsystem.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Blok kerangka pemuatan (port Skeleton web): Box radius-sm 10 isian fill-1
 * dengan denyut alpha 0.55 ↔ 1.0 selama 1200 ms (RepeatMode.Reverse).
 * Reduced motion: statis alpha 1.0 tanpa kedip. `lebar` kosong → mengisi lebar.
 */
@Composable
fun MkSkeleton(
    modifier: Modifier = Modifier,
    tinggi: Dp = 16.dp,
    lebar: Dp? = null,
) {
    val alphaNilai = if (LocalReducedMotion.current) {
        1f
    } else {
        rememberInfiniteTransition(label = "mk-skeleton")
            .animateFloat(
                initialValue = 0.55f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 1200),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "mk-skeleton-alpha",
            )
            .value
    }
    Box(
        modifier
            .then(if (lebar == null) Modifier.fillMaxWidth() else Modifier.width(width = lebar))
            .height(height = tinggi)
            .alpha(alpha = alphaNilai)
            .clip(shape = MkShapes.sm)
            .background(color = LocalMkColors.current.fill1),
    )
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkSkeletonPreview() {
    MKTheme {
        Column(
            modifier = Modifier
                .background(color = LocalMkColors.current.bg)
                .padding(all = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            MkSkeleton(tinggi = 14.dp, lebar = 220.dp)
            MkSkeleton(tinggi = 40.dp)
            MkSkeleton(tinggi = 96.dp)
        }
    }
}
