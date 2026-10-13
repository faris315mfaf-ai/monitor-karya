// Kartu "Riwayat kepatuhan harian" — peta panas divisi × 10 hari kerja
// (BUG-02, port ComplianceHeatmapCard web). Data dari KepatuhanViewModel yang
// sama dengan modul Kepatuhan (satu GET /api/admin/compliance). Sel = campuran
// fill-1 → status-on (color-mix web); kosong = libur/tidak ada yang wajib.
// Ketuk sel → rincian "Divisi · Hari · persen" di bawah kisi.
package id.co.monitorkarya.app.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.app.ui.kepatuhan.DivisiKepatuhan
import id.co.monitorkarya.app.ui.kepatuhan.KepatuhanUiState
import id.co.monitorkarya.app.ui.kepatuhan.MejaKepatuhan
import id.co.monitorkarya.app.ui.kepatuhan.StatusMingguan
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.ErrorNote
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.components.MkSkeleton
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MKTheme
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.PreviewGanda
import id.co.monitorkarya.designsystem.theme.tabular

/** Lebar layar di bawah ini memakai label 3 huruf (04-admin-pt.md §Ponsel). */
private val BATAS_LABEL_PENUH = 520.dp

@Composable
fun PetaPanasKartu(
    state: KepatuhanUiState,
    onUlang: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val warna = LocalMkColors.current
    val peta = (state as? KepatuhanUiState.Siap)?.meja?.let(::susunPetaPanas)
    MkCard(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Riwayat kepatuhan harian",
            style = MkTypography.headline,
            color = warna.ink,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = peta?.let(::subjudulPetaPanas) ?: "Memuat…",
            style = MkTypography.footnote,
            color = warna.ink2,
        )
        Spacer(Modifier.size(MkSpacing.space3))
        when {
            state is KepatuhanUiState.Memuat -> MkSkeleton(modifier = Modifier.fillMaxWidth(), tinggi = 200.dp)
            state is KepatuhanUiState.Galat -> ErrorNote(pesan = state.pesan, onCobaLagi = onUlang)
            peta == null || peta.baris.isEmpty() || peta.kolom.isEmpty() ->
                EmptyNote(teks = "Belum ada riwayat per divisi.")
            else -> KisiPetaPanas(peta = peta)
        }
    }
}

