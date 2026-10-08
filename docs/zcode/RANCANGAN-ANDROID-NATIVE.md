# Rancangan pekerjaan — aplikasi Android native murni Monitor Karya

Disusun Zcode, 8 Oktober 2026, atas keputusan pemilik: klien Android **native murni** (bukan TWA/WebView). Dokumen ini adalah rencana kerja detail: arsitektur, kontrak backend, desain, offline, inventaris layar, struktur proyek, pengujian, keamanan, fase + estimasi, risiko, dan langkah pertama. Backend dan aplikasi web **tetap** — Android adalah klien tambahan.

## 1. Keputusan teknologi (dikunci)

| Hal | Pilihan | Alasan |
|---|---|---|
| Bahasa/UI | **Kotlin + Jetpack Compose + Material 3** | Standar Android modern 2026; UI deklaratif cocok memporting sistem desain mk |
| Arsitektur | UI (Compose + ViewModel) → Domain (use case tipis) → Data (Repository: Retrofit + Room + DataStore) | Pola baku Google; mudah diuji per lapis |
| Jaringan | **OkHttp + Retrofit + kotlinx.serialization** | Cookie jar penuh, interceptor, timeout, logging build debug |
| Basis data lokal | **Room** | Single source of truth UI offline-first |
| Penyimpanan prefs | DataStore (Preferences) + **EncryptedDataStore/EncryptedSharedPreferences untuk cookie sesi** | Sesi = setara bearer token |
| Sinkronisasi latar | **WorkManager** (NetworkType.CONNECTED, backoff eksponensial) + outbox tabel Room | Bertahan restart, dijadwalkan sistem |
| Min/target SDK | minSdk 26 (Android 8.0, mencakup ±98% perangkat Indonesia) · targetSdk 36 | Play mewajibkan target mutakhir |
| Async/di | Coroutines + Flow · Hilt | Standar |
| Navigasi | Navigation-Compose; tab bawah per peran (peta tab sama dengan `ROLE_TABS`) | Ponsel-first; tablet wajib versi ≥ Fase 3 |
| Build/CI | Gradle KTS · GitHub Actions (path `android/**`): ktlint+detekt, unit test, `assembleDebug`, `bundleRelease` signed via secrets | Satu repo bersama web (`android/`), CI terpisah path-filter |
| Crash reporting | **Tanpa pihak ketiga di v1** (konsisten kebijakan tanpa telemetri eksternal); log lokal + tombol "kirim log" manual (email) | Privasi data bisnis |

## 2. Kontrak dengan backend yang ada

Diverifikasi dari kode (8 Okt 2026):

- **Auth memakai cookie sesi apa adanya**: proxy menolak mutasi lintas situs lewat `Origin`/`Sec-Fetch-Site`; klien native tidak mengirim keduanya → lolos ke pemeriksaan sesi (komentar `src/proxy.ts` eksplisit: klien non-browser). Cookie `__Host-mk_session` (prod) berjalan di OkHttp CookieJar atas HTTPS. **Aplikasi WAJIB tidak pernah menyetel header Origin palsu.**
- Alur wajib dipertahankan klien: `MUST_CHANGE_PASSWORD` (403 + kode) → layar ganti sandi; aktivasi tautan tetap di web (sekali pakai 24 jam) — aplikasi hanya login.
- Sesi 8 jam: setelah itu pengguna masuk ulang. **Keputusan terbuka #1**: opsi "tetap masuk di perangkat ini" (refresh terbatas per perangkat, simpan di EncryptedDataStore) — perubahan backend kecil + pertimbangan keamanan; default v1: tidak, ikut 8 jam.
- Seluruh endpoint yang dibutuhkan sudah ada (74 route). Tambahan backend kecil yang direkomendasikan (tugas Zcode di server, non-breaking):
  1. **Header identitas klien**: kirim `X-MK-Client: android/<versi>`; dicatat di AuditLog `userAgent` — murni opsional, tanpa validasi.
  2. **Efisiensi sinkronisasi** (Fase offline penuh): parameter `berubahSejak` pada daftar proyek/laporan/eskalasi ATAU ETag — tanpa ini aplikasi menarik ulang daftar penuh (masih berfungsi, hanya boros).
  3. **FCM push** (Fase 4, opsional): tabel token per pengguna + kirim pada reminder-rules/cron — berkas rancangan tersendiri bila dipilih.
- Unggah bukti: multipart sudah berjalan; aplikasi mengompres gambar sebelum unggah (mis. sisi panjang ≤2048, kualitas 85) — keputusan produk ringan di klien.

## 3. Sistem desain di Compose (port `design-system`)

