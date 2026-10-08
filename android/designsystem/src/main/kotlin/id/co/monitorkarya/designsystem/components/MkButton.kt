package id.co.monitorkarya.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkEasing
import id.co.monitorkarya.designsystem.theme.MkMotion
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/** Varian tombol: PRIMARY isian aksen (maks. satu per kartu/layar), SECONDARY bergaris, PLAIN teks aksen. */
enum class MkButtonVariant { PRIMARY, SECONDARY, PLAIN }

/** Ukuran tombol: M tinggi 44dp (bawaan), S tinggi 36dp. */
enum class MkButtonSize(val tinggi: Dp) { M(44.dp), S(36.dp) }

/**
 * Skala tekan bersama untuk komponen interaktif (durasi MkMotion.Fast, kurva MkEasing.Standard).
 * Mengembalikan 1f tanpa animasi saat LocalReducedMotion aktif.
 */
@Composable
internal fun mkTekanSkala(interactionSource: InteractionSource, skalaTekan: Float): Float {
    val gerakDikurangi = LocalReducedMotion.current
    val ditekan by interactionSource.collectIsPressedAsState()
    val skala by animateFloatAsState(
        targetValue = if (ditekan && !gerakDikurangi) skalaTekan else 1f,
        animationSpec = tween(durationMillis = MkMotion.Fast, easing = MkEasing.Standard),
        label = "mkTekanSkala",
    )
    return skala
}

/**
 * Tombol kapsul Monitor Karya (port Button web).
 * PRIMARY: isian aksen (accent-fill) + teks on-accent. SECONDARY: surface + garis 1dp line.
 * PLAIN: transparan + teks aksen. Label 15sp semibold (bodyStrong); tekan mengecil ke 0.97;
 * enabled=false meredupkan ke alpha 0.4 tanpa klik.
 */
@Composable
fun MkButton(
    modifier: Modifier = Modifier,
    label: String,
    onClick: () -> Unit,
    variant: MkButtonVariant = MkButtonVariant.SECONDARY,
    size: MkButtonSize = MkButtonSize.M,
    enabled: Boolean = true,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val interactionSource = remember { MutableInteractionSource() }
    val skala = mkTekanSkala(interactionSource, 0.97f)
    val latar = when (variant) {
        MkButtonVariant.PRIMARY -> aksen.fill
        MkButtonVariant.SECONDARY -> warna.surface
        MkButtonVariant.PLAIN -> Color.Transparent
    }
    val isi = when (variant) {
        MkButtonVariant.PRIMARY -> aksen.on
        MkButtonVariant.SECONDARY -> warna.ink
        MkButtonVariant.PLAIN -> aksen.text
    }
    Box(
        modifier = modifier
            .height(size.tinggi)
            .clip(MkShapes.penuh)
            .graphicsLayer {
                scaleX = skala
                scaleY = skala
            }
            .background(latar, MkShapes.penuh)
            .then(
                if (variant == MkButtonVariant.SECONDARY) {
                    Modifier.border(1.dp, warna.line, MkShapes.penuh)
                } else {
                    Modifier
                }
            )
            .alpha(if (enabled) 1f else 0.4f)
            .clickable(
                interactionSource = interactionSource,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = MkSpacing.space5),
        contentAlignment = Alignment.Center,
    ) {
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
private fun MkButtonPreview() {
    MKTheme {
        Column(
            modifier = Modifier.padding(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            MkButton(label = "Setujui laporan", variant = MkButtonVariant.PRIMARY, onClick = {})
            MkButton(label = "Tolak", variant = MkButtonVariant.SECONDARY, onClick = {})
            MkButton(label = "Lihat semua proyek", variant = MkButtonVariant.PLAIN, onClick = {})
            MkButton(label = "Tidak bisa diklik", variant = MkButtonVariant.PRIMARY, enabled = false, onClick = {})
            MkButton(label = "Ukuran S", size = MkButtonSize.S, variant = MkButtonVariant.SECONDARY, onClick = {})
        }
    }
}
