# C2 — Perbaikan tab Proyek dan Eskalasi

Tanggal: 13 Okt 2026. Sumber temuan: `C2-QA-PROYEK-ESKALASI.md` (1 KRITIS, 1 TINGGI, 6 SEDANG, 9 RENDAH).
Cakupan ubahan: `feature/proyek/**` dan `feature/eskalasi/**` saja.
Verifikasi: `gradle-kunci.sh :feature:proyek:testDebugUnitTest :feature:eskalasi:testDebugUnitTest`, hasilnya BUILD SUCCESSFUL.
Proyek: 56 tes (sebelumnya 33). Eskalasi: 24 tes (sebelumnya 18). Tidak ada yang gagal.

## Ringkasan

| ID | Status | Perbaikan |
|---|---|---|
| K1 | Diperbaiki | `AjukanUlangRequest.resubmit` diberi `@EncodeDefault(ALWAYS)`, jadi badannya kini `{"id":…,"resubmit":true}`. Jika server tetap membalas `DITOLAK`, klien tidak lagi menampilkan pesan sukses. |
| T1 | Diperbaiki | Snackbar, termasuk Urungkan, dirender di permukaan paling atas: layar, Sheet detail, editor tahapan, usul tenggat, atau formulir. Pola yang sama dipakai di Eskalasi. |
| S1 | Diperbaiki | Hasil aksi kini terikat ke id proyek asal. `Konfirmasi.ArsipkanProyek` membawa proyek asalnya. Jika Sheet sudah ditutup atau berganti, galat dikirim ke snackbar. |
| S2 | Diperbaiki | Hasil simpan terikat ke `FormUi.sesi`. Galat dari formulir yang sudah ditutup masuk snackbar. Simpan ganda selama POST berjalan ditolak. |
| S3 | Diperbaiki | `muatLagi` ditolak selama daftar disegarkan, dan `muatDaftar` membatalkan "Muat lagi" yang sedang berjalan. |
| S4 | Diperbaiki | Hanya 200 dan 403 yang dianggap pasti. Galat jaringan atau 5xx diperiksa ulang setiap kali `muatDaftar` dijalankan. |
| S5 | Diperbaiki | Sheet Eskalasi boleh ditutup kapan saja. Aksinya tetap selesai, hasil diikat ke id, dan Sheet yang dibuka ulang tetap terkunci. |
| S6 | Diperbaiki | Pada 403 atau 409, mode Putuskan ditutup. Bila item hilang dari daftar setelah 409, Sheet ditutup dan pesan tampil di snackbar. |
| R1 | Diperbaiki | `DetailUi.bolehPutus(u)` memeriksa `canDecide` dan `proposedById != penggunaId`. Id pengguna dibaca dari `MkProfilStore` di thread IO. |
| R2 | Diperbaiki | Opsi `AKTIF` disembunyikan untuk proyek yang pernah ditolak (`pernahDitolak`), kecuali status proyek saat ini memang AKTIF. |
| R3 | Diperbaiki | 409 pada setujui cepat, keputusan, atau ajukan ulang kini memuat ulang daftar dan proyek di Sheet. 409 pada putus usulan memuat ulang usulan. |
| R4 | Diperbaiki | Selama PATCH urutan berjalan, `DetailUi.sibukUrut` mengunci tombol naik/turun. Saat gagal, urutan dimuat ulang. |
| R5 | Diperbaiki | `startDate` dan `targetEndDate` pada PATCH kini nullable dan hanya dikirim bila berubah. String kosong tetap berarti mengosongkan tanggal. |
| R6 | Diperbaiki | Nama dan penjelasan dibatasi 4000, tujuan 2000, catatan keputusan 500, dan catatan usulan 1000 (sama dengan batas server). |
| R7 | Dilewati | Target sentuh MkButton S (36dp), MkChip, dan MkIconBtn adalah ukuran milik `:designsystem`, di luar kepemilikan. Perbaikan perlu dilakukan di komponen (`minimumInteractiveComponentSize`). |
| R8 | Diperbaiki | Bila `total > items`, kalimat papan memakai "Sedikitnya n …" dan tidak lagi menyebut angka seolah pasti. |
| R9 | Sebagian | Teks yang disebut QA dipindah ke `strings_proyek.xml`: Urungkan, Pilih/Kosongkan/Batal di DatePicker dan dialog, serta tiga teks formulir. `Tampilan.kt` sengaja tetap di Kotlin karena berisi fungsi murni yang diuji JVM tanpa Context. |

## Catatan desain penting