- **Token warna** → `MaterialTheme` + skema kustom: terang/gelap penuh (`data-theme`), **enam aksen** dipersist (DataStore) dan ditukar runtime (`data-accent` → pilih `MKColors.merah|biru|…`); status on/risk/late/done/neutral selalu **warna+ikon+kata** (komponen `StatusBadge` Compose).
- **Tipografi**: skala mk (large-title 40 … caption 12) sebagai `Typography` kustom; angka tabular (`FontFeatureSettings "tnum"`).
- **Komponen wajib dibangun dulu (pustaka `designsystem/` modul)**: Button (varian primary/secondary/plain + tekan 0.97/150 ms — sama dengan web), Card, StatTile, StatusBadge, Chip, SegmentedControl, Sheet → `ModalBottomSheet` (samping 440 di tablet), ProjectRow, ActivityItem, EmptyNote, Skeleton, Toast (Snackbar), ikon (set Lucide → vector).
- **Grafik** (Fase 3, canvas Compose): ActivityRings, BarChart, DonutChart, Timeline, Heatmap, DivisionBar — nilai selalu tertulis.
- **Gerak**: durasi 150/250/400/600 ms + kurva setara `--ease-standard` (`Easing(0.2f,0.8f,0.2f,1f)`); `LocalReducedMotion` menghormati setelan sistem "hapus animasi".
- Sumber kebenaran tetap `DESIGN.md`/`docs/design/`; perubahan desain dua arah: token berubah → berkas `android/designsystem/tokens.md` versi (sinkron manual, dicatat di PR).

## 4. Strategi offline-first (motivasi utama pemilik)

Prinsip: **Room = satu-satunya sumber tampilan; server = otoritas kebenaran.**

1. **Baca**: setiap layar merender dari Room; WorkManager menarik data (daring-duluan saat koneksi ada, latar saat tersambung kembali). Data basi ditandai ("Diperbarui HH.MM · tersimpan saat luring").
2. **Tulis (outbox)**: aksi (kirim laporan, setujui, dsb.) saat luring disimpan sebagai operasi berantai di tabel `outbox` + status UI "Menunggu kirim". Saat daring, WorkManager mengirim berurutan; **hasil server adalah final** — 409 (beku/terlambat/tenggat) dan 422 ditampilkan sebagai kegagalan yang perlu ditindak pengguna, TIDAK pernah ditimpa lokal. Batas antre 7 hari (kedaluwarsa → tandai gagal).
3. **Bukti**: berkas menunggu di penyimpanan aplikasi privat, diunggah saat daring; progres notifikasi opsional.
4. Invarian domain dipegang server (17.00 WIB, beku, rantai persetujuan) — klien hanya melakukan pra-validasi ramah (pesan cepat), keputusan tetap di server.

## 5. Inventaris layar per fase (dipetakan dari `src/components/views`)

- **Fase 0 — fondasi (±2,5 minggu)**: proyek Gradle multi-modul (`:app`, `:designsystem`, `:core-network`, `:core-data`, `:core-domain`), CI, tema+7 komponen inti, login + ganti sandi wajib + sesi tersimpan aman + logout, kerangka navigasi per peran (tab bawah), layar galat/luring/kosong, error mapper bahasa Indonesia.
- **Fase 1 — MVP PIC (±3,5 minggu)**: Meja kerja (tugas hari ini), **isi laporan harian** (satu & multi-proyek → pilih proyek), draf/kirim + validasi ramah, tambah progres tugas, unggah/hapus bukti (+kompres), lihat status & riwayat proyek, ajukan buka kunci, Urungkan (toast), notifikasi dalam app. *Selesai = seorang PIC bisa bekerja sehari penuh dari HP tanpa web.*
- **Fase 2 — Kepala divisi & Admin PT (±3,5 minggu)**: capaian mingguan (serah/setujui), antrean penerimaan & teruskan (dengan beku 409 ditangani baik), kepatuhan per divisi + Ingatkan, meja akun terbatas (aktifkan/nonaktifkan, terbitkan aktivasi), pengingat.
- **Fase 3 — Pemantau grup (±2,5 minggu)**: Ringkasan Manajemen versi terbaru (**Laporan per perusahaan → proyek → laporan + eskalasi**, sesuai keputusan 8 Okt), eskalasi (tinjau/putuskan), audit (saring+detail), grafik Compose, tata letak tablet.
- **Fase 4 — penguatan (per keputusan)**: FCM push (butuh backend), widget laporan hari ini, pintasan layar, pembagian tautan bukti.
- Total paritas web ≈ **12–13 minggu efektif 1 pengembang Android senior** + ±2 minggu kerja server pendamping (Zcode) untuk `berubahSejak`/FCM/verifikasi klien. Aplikasi web tetap jalan untuk desktop/admin berat.

