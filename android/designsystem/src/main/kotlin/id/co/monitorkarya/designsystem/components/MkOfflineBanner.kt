package id.co.monitorkarya.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkEasing
import id.co.monitorkarya.designsystem.theme.MkMotion
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Baris indikator luring di atas layar: ikon wifi_off, teks "Anda sedang luring —
 * data terakhir masih terbaca", tombol teks "Coba lagi". Muncul lewat animasi
 * alpha + translateY 12dp selama 250 ms (dur-base, ease-standard); reduced motion
 * hanya alpha tanpa geser.
 */
@Composable
fun MkOfflineBanner(
    modifier: Modifier = Modifier,
    terlihat: Boolean,
    onCobaLagi: () -> Unit,
) {
    val redakanGerak = LocalReducedMotion.current
    val alpha by animateFloatAsState(
        targetValue = if (terlihat) 1f else 0f,
        animationSpec = tween(durationMillis = MkMotion.Base, easing = MkEasing.Standard),
        label = "mk-offline-alpha",
    )
    val geser by animateFloatAsState(
        targetValue = if (terlihat) 0f else -1f,
        animationSpec = tween(durationMillis = MkMotion.Base, easing = MkEasing.Standard),
        label = "mk-offline-geser",
    )
    // Nilai ditangkap ke lokal agar tidak tertukar dengan properti alpha GraphicsLayerScope.
    val alphaAnim = alpha
    Box(
        modifier.graphicsLayer {
            this.alpha = alphaAnim
            translationY = if (redakanGerak) 0f else geser * 12.dp.toPx()
        },
    ) {
        // Setelah pudar sepenuhnya isi dilepas supaya tidak bisa diketuk saat tersembunyi.
        if (alpha > 0.01f) {
            val warna = LocalMkColors.current
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(shape = MkShapes.md)
                    .background(color = warna.fill1)
                    .padding(start = MkSpacing.space4, top = 10.dp, bottom = 10.dp, end = MkSpacing.space2),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                Icon(
                    imageVector = Icons.Outlined.WifiOff,
                    contentDescription = null,
                    tint = warna.ink2,
                    modifier = Modifier.size(size = 18.dp),
                )
                Text(
                    text = "Anda sedang luring — data terakhir masih terbaca",
                    style = MkTypography.body,
                    color = warna.ink,
                    modifier = Modifier.weight(1f),
                )
                MkButton(
                    label = "Coba lagi",
                    onClick = { if (terlihat) onCobaLagi() },
                    variant = MkButtonVariant.PLAIN,
                    size = MkButtonSize.S,
                )
            }
        }
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkOfflineBannerPreview() {
    MKTheme {
        Box(modifier = Modifier.background(color = LocalMkColors.current.bg).padding(all = MkSpacing.space4)) {
            MkOfflineBanner(terlihat = true, onCobaLagi = {})
        }
    }
}
