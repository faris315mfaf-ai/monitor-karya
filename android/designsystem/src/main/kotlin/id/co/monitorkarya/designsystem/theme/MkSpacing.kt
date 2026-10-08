package id.co.monitorkarya.designsystem.theme

import androidx.compose.ui.unit.dp

/**
 * Skala jarak — port `--space-*` dari tokens.css (hanya nilai yang ada di token).
 * Objek statis; tidak perlu CompositionLocal.
 */
object MkSpacing {
    /** --space-1: 4px. Jarak ikon-teks rapat, celah titik status. */
    val space1 = 4.dp

    /** --space-2: 8px. Jarak antar chip dan tombol dalam satu grup. */
    val space2 = 8.dp

    /** --space-3: 12px. Jarak antar ubin KPI, celah grid kecil. */
    val space3 = 12.dp

    /** --space-4: 16px. Jarak antar elemen dalam kartu; margin samping mobile minimum. */
    val space4 = 16.dp

    /** --space-5: 20px. Padding kartu mobile; margin samping mobile. */
    val space5 = 20.dp

    /** --space-6: 24px. Padding kartu desktop; gutter antar kartu desktop. */
    val space6 = 24.dp

    /** --space-8: 32px. Padding kartu ringkasan; margin samping tablet. */
    val space8 = 32.dp

    /** --space-10: 40px. Margin samping konten desktop; jarak antar bagian besar. */
    val space10 = 40.dp

    /** --space-12: 48px. Jarak header halaman ke konten pertama. */
    val space12 = 48.dp

    /** --space-16: 64px. Ruang bawah halaman sebelum tepi atau tab bar. */
    val space16 = 64.dp
}
