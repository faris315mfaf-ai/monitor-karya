package id.co.monitorkarya.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Skala tipografi mk — port `--text-*` dari tokens.css (docs/design/04-tipografi.md).
 * Tracking negatif hanya untuk >=20px; tidak ada gaya di bawah 12sp; tebal hanya 400/500/600/700.
 *
 * Tumpukan huruf tokens.css (SF Pro -> Geist -> system-ui) belum dibundel sebagai aset
 * (tugas ini tanpa jaringan). Sampai Geist ditambahkan sebagai berkas font,
 * display/sans memakai huruf bawaan sistem dan mono memakai Monospace bawaan.
 */
object MkTypography {
    // --font-display: -apple-system, "SF Pro Display", "Geist", system-ui, sans-serif.
    private val Display = FontFamily.Default
    // --font-sans: -apple-system, "SF Pro Text", "Geist", system-ui, sans-serif.
    private val Sans = FontFamily.Default
    // --font-mono: "SF Mono", "Geist Mono", ui-monospace, Menlo, monospace.
    private val Mono = FontFamily.Monospace

    /** --text-display-xl: 700 48/52, tracking -0.03em. Angka di tengah cincin; satu per layar. */
    val displayXl: TextStyle = TextStyle(
        fontFamily = Display,
        fontWeight = FontWeight.Bold,
        fontSize = 48.sp,
        lineHeight = 52.sp,
        letterSpacing = (-0.03f).em,
    )

    /** --text-large-title: 700 40/44, tracking -0.025em. Sapaan/judul halaman desktop. */
    val largeTitle: TextStyle = TextStyle(
        fontFamily = Display,
        fontWeight = FontWeight.Bold,
        fontSize = 40.sp,
        lineHeight = 44.sp,
        letterSpacing = (-0.025f).em,
    )

    /** --text-title-1: 700 34/40, tracking -0.02em. Kalimat ringkasan; large title ponsel. */
    val title1: TextStyle = TextStyle(
        fontFamily = Display,
        fontWeight = FontWeight.Bold,
        fontSize = 34.sp,
        lineHeight = 40.sp,
        letterSpacing = (-0.02f).em,
    )

    /** --text-title-2: 700 28/34, tracking -0.02em. Angka KPI, nilai grafik terpilih. */
    val title2: TextStyle = TextStyle(
        fontFamily = Display,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        letterSpacing = (-0.02f).em,
    )

    /** --text-title-3: 600 20/26, tracking -0.01em. Judul kartu dan sheet. */
    val title3: TextStyle = TextStyle(
        fontFamily = Display,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        letterSpacing = (-0.01f).em,
    )

    /** --text-headline: 600 17/24, tracking -0.01em. Judul item daftar, nama proyek di ponsel. */
    val headline: TextStyle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.01f).em,
    )

    /** --text-body-lg: 400 17/24. Body ponsel/tablet, kalimat pendukung ringkasan. */
    val bodyLg: TextStyle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.Normal,
        fontSize = 17.sp,
        lineHeight = 24.sp,
    )

    /** --text-body: 400 15/22. Body desktop, isi baris tabel. */
    val body: TextStyle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    )

    /** --text-body-strong: 600 15/22. Nama proyek di tabel, label tombol. */
    val bodyStrong: TextStyle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    )

    /** --text-callout: 500 14/20. Chip, segmented control, nav, tombol kecil. */
    val callout: TextStyle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )

    /** --text-footnote: 400 13/18. Meta, subjudul kartu, delta KPI. */
    val footnote: TextStyle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )

    /** --text-caption: 500 12/16, tracking +0.01em. Label sumbu, label tab bar, lencana. */
    val caption: TextStyle = TextStyle(
        fontFamily = Sans,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.01f.em,
    )

    /** --text-code: 500 13/18 mono. Pintasan keyboard dan kode referensi (SOP-COR-001). */
    val code: TextStyle = TextStyle(
        fontFamily = Mono,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )
}

/**
 * Varian angka: `font-variant-numeric: tabular-nums` (docs/design/04: angka selalu
 * tabular agar kolom lurus dan angka tidak melompat saat berubah).
 * Pakai: `MkTypography.title2.tabular`.
 */
val TextStyle.tabular: TextStyle
    get() = copy(fontFeatureSettings = "tnum")

/**
 * Peta skala mk ke slot Typography Material3 untuk MaterialTheme.
 * Komponen mk tetap memakai MkTypography.<gaya> langsung; pemetaan ini hanya agar
 * komponen Material bawaan (TextField, Snackbar, dsb.) ikut skala mk.
 * Slot labelMedium/labelSmall keduanya caption karena skala mk tidak punya 11sp
 * dan aturan melarang ukuran di bawah 12.
 */
fun mkMaterialTypography(): Typography = Typography(
    displayLarge = MkTypography.displayXl,
    displayMedium = MkTypography.largeTitle,
    displaySmall = MkTypography.title1,
    headlineLarge = MkTypography.title2,
    headlineMedium = MkTypography.title3,
    headlineSmall = MkTypography.headline,
    titleLarge = MkTypography.title3,
    titleMedium = MkTypography.bodyStrong,
    titleSmall = MkTypography.callout,
    bodyLarge = MkTypography.bodyLg,
    bodyMedium = MkTypography.body,
    bodySmall = MkTypography.footnote,
    labelLarge = MkTypography.callout,
    labelMedium = MkTypography.caption,
    labelSmall = MkTypography.caption,
)
