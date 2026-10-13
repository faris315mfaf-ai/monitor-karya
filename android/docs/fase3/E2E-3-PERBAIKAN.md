# E2E-3 — Perbaikan temuan pemantau, TI, dan Super Admin

Tanggal: 13 Okt 2026, 14.20–14.45 WIB. Cabang `claude/perbaiki-bug-sisa` (belum di-commit). Rujukan: [E2E-3-PEMANTAU-TI.md](E2E-3-PEMANTAU-TI.md).
Server `src/`, `core/`, dan gradle tidak diubah.

Gerbang: `gradle-kunci.sh testDebugUnitTest :app:assembleDebug -Pmk.baseUrl=http://127.0.0.1:3100/` → BUILD SUCCESSFUL, **567 tes JVM, 0 gagal**.
APK dipasang di emulator-5558. Tangkapan layar ada di `scratchpad/e3-0*.png` dan `e3-10-luring.png`.

## Ringkasan

| # | Temuan | Status | Bukti |
|---|---|---|---|
| B1 | ActionBar ganda | Sudah beres di E2E-1 (`Theme.MonitorKarya` NoActionBar di manifest), dicek ulang di kode | e3-01 |
| B2 | Urungkan menyetujui baris lain | **Diperbaiki** | Tes VM + emulator |
| B3 | MkSheet ≥840dp kosong | Sudah beres di E2E-1 (`widthIn` sebelum `fillMaxWidth`, tinggi dari jendela Dialog), dicek ulang di kode | — |
| B4 | Nama proyek hilang di rincian per perusahaan | **Diperbaiki** (drill-down sudah beres di E2E-2, `ProjectRow` diperbaiki di sini) | e3-07 |
| B5 | Label tab aktif | Sudah beres di E2E-1 (`MkWarnaNavigasi`) | e3-01 |
| B6 | Tab pemantau tanpa banner luring | **Diperbaiki** (banner dari shell) | e3-10 |
| B7 | Urungkan nonaktif PT/akun tak terlihat | **Diperbaiki** | Tes VM |
| B8 | Kode audit mentah | **Diperbaiki** | e3-09 + tes |
| B9 | 4× GET saat muat ulang | **Diperbaiki** (akar masalah ditemukan) | logcat |
| B10 | Pilihan proyek TI berpindah | **Dimitigasi** | Tes lama lulus; kasus intermiten tidak bisa direproduksi |
| B11 | Tab Pengaturan PT tersembunyi | Diperbaiki | — |
| B12 | Butir terakhir "Lainnya" di area gestur | Diperbaiki | e3-08 |
| B13 | Subjudul "Tingkat grup" | Diperbaiki | — |
| B14 | Simpan identitas tanpa umpan balik | Diperbaiki | — |
| B15 | Ambang warna peta vs grafik | **Tidak diubah**: perlu keputusan desain dan logikanya sama dengan web | — |
| B16 | Hapus PT berriwayat | Diperbaiki | Tes |
| B17 | Label tab bawah terpotong | Diperbaiki | e3-01 + tes |
| B18 | Back/geser membuang isian formulir | Diperbaiki | — |

## B2 — Urungkan terikat ke id permintaan (TINGGI)

Penyebab: setelah PATCH, baris yang sudah diputus diurutkan ulang ke bawah (`urutAntrean`: yang menunggu dulu). Akibatnya "Setujui" milik baris berikutnya bergeser tepat ke posisi "Urungkan".

`feature/audit/.../sistem/SistemAksesViewModel.kt` + `SistemAksesScreen.kt`:
- `AntreanAkses.tampil`: urutan baris disusun VM dan **tetap** selama layar terbuka. Baris yang diputus tetap di posisinya dengan status barunya.
- `susunTampil(items, urutanLama)`: muat ulang internal (409, atau jawaban tanpa item) mempertahankan posisi. Permintaan baru ditambahkan di bawah. "Coba lagi" dari pengguna menyusun ulang.
- Baris dibungkus `key(item.id)`. Aksi sudah mengirim objek/id, bukan indeks.
- Selama satu putusan ditahan (5 detik) atau dikirim, Setujui/Tolak baris lain dan footer Sheet rincian **nonaktif**. VM juga menolak putusan kedua (`adaAksiBerjalan`).
- `urungkan()` setelah jendela 5 detik tidak lagi diam. Pengguna mendapat pesan "Putusan sudah terkirim dan tidak bisa diurungkan lagi…". Permintaan lain tidak tersentuh.
- Muat antrean yang sedang berjalan dibatalkan bila ada muat baru.
- Tes regresi `SistemAksesViewModelTest` (+5):
  - Urungkan setelah 5 detik: hanya q1 yang ter-PATCH, q2 tetap DIAJUKAN, dan urutan [q1, q2] tetap.
  - Urungkan dalam jendela 5 detik.
  - Putusan kedua diabaikan selama yang pertama masih berjalan.
  - Muat ulang 409 mempertahankan posisi.
  - `susunTampil`.
