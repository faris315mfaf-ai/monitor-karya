package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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

/**
 * Baris antrean keputusan (pola "Antrean keputusan" docs/design/13-pola-layar.md;
 * padanan konteks ApprovalItem web): kiri avatar inisial + judul bodyStrong +
 * sub footnote; kanan StatusBadge S lalu slot aksi [aksi] (mis. Setujui/Tolak —
 * keputusan di tempat, tanpa halaman konfirmasi). Varian [dipilih] berlatar
 * accent-soft. Label aksi mengikuti konteks per layar.
 */
@Composable
fun MkQueueItem(
    modifier: Modifier = Modifier,
    judul: String,
    sub: String,
    inisial: String,
    status: MkStatus,
    dipilih: Boolean = false,
    onClick: (() -> Unit)? = null,
    aksi: @Composable RowScope.() -> Unit = {},
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    Row(
        modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(color = if (dipilih) aksen.soft else Color.Transparent)
            .clickable(enabled = onClick != null, onClick = { onClick?.invoke() })
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space3)
            .heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        AvatarInisial(inisial = inisial, ukuran = 32.dp)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
        ) {
            Text(
                text = judul,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = sub,
                style = MkTypography.footnote,
                color = warna.ink2,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        StatusBadge(status = status, size = MkBadgeSize.SM)
        aksi()
    }
}

/** Avatar lingkaran inisial: latar accent-soft, huruf aksen (padanan Avatar web tone accent). */
@Composable
private fun AvatarInisial(inisial: String, ukuran: Dp, modifier: Modifier = Modifier) {
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
            maxLines = 1,
        )
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkQueueItemPreview() {
    MKTheme {
        Column(
            modifier = Modifier
                .background(color = LocalMkColors.current.bg)
                .padding(all = MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
        ) {
            MkQueueItem(
                judul = "Pembayaran vendor alat medis",
                sub = "Diajukan Bimo Prasetyo · 2 jam lalu",
                inisial = "BP",
                status = MkStatus.INFO,
                onClick = {},
                aksi = {
                    MkButton(label = "Setujui", variant = MkButtonVariant.PRIMARY, size = MkButtonSize.S, onClick = {})
                    MkButton(label = "Tolak", variant = MkButtonVariant.SECONDARY, size = MkButtonSize.S, onClick = {})
                },
            )
            MkQueueItem(
                judul = "Revisi SOP klaim pasien",
                sub = "Menunggu keputusan Anda · tenggat hari ini",
                inisial = "RK",
                status = MkStatus.RISK,
                dipilih = true,
                onClick = {},
                aksi = {
                    MkButton(label = "Buka", variant = MkButtonVariant.PLAIN, size = MkButtonSize.S, onClick = {})
                },
            )
            MkQueueItem(
                judul = "Laporan mingguan divisi Media",
                sub = "Ditinjau kemarin · 16.40 WIB",
                inisial = "SM",
                status = MkStatus.DONE,
                onClick = {},
            )
            MkQueueItem(
                judul = "Pengadaan kursi roda",
                sub = "Belum ditinjau",
                inisial = "AP",
                status = MkStatus.NEUTRAL,
            )
        }
    }
}
