# T4-A10 — Audit silang kontrak antar-agen Fase 0

Agen T4-A10, 8 Oktober 2026. Pemeriksaan baca-saja atas hasil T4-A1 sampai T4-A9
di `android/` (pohon kerja `codex/kerja`). Tidak ada kode agen lain yang diubah.
Metode: pembacaan menyeluruh berkas Gradle + Kotlin + manifest + laporan agen,
lalu pencocokan silang setiap simbol lintas modul (import, nama fungsi/parameter,
enum, konstruktor) terhadap definisi nyata di worktree. Gradle tidak dijalankan,
sehingga temuan bersifat analisis statis — tetapi setiap temuan di bawah diverifikasi
terhadap isi berkas terkini pada saat pemeriksaan (agen lain aktif menulis selama
audit; lihat bagian 4).

Tingkat dampak: **BLOKIR** = kompilasi/CI pasti gagal; **RAPIKAN** = tidak memblokir
kompilasi tetapi melanggar konvensi atau menimbun utang; **INFO** = catatan.

## 1. Temuan BLOKIR

### 1.1 Skrip `gradlew`/`gradlew.bat` tidak ada — CI gagal di langkah pertama

- Berkas: `android/gradlew`, `android/gradlew.bat` (tidak ada); `android/gradle/wrapper/gradle-wrapper.jar` dan `gradle-wrapper.properties` ada.
- Dampak: `.github/workflows/android.yml` menjalankan `chmod +x gradlew` lalu `./gradlew :app:assembleDebug :designsystem:lint` — gagal sebelum kompilasi dimulai. README (T4-A1) memang menyatakan wrapper harus dibangkitkan (`gradle wrapper --gradle-version 9.2.0`), jadi ini keputusan yang belum ditindaklanjuti, bukan kelalaian senyap.
- Usulan: jalankan `gradle wrapper` sekali, komit `gradlew` + `gradlew.bat` (+ jar bila diputuskan disimpan, lihat 2.2), lalu biarkan CI yang memverifikasi.

### 1.2 Paket import pendek `designsystem.components.*` di empat layar T4-A9

- Berkas: `app/src/main/kotlin/id/co/monitorkarya/app/ui/login/LoginScreen.kt` (baris 46–51), `.../login/GantiSandiScreen.kt` (40–45), `.../ringkasan/RingkasanScreen.kt` (23–29), `.../placeholder/PlaceholderTabScreen.kt` (11).
- Nyata: paket komponen adalah `id.co.monitorkarya.designsystem.components`; `LocalMkColors` ada di `id.co.monitorkarya.designsystem.theme`. Tidak ada paket tingkat atas `designsystem.*`.
- Usulan (mekanis, satu zona A9): ganti awalan `designsystem.components.` menjadi `id.co.monitorkarya.designsystem.components.`, dan `designsystem.components.LocalMkColors` menjadi `id.co.monitorkarya.designsystem.theme.LocalMkColors`.

### 1.3 `RingkasanViewModel` — import salah paket dan metode tidak ada

- Berkas: `app/src/main/kotlin/id/co/monitorkarya/app/ui/vm/RingkasanViewModel.kt` baris 11 dan 63.
- Nyata: antarmuka ada di `id.co.monitorkarya.core.network.api.RingkasanApi` (bukan `...core.network.RingkasanApi`) dan metodenya `suspend fun ringkasan(): Response<JsonObject>` — bukan `ambil(): JsonObject`.
- Usulan: perbaiki import; ganti `parseRingkasan(api.ambil())` dengan `api.ringkasan().body()` (tangani `null`/`!isSuccessful` → status `Galat`). Alternatif: tambahkan `suspend fun RingkasanApi.ambil(): JsonObject` sebagai ekstensi di `:core:network` bila pola lempar-eksepsi tanpa `Response` diinginkan seragam.

### 1.4 Komponen `MkError` dipanggil, yang ada `ErrorNote`