@Composable
private fun KisiPetaPanas(peta: PetaPanas) {
    val warna = LocalMkColors.current
    var pilih by remember(peta) { mutableStateOf<Pair<Int, Int>?>(null) }
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val penuh = maxWidth >= BATAS_LABEL_PENUH
        val lebarLabel: Dp = if (penuh) 140.dp else 40.dp
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            // Kepala kolom: hari singkat di atas tanggal.
            Row(
                modifier = Modifier.fillMaxWidth().clearAndSetSemantics { },
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Spacer(Modifier.width(lebarLabel))
                peta.kolom.forEach { k ->
                    val bagian = k.split(" ")
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = bagian.getOrElse(0) { k },
                            style = MkTypography.caption,
                            color = warna.ink2,
                            maxLines = 1,
                            overflow = TextOverflow.Clip,
                        )
                        Text(
                            text = bagian.getOrElse(1) { "" },
                            style = MkTypography.caption.tabular,
                            color = warna.ink2,
                            maxLines = 1,
                        )
                    }
                }
            }
            peta.baris.forEachIndexed { i, b ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics(mergeDescendants = true) { contentDescription = deskripsiBaris(peta, b) },
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (penuh) b.nama else b.label,
                        style = MkTypography.footnote,
                        color = warna.ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.width(lebarLabel),
                    )
                    b.nilai.forEachIndexed { j, v ->
                        SelPeta(
                            nilai = v,
                            terpilih = pilih == (i to j),
                            onKetuk = { pilih = if (pilih == (i to j)) null else (i to j) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
    Spacer(Modifier.size(MkSpacing.space3))
    val rincian = pilih?.let { (i, j) ->
        val b = peta.baris.getOrNull(i) ?: return@let null
        val v = b.nilai.getOrNull(j)
        "Divisi ${b.nama} · ${peta.kolom.getOrElse(j) { "" }} · ${v?.let { "$it% lapor" } ?: "libur / tidak ada yang wajib"}"
    }
    Text(
        text = rincian ?: "Ketuk sel untuk melihat persen per hari.",
        style = MkTypography.footnote,
        color = if (rincian != null) warna.ink else warna.ink2,
    )
    Spacer(Modifier.size(MkSpacing.space2))
    Legenda()
}

@Composable
private fun SelPeta(nilai: Int?, terpilih: Boolean, onKetuk: () -> Unit, modifier: Modifier = Modifier) {
    val warna = LocalMkColors.current
    val isi: Color = if (nilai == null) Color.Transparent else lerp(warna.fill1, warna.statusOn, fraksiSel(nilai))
    Spacer(
        modifier = modifier
            .aspectRatio(1f)
            .clip(MkShapes.xs)
            .background(isi)
            .border(
                width = if (terpilih) 2.dp else 1.dp,
                color = if (terpilih) warna.ink else if (nilai == null) warna.line else Color.Transparent,
                shape = MkShapes.xs,
            )
            .clickable(onClick = onKetuk),
    )
}

/** Legenda 0% → 100% + sel libur. */
@Composable
private fun Legenda() {
    val warna = LocalMkColors.current
    Row(
        modifier = Modifier.clearAndSetSemantics { contentDescription = "Skala 0 sampai 100 persen; sel kosong berarti libur" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        Text(text = "0%", style = MkTypography.caption, color = warna.ink2)
        listOf(0, 25, 50, 75, 100).forEach { p ->
            Spacer(
                Modifier
                    .size(12.dp)
                    .clip(MkShapes.xs)
                    .background(lerp(warna.fill1, warna.statusOn, fraksiSel(p))),
            )
        }
        Text(text = "100%", style = MkTypography.caption, color = warna.ink2)
        Spacer(Modifier.width(MkSpacing.space3))
        Spacer(
            Modifier
                .size(12.dp)
                .clip(MkShapes.xs)
                .border(1.dp, warna.line, MkShapes.xs),
        )
        Text(
            text = "libur",
            style = MkTypography.caption,
            color = warna.ink2,
            textAlign = TextAlign.Start,
            modifier = Modifier.padding(start = MkSpacing.space1),
        )
    }
}

// ------------------------------------------------------------------
// Pratinjau
// ------------------------------------------------------------------

@PreviewGanda
@Composable
private fun PetaPanasKartuPreview() {
    val hari = listOf(
        "2026-09-29T17:00:00Z", "2026-09-30T17:00:00Z", "2026-10-01T17:00:00Z", "2026-10-04T17:00:00Z",
        "2026-10-05T17:00:00Z", "2026-10-06T17:00:00Z", "2026-10-07T17:00:00Z", "2026-10-08T17:00:00Z",
        "2026-10-11T17:00:00Z", "2026-10-12T17:00:00Z",
    )
    fun divisi(id: String, nama: String, riwayat: List<Int?>) = DivisiKepatuhan(
        id = id, nama = nama, kepalaNama = null, kepalaEmail = null, kepalaTelepon = null,
        wajib = 4, sudah = 3, cuti = 0, belumLapor = emptyList(), mingguan = StatusMingguan.BELUM,
        diserahkanIso = null, disetujuiIso = null, diteruskanIso = null, riwayat = riwayat,
    )
    val meja = MejaKepatuhan(
        terkunci = false, bolehIngatkan = true, wajib = 8, sudah = 6, cuti = 0, diingatkan = 0, tanpaDivisi = 0,
        isoMinggu = 42, serahLewat = false, hari = hari,
        divisi = listOf(
            divisi("d1", "Teknologi", listOf(100, 75, 50, null, 100, 100, 25, 0, 100, 75)),
            divisi("d2", "Sumber Daya Manusia", listOf(50, 50, 100, 100, null, 75, 100, 100, 50, 100)),
        ),
    )
    MKTheme {
        PetaPanasKartu(state = KepatuhanUiState.Siap(meja), onUlang = {})
    }
}
