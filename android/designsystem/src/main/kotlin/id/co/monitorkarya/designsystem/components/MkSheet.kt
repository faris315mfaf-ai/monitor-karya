@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package id.co.monitorkarya.designsystem.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.KeyboardArrowLeft
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkEasing
import id.co.monitorkarya.designsystem.theme.MkMotion
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/** Lebar sheet samping di layar lebar (token sheet-w, docs/design/05). */
private val LebarSheetSamping = 440.dp

/** Titik pisah tata letak: di bawah ini memakai bottom sheet. */
private val LebarLayarLebar = 840.dp

/**
 * Sheet detail (port Sheet web, docs/design/05 "Perangkat & navigasi"):
 * layar <840dp → ModalBottomSheet M3 dengan scrim token dan dragHandle kecil;
 * ≥840dp → dialog custom menempel kanan, lebar 440dp, tinggi mengikuti isi,
 * muncul lewat fade + skala 0.98 → 1 selama 250 ms (dur-base, ease-standard).
 * Reduced motion: tanpa slide/skala — panel langsung tampil.
 */
@Composable
fun MkSheet(
    modifier: Modifier = Modifier,
    visible: Boolean,
    onTutup: () -> Unit,
    judul: String,
    subjudul: String? = null,
    backLabel: String? = null,
    footer: @Composable RowScope.() -> Unit = {},
    konten: @Composable ColumnScope.() -> Unit,
) {
    BoxWithConstraints(modifier) {
        if (maxWidth >= LebarLayarLebar) {
            if (visible) {
                SheetSamping(
                    onTutup = onTutup,
                    judul = judul,
                    subjudul = subjudul,
                    footer = footer,
                    konten = konten,
                    tinggiMaks = maxHeight * 0.92f,
                )
            }
        } else if (visible) {
            SheetBawah(
                onTutup = onTutup,
                judul = judul,
                subjudul = subjudul,
                backLabel = backLabel,
                footer = footer,
                konten = konten,
            )
        }
    }
}

/** Ragam ≥840dp: dialog custom menempel di kanan, lebar 440dp, tinggi mengikuti isi. */
@Composable
private fun SheetSamping(
    onTutup: () -> Unit,
    judul: String,
    subjudul: String?,
    footer: @Composable RowScope.() -> Unit,
    konten: @Composable ColumnScope.() -> Unit,
    tinggiMaks: Dp,
) {
    val warna = LocalMkColors.current
    val bolehGerak = !LocalReducedMotion.current
    val kemajuan = remember { Animatable(if (bolehGerak) 0f else 1f) }
    LaunchedEffect(Unit) {
        if (bolehGerak) {
            kemajuan.animateTo(
                targetValue = 1f,
                animationSpec = tween(durationMillis = MkMotion.Base, easing = MkEasing.Standard),
            )
        }
    }
    Dialog(onDismissRequest = onTutup, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier
                .fillMaxSize()
                .background(color = warna.scrim.copy(alpha = warna.scrim.alpha * kemajuan.value))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onTutup,
                ),
        ) {
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .fillMaxWidth()
                    .widthIn(max = LebarSheetSamping)
                    .heightIn(max = tinggiMaks)
                    .graphicsLayer {
                        val skala = 0.98f + 0.02f * kemajuan.value
                        scaleX = skala
                        scaleY = skala
                        alpha = kemajuan.value
                    }
                    // Konsumsi ketukan agar panel tidak menutup sheet.
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {},
                    ),
            ) {
                IsiSheet(
                    denganLatar = true,
                    tombolTutup = onTutup,
                    judul = judul,
                    subjudul = subjudul,
                    footer = footer,
                    konten = konten,
                )
            }
        }
    }
}

/** Ragam <840dp: ModalBottomSheet M3 dengan dragHandle kecil dan scrim token. */
@Composable
private fun SheetBawah(
    onTutup: () -> Unit,
    judul: String,
    subjudul: String?,
    backLabel: String?,
    footer: @Composable RowScope.() -> Unit,
    konten: @Composable ColumnScope.() -> Unit,
) {
    val warna = LocalMkColors.current
    ModalBottomSheet(
        onDismissRequest = onTutup,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = warna.surface,
        scrimColor = warna.scrim,
        dragHandle = {
            // DragHandle kecil meniru grabber web (36x5) dalam versi ramping 28x4.
            Box(
                Modifier
                    .padding(top = 10.dp, bottom = MkSpacing.space1)
                    .size(width = 28.dp, height = 4.dp)
                    .background(color = warna.fill2, shape = MkShapes.penuh),
            )
        },
    ) {
        Column(Modifier.navigationBarsPadding()) {
            if (backLabel != null) {
                TextButton(
                    onClick = onTutup,
                    modifier = Modifier.align(Alignment.Start),
                ) {
                    Icon(imageVector = Icons.Outlined.KeyboardArrowLeft, contentDescription = null)
                    Text(text = backLabel)
                }
            }
            IsiSheet(
                denganLatar = false,
                tombolTutup = null,
                judul = judul,
                subjudul = subjudul,
                footer = footer,
                konten = konten,
                modifier = Modifier.padding(bottom = MkSpacing.space2),
            )
        }
    }
}

/** Isi sheet yang dipakai dua ragam: kepala, konten (dapat digulir), dan footer. */
@Composable
private fun IsiSheet(
    denganLatar: Boolean,
    tombolTutup: (() -> Unit)?,
    judul: String,
    subjudul: String?,
    footer: @Composable RowScope.() -> Unit,
    konten: @Composable ColumnScope.() -> Unit,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    val latar = if (denganLatar) {
        Modifier.background(color = warna.surface, shape = MkShapes.sheet)
    } else {
        Modifier
    }
    Column(
        modifier
            .then(latar)
            .padding(all = MkSpacing.space6),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space6),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = judul,
                    style = MkTypography.title3,
                    color = warna.ink,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.semantics { heading() },
                )
                if (subjudul != null) {
                    Text(
                        text = subjudul,
                        style = MkTypography.footnote,
                        color = warna.ink2,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
            if (tombolTutup != null) {
                IconButton(onClick = tombolTutup) {
                    Icon(imageVector = Icons.Outlined.Close, contentDescription = "Tutup")
                }
            }
        }
        Column(
            Modifier
                .weight(1f, fill = false)
                .verticalScroll(rememberScrollState()),
            content = konten,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
            content = footer,
        )
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun IsiSheetPreview() {
    MKTheme {
        Box(Modifier.background(color = LocalMkColors.current.bg).padding(all = MkSpacing.space4)) {
            IsiSheet(
                denganLatar = true,
                tombolTutup = {},
                judul = "SIM RS Bhakti Rahayu",
                subjudul = "Divisi Teknologi · PT Medcreatix",
                footer = {
                    MkButton(label = "Kirim masukan", onClick = {})
                    MkButton(label = "Batal", onClick = {}, variant = MkButtonVariant.PLAIN)
                },
                konten = {
                    Text(
                        text = "Isi detail proyek dibuka di sheet tanpa pindah halaman.",
                        style = MkTypography.body,
                    )
                },
            )
        }
    }
}
