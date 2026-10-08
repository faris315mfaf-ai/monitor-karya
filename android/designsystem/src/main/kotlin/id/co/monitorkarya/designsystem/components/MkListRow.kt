package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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

/**
 * Avatar inisial lingkaran (port Avatar web): latar accent-soft dengan huruf
 * aksen; ukuran bawaan 32dp dengan teks caption (padanan 0.38 x ukuran web).
 */
@Composable
fun MkAvatar(
    modifier: Modifier = Modifier,
    inisial: String,
    ukuran: Dp = 32.dp,
) {
    val aksen = LocalAccent.current
    Box(
        modifier = modifier
            .size(ukuran)
            .clip(CircleShape)
            .background(aksen.soft),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = inisial,
            style = MkTypography.caption,
            color = aksen.text,
            maxLines = 1,
        )
    }
}

/**
 * Baris daftar umum: avatar inisial 32dp di kiri (MkAvatar, latar accent-soft),
 * judul bodyStrong dan subjudul footnote ink-2 maksimal 2 baris, serta slot
 * `trailing` bebas di kanan (lencana status, chevron, angka, dsb.).
 * Bisa diklik (radius-md, tinggi sentuh minimal 44dp) — detail tetap dibuka di
 * sheet, bukan pindah halaman (docs/design/05).
 */
@Composable
fun MkListRow(
    modifier: Modifier = Modifier,
    judul: String,
    sub: String? = null,
    inisial: String? = null,
    trailing: @Composable (() -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    Row(
        modifier = modifier
            .clip(MkShapes.md)
            .clickable(enabled = onClick != null, onClick = { onClick?.invoke() })
            .padding(horizontal = MkSpacing.space4, vertical = MkSpacing.space3)
            .heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        if (inisial != null) {
            MkAvatar(inisial = inisial)
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = judul,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (sub != null) {
                Text(
                    text = sub,
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        trailing?.invoke()
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkListRowPreview() {
    MKTheme {
        val warna = LocalMkColors.current
        Column(
            modifier = Modifier
                .background(warna.bg)
                .padding(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
        ) {
            MkListRow(
                judul = "Laporan harian SIM RS Bhakti Rahayu",
                sub = "Rani Kusuma · Hari ini 08.15 WIB · 2 lampiran",
                inisial = "RK",
                trailing = { StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM) },
                onClick = {},
            )
            MkListRow(
                judul = "PT Medpay",
                sub = "Divisi Operasional · 6 akun aktif · 1 menunggu persetujuan",
                inisial = "PM",
                trailing = {
                    Icon(
                        imageVector = Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                        contentDescription = null,
                        tint = warna.ink2,
                        modifier = Modifier.size(20.dp),
                    )
                },
                onClick = {},
            )
            MkListRow(
                judul = "Tanpa avatar dan subjudul",
                trailing = { Text("3", style = MkTypography.bodyStrong, color = warna.ink2) },
                onClick = {},
            )
        }
    }
}
