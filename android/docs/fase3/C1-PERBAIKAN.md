# C1 — Perbaikan temuan QA modul Fase 3 (gelombang C)

Tanggal: 13 Okt 2026. Sumber: [C1-QA-MODUL.md](C1-QA-MODUL.md). Cakupan: `feature/{entitas,audit,persetujuan,pesan,notifikasi}`.
Tiap temuan diverifikasi di kode lebih dulu. Semua 22 temuan nyata; 21 diperbaiki di modul ini, 1 (S2)
butuh modul bersama (parent). Tidak ada perubahan pada `app/`, `core/*`, MKShell, atau gradle.

Verifikasi: `:feature:{entitas,audit,persetujuan,pesan,notifikasi}:testDebugUnitTest` lewat skrip mutex,
BUILD SUCCESSFUL, 0 gagal (entitas 33, audit 34, persetujuan 18, pesan 18, notifikasi 13 tes; 20 tes
regresi baru bertanda `c1_*` / `C1-*`: entitas 4, audit 5, persetujuan 4, pesan 4, notifikasi 3). Catatan: `ktlintCheck` modul-modul ini sudah gagal sebelum
perbaikan ini (aturan penamaan fungsi @Composable, dsb.), jadi tidak dipakai sebagai gerbang.

## TINGGI

| ID | Status | Perbaikan | Tes |
|---|---|---|---|
| T1 | Diperbaiki | Isian formulir akun (termasuk sandi usulan) dipegang di **memori** `PerusahaanViewModel` (`formAkun(kunci)`), bukan `remember`, jadi tidak diacak ulang saat rotasi/tema/ukuran huruf. Tidak masuk SavedStateHandle/bundel. `AkunDibuat.sandiAwal` = sandi yang benar-benar dikirim; serah terima membacanya dari sana. Dibuang di `tutupAkun()`/`bukaAkun()`. Sandi dibungkus `Rahasia` (toString `Rahasia(***)`) agar tidak bocor lewat toString/log. | `c1_serahTerimaMemakaiSandiTerkirimDanDisamarkan`, `c1_formAkunStabilSelamaSheetTerbukaDanDibuangSaatTutup` |
| T2 | Diperbaiki | `StatusWizard` dipegang ViewModel (`formWizard`) sehingga isian wizard tidak hilang saat rotasi. Saat sukses, `WizardUi.serahTerima` diisi dari `positions` yang terkirim (username + `Rahasia` sandi); `HasilWizard` membaca dari sana. Dibuang di `bukaWizard()`/`tutupWizard()`. | `c1_wizardStabilDanSerahTerimaDariPermintaanTerkirim` |
| T3 | Diperbaiki | `SistemAksesScreen`: `LaunchedEffect` dikunci `pesan?.id`; `vm.pesanTampil(id)` dipanggil di `finally` SETELAH snackbar selesai dan hanya menghapus pesan dengan id yang sama (pesan lebih baru tidak terhapus). | `pesanTampil dengan id tidak menghapus pesan yang lebih baru (C1-T3)` |

## SEDANG

