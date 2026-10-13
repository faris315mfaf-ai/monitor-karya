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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.material3.SheetValue
import androidx.compose.foundation.layout.safeDrawingPadding
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
 * Tinggi tersedia di bawah ini → kepala, isi, dan footer digulir bersama
 * (lanskap ponsel + keyboard). Di atasnya kepala/footer menempel dan hanya isi
 * yang digulir.
 */
internal val TinggiSheetRingkas = 420.dp

/**
 * Ragam tata letak sheet dari LEBAR JENDELA (bukan area tab pemanggil yang sudah
 * dipotong bilah atas/bawah — E2E-1 #3): ≥840dp = panel samping 440dp.
 */
fun sheetSamping(lebarJendela: Dp): Boolean = lebarJendela >= LebarLayarLebar

/** Kepala ikut digulir bersama isi bila tinggi tersedia pendek (lihat [TinggiSheetRingkas]). */
fun sheetRingkas(tinggiTersedia: Dp): Boolean = tinggiTersedia != Dp.Infinity && tinggiTersedia < TinggiSheetRingkas

/**
 * E2E-R2-3 N5: footer TETAP menempel di lanskap ponsel (±350dp); hanya bila
 * tinggi tersedia sangat pendek (keyboard terbuka di lanskap) footer ikut
 * digulir supaya isian tidak terjepit ke tinggi 0.
 */
internal val TinggiSheetSangatPendek = 240.dp

fun sheetFooterIkutGulir(tinggiTersedia: Dp): Boolean =
    tinggiTersedia != Dp.Infinity && tinggiTersedia < TinggiSheetSangatPendek

/**
 * Sheet detail (port Sheet web, docs/design/05 "Perangkat & navigasi"):
 * jendela <840dp → ModalBottomSheet M3 dengan scrim token dan dragHandle kecil;
 * ≥840dp → dialog custom menempel kanan, lebar 440dp, tinggi mengikuti isi
 * (maks 92% tinggi JENDELA dialog), muncul lewat fade + skala 0.98 → 1 selama
 * 250 ms (dur-base, ease-standard). Reduced motion: panel langsung tampil.
 *
 * [bolehTutupGeser] false (mis. isian berubah dan belum disimpan): geser ke
 * bawah, ketuk scrim, dan tombol Kembali TIDAK menutup sheet — pengguna menutup
 * lewat tombol eksplisit (Batal/Simpan) sehingga perubahan tidak terbuang diam-diam.
 * [galat] slot pesan galat yang menempel tepat di atas footer (tidak ikut
 * tergulir) — selalu terlihat saat tombol aksi ditekan.
 */
