// Dasbor Admin PT (T8-A1) — tab Ringkasan ADMIN_PT, padanan web T8. Isi:
// konteks hari/pekan, satu kalimat jawaban "x laporan diterima · y sudah
// diteruskan", dua StatTile (Laporan diterima, Sudah diteruskan), dan satu
// tombol primer lebar penuh di bawah layar "Teruskan laporan ke Direksi (n)"
// yang membuka AlertDialog konfirmasi (penerusan membekukan laporan) sebelum
// loop berurutan di ViewModel berjalan. Snackbar "Urungkan" memakai tiket
// yang terkumpul selama penerusan.
package id.co.monitorkarya.app.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.co.monitorkarya.app.ui.luring.BannerLuring
import id.co.monitorkarya.app.ui.luring.ingatWaktuMuat
import id.co.monitorkarya.app.ui.luring.rememberStatusLuring
import id.co.monitorkarya.app.ui.penerimaan.AntreanItem
import id.co.monitorkarya.app.ui.penerimaan.JenisLaporan
import id.co.monitorkarya.app.ui.penerimaan.StatusAntrean
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.components.StatTile
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/** Versi ber-ViewModel untuk navigasi; [offline] dari pemantau konektivitas. */
@Composable
fun DashboardAdminScreen(
    offline: Boolean = false,
    vm: DashboardAdminViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    // Penanda offline-first bersama (app/ui/luring, A1-LURING.md §5).
    val luring by rememberStatusLuring()
    val tersimpanPada = ingatWaktuMuat(state as? DashboardAdminUiState.Siap)
    val aktivitas by vm.aktivitas.collectAsStateWithLifecycle()
    DashboardAdminScreen(
        state = state,
        aktivitas = aktivitas,
        onUlang = vm::ulang,
        onTeruskanSemua = vm::teruskanSemua,
        onUrungkan = vm::urungkan,
        onNotifikasiTampil = vm::notifikasiTampil,
        offline = offline || luring.luring,
        tersimpanPadaMs = tersimpanPada ?: luring.terakhirSinkronMs,
        modifier = modifier,
    )
}

/** Versi state murni — mudah dipratinjau/diuji tanpa ViewModel. */
@Composable
fun DashboardAdminScreen(
    state: DashboardAdminUiState,
    aktivitas: AktivitasDasbor = AktivitasDasbor(),
    onUlang: () -> Unit = {},
    onTeruskanSemua: () -> Unit = {},
    onUrungkan: () -> Unit = {},
    onNotifikasiTampil: () -> Unit = {},
    offline: Boolean = false,
    /** Kapan data layar dimuat — banner "Luring · data tersimpan HH.MM". */
    tersimpanPadaMs: Long? = null,
    modifier: Modifier = Modifier,
) {
    var konfirmasi by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    // Snackbar satu-kali dari ViewModel. "Urungkan" hanya ditawarkan bila ada
    // tiket; durasi Long (10 detik) mengikuti UNDO_TOAST_MS web — server masih
    // menerima urungkan sampai 15 menit, jadi sentuhan lambat tetap berhasil.
    LaunchedEffect(aktivitas.notifikasi?.id) {
        val n = aktivitas.notifikasi ?: return@LaunchedEffect
        val labelAksi = n.undoToken.takeIf { it.isNotEmpty() }?.let { "Urungkan" }
        val hasil = snackbar.showSnackbar(
            message = n.pesan,
            actionLabel = labelAksi,
            duration = SnackbarDuration.Long,
        )
        if (hasil == SnackbarResult.ActionPerformed) onUrungkan() else onNotifikasiTampil()
    }

    val dasbor = (state as? DashboardAdminUiState.Siap)?.dasbor
    Box(modifier = modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    // Margin samping layar 12dp (keputusan pemilik 9 Okt 2026).
                    .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (offline) {
                    BannerLuring(modifier = Modifier.fillMaxWidth(), tersimpanPadaMs = tersimpanPadaMs, onCobaLagi = onUlang)
                }
                when (state) {
                    DashboardAdminUiState.Memuat -> KerangkaDasbor()
                    is DashboardAdminUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
                    is DashboardAdminUiState.Siap -> IsiDasbor(dasbor = state.dasbor)
                }
            }

            // Tombol bawah lebar penuh — satu-satunya tombol primer di layar;
            // hanya tampil bila ada laporan siap diteruskan.
            if (dasbor != null && dasbor.siapTotal > 0) {
                MkButton(
                    label = labelTeruskan(dasbor.siapTotal, aktivitas),
                    variant = MkButtonVariant.PRIMARY,
                    enabled = !aktivitas.sedangTerusSemua,
                    onClick = { konfirmasi = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space3),
                )
            }
        }
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }

    // Konfirmasi sebelum penerusan: laporan harian yang diteruskan membeku.
    if (konfirmasi) {
        AlertDialog(
            onDismissRequest = { konfirmasi = false },
            title = { Text(text = "Teruskan laporan ke Direksi?") },
            text = { Text(text = "Pastikan semua laporan sudah diperiksa dan benar. Penerusan membekukan laporan.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        konfirmasi = false
                        onTeruskanSemua()
                    },
                ) { Text(text = "Teruskan laporan") }
            },
            dismissButton = {
                TextButton(onClick = { konfirmasi = false }) { Text(text = "Periksa dulu") }
            },
        )
    }
}

