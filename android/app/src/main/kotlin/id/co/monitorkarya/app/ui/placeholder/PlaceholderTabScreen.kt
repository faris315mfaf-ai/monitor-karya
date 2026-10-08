// Tab yang belum dibangun di Fase 0 — tempat menunggu modul fase berikutnya
// supaya peta tab per peran sudah utuh sejak awal (padanan EmptyNote web).
package id.co.monitorkarya.app.ui.placeholder

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.EmptyNote

/** [label] = nama modul/tab, mis. "Proyek", "Persetujuan", "Kehadiran". */
@Composable
fun PlaceholderTabScreen(label: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 32.dp),
        contentAlignment = Alignment.Center,
    ) {
        EmptyNote(teks = "Modul $label menyusul di fase berikutnya.")
    }
}
