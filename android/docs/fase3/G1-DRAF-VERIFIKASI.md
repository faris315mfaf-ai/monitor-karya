# G1 — Draf otomatis Sheet sunting dan verifikasi emulator (13 Okt 2026)

Masukan:
- Keputusan pemilik 13 Okt 2026: suntingan yang ditinggalkan menjadi **draf otomatis** tanpa dialog. Aturan "konfirmasi hanya untuk hapus" tetap berlaku.
- [C5-QA-CORE-PIC.md](C5-QA-CORE-PIC.md) R5.
- [E2E-R2-PERBAIKAN.md](E2E-R2-PERBAIKAN.md), butir yang sebelumnya baru diuji lewat kode atau JVM.

Lingkup: `android/app/**` dan `android/core/**`. `feature/**`, `designsystem`, server, dan gradle tidak disentuh. Tidak ada commit, push, atau deploy.

Build lewat skrip mutex (`gradle-kunci.sh testDebugUnitTest :app:assembleDebug -Pmk.baseUrl=http://127.0.0.1:3100/`): **BUILD SUCCESSFUL**, 629 tes unit di semua modul, 0 gagal. APK terpasang di `emulator-5554`.

## 1. Draf otomatis

### Perilaku

| Sheet | Kunci draf (uid sesi aktif + …) | Kapan disimpan | Dipulihkan | Dibuang |
|---|---|---|---|---|
| Entri laporan PIC (`LembarEntriSheet`) | `laporan-entri` · id entri, atau `baru:<proyek>` · tanggal laporan | Batal/Selesai/geser/Kembali dengan isian berbeda dari versi tersimpan. Selama mengetik, ditulis setelah 600 ms tanpa ketikan (bertahan bila proses mati) | Saat Sheet entri yang sama dibuka lagi | Simpan sukses atau diantre, "Buang draf", isian kembali sama, keluar akun |
| Butir capaian mingguan (`ButirSheet`) | `mingguan-butir` · id butir, atau `baru:<divisi>` · kunci minggu | Sama | Hanya bila papan masih DRAFT dan bisa ditulis | Simpan/hapus butir sukses atau diantre, "Buang draf", keluar akun |
| Ringkasan untuk Direktur (`RingkasanDirekturSheet`) | `ringkasan-direktur` · divisi · kunci minggu | Poin diubah lalu Sheet ditutup tanpa Simpan draf/kirim | Hanya bila ringkasan belum terkirim dan tidak terkunci | PUT "Simpan draf" atau kirim sukses, "Buang draf", keluar akun |

Detail perilaku:
- **Tanpa dialog.** Saat Sheet ditutup dengan perubahan, muncul snackbar "Perubahan disimpan sebagai draf" (laporan dan mingguan).
- **Penanda pemulihan.** Saat dibuka lagi, puncak Sheet menampilkan penanda kecil "Draf dipulihkan · HH.MM" dengan aksi "Buang draf" (`app/ui/draf/PenandaDraf.kt`). Penanda ini bukan dialog.
- **Sheet bisa ditutup dengan geser.** Geser, scrim, dan Kembali kini boleh menutup Sheet walau isian berubah, karena perubahan tidak hilang. Ini menggantikan penjaga E2E-1 #5. Penjaga hanya aktif selama simpan berjalan.
- **Isi draf.** Draf hanya memuat isian kerja dalam JSON. Tidak ada sandi, token, id lokal, atau kunci idempotensi.
- **Masa simpan.** Draf lebih tua dari 14 hari dibuang.
- **Pisah akun.** Tanpa sesi aktif, tidak ada draf yang ditulis maupun dibaca. Draf akun lain tidak pernah terbaca, karena uid ikut menjadi bagian kunci baris dan kolom `uid` dicek saat baca.
- **Keluar akun.** `MesinSinkron.hentikanDanBersihkan` → `clearAllTables` ikut mengosongkan tabel draf.

### Kode

- `core/data/db`: entitas `DrafSuntingEntity` (tabel `draf_sunting`, indeks `uid`) dan `DrafSuntingDao`.
- **Room v6 → v7.**
  - `MigrasiMk.MIGRASI_6_7` nyata: hanya CREATE TABLE dan CREATE INDEX.
  - Skema ekspor `schemas/…/7.json`. Ekspor memakai init script scratchpad `skema-room.init.gradle`, sama dengan C5. Ekspor permanen di `core/data/build.gradle.kts` masih menjadi butir parent (A1-LURING §4).
