# T5-B2 (ULANG) — Laporan penuntasan zona `:core:data` Fase 1

Tanggal: 8 Oktober 2026 (malam) · Cabang: `codex/kerja` · Agen: T5-B2-ULANG
(kelanjutan sesi T5-B2 yang terputus batas API; kerja setengah jadi sudah ada
di pohon — diteruskan, tidak ditimpa).

Zona: hanya `android/core/data/src/**` (+ berkas laporan ini). Tanpa git,
jaringan, basis data, dan Gradle; `build.gradle.kts` tidak disentuh — semua
kebutuhan dependensi dicatat di bawah untuk parent.

## 1. Apa yang diteruskan dari sesi putus (sudah ada, TIDAK ditulis ulang)

- `repo/Hasil.kt` — `HasilKirim`/`HasilBaca` + `bacaApi`/`tulisApi` (kontrak
  lintas agen; dipakai F2 C3). Hanya cabang `Konflik` yang diperbaiki (A7,
  lihat §3).
- `repo/{LaporanRepo,TugasRepo,ProyekRepo}.kt` — logika utuh; hanya selarasan
  nama DTO/API (§2).
- `repo/{KepatuhanRepo,PenerimaanRepo,MingguanRepo}.kt` (cakupan F2), `db/*`,
  `prefs/MkPrefs.kt` — dibiarkan berjalan apa adanya.

## 2. Berkas yang ditulis baru

| Berkas | Isi |
| --- | --- |
| `outbox/OutboxProsesor.kt` | Pemroses antrean persis kontrak `OutboxProsesTest` T5-B9: `OutboxProsesor(dao, kirim)`, satu putaran `prosesAntrean()` atas semua MENUNGGU urut id naik (FIFO). Sukses → BERHASIL lalu `hapusBerhasil()`; GagalPermanen (409 locked / 422) → GAGAL + `pesanGalat`, baris dipertahankan; Luring/GagalSementara → percobaan+1 tetap MENUNGGU; galat tak terduga satu pesan tidak menghentikan putaran. |
| `sync/SyncWorker.kt` | `@HiltWorker` `CoroutineWorker`: buang outbox kedaluwarsa (>7 hari, `hapusKedaluwarsa` kini punya pemanggil), antarkan antrean lewat `OutboxProsesor` (penerjemah jenis→API), tarik proyek + laporan 14 hari + tugas hari ini per proyek ke Room, catat `MkPrefs.setTerakhirSinkron` saat sukses. `Result.retry()` bila ada `GagalSementara`/tarik gagal (maks 6 percobaan, lalu failure). Konstanta jenis pesan dibuka di `JenisOutbox` (`KIRIM_LAPORAN`, `TAMBAH_TUGAS`, `UBAH_TUGAS`, `HAPUS_TUGAS`). |
| `sync/SyncScheduler.kt` | `SyncScheduler.jadwalkanSekaliSaatOnline(context)` — tanda tangan PERSIS panggilan `SesiViewModel` (B8): OneTime + `NetworkType.CONNECTED` + backoff eksponensial 30 s, unik `KEEP` (idempoten dipanggil ulang). |
| `sync/ConnectivityObserver.kt` | `@Singleton` injektable; `daring: Flow<Boolean>` dari `callbackFlow` ConnectivityManager (nilai awal + tiap available/lost, `distinctUntilChanged`, unregister di `awaitClose`). |

Catatan penempatan paket (penyimpangan disengaja dari teks tugas, mengikuti
kontrak yang lebih kuat):
- `OutboxProsesor` di paket `…core.data.outbox`, bukan `sync/` — `OutboxProsesTest`
  B9 memanggil kelas tanpa kualifikasi dari paket itu dan FASE1.md §3 menulis
  `…core.data.outbox`; taruh di `sync/` memecah kompilasi tes.
- `SyncScheduler` di `…core.data.sync` — FASE1.md §3 menulis `:app …app.sync`,
  tetapi instruksi tugas menaruhnya di zona `:core:data`. Konsekuensinya satu
  baris impor di `SesiViewModel` harus disesuaikan parent (lihat §5 butir 3).

## 3. Berkas yang diubah (selaraskan + perbaikan)

| Berkas | Perubahan |
| --- | --- |
| `repo/LaporanRepo.kt` | `DailyReportDto` → `DailyReportRowDto` (impor + tipe penerima mapper, audit A1); argumen bernama `page`/`pageSize` → `halaman`/`ukuranHalaman` (nama parameter `DailyReportsApi.daftar` — tidak tercantum di audit, tetap pecah kompilasi). |
| `repo/TugasRepo.kt` | `TaskRequest`+`TaskUpdateRequest` → `TaskSaveRequest` (A2); `api.daftarHarian(date=)` → `api.perHari(tanggal=)` (A3); `api.hapus(context=)` → `konteks=` (nama parameter `TasksApi.hapus`); helper mati `tostringIso` dibuang. |
| `repo/ProyekRepo.kt` | `api.daftar(lifecycle=, page=, pageSize=)` → `siklus=, halaman=, ukuranHalaman=` (A4 + nama parameter nyata). |
| `repo/Hasil.kt` | Keputusan audit A7 DIAMBIL: cabang `Konflik` kini `locked == false` → `GagalSementara` (409 P2002 tabrakan simpan bersamaan; satu-satunya `locked:false` di seluruh API web adalah `daily-input/route.ts:317-319` yang memang meminta dicoba ulang), selain itu tetap `GagalPermanen`. Semua 409 F2 (inbox "sudah diteruskan", remind cuti/terkunci, weekly) tidak menulis `locked:false` → perilaku F2 tidak berubah. |
| `repo/KepatuhanRepo.kt` | Ditambah `object KepatuhanDivisi` (`STATE_MASUK/TERLAMBAT/BELUM` + `labelState` → "Masuk"/"Terlambat"/"Belum masuk", nilai kawat menyamakan `MingguanDivisiDto`) — `MingguanStatusTest` (zona tes data) mengimpornya dari `core.data.repo` tetapi kelasnya belum pernah mendarat; tanpa ini tes zona tidak kompilasi. |