- Berkas pemanggil (A9): `LoginScreen.kt:129`, `GantiSandiScreen.kt:148`, `RingkasanScreen.kt:65`.
- Nyata (A4): `designsystem/components/MkError.kt` mendefinisikan `fun ErrorNote(modifier, pesan, onCobaLagi)`. Tidak ada `MkError` komponen.
- Usulan: pilih satu nama (nama berkas sudah `MkError.kt`; menambah `@Composable fun MkError(...)` sebagai alias `ErrorNote`, atau mengganti tiga panggilan di A9 menjadi `ErrorNote`).

### 1.5 `EmptyNote(text = …)` vs parameter `teks`

- Berkas: `PlaceholderTabScreen.kt:22` memanggil `EmptyNote(text = "…")`.
- Nyata (A4): `fun EmptyNote(modifier, teks: String, done, ikon, teksAksi, onAksi)`.
- Usulan: ganti `text =` menjadi `teks =` (atau samakan nama parameter di A4 bila `teks` dianggap melanggar konvensi penamaan parameter — pilih satu dan catat di FASE0.md).

### 1.6 `MkOfflineBanner(modifier = …)` tanpa parameter wajib

- Berkas: `RingkasanScreen.kt:62` memanggil `MkOfflineBanner(modifier = Modifier.fillMaxWidth())`.
- Nyata (A4): `fun MkOfflineBanner(modifier, terlihat: Boolean, onCobaLagi: () -> Unit)` — keduanya wajib tanpa nilai bawaan (spanduk punya tombol "Coba lagi" bawaan).
- Usulan: `MkOfflineBanner(modifier = …, terlihat = offline, onCobaLagi = onUlang)` — `RingkasanScreen` versi state sudah punya `onUlang`; atau beri nilai bawaan `terlihat = true` di A4 bila tombol coba-lagi memang opsional.

### 1.7 `MkButton` — nama parameter, nilai enum, dan parameter `full` tidak cocok

- Berkas (A9): `LoginScreen.kt:130–136`, `GantiSandiScreen.kt:149–155` memanggil `MkButton(text = …, variant = MkButtonVariant.Primary, size = MkButtonSize.Md, full = true, …)`.
- Nyata (A3): `fun MkButton(modifier, label: String, onClick, variant: MkButtonVariant = SECONDARY, size: MkButtonSize = M, enabled)`; enum `MkButtonVariant { PRIMARY, SECONDARY, PLAIN }`, `MkButtonSize { M(44dp), S(36dp) }`; tidak ada parameter `full`.
- Usulan (pilih arah, satu zona saja): (a) A9 menyesuaikan — `label =`, `MkButtonVariant.PRIMARY`, `MkButtonSize.M`, lebar penuh lewat `modifier = Modifier.fillMaxWidth()`; atau (b) A3 menambahkan `full: Boolean = false` + mengganti nama parameter `label`→`text` — tetapi (a) lebih kecil karena A4 juga sudah memakai `label`/`PRIMARY`/`S`.

### 1.8 `MkCard(title = …, subtitle = …)` — parameter tidak ada

- Berkas (A9): `LoginScreen.kt:88–91`, `GantiSandiScreen.kt:107–110`.
- Nyata (A3): `fun MkCard(modifier, padding: Dp = 20.dp, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit)` — tanpa `title`/`subtitle`.
- Usulan: tulis judul/subjudul sebagai `Text` di dalam `content` (pola ini dipakai pratinjau A3), atau tambahkan parameter `title`/`subtitle` opsional di `MkCard` bila pola kartu berjudul memang berulang.

Kesimpulan blokir: seluruhnya terkonsentrasi di zona T4-A9 (4 berkas layar + 1 ViewModel)
plus satu keputusan wrapper (T4-A1/parent). Tidak ada konflik antara A2, A3, A4, A5, A6, A7, A8 —
kontrak mereka saling cocok setelah rekonsiliasi berjalan (bagian 4).

