# C3 — Perbaikan modul :app (gelombang C)

Tanggal: 13 Okt 2026 · Cabang `claude/perbaiki-bug-sisa` · Sumber: [C3-QA-APP.md](C3-QA-APP.md)

Zona: `android/app/**` kecuali `ui/laporan/**` dan `ui/mejakerja/**`.

## Gerbang

`gradle-kunci.sh :app:testDebugUnitTest :app:assembleDebug` menghasilkan **BUILD SUCCESSFUL**. Tercatat 11 kelas dan 63 tes, dengan 0 gagal. Tiga kelas tes baru (17 tes) dijelaskan di bagian Tes.

## Status temuan

| ID | Status | Perbaikan |
|---|---|---|
| **K1** | Diperbaiki | `MkNavHost`: `popUpTo(navController.graph.id) { inclusive = true }` dipakai untuk setiap perpindahan rute akar. Dengan begitu tumpukan selalu kosong total, dan entri lama beserta ViewModelStore-nya ikut dibuang. Fungsi murni `perluPindahRute(ruteKini, target, uidRute, uidAkun)` memicu entri baru juga untuk kasus Siap A → Siap B pada rute yang sama. `uidRute` disimpan dengan `rememberSaveable`, sehingga pemulihan proses untuk akun yang sama tetap mempertahankan tab. `key(pengguna.id) { MKShell(...) }` menyusun ulang subtree per akun: NavController tab, state tersimpan, dan VM tab. |
| **T1** | Diperbaiki | `AkunViewModel.setelUlangSandi` mengirim sandi acak lalu menyimpannya sebagai `SandiBaru(Rahasia)`. Nilainya hanya ada di memori VM: `toString` disamarkan, tidak masuk SavedState, dan tidak di-log. Sheet menampilkannya sekali lewat `SerahTerimaSandi`, mengikuti pola `SerahTerimaAkunBaru` di feature/entitas. Tombol salin bertanda sensitif, tanpa `SelectionContainer`. Sandi dibuang saat sheet ditutup atau akun lain dibuka. Dialog konfirmasi wajib `DialogSetelUlangSandi` ditambahkan. Pagar klik ganda disetel sinkron sebelum `launch`. |
| **T2** | Diperbaiki | `GantiSandiScreen(onKeluar)` mendapat tombol plain "Keluar dari akun" yang tersambung ke `vm::keluar`. |
| **T3** | Diperbaiki | `vm/TransisiSesi.kt` `transisiSiap()` menjalankan urutan: bersihkan (ditunggu sampai selesai), catat uid, lalu terbitkan Siap. Bila pembersihan gagal, uid tidak dicatat, status tidak terbit, dan layar masuk menampilkan pesan. `SesiViewModel.ubahStatus` kini `suspend` di bawah `Mutex` + `NonCancellable`, karena collectLatest validasi ulang bisa membatalkan pemanggil tepat saat status terbit. Jalur `keluar()` juga diserialkan di bawah Mutex yang sama. |
| **S1** | Diperbaiki | Kolom sandi (masuk, kini, baru, ulang) memakai `KeyboardType.Password` + `autoCorrectEnabled=false` (`opsiKeyboardSandi`). Ditambah `semantics { contentType = Password / NewPassword / Username }`. |
| **S2** | Diperbaiki | Nilai sandi kini memakai `remember`. Identifier dan flag "tampilkan" tetap `rememberSaveable`. |
| **S3** | Diperbaiki | `res/xml/data_extraction_rules.xml` mengecualikan root/file/database/sharedpref/external, baik untuk cloud-backup maupun device-transfer. `res/xml/backup_rules.xml` ditambahkan untuk API < 31. Manifest memakai `dataExtractionRules` + `fullBackupContent` (`tools:targetApi="31"`). |
| **S4** | Diperbaiki | `ui/akun/SalinRahasia.kt` adalah salinan pola feature/entitas, yang bersifat `internal` di modulnya. Tautan aktivasi dan sandi kini disalin dengan `EXTRA_IS_SENSITIVE`. |
| **S5** | Diperbaiki | `SesiViewModel.bersihkanDataAkun()` menjalankan `hentikanDanBersihkan()` lalu `imageLoader.memoryCache.clear()` + `diskCache.clear()` (IO). Langkah ini dipakai saat keluar dan saat uid berganti. |
| **S6** | Diperbaiki | `MKShell`: NavHost tab selalu tersusun. Pesan dan Pengaturan menjadi lapisan `Surface` di atasnya, yang menahan sentuhan. Saat lapisan terbuka, tab disembunyikan dari pembaca layar (`clearAndSetSemantics`). `BackHandler` Pesan dipindah ke dalam lapisan supaya terdaftar setelah NavHost. Tanpa itu, Kembali akan memundurkan tab, bukan menutup Pesan. |
| **S7** | Diperbaiki | Mingguan (`simpanButir`, `hapusButir`, `aksiLaporan`): `if (_sibuk.value) return` + set sinkron sebelum `launch`. MejaKadiv `aksi()`: `if (sibuk != null) return`. |
| R1 | Bukan bug | `KepatuhanScreen` sudah memanggil `rememberStatusLuring()` sendiri (`offline = offline \|\| luring.luring`) dan menampilkan `BannerLuring`. Parameter `offline` dari MKShell tidak diperlukan. |
| R2 | Diperbaiki | `PetaLayar.bagiTabBawah()` adalah port `ROLE_COMPACT_TABS`. Manajemen: Ringkasan/Proyek/Persetujuan/Divisi. Direktur Entitas: Ringkasan/Proyek/Eskalasi/Divisi. Peran lain tidak berubah. |
| R3 | Diperbaiki | `MingguanScreen`: tombol tutup galat (24dp) dan naik/turun (32dp) kini memakai `minimumInteractiveComponentSize()`. |
| R4 | Butuh parent | Pindahkan `SeriDivisi` ke `designsystem/theme`, beserta flag tema gelap. Bagian ini di luar zona. Nilai sekarang sudah cocok dengan `--data-1..6`, dan deteksi luminans tetap berfungsi. |
| R5 | Diperbaiki | Flag `sedangKeluar` membuat peristiwa `BERAKHIR` (401 dari POST logout) diabaikan selama `keluar()`. |
| R6 | Butuh parent | Hapus `core/data/repo/KepatuhanRepo.kt`. Kode ini mati, berupa singleton tanpa `reset()`. |
| R7 | Diperbaiki | `MejaKadivViewModel.muat()` menyimpan `Job` dan membatalkan muat sebelumnya. |