- `core/data/repo/DrafSunting.kt`: `DrafSunting` (Hilt `@Singleton`, uid dari `MkPrefs.uidSesi`), antarmuka `PenyimpanDraf`, `KunciDraf`, dan `Draf`. Kegagalan baca/tulis ditelan, sehingga Sheet tidak pernah gagal karena draf.
- `app/ui/draf/PencatatDraf.kt`: satu antrean tulis berurutan per ViewModel.
  - `catat` menunggu jeda 600 ms.
  - `segera` dipakai saat Sheet ditutup atau simpan sukses, dan membatalkan catatan tertunda.
  - `ambil` ikut antre, jadi membuka lagi tepat setelah menutup tetap membaca draf terbaru.
- **Logika murni per Sheet:**
  - `ui/laporan/DrafLembar.kt` + `isianKeJson`/`isianDariJson` (`LembarTersimpan.kt`)
  - `ui/mingguan/DrafButir.kt` (+ `bolehSuntingButir`, kini dipakai juga oleh `MingguanScreen`)
  - `ui/tim/DrafRingkasan.kt`
- **ViewModel:**
  - `LaporanViewModel`: `bukaTambah`/`bukaUbah` membaca draf dulu, lalu ada `tutupLembar`, `buangDraf`, dan `simpanEntri` yang membuang draf saat sukses/antre.
  - `MingguanViewModel`: `catatIsian` (dilaporkan `ButirSheet` lewat `snapshotFlow`), `tutupSheet`, `buangDraf`, dan `tutupDanBuangDraf`.
  - `RingkasanDirekturViewModel`: `tutup`, `buangDraf`, `drafPulih`.

### Tes JVM baru (36 tes, semua lulus)

| Berkas | Tes | Cakupan |
|---|---|---|
| `core/data/…/repo/DrafSuntingTest` | 9 | Simpan/pulihkan/timpa, buang, alamat tidak tertukar, **pisah uid**, tanpa sesi, keluar akun (`buangSemua`/`sapuSelain`), kedaluwarsa 14 hari, galat penyimpanan ditelan |
| `core/data/…/db/MigrasiMkTest.migrasi6ke7…` | 1 (+ rantai) | SQL migrasi == createSql tabel & indeks di 7.json. Tabel lain, termasuk outbox, identik dengan 6.json. Kolom draf tanpa sandi/token |
| `app/…/draf/PencatatDrafTest` | 6 | Jeda ketik, `segera` membatalkan yang tertunda, tutup → ambil membaca tulisan terbaru, buang, antrean tahan galat, teks penanda |
| `app/…/laporan/DrafLembarTest` | 6 | Kunci entri baru/tersimpan, hanya perubahan pada laporan terbuka, pulihkan + penanda, abaikan draf sama/rusak, Buang draf, JSON tanpa id/kunci idempotensi |
| `app/…/mingguan/DrafButirTest` | 5 | Kunci, simpan hanya bila berubah dan bisa ditulis, pulihkan, JSON, `bolehSuntingButir` |
| `app/…/tim/DrafRingkasanTest` | 3 | Kunci, hanya poin berubah pada ringkasan terbuka, JSON dibatasi 3 poin × 280 huruf |

### Bukti emulator (`emulator-5554`, PIC `pic.pt-001.1`)

Tangkapan layar ada di `scratchpad/g1shots/NN-k.png`.

1. **Batal menyimpan draf.** Tambah entri → isi judul → Batal → snackbar "Perubahan disimpan sebagai draf" (`06`).
2. **Draf dipulihkan.** Tambah entri lagi → "Draf dipulihkan · 16.07" + "Buang draf", dan judul pulih (`07`).
3. **Proses mati.** Ketik tambahan " MATI" → `am force-stop` → buka app → Laporan → Tambah entri. Judul pulih lengkap dengan " MATI" (`09`, dump UI).
4. **Kembali (back) menutup Sheet** yang berubah dan menyimpan draf (snackbar).
5. **Buang draf.** Isian kembali kosong, penanda hilang, dan tombol Simpan nonaktif (`11`).
6. **Ringkasan Direktur (Kadiv SDM).** Status DRAF dibuat lewat proksi uji, jadi tidak ada tulisan ke server.
   - Ubah poin 1 → Kembali → buka lagi: "Draf dipulihkan · 16.11", poin "Pengujian berjalan. Draf G1" (`24`).
   - "Buang draf" mengembalikan "Pengujian berjalan.".
   - Tidak ada PUT/POST ringkasan ke server.
7. **Butir mingguan: JVM saja.** Laporan M42 Divisi SDM berstatus Disetujui (papan baca saja). Akun kadiv lain yang berstatus DRAFT tidak dipakai, untuk menghindari login tambahan.

## 2. Verifikasi butir E2E-R2 (sebelumnya baru diuji kode/JVM)

Proksi uji `scratchpad/proksi-g1.py` (127.0.0.1:3101 → 3100) dipasang lewat `adb reverse tcp:3100 tcp:3101`, khusus emulator-5554. Proksi ini menyuntikkan galat dan menimpa respons tanpa mengubah server. Setelah selesai, proksi dihentikan dan reverse dikembalikan ke 3100.

