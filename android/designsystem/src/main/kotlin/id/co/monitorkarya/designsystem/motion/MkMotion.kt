package id.co.monitorkarya.designsystem.motion

import androidx.compose.animation.core.Easing
import androidx.compose.runtime.ProvidableCompositionLocal
import id.co.monitorkarya.designsystem.theme.MkEasing as ThemeMkEasing
import id.co.monitorkarya.designsystem.theme.LocalReducedMotion as ThemeLocalReducedMotion

/**
 * Fasad kompatibilitas untuk komponen yang mengimpor `designsystem.motion.*`.
 * Simbol gerak tetap didefinisikan sekali di paket `designsystem.theme`
 * (satu sumber kebenaran — CompositionLocal TIDAK diduplikasi); berkas ini hanya
 * meneruskan nilai yang sama. Komponen baru disarankan mengimpor langsung dari
 * `id.co.monitorkarya.designsystem.theme`.
 */
val LocalReducedMotion: ProvidableCompositionLocal<Boolean> = ThemeLocalReducedMotion

/** Kurva gerak mk — instance yang sama dengan theme.MkEasing. */
object MkEasing {
    /** --ease-standard. */
    val Standard: Easing get() = ThemeMkEasing.Standard

    /** --ease-spring. */
    val Spring: Easing get() = ThemeMkEasing.Spring

    /** --ease-exit. */
    val Exit: Easing get() = ThemeMkEasing.Exit
}
