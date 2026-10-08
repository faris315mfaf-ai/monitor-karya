# T4-A3 — Komponen inti designsystem (Fase 0)

Tanggal: 8 Oktober 2026 · Agen: T4-A3 · Zona: `android/designsystem/` saja (tanpa git, tanpa jaringan, tanpa DB, tanpa gradle).

## Hasil

Enam komponen Compose di `android/designsystem/src/main/kotlin/id/co/monitorkarya/designsystem/components/`:

| Berkas | Isi | Nama kontrak |
| --- | --- | --- |
| `MkButton.kt` | `MkButton`, `MkButtonVariant{PRIMARY,SECONDARY,PLAIN}`, `MkButtonSize{M,S}`, helper internal `mkTekanSkala()` | `MkButton` |
| `MkCard.kt` | `MkCard(padding: Dp = MkSpacing.space5, onClick: (() -> Unit)?)` — surface, radius kartu 22, garis 1dp line, ripple terpotong sudut | `MkCard` |
| `StatusBadge.kt` | `MkStatus{ON,RISK,LATE,DONE,NEUTRAL,INFO}`, `MkBadgeSize{MD,SM}`, `StatusBadge`, `warnaStatus()` | `MkStatus`, `StatusBadge` |
| `StatTile.kt` | `StatTile`, `MkStatVariant{INSET,SURFACE}`, `MkTrend{UP,DOWN,FLAT}`, `warnaDelta()` | `StatTile` |
| `MkChip.kt` | `MkChip` — pill fill1 36dp, terpilih ink+surface, titik status opsional, lencana jumlah | `MkChip` |
| `MkIconBtn.kt` | `MkIconBtn` — lingkaran 44dp transparan, ikon 20dp, tekan 0.94 | `MkIconBtn` |

Sumber acuan: `src/components/mk/core.tsx`, `design-system/components/index.d.ts`, `docs/design/10-komponen.md`, `design-system/tokens.css`, `design-system/components/bundle.css`.

## Rekonsiliasi dengan agen paralel (penting)

Saat tugas dimulai direktori `android/` masih kosong; selama pengerjaan T4-A1/T4-A2 (dan lainnya) mengisi tema. Semua berkas telah **ditulis ulang mengikuti kontrak asli** hasil T4-A1/T4-A2:

- Warna dari `theme.LocalMkColors` (`MkColor.kt`); tombol primer memakai `theme.LocalAccent` (`fill`/`on`/`text` — aksen dinamis, `MkColors` tidak punya `accentFill`/`onAccent`).
- Latar lembut lencana memakai token `statusOnSoft`/`statusRiskSoft`/`statusLateSoft`/`statusInfoSoft` (DONE memakai `statusOnSoft`, NEUTRAL `fill1` — sesuai catatan `MkColor.kt`).
- Gerak: `theme.MkEasing.Standard`, durasi `theme.MkMotion.Fast` (150ms), `theme.LocalReducedMotion`.
- Tipografi/bentuk/jarak dari token: `MkTypography.bodyStrong` (label tombol), `.callout` (chip), `.footnote`/`.caption` (lencana, delta), `.title2.tabular` (angka KPI); `MkShapes.penuh`/`.kartu`/`.md`; `MkSpacing.space1/2/3/4/5`.
- Pratinjau memakai `@PreviewGanda` + `MKTheme` dari `theme/PreviewGanda.kt` (terang+gelap otomatis). Berkas sementara `MkPreview.kt` telah dihapus.
- `designsystem/build.gradle.kts`: ditambah satu baris `implementation("androidx.compose.material:material-icons-extended")` (versi via compose BOM) — `Schedule`, `NotificationsActive`, `Circle`, `Error`, `ArrowUpward`, `ArrowDownward` tidak ada di icons-core. T4-A1 boleh memindahkannya ke alias `libs.versions.toml`.

Verifikasi silang: semua pemanggil di dalam modul designsystem (`MkSheet`, `MkError`, `EmptyNote`, `MkOfflineBanner`, `ProjectRow`) dan `RingkasanScreen` sudah cocok dengan kontrak ini (`label=`, `MkButtonVariant.PLAIN/SECONDARY`, `MkButtonSize.S`, `MkStatus.*`, `MkBadgeSize.SM`, `StatTile(label=, value=, modifier=)`, `StatusBadge(status=, text=)`, `warnaStatus(status=)`).

