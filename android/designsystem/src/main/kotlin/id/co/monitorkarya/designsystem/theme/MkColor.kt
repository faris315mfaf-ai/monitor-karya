package id.co.monitorkarya.designsystem.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Palet warna Monitor Karya — port satu-satu dari `design-system/tokens.css`.
 *
 * Sumber kebenaran tetap tokens.css; dilarang menambah atau mengubah nilai hex di sini.
 * Pasangan teks–latar harus mengikuti tabel kontras docs/design/02-warna.md.
 * Status selalu warna + ikon + kata (docs/design/01 dan 02).
 */
data class MkColors(
    /** --bg: latar halaman di belakang kartu. */
    val bg: Color,
    /** --surface: kartu, panel, sheet, sidebar. */
    val surface: Color,
    /** --surface-2: permukaan bertingkat di dalam kartu (header tabel, area tenang sheet). */
    val surface2: Color,
    /** --fill-1: isian lembut kontrol — tombol sekunder, kolom cari, segmented, ubin KPI. */
    val fill1: Color,
    /** --fill-2: trek progress bar dan cincin, hover tombol sekunder. */
    val fill2: Color,
    /** --line: garis rambut 1px dekoratif; jangan satu-satunya batas kontrol. */
    val line: Color,
    /** --line-strong: batas kontrol yang wajib terlihat (>=3:1 di surface). */
    val lineStrong: Color,
    /** --ink: teks utama dan angka. */
    val ink: Color,
    /** --ink-2: teks sekunder — subjudul, meta, label sumbu. */
    val ink2: Color,
    /** --ink-3: hanya placeholder dan teks nonaktif. */
    val ink3: Color,
    /** --putih: putih tetap (separuh bawah logo); tidak berubah di tema gelap. */
    val putih: Color,
    /** --sukses: status on "Sesuai jadwal"; selalu dengan ikon centang dan kata. */
    val statusOn: Color,
    /** --sukses-soft: latar lencana dan ikon status on. */
    val statusOnSoft: Color,
    /** --waspada: status risk "Perlu perhatian"; selalu dengan ikon segitiga dan kata. */
    val statusRisk: Color,
    /** --waspada-soft: latar lencana dan ikon status risk. */
    val statusRiskSoft: Color,
    /** --bahaya: status late "Terlambat"/"Ditolak"; selalu dengan ikon jam dan kata. */
    val statusLate: Color,
    /** --bahaya-soft: latar lencana late dan tombol destruktif. */
    val statusLateSoft: Color,
    /** --sukses: status done "Selesai" — token yang sama dengan on. */
    val statusDone: Color,
    /** --ink-2: status neutral "Belum mulai"; latarnya fill1 (tidak ada token soft khusus). */
    val statusNeutral: Color,
    /** --info (= --biru): status informasi netral. */
    val statusInfo: Color,
    /** --info-soft (= --biru-soft): latar lencana informasi. */
    val statusInfoSoft: Color,
    /** --scrim: tirai gelap di belakang sheet dan dialog. */
    val scrim: Color,
    /**
     * --accent: teks/ikon aksen aktif. Dinamis (mengikuti aksen pilihan pengguna) —
     * hanya terisi lewat `MkTheme.colors`/[withAccent]; MkColorsTerang/MkColorsGelap
     * membiarkannya Unspecified. Untuk nilai aksen lengkap pakai [LocalAccent]/MkTheme.accent.
     */
    val accent: Color = Color.Unspecified,
    /** --accent-soft: tint aksen aktif; dinamis seperti [accent]. */
    val accentSoft: Color = Color.Unspecified,
)

