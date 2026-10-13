# E2E-2 — Perbaikan di `android/feature/**`

Tanggal: 13 Okt 2026. Rujukan temuan: [E2E-2-ADMIN-DIREKTUR.md](E2E-2-ADMIN-DIREKTUR.md).
Kepemilikan agen ini hanya `android/feature/**`; `app/`, `designsystem/`, `core/` dan server tidak disentuh.

## Verifikasi dan perbaikan

| Temuan | Terverifikasi di kode | Perbaikan |
|---|---|---|
| **BUG-04** snackbar Urungkan "Tandai sudah dibaca" tidak tampil | Ya. `RingkasanDirekturTab.kt` `LaunchedEffect(ui.pesan?.id)` memanggil `pesanTampil()` lalu `showSnackbar` di coroutine efek; kunci berubah ke `null` sehingga efek dibatalkan. Selain itu sheet laporan divisi (ModalBottomSheet, jendela sendiri) menutupi snackbar. | Snackbar kini diluncurkan di `rememberCoroutineScope()` tingkat layar, `pesanTampil()` dipanggil setelahnya, aksi Urungkan memakai `rememberUpdatedState`, dan pesan baru menutup pesan lama. Selain itu, ViewModel menutup sheet divisi setelah tanda baca berhasil sehingga snackbar terlihat. Perbaikan ini berlaku juga untuk semua pesan galat/pengingat di Ringkasan Direktur. |
| **BUG-08** baris drill-down "Laporan per perusahaan" (SDM/GA) rusak | Ya. `SheetDrillDown.kt` memakai `ProjectRow` dengan `pic = "Lapor hari ini · …"`, sehingga kolom nama tergencet dan avatar menampilkan "LH". | Ada composable baru `BarisProyekRingkas` (internal, khusus modul) yang aman di ponsel. Kiri: nama (2 baris), "divisi · PIC …", dan meta "Lapor hari ini"/"Belum lapor hari ini" berwarna status. Kanan: lencana status dan persen. Baris dipakai juga di kartu "Proyek di bawah Anda" Direktur yang punya risiko serupa. Kedua impor `ProjectRow` di modul dihapus. |
| **BUG-09** chip divisi ganda | Ya. Chip memakai `dv.name` saja. | `labelDivisiUnik()`: nama yang muncul lebih dari sekali diberi nama PT (cadangannya kode PT), misalnya "Keuangan · PT Energi Migas Sumut". `urutanChipDivisi()` mengelompokkan chip per PT. Label ini dipakai di chip saringan, chip output, donat, batang tepat waktu, judul baris/sheet laporan mingguan, eyebrow/konteks, dan pesan snackbar. Kalimat "belum masuk" dipotong menjadi "X, Y dan N divisi lain" bila lebih dari 3 divisi. |
| **BUG-14b** "Ibu Mira · - —" / "Dikirim - ·" | Ya. `FormatWib.relatif(null)` menghasilkan "-". | `waktuKirimRelatif()` mengembalikan null untuk waktu kosong atau rusak. Segmen yang kosong disembunyikan di baris kartu dan di sheet. Ringkasan yang kosong tidak lagi meninggalkan "— ". |
| **BUG-14c** StatTile "Output" terpotong "0 dari" | Ya (nilai panjang di ubin 1/3 lebar). | Nilai = jumlah selesai, sedangkan "dari N" pindah ke baris delta. |
| BUG-14f "Belum" vs "Belum masuk" | Tidak bisa dipastikan dari kode (label lencana sama, "Belum masuk"). | Teks sub di baris "Alur laporan" kini `weight(1f)` dan 2 baris, sehingga tidak menekan lencana. Perlu dicek ulang di emulator. |
| BUG-14g CSV tanpa konfirmasi (`feature/audit`) | Kode sudah mengirim pesan "… baris log tersimpan" lewat snackbar (`LogAuditViewModel.ekspor` → `kabari`). Penyebabnya tidak ditemukan; kemungkinan snackbar Short terlewat saat kembali dari SAF. | Tidak diubah. Perlu diuji ulang. |
| Tanggal ISO mentah (BUG-10) | Tidak ada di `feature/**`: semua tanggal feature lewat `FormatWib`/`tanggalWib`. Temuan ada di `app/.../MejaKerjaAdminViewModel.kt:266`. | Di luar kepemilikan, diserahkan ke agen `app/`. |
| Jam "17.00" ditulis keras (BUG-11) | Tidak ada di `feature/**` main. Di `feature/audit` jam penguncian berasal dari data server (`locking.dailyCutoff`, `hariJamWib(lockAt)`). Temuan ada di `app/.../KepatuhanScreen.kt:295,430,652`. | Di luar kepemilikan, diserahkan ke agen `app/`. |

## Berkas diubah

- `feature/ringkasangrup/src/main/kotlin/.../RingkasanDirekturTab.kt`: BUG-04 (lingkup snackbar), BUG-09 (label/urutan chip), BUG-08 (baris proyek), BUG-14b/c/f.
- `feature/ringkasangrup/src/main/kotlin/.../RingkasanDirekturViewModel.kt`: tutup sheet setelah tanda baca, label unik di pesan.
- `feature/ringkasangrup/src/main/kotlin/.../SheetDrillDown.kt`: `BarisProyekRingkas` + drill-down perusahaan (BUG-08).
- `feature/ringkasangrup/src/main/kotlin/.../logika/LogikaDirektur.kt`: `labelDivisiUnik`, `urutanChipDivisi`, `waktuKirimRelatif`, `SusunanDirektur.label()`, kalimat belum masuk, `barisLaporanDivisi` tanpa "-".
- Tes: `LogikaDirekturTest` (+3 tes: label ganda/urutan chip, kalimat belum masuk dipotong, baris tanpa waktu kirim) dan `RingkasanDirekturViewModelTest` (sheet ditutup setelah tandai dibaca).

## Verifikasi

- `gradle-kunci.sh :feature:ringkasangrup:testDebugUnitTest`: BUILD SUCCESSFUL, 46 tes, 0 gagal.
- Belum diuji ulang di emulator (dilarang memasang APK). Langkah uji ulang: Direktur, lalu Baca laporan, lalu Tandai sudah dibaca. Sheet harus tertutup dan snackbar "… ditandai sudah dibaca." + Urungkan tampil ±10 dtk. Lalu SDM/GA → Laporan per perusahaan → baris lengkap. Terakhir, cek chip divisi Direktur sub-holding.
