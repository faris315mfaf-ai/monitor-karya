// Penanda kecil "Draf dipulihkan" di puncak Sheet sunting (G1): bukan dialog
// (keputusan pemilik 13 Okt 2026 — konfirmasi hanya untuk hapus). Aksi
// "Buang draf" mengembalikan isian ke versi tersimpan dan menghapus draf.
package id.co.monitorkarya.app.ui.draf

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import id.co.monitorkarya.app.ui.luring.waktuTersimpan
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonSize
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography

/** "Draf dipulihkan · 14.05" — teks penanda (diuji JVM). */
fun teksDrafPulih(disimpanPadaMs: Long, sekarangMs: Long = System.currentTimeMillis()): String =
    "Draf dipulihkan · ${waktuTersimpan(disimpanPadaMs, sekarangMs)}"

/** Pesan snackbar saat Sheet ditutup dengan perubahan belum tersimpan. */
const val PESAN_DRAF_TERSIMPAN = "Perubahan disimpan sebagai draf"

@Composable
fun PenandaDrafPulih(
    disimpanPadaMs: Long,
    onBuang: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val warna = LocalMkColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .background(warna.statusInfoSoft)
            .padding(start = MkSpacing.space3, end = MkSpacing.space1)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Text(
            text = teksDrafPulih(disimpanPadaMs),
            style = MkTypography.footnote,
            color = warna.ink,
            modifier = Modifier.weight(1f),
        )
        MkButton(
            label = "Buang draf",
            onClick = onBuang,
            variant = MkButtonVariant.PLAIN,
            size = MkButtonSize.S,
            enabled = enabled,
        )
    }
}