## 2. Temuan RAPIKAN

### 2.1 `material-icons-extended` di luar katalog versi

`app/build.gradle.kts:89` dan `designsystem/build.gradle.kts:51` mendeklarasikan
`androidx.compose.material:material-icons-extended` sebagai string literal (versi
dari compose-bom), tidak lewat `gradle/libs.versions.toml` — melanggar konvensasi
"satu-satunya tempat ubah versi = katalog" (komentar T4-A1 di root build). Artefak
ikon memang dibekukan di 1.7.8 dan BOM baru mungkin tak lagi memetakannya; komentarnya
sudah menjelaskan hal ini. Usulan: pindah ke katalog dengan versi dipatok begitu
diverifikasi CI hijau.

### 2.2 `gradle-wrapper.jar` ada padahal dinyatakan tidak disimpan

`android/README.md` dan laporan T4-A1 menyatakan jar wrapper tidak disimpan di repo;
di worktree jar justru ada (dihasilkan 20.06) sementara `.gitignore` tidak
mengecualikannya — komit `git add android/` akan memasukkannya tanpa skrip `gradlew`.
Tidak konsisten dengan 1.1: bagai setengah wrapper. Usulan: komit wrapper lengkap
(jar + dua skrip, praktik baku proyek Android) lalu perbarui README; atau hapus jar
dan biarkan setiap mesin membangkitkan wrapper sendiri.

### 2.3 Enum status dobel tanpa jembatan

`core.domain.model.MkStatusDomain` (A7; 5 nilai, keluaran `StatusProyek.hitung`) dan
`designsystem.components.MkStatus` (A3; 6 nilai termasuk `INFO`, label + ikon).
Keduanya sah untuk lapisannya masing-masing, tetapi belum ada fungsi pemetaan
`MkStatusDomain → MkStatus` — Fase 1 (daftar proyek) pasti membutuhkannya. Usulan:
fungsi kecil di `:app` (atau `:core:domain` bila boleh bergantung designsystem —
lebih baik tidak; jaga domain bersih) saat layar pertama memakainya.

### 2.4 Duplikasi pembangun Retrofit

`core/network/Factory.kt` (A5) menyediakan `buatApi(ok, baseUrl, kelas)` dengan
validasi baseUrl berakhiran `/`; `app/di/AppModule.kt` (A8) membangun Retrofit
sendiri lewat helper privat dengan alasan sah (satu instance dibagi dua API).
Tidak salah, tetapi dua jalur akan mudah terpisih perilakunya. Usulan: pilih satu —
AppModule memakai `Factory`, atau Factory dihapus/diedukasi jadi internal.

### 2.5 Root `build.gradle.kts` tidak memuat alias detekt

Semua modul memakai `alias(libs.plugins.detekt)` dari katalog, tetapi blok plugin
root tidak memuat `alias(libs.plugins.detekt) apply false` seperti plugin lain.
Berjalan normal (resolusi per modul), hanya pola yang tidak seragam. Usulan: tambah
satu baris agar konsisten.

### 2.6 `android/README.md` tertinggal dari keadaan pohon

README (A1) masih menyatakan jar wrapper tidak ada, modul `:app` digambarkan tanpa
BASE_URL/buildConfig/ikon, dan tidak menyebut `docs/FASE0.md`. Usulan perbarui setelah
keputusan 1.1/2.2.

### 2.7 Atribusi layar dalam laporan

Laporan T4-A8 menyebut `LoginScreen`/`GantiSandiScreen` sebagai karya "A4"; laporan
T4-A9 mengklaim berkas yang sama. Kepemilikan zona berkas: `app/ui/*` adalah A9
(A8 hanya merujuk). Catatan jejak audit saja — berkasnya satu, tidak ada duplikasi.

## 3. Temuan INFO

