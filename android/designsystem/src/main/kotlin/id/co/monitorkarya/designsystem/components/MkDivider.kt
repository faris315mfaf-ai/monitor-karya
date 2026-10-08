package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Garis pemisah horizontal 1dp warna `line`, selebar wadahnya. Pemisah antar
 * baris daftar dan antar bagian layar menggantikan jarak/kartu berjarak
 * (keputusan pemilik 9 Okt 2026: batas antar bagian cukup garis 1px supaya
 * konten tampil penuh).
 */
@Composable
fun MkDivider(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(LocalMkColors.current.line),
    )
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkDividerPreview() {
    MKTheme {
        Column {
            MkListRow(judul = "Baris pertama", sub = "Pemisah 1px di bawah baris ini")
            MkDivider()
            MkListRow(judul = "Baris kedua", sub = "Tanpa jarak tambahan")
        }
    }
}
