# C5 — Perbaikan core + laporan harian/meja kerja PIC (gelombang C)

Tanggal: 13 Okt 2026 · Cabang `claude/perbaiki-bug-sisa` (tanpa commit) · Sumber: [C5-QA-CORE-PIC.md](C5-QA-CORE-PIC.md),
butir "butuh parent" di [C3-PERBAIKAN.md](C3-PERBAIKAN.md), serta tambahan dari peninjau C4.

Zona: `core/data/**` (kecuali `repo/KotakMasukRepo.kt`), `core/network/**`, `core/domain/**`, `app/ui/laporan/**`,
`app/ui/mejakerja/**`, `app/vm/**`. Designsystem, feature, dan gradle tidak disentuh.

## Gerbang

`gradle-kunci.sh --init-script scratchpad/skema-room.init.gradle :core:data:testDebugUnitTest :core:network:testDebugUnitTest
:core:domain:testDebugUnitTest :app:testDebugUnitTest :app:assembleDebug` → **BUILD SUCCESSFUL**, termasuk `hiltJavaCompileDebug`.

| Modul | Tes | Gagal |
|---|---|---|
| core:data | 70 | 0 |
| core:network | 70 | 0 |
| core:domain | 17 | 0 |
| app | 73 | 0 |

Init script diperlukan untuk mengekspor `schemas/…/6.json`. Ekspor skema permanen di `core/data/build.gradle.kts` masih
menjadi butir parent (A1-LURING §4). `ktlintCheck` merah di seluruh basis kode, termasuk berkas yang tidak disentuh,
jadi tidak dipakai sebagai gerbang. Emulator tidak dipakai.

## Room v6 (`MIGRASI_5_6`, migrasi nyata)

- `ALTER TABLE outbox ADD COLUMN pemilikUid TEXT`
- `CREATE TABLE peta_id_lokal(idLokal PK, idServer, dibuatPada)`. Teksnya sama dengan `createSql` di `6.json`.
- Tanpa DROP/DELETE. `MigrasiMkTest.migrasi5ke6…` mengunci kolom outbox, PK, tabel lain, dan SQL.
- Status outbox baru: `MENGIRIM` (klaim). Semua kueri "aktif" (amati, gantiTeksPayload, aktifMemuat, payloadAktif,
  jumlahMenunggu) ikut menghitungnya. UI menampilkannya sebagai "Menunggu kirim".

## TINGGI

| ID | Status | Perbaikan |
|---|---|---|
| **T2** | Diperbaiki | Lihat rincian T2 di bawah tabel. |
| **T1** | Diperbaiki | Lihat rincian T1 + S1 di bawah tabel. |
| **T4** | Diperbaiki | Lihat rincian T4 di bawah tabel. |
| **T3** | Diperbaiki | Lihat rincian T3 di bawah tabel. |

### T2 — tepat satu pemroses antrean

`sync/KunciSinkron` menyediakan dua Mutex proses:
- `kerja` membungkus seluruh `SyncWorker.doWork`, baik pekerja sekali-jalan maupun berkala. Pekerja kedua **menunggu**,
  tidak dilewati, sehingga pemicunya tidak hilang.
- `antrean` membungkus `OutboxProsesor.prosesAntrean`.

Sebagai jaring kedua, setiap baris diklaim di Room lebih dulu (`klaim`: `UPDATE … SET status='MENGIRIM' WHERE
status='MENUNGGU'`). Hasil 0 berarti baris tidak dikirim.

Klaim yatim (proses mati di tengah kiriman) dipulihkan di awal putaran. Barisnya kembali MENUNGGU dengan percobaan +1,
dan kunci idempotensinya tetap sama. Bila pekerja dibatalkan, klaim dilepas di dalam blok `NonCancellable`.

`SyncScheduler.kebijakanSekali` menentukan kebijakan penjadwalan:
- Bila pekerja **sedang berjalan** dan tidak ada yang menunggu: `APPEND_OR_REPLACE`. Satu putaran penerus disambung,
  sehingga celah KEEP A1 §7 tertutup.
- Selain itu: `KEEP`.

Semua jadwal dan pembatalan berjalan berurutan di satu utas. Pembatalan mengembalikan `Future`.

### T1 + S1 — peta id lokal ke id server

