# Integrasi Fase 0 — catatan parent (Zcode, 8 Oktober 2026 malam)

Swarm 10 agen (T4-A1..A10) selesai; audit T4-A10 dipakai sebagai daftar jahitan. Hasil akhir: **`./gradlew :app:assembleDebug` BUILD SUCCESSFUL** (APK debug ±22 MB, 120 task), `:designsystem:lintDebug` lulus. JDK: Android Studio JBR 25 (`/Applications/Android Studio.app/Contents/jbr`), SDK `~/Library/Android/sdk` (platform 37).

## Perbaikan integrasi parent

1. **Wrapper**: `gradlew`, `gradlew.bat`, `gradle-wrapper.jar` diunduh resmi dari tag gradle **v9.6.0** (AGP 9.4.1 menuntut Gradle ≥9.6); `local.properties` (jalur SDK, di-gitignore).
2. **Kunci versi katalog dikoreksi ke versi nyata** (diverifikasi ke maven.google.com/mavenCentral/portal plugin): agp 9.0.4→**9.4.1**, ksp 2.3.0-2.0.4→**2.3.12** (format KSP2 baru), hilt→**2.60.1**, okhttp/mockwebserver→**5.5.0**, work→**2.12.0**, navigation→**2.9.8**, activity→**1.12.4**, ktlint-plugin→**14.2.0**, + `material-icons-extended 1.7.8` (versi + alias katalog; sebelumnya literal di 2 modul).
3. **Migrasi AGP 9 (Kotlin bawaan)**: plugin `org.jetbrains.kotlin.android` dihapus dari 7 berkas build (root + 6 modul); ekstensi `kotlin { compilerOptions }` tetap.
4. **KSP2**: `arg("room.schemaLocation", …)` DSL lama tidak ada → dipindah ke `android/gradle.properties` sebagai `ksp.arg.room.schemaLocation=core/data/schemas`.
5. **Compose terbaru**: `LocalIndication` (material3) sudah tidak ada → parameter `indication` dihapus dari `clickable` MkButton/MkCard (default lokal tetap); `@file:OptIn(ExperimentalMaterial3Api)` ditambahkan di MkSheet (posisi sebelum `package`).
6. **security-crypto 1.1.0**: `EncryptedSharedPreferences.create` kini eksplisit dua skema (AES256_SIV/AES256_GCM).
7. **Room**: `fallbackToDestructiveMigration(dropAllTables = true)` (API baru); `room-runtime` dinaikkan ke `api` di core:data agar factory Hilt di `:app` melihat `RoomDatabase`.
8. **Jahitan zona A9** (sesuai audit): impor paket penuh `id.co.monitorkarya.designsystem.*` di 4 layar; `MkError`→`ErrorNote`; `EmptyNote(teks=)`; `MkOfflineBanner(terlihat=, onCobaLagi=)`; `MkButton(label=, PRIMARY/M, tanpa full → modifier fillMaxWidth)`; header kartu `MkCard` tanpa `title/subtitle` → teks di dalam kartu; VM: `api.ringkasan().body()` nullable ditangani + impor `JsonObject`; `c.bahaya`→`c.statusLate`; impor `Composable` di PlaceholderTabScreen; ikon DONE `Schedule`→`CheckCircle` (paritas web); `LocalIndication` + `padding` (preview) di designsystem.

## Sisa yang diketahui (peringatan, bukan galat)

- `hiltViewModel` pindah paket (deprecated) — satu baris per 2 berkas, menyusul Fase 1 bersama `LifecycleViewModelComponent` baru.
- `KeyboardOptions(autoCorrect=…)` deprecated → `autoCorrectEnabled` (2 layar).
- `Icons.Outlined.ReceiptLong` → AutoMirrored (MKShell).
- `Locale("in","ID")` deprecated (RingkasanScreen 112) — ganti `Locale.forLanguageTag("id-ID")`.
- `exportSchema=true` akan menulis `core/data/schemas` saat task KSP berjalan penuh (CI).

## Uji perangkat

Belum dijalankan (butuh emulator/perangkat — lihat FASE0.md). Jalur tercepat: buka `android/` di Android Studio → Run `app` di perangkat/emulator → login dengan akun dev (server `https://monitorkarya.tech/`, BASE_URL ada di `app/build.gradle.kts`).
