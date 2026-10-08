package id.co.monitorkarya.designsystem.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing

/**
 * Durasi gerak — port `--dur-*` dari tokens.css, dalam milidetik.
 * Hormati LocalReducedMotion: saat aktif, durasi diperpendek ke 0 atau sesaat.
 */
object MkMotion {
    /** --dur-fast: 150ms. Efek tekan tombol, hover. */
    const val Fast: Int = 150

    /** --dur-base: 250ms. Ganti segmented, chip, tema. */
    const val Base: Int = 250

    /** --dur-slow: 400ms. Sheet masuk/keluar. */
    const val Slow: Int = 400

    /** --dur-data: 600ms. Batang grafik, progress bar dan cincin berubah nilai. */
    const val Data: Int = 600
}

/** Kurva gerak — port `--ease-*` dari tokens.css (docs/design/06-elevasi-dan-gerak.md). */
object MkEasing {
    /** --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1). Hampir semua transisi. */
    val Standard: Easing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

    /** --ease-spring: cubic-bezier(0.34, 1.3, 0.64, 1). Sheet dan tab bar muncul (sedikit pantulan). */
    val Spring: Easing = CubicBezierEasing(0.34f, 1.3f, 0.64f, 1f)

    /** --ease-exit: cubic-bezier(0.4, 0, 1, 1). Elemen keluar layar. */
    val Exit: Easing = CubicBezierEasing(0.4f, 0f, 1f, 1f)
}
