# Monitor Karya — klien Android

Skeleton Gradle multi-modul Fase 0 (tugas T4-A1). Rancangan penuh: `../docs/zcode/RANCANGAN-ANDROID-NATIVE.md`.

## Prasyarat

- Android Studio dengan JDK 17 atau lebih baru.
- `gradle-wrapper.jar` tidak disimpan di repo. Sebelum memakai `./gradlew`, bangkitkan wrapper sekali dari mesin yang punya Gradle:
  `gradle wrapper --gradle-version 9.2.0` (menghasilkan `gradlew`, `gradlew.bat`, dan jar wrapper).

## Modul

| Modul | Isi |
|---|---|
| `:app` | Activity, navigasi, DI, build type dev/rilis |
| `:designsystem` | Token, tema, dan komponen mk-Compose |
| `:core:network` | Retrofit/OkHttp, cookie jar terenkripsi |
| `:core:data` | Room, repository, WorkManager, outbox |
| `:core:domain` | Model domain dan use case |
| `:core:testing` | Fixture, MockWebServer, turunan sesi palsu |

## Bangun

```sh
./gradlew :app:assembleDebug
./gradlew ktlintCheck detekt
```

Konstanta SDK dipakai langsung di tiap modul: compileSdk 37, minSdk 26, targetSdk 36.
Versi seluruh dependensi terkunci di `gradle/libs.versions.toml`.
