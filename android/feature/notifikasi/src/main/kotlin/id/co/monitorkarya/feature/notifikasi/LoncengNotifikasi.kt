// Lonceng notifikasi dalam aplikasi (agen A1, 13 Okt 2026) — padanan
// NotificationButton + NotificationPopover web (src/components/shell.tsx):
// ikon lonceng + lencana belum-dibaca ("9+"), ketuk membuka Sheet daftar 30
// pesan terbaru, "Tandai semua dibaca", ketuk pesan = tandai baca + lompat ke
// tab terkait. Daftar ditarik ulang tiap ±60 detik selama layar aktif.
package id.co.monitorkarya.feature.notifikasi

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkButton
import id.co.monitorkarya.designsystem.components.MkButtonVariant
import id.co.monitorkarya.designsystem.components.MkDivider
import id.co.monitorkarya.designsystem.components.MkSheet
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import kotlinx.coroutines.delay

/** Jeda tarik ulang lencana (web: 60 detik). */
private const val JEDA_TARIK_MS = 60_000L

/**
 * Titik masuk publik lonceng untuk top bar MKShell.
 *
 * @param onBuka dipanggil saat pesan diketuk. [tujuan] = nama `TabId`
 *   (core:domain, mis. "MEJA_KERJA") hasil pemetaan tab web payload, atau null
 *   bila pesan tak membawa tab / tab tak punya padanan Android. Pemanggil wajib
 *   memeriksa `bolehLihatTab(peran, TabId.valueOf(tujuan))` sebelum berpindah.
 *   Sheet ditutup otomatis hanya bila [tujuan] tidak null.
 */
@Composable
fun LoncengNotifikasi(onBuka: (tujuan: String?) -> Unit, modifier: Modifier = Modifier) {
    val vm: NotifikasiViewModel = hiltViewModel()
    val ui by vm.ui.collectAsStateWithLifecycle()
    var terbuka by rememberSaveable { mutableStateOf(false) }

    // Tarik berkala selama layar minimal STARTED (berhenti saat aplikasi di latar).
    val siklus = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(siklus) {
        siklus.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                vm.muatBerkala()
                delay(JEDA_TARIK_MS)
            }
        }
    }

    TombolLonceng(belumDibaca = ui.belumDibaca, modifier = modifier) {
        terbuka = true
        vm.muat()
    }

    if (terbuka) {
        DaftarNotifikasiSheet(
            ui = ui,
            onTutup = { terbuka = false },
            onUlang = vm::muat,
            onTandaiSemua = vm::tandaiSemua,
            onKetuk = { n ->
                vm.tandaiBaca(n.id)
                if (n.tujuan != null) terbuka = false
                onBuka(n.tujuan)
            },
        )
    }
}

/** Ikon lonceng 48dp + lencana belum-dibaca. */
@Composable
internal fun TombolLonceng(belumDibaca: Int, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val lencana = teksLencana(belumDibaca)
    val label = labelLonceng(belumDibaca)
    IconButton(
        onClick = onClick,
        modifier = modifier.semantics { contentDescription = label },
    ) {
        BadgedBox(
            badge = {
                if (lencana != null) {
                    Badge(containerColor = aksen.fill, contentColor = aksen.on) { Text(lencana) }
                }
            },
        ) {
            Icon(imageVector = Icons.Outlined.Notifications, contentDescription = null, tint = warna.ink)
        }
    }
}

/** Sheet daftar notifikasi. */
@Composable
internal fun DaftarNotifikasiSheet(
    ui: LoncengUi,
    onTutup: () -> Unit,
    onUlang: () -> Unit,
    onTandaiSemua: () -> Unit,
    onKetuk: (Notifikasi) -> Unit,
) {
    val warna = LocalMkColors.current
    MkSheet(
        visible = true,
        onTutup = onTutup,
        judul = stringResource(R.string.notif_judul),
        subjudul = if (ui.belumDibaca > 0) {
            stringResource(R.string.notif_n_belum_dibaca, ui.belumDibaca)
        } else {
            stringResource(R.string.notif_semua_dibaca)
        },
        footer = {
            if (ui.belumDibaca > 0) {
                MkButton(
                    label = stringResource(R.string.notif_tandai_semua),
                    onClick = onTandaiSemua,
                    variant = MkButtonVariant.SECONDARY,
                    modifier = Modifier.weight(1f),
                )
            }
            MkButton(label = stringResource(R.string.notif_tutup), onClick = onTutup, variant = MkButtonVariant.PLAIN, modifier = Modifier.weight(1f))
        },
    ) {
        when {
            !ui.termuat && ui.memuat -> Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space3)) {
                repeat(3) { MkSkeleton(tinggi = 56.dp) }
            }
            !ui.termuat && ui.galat != null -> ErrorNote(pesan = ui.galat, onCobaLagi = onUlang)
            ui.daftar.isEmpty() -> EmptyNote(teks = stringResource(R.string.notif_kosong))
            else -> Column {
                ui.galat?.let {
                    Text(it, style = MkTypography.footnote, color = warna.ink2, modifier = Modifier.padding(bottom = MkSpacing.space2))
                }
                ui.daftar.forEachIndexed { i, n ->
                    BarisNotifikasi(n = n, onKetuk = { onKetuk(n) })
                    if (i < ui.daftar.lastIndex) MkDivider()
                }
            }
        }
    }
}

@Composable
private fun BarisNotifikasi(n: Notifikasi, onKetuk: () -> Unit) {
    val warna = LocalMkColors.current
    val aksen = LocalAccent.current
    val status = stringResource(if (n.dibaca) R.string.notif_status_dibaca else R.string.notif_status_belum)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .clickable(role = Role.Button, onClick = onKetuk)
            .heightIn(min = 56.dp)
            .padding(horizontal = MkSpacing.space2, vertical = MkSpacing.space3)
            .semantics { stateDescription = status },
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        // Titik belum-dibaca (warna) + kata di stateDescription (bukan warna saja).
        Box(
            Modifier
                .padding(top = 6.dp)
                .size(8.dp)
                .clip(MkShapes.penuh)
                .background(if (n.dibaca) warna.surface else aksen.fill),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = n.judul,
                style = if (n.dibaca) MkTypography.body else MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (n.isi.isNotBlank()) {
                Text(n.isi, style = MkTypography.footnote, color = warna.ink2, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            Text(waktuRelatif(n.dibuatIso), style = MkTypography.caption, color = warna.ink3)
        }
    }
}
