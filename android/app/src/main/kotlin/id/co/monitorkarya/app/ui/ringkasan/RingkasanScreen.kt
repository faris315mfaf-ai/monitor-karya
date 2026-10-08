// Layar Ringkasan Fase 0 — versi awal pola layar Ringkasan pemantau
// (docs/design/peran/01-manajemen.md §hero): sapaan + label peran, dua StatTile
// (Perusahaan, Proyek), satu StatusBadge ringkas, galat dengan Coba lagi,
// kerangka saat memuat, dan spanduk luring. Data dari RingkasanViewModel.
package id.co.monitorkarya.app.ui.ringkasan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.components.MkOfflineBanner
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.MkStatus
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.components.StatusBadge
import id.co.monitorkarya.app.ui.vm.RingkasanRingkas
import id.co.monitorkarya.app.ui.vm.RingkasanUiState
import id.co.monitorkarya.app.ui.vm.RingkasanViewModel
import java.text.NumberFormat
import java.util.Locale

/** Versi ber-ViewModel untuk MainActivity/navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun RingkasanScreen(
    vm: RingkasanViewModel,
    offline: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    RingkasanScreen(state = state, offline = offline, onUlang = vm::ulang, modifier = modifier)
}

/** Versi state murni — mudah dipratinjau/diuji tanpa ViewModel. */
@Composable
fun RingkasanScreen(
    state: RingkasanUiState,
    offline: Boolean = false,
    onUlang: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (offline) MkOfflineBanner(modifier = Modifier.fillMaxWidth(), terlihat = true, onCobaLagi = onUlang)
        when (state) {
            RingkasanUiState.Memuat -> repeat(3) { MkSkeleton(modifier = Modifier.fillMaxWidth().height(96.dp)) }
            is RingkasanUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
            is RingkasanUiState.Sukses -> IsiRingkasan(state.data)
        }
    }
}

@Composable
private fun IsiRingkasan(data: RingkasanRingkas, modifier: Modifier = Modifier) {
    val c = LocalMkColors.current

    // Sapaan (kalimat jawaban di atas dashboard) + label peran.
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = if (data.namaPengguna.isNullOrBlank()) "Selamat bekerja" else "Selamat bekerja, ${data.namaPengguna}",
            style = MaterialTheme.typography.displaySmall,
            color = c.ink,
        )
        if (!data.peran.isNullOrBlank()) {
            Text(data.peran, style = MaterialTheme.typography.bodyLarge, color = c.ink2)
        }
    }

    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        data.jumlahEntitas?.let {
            StatTile(label = "Perusahaan", value = angkaID(it), modifier = Modifier.weight(1f))
        }
        data.jumlahProyek?.let {
            StatTile(label = "Proyek", value = angkaID(it), modifier = Modifier.weight(1f))
        }
    }

    statusRingkas(data.sesuai, data.total)?.let { StatusBadge(status = it.first, text = it.second) }
}

/** Lencana ringkas "x dari y sesuai jadwal"; null bila tidak ada data cukup. */
private fun statusRingkas(sesuai: Int?, total: Int?): Pair<MkStatus, String>? {
    if (sesuai == null && total == null) return null
    val t = total ?: 0
    val s = sesuai ?: 0
    return when {
        t <= 0 -> MkStatus.NEUTRAL to "Belum ada proyek aktif"
        s >= t -> MkStatus.ON to "${angkaID(s)} dari ${angkaID(t)} sesuai jadwal"
        else -> MkStatus.RISK to "${angkaID(s)} dari ${angkaID(t)} sesuai jadwal"
    }
}

/** Angka format Indonesia (pemisah ribuan titik) — angka selalu di depan. */
private fun angkaID(n: Int): String = NumberFormat.getIntegerInstance(Locale("id", "ID")).format(n)
