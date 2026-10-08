# Laporan T4-A4 — Komponen sheet, baris daftar, keadaan kosong/galat/luring (Fase 0)

Tanggal: 8 Oktober 2026 · Zona: `android/designsystem/` (komponen + laporan ini) · Tanpa git, jaringan, DB, atau Gradle sesuai instruksi.

## Berkas yang ditulis

`android/designsystem/src/main/kotlin/id/co/monitorkarya/designsystem/components/`:

| Berkas | API publik | Perilaku |
| --- | --- | --- |
| `MkSheet.kt` | `MkSheet(modifier, visible, onTutup, judul, subjudul?, backLabel?, footer: RowScope.()->Unit = {}, konten: ColumnScope.()->Unit)` | `<840dp` → `ModalBottomSheet` M3: scrim token `MkColors.scrim`, dragHandle kecil 28×4 `fill-2` pill, `skipPartiallyExpanded`, `backLabel` jadi tombol teks kiri-atas. `≥840dp` → `Dialog` custom (`usePlatformDefaultWidth=false`) menempel kanan: lebar 440dp (token sheet-w), tinggi mengikuti isi (maks 92% layar), latar `surface` radius `MkShapes.sheet`, scrim klik menutup, panel mengonsumsi ketukan. Masuk via `Animatable` fade + skala 0.98→1 selama `MkMotion.Base` (250 ms) kurva `MkEasing.Standard`; `LocalReducedMotion` → langsung tampil tanpa skala. Panel `IsiSheet` (privat) dipakai dua ragam: judul `title3` (semantics heading) + subjudul footnote ink-2, konten dapat digulir, footer Row gap space-3. |
| `ProjectRow.kt` | `ProjectRow(modifier, nama, divisi, entitas?, progres: Int, status: MkStatus, pic: String?, compact, dipilih, onClick?)` | Kiri: nama `bodyStrong` + subjudul "divisi · entitas" footnote ink-2. Tengah (hilang saat `compact`): trek 4dp `fill-2` pill + isian `warnaStatus(status)` (fungsi publik StatusBadge) + persen `bodyStrong.tabular`. Kanan: avatar lingkaran 32dp (latar `LocalAccent.soft`, huruf `LocalAccent.text`) + nama `caption`; `StatusBadge(size = MkBadgeSize.SM)`; PIC kosong → "PIC belum ditentukan" inisial "—". `dipilih` → latar accent-soft; radius `MkShapes.md`; target sentuh ≥44dp. |
| `ActivityItem.kt` | `ActivityItem(modifier, who, action, waktu, terakhir = false)` | Rel kiri (lebar 12dp): lingkaran 10dp `LocalAccent.fill` + garis 2dp `line` (`fillMaxHeight`, `IntrinsicSize.Min`; `terakhir` tanpa garis). Isi: `who` SpanStyle SemiBold inline + `action` `body`; waktu `footnote.tabular` ink-2. |
| `EmptyNote.kt` | `EmptyNote(modifier, teks, done = false, ikon: ImageVector?, teksAksi?, onAksi?)` | Ikon 44dp ink-2 (alpha 0.9), default `Icons.Outlined.Inbox`; `done` → `CheckCircle` warna `statusOn`. Teks body ink-2 tengah; aksi → `MkButton(SECONDARY, S)`. |
| `MkSkeleton.kt` | `MkSkeleton(modifier, tinggi = 16.dp, lebar: Dp? = null)` | Box `MkShapes.sm` (10) `fill-1`; alpha 0.55↔1.0 1200 ms `RepeatMode.Reverse`; `LocalReducedMotion` → statis 1.0. `lebar` null → fillMaxWidth. |
| `MkError.kt` | `ErrorNote(modifier, pesan, onCobaLagi?)` | Ikon `Icons.Outlined.Error` warna `statusLate`, pesan body, `MkButton("Coba lagi", PRIMARY, S)`; `liveRegion Assertive` — padanan `role="alert"` web. |
| `MkOfflineBanner.kt` | `MkOfflineBanner(modifier, terlihat, onCobaLagi)` | Baris `fill-1` radius `MkShapes.md`: `Icons.Outlined.WifiOff` 18dp ink-2 + teks "Anda sedang luring — data terakhir masih terbaca" + `MkButton("Coba lagi", PLAIN, S)`. Muncul `animateFloatAsState` alpha + translateY 12dp 250 ms `MkEasing.Standard`; reduced motion → alpha saja. Setelah alpha ≈ 0 isi dilepas agar tidak dapat diketuk saat tersembunyi. |

