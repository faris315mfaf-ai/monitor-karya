# T12-ANDROID — Perburuan bug aplikasi Android (12 Okt 2026)

Lingkup: `android/**` (core:network, core:data, core:domain, app). Kontrak dicocokkan dengan `src/app/api/**` (baca saja). Gradle jalan penuh (JBR Android Studio, `local.properties` dibuat; gitignore).

## Hasil tes

`./gradlew :core:network:testDebugUnitTest :core:data:testDebugUnitTest :core:domain:testDebugUnitTest` — BUILD SUCCESSFUL, 60 tes, 0 gagal (sebelum: 35). Tambahan: 25 tes baru. `:app:assembleDebug` BUILD SUCCESSFUL (graf Hilt utuh). Tes TugasRepo dibuktikan merah di kode lama (3/3 gagal), hijau di kode baru.

## Diperbaiki

| # | Temuan | Berkas | Bukti/tes |
|---|---|---|---|
| 1 | `TugasRepo.tarik` membersihkan SEMUA tugas lebih tua dari "sekarang-1 ms": SyncWorker menarik proyek satu per satu, jadi tugas proyek A lenyap saat proyek B ditarik (juga hari lain). Kini pembersihan dibatasi proyek+hari+cakupan HARIAN (`TaskDao.hapusTersinkronLamaHari`, tanpa perubahan skema Room). | `core/data` TugasRepo, Daos | `TugasRepoTarikTest` (3) |
| 2 | Drift kontrak: `GET /api/daily-input` kini mengirim `countdown: null` untuk entitas 24/7 (commit 10 Okt); `DailyInputGetResponse.countdown` wajib → seluruh meja gagal didekode. Jadi nullable. | `DtosFase1.kt` | `T12AuditTest.mejaHarian24JamCountdownNullTerdekode` (+ `DtoFase1Test` disesuaikan) |
| 3 | Sesi dicabut/kedaluwarsa di tengah pemakaian (mis. sandi diganti di web) → tiap layar hanya menampilkan galat, tanpa jalan ke layar masuk. Interceptor baru melapor `PeristiwaSesi.BERAKHIR` (401 pada permintaan bercookie, bukan `/api/auth/login`; sesi lokal dihapus) dan `WAJIB_GANTI_SANDI` (403 `MUST_CHANGE_PASSWORD`); `SesiViewModel` mengembalikan ke layar masuk / gerbang ganti sandi via `SesiPeristiwaBus`. | `MkClient.kt`, `AppModule`, `SesiViewModel`, `vm/SesiPeristiwa.kt` | 5 tes MockWebServer di `T12AuditTest` |
| 4 | Cookie dengan `Max-Age=0`/`Expires` lampau tetap disimpan jika nilainya tak kosong, sehingga sesi basi terus dikirim. Kini dikonversi jadi penghapusan. | `MkClient.pasanganCookie` | `T12AuditTest` (siklus masuk-saya-keluar + unit) |
| 5 | `RingkasanViewModel` tidak memeriksa `isSuccessful`: 401/403/5xx tampil sebagai ringkasan KOSONG "sukses". Kini menjadi `Galat` dengan pesan ApiError. | `RingkasanViewModel` | kompilasi (app tak punya tes unit) |
| 6 | `ApiError.dari(SerializationException)` membocorkan pesan teknis kotlinx ke pengguna; kini pesan ramah. 413 (batas berkas 20 MB, badan non-JSON dari proxy) juga diberi pesan jelas. | `ApiError.kt` | `T12AuditTest` (3) |
| 7 | Ganti sandi: 429/401/503 diratakan jadi "Tidak dapat menghubungi server"; 422 apa pun jadi "sandi lama tidak cocok". Kini pesan server (ApiError) dibawa lewat `GalatSesi` ke `SesiUseCase`. | `SesiUseCase`, `SesiViewModel` | `SesiUseCaseT12Test` (4) |
| 8 | `EncryptedAuthStore`: berkas/kunci Keystore rusak (AEADBadTag, kunci dibatalkan) membuat setiap permintaan jaringan gagal selamanya. Kini dipulihkan (hapus berkas + kunci, mulai bersih; pengguna masuk ulang). | `MkAuthStore.kt` | kode saja (butuh Android) |
| 9 | `LaporanViewModel.simpan` tak mengirim `reportDate`; layar terbuka melewati tengah malam WIB menulis ke laporan hari BERIKUTNYA, bukan meja yang tampil. Kini memakai `reportDateKey` meja. | `LaporanViewModel` | kompilasi |
| 10 | `StatusProyek` membandingkan tenggat per tanggal WIB; server (`project-status.ts`) membandingkan INSTAN (`targetEndDate` = 00.00Z = 07.00 WIB), jadi proyek jatuh tempo hari ini "Terlambat" di server tetapi "Sesuai" di Android. Param baru `tenggatInstan`, dipakai `ProyekRepo` (`isoKeInstanServer`). | `StatusProyek`, `ProyekRepo`, `Hasil.kt` | `StatusProyekT12Test` (5) |
| 11 | `MingguanRepo.tarikPapan` membaca `isoYear/isoWeek` dari akar respons; keduanya ada di objek `week` → baris tersimpan 0/0. | `MingguanRepo` | `MingguanRepoPapanTest` |
| 12 | Manifest hanya "menumpang" `INTERNET` dari manifes OkHttp (transitif) dan `ACCESS_NETWORK_STATE` dari WorkManager. Dideklarasikan eksplisit. | `AndroidManifest.xml` | merged manifest dicek |

## Ditunda / diketahui (tidak diperbaiki)

- **Mulai dingin luring = dilempar ke layar masuk.** `SesiUseCase.muatSaya` menelan semua galat jadi `null`; padahal cookie masih sah. Perlu profil pengguna tersimpan (MkPrefs) dan tri-state hasil; keputusan desain offline.
- **Mesin sinkron dorman.** `SyncScheduler`/`SyncWorker`/`OutboxProsesor`/`ConnectivityObserver` dan repo Room (Proyek/Laporan/Tugas/Mingguan/Penerimaan/Kepatuhan) tidak dipanggil app mana pun; tidak ada penulis outbox; `MKApp` belum memasang `HiltWorkerFactory` (SyncWorker akan gagal diinstansiasi bila dijadwalkan). Sebelum diaktifkan: pasang factory, hapus inisialisasi default, dan ingat `fallbackToDestructiveMigration` menghapus outbox saat versi Room naik.
- **Server (baca saja, untuk pemilik web):** `GET /api/daily-input` mengirim `lockAt` tetap 17.00 (`dailyLockAt`) walau jam batas entitas kustom; `GET /api/work-desk` masih memakai `isDailyLocked`/`dailyCountdown`/`DAILY_CUTOFF_LABEL` 17.00 tetap, tidak membaca settings entitas. Klien menampilkan apa adanya.
- `Wib.kunciHarian` (17.00 tetap) tidak dipakai layar mana pun; jangan dipakai sebelum membaca settings.
- Penerimaan: 409 "sudah diteruskan" menandai baris BEKU dan menimpa DITERUSKAN (disengaja per komentar desain; label "perlu buka kunci" bisa membingungkan).
- `OutboxProsesor` melanjutkan ke pesan berikutnya walau pesan awal gagal sementara (urutan FIFO bisa terlewat untuk pesan bergantung). Tak berdampak selama outbox dorman.
