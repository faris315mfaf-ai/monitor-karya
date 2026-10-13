package id.co.monitorkarya.designsystem.theme

import android.content.ContentResolver
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext

/**
 * Preferensi "kurangi gerak" (setara `prefers-reduced-motion`). Di Android berasal
 * dari setelan sistem "Hapus animasi" (skala durasi animator 0) — dibaca
 * [gerakDikurangiSistem] dan menjadi nilai bawaan MKTheme (C4 P2-6). Default false.
 *
 * Saat true: animasi diperpendek/dihilangkan, transisi konten tetap (ganti nilai
 * tanpa gerak), dan tidak ada efek pendar/paralaks.
 */
val LocalReducedMotion = staticCompositionLocalOf { false }

/** True bila skala durasi animator sistem 0 ("Hapus animasi" / opsi pengembang). */
internal fun skalaAnimatorNol(resolver: ContentResolver): Boolean = try {
    Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
} catch (_: RuntimeException) {
    false
}

/**
 * Setelan "Hapus animasi" sistem, diamati langsung: mengubah setelan saat aplikasi
 * terbuka ikut mengubah nilai tanpa memulai ulang aktivitas.
 */
@Composable
fun gerakDikurangiSistem(): Boolean {
    val resolver = LocalContext.current.applicationContext?.contentResolver
        ?: return false
    var nilai by remember(resolver) { mutableStateOf(skalaAnimatorNol(resolver)) }
    DisposableEffect(resolver) {
        val pengamat = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                nilai = skalaAnimatorNol(resolver)
            }
        }
        val terdaftar = try {
            resolver.registerContentObserver(
                Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
                false,
                pengamat,
            )
            true
        } catch (_: RuntimeException) {
            false
        }
        onDispose { if (terdaftar) resolver.unregisterContentObserver(pengamat) }
    }
    return nilai
}