Saat `TAMBAH_ENTRI` sukses, pengirim menulis peta `lokal:<n>` → id server **sebelum** baris ditandai berhasil.
Sebagai cadangan R3, id juga dibaca dari `resourceId`.

`PengirimLaporanPic` menerjemahkan id lokal pada UBAH/HAPUS/UNGGAH lewat peta itu, lalu menulis ulang payload baris.
Bila id lokal belum ada di peta:
- TAMBAH masih di antrean → pesan *menunggu*, bukan gagal permanen.
- TAMBAH sudah tidak ada → GAGAL "Entri asal belum tersimpan".

`GerbangLaporanPic` menerjemahkan id lokal sebelum memutuskan apakah kiriman daring atau diantre.
`LaporanViewModel` mengganti `idTersimpan` di Sheet begitu peta terisi.

**S1, hapus entri lokal:**

| Keadaan TAMBAH | Tindakan |
|---|---|
| GAGAL, atau MENUNGGU dan belum pernah dicoba | Pesan antrean + penerusnya + berkas bukti dibuang. Tidak ada yang dikirim. Kueri `hapusBilaBelumDicoba` atomik. |
| Sudah sukses | DELETE ke id server. |
| Sedang atau pernah dicoba (ambigu) | HAPUS diantre di belakangnya. |
| Tidak ada di antrean maupun di peta | Sukses jujur: entri memang tidak pernah sampai ke server. |

### T4 — potret dikunci per uid dan tanggal

`CacheLayar` menyimpan dan membaca dengan kunci `u:<uidSesi>|…`. Tanpa sesi aktif, tidak ada yang disimpan atau dibaca.
Kunci layar memakai tanggal WIB nyata:
- `laporan:meja:<tgl>` dan `meja-kerja:pic:<tgl>` (sebelumnya `laporan:meja:hari-ini`)
- `meja-kerja:agenda:<proyek>:<tgl>`

**Mulai luring pada hari baru:**
- Laporan: `mejaHariBaru` membangun meja hari ini dari potret "hari ini" terakhir.
  - Proyek sama, tanpa laporan, entri, atau buka kunci.
  - `lockAt` digeser sebanyak selisih hari, jadi jam batas PT tetap berlaku.
  - Entri kosong untuk hari itu.
  - Tulisan baru memakai tanggal hari ini.
- Meja kerja: galat luring yang jujur.

Layar Laporan memuat ulang saat `ON_RESUME` bila tengah malam WIB sudah lewat.

### T3 — antrean akun lama tidak terkirim dengan sesi akun baru

Outbox mendapat kolom `pemilikUid`, diisi `MkPrefs.uidSesi` saat diantre. `uidSesi` adalah kunci DataStore baru.
- **Diisi:** tepat sebelum status Siap terbit, setelah pembersihan.
- **Dikosongkan:**
  - di awal `masuk()`;
  - pada setiap status non-Siap;
  - saat `sesiBerakhir`;
  - saat keluar.

Pekerja memeriksa `pemilikSah(pemilik, uidSesi)` tepat sebelum **setiap** kiriman. Pesan milik orang lain tidak dikirim
dan tidak memicu retry. Baris pra-v6 diadopsi pengguna yang sama saat Siap (`adopsiAntrean`).

Urutan di `masuk()` (`siapkanMasuk`):
1. Lupakan uid.
2. `mesin.jedaDanTunggu()`: batalkan WorkManager, tunggu `Future` pembatalan, lalu tunggu `KunciSinkron.kerja`.
3. Baru setelah itu `authApi.login`, yang menyimpan cookie baru.

`hentikanDanBersihkan` (`bersihkanAkun`) berjalan begini:
1. Batalkan dan tunggu pekerja.
2. Sambil memegang `kerja`, jalankan `clearAllTables` lalu hapus berkas bukti.
3. Setel ulang stempel sinkron.

## SEDANG / RENDAH