- **Sheet tidak diblokir saat sibuk.** QA menyarankan `tutupDetail` dan `tutupForm` diabaikan selama sibuk. Saran itu tidak dipakai. Alasannya sama dengan S5: `ModalBottomSheet` sudah menyembunyikan dirinya sebelum `onDismissRequest`, sehingga menolak penutupan akan meninggalkan modal tak terlihat yang mengunci layar. Karena itu semua aksi kini diikat ke id proyek atau sesi formulir. Hasilnya dikirim ke Sheet asal bila masih terbuka, dan ke snackbar bila tidak. Kiriman ganda dicegah dengan `aksiBerjalan`, `simpanJob`, dan `simpanTahapJob`.
- **Satu host snackbar sekaligus.** `lapisanSnackbar(detail, adaForm)` menentukan permukaan teratas. `KakiDenganSnackbar` (di `Komponen.kt`) hanya memasang `MkSnackbarHost` di kaki Sheet selama ada snackbar, sehingga kaki Sheet tidak punya ruang kosong.
- **Sapu DTO request.** Sapuan mencakup feature/proyek dan feature/eskalasi. Hanya `AjukanUlangRequest` yang punya medan wajib bernilai bawaan. Bawaan lain memang sengaja tidak dikirim, karena server memperlakukan medan yang absen sama dengan bawaan. Contohnya `skipApproval=false`, `entityId/divisionId/lifecycle=null`, `note=null`, dan `decisionText=null` untuk tinjau/tutup.
- **Dependensi baru.** `ProyekViewModel` kini menyuntikkan `MkProfilStore`. Binding-nya sudah ada di `app/di/AppModule.kt` (Singleton), tetapi graf Hilt aplikasi perlu diverifikasi saat `:app` dibangun.

## Berkas yang diubah

- `feature/proyek/src/main/kotlin/.../data/ProyekDto.kt`: K1, R5
- `feature/proyek/src/main/kotlin/.../ui/ProyekViewModel.kt`: K1, S1–S4, R1, R3–R6
- `feature/proyek/src/main/kotlin/.../ui/ProyekUiState.kt`: `ArsipkanProyek.proyek`, `sibukUrut`, `penggunaId`, `bolehPutus`, `FormUi.sesi`
- `feature/proyek/src/main/kotlin/.../ui/ProyekLayar.kt`, `DetailProyekSheet.kt`, `TahapanSheet.kt`, `FormProyekSheet.kt`, `Komponen.kt`: T1, R1, R2, R4, R6, R9
- `feature/proyek/src/main/res/values/strings_proyek.xml`: R9
- `feature/eskalasi/src/main/kotlin/.../EskalasiViewModel.kt`, `EskalasiTab.kt`, `EskalasiModel.kt`: S5, S6, R8, snackbar di Sheet

## Tes regresi baru

- `PenyandianRequestTest`: encode setiap request Proyek dengan `mkJson` lalu periksa semua medan wajib. `AjukanUlangRequest` harus menghasilkan tepat `{"id":"p1","resubmit":true}`. Request Eskalasi sudah dicakup `EskalasiDtoTest`.
- `C2RegresiTest`: `lapisanSnackbar` (T1), `bolehPutus` (R1), `pernahDitolak` (R2).
- `ProyekViewModelTest` memakai MockWebServer dengan gerbang `CountDownLatch` untuk menguji balapan:
  - K1: PATCH membawa `resubmit:true`; jawaban 200 dengan proyek tetap DITOLAK tidak dilaporkan sebagai sukses.
  - S1: hapus lalu dapat 409 setelah Sheet berganti ke B, dialog arsip tidak muncul di B; konfirmasi arsip membawa id asal; galat keputusan setelah Sheet ditutup masuk snackbar; Sheet yang dibuka ulang tetap terkunci.
  - S2: galat 422 setelah formulir ditutup masuk snackbar; simpan ganda ditolak dan hanya satu POST yang terkirim.
  - S3: "Muat lagi" ditolak selama menyegarkan; halaman 2 yang terlambat tidak ditempel.
  - S4: setelah 503, izin diperiksa ulang; setelah 403, tidak diperiksa ulang.
  - R3: 409 pada setujui cepat memicu muat ulang.
  - R4: dua ketukan hanya mengirim satu PATCH.
  - R5: tanggal yang tidak berubah tidak dikirim; yang berubah dikirim.
  - R6: catatan keputusan dipotong.
  - Galat usul tenggat setelah Sheet ditutup masuk snackbar.
- `EskalasiViewModelTest`:
  - S5: Sheet ditutup selama aksi, galat masuk snackbar; sukses tidak menutup Sheet item lain; Sheet yang dibuka ulang terkunci tanpa kiriman ganda.
  - S6: 409 dan 403 menutup mode Putuskan; item yang hilang setelah 409 menutup Sheet dan pesannya masuk snackbar.
- `EskalasiDtoTest`: kalimat batas bawah (R8).
