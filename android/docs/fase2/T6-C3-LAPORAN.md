# Laporan T6-C3 — data Fase 2: mingguan, penerimaan, kepatuhan

Zcode, 8 Oktober 2026. Lingkup: lapisan data Fase 2 di `android/core/data/`
HANYA berkas baru — tanpa git/jaringan/DB, tanpa gradle, tanpa menyentuh
`build.gradle.kts` maupun berkas agen lain.

## Berkas dibuat

| Berkas | Isi |
|---|---|
| `core/data/.../db/EntitiesFase2.kt` | `MingguanLaporanEntity` (tabel `mingguan_laporan`), `MingguanButirEntity` (`mingguan_butir`, indeks `laporanMingguanId`), `PenerimaanEntity` (`penerimaan`) — kolom sesuai spesifikasi tugas + konstanta status. |
| `core/data/.../db/DaosFase2.kt` | `MingguanLaporanDao`, `MingguanButirDao`, `PenerimaanDao` — upsert daftar/satu, baca `Flow` (semua/per divisi/per laporan/per jenis), `hapusTersinkronLama`, plus `hapusYangLama`/`hapusPerLaporan` (butir) dan `ambil` (penerimaan, untuk mempertahankan undoToken). |
| `core/data/.../repo/MingguanRepo.kt` | Baca Flow dari Room; `tarikArsip` (GET /api/weekly-reports berhalaman, maks 5×50), `tarikPapan` (GET /api/weekly-input), `serah`/`setujui` (POST action=submit/approve) jujur daring via `tulisApi` → `HasilKirim` (luring → `Luring`; 409/422 → `GagalPermanen` pesan server apa adanya). Sukses serah/setujui menyegarkan papan best-effort. |
| `core/data/.../repo/PenerimaanRepo.kt` | `tarik` (GET /api/inbox → Room; harian `H:<proyekId>`, mingguan `M:<divisiId>`, status BARU/SIAP/DITERUSKAN dari `readyToForward`/`forwardedAt`); `teruskan` (POST /api/inbox memakai `TeruskanRequest`, id laporan dari kolom `laporanId`) — 409/422 jadi `GagalPermanen` apa adanya; sukses menandai baris DITERUSKAN + simpan `undoToken` untuk Urungkan. |
| `core/data/.../repo/KepatuhanRepo.kt` | `tarik` (GET /api/admin/compliance) → `StateFlow<KepatuhanResponse?>` di memori (tanpa Room — potret harian, tidak ada entitas kurang); `ingatkanOrang`/`ingatkanDivisi`/`ingatkanSemua` (POST remind) → `HasilKirim`, 409 "sudah diingatkan"/kunci 17.00 dan 429 apa adanya. |

## Penyelarasan dengan hasil agen paralel (penting)

Tugas ini berjalan bersamaan dengan agen jaringan dan repo Fase 1; saat
pengerjaan, berikut sudah mendarat dan T6-C3 menyesuaikan diri kepadanya:

- `core/data/.../repo/Hasil.kt` (saudara): `HasilKirim`/`HasilBaca` +
  `bacaApi`/`tulisApi`/`isoKeEpochMillis`. "Hasil.Luring" pada kontrak tugas
  dipetakan ke `HasilKirim.Luring` (sesuai catatan Hasil.kt sendiri). T6-C3
  TIDAK mendefinisikan tipe hasil sendiri.
- Pola repo saudara (`LaporanRepo`/`ProyekRepo`/`TugasRepo`): konstruktor
  hanya DAO (`@Singleton @Inject`), API diteruskan sebagai parameter metode;
  pemetaan DTO→entitas lewat ekstensi privat. Diikuti persis.
- `core/network` (saudara): `InboxApi`, `AdminComplianceApi`, DTO
  `DtosFase2Admin.kt` (`InboxResponse`, `TeruskanRequest/Response`,
  `KepatuhanResponse`, `IngatkanRequest/Response`) dipakai langsung.
  `ApiError.kt` versi terbaru (Konflik ber-field) kompatibel.

## Jahitan untuk parent (integrasi)

1. **WeeklyReportsApi / WeeklyInputApi belum ada** di `core/network` (belum
   mendarat saat tugas ini selesai). `MingguanRepo` memakai bentuk
   `Response<JsonObject>` + parse defensif (pola `RingkasanViewModel` F0)
   supaya tidak tergantung DTO mingguan yang belum ada. Tanda tangan yang
   diharapkan (verifikasi kompilasi lulus dengan stub persis ini):

   ```kotlin
   interface WeeklyReportsApi {
       @GET("api/weekly-reports")
       suspend fun daftar(
           @Query("page") page: Int = 1,
           @Query("pageSize") pageSize: Int = 50,
           @Query("entityId") entityId: String? = null,
           @Query("statusHeader") statusHeader: String? = null,
           @Query("isoYear") isoYear: Int? = null,
           @Query("isoWeek") isoWeek: Int? = null,
       ): Response<JsonObject>
   }

   interface WeeklyInputApi {
       @GET("api/weekly-input")
       suspend fun papan(
           @Query("entityId") entityId: String? = null,
           @Query("week") week: String? = null,
       ): Response<JsonObject>

       @POST("api/weekly-input")
       suspend fun serahAtauSetujui(@Body badan: JsonObject): Response<JsonObject>
   }
   ```

   Bila agen jaringan mendaratkannya dengan DTO bertipe, sesuaikan
   `MingguanRepo` (pemetaan sudah terkonsentrasi di `simpanLaporan`/`keButir`
   dan helper parse privat di akhir berkas).