## 6. Struktur & konvensi

```
android/
  app/                    # Activity, navigasi, DI, build types (dev→https://monitorkarya.tech, prod sama; debug pakai staging), proguard
  designsystem/           # tema token, komponen mk-Compose, pratinjau @Preview terang/gelap/6 aksen
  core/network/           # Retrofit/OkHttp, cookie jar terenkripsi, interceptor X-MK-Client, error mapping
  core/data/              # Room (entitas+DAO), repository, WorkManager sync, outbox
  core/domain/            # use case + model domain (WIB helper, status proyek — port `project-status.ts`)
  core/testing/           # fixture, MockWebServer, turunan sesi palsu
```
Konvensi: Kotlin official style + ktlint; detekt blok build; nama layar `…Screen.kt`; string bahasa Indonesia di `strings.xml` (sapaan "Anda", tanpa emoji/seru); setiap layar punya ViewModel + uji; screenshot uji UI pada terang/gelap.

## 7. Rencana pengujian

1. **Unit** (Junit+Turbine): repository/sync/outbox dengan MockWebServer memutar respons nyata (termasuk 409/422/MUST_CHANGE_PASSWORD), viewmodel state.
2. **UI Compose** (`androidTest`): alur kritis — login→ganti sandi→isi→kirim; luring→outbox→daring→terkirim;Sheet/tombol/ikon status.
3. **E2E Maestro** terhadap build staging (akun uji khusus `uji-android@…`) tiap rilis kandidat.
4. **Perangkat fisik minimum**: 1 Android ≥12 (utama), 1 Android 8 (minSdk), tablet (Fase 3), kondisi jaringan: wifi/4G/luring/lembah sinyal.
5. Gerbang rilis internal Play: checklist `docs/design/15-checklist-review.md` bagian yang relevan + data safety konsisten.

## 8. Keamanan khusus klien

- Cookie sesi hanya di penyimpanan terenkripsi; logout menghapus; tidak pernah di log/backup (`allowBackup=false` atau exclude).
- TLS standar; opsi **certificate pinning** (kunci server Anda) — keputusan terbuka #2 (menambah keamanan, menambah kerumian rotasi sertifikat).
- Tidak ada data pengguna di penyimpanan eksternal; berkas bukti di direktori privat aplikasi.
- Play: data safety sesuai PERSIAPAN-ANDROID; kebijakan privasi halaman yang sama.
- Keystore upload + Play App Signing (lihat [PERSIAPAN-ANDROID](PERSIAPAN-ANDROID.md) §2).

## 9. Risiko utama & keputusan terbuka pemilik

| Risiko/konsekuensi | Penjelasan |
|---|---|
| **Dua klien UI selamanya** | Setiap fitur baru web harus diporting (estimasi fitur ringan +20–30% usaha total tim). Web tidak dihapus (desktop/admin berat). |
| Kecepatan fitur melambat | Selama 3 bulan pembangunan, fitur baru muncul dulu di web; Android menyusul per fase. Atur ekspektasi pengguna. |
| Biaya | 1 dev Android senior ×3 bulan (atau kompres 2 bulan dengan 2 dev + koordinasi). |
| Konsistensi desain | Dijaga lewat modul designsystem + review ganda; drift terjadi kalau token berubah tanpa catatan. |
| Keputusan #1 sesi 8 jam vs "tetap masuk" | Default: 8 jam. Bila pengguna mobile protes, buat token per-perangkat (backend kecil). |
| Keputusan #2 pinning sertifikat | Default: tidak (rotasi sertifikat lebih mudah). |
| Keputusan #3 FCM & crash reporting | Default: tanpa keduanya di v1 (privasi); FCM direkomendasikan sejak Fase 4 karena nilai pengingat besar. |
| Sinkron tanpa `berubahSejak` | Berfungsi (tarik penuh) tetapi boros kuota pada data besar — prioritaskan endpoint ini di awal Fase 1. |

## 10. Langkah pertama konkret (minggu ini, setelah persetujuan)

1. Zcode: tambah `X-MK-Client` (opsional, dicatat) + rancangan endpoint `berubahSejak` untuk 3 daftar utama; buat akun uji khusus Android di DB dev.
2. Setup: pasang Android Studio (mesin dev Anda), fork langkah `android/` scaffold dari Fase 0 (Zcode bisa menulis skeleton Gradle + designsystem awal di repo ini agar mulai dari jalan).
3. Setujui fase & keputusan #1–#3, lalu Fase 0 dimulai dengan definisi selesai di §5.

Persetujuan dokumen ini = lampu hijau Fase 0.