| Butir | Hasil | Bukti |
|---|---|---|
| **N2** — bukti tetap tampil walau muat ulang gagal | **LULUS** | Ubah entri "Periksa hasil pengujian" → Lampirkan foto. Log proksi: `POST /api/evidence/upload 200`, lalu `INJEKSI 500 GET /api/daily-input`. Sheet tetap menampilkan thumbnail + "1000000023.jpg 115 KB" (`15`). Bukti uji lalu dihapus (`DELETE /api/evidence/… 200`) |
| **N4a** — tombol "Tutup" setelah jendela tarik | **LULUS** (data nyata) | Ringkasan SDM terkirim 14.42, dibuka 16.10. Footer hanya "Tutup" (`20`) |
| **N4b** — galat 409 tarik terlihat | **LULUS** | Proksi menimpa `sentAt` = 1 menit lalu → "Tarik untuk disunting" → POST unsend dibalas 409. Pesan "Jendela tarik kembali sudah lewat (uji G1)." tampil tepat di atas footer (`22`) |
| **N-04** — snackbar Urungkan persetujuan proyek | **LULUS** | Direktur sh-energi menyetujui "E2E R2 Usulan Dua". Snackbar + "Urungkan" masih ada pada detik ke-3, 7, dan 10 (dump UI), lalu hilang sekitar detik ke-12 sesuai desain (`32`, `33`) |
| **N-05** — "PIC belum ditentukan" | **LULUS** | Detail usulan "E2E R2 Usulan Dua" (tanpa PIC) menulis "PIC belum ditentukan" |
| **N-07** — "Kode sumber" dihapus | **LULUS** | Detail eskalasi PT Surya Panel Jatim hanya menampilkan "Sumber · Laporan harian proyek". Seluruh teks detail dipindai, tanpa "Kode sumber" |

Tidak ada butir yang gagal, jadi tidak ada perbaikan tambahan untuk N2/N4/N-04/N-05/N-07.

**Data uji yang berubah:** usulan "E2E R2 Usulan Dua" kini **disetujui Direktur entitas**. Ketukan Urungkan datang setelah snackbar 12 dtk habis, sehingga persetujuan tidak terurungkan. Bila perlu, kembalikan lewat web atau Super Admin. Bukti foto uji sudah dihapus. Selain itu tidak ada perubahan data, dan ringkasan/laporan tidak dikirim.

## 3. Masukan G2: banner luring ganda di layar pemantau

**Keputusan G1: banner shell tetap menjadi satu-satunya penanda status luring.** Kode `MKShell.IsiTab` tidak berubah, hanya komentarnya diperjelas.

Saya sempat mencoba opsi "shell menyembunyikan banner bila layar punya penanda sendiri" (Ringkasan grup/Direktur, Proyek, Eskalasi, Entitas), lalu membatalkannya. Di emulator, Eskalasi yang dimuat daring lalu perangkat dibuat luring (airplane + `reverse --remove`) menjadi **tanpa penanda luring sama sekali** (`34`). Penyebabnya, `MkPenandaTersimpan` hanya tampil bila isi berasal dari potret Room. Data segar yang tetap di layar tidak memunculkannya. Menyembunyikan banner shell berarti regresi B6.

Agar hanya satu baris yang menyatakan "luring", **tindak lanjut untuk G2/parent** (designsystem/feature, di luar kepemilikan G1): ubah `teksDataTersimpan` di `MkPenandaTersimpan` menjadi "Data tersimpan HH.MM" tanpa awalan "Luring ·". Dengan begitu:
- banner shell = status luring;
- penanda layar = umur data.

Alternatifnya, designsystem menyediakan `LocalBannerLuringShell`, dan penanda membuang awalan saat nilainya true.

## 4. Catatan

- **Form lain.** Form akun (`SheetWizardAkun`/`FormAkun`) sengaja **tidak** diberi draf karena memuat sandi awal. Form buka kunci (alasan) juga tidak, karena pendek dan sekali pakai.
- **Batas yang diketahui:**
  - Draf entri baru yang tersimpan dengan id lokal (luring) memakai id lokal itu. Setelah entri terkirim dan berganti id server, draf lama tidak ditemukan dan dibuang setelah 14 hari.
  - Isian mingguan yang belum tersimpan tetap ter-reset bila papan dimuat ulang penuh (`versiForm`, mis. 409 beku). Perilaku ini sama seperti sebelumnya, tetapi draf terakhir yang sudah ditulis tetap ada.
- **Lingkungan dikembalikan:**
  - emulator-5554: airplane `0`, `adb reverse tcp:3100 tcp:3100`, berkas foto uji dihapus.
  - Sesi akhir di emulator-5554 adalah Direktur entitas (3 kali masuk: PIC, Kadiv, Direktur).
  - Proksi uji dihentikan.
