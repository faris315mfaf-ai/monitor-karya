// Kepingan UI bersama dua tab modul audit (kepala halaman, kartu berjudul,
// baris kunci-nilai, kotak teks kode). Nilai visual hanya dari token designsystem.
package id.co.monitorkarya.feature.audit.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkShapes
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography
import id.co.monitorkarya.designsystem.theme.tabular

/** PageHeader web: konteks footnote di atas judul besar, alat opsional di kanan. */
@Composable
internal fun KepalaHalaman(
    judul: String,
    konteks: String,
    modifier: Modifier = Modifier,
    alat: @Composable RowScope.() -> Unit = {},
) {
    val warna = LocalMkColors.current
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(text = konteks, style = MkTypography.footnote, color = warna.ink2)
            Text(
                text = judul,
                style = MkTypography.title1,
                color = warna.ink,
                modifier = Modifier.semantics { heading() },
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MkSpacing.space2), content = alat)
    }
}

/** Card web berjudul: judul headline + subjudul footnote, lalu isi. */
@Composable
internal fun KartuBagian(
    judul: String,
    modifier: Modifier = Modifier,
    sub: String? = null,
    isi: @Composable ColumnScope.() -> Unit,
) {
    val warna = LocalMkColors.current
    MkCard(modifier = modifier.fillMaxWidth()) {
        Text(
            text = judul,
            style = MkTypography.headline,
            color = warna.ink,
            modifier = Modifier.semantics { heading() },
        )
        if (sub != null) {
            Text(text = sub, style = MkTypography.footnote, color = warna.ink2)
        }
        Column(
            modifier = Modifier.padding(top = MkSpacing.space3),
            verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
            content = isi,
        )
    }
}

/** KvRow web: label ink-2 kiri, nilai tebal kanan; nilai boleh berupa komponen. */
@Composable
internal fun BarisKv(label: String, nilai: String? = null, isiNilai: (@Composable () -> Unit)? = null) {
    val warna = LocalMkColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 40.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MkSpacing.space3),
    ) {
        Text(text = label, style = MkTypography.body, color = warna.ink2, modifier = Modifier.weight(1f))
        if (isiNilai != null) {
            isiNilai()
        } else {
            Text(
                text = nilai.orEmpty(),
                style = MkTypography.bodyStrong.tabular,
                color = warna.ink,
                textAlign = TextAlign.End,
            )
        }
    }
}

/** Judul bagian di dalam Sheet. */
@Composable
internal fun JudulSeksi(teks: String) {
    Text(
        text = teks,
        style = MkTypography.headline,
        color = LocalMkColors.current.ink,
        modifier = Modifier
            .padding(top = MkSpacing.space4, bottom = MkSpacing.space2)
            .semantics { heading() },
    )
}

/**
 * Kotak teks kode (pre web): latar fill-1, huruf mono, bisa dipilih/salin,
 * digulir mendatar. Isi SELALU teks polos — tidak ada penafsiran HTML/markup.
 */
@Composable
internal fun KotakKode(label: String?, teks: String, modifier: Modifier = Modifier) {
    val warna = LocalMkColors.current
    Column(
        modifier
            .fillMaxWidth()
            .background(warna.fill1, MkShapes.md)
            .padding(MkSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space1),
    ) {
        if (label != null) {
            Text(text = label, style = MkTypography.caption, color = warna.ink2)
        }
        SelectionContainer {
            Text(
                text = teks,
                style = MkTypography.code,
                color = warna.ink,
                softWrap = false,
                modifier = Modifier.horizontalScroll(rememberScrollState()),
            )
        }
    }
}
