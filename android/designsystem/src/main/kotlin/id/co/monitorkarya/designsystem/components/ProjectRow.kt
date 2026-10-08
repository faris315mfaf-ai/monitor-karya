package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/**
 * Baris proyek penuh (port ProjectRow web): kolom kiri nama (bodyStrong) +
 * subjudul "divisi · entitas" (footnote ink-2); tengah progres tipis token +
 * persen angka tabular; kanan PIC (avatar lingkaran 32dp inisial + nama caption)
 * dan StatusBadge S. `compact` menyembunyikan kolom tengah. `pic` kosong memakai
 * fallback "PIC belum ditentukan" dengan inisial "—".
 */
@Composable
fun ProjectRow(
    modifier: Modifier = Modifier,
    nama: String,
    divisi: String,
    entitas: String? = null,
    progres: Int,
    status: MkStatus,
    pic: String? = null,
    compact: Boolean = false,
    dipilih: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape = MkShapes.md)
            .background(color = if (dipilih) aksen.soft else Color.Transparent)
            .clickable(enabled = onClick != null, onClick = { onClick?.invoke() })
            .padding(horizontal = MkSpacing.space3, vertical = 14.dp)
            .heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = nama,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subjudulDivisi(divisi = divisi, entitas = entitas),
                style = MkTypography.footnote,
                color = warna.ink2,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (!compact) {
            ProgresTipis(progres = progres, warna = warnaStatus(status = status))
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
            ) {
                AvatarPic(inisial = inisialDari(nama = pic), ukuran = 32.dp)
                Text(
                    text = if (pic.isNullOrBlank()) "PIC belum ditentukan" else pic,
                    style = MkTypography.caption,
                    color = warna.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            StatusBadge(status = status, size = MkBadgeSize.SM)
        }
    }
}

/** Progres tipis (trek 4dp fill-2, isian warna status) + persen angka tabular. */
@Composable
private fun ProgresTipis(progres: Int, warna: Color) {
    val nilai = progres.coerceIn(0, 100)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Box(
            Modifier
                .width(width = 72.dp)
                .height(height = 4.dp)
                .clip(shape = MkShapes.penuh)
                .background(color = LocalMkColors.current.fill2),
        ) {
            Box(
                Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(fraction = nilai / 100f)
                    .clip(shape = MkShapes.penuh)
                    .background(color = warna),
            )
        }
        Text(
            text = "$nilai%",
            style = MkTypography.bodyStrong.tabular,
            color = LocalMkColors.current.ink,
        )
    }
}

/** Avatar lingkaran inisial: latar accent-soft, huruf aksen. */
@Composable
private fun AvatarPic(inisial: String, ukuran: Dp, modifier: Modifier = Modifier) {
    val aksen = LocalAccent.current
    Box(
        modifier
            .size(size = ukuran)
            .clip(shape = CircleShape)
            .background(color = aksen.soft),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = inisial,
            style = MkTypography.caption,
            color = aksen.text,
        )
    }
}

/** Subjudul kiri: "divisi · entitas" (entitas kosong → hanya divisi). */
private fun subjudulDivisi(divisi: String, entitas: String?): String =
    if (entitas.isNullOrBlank()) divisi else "$divisi · $entitas"

/** Inisial dari dua kata pertama nama; kosong → "—". */
private fun inisialDari(nama: String?): String {
    if (nama.isNullOrBlank()) return "—"
    return nama
        .trim()
        .split(regex = Regex("\\s+"))
        .take(2)
        .mapNotNull { huruf -> huruf.firstOrNull()?.uppercaseChar() }
        .joinToString(separator = "")
        .ifEmpty { "—" }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun ProjectRowPreview() {
    MKTheme {
        Column(
            modifier = Modifier
                .background(color = LocalMkColors.current.bg)
                .padding(all = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
        ) {
            ProjectRow(
                nama = "SIM RS Bhakti Rahayu",
                divisi = "Teknologi",
                entitas = "PT Medcreatix",
                progres = 72,
                status = MkStatus.ON,
                pic = "Rani Kusuma",
                onClick = {},
            )
            ProjectRow(
                nama = "Aplikasi Klaim Medpay",
                divisi = "Operasional",
                entitas = "PT Medpay",
                progres = 41,
                status = MkStatus.LATE,
                onClick = {},
            )
            ProjectRow(
                nama = "Migrasi Data Gudang",
                divisi = "Data",
                progres = 0,
                status = MkStatus.NEUTRAL,
                pic = null,
                compact = true,
                onClick = {},
            )
            ProjectRow(
                nama = "Audit Kepatuhan Q3",
                divisi = "Keuangan",
                entitas = "PT Indomedia",
                progres = 100,
                status = MkStatus.DONE,
                pic = "Bimo Prasetyo",
                dipilih = true,
                onClick = {},
            )
        }
    }
}