| ID | Status | Perbaikan | Tes |
|---|---|---|---|
| S1 | Diperbaiki | `PesanIkon` memakai `repeatOnLifecycle(STARTED)` (pola sama dengan lonceng): polling berhenti di latar, langsung menarik saat kembali ke depan. | — (perilaku lifecycle Compose) |
| S2 | **Butuh parent** | Pesan dan notifikasi memang data yang sama (`GET/PATCH api/notifications?inbox=1`), tetapi menyatukannya memerlukan repositori `@Singleton` bersama yang bisa dipakai dua modul fitur. `:feature:notifikasi` tidak bergantung pada `:feature:pesan` (dan sebaliknya), dan menambah dependensi silang/gradle atau menaruh repo di `core/*` di luar kepemilikan agen ini. Usulan untuk parent: pindahkan `PesanRepo` (StateFlow daftar + `unread`, satu poller lifecycle-aware, `reset()` saat keluar) ke `core:data`, lalu `PesanIkonViewModel` dan `NotifikasiViewModel` sama-sama membacanya. Mitigasi sementara di modul ini: S1 (keduanya menarik ulang saat kembali ke depan) dan S5. | — |
| S3 | Diperbaiki | `PesanLayar` memanggil `vm.dibuka()` sekali per pembukaan (`rememberSaveable`, tidak saat rotasi); pembukaan kedua dan seterusnya menyegarkan daftar (data lama tetap tampil, diredupkan). Pembukaan pertama tidak menarik dua kali. | `c1_s3_dibukaUlangMenyegarkanDaftar` |
| S4 | Diperbaiki | Persetujuan: Tolak/Setujui dipindah dari trailing bertumpuk (36dp, jarak 6dp) ke baris berdampingan di bawah item: ukuran M 44dp + `minimumInteractiveComponentSize()` (≥48dp), jarak 12dp, Setujui tetap sekunder. Pola yang sama diterapkan pada Tolak/Setujui/Urungkan di antrean akses Sistem. | — (tata letak) |
| S5 | Diperbaiki | `NotifikasiViewModel`: satu `Job` muat (yang lama dibatalkan → `memuat` tidak berkedip); tanda baca lokal dicatat dengan versi selesai PATCH dan tetap diterapkan di atas hasil server sampai ada muat yang dimulai setelah PATCH selesai. PATCH gagal → tanda dilepas lalu muat ulang (perilaku lama). | `c1_s5_responsBasiTidakMembalikkanTandaBaca`, `c1_s5_muatLamaDibatalkanSaatMuatBaru` |
| S6 | Diperbaiki (sisi Android) | Rute export hanya menerima `dateFrom/dateTo/action` (diverifikasi di `src/app/api/audit-logs/export/route.ts`). `LogAuditViewModel.catatanCsv()` menjelaskan bedanya: catatan tampil di layar di bawah baris saringan saat CSV tidak sama dengan daftar, dan ikut di pesan sukses unduhan. Perluasan rute server (actorId/targetType/role) tetap di luar zona Android. | `catatan CSV menyebut saringan yang tidak ikut (C1-S6)` |
| S7 | Diperbaiki | `izinDicabut.clear()` di awal `muat()` (Muat ulang = percaya lagi pada izin server). | `C1-S7 - izin dicabut 403 dipulihkan saat muat ulang` |

## RENDAH

| ID | Status | Perbaikan | Tes |
|---|---|---|---|
| R1 | Diperbaiki | `tautanAman(url)`: hanya `https` dengan host dan tanpa userinfo; dicek di ViewModel dan sekali lagi sebelum `openUri`. Allowlist host tidak dipakai karena host penyimpanan dapat dikonfigurasi server (S3 atau Supabase, `src/lib/storage.ts`). | `C1-R1 - tautan berkas non-https ditolak`, `C1-R9 …` (kasus tautanAman) |
| R2 | Diperbaiki | `rememberSalinRahasia()` (`entitas/ui/SalinRahasia.kt`): sandi awal, sandi formulir, sandi wizard, dan tautan aktivasi disalin lewat `ClipboardManager` platform dengan `ClipDescription.EXTRA_IS_SENSITIVE` (kunci string yang sama untuk API < 33). | — (API platform) |
| R3 | Diperbaiki | `SistemAksesViewModel.kirimTertahanSekarang()` dipanggil saat layar Sistem ditinggalkan (`DisposableEffect`, kecuali saat rotasi), sehingga PATCH berangkat selagi sesi masih hidup, bukan menunggu `onCleared` (yang bisa terjadi setelah keluar akun). `onCleared` tetap mengirim sisa. | `meninggalkan layar mengirim putusan tertahan segera (C1-R3)` |
| R4 | Diperbaiki | Tiket urungkan disimpan per baris (bukan hanya di snackbar terakhir). Baris yang meredup punya tombol Urungkan selama 15 menit (jendela server); lewat batas → pesan "Batas urungkan 15 menit sudah lewat." tanpa permintaan. Tiket sekali pakai (baris/snackbar). | `C1-R4 - urungkan per baris tidak tertimpa keputusan berikutnya` |
| R5 | Diperbaiki | `AturanPengingatDto.days: Double?`; `jadwalPengingat` menerima `Number?` dan memformat id-ID ("1,5 hari"). | `system - days pecahan tetap terdekode`, `jadwal eskalasi dengan hari pecahan (C1-R5)` |
| R6 | Diperbaiki sebagian | Teks di lapisan Compose dipindah ke `strings.xml`: lonceng (judul, subjudul, tombol, kosong, stateDescription), `PesanIkon` (label lencana), `PesanLayar` (label baris, tindak lanjut), `SistemAksesScreen` (lencana status pengajuan & proses otomatis). **Dilewati**: teks yang dihasilkan ViewModel/fungsi murni (`SistemAksesViewModel`, `PersetujuanModel`, `LogikaPesan`, `labelLonceng`) — semuanya diuji unit tanpa Context; memindahkannya butuh refaktor ke `TeksUi`/`@StringRes` di seluruh VM dan tesnya, bukan perbaikan bug. | — |
| R7 | Diperbaiki | Chevron buka/ciutkan di Entitas dan Struktur perusahaan 28dp → 48dp (ikon 24dp); chip "hapus pelaku" di Log aktivitas `heightIn(min = 48.dp)`. | — (tata letak) |
| R8 | Diperbaiki | `PesanRepo.reset()`; dipanggil di `init` dan `onCleared` `PesanIkonViewModel` (terikat entri beranda = satu per sesi masuk), sehingga akun berikutnya tidak melihat angka akun lama. | `c1_r8_sesiBaruTidakMewarisiLencanaLama` |
| R9 | Diperbaiki | `waktuRelatif` (persetujuan) dan `WaktuPesan.relatif` (pesan): < 24 jam tetap jam/menit; ≥ 24 jam memakai selisih hari kalender WIB. | `C1-R9 …`, `c1_r9_kemarinMengikutiKalenderWib` |
| R10 | Diperbaiki | `String.format(Locale.ROOT, "%02d.%02d", …)`. | `c1_r10_jamSelaluDigitLatin` |
| R11 | Diperbaiki (sisi Android) | Rute `entity-activity` memang mengembalikan aktivitas semua PT. `EntitasViewModel` kini menyimpan jawaban per (kadens, prioritas, tanggal) selama 60 detik: pindah PT / bolak-balik periode tidak mengunduh ulang; tombol Muat ulang selalu menarik ulang; cache dibuang saat pohon dimuat ulang. Filter `entityId` di server tetap usulan terpisah (di luar zona Android). | `c1_aktivitasTidakDiunduhUlangSaatPindahPtKecualiMuatUlang` |
| R12 | Diperbaiki | 2xx tanpa badan → "Jawaban server kosong. Coba lagi." (pola `PesanRepo`), bukan "HTTP 200". | `c1_r12_badanKosongBukanHttp200` |