| ID | Status | Perbaikan |
|---|---|---|
| S1 | Diperbaiki | Lihat rincian T1 + S1 di atas. |
| S2 | Diperbaiki | `OpenableColumns.SIZE` dibaca dulu. `bacaTerbatas` berhenti tepat setelah 20 MB, tanpa `readBytes` utuh. Kompres juga menangkap `OutOfMemoryError`. |
| S3 | Diperbaiki | `tentukanMime`: mime generik (octet-stream, binary, kosong) ditebak dari nama. `image/*` apa pun (HEIF dsb.) dikompres ke JPEG dulu. Berkas ditolak hanya bila tetap tidak diizinkan server. |
| S4 | Diperbaiki | Pada API 26–27, dekode memakai `RGB_565` + `inSampleSize`, lalu skala dan putar sesuai orientasi EXIF (`derajatDariOrientasi`). |
| S5 | Diperbaiki | `LaporanViewModel` + `SavedStateHandle` menyimpan isian Sheet, id tersimpan, `kunciTambah`, proyek terpilih, dan tanggal (`LembarTersimpan`). Status sementara tidak disimpan. Sheet ini tidak memuat sandi. |
| S6 | Diperbaiki | `MkClient`: 401 atau 403 menghapus sesi dan memancarkan peristiwa **hanya bila** cookie yang dikirim sama dengan cookie yang tersimpan kini. |
| R1 | Diperbaiki | Pesan di belakang GAGAL final dihitung `tertahanGagal`, dan pesan bukan milik sesi dihitung `bukanPemilik`. Keduanya tidak memicu `Result.retry`. |
| R2 | Diperbaiki | Cookie dipasang lewat *network interceptor* dan hanya ke host asal panggilan. Redirect lintas host berjalan tanpa Cookie. Peristiwa sesi tetap di tingkat aplikasi, karena badan sudah didekompresi. |
| R3 | Diperbaiki | `EntriSimpanResponse.task` kini opsional + `resourceId`. Pengirim dan gerbang memakai `resourceId`. Bila keduanya kosong, tampil "Jawaban server tidak dikenali". |
| R4 | Diperbaiki (peringatan) | Pesan yang kedaluwarsa setelah kiriman terputus kini membawa `PESAN_KEDALUWARSA_AMBIGU`: "mungkin sudah tersimpan di server; periksa sebelum kirim ulang". |
| R5 | Tidak diubah | Bertentangan dengan aturan desain pemilik "konfirmasi hanya untuk hapus" (CLAUDE.md). Isian kini bertahan saat proses mati (S5). Butuh keputusan pemilik. |
| R6 | Diperbaiki | Hapus entri, hapus bukti, dan unggah bukti memakai penjaga klik ganda yang disetel sinkron sebelum `launch`. |
| R7 | Diperbaiki | `Wib.kunciHarian` dan `terkunciHarian` (17.00 tetap) dihapus. Tidak ada pemakai. |

## Butir parent C3 dan tambahan peninjau C4

- **C3-T3 lanjutan (uid di kunci CacheLayar):** selesai, lihat T4.
- **C3-R6 / C4 (1), KepatuhanRepo:** berkas `core/data/repo/KepatuhanRepo.kt` dihapus.
  - Repo itu kode mati: singleton yang memegang data akun di memori tanpa reset.
  - Tidak ada pemakai. Graf Hilt hijau setelah penghapusan.
- **C4 (2), keluar membersihkan Room dan CacheLayar:** terverifikasi. Rantainya:
  1. `SesiViewModel.keluar()` memanggil `prosesKeluar`.
  2. `prosesKeluar` memanggil `bersihkanDataAkun()`.
  3. `bersihkanDataAkun()` memanggil `MesinSinkron.hentikanDanBersihkan()`, yang menjalankan `db.clearAllTables()`.
     Ini mencakup seluruh entitas: proyek, laporan, tugas, eskalasi, outbox, mingguan, penerimaan, `cache_layar`,
     dan `peta_id_lokal`.
  4. Berikutnya `BerkasAntre.hapusSemua()`, cache gambar Coil, profil, dan `uidSesi` dibersihkan.

  Uji JVM mengunci urutan ini di dua tempat. `KeluarMasukC5Test` memastikan pembersihan berjalan sebelum TanpaSesi,
  dan keluar tetap jalan walau pembersihan gagal. `PemrosesTunggalTest` menguji `bersihkanAkun`: menunggu pekerja,
  mengosongkan sambil memegang kunci, dan tetap jalan bila pekerja macet. `clearAllTables` sendiri tidak bisa diuji di
  JVM tanpa Robolectric atau androidTest. Sebagai sabuk kedua, potret yang mungkin tersisa terkunci uid lama sehingga
  tidak terbaca akun lain.
