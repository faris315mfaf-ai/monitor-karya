# E — Idempotensi tulis di Android (outbox + kirim daring langsung)

Agen Android gelombang E, 13 Oktober 2026. Cabang `claude/perbaiki-bug-sisa`, tanpa commit.
Menuntaskan [E-IDEMPOTENSI](E-IDEMPOTENSI.md) §6 dan menutup batas at-least-once di
[B2-OUTBOX-PIC](B2-OUTBOX-PIC.md) §9 butir 1 (entri/bukti ganda bila proses mati atau koneksi
putus setelah server sukses).

## 0. Ringkas

| Butir | Hasil | Berkas utama |
| --- | --- | --- |
| Header di kawat | `@Header("Idempotency-Key") kunciIdempotensi: String? = null` pada `TasksApi.buat/ubah/hapus`, `EntriLaporanApi.tambahEntri/ubahEntri`, `EvidenceApi.unggah`, `DailyInputApi.simpan`, `LaporanPicApi.kirim`. null = header absen (perilaku lama) | `core/network/api/*.kt`, `core/network/Idempotensi.kt` |
| Kunci tersimpan | kolom baru `outbox.kunciIdempotensi TEXT` (Room **v5**), diisi UUID v4 SEKALI saat `AntreanOutbox.antre/antreBukti`, tidak pernah dibuat ulang | `db/Entities.kt`, `outbox/AntreanOutbox.kt`, `outbox/KunciIdempotensi.kt` |
| Migrasi | `MIGRASI_4_5` nyata: `ADD COLUMN` + `UPDATE … WHERE kunciIdempotensi IS NULL` (UUID v4 per baris), `5.json` diekspor | `db/MigrasiMk.kt`, `schemas/…/5.json` |
| Pengiriman | `PengirimLaporanPic` + `SyncWorker` mengirim kunci tersimpan untuk 8 jenis (`JenisOutbox.BERIDEMPOTENSI`); `OutboxProsesor` mengisi kunci baris yang masih null SEBELUM kiriman pertama | `outbox/PengirimLaporanPic.kt`, `sync/SyncWorker.kt`, `outbox/OutboxProsesor.kt`, `repo/TugasRepo.kt`, `repo/LaporanRepo.kt` |
| Ulangan | 200 + `Idempotency-Replayed: true` = sukses biasa (`HasilKirim.Sukses(ulangan = true)`); `saatSukses` tetap jalan → `"lokal:<n>"` diganti id server dari badan pertama | `repo/Hasil.kt` |
| Hapus 404 | 404 pada `HAPUS_ENTRI`/`HAPUS_TUGAS` setelah percobaan sebelumnya ambigu = selesai (`hapusApi`) | `repo/Hasil.kt` |
| Daring langsung | Gerbang laporan + centang meja kerja mengirim kunci; bila jatuh ke antrean karena galat jaringan, pesan antrean memakai kunci + badan YANG SAMA. Entri baru: satu kunci per Sheet (klik ganda/ulang tidak menggandakan) + penjaga klik ganda | `app/ui/laporan/GerbangLaporanPic.kt`, `LaporanViewModel.kt`, `app/ui/mejakerja/MejaKerjaViewModel.kt` |

## 1. Daur hidup kunci

```
aksi pengguna ──► kunci K (UUID v4)
   │  entri baru: K dibuat saat Sheet "Tambah entri" dibuka (LembarEntri.kunciTambah)
   │  aksi lain : K dibuat per aksi di GerbangLaporanPic / MejaKerjaViewModel.centang
   ▼
daring dulu: POST/PUT/DELETE dengan header K
   ├─ 2xx / 409 / 422 …  → selesai seperti dulu (K tidak dipakai lagi)
   └─ IOException (server MUNGKIN sudah commit)
        ▼
      AntreanOutbox.antre(…, kunciIdempotensi = K)   ← badan sama persis
        ▼
      outbox.kunciIdempotensi = K  (Room)
        ▼
      SETIAP percobaan (luring, 5xx, backoff, proses mati, "Kirim ulang") kirim K
        ▼
      server: K belum tercatat → proses normal; sudah tercatat → 200 pertama + Replayed
```

- Tulisan yang langsung diantre (luring diketahui, entri lokal, ada pesan tertunda) mendapat K
  baru dari `kunciIdempotensiAntre(null)`.
- `centang` meja kerja: K daring diwariskan HANYA ke `UBAH_TUGAS` dengan badan `badanCentang`
  yang sama. Bila centang dibangun dari `UBAH_ENTRI` tertunda (badan lain) dipakai K baru —
  kunci sama + badan beda akan dibalas server dengan respons badan lama.
- Kunci tidak sah (bukan pola server) tidak pernah dikirim: `headerIdempotensi()` → null
  (server akan 400). Jenis mingguan (`SIMPAN_BUTIR_MINGGUAN`, `HAPUS_BUTIR_MINGGUAN`,
  `AKSI_MINGGUAN`) tetap diberi kunci di baris, tetapi header tidak dikirim (rute belum mendukung).

