// Meja kerja untuk akun yang tidak terikat satu PT (TI / Super Admin tingkat
// grup) — paritas cabang `!applies` src/components/views/work-desk-view.tsx:
// server menjawab 400 "Meja kerja berlaku untuk akun yang terikat pada satu
// PT." (src/app/api/work-desk/route.ts), jadi layar tidak memanggil server
// dan menunjuk ke Ringkasan.
package id.co.monitorkarya.app.ui.mejaumum

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import id.co.monitorkarya.core.domain.model.Peran
import id.co.monitorkarya.designsystem.components.EmptyNote
import id.co.monitorkarya.designsystem.components.MkCard
import id.co.monitorkarya.designsystem.theme.LocalMkColors
import id.co.monitorkarya.designsystem.theme.MkSpacing
import id.co.monitorkarya.designsystem.theme.MkTypography

/** Kalimat web: "Akun <peran> tidak terikat pada satu PT, …". */
internal fun teksMejaTanpaPt(peran: Peran): String =
    "Akun ${peran.labelIndonesia} tidak terikat pada satu PT, sehingga tidak punya meja kerja harian. " +
        "Pantau perusahaan dari Ringkasan."

@Composable
fun MejaTanpaPtScreen(peran: Peran, onBukaRingkasan: () -> Unit, modifier: Modifier = Modifier) {
    val warna = LocalMkColors.current
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = MkSpacing.space3, vertical = MkSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(MkSpacing.space4),
    ) {
        Text("Meja kerja", style = MkTypography.title1, color = warna.ink, modifier = Modifier.semantics { heading() })
        MkCard(modifier = Modifier.fillMaxWidth()) {
            EmptyNote(
                teks = teksMejaTanpaPt(peran),
                ikon = Icons.Outlined.Business,
                teksAksi = "Buka Ringkasan",
                onAksi = onBukaRingkasan,
            )
        }
    }
}
