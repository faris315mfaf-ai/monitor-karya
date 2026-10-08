package id.co.monitorkarya.designsystem.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/**
 * Tema Monitor Karya — jembatan token mk ke Material3.
 *
 * Komponen mk membaca warna dari LocalMkColors/LocalAccent, bukan dari
 * MaterialTheme.colorScheme; colorScheme hanya agar komponen Material bawaan
 * (TextField, Snackbar, dsb.) tidak menyimpang dari token.
 *
 * @param darkTheme setara `data-theme="dark"`; bawaan mengikuti sistem.
 * @param accent setara `data-accent`; bawaan merah.
 * @param reducedMotion setara `prefers-reduced-motion`; bawaan false.
 */
@Composable
fun MKTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    accent: MkAccent = MkAccent.MERAH,
    reducedMotion: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) MkColorsGelap else MkColorsTerang
    val accentColors = accent.colors(darkTheme)
    MaterialTheme(
        colorScheme = mkColorScheme(colors, accentColors, darkTheme),
        typography = mkMaterialTypography(),
        shapes = mkMaterialShapes(),
    ) {
        CompositionLocalProvider(
            LocalMkColors provides colors,
            LocalAccent provides accentColors,
            LocalReducedMotion provides reducedMotion,
        ) {
            content()
        }
    }
}

/**
 * Akses cepat ala `MaterialTheme`: `MkTheme.colors`, `MkTheme.accent`, `MkTheme.typography`,
 * `MkTheme.shapes`, `MkTheme.spacing`. Nilai `colors` sudah disuntik alias aksen aktif
 * (`accent`, `accentSoft`); nilai aksen lengkap (fill/on/focus) lewat [LocalAccent]
 * atau `MkTheme.accent`.
 */
object MkTheme {
    /** Palet mk aktif + alias aksen terisi. */
    val colors: MkColors
        @Composable get() = LocalMkColors.current.withAccent(LocalAccent.current)

    /** Aksen aktif (text/fill/soft/on/focus). */
    val accent: MkAccentColors
        @Composable get() = LocalAccent.current

    /** Skala tipografi mk. */
    val typography: MkTypography
        get() = MkTypography

    /** Radius mk. */
    val shapes: MkShapes
        get() = MkShapes

    /** Skala jarak mk. */
    val spacing: MkSpacing
        get() = MkSpacing
}

/**
 * Peta MkColors + aksen ke ColorScheme Material3 (slot -> token):
 * primary = accent-fill · onPrimary = on-accent · primaryContainer = accent-soft ·
 * onPrimaryContainer/inversePrimary = accent · secondary = fill-1 (kontrol sekunder) ·
 * secondaryContainer = accent-soft · tertiary = sukses (statusOn) + sukses-soft ·
 * background/bg = bg · surface = surface · surfaceVariant = surface-2 ·
 * onSurfaceVariant = ink-2 · surfaceTint = accent-fill · error = bahaya (statusLate) ·
 * errorContainer = bahaya-soft · outline = line-strong · outlineVariant = line ·
 * inverseSurface = ink · inverseOnSurface = bg · scrim = scrim.
 * Semua nilai dari token; slot on-error memakai putih (konvensi Material, token --putih).
 */
private fun mkColorScheme(c: MkColors, a: MkAccentColors, darkTheme: Boolean): ColorScheme =
    if (darkTheme) {
        darkColorScheme(
            primary = a.fill,
            onPrimary = a.on,
            primaryContainer = a.soft,
            onPrimaryContainer = a.text,
            inversePrimary = a.text,
            secondary = c.fill1,
            onSecondary = c.ink,
            secondaryContainer = a.soft,
            onSecondaryContainer = a.text,
            tertiary = c.statusOn,
            onTertiary = c.putih,
            tertiaryContainer = c.statusOnSoft,
            onTertiaryContainer = c.statusOn,
            background = c.bg,
            onBackground = c.ink,
            surface = c.surface,
            onSurface = c.ink,
            surfaceVariant = c.surface2,
            onSurfaceVariant = c.ink2,
            surfaceTint = a.fill,
            inverseSurface = c.ink,
            inverseOnSurface = c.bg,
            error = c.statusLate,
            onError = c.putih,
            errorContainer = c.statusLateSoft,
            onErrorContainer = c.statusLate,
            outline = c.lineStrong,
            outlineVariant = c.line,
            scrim = c.scrim,
        )
    } else {
        lightColorScheme(
            primary = a.fill,
            onPrimary = a.on,
            primaryContainer = a.soft,
            onPrimaryContainer = a.text,
            inversePrimary = a.text,
            secondary = c.fill1,
            onSecondary = c.ink,
            secondaryContainer = a.soft,
            onSecondaryContainer = a.text,
            tertiary = c.statusOn,
            onTertiary = c.putih,
            tertiaryContainer = c.statusOnSoft,
            onTertiaryContainer = c.statusOn,
            background = c.bg,
            onBackground = c.ink,
            surface = c.surface,
            onSurface = c.ink,
            surfaceVariant = c.surface2,
            onSurfaceVariant = c.ink2,
            surfaceTint = a.fill,
            inverseSurface = c.ink,
            inverseOnSurface = c.bg,
            error = c.statusLate,
            onError = c.putih,
            errorContainer = c.statusLateSoft,
            onErrorContainer = c.statusLate,
            outline = c.lineStrong,
            outlineVariant = c.line,
            scrim = c.scrim,
        )
    }
