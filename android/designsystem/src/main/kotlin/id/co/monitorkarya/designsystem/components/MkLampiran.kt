package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalAccent
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda

/**
 * Baris satu lampiran bukti: ikon sisipan, nama berkas (bodyStrong), chip ukuran
 * kapsul fill-1, dan tombol hapus kecil 32dp (ikon tutup, dibacakan pembaca layar).
 * Selagi `sedangUnggah`, chip ukuran diganti label "Mengunggah…" plus trek
 * progres tipis aksen yang mengikuti lebar baris.
 */
@Composable
fun MkLampiranRow(
    modifier: Modifier = Modifier,
    namaBerkas: String,
    ukuranLabel: String,
    sedangUnggah: Boolean = false,
    onHapus: (() -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(MkShapes.md)
            .heightIn(min = 44.dp)
            .padding(vertical = MkSpacing.space1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Icon(
            imageVector = Icons.Outlined.AttachFile,
            contentDescription = null,
            tint = warna.ink2,
            modifier = Modifier.size(20.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(
                text = namaBerkas,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (sedangUnggah) {
                // Persen belum diketahui di tingkat baris; trek tampil indeterminate.
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
                ) {
                    Text(
                        text = "Mengunggah…",
                        style = MkTypography.footnote,
                        color = warna.ink2,
                        maxLines = 1,
                    )
                    LinearProgressIndicator(
                        modifier = Modifier
                            .weight(1f)
                            .height(3.dp),
                        color = LocalAccent.current.fill,
                        trackColor = warna.fill2,
                    )
                }
            } else {
                Text(
                    text = ukuranLabel,
                    style = MkTypography.caption,
                    color = warna.ink2,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(MkShapes.penuh)
                        .background(warna.fill1)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        if (onHapus != null) {
            TombolHapusKecil(onHapus = onHapus)
        }
    }
}

/** Tombol hapus kecil 32dp dengan ikon tutup; tekan mengecilkan ke 0.94. */
@Composable
private fun TombolHapusKecil(onHapus: () -> Unit) {
    val warna = LocalMkColors.current
    val interactionSource = remember { MutableInteractionSource() }
    val skala = mkTekanSkala(interactionSource, 0.94f)
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(MkShapes.penuh)
            .graphicsLayer {
                scaleX = skala
                scaleY = skala
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Button,
                onClick = onHapus,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Close,
            contentDescription = "Hapus lampiran",
            tint = warna.ink2,
            modifier = Modifier.size(16.dp),
        )
    }
}

/**
 * Progres unggah determinate (padanan progress bar web): trek tipis aksen di atas
 * fill-2, ujung membulat. `persen` dipaksa ke 0..100.
 */
@Composable
fun MkProgresUnggah(
    modifier: Modifier = Modifier,
    persen: Int,
) {
    val aksen = LocalAccent.current
    val warna = LocalMkColors.current
    LinearProgressIndicator(
        progress = { persen.coerceIn(0, 100) / 100f },
        modifier = modifier.fillMaxWidth(),
        color = aksen.fill,
        trackColor = warna.fill2,
    )
}

/* ---------- Pratinjau ---------- */

@PreviewGanda
@Composable
private fun MkLampiranPreview() {
    MKTheme {
        Column(
            modifier = Modifier.padding(MkSpacing.space4),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            MkLampiranRow(
                namaBerkas = "Foto-progress-migrasi-gudang.jpg",
                ukuranLabel = "1,2 MB",
                onHapus = {},
            )
            MkLampiranRow(
                namaBerkas = "Berita-acara-serah-terima.pdf",
                ukuranLabel = "340 KB",
                sedangUnggah = true,
            )
            MkLampiranRow(
                namaBerkas = "Laporan-keuangan-pekan-41-revisi-final.xlsx",
                ukuranLabel = "96 KB",
            )
            MkProgresUnggah(persen = 62)
        }
    }
}
