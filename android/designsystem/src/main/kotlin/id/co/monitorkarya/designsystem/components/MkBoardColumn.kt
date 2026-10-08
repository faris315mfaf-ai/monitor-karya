package id.co.monitorkarya.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/** Kartu satu item di kolom papan mingguan. */
data class MkKartuPapan(
    val id: String,
    val judul: String,
    val status: MkStatus,
    /** Progres 0–100; ditampilkan sebagai trek tipis + angka tabular. */
    val progres: Int,
)

/**
 * Kolom papan mingguan sederhana: judul kecil (caption ink-2) + daftar kartu inset
 * (judul bodyStrong, chip status, progres tipis). Tanpa seret-letak — urutan diubah
 * lewat tombol naik/turun di tiap kartu melalui slot [onNaik]/[onTurun] (keduanya
 * null → papan statis tanpa tombol urut). Kolom kosong menampilkan kalimat tenang.
 */
@Composable
fun MkBoardColumn(
    modifier: Modifier = Modifier,
    judul: String,
    kartu: List<MkKartuPapan>,
    onNaik: ((indeks: Int) -> Unit)? = null,
    onTurun: ((indeks: Int) -> Unit)? = null,
) {
    val warna = LocalMkColors.current
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Text(
            text = judul,
            style = MkTypography.caption,
            color = warna.ink2,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = MkSpacing.space1),
        )
        if (kartu.isEmpty()) {
            // Kosong wajar: kalimat tenang di wadah inset tipis.
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MkShapes.kartu)
                    .background(color = warna.surface2)
                    .border(1.dp, warna.line, MkShapes.kartu)
                    .padding(vertical = MkSpacing.space4),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Belum ada kartu.",
                    style = MkTypography.footnote,
                    color = warna.ink2,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(MkSpacing.space2)) {
                kartu.forEachIndexed { indeks, item ->
                    KartuPapan(
                        kartu = item,
                        bisaNaik = indeks > 0,
                        bisaTurun = indeks < kartu.lastIndex,
                        onNaik = if (onNaik != null) ({ onNaik(indeks) }) else null,
                        onTurun = if (onTurun != null) ({ onTurun(indeks) }) else null,
                    )
                }
            }
        }
    }
}

/**
 * Kartu papan inset kecil: latar surface-2 + garis 1dp line + radius kartu
 * (setaran `Card variant="inset"` web — MkCard F1 belum punya varian). Isi:
 * judul + tombol urut, chip status, trek progres tipis + persen tabular.
 */
@Composable
private fun KartuPapan(
    kartu: MkKartuPapan,
    bisaNaik: Boolean,
    bisaTurun: Boolean,
    onNaik: (() -> Unit)?,
    onTurun: (() -> Unit)?,
) {
    val warna = LocalMkColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MkShapes.kartu)
            .background(color = warna.surface2)
            .border(1.dp, warna.line, MkShapes.kartu)
            .padding(all = MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space2),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Text(
                text = kartu.judul,
                style = MkTypography.bodyStrong,
                color = warna.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (onNaik != null) {
                TombolUrut(
                    ikon = Icons.Outlined.KeyboardArrowUp,
                    label = "Naikkan ${kartu.judul}",
                    enabled = bisaNaik,
                    onClick = onNaik,
                )
            }
            if (onTurun != null) {
                TombolUrut(
                    ikon = Icons.Outlined.KeyboardArrowDown,
                    label = "Turunkan ${kartu.judul}",
                    enabled = bisaTurun,
                    onClick = onTurun,
                )
            }
        }
        MkChip(label = kartu.status.label, status = kartu.status)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2),
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(4.dp)
                    .clip(MkShapes.penuh)
                    .background(color = warna.fill2),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(fraction = kartu.progres.coerceIn(0, 100) / 100f)
                        .clip(MkShapes.penuh)
                        .background(color = warnaStatus(status = kartu.status)),
                )
            }
            Text(
                text = "${kartu.progres.coerceIn(0, 100)}%",
                style = MkTypography.caption.tabular,
                color = warna.ink2,
                maxLines = 1,
            )
        }
    }
}

/** Tombol ikon bulat 32dp untuk urut naik/turun; nonaktif meredup ke alpha 0.3. */
@Composable
private fun TombolUrut(
    ikon: ImageVector,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(CircleShape)
            .alpha(alpha = if (enabled) 1f else 0.3f)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = ikon,
            contentDescription = label,
            tint = LocalMkColors.current.ink2,
            modifier = Modifier.size(18.dp),
        )
    }
}

/* ---------- Pratinjau ---------- */

/** Tukar posisi kartu di daftar (dipakai pratinjau untuk mendemokan naik/turun). */
private fun tukar(kartu: List<MkKartuPapan>, dari: Int, ke: Int): List<MkKartuPapan> =
    kartu.toMutableList().apply { add(ke, removeAt(dari)) }

@PreviewGanda
@Composable
private fun MkBoardColumnPreview() {
    MKTheme {
        var kartu by remember {
            mutableStateOf(
                listOf(
                    MkKartuPapan(id = "a", judul = "Audit kepatuhan Q3", status = MkStatus.ON, progres = 60),
                    MkKartuPapan(id = "b", judul = "Migrasi data gudang", status = MkStatus.LATE, progres = 35),
                    MkKartuPapan(id = "c", judul = "Survey kepuasan", status = MkStatus.NEUTRAL, progres = 0),
                ),
            )
        }
        Row(
            modifier = Modifier
                .background(color = LocalMkColors.current.bg)
                .padding(all = MkSpacing.space4)
                .horizontalScroll(state = rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
        ) {
            MkBoardColumn(
                modifier = Modifier.width(264.dp),
                judul = "Senin",
                kartu = kartu,
                onNaik = { i -> if (i > 0) kartu = tukar(kartu, i, i - 1) },
                onTurun = { i -> if (i < kartu.lastIndex) kartu = tukar(kartu, i, i + 1) },
            )
            MkBoardColumn(
                modifier = Modifier.width(264.dp),
                judul = "Rabu",
                kartu = listOf(
                    MkKartuPapan(id = "d", judul = "Rapat mitra rumah sakit", status = MkStatus.RISK, progres = 20),
                ),
            )
            MkBoardColumn(
                modifier = Modifier.width(264.dp),
                judul = "Jumat",
                kartu = emptyList(),
            )
        }
    }
}