## Berkas yang diubah

- entitas: `perusahaan/PerusahaanViewModel.kt`, `perusahaan/SheetAkun.kt`, `perusahaan/SheetWizard.kt`,
  `perusahaan/PerusahaanLayar.kt`, `entitas/EntitasLayar.kt`, `entitas/EntitasViewModel.kt`,
  `ui/SalinRahasia.kt` (baru), tes `ViewModelTest.kt`.
- audit: `sistem/SistemAksesScreen.kt`, `sistem/SistemAksesViewModel.kt`, `log/LogAuditViewModel.kt`,
  `log/LogAuditScreen.kt`, `data/AuditDto.kt`, `model/Format.kt`, `res/values/strings_audit.xml`, tes
  `DtoDekodeTest.kt`, `FormatTest.kt`, `LogAuditViewModelTest.kt`, `SistemAksesViewModelTest.kt`.
- persetujuan: `PersetujuanViewModel.kt`, `PersetujuanModel.kt`, `PersetujuanTab.kt`, tes `PersetujuanViewModelTest.kt`.
- pesan: `PesanIkon.kt`, `PesanLayar.kt`, `PesanViewModel.kt`, `data/PesanRepo.kt`, `logika/LogikaPesan.kt`,
  `res/values/strings_pesan.xml`, tes `PesanViewModelTest.kt`, `logika/LogikaPesanTest.kt`.
- notifikasi: `NotifikasiViewModel.kt`, `LoncengNotifikasi.kt`, `res/values/strings_notifikasi.xml`, tes `NotifikasiTest.kt`.

## Untuk parent

1. **S2** — repositori kotak masuk bersama di `core:data` (lihat di atas).
2. **designsystem** (lintas modul, dari QA butir 5): `MkButtonSize.S` 36dp, `MkIconBtn` 44dp, `MkChip` 36dp masih
   di bawah 48dp. Di modul ini diatasi per pemakaian (`minimumInteractiveComponentSize()` / `heightIn`);
   perbaikan di komponen designsystem akan menutup sisanya secara menyeluruh.
3. Server (opsional): `audit-logs/export` menerima `actorId/targetType/role`; `entity-activity` menerima `entityId`.