- **R4 C3 (warna seri):** bukan zona agen ini (designsystem).

## Tes JVM baru (32)

- **`core/data` `PemrosesTunggalTest` (13):**
  - T2: dua pemroses bersamaan mengirim tiap pesan tepat sekali, dengan puncak paralel 1; klaim gagal → tidak dikirim;
    klaim yatim dipulihkan ambigu; pembatalan melepas klaim; kebijakan nama unik.
  - T3: `pemilikSah`; antrean akun A tidak terkirim saat sesi B atau saat uid kosong; adopsi; urutan `bersihkanAkun`
    dan jalur pekerja macet.
  - T4: kunci per uid + tanggal.
  - R1, R4.
- **`core/data` `OutboxEntriPicTest` (+4):** bukti, ubahan, dan hapus yang dibuat SESUDAH TAMBAH terkirim memakai id
  server lewat peta; id lokal yang TAMBAH-nya masih antre → menunggu; ulangan ringkas memakai `resourceId`; buang entri
  lokal hanya bila belum pernah dicoba.
- **`core/data` `MigrasiMkTest` (+1):** 5→6.
- **`core/network` `SesiCookieC5Test` (4):** S6 401 basi tidak menghapus cookie baru; 401 atas sesi sama tetap
  mengakhiri; R2 redirect lintas host tanpa Cookie (MockWebServer).
- **`app` `C5LaporanTest` (7):** meja hari baru (T4: tanggal, `lockAt` bergeser, tanpa laporan kemarin, terkunci bila
  lewat jam PT, 24/7, hanya untuk potret hari sebelumnya); S5 bolak-balik isian; S3 mime; S2 batas baca; S4 EXIF.
- **`app` `KeluarMasukC5Test` (3):** urutan masuk dan keluar.

## Batas yang diketahui

- Setelah pembaruan aplikasi, `uidSesi` baru terisi saat aplikasi dibuka (Siap). Sampai saat itu pekerja latar tidak
  mengirim antrean. Ini disengaja: lebih aman daripada menebak pemilik.
- Meja kerja PIC pada hari baru yang luring menampilkan galat luring, bukan meja sintetis. Entri hari baru diisi lewat
  layar Laporan harian.
- Meja hari baru tidak tahu hari kerja PT. Kiriman tetap dinilai server: 409 tampil "Gagal kirim".
- `buang()` manual atas pesan yang sedang MENGIRIM tetap menghapus barisnya. Perilaku lama ini dipertahankan.

## Berkas

**Baru:**
- `core/data/sync/KunciSinkron.kt`
- `app/ui/laporan/MejaHariBaru.kt`, `app/ui/laporan/LembarTersimpan.kt`
- `core/data/schemas/…/6.json`
- Tes: `PemrosesTunggalTest`, `SesiCookieC5Test`, `C5LaporanTest`, `KeluarMasukC5Test`

**Diubah:**
- `core/data/db/{Entities, Daos, MkDatabase, MigrasiMk}.kt`
- `core/data/outbox/{OutboxProsesor, PengirimLaporanPic, AntreanOutbox}.kt`
- `core/data/sync/{SyncScheduler, SyncWorker, MesinSinkron}.kt`
- `core/data/repo/CacheLayar.kt`, `core/data/prefs/MkPrefs.kt`
- `core/network/MkClient.kt`, `core/network/dto/DtosFase1.kt`
- `core/domain/time/Wib.kt`
- `app/ui/laporan/{GerbangLaporanPic, LaporanViewModel, LaporanHarianScreen, PenyiapBukti, TumpangAntrean}.kt`
- `app/ui/mejakerja/MejaKerjaViewModel.kt`
- `app/vm/{SesiViewModel, TransisiSesi}.kt`
- Tes lama yang disesuaikan: `FakeOutboxDao`, `OutboxEntriPicTest`, `OutboxIdempotensiTest`, `MigrasiMkTest`,
  `EntriLaporanA1Test`, `IdempotensiApiTest`

**Dihapus:**
- `core/data/repo/KepatuhanRepo.kt`
