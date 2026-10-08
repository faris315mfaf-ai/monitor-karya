package id.co.monitorkarya.designsystem.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Aksen aktif — port alias `--accent`, `--accent-fill`, `--accent-soft`, `--on-accent`
 * dari tokens.css (setara `data-accent` di web).
 *
 * Komponen memakai warna dari [LocalAccent], bukan hue aksen langsung
 * (aturan docs/design/02-warna.md: "Selalu pakai alias, bukan hue langsung").
 * Di mode malam warna teks aksen dibuat lebih terang, sedangkan isian tetap pekat —
 * karena itu `text` dan `fill` selalu dibedakan.
 */
data class MkAccentColors(
    /** --accent: aksen sebagai teks/ikon/garis. */
    val text: Color,
    /** --accent-fill: isian padat (tombol primer, batang terpilih, cincin progres). */
    val fill: Color,
    /** --accent-soft: tint di balik teks aksen (nav aktif, chip terpilih, eyebrow). */
    val soft: Color,
    /** --on-accent: teks/ikon di atas fill. Putih untuk semua hue; grafit punya sendiri. */
    val on: Color,
) {
    /** --focus: cincin fokus keyboard; nilai token sama dengan warna teks aksen. */
    val focus: Color
        get() = text
}

/** Enam aksen — setara `data-accent="merah|biru|hijau|ungu|oranye|grafit"`. */
enum class MkAccent {
    MERAH,
    BIRU,
    HIJAU,
    UNGU,
    ORANYE,
    GRAFIT;

    /** Nilai aksen untuk tema terang (blok `:root` tokens.css). */
    fun terang(): MkAccentColors = when (this) {
        MERAH -> MkAccentColors(
            text = Color(0xFFD11A2A), // --merah
            fill = Color(0xFFD11A2A), // --merah-fill
            soft = Color(0xFFFDECEE), // --merah-soft
            on = Color(0xFFFFFFFF), // --on-accent
        )
        BIRU -> MkAccentColors(
            text = Color(0xFF0A66D6), // --biru
            fill = Color(0xFF0A66D6), // --biru-fill
            soft = Color(0xFFE8F1FD), // --biru-soft
            on = Color(0xFFFFFFFF),
        )
        HIJAU -> MkAccentColors(
            text = Color(0xFF1A7340), // --hijau
            fill = Color(0xFF1A7340), // --hijau-fill
            soft = Color(0xFFE8F5EC), // --hijau-soft
            on = Color(0xFFFFFFFF),
        )
        UNGU -> MkAccentColors(
            text = Color(0xFF6E3FD8), // --ungu
            fill = Color(0xFF6E3FD8), // --ungu-fill
            soft = Color(0xFFF0EBFC), // --ungu-soft
            on = Color(0xFFFFFFFF),
        )
        ORANYE -> MkAccentColors(
            text = Color(0xFFB84A00), // --oranye
            fill = Color(0xFFB84A00), // --oranye-fill
            soft = Color(0xFFFFF0E3), // --oranye-soft
            on = Color(0xFFFFFFFF),
        )
        GRAFIT -> MkAccentColors(
            text = Color(0xFF3A3A3C), // --grafit
            fill = Color(0xFF1D1D1F), // --grafit-fill
            soft = Color(0xFFEDEDF0), // --grafit-soft
            on = Color(0xFFFFFFFF), // --on-grafit (terang)
        )
    }

    /** Nilai aksen untuk tema malam (blok `[data-theme="dark"]` tokens.css). */
    fun gelap(): MkAccentColors = when (this) {
        MERAH -> MkAccentColors(
            text = Color(0xFFFF6961), // --merah (malam)
            fill = Color(0xFFE0242F), // --merah-fill (malam)
            soft = Color(0xFF3A1214), // --merah-soft (malam)
            on = Color(0xFFFFFFFF), // --on-accent
        )
        BIRU -> MkAccentColors(
            text = Color(0xFF4DA3FF), // --biru (malam)
            fill = Color(0xFF0A6CE0), // --biru-fill (malam)
            soft = Color(0xFF0B2340), // --biru-soft (malam)
            on = Color(0xFFFFFFFF),
        )
        HIJAU -> MkAccentColors(
            text = Color(0xFF3DD47A), // --hijau (malam)
            fill = Color(0xFF1E8048), // --hijau-fill (malam)
            soft = Color(0xFF0E2A19), // --hijau-soft (malam)
            on = Color(0xFFFFFFFF),
        )
        UNGU -> MkAccentColors(
            text = Color(0xFFB79BFF), // --ungu (malam)
            fill = Color(0xFF7A4BE0), // --ungu-fill (malam)
            soft = Color(0xFF241A3F), // --ungu-soft (malam)
            on = Color(0xFFFFFFFF),
        )
        ORANYE -> MkAccentColors(
            text = Color(0xFFFF9F43), // --oranye (malam)
            fill = Color(0xFFC25000), // --oranye-fill (malam)
            soft = Color(0xFF33200C), // --oranye-soft (malam)
            on = Color(0xFFFFFFFF),
        )
        GRAFIT -> MkAccentColors(
            text = Color(0xFFE5E5EA), // --grafit (malam)
            fill = Color(0xFFE5E5EA), // --grafit-fill (malam)
            soft = Color(0xFF3A3A3C), // --grafit-soft (malam)
            on = Color(0xFF1D1D1F), // --on-grafit (malam: teks gelap di isian terang)
        )
    }

    /** Nilai aksen sesuai tema aktif. */
    fun colors(darkTheme: Boolean): MkAccentColors = if (darkTheme) gelap() else terang()
}

/** Aksen aktif (warna terurai); disediakan MKTheme. Default merah tema terang. */
val LocalAccent = staticCompositionLocalOf { MkAccent.MERAH.terang() }