/** Kepala layar (konteks + kalimat jawaban) + dua StatTile KPI. */
@Composable
private fun IsiDasbor(dasbor: DasborAdmin) {
    val warna = LocalMkColors.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(dasbor.konteks, style = MkTypography.footnote, color = warna.ink2)
        Text("Ringkasan", style = MaterialTheme.typography.displaySmall, color = warna.ink)
        Text(dasbor.jawaban, style = MkTypography.bodyLg, color = warna.ink)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
        StatTile(
            label = "Laporan diterima",
            value = dasbor.diterima,
            modifier = Modifier.weight(1f),
        )
        StatTile(
            label = "Sudah diteruskan",
            value = dasbor.diteruskan,
            modifier = Modifier.weight(1f),
        )
    }
}

/** Label tombol primer: progres penerusan saat sibuk, jumlah antrean saat siap. */
private fun labelTeruskan(siap: Int, aktivitas: AktivitasDasbor): String = when {
    aktivitas.sedangTerusSemua && aktivitas.progresTotal > 0 ->
        "Meneruskan (${aktivitas.progresSelesai}/${aktivitas.progresTotal})…"
    aktivitas.sedangTerusSemua -> "Meneruskan…"
    else -> "Teruskan laporan ke Direksi ($siap)"
}

/** Kerangka memuat seukuran isi: kepala + dua ubin KPI + tombol. */
@Composable
private fun KerangkaDasbor() {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            MkSkeleton(tinggi = 14.dp, lebar = 220.dp)
            MkSkeleton(tinggi = 34.dp)
            MkSkeleton(tinggi = 18.dp, lebar = 260.dp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
            MkSkeleton(tinggi = 88.dp, modifier = Modifier.weight(1f))
            MkSkeleton(tinggi = 88.dp, modifier = Modifier.weight(1f))
        }
        MkSkeleton(tinggi = 44.dp)
    }
}

/* ---------- Pratinjau ---------- */

private val dasborPratinjau = DasborAdmin(
    konteks = "Kamis, 8 Oktober 2026 · M41 2026",
    diterima = 9,
    diteruskan = 4,
    antreanSiap = listOf(
        AntreanItem(
            jenis = JenisLaporan.HARIAN,
            idLaporan = "rpt-1",
            judul = "SIM RS Bhakti Rahayu",
            sub = "BRH-01 · PIC Rani Kusuma",
            status = StatusAntrean.BARU,
            siap = true,
        ),
        AntreanItem(
            jenis = JenisLaporan.MINGGUAN,
            idLaporan = "wk-1",
            judul = "Divisi Operasional",
            sub = "Kadiv Budi Santoso · 12 item",
            status = StatusAntrean.BARU,
            siap = true,
        ),
    ),
)

@PreviewGanda
@Composable
private fun DashboardAdminSiapPreview() {
    MKTheme {
        DashboardAdminScreen(state = DashboardAdminUiState.Siap(dasborPratinjau))
    }
}

@PreviewGanda
@Composable
private fun DashboardAdminMemuatPreview() {
    MKTheme {
        DashboardAdminScreen(state = DashboardAdminUiState.Memuat)
    }
}