- Emulator (Super Admin → Sistem & akses):
  - Tolak baris 1 → baris 1 "Ditolak · Urungkan", Tolak/Setujui baris 2 abu-abu (`e3-05-tahan.png`).
  - 7 detik kemudian ketuk posisi Urungkan → yang terbuka hanya rincian baris 1 sendiri (`e3-06-setelah.png`).
  - logcat: **hanya satu** `PATCH /api/access-requests`.

## B4 — ProjectRow (TINGGI)

- Drill-down "Laporan per perusahaan" sudah memakai `BarisProyekRingkas` sejak E2E-2. Terverifikasi di emulator: nama, divisi · PIC, "Lapor hari ini", lencana, dan persen tampil (`e3-07-pt.png`).
- `designsystem/.../ProjectRow.kt` sendiri juga diperbaiki:
  - Di lebar < 560dp (ponsel/sheet) baris memakai susunan bertumpuk: nama 2 baris + subjudul + "PIC …" di kiri, lencana + persen di kanan.
  - Di lebar penuh, blok PIC dibatasi 180dp sehingga kolom nama tidak lagi bisa bernilai 0.
  - Saat ini tidak ada pemakai lain `ProjectRow` di app/feature (grep). Tes: `ProjectRowTest`.
- Tambahan: subjudul baris tidak lagi "PIC PIC Pembangunan…". `labelPic()` di `Pemetaan.kt` dipakai di drill-down dan Ringkasan Direktur (tes di `PemetaanTest`).

## B6 — Banner luring tab pemantau (SEDANG)

- `app/.../navigation/MKShell.kt` + `PetaLayar.bannerLuringDariShell()`: layar modul `:feature:*` (Ringkasan grup/Direktur, Proyek, Eskalasi, Persetujuan, Entitas, Perusahaan, Log, Sistem) serta Divisi dan Meja tanpa PT mendapat `BannerLuring` di atas isi saat perangkat luring.
- Teks banner: "Luring · data di layar ini dari pemuatan terakhir dan tidak diperbarui sampai tersambung lagi". Teksnya jujur karena modul ini belum punya cache Room.
- Layar yang sudah punya banner sendiri tidak mendapat banner ganda (tes `PetaLayarTest`).
- Saat mulai dingin dalam keadaan luring, pesan galat tiap modul ("… Anda sedang luring") tetap tampil di bawah banner.
- Cache Room per modul pemantau **belum dibuat**. Pekerjaan itu butuh entitas Room di `core/data`, di luar kepemilikan agen ini.
- Emulator: airplane mode → banner tampil di Log aktivitas, data terakhir tetap terbaca (`e3-10-luring.png`).
- Catatan: `ConnectivityObserver` baru melaporkan luring beberapa detik setelah airplane mode menyala. `onLost` membaca `activeNetwork` yang masih ada selama transisi. Ini di `core/data` dan tidak diubah.

## B7 — Urungkan nonaktifkan PT/akun (SEDANG)

- `SheetPerusahaan`/`SheetAkun`: `CatatanUrung` dipindah ke slot `galat` MkSheet, yang menempel tepat di atas footer dan terlihat dari tab mana pun. Sebelumnya catatan ada di puncak isi.
- `PerusahaanViewModel.tutupPerusahaan/tutupAkun`: bila Urungkan masih berlaku, notifikasi dipancarkan ulang dengan id baru. Snackbar layar utama lalu tampil penuh setelah sheet ditutup.
- Tes: `e3_b7_*` (2).

## B8 — Label audit (SEDANG)

- `feature/audit/.../AuditLabel.kt`: 16 aksi baru ditambahkan, dengan nada sesuai pola web:
  - APPROVE/REJECT/WITHDRAW/REOPEN/CREATE_APPROVAL_REQUEST
  - UNDO_APPROVAL_DECISION, ATTACH_APPROVAL_FILE
  - COMMENT_WEEKLY_REPORT, UNDO_WEEKLY_COMMENT
  - REVIEW_PROJECT, UNDO_REVIEW_PROJECT, UNDO_DEADLINE_DECISION, ARCHIVE_PROJECT
  - UPDATE_REPORT_SETTINGS, ISSUE_ACCOUNT_ACTIVATION, ACTIVATE_ACCOUNT
- Sasaran baru: APPROVAL_REQUEST, REPORT_SETTINGS, AUDIT_LOG, WEEKLY_SUMMARY.
- Daftar diambil dari semua kode aksi yang ditulis server (grep `audit*(...)` di `src/`).
- Tes `FormatTest` memastikan tidak ada label yang tampil sebagai kode.
- **Untuk pemilik web**: `src/components/views/audit-view.tsx` dan `src/lib/audit-labels.ts` masih belum memuat kode-kode di atas. Tidak diubah karena di luar zona.

## B9 — 4× GET /api/ringkasan (SEDANG): akar ditemukan

- Penyebab: `RingkasanGrupViewModel.muatUlang` memanggil jaringan **di dalam** `_ui.update { it.copy(x = ambil { api… }) }`. `update` adalah loop compare-and-set. Setiap kali bagian lain memperbarui `_ui` selagi permintaan berjalan, lambdanya diulang beserta GET-nya.
- Instrumentasi emulator:
  - Satu `muatUlang` menghasilkan 3× log "ringkasan panggil".
  - Dari sebab yang sama, `late-incidents` 4× dan `compliance-map` 3×.
