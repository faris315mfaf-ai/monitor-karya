package id.co.monitorkarya.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Radius sudut — port `--radius-*` dari tokens.css.
 * Hanya enam nilai ini; jangan menulis radius lain sendiri.
 */
object MkShapes {
    /** --radius-xs: 6px. Lencana angka, kbd, swatch kecil. */
    val xs: RoundedCornerShape = RoundedCornerShape(6.dp)

    /** --radius-sm: 10px. Kolom input, segmented, item nav. */
    val sm: RoundedCornerShape = RoundedCornerShape(10.dp)

    /** --radius-md: 14px. Baris daftar yang bisa diklik, ubin KPI, ikon status. */
    val md: RoundedCornerShape = RoundedCornerShape(14.dp)

    /** --radius-lg: 22px. Kartu. */
    val kartu: RoundedCornerShape = RoundedCornerShape(22.dp)

    /** --radius-xl: 28px. Sheet, dialog, kartu ringkasan utama. */
    val sheet: RoundedCornerShape = RoundedCornerShape(28.dp)

    /** --radius-full: 999px. Tombol, chip, lencana status, avatar, progress bar (pill). */
    val penuh: RoundedCornerShape = RoundedCornerShape(50)
}

/**
 * Peta radius mk ke slot Shapes Material3 untuk MaterialTheme.
 * Komponen mk tetap memakai MkShapes.<nama> langsung.
 */
fun mkMaterialShapes(): Shapes = Shapes(
    extraSmall = MkShapes.xs,
    small = MkShapes.sm,
    medium = MkShapes.md,
    large = MkShapes.kartu,
    extraLarge = MkShapes.sheet,
)
