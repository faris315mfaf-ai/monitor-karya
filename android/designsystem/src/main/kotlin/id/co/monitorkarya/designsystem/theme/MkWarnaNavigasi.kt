package id.co.monitorkarya.designsystem.theme

import androidx.compose.ui.graphics.Color

/**
 * Warna bilah navigasi bawah dari token (E2E-1 #6 / E2E-2 BUG-07). Bawaan M3
 * mengambil label aktif dari slot `secondary` (= fill-1, abu sangat terang) dan
 * latar dari `surfaceContainer` (lavender bawaan, tidak dipetakan) — label tab
 * aktif jadi nyaris tak terbaca. Padanan nav web: item aktif = ikon aksen di atas
 * tint accent-soft; label aktif tinta penuh, label pasif ink-2; latar surface.
 */
data class MkWarnaNavigasi(
    val latar: Color,
    val ikonAktif: Color,
    val labelAktif: Color,
    val indikator: Color,
    val ikonPasif: Color,
    val labelPasif: Color,
)

/** Warna navigasi untuk tema [c] dan aksen [a] — murni, diuji kontrasnya. */
fun warnaNavigasi(c: MkColors, a: MkAccentColors): MkWarnaNavigasi = MkWarnaNavigasi(
    latar = c.surface,
    ikonAktif = a.text,
    labelAktif = c.ink,
    indikator = a.soft,
    ikonPasif = c.ink2,
    labelPasif = c.ink2,
)
