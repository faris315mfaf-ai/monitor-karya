# Laporan T4-A10 — CI Android, dokumen Fase 0, audit silang

Agen T4-A10, 8 Oktober 2026, cabang `codex/kerja`. Tanpa git/jaringan/DB; Gradle
tidak dijalankan (larangan tugas). `ci.yml` yang lama dibaca dan tidak disentuh.

## Berkas yang ditulis

| Berkas | Isi |
| --- | --- |
| `.github/workflows/android.yml` | Workflow baru "Android Fase 0": trigger push/PR terfilter `android/**` + berkas workflow itu sendiri; job `build` ubuntu-latest, JDK Temurin 17, `gradle/actions/setup-gradle@v4`; langkah checkout → `chmod +x gradlew` → `./gradlew :app:assembleDebug :designsystem:lint` (working-directory `android`) → unggah artefak `actions/upload-artifact@v4` dari `android/app/build/outputs/apk/debug/*.apk`. Hak `contents: read`, concurrency batal-duplikat, timeout 30 menit — meniru gaya `ci.yml`. `ci.yml` tidak diubah. |
| `android/docs/FASE0.md` | Dokumen progres Fase 0: peta 6 modul + namespace + kepemilikan agen; tabel kontrak nama lintas agen (simbol → berkas → agen pemilik); cara membangun lokal (JDK 17, SDK 37/26/36, bangkitkan `gradlew`, perintah `assembleDebug`/`lint`/`ktlintCheck`/`detekt`); definisi selesai Fase 0 dari rancangan §5 dengan status per butir; daftar yang menunggu Fase 1. |
| `android/docs/fase0/README.md` | Indeks laporan T4-A1 sampai T4-A10 (zona, tautan, ringkasan satu baris). |
| `android/docs/fase0/T4-A10-AUDIT.md` | Audit silang baca-saja: 8 temuan BLOKIR, 7 RAPIKAN, 6 INFO, tabel 9 konflik yang telah teratasi sendiri selama swarm, rekomendasi urutan tindak lanjut. |
| `android/.editorconfig` | root=true; utf-8, lf, final-newline, potong spasi akhir, indent 2 spasi; `*.kt`/`*.kts` indent 4; markdown dipertahankan spasi akhirnya. |

## Metode audit

Seluruh berkas Gradle, Kotlin, manifest, dan laporan T4-A1..A9 dibaca; setiap simbol
lintas modul (import, nama fungsi/parameter/enum/konstruktor) dicocokkan dengan
definisinya di pohon kerja. Karena agen lain menulis bersamaan, pemeriksaan diulang
pada akhir sesi — hanya ketidaksesuaian yang masih ada di pohon akhir yang dilaporkan
sebagai temuan; yang sudah hilang direkam di bagian "teratasi" agar tidak dicari ulang.

## Temuan audit utama

1. **`gradlew`/`gradlew.bat` belum ada** — `android.yml` gagal di `chmod +x gradlew`
   sampai wrapper dibangkitkan dan dikomit (jar + properties sudah ada; README T4-A1
   memang menunda ini ke parent).
2. **Empat layar T4-A9 memakai paket import pendek `designsystem.components.*`**
   (seharusnya `id.co.monitorkarya.designsystem.components.*`; `LocalMkColors` di
   `…designsystem.theme`) — memblokir kompilasi `:app`.
3. **`RingkasanViewModel`**: import `core.network.RingkasanApi` (nyata `…network.api.RingkasanApi`)
   dan memanggil `api.ambil()` (nyata `ringkasan(): Response<JsonObject>`).
4. **Kontrak komponen tidak cocok di sisi A9**: `MkError(…)` (nyata `ErrorNote`),
   `EmptyNote(text=)` (nyata `teks`), `MkOfflineBanner(modifier)` tanpa `terlihat`/`onCobaLagi`
   wajib, `MkButton(text=, Primary, Md, full=)` (nyata `label`, `PRIMARY`, `M/S`, tanpa `full`),
   `MkCard(title=, subtitle=)` (tidak ada parameternya).
5. Rapi-lah setelahnya: `material-icons-extended` belum di katalog versi, jar wrapper
   ada padahal dinyatakan tidak disimpan, enum status dobel (`MkStatusDomain` vs `MkStatus`)
   tanpa jembatan, duplikasi pembangun Retrofit (Factory vs AppModule), root build tanpa
   alias detekt, README tertinggal.

Sisi positif: kontrak A1–A8 (Gradle, tema, komponen designsystem internal, network,
data, domain, kerangka app) saling cocok di pohon akhir — seluruh sisa blokir terkonsentrasi
di zona T4-A9 plus keputusan wrapper.

## Batasan

- Tidak menjalankan Gradle: temuan berbasis analisis statis; galat versi-plugin era
  Gradle 9 (risiko ditandai T4-A1) baru terlihat di CI.
- Snapshot pohon diambil saat agen lain masih menulis; dokumen audit mencatat waktu
  pemeriksaan per bagian dan konflik yang teratasi agar dapat diverifikasi ulang.
- Sesuai tugas: tidak ada kode agen lain yang diperbaiki.