/** Tema terang — blok `:root, [data-theme="light"]` tokens.css. */
val MkColorsTerang: MkColors = MkColors(
    bg = Color(0xFFF5F5F7), // --bg
    surface = Color(0xFFFFFFFF), // --surface
    surface2 = Color(0xFFFAFAFC), // --surface-2
    fill1 = Color(0xFFF2F2F5), // --fill-1
    fill2 = Color(0xFFE5E5EA), // --fill-2
    line = Color(0xFFE3E3E8), // --line
    lineStrong = Color(0xFF8E8E93), // --line-strong
    ink = Color(0xFF1D1D1F), // --ink
    ink2 = Color(0xFF6E6E73), // --ink-2
    ink3 = Color(0xFF8E8E93), // --ink-3
    putih = Color(0xFFFFFFFF), // --putih
    statusOn = Color(0xFF18794E), // --sukses
    statusOnSoft = Color(0xFFE6F4EC), // --sukses-soft
    statusRisk = Color(0xFFA05A00), // --waspada
    statusRiskSoft = Color(0xFFFFF3E0), // --waspada-soft
    statusLate = Color(0xFFC4142A), // --bahaya
    statusLateSoft = Color(0xFFFDECEC), // --bahaya-soft
    statusDone = Color(0xFF18794E), // --sukses (Selesai)
    statusNeutral = Color(0xFF6E6E73), // --ink-2 (Belum mulai)
    statusInfo = Color(0xFF0A66D6), // --info = --biru
    statusInfoSoft = Color(0xFFE8F1FD), // --info-soft = --biru-soft
    scrim = Color(0xFF000000).copy(alpha = 0.32f), // --scrim
)

/** Tema malam — blok `[data-theme="dark"]` tokens.css (docs/design/08-mode-malam.md). */
val MkColorsGelap: MkColors = MkColors(
    bg = Color(0xFF050506), // --bg
    surface = Color(0xFF131316), // --surface
    surface2 = Color(0xFF19191D), // --surface-2
    fill1 = Color(0xFF212126), // --fill-1
    fill2 = Color(0xFF2C2C32), // --fill-2
    line = Color(0xFF26262C), // --line
    lineStrong = Color(0xFF6C6C73), // --line-strong
    ink = Color(0xFFF5F5F7), // --ink
    ink2 = Color(0xFFAEAEB2), // --ink-2
    ink3 = Color(0xFF8E8E93), // --ink-3
    putih = Color(0xFFFFFFFF), // --putih (tetap)
    statusOn = Color(0xFF3DD47A), // --sukses
    statusOnSoft = Color(0xFF0F2A1C), // --sukses-soft
    statusRisk = Color(0xFFFFB340), // --waspada
    statusRiskSoft = Color(0xFF2E1F06), // --waspada-soft
    statusLate = Color(0xFFFF6B6B), // --bahaya
    statusLateSoft = Color(0xFF3A1214), // --bahaya-soft
    statusDone = Color(0xFF3DD47A), // --sukses (Selesai)
    statusNeutral = Color(0xFFAEAEB2), // --ink-2 (Belum mulai)
    statusInfo = Color(0xFF4DA3FF), // --info = --biru (malam)
    statusInfoSoft = Color(0xFF0B2340), // --info-soft = --biru-soft (malam)
    scrim = Color(0xFF000000).copy(alpha = 0.62f), // --scrim
)

/** Palet mk aktif; disediakan MKTheme. */
val LocalMkColors = staticCompositionLocalOf { MkColorsTerang }

/**
 * Kosakata status — port `ProjectStatus` dari src/lib/project-status.ts + nada info
 * (docs/design/02-warna.md). on=Sesuai jadwal, risk=Perlu perhatian, late=Terlambat,
 * done=Selesai, neutral=Belum mulai, info=informasi netral.
 * Tampilan status selalu warna + ikon + kata.
 */
enum class Status { ON, RISK, LATE, DONE, NEUTRAL, INFO }

/** Salinan palet dengan alias aksen aktif terisi; dipakai `MkTheme.colors`. */
fun MkColors.withAccent(a: MkAccentColors): MkColors = copy(accent = a.text, accentSoft = a.soft)

/** Warna teks status sesuai kosakata (neutral = ink-2 di atas fill-1). */
fun MkColors.statusColor(status: Status): Color = when (status) {
    Status.ON -> statusOn
    Status.RISK -> statusRisk
    Status.LATE -> statusLate
    Status.DONE -> statusDone
    Status.NEUTRAL -> statusNeutral
    Status.INFO -> statusInfo
}