## Butuh parent (di luar zona)
1. **T3 lanjutan:** sertakan uid di kunci `CacheLayar` (`core/data`), atau tolak cache bila uid berbeda. Saat ini risikonya sudah tertutup karena `cache_layar` ada di Room, dan Room dikosongkan sebelum Siap(B) terbit. Langkah ini tetap disarankan sebagai sabuk kedua.
2. **R6:** hapus `KepatuhanRepo` (`core/data`).
3. **R4:** promosikan token seri data ke `designsystem`.
4. `hentikanDanBersihkan()` sudah `suspend`, jadi tidak perlu diubah.

## Tes JVM baru
- `vm/TransisiSesiTest` (5 tes): urutan bersihkan → catat → terbit; tanpa pembersihan untuk akun sama atau pertama kali; pembersihan lambat ditunggu (`CompletableDeferred`); pembersihan gagal tidak menerbitkan dan tidak mencatat.
- `navigation/GerbangRuteTest` (9 tes): K1 untuk alur masuk → keluar → masuk B, beranda sama dengan uid beda, pemulihan proses, dan ganti sandi selesai. R2 untuk Manajemen, Direktur Entitas, dan invarian peran lain.
- `ui/akun/SandiAkunTest` (3 tes): panjang dan alfabet `sandiAcak`; `Rahasia` tersamarkan di `toString` `SheetAkun`.

Uji instrumentasi `TestNavHostController` belum dijalankan karena pemakaian emulator dilarang.

## Berkas
- **Baru:**
  - `app/vm/TransisiSesi.kt`
  - `app/ui/akun/SalinRahasia.kt`
  - `res/xml/data_extraction_rules.xml`
  - `res/xml/backup_rules.xml`
  - 3 tes di atas
- **Diubah:**
  - `navigation/MkNavHost.kt`, `navigation/MKShell.kt`, `navigation/PetaLayar.kt`
  - `vm/SesiViewModel.kt`
  - `ui/login/LoginScreen.kt`, `ui/login/GantiSandiScreen.kt`
  - `ui/akun/AkunViewModel.kt`, `ui/akun/AkunScreen.kt`
  - `ui/mingguan/MingguanViewModel.kt`, `ui/mingguan/MingguanScreen.kt`
  - `ui/mejakadiv/MejaKadivViewModel.kt`
  - `AndroidManifest.xml`