1. `core:testing` masih tanpa sumber (scaffold saja) — wajar untuk Fase 0; pengisian
   menyusul pengujian Fase 1 (rancangan §7).
2. Keputusan desain terbuka yang dicatat sendiri oleh A3: ikon `DONE` memakai `Schedule`
   (web: centang; padanan jam ada di LATE) dan label `INFO` "Diingatkan" (web "Informasi");
   delta turun memakai `statusRisk` bukan `statusLate`. Perlu keputusan pemilik desain
   saat paritas web diperiksa.
3. `MkStatus.INFO` hanya ada di designsystem — domain tidak punya padanan; jangan
   dipaksa lewat `MkStatusDomain` sebelum ada kebutuhan nyata.
4. `local.properties` ada di worktree — sudah di `.gitignore` `android/`, aman, jangan
   dikomit.
5. Penamaan modul: rancangan §5 menulis `:core-network` dsb., implementasi `:core:network`
   (mengikuti tata direktori §6). Konsisten internal; cukup dicatat agar tidak kebingungan
   saat membaca task Gradle (task CI `:app`/`:designsystem` tidak terpengaruh).
6. `MKApp` memakai `Configuration.Provider` WorkManager tanpa `HiltWorkerFactory`
   (placeholder, dicatat A8) — peringatan runtime kecil sampai worker Fase 1 dibuat.

## 4. Ketidaksesuaian yang sudah teratasi selama swarm berjalan

Pencocokan awal audit menemukan pula konflik berikut; saat pemeriksaan akhir sudah
tidak ada di pohon (direkonsiliasi agen bersangkutan sendiri). Dicatat agar tidak
dicari-cari lagi:

| Konflik awal | Resolver | Keadaan akhir |
| --- | --- | --- |
| `MkButton.kt` mengimpor paket `…designsystem.motion.*` padahal `LocalReducedMotion`/`MkEasing` di `theme` | A3 | Import dialihkan ke `theme` |
| `MkPreview.kt` membangun `MkColors` dengan field aksen yang tidak ada | A3 | Berkas dihapus; pratinjau memakai `MKTheme`/`@PreviewGanda` |
| Komponen A4 membaca `MkTheme.colors`/`MkTheme.typography` yang belum ada | A2 | Ditambah `object MkTheme` (colors+withAccent, accent, typography, shapes, spacing) |
| `ProjectRow` memakai `StatusBadgeSize.S` + import `theme.Status` | A4 | Kini `MkBadgeSize.SM` + `MkStatus` satu paket |
| A4 memanggil `MkButton(teks=…, Variant.Secondary)` | A4 | Kini `label`/`SECONDARY` |
| `designsystem` tanpa `material-icons-extended` | A3/A1 | Ditambahkan di build.gradle.kts modul |
| `StatusBadge.kt` tanpa import `Column` | A3 | Import lengkap |
| `ApiError.dari(HttpException)` dicurigai kurang parameter | A5 | `offlineDeteksi` punya nilai bawaan — sah |
| Manifest `:app` label literal | A8 | Kini `@string/app_name` |

## 5. Rekomendasi urutan tindak lanjut (parent)

1. Bangkitkan + komit wrapper Gradle (1.1, 2.2) — prasyarat CI.
2. Perbaikan mekanis zona A9 (1.2–1.8): satu perubahan berkas layar + ViewModel,
   ±15 baris. Pilihan arah penamaan (`ErrorNote` vs `MkError`, `teks` vs `text`,
   `full`) ditetapkan sekali lalu dicatat di `docs/FASE0.md` bagian kontrak.
3. Dorong cabang, biarkan `android.yml` menjalankan build pertama; tangani sisa
   galat kompilasi yang hanya tampak saat Gradle sungguhan berjalan (mis. versi
   plugin era Gradle 9 — risiko sudah ditandai T4-A1 butir 7).
4. Rapikan 2.1–2.6 bertahap tanpa memblokir.
