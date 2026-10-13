// Potongan UI bersama dua tab (padanan SectionTitle, mk-adm-row, mk-note-box,
// ProgressBar web). Semua nilai visual dari token designsystem.
package id.co.monitorkarya.feature.entitas.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.MkBadgeSize
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.designsystem.components.warnaStatus
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography

/** Judul bagian dengan ikon kecil dan aksi opsional di kanan. */
@Composable
fun JudulBagian(
    teks: String,
    ikon: ImageVector? = null,
    modifier: Modifier = Modifier,
    aksi: @Composable (RowScope.() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        if (ikon != null) {
            Icon(imageVector = ikon, contentDescription = null, tint = warna.ink2, modifier = Modifier.size(18.dp))
        }
        Text(
            text = teks,
            style = MkTypography.title3,
            color = warna.ink,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        aksi?.invoke(this)
    }
}

/** Kotak catatan lembut; [status] memberi garis warna status di kiri. */
@Composable
fun CatatanInfo(teks: String, modifier: Modifier = Modifier, status: MkStatus? = null) {
    val warna = LocalMkColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clip(MkShapes.md)
            .background(warna.fill1),
    ) {
        if (status != null) {
            Box(Modifier.width(4.dp).fillMaxHeight().background(warnaStatus(status)))
        }
        Text(
            text = teks,
            style = MkTypography.footnote,
            color = warna.ink2,
            modifier = Modifier.padding(MkSpacing.space4),
        )
    }
}

/** Lencana status (warna + ikon + kata). */
@Composable
fun LencanaStatus(sk: StatusKata, modifier: Modifier = Modifier, size: MkBadgeSize = MkBadgeSize.SM) {
    StatusBadge(modifier = modifier, status = sk.status, size = size, text = sk.kata)
}

/** Bilah progres 0..100 bertoken; angka persen tertulis di kanan. */
@Composable
fun BilahProgres(
    nilai: Int,
    labelAksesibel: String,
    modifier: Modifier = Modifier,
    warnaIsi: Color = Color.Unspecified,
    tampilkanAngka: Boolean = true,
) {
    val warna = LocalMkColors.current
    val isi = if (warnaIsi == Color.Unspecified) LocalAccent.current.fill else warnaIsi
    Row(
        modifier = modifier.semantics { contentDescription = "$labelAksesibel $nilai persen" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(6.dp)
                .clip(MkShapes.penuh)
                .background(warna.fill2),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(porsi(nilai))
                    .height(6.dp)
                    .clip(MkShapes.penuh)
                    .background(isi),
            )
        }
        if (tampilkanAngka) {
            Text(text = "$nilai%", style = MkTypography.caption, color = warna.ink2)
        }
    }
}

/** Baris daftar dua baris teks (judul + meta) dengan elemen kanan opsional. */
@Composable
fun BarisInfo(
    judul: String,
    meta: String? = null,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    kanan: @Composable (RowScope.() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(vertical = MkSpacing.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = judul,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (!meta.isNullOrBlank()) {
                Text(
                    text = meta,
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        kanan?.invoke(this)
    }
}

/** Wadah kartu lembut (mk-inset). */
@Composable
fun Kotak(modifier: Modifier = Modifier, konten: @Composable ColumnScope.() -> Unit) {
    val warna = LocalMkColors.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(warna.fill1)
            .padding(MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        content = konten,
    )
}

/** Kerangka memuat: [jumlah] balok setinggi [tinggi]. */
@Composable
fun KerangkaDaftar(jumlah: Int = 5, tinggi: androidx.compose.ui.unit.Dp = 48.dp) {
    Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
        repeat(jumlah) { MkSkeleton(modifier = Modifier.fillMaxWidth(), tinggi = tinggi) }
    }
}