## 2. Room v5 — baris lama

`MigrasiMk.VERSI = 5`, `MIGRASI_4_5`:

```sql
ALTER TABLE `outbox` ADD COLUMN `kunciIdempotensi` TEXT
UPDATE `outbox` SET `kunciIdempotensi` = <SQL_UUID_V4> WHERE `kunciIdempotensi` IS NULL
```

**Keputusan: baris lama DIISI saat migrasi** (bukan dibiarkan tanpa header seperti saran awal
E-IDEMPOTENSI §6.1). Alasan: server belum pernah melihat kunci itu, jadi percobaan pertama sesudah
pembaruan diproses persis seperti dulu — dan sejak itu setiap ulangan terlindungi. Membiarkan null
justru mempertahankan risiko duplikat untuk antrean yang sedang menunggu saat aplikasi diperbarui.
Kiriman yang mungkin sudah sukses SEBELUM pembaruan tetap tidak terlindungi (server tak pernah
mencatatnya) — batas yang sama dengan perilaku lama.

Jaring kedua: baris yang tetap null (ditulis jalur lain/data rusak) diisi
`OutboxProsesor.pastikanKunci` → `OutboxDao.isiKunciIdempotensi` (UPDATE hanya bila masih null,
lalu dibaca ulang) SEBELUM kiriman pertama, sehingga proses yang mati setelah kiriman itu tetap
mengulang dengan kunci yang sama.

`SQL_UUID_V4` = `randomblob`/`hex`/`substr` per baris dengan nibble versi `4` dan varian
`8|9|a|b`; memakai `random() & 3`, bukan `abs(random())` (galat luapan pada INT64_MIN). Semua
fungsi tersedia di SQLite Android API 26.

## 3. Pemetaan hasil per aksi

| Aksi (jenis) | Rute | Ulangan dengan kunci berlaku (≤7 hari) | Tanpa catatan server (kunci kedaluwarsa / pra-E) | Keputusan |
| --- | --- | --- | --- | --- |
| Tambah entri (`TAMBAH_ENTRI`) | POST /api/tasks | 200 Replayed → Sukses; id lokal diganti id server dari badan pertama | entri ganda mungkin (batas lama) | Sukses biasa |
| Tambah tugas (`TAMBAH_TUGAS`) | POST /api/tasks | 200 Replayed → Sukses, `TaskDto` dicerminkan ke Room | sama | Sukses biasa |
| Unggah bukti (`UNGGAH_BUKTI`) | POST /api/evidence/upload | 200 Replayed (dijawab sebelum berkas dibaca) → Sukses; berkas lokal disapu | bukti ganda mungkin | Sukses biasa |
| Ubah entri/tugas (`UBAH_ENTRI`, `UBAH_TUGAS`) | PUT /api/tasks | 200 Replayed → Sukses (bukan 409 beku palsu) | 409 beku / 404 tetap **GAGAL** tampil | Tidak menebak: tanpa catatan server, klien tidak tahu apakah suntingan sudah masuk sebelum beku → pesan server tampil, pengguna memilih "Buang"/"Kirim ulang" |
| Hapus entri/tugas (`HAPUS_ENTRI`, `HAPUS_TUGAS`) | DELETE /api/tasks | 200 Replayed `{ok:true}` → Sukses | **404 setelah percobaan sebelumnya ambigu → Sukses** ("Sudah terhapus di server…"); 404 pada percobaan pertama → GAGAL | Tujuan hapus (data tidak ada) sudah tercapai. "Ambigu" = `percobaan > 0` pada baris MENUNGGU, yaitu kiriman sebelumnya berakhir luring/IOException atau gagal sementara (5xx/429/401). "Kirim ulang" setelah GAGAL mereset `percobaan` → 404 berikutnya GAGAL lagi (jujur). |
| Kirim laporan / simpan draf (`KIRIM_LAPORAN`) | PUT /api/daily-input | 200 Replayed → Sukses; `submittedAt` TIDAK bergeser | `submittedAt` bisa bergeser / 409 beku → GAGAL tampil | Sukses biasa; 409 tetap final |
| Semua | — | `409 locked:false` "sedang diproses" (balapan kunci sama) → GagalSementara + backoff | | sama dengan P2002 |
| Semua | — | `400` kunci tidak sah / `422` kunci rute lain → GagalPermanen | | bug klien, tidak diulang otomatis |

## 4. Kirim daring langsung (gerbang)

