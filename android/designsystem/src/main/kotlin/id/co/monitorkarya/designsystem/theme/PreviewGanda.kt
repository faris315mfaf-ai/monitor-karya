package id.co.monitorkarya.designsystem.theme

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview

/**
 * Util pratinjau terang+gelap untuk modul designsystem.
 *
 * Cara pakai yang disarankan (multipreview — dua render otomatis di Android Studio):
 * ```
 * @PreviewGanda
 * @Composable
 * fun TombolPrimaryPreview() {
 *     MKTheme { MkButton("Kirim laporan") { } }
 * }
 * ```
 * Untuk enam aksen, bungkus sendiri dengan MKTheme(accent = MkAccent.BIRU, dsb.)
 * dan uji terutama Grafit (isian terang, teks gelap — docs/design/08).
 */
@Preview(name = "Terang", showBackground = true)
@Preview(name = "Gelap", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
annotation class PreviewGanda

/**
 * Wrapper tema terang untuk pratinjau; menerima content.
 * Catatan: @Preview pada fungsi berparameter tidak dirender langsung oleh Android
 * Studio — panggil wrapper ini dari fungsi @Preview Anda sendiri, atau pakai
 * anotasi [PreviewGanda] di atas.
 */
@Preview(name = "Terang", showBackground = true)
@Composable
fun PreviewTerang(content: @Composable () -> Unit) {
    MKTheme(darkTheme = false) {
        content()
    }
}

/**
 * Wrapper tema malam untuk pratinjau; menerima content.
 * Catatan sama dengan [PreviewTerang].
 */
@Preview(name = "Gelap", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
fun PreviewGelap(content: @Composable () -> Unit) {
    MKTheme(darkTheme = true) {
        content()
    }
}
