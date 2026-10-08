# T4-A2 — Tema & token desain (modul designsystem Android)

Tanggal: 8 Oktober 2026 · Cabang: `codex/kerja` · Status: selesai (verifikasi kompilasi menyusul; gradle dilarang pada tugas ini).

Sumber nilai: `design-system/tokens.css` (dibaca lengkap) + `docs/design/02-warna.md`, `04-tipografi.md`, `08-mode-malam.md`. Semua hex dicek otomatis terhadap tokens.css: 56/56 nilai Kotlin ditemukan persis di tokens.css, tidak ada hex yang dikarang.

## Berkas yang dibuat

`android/designsystem/src/main/kotlin/id/co/monitorkarya/designsystem/theme/` (paket `id.co.monitorkarya.designsystem.theme`):

| Berkas | Isi |
| --- | --- |
| `MkColor.kt` | `data class MkColors` + `MkColorsTerang` (blok `:root`/`[data-theme=light]`) + `MkColorsGelap` (blok `[data-theme=dark]`) + `LocalMkColors`. |
| `MkAccent.kt` | `enum MkAccent {MERAH,BIRU,HIJAU,UNGU,ORANYE,GRAFIT}`, `data class MkAccentColors(text,fill,soft,on)`, `terang()/gelap()/colors(darkTheme)`, `LocalAccent`. |
| `MkTypography.kt` | `object MkTypography` (13 gaya `--text-*` persis) + ekstensi `TextStyle.tabular` ("tnum") + `mkMaterialTypography()`. |
| `MkShapes.kt` | `object MkShapes` (xs 6, sm 10, md 14, kartu 22, sheet 28, penuh pill) + `mkMaterialShapes()`. |
| `MkSpacing.kt` | `object MkSpacing` (space1 4 … space16 64; objek statis, tanpa CompositionLocal sesuai spesifikasi). |
| `MkMotion.kt` | `object MkMotion` (Fast 150, Base 250, Slow 400, Data 600 ms) + `object MkEasing` (Standard, Spring, Exit). |
| `LocalReducedMotion.kt` | `CompositionLocal<Boolean>` default `false`. |
| `MKTheme.kt` | `@Composable MKTheme(darkTheme, accent, reducedMotion, content)` → Material3 colorScheme/typography/shapes + `CompositionLocalProvider(LocalMkColors, LocalAccent, LocalReducedMotion)`; plus `object MkTheme` (aksesor `.colors/.accent/.typography/.shapes/.spacing`). |
| `PreviewGanda.kt` | Anotasi multipreview `@PreviewGanda` (terang+gelap) + wrapper `PreviewTerang`/`PreviewGelap` menerima content. |
| `../motion/MkMotion.kt` | Fasad kompatibilitas `designsystem.motion` (lihat Integrasi lintas agen). |

## Pemetaan token → berkas

| Token | Tujuan |
| --- | --- |
| `--bg --surface --surface-2 --fill-1 --fill-2 --line --line-strong --ink --ink-2 --ink-3 --putih` | `MkColors.bg surface surface2 fill1 fill2 line lineStrong ink ink2 ink3 putih` |
| `--sukses(-soft) --waspada(-soft) --bahaya(-soft)` | `statusOn(OnSoft) statusRisk(RiskSoft) statusLate(LateSoft)`; `statusDone` = `--sukses` (Selesai berbagi token dengan on, sesuai docs 02 & `project-status.ts`) |
| `--ink-2` (teks) + `--fill-1` (latar) | `statusNeutral` — tidak ada token soft khusus; komponen memakai `fill1` sebagai latar |
| `--info --info-soft` (= `--biru(-soft)`) | `statusInfo statusInfoSoft` |
| `--scrim` | `MkColors.scrim` (hitam alpha 0.32 terang / 0.62 gelap) |
| `--accent --accent-fill --accent-soft --on-accent` per `data-accent` × 2 tema | `MkAccentColors.text fill soft on` (`terang()`/`gelap()`); grafit malam: fill `#E5E5EA`, on = `--on-grafit` `#1D1D1F` |
| `--focus` | `MkAccentColors.focus` (= `text`; nilai token fokus identik warna teks aksen di kedua tema) |
| `--text-display-xl … --text-code` (13 gaya) | `MkTypography.displayXl largeTitle title1 title2 title3 headline bodyLg body bodyStrong callout footnote caption code` (tracking em persis: −0.03 … +0.01) |
| `--radius-xs sm md lg xl full` | `MkShapes.xs sm md kartu sheet penuh` (999px → `RoundedCornerShape(50)` = pill) |
| `--space-1,2,3,4,5,6,8,10,12,16` | `MkSpacing.space1 … space16` |
| `--dur-fast/base/slow/data` | `MkMotion.Fast Base Slow Data` |
| `--ease-standard/spring/exit` | `MkEasing.Standard Spring Exit` |

