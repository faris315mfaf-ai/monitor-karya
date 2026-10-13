// Teks yang dikirim ViewModel ke layar: sumber daya string modul (dengan
// argumen) atau teks mentah dari server (pesan galat ApiError). Dengan begini
// ViewModel tetap bebas Context dan mudah diuji.
package id.co.monitorkarya.feature.entitas.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource

sealed interface TeksUi {
    data class Res(@param:StringRes val id: Int, val args: List<Any> = emptyList()) : TeksUi
    data class Mentah(val teks: String) : TeksUi
}

/** Ubah TeksUi menjadi string siap tampil. */
@Composable
fun TeksUi.tampil(): String = when (this) {
    is TeksUi.Res -> stringResource(id, *args.toTypedArray())
    is TeksUi.Mentah -> teks
}

/** Pesan satu-kali (snackbar); [id] naik tiap pesan agar efek terpicu ulang. */
data class NotifUi(
    val id: Long,
    val teks: TeksUi,
    /** Aksi "Urungkan" bila tindakannya bisa dibalik. */
    val bisaUrung: Boolean = false,
)
