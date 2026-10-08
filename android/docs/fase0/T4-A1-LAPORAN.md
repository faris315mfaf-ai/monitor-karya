# Laporan T4-A1 — Skeleton Gradle multi-modul `android/`

Disusun agen T4-A1, 8 Oktober 2026. Acuan: `docs/zcode/RANCANGAN-ANDROID-NATIVE.md` §1 (versi terkunci) dan §6 (struktur modul). Hanya berkas di bawah `android/` yang ditulis; gradle/java tidak dijalankan (pembangunan oleh parent).

## Berkas dibuat

| Berkas | Isi |
|---|---|
| `android/settings.gradle.kts` | pluginManagement (google + mavenCentral + gradlePluginPortal), dependencyResolutionManagement FAIL_ON_PROJECT_REPOS, rootProject.name `MonitorKarya`, include 6 modul |
| `android/build.gradle.kts` | Root: alias plugin apply false (agp application+library, kotlin-android, kotlin-compose, kotlin-serialization, ksp, hilt, ktlint) + dokumentasi konstanta SDK |
| `android/gradle/libs.versions.toml` | Katalog versi terkunci lengkap (lihat bawah) |
| `android/gradle.properties` | jvmargs -Xmx4g, useAndroidX, kotlin.code.style=official, configuration-cache, nonTransitiveRClass |
| `android/gradle/wrapper/gradle-wrapper.properties` | Gradle 9.2.0 bin; **jar wrapper sengaja tidak dibuat** |
| `android/.gitignore` | .gradle, build, local.properties, *.apk, *.aab, .idea |
| `android/detekt.yml` | Config ringan: kompleksitas aktif threshold wajar, formatting nonaktif (ktlint yang memformat) |
| `android/README.md` | Cara buka di Android Studio, JDK 17+, wrapper via `gradle wrapper`, `./gradlew :app:assembleDebug` |
| `android/app/` | `build.gradle.kts` (application, namespace `id.co.monitorkarya.app`, compose+hilt+ksp), `proguard-rules.pro`, `src/main/AndroidManifest.xml` (MKApp + MainActivity LAUNCHER) |
| `android/designsystem/` | `build.gradle.kts` (library, compose), manifest kosong |
| `android/core/network/` | `build.gradle.kts` (library, serialization), manifest kosong |
| `android/core/data/` | `build.gradle.kts` (library, ksp+room+hilt), manifest kosong |
| `android/core/domain/` | `build.gradle.kts` (library, serialization), manifest kosong |
| `android/core/testing/` | `build.gradle.kts` (library, fixture+alat uji `api`), manifest kosong |

## Keputusan

1. **Versi terkunci** persis sesuai tugas: agp 9.0.4, kotlin 2.3.0, ksp 2.3.0-2.0.4, composeBom 2026.09.00, activityCompose 1.11.0, navigationCompose 2.9.5, lifecycle 2.9.4, hilt 2.57.2, hiltNavigationCompose 1.3.0, retrofit 3.0.0, okhttp/mockwebserver 5.3.0, kotlinxSerializationJson 1.9.0, retrofit2-kotlinx-serialization-converter 1.0.0, room 2.8.4, datastore 1.1.7, securityCrypto 1.1.0, workRuntime 2.10.4, coroutines 1.10.2, junit 4.13.2, turbine 1.2.1, ktlintPlugin 12.3.0, detekt 1.23.7, androidxCore 1.17.0. Tanpa appcompat. Satu-satunya tempat ubah versi = katalog.
2. **Konstanta SDK** compileSdk 37 / minSdk 26 / targetSdk 36 dipakai angka langsung per modul, didokumentasikan di root `build.gradle.kts`, katalog, dan README. targetSdk hanya di `:app` (library tidak relevan).
3. **Matriks plugin per modul**: compose → app+designsystem; serialization → core:network+core:domain; ksp+room+hilt → core:data; ktlint+detekt → semua. `JvmTarget` JVM 17 + `compileOptions` 17 di semua modul — uji unit berjalan di JVM 17.
4. **Dependensi antar modul**: app→semua; core:data `api(core:domain)` + `core:network`; core:network `api(core:domain)` (mapper menghasilkan model domain); testing `api` fixture domain+network+alat uji (junit, turbine, mockwebserver, coroutines-test, serialization-json). `designsystem` sengaja tanpa dependensi modul lain agar bisa dipakai pratinjau terisolasi.
5. **`allowBackup=false`** di manifest app (§8: cookie sesi tidak ikut backup); label sementara literal "Monitor Karya" (pindah ke `strings.xml` saat A8 membuat res).
6. **Manifest app tanpa atribut `package`**; `application android:name=".MKApp"` + `MainActivity` exported LAUNCHER sudah dirujuk meski kelasnya baru ditulis A8 (build tetap jalan; pemasangan/runtime butuh kelas).
7. **buildTypes app**: debug `applicationIdSuffix ".dev"`; release `isMinifyEnabled=true` + proguard default; `proguard-rules.pro` dibuat (berkomentar) supaya rujukan rilis tidak kosong; signingConfig sengaja belum diisi.

## Penyimpangan kecil dari lembar tugas (dengan alasan)

- **`gradlePluginPortal()` ditambahkan** di pluginManagement selain google()+mavenCentral: penanda plugin ktlint (`org.jlleitschuh.gradle.ktlint`) dan detekt hanya terbit di Gradle Plugin Portal — tanpa ini resolusi plugin gagal.
- **Plugin ksp juga di `:app`**: hilt plugin tidak menjalankan prosesor; `ksp(libs.hilt.compiler)` wajib di modul yang memakai `@HiltAndroidApp`/`@HiltViewModel`.
- **detekt diterapkan di semua modul** (bukan hanya ktlint): versi detekt dipatok + `detekt.yml` diminta, dan §1 rancangan menetapkan CI menjalankan ktlint+detekt; config dibaca dari `rootProject.files("detekt.yml")` tanpa konfigurasi lintas proyek (ramah configuration-cache).

## Yang parent isi/jalankan saat membangun

1. **Bangkitkan wrapper** (jar tidak ada di repo): dari `android/` jalankan `gradle wrapper --gradle-version 9.2.0` → menghasilkan `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`. Baru setelah itu `./gradlew :app:assembleDebug` bisa dipakai.
2. **JDK 17+** di mesin/Studio; lalu build: `./gradlew :app:assembleDebug`, `./gradlew ktlintCheck detekt`.
3. **Kelas A8**: `MKApp` dan `MainActivity` di `:app` (manifest sudah merujuk), plus res `strings.xml`/tema/ikon launcher.
4. **BASE_URL staging/prod** via `buildConfigField` di `:app` (debug→staging, prod `https://monitorkarya.tech`) saat core:network diisi — sengaja belum diputuskan di skeleton.
5. **Room schema export** (`room.schemaLocation`) saat entitas/DAO pertama ditulis (tugas data Fase 0/1).
6. **signingConfig release** + keystore upload (Play App Signing, lihat PERSIAPAN-ANDROID §2).
7. **Risiko versi pada Gradle 9.2**: detekt 1.23.7 dan ktlint-plugin 12.3.0 adalah rilis era Gradle 8 — bila task detekt/ktlint gagal di Gradle 9, naikkan versinya lewat katalog (satu tempat, tanpa ubah skrip). Versi agp 9.0.4 + kotlin 2.3.0 + ksp 2.3.0-2.0.4 sudah saling sejajar.