## Tambahan di luar daftar minimum spesifikasi (nilai tetap 100% dari token)

- `MkColors`: `lineStrong`, `putih`, empat `status*Soft`, `scrim` — dibutuhkan pemetaan Material (`outline`, `errorContainer`, `scrim`) dan komponen StatusBadge (web memakai `sukses-soft` dst. di `bundle.css`); tanpa ini komponen akan tergoda mengarang warna.
- `MkAccentColors.text` — alias `--accent` (teks/ikon/garis) wajib dibedakan dari `fill` di mode malam (mis. merah `#FF6961` vs `#E0242F`).
- `MkEasing.Exit` — token `--ease-exit` ada di bundle; dipakai elemen keluar layar (Sheet).
- `MkAccentColors.focus` — token `--focus` (nilai = teks aksen).

## Pemetaan Material3

- colorScheme: `primary`=accent-fill · `onPrimary`=on-accent · `primaryContainer`=accent-soft · `onPrimaryContainer/inversePrimary`=accent · `secondary`=fill-1 · `tertiary`=sukses+sukses-soft · `background/surface`=bg/surface · `surfaceVariant`=surface-2 · `onSurfaceVariant`=ink-2 · `error`=bahaya · `errorContainer`=bahaya-soft · `outline`=line-strong · `outlineVariant`=line · `inverseSurface/inverseOnSurface`=ink/bg · `scrim`=scrim. Komponen mk tetap membaca `LocalMkColors`/`LocalAccent`; colorScheme hanya menjaga komponen Material bawaan.
- Typography: displayLarge=displayXl · displayMedium=largeTitle · displaySmall=title1 · headlineLarge=title2 · headlineMedium=title3 · headlineSmall=headline · titleLarge=title3 · titleMedium=bodyStrong · titleSmall/labelLarge=callout · bodyLarge=bodyLg · bodyMedium=body · bodySmall=footnote · labelMedium/labelSmall=caption (skala mk tidak punya 11sp dan aturan melarang <12).
- Shapes: extraSmall/small/medium/large/extraLarge = xs/sm/md/kartu/sheet.

## Tidak terport + alasan (sesuai instruksi: aurora/gradien/glass → fase berikut)

| Token | Alasan / tujuan |
| --- | --- |
| `--aurora` (+ `--nebula` versi pekat dari docs 08) | Latar layar bercahaya per aksen; perlu `Brush.radialGradient` mengikuti aksen aktif — fase latar/navigasi berikutnya. |
| `--grad-merah, grad-merah-teks, grad-senja, grad-fajar, grad-laut, grad-daun, grad-malam`, `--kilau` | Gradien dekoratif (logo, kartu sorotan, cincin) — fase komponen bergradien (`Brush`). |
| `--glass, glass-tipis, glass-tebal, glass-sorot` | Material kaca + `blur 20px`; di Compose blur mahal dan perlu keputusan implementasi — fase tab bar/dock. |
| `--shadow-card/float/sheet/control/glow` | Bayangan CSS berlapis ≠ elevasi Compose; diputuskan per komponen (kartu, sheet, segmented, kartu gradien) pada fase komponen. |
| `--data-1..6, chart-idle, chart-grid` | Warna seri grafik — Fase 3 grafik; perlu objek `MkDataColors` terang+gelap. |
| `--merah-cerah, biru/hijau/ungu/oranye/grafit-cerah, --accent-cerah` | Titik awal gradien dekoratif — ikut fase gradien. |
| `--merah-tua, --merah-dalam` | Keadaan ditekan tombol primer & gradien teks-aman. Catatan desain: token hanya ada untuk merah — aksen lain perlu keputusan (gelapkan fill atau tidak) saat komponen Button dibuat. |
| `--font-display/sans/mono` (SF Pro → Geist) | Aset huruf tidak dapat diunduh (tugas tanpa jaringan). Sementara `FontFamily.Default`/`Monospace` (Roboto). Bundel Geist + Geist Mono saat aset tersedia, lalu ganti tiga val privat di `MkTypography`. |
| `--sidebar-w --content-max --sheet-w --tabbar-h --touch-min --bp-* --z-*` | Token tata letak/navigasi, bukan tema — milik tugas kerangka navigasi (ingat `touch-min` 44dp untuk komponen). |

