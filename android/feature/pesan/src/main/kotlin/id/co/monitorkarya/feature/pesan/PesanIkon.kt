// Ikon Kotak masuk + lencana belum dibaca untuk bilah atas/Dock MKShell.
// Jumlah ditarik saat tampil lalu tiap 60 detik selama layar minimal STARTED
// (berhenti saat aplikasi di latar, C1-S1); angka
// juga turun seketika saat pesan dibuka di PesanLayar (KotakMasukRepo bersama di :core:data, juga dipakai lonceng).
package id.co.monitorkarya.feature.pesan

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import id.co.monitorkarya.designsystem.components.MkIconBtn
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular
import id.co.monitorkarya.feature.pesan.logika.teksLencana
import kotlinx.coroutines.delay

private const val SELANG_SEGAR_MS = 60_000L

/** Titik masuk ikon kotak masuk ber-lencana. */
@Composable
fun PesanIkon(onBuka: () -> Unit, modifier: Modifier = Modifier) {
    val vm: PesanIkonViewModel = hiltViewModel()
    val belum by vm.belumDibaca.collectAsStateWithLifecycle()
    // Tarik berkala hanya selama minimal STARTED; kembali ke depan = tarik segera.
    val siklus = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(siklus) {
        siklus.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                vm.segarkan()
                delay(SELANG_SEGAR_MS)
            }
        }
    }
    PesanIkonIsi(belum = belum, onBuka = onBuka, modifier = modifier)
}

/** Versi state-murni. */
@Composable
fun PesanIkonIsi(belum: Int, onBuka: () -> Unit, modifier: Modifier = Modifier) {
    val aksen = LocalAccent.current
    val judul = stringResource(R.string.pesan_ikon)
    val label = if (belum > 0) stringResource(R.string.pesan_ikon_belum, judul, belum) else judul
    Box(modifier = modifier) {
        MkIconBtn(icon = Icons.Outlined.Inbox, label = label, onClick = onBuka)
        teksLencana(belum)?.let { teks ->
            Text(
                text = teks,
                style = MkTypography.caption.tabular,
                color = aksen.on,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-2).dp, y = 2.dp)
                    .widthIn(min = 18.dp)
                    .background(aksen.fill, MkShapes.penuh)
                    .padding(horizontal = 5.dp)
                    // Jumlah sudah dibacakan lewat label tombol.
                    .clearAndSetSemantics {},
            )
        }
    }
}
