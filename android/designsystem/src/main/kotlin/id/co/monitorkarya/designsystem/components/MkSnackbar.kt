package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Tampilkan snackbar dengan aksi "Urungkan" (padanan toast "Urungkan" web:
 * tindakan yang bisa dibalik tidak memakai dialog konfirmasi). Durasi Long agar
 * pengguna sempat menekan aksi; `onUrungkan` dipanggil hanya bila aksi ditekan.
 * Mengembalikan hasil snackbar (ActionPerformed/Dismissed).
 */
suspend fun tampilkanUrungkan(
    snackbarHostState: SnackbarHostState,
    pesan: String,
    labelUrungkan: String = "Urungkan",
    onUrungkan: () -> Unit,
): SnackbarResult {
    val hasil = snackbarHostState.showSnackbar(
        message = pesan,
        actionLabel = labelUrungkan,
        duration = SnackbarDuration.Long,
    )
    if (hasil == SnackbarResult.ActionPerformed) {
        onUrungkan()
    }
    return hasil
}

/**
 * Wadah snackbar bergaya token (padanan Toaster web: latar surface, teks ink,
 * garis line, aksi beraksen). Pasang sekali di Scaffold, lalu panggil
 * [tampilkanUrungkan] dari ViewModel/layar memakai SnackbarHostState yang sama.
 */
@Composable
fun MkSnackbarHost(
    modifier: Modifier = Modifier,
    snackbarHostState: SnackbarHostState,
) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    SnackbarHost(
        hostState = snackbarHostState,
        modifier = modifier,
    ) { data ->
        Snackbar(
            snackbarData = data,
            modifier = Modifier.border(1.dp, warna.line, MkShapes.md),
            shape = MkShapes.md,
            containerColor = warna.surface,
            contentColor = warna.ink,
            actionColor = aksen.text,
        )
    }
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkSnackbarPreview() {
    MKTheme {
        val snackbarHostState = remember { SnackbarHostState() }
        LaunchedEffect(Unit) {
            tampilkanUrungkan(
                snackbarHostState = snackbarHostState,
                pesan = "Laporan harian dihapus",
                labelUrungkan = "Urungkan",
                onUrungkan = {},
            )
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(MkSpacing.space4),
        ) {
            MkSnackbarHost(
                modifier = Modifier.align(Alignment.BottomCenter),
                snackbarHostState = snackbarHostState,
            )
        }
    }
}
