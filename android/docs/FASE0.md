# Fase 0 — fondasi aplikasi Android native Monitor Karya

Disusun agen T4-A10, 8 Oktober 2026. Status pekerjaan Fase 0 (swarm T4-A1 sampai T4-A10)
pada cabang `codex/kerja`. Sumber rancangan: [`docs/zcode/RANCANGAN-ANDROID-NATIVE.md`](../docs/zcode/RANCANGAN-ANDROID-NATIVE.md)
(khususnya §5 inventaris fase, §6 struktur, §7 pengujian). Indeks laporan per agen:
[`docs/fase0/README.md`](fase0/README.md). Audit silang antar-agen: [`docs/fase0/T4-A10-AUDIT.md`](fase0/T4-A10-AUDIT.md).

> Ringkasan satu kalimat: seluruh berkas Fase 0 sudah ditulis, tetapi **build belum
> dijamin hijau** — ada ketidaksesuaian kontrak di empat layar `:app` dan skrip
> `gradlew` belum dibangkitkan; daftar lengkap dan perbaikannya ada di dokumen audit.

## 1. Peta modul

Enam modul Gradle (dideklarasikan di `settings.gradle.kts`, nama proyek `MonitorKarya`).
Catatan penamaan: rancangan §5 menulis `:core-network` dan sejenisnya; implementasi
memakai jalur bertingkat `:core:network` (mengikuti tata direktori §6) — konsisten
secara internal, cukup diketahui saat merujuk task Gradle.

| Modul | Namespace | Isi | Agen |
| --- | --- | --- | --- |
| `:app` | `id.co.monitorkarya.app` | `MKApp` (Hilt), `MainActivity` (tema aksen/gelap dari `MkPrefs`), `di/AppModule` (satu Retrofit, OkHttp `MkClient`, Room `buatDb`, DataStore `MkPrefs`, `BASE_URL` via BuildConfig), `navigation/MkNavHost` (gerbang sesi: login → ganti sandi wajib → beranda) + `MKShell` (tab bawah per peran dari `ROLE_TABS`), `vm/SesiViewModel`, layar `ui/login`, `ui/ringkasan`, `ui/placeholder`, `res/values/strings.xml` | T4-A8 (kerangka) + T4-A9 (layar) |
| `:designsystem` | `id.co.monitorkarya.designsystem` | `theme/`: `MKTheme` + aksesori `object MkTheme` (`.colors` alias aksen terisi, `.accent`, `.typography`, `.shapes`, `.spacing`), `MkColor` (palet terang/gelap dari tokens.css), `MkAccent` (6 aksen), `MkTypography` (13 gaya, `tnum`), `MkShapes`, `MkSpacing`, `MkMotion` + `MkEasing`, `LocalReducedMotion`, `PreviewGanda`. `components/`: `MkButton`, `MkCard`, `StatusBadge` + `MkStatus`, `StatTile`, `MkChip`, `MkIconBtn`, `MkSheet`, `ProjectRow`, `ActivityItem`, `EmptyNote`, `MkSkeleton`, `ErrorNote` (berkas `MkError.kt`), `MkOfflineBanner` | T4-A2 (tema) + T4-A3 (komponen inti) + T4-A4 (sheet/daftar/keadaan) |
| `:core:network` | `id.co.monitorkarya.core.network` | `MkAuthStore` + `EncryptedAuthStore` (EncryptedSharedPreferences `mk_sesi`), `MkClient` (CookieJar, `X-MK-Client`, tanpa header `Origin`), `mkJson`, `ApiError` (pemetaan kode HTTP → pesan Indonesia), `Factory.buatApi`, `api/AuthApi`, `api/RingkasanApi`, `dto/Dtos` | T4-A5 |
| `:core:data` | `id.co.monitorkarya.core.data` | Room: entitas `proyek`, `daily_report`, `tugas`, `eskalasi`, `outbox` + DAO + `MkDatabase` + `buatDb`; `prefs/MkPrefs` (DataStore `mk_pengaturan`: aksen, tema, `pernahMasuk`, `terakhirSinkron`, `uidTerakhir`) | T4-A6 |
| `:core:domain` | `id.co.monitorkarya.core.domain` | `model/Models` (`Peran`, `PeranPengguna`, `ProyekRingkas`, …), `roles/RoleTabs` (port `ROLE_TABS`/`ROLE_DUTIES` rbac.ts), `status/StatusProyek` (port project-status.ts), `time/Wib` (kunci 17.00 WIB), `usecase/SesiUseCase` | T4-A7 |
| `:core:testing` | `id.co.monitorkarya.core.testing` | Modul kosong — fixture/MockWebServer menyusul bersama pengujian Fase 1 | T4-A1 (scaffold) |

Berkas bersama di luar modul: `settings.gradle.kts`, `build.gradle.kts` root,
`gradle/libs.versions.toml` (satu-satunya tempat versi), `gradle.properties`,
`detekt.yml`, `.editorconfig`, `.gitignore`, `README.md`, `docs/`.