Konvensi yang diikuti: modifier selalu parameter pertama; import eksplisit tanpa wildcard; komentar Indonesia ringkas; pratinjau memakai `@PreviewGanda` (terang+gelap) dari `theme/PreviewGanda.kt` dibungkus `MKTheme`; warna via `LocalMkColors.current` + `LocalAccent.current`, tipografi `MkTypography` (+ ekstensi `.tabular`), radius `MkShapes`, jarak `MkSpacing`, durasi/kurva `MkMotion`/`MkEasing` — semua milik T4-A2, tidak ada nilai hex/px karangan di berkas ini (pengecualian terdokumentasi: 440dp sheet-w, 840dp breakpoint, ukuran ikon/avatar/dragHandle, padding baris 10–14 sesuai docs/design/05).

## Penyelarasan dengan fondasi (T4-A2) — sudah disesuaikan

Draf awal ditulis sebelum berkas T4-A2/A3 muncul di worktree; setelahnya ketujuh berkas ditulis ulang terhadap API nyata: `LocalMkColors`/`LocalAccent` (bukan `MkTheme.colors`), `MkTypography` object, `MkStatus` + `MkBadgeSize.SM` + `warnaStatus()` publik dari `StatusBadge.kt`, `MkButton(label, variant = PRIMARY|SECONDARY|PLAIN, size = M|S)`, `MKTheme`, `MkShapes/MkSpacing/MkMotion/MkEasing`, `LocalReducedMotion` dari paket `theme`.

## Temuan untuk parent/integrasi

1. **`MkPreviewTheme` belum ada** — `MkButton.kt`, `MkCard.kt`, `StatTile.kt`, `StatusBadge.kt` memanggil `MkPreviewTheme(gelap = ...)` tetapi tidak ada berkas yang mendefinisikannya (A2 hanya membuat `PreviewTerang`/`PreviewGelap`/`@PreviewGanda`). Berkas T4-A4 tidak memakainya (pakai `@PreviewGanda` + `MKTheme`) sehingga zona ini mandiri; helper itu tetap perlu ditambahkan atau panggilannya diganti di empat berkas lain.
2. **Impor paket `motion` bercabang** — `MkButton.kt` mengimpor `id.co.monitorkarya.designsystem.motion.LocalReducedMotion`/`MkEasing`, padahal T4-A2 meletakkannya di paket `theme` (`MkMotion.kt`, `LocalReducedMotion.kt`); paket `motion` tidak ada → `MkButton.kt` saat ini tidak akan terkompilasi. Berkas T4-A4 memakai jalur `theme` yang ada.
3. **`material-icons-extended` belum di `designsystem/build.gradle.kts`** — `StatusBadge.kt` (T4-A3?) memakai ikon extended (`Schedule`, `NotificationsActive`, `Circle`) dan T4-A4 memakai `Inbox` serta `WifiOff`; keduanya tidak ada di set inti. Perlu ditambahkan `androidx.compose.material:material-icons-extended` (atau ganti ikon-ikon itu).
4. Pratinjau `MkSheet` merender panel `IsiSheet` langsung karena `Dialog`/`ModalBottomSheet` tidak dirender oleh @Preview statis.

## Keputusan desain

- Bottom sheet M3 membawa animasi sistemnya sendiri; reduced motion ragam itu mengikuti setelan "hapus animasi" OS, sedangkan perlakuan reduced motion eksplisit (fade/skala dimatikan) diterapkan penuh pada ragam dialog ≥840dp.
- `MkOfflineBanner` tetap menempati ruang layout saat tersembunyi (hanya memudar + bergeser); induk dapat menaruhnya kondisional bila ingin ruang runtuh.
- `ActivityItem` Android memakai lingkaran kecil aksen (bukan avatar inisial web) sesuai spesifikasi tugas; avatar inisial 32dp tetap di `ProjectRow`.
- `ErrorNote` memakai tombol utama (setara web `Button` default) dan `EmptyNote` tombol sekunder, keduanya ukuran S.
- Verifikasi hanya tinjauan kode (Gradle dilarang tahap ini).