## Catatan untuk tugas berikutnya

- Komponen membaca warna dari `LocalMkColors.current` / `LocalAccent.current`; tidak menyentuh `MaterialTheme.colorScheme` untuk warna mk.
- Angka/KPI memakai `MkTypography.title2.tabular` (fontFeatureSettings "tnum").
- Lencana status: teks `statusOn/Risk/Late/Info` di atas `status*Soft`; neutral = `statusNeutral` di atas `fill1`; selalu warna+ikon+kata.
- Pratinjau komponen: anotasi `@PreviewGanda` (multipreview terang+gelap); `PreviewTerang/PreviewGelap` adalah wrapper — `@Preview` pada fungsi berparameter tidak dirender langsung Android Studio, jadi utamakan `@PreviewGanda` pada fungsi pratinjau konkrit; uji juga Grafit.
- Verifikasi kompilasi belum dijalankan (gradle dilarang pada tugas ini) — jalankan di CI/tugas scaffold build.

## Integrasi lintas agen (kontrak untuk komponen)

Komponen T4 lain sedang ditulis paralel dan membaca tema lewat `MkTheme.colors.*` / `MkTheme.typography.*` / `Status` / `motion.LocalReducedMotion` / `motion.MkEasing`, sambil membungkus pratinjau dengan `MKTheme(...)`. Agar modul designsystem menyatu tanpa menunggu penggabungan, tema menyediakan (nilai tetap 100% token):

- `object MkTheme` di `MKTheme.kt` — aksesor `@Composable` ala MaterialTheme: `colors`, `accent`, `typography`, `shapes`, `spacing`. `MkTheme.colors` mengembalikan palet aktif yang sudah disuntik alias aksen.
- `enum Status {ON, RISK, LATE, DONE, NEUTRAL, INFO}` di `MkColor.kt` — kosakata `ProjectStatus` (src/lib/project-status.ts) + nada info; tersedia juga `MkColors.statusColor(status)` sebagai pemetaan token yang benar.
- `MkColors.accent` + `MkColors.accentSoft` — field dinamis (default `Color.Unspecified`) yang diisi `withAccent()` oleh `MkTheme.colors`; `MkColorsTerang/MkColorsGelap` statis tidak memilikinya. Aksen lengkap (fill/on/focus) tetap lewat `LocalAccent`/`MkTheme.accent`.
- Fasad paket `designsystem.motion` (`motion/MkMotion.kt`) — hanya meneruskan `theme.LocalReducedMotion` (CompositionLocal yang sama, TIDAK diduplikasi) dan `theme.MkEasing` untuk `MkButton.kt` yang mengimpor `motion.*`. Komponen baru impor langsung dari `designsystem.theme`; fasad boleh dilepas setelah impor MkButton disatukan.

Dua catatan untuk pemilik berkas komponen (bukan zona T4-A2):

- `ProjectRow.kt`: `Status.NEUTRAL/INFO -> MkTheme.colors.accent` tidak sesuai token — seharusnya `statusNeutral` (ink-2 di atas fill-1) dan `statusInfo`; bisa juga langsung `MkTheme.colors.statusColor(status)`.
- `MkButton.kt`: ganti impor `designsystem.motion.*` ke `designsystem.theme` bila fasaid ingin dilepas.
