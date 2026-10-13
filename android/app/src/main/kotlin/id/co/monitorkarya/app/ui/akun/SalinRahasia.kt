// Salin kata sandi / tautan aktivasi ke papan klip bertanda SENSITIF (C3-S4)
// supaya pratinjau papan klip Android 13+ menyamarkannya dan keyboard tidak
// menyimpannya di riwayat. Padanan app dari feature/entitas/ui/SalinRahasia.kt
// (fungsi itu internal di modulnya). Tidak ada log.
package id.co.monitorkarya.app.ui.akun

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/** Kunci ekstra sensitif; konstanta platform baru ada di API 33. */
internal const val KUNCI_SENSITIF = "android.content.extra.IS_SENSITIVE"

/** ClipData bertanda sensitif. */
internal fun klipSensitif(label: String, teks: String): ClipData =
    ClipData.newPlainText(label, teks).apply {
        description.extras = PersistableBundle().apply {
            val kunci = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ClipDescription.EXTRA_IS_SENSITIVE
            } else {
                KUNCI_SENSITIF
            }
            putBoolean(kunci, true)
        }
    }

/** Fungsi salin rahasia untuk komposisi saat ini. */
@Composable
internal fun rememberSalinRahasia(): (label: String, teks: String) -> Unit {
    val context = LocalContext.current
    return remember(context) {
        { label, teks ->
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            cm?.setPrimaryClip(klipSensitif(label, teks))
        }
    }
}
