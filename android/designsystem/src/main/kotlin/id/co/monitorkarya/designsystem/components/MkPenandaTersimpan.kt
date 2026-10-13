// Penanda "data tersimpan" untuk layar yang menampilkan potret Room (CacheLayar)
// karena server tak terjangkau (E2E-R2-3 B6; Rancangan §4 butir 1 "Data basi
// ditandai"). Satu baris tenang: ikon jam + "Data tersimpan HH.MM"; kata "Luring"
// ada di BannerLuring shell (app/ui/luring) agar tidak tampil dua kali. Hari lain → "12 Okt 14.05".
package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.History
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val ZONA_WIB: ZoneId = ZoneId.of("Asia/Jakarta")
private val FORMAT_JAM = DateTimeFormatter.ofPattern("HH.mm").withZone(ZONA_WIB)
private val FORMAT_TGL_JAM = DateTimeFormatter.ofPattern("d MMM HH.mm", Locale.forLanguageTag("id-ID")).withZone(ZONA_WIB)

/** "Data tersimpan 14.05" (hari ini, WIB) atau "… 12 Okt 14.05" (hari lain). */
fun teksDataTersimpan(tersimpanPadaMs: Long, sekarangMs: Long = System.currentTimeMillis()): String {
    val t = Instant.ofEpochMilli(tersimpanPadaMs)
    val hariSama = t.atZone(ZONA_WIB).toLocalDate() == Instant.ofEpochMilli(sekarangMs).atZone(ZONA_WIB).toLocalDate()
    val waktu = if (hariSama) FORMAT_JAM.format(t) else FORMAT_TGL_JAM.format(t)
    return "Data tersimpan $waktu"
}

/**
 * Baris penanda data tersimpan. Tampilkan HANYA bila isi layar berasal dari
 * potret Room ([tersimpanPadaMs] bukan null); data segar tidak diberi penanda.
 */
@Composable
fun MkPenandaTersimpan(tersimpanPadaMs: Long, modifier: Modifier = Modifier) {
    val warna = LocalMkColors.current
    Row(
        modifier
            .fillMaxWidth()
            .clip(MkShapes.sm)
            .background(warna.fill1)
            .padding(horizontal = MkSpacing.space3, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Icon(Icons.Outlined.History, contentDescription = null, tint = warna.ink2, modifier = Modifier.size(16.dp))
        Text(text = teksDataTersimpan(tersimpanPadaMs), style = MkTypography.footnote, color = warna.ink2)
    }
}

@PreviewGanda
@Composable
private fun MkPenandaTersimpanPreview() {
    MKTheme {
        Box(Modifier.background(LocalMkColors.current.bg).padding(MkSpacing.space4)) {
            MkPenandaTersimpan(tersimpanPadaMs = System.currentTimeMillis())
        }
    }
}