@Composable
fun MkSheet(
    modifier: Modifier = Modifier,
    visible: Boolean,
    onTutup: () -> Unit,
    judul: String,
    subjudul: String? = null,
    backLabel: String? = null,
    bolehTutupGeser: Boolean = true,
    galat: (@Composable () -> Unit)? = null,
    footer: @Composable RowScope.() -> Unit = {},
    konten: @Composable ColumnScope.() -> Unit,
) {
    val lebarJendela = LocalConfiguration.current.screenWidthDp.dp
    Box(modifier) {
        if (!visible) return@Box
        if (sheetSamping(lebarJendela)) {
            SheetSamping(
                onTutup = onTutup,
                judul = judul,
                subjudul = subjudul,
                bolehTutupGeser = bolehTutupGeser,
                galat = galat,
                footer = footer,
                konten = konten,
            )
        } else {
            SheetBawah(
                onTutup = onTutup,
                judul = judul,
                subjudul = subjudul,
                backLabel = backLabel,
                bolehTutupGeser = bolehTutupGeser,
                galat = galat,
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
    bolehTutupGeser: Boolean,
    galat: (@Composable () -> Unit)?,
    footer: @Composable RowScope.() -> Unit,
    konten: @Composable ColumnScope.() -> Unit,
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
    val tutupLuar: () -> Unit = { if (bolehTutupGeser) onTutup() }
    Dialog(
        onDismissRequest = tutupLuar,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = bolehTutupGeser,
            dismissOnClickOutside = bolehTutupGeser,
        ),
    ) {
        // Tinggi diambil dari JENDELA dialog (BoxWithConstraints di dalam Dialog),
        // bukan dari area tab pemanggil — E2E-1 #3 / E2E-2 BUG-05.
        BoxWithConstraints(
            Modifier
                .fillMaxSize()
                .background(color = warna.scrim.copy(alpha = warna.scrim.alpha * kemajuan.value))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = tutupLuar,
                )
                .safeDrawingPadding(),
        ) {
            val tinggiJendela = if (maxHeight != Dp.Infinity) maxHeight else LocalConfiguration.current.screenHeightDp.dp
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = MkSpacing.space3)
                    // widthIn SEBELUM fillMaxWidth: panel tepat 440dp (urutan
                    // terbalik membuat panel selebar layar — E2E-2 BUG-05).
                    .widthIn(max = LebarSheetSamping)
                    .fillMaxWidth()
                    .heightIn(max = tinggiJendela * 0.92f)
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
                    galat = galat,
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
    bolehTutupGeser: Boolean,
    galat: (@Composable () -> Unit)?,
    footer: @Composable RowScope.() -> Unit,
    konten: @Composable ColumnScope.() -> Unit,
) {
    val warna = LocalMkColors.current
    // Nilai terbaru dibaca saat gestur terjadi (state sheet diingat sekali).
    val bolehTutup by rememberUpdatedState(bolehTutupGeser)
    ModalBottomSheet(
        onDismissRequest = { if (bolehTutup) onTutup() },
        sheetState = rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            // E2E-1 #5: isian berubah → geser/scrim/Kembali tidak menutup.
            confirmValueChange = { nilai -> nilai != SheetValue.Hidden || bolehTutup },
        ),
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
                galat = galat,
                footer = footer,
                konten = konten,
                modifier = Modifier.padding(bottom = MkSpacing.space2),
            )
        }
    }
}

/**
 * Isi sheet yang dipakai dua ragam: kepala, konten (dapat digulir), galat, dan
 * footer. Bila tinggi tersedia pendek ([sheetRingkas]) seluruhnya digulir
 * bersama supaya isian tidak pernah terjepit ke tinggi 0.
 */
@Composable
private fun IsiSheet(
    denganLatar: Boolean,
    tombolTutup: (() -> Unit)?,
    judul: String,
    subjudul: String?,
    galat: (@Composable () -> Unit)?,
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
    BoxWithConstraints(modifier.then(latar)) {
        val ringkas = sheetRingkas(maxHeight)
        val semuaGulir = sheetFooterIkutGulir(maxHeight)
        val gulirIsi = rememberScrollState()
        val jarak = if (ringkas) MkSpacing.space4 else MkSpacing.space6
        val kepala: @Composable () -> Unit = {
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
        }
        Column(
            Modifier
                .then(if (semuaGulir) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                .padding(all = jarak),
            verticalArrangement = Arrangement.spacedBy(jarak),
        ) {
            when {
                // Sangat pendek: semuanya satu gulir (isi tidak terjepit ke 0).
                semuaGulir -> {
                    kepala()
                    Column(content = konten)
                }
                // Lanskap ponsel: kepala ikut gulir bersama isi, footer menempel.
                ringkas -> Column(
                    Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(gulirIsi),
                    verticalArrangement = Arrangement.spacedBy(jarak),
                ) {
                    kepala()
                    Column(content = konten)
                }
                else -> {
                    kepala()
                    Column(
                        Modifier
                            .weight(1f, fill = false)
                            .verticalScroll(gulirIsi),
                        content = konten,
                    )
                }
            }
            if (galat != null) {
                Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) { galat() }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
                content = footer,
            )
        }
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
                galat = null,
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