## 2. Kontrak nama lintas agen

Tabel kepemilikan: bila sebuah nama perlu berubah, ubah di zona agennya (atau lewat
keputusan bersama), jangan menimpa dari luar zona. Pola paket: `id.co.monitorkarya.<modul>.<sub>`.

| Berkas / simbol kunci | Letak | Agen pemilik |
| --- | --- | --- |
| `settings.gradle.kts`, `build.gradle.kts` (root + per modul), `gradle/libs.versions.toml`, `gradle.properties`, `detekt.yml`, `android/README.md` | `android/` | T4-A1 |
| `MKTheme`, `MkTheme` (object), `MkColors`/`MkColorsTerang`/`MkColorsGelap`/`withAccent`, `LocalMkColors`, `MkAccent`/`MkAccentColors`/`LocalAccent`, `MkTypography`+`tabular`, `MkShapes`, `MkSpacing`, `MkMotion`/`MkEasing`, `LocalReducedMotion`, `PreviewGanda`/`PreviewTerang`/`PreviewGelap` | `designsystem/…/theme/` | T4-A2 |
| `MkButton`/`MkButtonVariant`/`MkButtonSize`/`mkTekanSkala`, `MkCard`, `MkStatus`/`MkBadgeSize`/`StatusBadge`/`warnaStatus`, `StatTile`/`MkStatVariant`/`MkTrend`/`warnaDelta`, `MkChip`, `MkIconBtn` | `designsystem/…/components/` | T4-A3 |
| `MkSheet`, `ProjectRow`, `ActivityItem`, `EmptyNote`, `MkSkeleton`, `ErrorNote`, `MkOfflineBanner` | `designsystem/…/components/` | T4-A4 |
| `MkAuthStore`/`EncryptedAuthStore`, `MkClient`, `mkJson`, `ApiError`+`dari`+`pesanTampil`, `Factory.buatApi`, `AuthApi`, `RingkasanApi`, DTO | `core/network/` | T4-A5 |
| `MkDatabase`, entitas + DAO, `buatDb`, `MkPrefs` | `core/data/` | T4-A6 |
| `Peran`, `PeranPengguna`, `MkStatusDomain`, `ProyekRingkas`, `LaporanHarian`, `TabId`/`ROLE_TABS`/`tabsUntuk`/`tabAwal`, `ROLE_DUTIES`, `StatusProyek`, `Wib`, `SesiUseCase`/`HasilLogin`/`HasilUbahSandi` | `core/domain/` | T4-A7 |
| `MKApp`, `MainActivity`, `di/AppModule`, `navigation/MkNavHost`+`MKShell`, `vm/SesiViewModel`, `res/values/strings.xml`, `app/build.gradle.kts` (BASE_URL, buildConfig) | `app/` | T4-A8 |
| `ui/login/LoginScreen`+`GantiSandiScreen`, `ui/ringkasan/RingkasanScreen`, `ui/vm/RingkasanViewModel`, `ui/placeholder/PlaceholderTabScreen` | `app/` | T4-A9 |
| `.github/workflows/android.yml` (CI), `docs/FASE0.md`, `docs/fase0/*`, `android/.editorconfig` | luar modul | T4-A10 |

Konvensi yang dikunci Fase 0 (dari laporan-laporan agen, berlaku untuk fase berikutnya):

- Komponen Compose: `modifier: Modifier = Modifier` parameter pertama; pratinjau
  `@PreviewGanda` (terang+gelap); warna hanya lewat `LocalMkColors`/`LocalAccent`
  atau `MkTheme.colors`/`MkTheme.accent` — tidak menyentuh `MaterialTheme.colorScheme`.
- Nama tab layar mengikuti `TabId` (domain); dua penyesuaian peran (`tab_hari_ini`,
  `tab_tim_divisi`) ada di `strings.xml` + `MKShell` (port `tabLabel()` shell.tsx).
- Galat jaringan selalu lewat `ApiError.dari(...)` lalu `pesanTampil()`; string bahasa
  Indonesia, tanpa tanda seru/emoji.
- Sesi: cookie hanya di `EncryptedAuthStore`; klien tidak pernah menyetel `Origin`.
- Versi dependensi hanya berubah di `gradle/libs.versions.toml`.

## 3. Membangun lokal

Prasyarat:

