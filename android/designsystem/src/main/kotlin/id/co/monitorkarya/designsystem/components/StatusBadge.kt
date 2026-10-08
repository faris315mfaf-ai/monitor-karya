package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.Error
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Status kerja Monitor Karya — warna, ikon, dan kata selalu bersama.
 * Port enum Status web: on/risk/late/done/info/neutral dengan kosakata tetap.
 */
enum class MkStatus(
    val label: String,
    val ikon: ImageVector,
) {
    ON("Sesuai jadwal", Icons.Outlined.CheckCircle),
    RISK("Perlu perhatian", Icons.Outlined.Error),
    LATE("Terlambat", Icons.Outlined.Warning),
    DONE("Selesai", Icons.Outlined.CheckCircle),
    NEUTRAL("Belum mulai", Icons.Outlined.Circle),
    INFO("Diingatkan", Icons.Outlined.NotificationsActive),
}

/** Ukuran lencana: MD tinggi 28dp (bawaan), SM tinggi 24dp untuk tabel/baris. */
enum class MkBadgeSize(
    val tinggi: Dp,
    val ukuranIkon: Dp,
    val jarak: Dp,
    val horizontal: Dp,
) {
    MD(28.dp, 14.dp, 6.dp, 12.dp),
    SM(24.dp, 13.dp, 5.dp, 10.dp),
}

/** Warna isi (teks/ikon/titik) sebuah status; satu sumber untuk lencana, delta KPI, dan titik chip. */
@Composable
fun warnaStatus(status: MkStatus): Color {
    val warna = LocalMkColors.current
    return when (status) {
        MkStatus.ON -> warna.statusOn
        MkStatus.RISK -> warna.statusRisk
        MkStatus.LATE -> warna.statusLate
        MkStatus.DONE -> warna.statusDone
        MkStatus.INFO -> warna.statusInfo
        MkStatus.NEUTRAL -> warna.statusNeutral
    }
}

/** Latar lembut lencana dari token *-soft; NEUTRAL memakai fill1 (tanpa token soft khusus). */
@Composable
private fun latarStatus(status: MkStatus): Color {
    val warna = LocalMkColors.current
    return when (status) {
        MkStatus.ON -> warna.statusOnSoft
        MkStatus.RISK -> warna.statusRiskSoft
        MkStatus.LATE -> warna.statusLateSoft
        MkStatus.DONE -> warna.statusOnSoft
        MkStatus.INFO -> warna.statusInfoSoft
        MkStatus.NEUTRAL -> warna.fill1
    }
}

/**
 * Lencana status kapsul (port StatusBadge web): titik warna, ikon material kecil,
 * dan kata selalu tampil bersama (tiga kanal: warna + ikon + kata).
 * Teks pengganti lewat parameter [text].
 */
@Composable
fun StatusBadge(
    modifier: Modifier = Modifier,
    status: MkStatus,
    size: MkBadgeSize = MkBadgeSize.MD,
    text: String? = null,
) {
    val isi = warnaStatus(status)
    val gayaTeks = if (size == MkBadgeSize.MD) MkTypography.footnote else MkTypography.caption
    Row(
        modifier = modifier
            .height(size.tinggi)
            .clip(MkShapes.penuh)
            .background(latarStatus(status))
            .padding(horizontal = size.horizontal),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(size.jarak),
    ) {
        // Titik warna status (kanal warna).
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(isi),
        )
        // Ikon material kecil (kanal ikon).
        Icon(
            imageVector = status.ikon,
            contentDescription = null,
            tint = isi,
            modifier = Modifier.size(size.ukuranIkon),
        )
        // Kata (kanal teks).
        Text(
            text = text ?: status.label,
            color = isi,
            style = gayaTeks.copy(fontWeight = FontWeight.SemiBold),
            maxLines = 1,
        )
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun StatusBadgePreview() {
    MKTheme {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusBadge(status = MkStatus.ON)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusBadge(status = MkStatus.RISK)
                StatusBadge(status = MkStatus.LATE)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusBadge(status = MkStatus.DONE)
                StatusBadge(status = MkStatus.NEUTRAL)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusBadge(status = MkStatus.INFO)
                StatusBadge(status = MkStatus.INFO, size = MkBadgeSize.SM, text = "Menunggu review")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusBadge(status = MkStatus.ON, size = MkBadgeSize.SM)
                StatusBadge(status = MkStatus.RISK, size = MkBadgeSize.SM)
                StatusBadge(status = MkStatus.LATE, size = MkBadgeSize.SM)
            }
        }
    }
}