- Perbaikan: hasil diambil dulu, baru `update`. Setelah perbaikan, satu ketukan menghasilkan tepat 4 GET berbeda, masing-masing 1×.
- Sapuan seluruh `src/main` untuk pola yang sama: tidak ada tempat lain.
- Tes regresi: `e2e3_b9_satu_muat_ulang_satu_get_ringkasan…`.
- Catatan: sesaat setelah aplikasi dibuka terlihat sapuan `daily-reports` + `tasks` untuk ±25 proyek. Itu prapemuatan sinkron `core/data`, bukan dari tombol Muat ulang.

## B10 — Pilihan proyek TI (SEDANG): mitigasi

`app/.../laporan/LaporanViewModel.kt` + `LaporanHarianScreen.kt`:
- Jawaban `muatEntri` yang tiba setelah pengguna berpindah proyek atau tanggal **dibuang**. Ini sumber "panel Entri hari ini menunjuk proyek lain dari yang disorot".
- Muat karena pilihan pengguna membatalkan muat pilihan sebelumnya.
- `pilih()` mengabaikan id yang tidak ada di meja.
- Baris daftar proyek dibungkus `key(p.id)`.
- Perpindahan sendiri saat gulir tidak bisa direproduksi (penguji pun gagal 2×). Dugaan sisanya: `adb input swipe` pendek terbaca sebagai ketukan.

## RENDAH

- **B11**: chip tab rincian PT memakai `FlowRow`, jadi "Pengaturan" turun ke baris kedua, bukan tersembunyi di luar layar.
- **B12**: sheet "Lainnya" langsung terbuka penuh (`skipPartiallyExpanded`), bisa digulir, dan punya ruang setinggi bilah navigasi. Butir terakhir tidak lagi menempel di area gestur (`e3-08-lainnya.png`).
- **B13**: subjudul "Akun baru" mengikuti PT yang dipilih di formulir.
- **B14**: pesan sukses non-urung ("Identitas perusahaan tersimpan.") tampil di slot catatan sheet perusahaan.
- **B16**: tombol "Hapus perusahaan" nonaktif bila `counts.dailyReports + weeklyReports > 0`, disertai penjelasan "Sudah punya N laporan… Nonaktifkan saja". Fungsinya `laporanPenghalangHapus`, dengan tes. Penghalang lain (tugas, eskalasi, anak perusahaan) tetap dijaga server lewat 409.
- **B17**: bilah bawah memakai label pendek web (`NAV_TABS.short`: "Perusahaan", "Laporan", "Masuk", "Log", "Sistem", …) + elipsis. Sheet "Lainnya" tetap memakai label penuh (`labelPendek`, dengan tes).
- **B18**:
  - Wizard Tambah perusahaan dan formulir Akun baru yang sudah berisi, serta layar serah terima sandi, tidak tertutup oleh geser, Kembali, atau ketuk luar (`bolehTutupGeser`). Batal/Selesai tetap menutup.
  - Tanpa dialog konfirmasi, sesuai aturan desain.
- **B15**: tidak diubah. Ambang peta (≥90 selesai) dan grafik "10 PT terendah" sama persis dengan `management-charts.tsx`. Penyelarasan perlu keputusan desain lintas web dan Android.

## Berkas diubah

- `feature/audit`:
  - `sistem/SistemAksesViewModel.kt`, `sistem/SistemAksesScreen.kt`, `model/AuditLabel.kt`
  - Tes: `SistemAksesViewModelTest`, `FormatTest`
- `feature/entitas`:
  - `perusahaan/SheetPerusahaan.kt`, `SheetAkun.kt`, `SheetWizard.kt`, `PerusahaanViewModel.kt`, `PerusahaanLogika.kt`, `PerusahaanLayar.kt`
  - `res/values/strings_entitas.xml`
  - Tes: `ViewModelTest`
- `feature/ringkasangrup`:
  - `RingkasanGrupViewModel.kt`, `SheetDrillDown.kt`, `RingkasanDirekturTab.kt`, `logika/Pemetaan.kt`
  - Tes: `RingkasanGrupViewModelTest`, `PemetaanTest`
- `designsystem`:
  - `components/ProjectRow.kt`
  - Tes: `ProjectRowTest` (baru)
- `app`:
  - `navigation/MKShell.kt`, `navigation/PetaLayar.kt`, `ui/luring/PenandaLuringUi.kt`, `ui/laporan/LaporanViewModel.kt`, `ui/laporan/LaporanHarianScreen.kt`
  - Tes: `PetaLayarTest`

## Efek samping DB uji

- Satu permintaan akses ("Akses sementara Manager / PIC proyek untuk PIC Penghematan Energi", Bpk. Yudi, PT Karet Jambi Makmur) **DITOLAK** lewat aplikasi pukul 14.38 WIB. Ini dipakai sebagai bukti B2.
- Tidak ada data lain yang diubah.
- Emulator-5558: airplane mode dimatikan kembali, `adb reverse tcp:3100` masih terpasang, dan sesi Super Admin tetap masuk.