1. JDK 17 (dipakai CI: Temurin 17; seluruh modul mengunci `jvmTarget`/`compileOptions` 17).
2. Android SDK (compileSdk 37, minSdk 26, targetSdk 36) — paling mudah lewat Android Studio.
3. Skrip wrapper `gradlew`/`gradlew.bat` **belum ada di repo**. `gradle-wrapper.jar` dan
   `gradle-wrapper.properties` (Gradle 9.2.0) sudah ada, jadi cukup bangkitkan skripnya
   sekali dari mesin yang punya instalasi Gradle:
   `cd android && gradle wrapper --gradle-version 9.2.0`
   (lihat temuan audit #1 — putuskan apakah wrapper lengkap ikut dikomit).

Perintah:

```sh
cd android
./gradlew :app:assembleDebug          # APK debug (app/build/outputs/apk/debug/)
./gradlew :designsystem:lint          # lint modul designsystem
./gradlew ktlintCheck detekt          # gaya kode seluruh modul
```

CI GitHub Actions (`.github/workflows/android.yml`) menjalankan `:app:assembleDebug`
+ `:designsystem:lint` pada JDK Temurin 17 dengan `gradle/actions/setup-gradle@v4`
dan mengunggah APK sebagai artefak; terpicu oleh perubahan `android/**` atau berkas
workflow itu sendiri. Alur kerja web lama (`ci.yml`) tidak tersentuh.

## 4. Definisi selesai Fase 0 (dari rancangan §5) — status

| Butir | Status | Catatan |
| --- | --- | --- |
| Proyek Gradle multi-modul (`:app`, `:designsystem`, `:core:*`) | Terwujud | 6 modul + katalog versi terkunci (T4-A1) |
| CI terpisah path `android/**` | Terwujud | `android.yml` (T4-A10); jalur pertama butuh `gradlew` dikomit |
| Tema + komponen inti (7 komponen pertama) | Terwujud + lebih | 13 komponen + tema/token penuh terang/gelap/6 aksen (T4-A2/A3/A4) |
| Login + ganti sandi wajib + sesi aman + logout | Terwujud | Layar (A9) + gerbang navigasi (A8) + use case (A7) + cookie terenkripsi (A5) |
| Kerangka navigasi per peran (tab bawah) | Terwujud | `MKShell` + `ROLE_TABS` port persis rbac.ts |
| Layar galat/luring/kosong | Terwujud | `ErrorNote`, `MkOfflineBanner`, `EmptyNote`, `MkSkeleton` |
| Error mapper bahasa Indonesia | Terwujud | `ApiError` + `pesanTampil()` |
| **Kompilasi hijau** | **Belum** | 4 layar `:app` masih memakai kontrak lama (lihat audit #2–#8) |
| Unit test dasar | Belum | Tanpa rangka uji di Fase 0; masuk Fase 1 (§7) |

## 5. Yang menunggu Fase 1 (dan pemiliknya)

Fungsional (rancangan §5 — MVP PIC): meja kerja, isi laporan harian (satu dan
multi-proyek), draf/kirim + validasi ramah, tambah progres tugas, unggah/hapus bukti
(+kompres gambar), status dan riwayat proyek, ajukan buka kunci, toast "Urungkan",
notifikasi dalam aplikasi. Punggungnya di `:core:data` (outbox + WorkManager sudah
disiapkan entitas/DAO-nya oleh A6) dan DTO `RingkasanApi` yang masih `JsonObject` mentah.

Non-fungsional yang belum selesai dari Fase 0:

1. Perbaikan impor/parameter di 4 layar `:app` dan `RingkasanViewModel` (daftar di audit).
2. `gradlew`/`gradlew.bat` dikomit (atau keputusan tertulis wrapper dibangkitkan per mesin).
3. `material-icons-extended` dipindah ke katalog versi (kini literal di dua build.gradle.kts).
4. Pengujian: unit (repository/outbox/viewmodel dengan MockWebServer), UI Compose,
   Maestro E2E ke staging (rancangan §7) — sekaligus mengisi `:core:testing`.
5. Ikon launcher + tema res XML (label kini `@string/app_name`, ikon masih bawaan).
6. URL staging untuk build type debug (kini debug memakai `BASE_URL` produksi).
7. `room.schemaLocation` untuk ekspor skema Room (catatan A6).
8. Keputusan desain terbuka kecil: ikon status `DONE` (jam vs centang, catatan A3),
   label `INFO` ("Diingatkan" vs "Informasi"), jembatan `MkStatusDomain` ↔ `MkStatus`.

Backend pendamping (tugas Zcode di server, bukan repo Android): header `X-MK-Client`,
parameter `berubahSejak` untuk tiga daftar utama, akun uji `uji-android@…`.


## Status akhir 8 Okt 2026 (parent)

- `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL** (APK debug ±22 MB); `:designsystem:lintDebug` lulus; JDK = Android Studio JBR, SDK 37.
- Versi katalog dikoreksi ke rilis nyata (AGP 9.4.1, Gradle 9.6.0, KSP 2.3.12, Hilt 2.60.1, dst) — rincian di [fase0/PARENT-INTEGRASI](fase0/PARENT-INTEGRASI.md).
- Semua blokir audit T4-A10 selesai; sisa = peringatan deprekasi kecil (dicatat di PARENT-INTEGRASI).
- Uji perangkat/emulator + login sungguhan menyusul (Android Studio Run, atau artefak CI).
