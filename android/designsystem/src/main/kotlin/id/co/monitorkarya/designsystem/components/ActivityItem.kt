package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/**
 * Satu baris aktivitas (port ActivityItem web): kolom kiri rel waktu — lingkaran
 * kecil aksen + garis vertikal line (item `terakhir` tanpa garis); isi "who"
 * semi-bold + action body; waktu footnote ink-2 angka tabular.
 */
@Composable
fun ActivityItem(
    modifier: Modifier = Modifier,
    who: String,
    action: String,
    waktu: String,
    terakhir: Boolean = false,
) {
    val warna = LocalMkColors.current
    Row(
        modifier
            .fillMaxWidth()
            .height(intrinsicSize = IntrinsicSize.Min),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(width = 12.dp),
        ) {
            Box(
                Modifier
                    .padding(top = 5.dp)
                    .size(size = 10.dp)
                    .clip(shape = CircleShape)
                    .background(color = LocalAccent.current.fill),
            )
            if (!terakhir) {
                Box(
                    Modifier
                        .padding(top = 6.dp)
                        .width(width = 2.dp)
                        .fillMaxHeight()
                        .background(color = warna.line),
                )
            }
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = MkSpacing.space3, bottom = if (terakhir) 0.dp else MkSpacing.space5),
        ) {
            Text(
                text = buildAnnotatedString {
                    withStyle(style = SpanStyle(fontWeight = FontWeight.SemiBold)) { append(who) }
                    append(" ")
                    append(action)
                },
                style = MkTypography.body,
                color = warna.ink,
            )
            Text(
                text = waktu,
                style = MkTypography.footnote.tabular,
                color = warna.ink2,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun ActivityItemPreview() {
    MKTheme {
        Column(
            modifier = Modifier
                .background(color = LocalMkColors.current.bg)
                .padding(all = MkSpacing.space4),
        ) {
            ActivityItem(
                who = "Rani Kusuma",
                action = "mengirim laporan harian proyek SIM RS Bhakti Rahayu",
                waktu = "Hari ini · 08.15 WIB",
            )
            ActivityItem(
                who = "Bimo Prasetyo",
                action = "menyetujui capaian mingguan divisi Operasional",
                waktu = "Hari ini · 07.40 WIB",
            )
            ActivityItem(
                who = "Admin PT Medpay",
                action = "mengaktifkan akun PIC baru",
                waktu = "Kemarin · 16.02 WIB",
                terakhir = true,
            )
        }
    }
}