`MingguanRepo.kt` TIDAK disentuh: berkas itu berubah sendiri di tengah sesi
(penulis paralel F2/C3 sedang aktif — muncul helper `konversiObjek` antara dua
pembacaan saya). Versi di pohon saat pengamatan lolos verifikasi kompilasi
statis saya (§4). Pemiliknya agen F2.

## 4. Verifikasi statis ala C3 (tanpa Gradle)

`kotlinc` CLI tidak terpasang, jadi dipakai `kotlin-compiler-embeddable` 2.3.0
(= versi Kotlin proyek) + JBR Android Studio, dengan jar asli dari cache
Gradle (coroutines 1.9.0, serialization-json/core 1.9.0, retrofit 3.0.0,
room-common-jvm 2.8.4, junit 4.13.2, dagger 2.60.1, annotations 23.0.0,
android.jar platform 37, classes.jar hasil ekstrak AAR work/hilt-android/
room-runtime/datastore). Stub HANYA untuk verifikasi (di /tmp, bukan di pohon):
permukaan `okhttp3` (jar okhttp tidak ada di cache), `javax.inject`, dan
`androidx.hilt.work.HiltWorker` (artefak `androidx.hilt:hilt-work` memang belum
jadi dependensi — lihat §5 butir 1).

Hasil:
1. **Jalankan `OutboxProsesTest` (tes kunci B9): OK (8 tests)** — `OutboxProsesor`
   baru + `HasilKirim.dari` (dengan cabang A7) memenuhi seluruh kontrak:
   FIFO, 409 locked:true permanen, 422 permanen, luring/gagal sementara
   menaikkan percobaan tetap MENUNGGU, gagal satu tak menghentikan putaran.
2. Kompilasi statis seluruh `core/data` main + `core/network` main (API + DTO
   yang dipakai) + `core/domain` (Wib, Models, StatusProyek): **bersih**;
   satu-satunya temuan adalah peringatan lama di `ProyekRepo.kt:82`
   (`entity?.name` pada receiver non-null `ProjectDto.entity`) — bukan galat.
3. Kompilasi statis `sync/*` + `prefs/MkPrefs.kt` + `db/{MkDatabase,DbFactory}.kt`
   terhadap android.jar + work-runtime 2.12.0 + datastore 1.1.7 + room-runtime
   2.8.4: **bersih** (dengan stub HiltWorker).

## 5. Kebutuhan untuk parent (build.gradle.kts tidak disentuh)

1. **Dependensi baru `:core:data`**: `androidx.hilt:hilt-work` (+ `ksp`
   `androidx.hilt:hilt-compiler`) — belum ada alias di
   `gradle/libs.versions.toml`; sarankan versi androidx.hilt 1.3.0 (selaras
   `hiltNavigationCompose 1.3.0`). Tanpa ini `SyncWorker` tidak kompilasi di
   Gradle (verifikasi saya memakai stub).
2. **`:app` WorkManager + Hilt**: `MKApp.workManagerConfiguration` perlu
   `.setWorkerFactory(hiltWorkerFactory)` (inject `HiltWorkerFactory`) dan
   manifest menghapus initializer bawaan `androidx.startup`
   (WorkManagerInitializer) — persis rencana placeholder di `MKApp.kt`.
3. **Impor SesiViewModel**: `id.co.monitorkarya.app.sync.SyncScheduler` →
   `id.co.monitorkarya.core.data.sync.SyncScheduler` (atau pembungkus tipis
   `app.sync` yang mendelegasi). Tanda tangan sudah kompatibel — cukup satu
   baris impor.
4. `SyncWorker` sengaja hanya menyuntik `MkDatabase` + `Retrofit` + `MkPrefs`
   (semuanya SUDAH terikat di AppModule F0) dan membangun DAO/API/repositori
   sendiri — tidak menambah kebutuhan binding Hilt baru. Repositori
   (`@Inject constructor(dao: …)`) dan API lain tetap menunggu `@Provides`
   AppModule saat integrasi UI (sudah diketahui audit A5).
5. `kotlinx-coroutines-test` di testImplementation `:core:data` (temuan lama
   B9) — tetap belum ditambahkan.

## 6. Sisa menuju definisi selesai Fase 1 (bukan zona ini)

1. **Penjahit enqueuing belum ada siapa pun**: saat `HasilKirim.Luring`,
   ViewModel/UI (B4/B5/B7) harus menulis `OutboxEntity` (jenis dari
   `JenisOutbox`, payload = JSON DTO) lalu memanggil
   `SyncScheduler.jadwalkanSekaliSaatOnline`. Definisi selesai §1 butir 6 baru
   hidup setelah jahitan ini.
2. `UNGGAH_BUKTI` belum bisa lewat outbox (berkas tidak muat di payload JSON);
   `SyncWorker` membalasnya GagalPermanen dengan pesan jelas — butir 5 §1
   (unggah daring) tetap lewat jalur langsung `EvidenceApi`.
3. FASE1.md §3 tabel kontrak: baris `OutboxProsesor` dan `SyncScheduler` kini
   "mendarat" (diuji/stub-terverifikasi); `fase1/README.md` baris T5-B2 masih
   "belum ada" — boleh diperbarui pemilik dokumen (B9/parent).