2. **MkDatabase belum mendaftarkan entitas/DAO baru** (berkas lama, tidak
   disentuh): tambahkan `MingguanLaporanEntity`, `MingguanButirEntity`,
   `PenerimaanEntity` + accessor `mingguanLaporanDao()`, `mingguanButirDao()`,
   `penerimaanDao()`, naikkan `version = 1` → `2`.
   `fallbackToDestructiveMigration(dropAllTables = true)` masih aktif (fase
   awal) sehingga aman tanpa migrasi bernomor; sebelum rilis ganti migrasi
   sungguhan. `exportSchema = true` akan menulis skema 2.json saat KSP jalan.

3. **DI di :app** (AppModule): sediakan DAO baru dari `MkDatabase` dan repo
   (`MingguanRepo`, `PenerimaanRepo`, `KepatuhanRepo` sudah `@Inject`;
   `KepatuhanRepo` tanpa dependensi). API retronya dipegang AppModule dan
   diteruskan per panggilan mengikuti pola repo Fase 1.

4. **Dependensi build.gradle.kts: TIDAK ADA yang baru.** Room, Retrofit,
   kotlinx.serialization, coroutines, javax.inject sudah dipakai modul ini
   (konfigurasi saudara). Tidak ada permintaan tambahan.

## Keputusan desain & penyimpangan kecil dari spesifikasi

- **`penerimaan.laporanId` (kolom tambahan di luar spesifikasi, wajib):**
  POST /api/inbox meminta id *laporan* (`TeruskanRequest.id`), bukan id
  proyek/divisi; tanpa kolom ini tombol teruskan tak bisa bekerja. Baris tanpa
  laporan (PIC belum kirim) bernilai null → `teruskan` menolak ramah
  (GagalPermanen) sebelum menyentuh jaringan.
- **Id sintetis penerimaan** `H:<proyekId>` / `M:<divisiId>`: baris antrean
  berakar pada proyek/divisi (laporan bisa belum ada), sehingga PK harus
  stabil lintas penyegaran; upsert mengganti baris yang sama.
- **`mingguan_butir` tanpa `tersinkronPada`** (sesuai spesifikasi): pembersihan
  per laporan lewat `hapusYangLama(id, pertahankan)`. Daftar kosong diarahkan
  ke `hapusPerLaporan` karena SQLite menolak `IN ()`.
- **Pembersihan arsip pakai ambang 7 hari** (bukan "hapus yang tak ikut
  tersegar" seperti `ProyekRepo`): `tarikArsip` boleh tersaring
  (statusHeader/minggu), penghapusan cermin-setia akan menghapus baris di luar
  saringan.
- **`entitasNama` baris penerimaan dari pemanggil** (`tarik(api, entitasNama)`):
  respons /api/inbox tidak memuat nama entitas per baris (Admin PT terpaku
  satu PT). TI boleh mengosongkannya.
- **undoToken dipertahankan saat penyegaran** hanya untuk baris DITERUSKAN —
  "Urungkan" tetap hidup lintas tarik ulang (jendela validitas 15 menit
  tetap keputusan server).
- **KepatuhanRepo menyimpan DTO langsung** (`StateFlow<KepatuhanResponse?>`)
  tanpa menyalin pohon model — potret harian, tanpa Room, tanpa transformasi;
  dokumentasi DTO di DtosFase2Admin lengkap untuk konsumen UI.
- **Serah/setujui tanpa outbox** (jujur daring, sesuai kontrak tugas): saat
  luring balik `HasilKirim.Luring` dan cache tidak diubah. Pengantrean
  WorkManager/outbox menyusul pada tugas sinkronisasi.
- `serah`/`setujui` sukses → penyegaran papan best-effort; kegagalannya tidak
  membatalkan tindakan yang sudah diterima server (catatan di KDoc).

## Verifikasi

- **kotlinc berkelaspath ad-hoc** (JBR Android Studio + jar dari gradle
  cache; bukan gradle): kelima berkas T6-C3 + `Hasil.kt` + `InboxApi` +
  `AdminComplianceApi` + `DtosFase2Admin` + `Wib` + `ApiError` +
  `JsonConfig` dikompilasi dengan stub WeeklyReportsApi/WeeklyInputApi di
  atas → **nol galat pada berkas T6-C3**. Galat tersisa hanya di `ApiError.kt`
  (kelas okhttp tidak ada di classpath ad-hoc; di build asli modul tersebut
  sudah bergantung okhttp — bukan masalah kode).
- Gradle/build tidak dijalankan (dilarang); uji unit menyusul tugas
  pengujian (pola MockWebServer Fase 1, termasuk kasus 409/422/Luring untuk
  `teruskan`, `serah`, `setujui`, `ingatkan`).

## Lokasi

- `android/core/data/src/main/kotlin/id/co/monitorkarya/core/data/db/EntitiesFase2.kt`
- `android/core/data/src/main/kotlin/id/co/monitorkarya/core/data/db/DaosFase2.kt`
- `android/core/data/src/main/kotlin/id/co/monitorkarya/core/data/repo/MingguanRepo.kt`
- `android/core/data/src/main/kotlin/id/co/monitorkarya/core/data/repo/PenerimaanRepo.kt`
- `android/core/data/src/main/kotlin/id/co/monitorkarya/core/data/repo/KepatuhanRepo.kt`