## Perilaku (sesuai spesifikasi tugas)

- Semua komposable: `modifier: Modifier = Modifier` posisi pertama; komentar Indonesia minimal; import eksplisit tanpa wildcard; ikon dari `androidx.compose.material.icons` (Outlined).
- Tekan berskala — tombol 0.97, chip 0.96, ikon 0.94: `animateFloatAsState` + `collectIsPressedAsState`, tween `MkMotion.Fast` kurva `MkEasing.Standard`; target 1f saat `LocalReducedMotion` (nonaktif total). Dibagikan lewat `mkTekanSkala()` (internal, di `MkButton.kt`).
- MkButton: PRIMARY = `aksen.fill` + `aksen.on`; SECONDARY = surface + border 1dp line + teks ink; PLAIN = transparan + `aksen.text`. M=44dp, S=36dp, kapsul, label 15sp SemiBold (`bodyStrong`); `enabled=false` → alpha 0.4 tanpa klik.
- StatusBadge: pill penuh tinggi 28 (MD) / 24 (SM); titik warna 6dp + ikon material + kata selalu bersama. Label tetap: Sesuai jadwal / Perlu perhatian / Terlambat / Selesai / Belum mulai / Diingatkan (INFO = "Diingatkan" per spesifikasi; web "Informasi").
- StatTile: label footnote ink2; nilai `title2.tabular` (28sp Bold, tnum); delta footnote SemiBold + panah opsional. `warnaDelta(trend, tone)`: UP→statusOn, DOWN→statusRisk, datar→statusNeutral; `tone` menimpa. INSET = fill1/radius md/padding 16 (bawaan); SURFACE = surface/radius kartu/border 1dp/padding 20.
- Ripple: `LocalIndication` di MkButton & MkCard (terpotong karena `clip` sebelum `clickable`); MkChip/MkIconBtn `indication = null` (umpan balik = skala tekan, paritas web).
- MkChip: semantic `selected` (setara aria-pressed); `count: Any?` (angka/teks "99+"); jumlah tampil termasuk 0.

## Keputusan desain untuk dikonfirmasi integrator

1. **Pemetaan ikon status posisional** sesuai urutan spesifikasi: ON=`CheckCircle`, RISK=`Error`, LATE=`Warning`, DONE=`Schedule`, NEUTRAL=`Circle`, INFO=`NotificationsActive`. Catatan: `Schedule` untuk DONE menyimpang dari web (done=centang; web: on=centang, risk=segitiga, late=jam). Bila ingin paritas web, cukup tukar `ikon` pada baris enum `MkStatus` di `StatusBadge.kt`.
2. **Delta turun** → `statusRisk` sesuai palet spesifikasi (statusOn/Risk/Neutral); web memakai `bahaya` untuk delta turun. Paritas web: ganti satu baris `MkTrend.DOWN -> warna.statusLate` di `warnaDelta()`.
3. **SECONDARY tombol** = surface + border line (spesifikasi Android); web memakai fill-1 tanpa border.
4. StatTile `value: Any` setara web (`number | string`); pemanggil memformat angka id-ID sebelum mengirim string.

## Ketidaksesuaian modul `app` (zona T4 lain — perlu direkonsiliasi pemiliknya)

`LoginScreen.kt` dan `GantiSandiScreen.kt` memanggil kontrak lama yang tidak ada: import `designsystem.components.*` (paket benar: `id.co.monitorkarya.designsystem.components`), `MkCard(title=, subtitle=)`, `MkButton(text=, full=)`, `MkButtonVariant.Primary`, `MkButtonSize.Md`. Kontrak final: `MkButton(label=)` + `Modifier.fillMaxWidth()` untuk lebar penuh, enum SCREAMING_SNAKE, `MkButtonSize.M/S`, `MkCard(padding=, onClick=)` dengan judul bagian dari `content`.

## Verifikasi

- Belum dikompilasi (gradle dilarang pada tugas ini). Semua import telah dicocokkan manual dengan berkas tema T4-A1/T4-A2 yang ada.
- Tanpa hex/px baru di komponen (semua dari `MkColors`/`LocalAccent`/`MkTypography`/`MkShapes`/`MkSpacing`); angka dp tersisa hanya ukuran struktur komponen (tinggi 44/36/28/24dp, ikon 20dp, titik 6/8dp) yang memang ditetapkan spesifikasi tugas.