| Aksi | Kunci |
| --- | --- |
| Tambah entri (Sheet) | `LembarEntri.kunciTambah` dibuat di `bukaTambah()`, dipakai setiap "Simpan" selama entri belum tersimpan; ikut ke `TAMBAH_ENTRI` bila jatuh ke antrean. Setelah sukses (id server) atau diantre (id lokal), simpan berikutnya = UBAH dengan kunci baru. |
| Ubah/hapus entri, kirim/simpan laporan, unggah bukti | kunci baru per panggilan gerbang; diwariskan ke pesan antrean bila galat jaringan |
| Centang meja kerja | kunci baru per centang; diwariskan ke `UBAH_TUGAS` (badan sama) |
| Hapus laporan, hapus bukti server, ajukan buka kunci, urungkan | tanpa kunci (rute tidak didukung / selalu daring) |

Tambahan: `LaporanViewModel.simpanEntri` dan `kirimLaporan` kini menolak klik kedua selama kiriman
pertama berjalan (`sibuk`), sebelumnya hanya bergantung pada tombol nonaktif setelah komposisi ulang.

Kunci yang sama setelah respons non-2xx aman: server hanya mencatat 2xx, jadi "Simpan" ulang
setelah 422/409 (isian diperbaiki) diproses sebagai permintaan baru.

## 5. Tes

| Tes | Isi |
| --- | --- |
| `core/network` `IdempotensiApiTest` (5, MockWebServer) | header `Idempotency-Key` terkirim di POST/PUT/DELETE /api/tasks (dua antarmuka), PUT /api/daily-input (dua antarmuka), POST /api/evidence/upload; kunci null = header absen; respons `Idempotency-Replayed: true` terdekode sama + `Idempotensi.ulangan`; `kunciBaru` = UUID v4 unik & lolos pola server; `sah` menolak bentuk tidak sah |
| `core/data` `OutboxIdempotensiTest` (10, Retrofit + OkHttp sungguhan, server = interceptor berskrip) | TAMBAH putus setelah commit → ulangan kunci SAMA → Replayed → id lokal penerus diganti `t-srv`, penerus memakai kuncinya sendiri; `Sukses(ulangan=true)`; UNGGAH 503 → backoff → kunci sama; baris tanpa kunci diisi sebelum kirim pertama, dibuat tepat sekali; HAPUS putus → 404 = selesai; HAPUS 404 pertama = GAGAL; UBAH putus → 409 = GAGAL; 409 `locked:false` = sementara; header hanya untuk 8 jenis + kunci sah; pewarisan kunci daring |
| `core/data` `MigrasiMkTest` (+1 → 5) | `MIGRASI_4_5` == `PERNYATAAN_4_5`; kolom outbox v4 + `kunciIdempotensi TEXT null` == 5.json; PK/indeks outbox & tabel lain identik; UPDATE hanya kolom baru `WHERE … IS NULL`, tanpa DELETE/DROP/INSERT/CREATE |
| Uji manual SQLite nyata (sqlite3/Python, bukan berkas repo) | createSql 4.json + 300 baris → `PERNYATAAN_4_5` → semua kolom lama identik, 300 kunci unik berpola UUID v4, `PRAGMA table_info` semua tabel == 5.json, UPDATE ulang tidak mengubah kunci |

Tes lama disesuaikan: `FakeOutboxDao.isiKunciIdempotensi`, tanda tangan API palsu di
`OutboxEntriPicTest` dan `TugasRepoTarikTest`.

## 6. Verifikasi

Lewat `gradle-kunci.sh --init-script scratchpad/skema-room.init.gradle` (ekspor skema, berkas
gradle repo tidak diubah): `:core:data:testDebugUnitTest :core:network:testDebugUnitTest
:app:testDebugUnitTest :app:assembleDebug` → **BUILD SUCCESSFUL** (termasuk
`:app:compileDebugKotlin` + `hiltJavaCompileDebug`; app 46 tes, core:data 48, core:network hijau).
Belum diuji di perangkat/emulator (dilarang).

## 7. Batas & tindak lanjut

- Badan respons > 64 KiB disimpan server sebagai `{ok, idempotentSummary, resourceId}`; DTO
  `EntriSimpanResponse.task` wajib → ulangan semacam itu akan terbaca "Jawaban server tidak
  dikenali" (GAGAL). Server menyatakan ini tidak terjadi pada lima rute dengan batas medan
  sekarang; bila batas medan dinaikkan, buat `task` opsional + baca `resourceId`.
- Kunci server berlaku 7 hari = sama dengan umur antre outbox; "Kirim ulang" pesan GAGAL berumur
  > 7 hari mengirim kunci yang mungkin sudah disapu → diproses sebagai baru (aman, karena GAGAL
  berarti server tidak pernah mencatat 2xx — kecuali GAGAL karena kedaluwarsa 7 hari setelah
  kiriman ambigu).
- Rute mingguan (`/api/weekly-input`) belum idempoten di server; outbox sudah menyimpan kunci
  untuk pesan mingguan sehingga cukup menambah jenisnya ke `JenisOutbox.BERIDEMPOTENSI` dan
  parameter `@Header` di `WeeklyInputApi` begitu server mendukung.
- Permanenkan ekspor skema Room di `core/data/build.gradle.kts` (masih lewat init script, lihat
  A1-LURING §4).
