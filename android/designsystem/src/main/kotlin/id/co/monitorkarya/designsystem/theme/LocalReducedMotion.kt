package id.co.monitorkarya.designsystem.theme

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Preferensi "kurangi gerak" (setara `prefers-reduced-motion`; di Android biasanya
 * berasal dari setelan sistem "Hapus animasi" — penggilus aplikasi membacanya lalu
 * meneruskannya ke MKTheme). Disediakan MKTheme; default false.
 *
 * Saat true: animasi diperpendek/dihilangkan, transisi konten tetap (ganti nilai
 * tanpa gerak), dan tidak ada efek pendar/paralaks.
 */
val LocalReducedMotion = staticCompositionLocalOf { false }
