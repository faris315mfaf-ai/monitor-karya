# T8-A1 — Android: perombakan layar Admin PT (tiga layar baru)

Tanggal: 8 Oktober 2026 · Agen: T8-A1 (Zcode) · Zona: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/admin/**`, `navigation/MKShell.kt` (hanya cabang admin), `android/gradle/libs.versions.toml` + `android/app/build.gradle.kts` (hanya coil)

Keputusan pemilik 9 Okt (paritas dengan web T8): Admin PT baru = tiga layar — dasbor penerusan di tab Ringkasan, meja kerja pelapor di tab Meja kerja, statistik kepatuhan. Gradle TIDAK dijalankan (dilarang; build oleh parent) — verifikasi lewat pembacaan penuh berkas rujukan, keseimbangan kurung, dan penelusuran impor/API.

## 0. KEBUTUHAN PARENT: dependensi baru coil-compose

`MejaKerjaAdminScreen` memuat grid bukti gambar dengan `coil.compose.AsyncImage`.

- `android/gradle/libs.versions.toml` — versi `coil = "2.7.0"` + pustaka alias `coil-compose` (`io.coil-kt:coil-compose`).
- `android/app/build.gradle.kts` — `implementation(libs.coil.compose)` dengan komentar catatan parent.

**Parent perlu menjalankan sync/build gradle pertama kali setelah perombakan ini** (unduh artefak coil 2.7.0; transitif coil-base memakai OkHttp yang sudah ada). Izin INTERNET sudah tergabung di manifest akhir (dari pustaka; dicek di merged manifest build lama) sehingga tidak ada perubahan manifest.

## 1. Ringkasan → `DashboardAdminScreen` + `DashboardAdminViewModel`

Berkas: `ui/admin/DashboardAdminScreen.kt`, `ui/admin/DashboardAdminViewModel.kt`

- Data dari satu `GET /api/inbox` (InboxApi, penyedia sudah ada di AppModule); parsing memakai ulang `parseMeja`/`MejaPenerimaan`/`AntreanItem` internal dari `ui/penerimaan` (modul :app sama).
- Kalimat jawaban: "x laporan diterima · y sudah diteruskan." — diterima = baris harian+mingguan dengan reportId terisi; diteruskan = status DITERUSKAN.
- Dua StatTile: "Laporan diterima", "Sudah diteruskan".
- Tombol bawah lebar penuh MkButton PRIMARY "Teruskan laporan ke Direksi (n)" — hanya tampil bila n>0; saat sibuk label "Meneruskan (x/y)…" (progres dari ViewModel).
- Tap tombol → AlertDialog konfirmasi: judul "Teruskan laporan ke Direksi?", isi "Pastikan semua laporan sudah diperiksa dan benar. Penerusan membekukan laporan.", tombol "Teruskan laporan" / "Periksa dulu".
- `teruskanSemua()` pola `PenerimaanViewModel`: loop berurutan harian→mingguan, kegagalan tidak memutus (hasil parsial "x laporan diteruskan, y gagal. <pesan>"), tiap sukses mengumpulkan `undoToken` → snackbar aksi "Urungkan" (Long) → `urungkan()` loop POST /api/undo lalu muat ulang.
- Kerangka memuat + ErrorNote Coba lagi + MkOfflineBanner + pratinjau `@PreviewGanda`.

## 2. Meja kerja → `MejaKerjaAdminScreen` + `MejaKerjaAdminViewModel`

Berkas: `ui/admin/MejaKerjaAdminScreen.kt`, `ui/admin/MejaKerjaAdminViewModel.kt`

- Dua seksi akordeon "Laporan proyek" / "Laporan divisi" — **terbuka otomatis** (`rememberSaveable` awal true), kepala seksi: judul + jumlah + chevron berputar (hormati reduced motion), MkDivider 1px antar baris dan antar seksi; kalimat jawaban "x dari y pelapor sudah melapor."
- Baris pelapor `MkListRow` + `StatusBadge` SM (Baru/Diteruskan/Belum masuk/Menunggu kadiv) + waktu di subjudul ("dikirim 08.15 WIB" / "diserahkan 09.12 WIB") dari GET /api/inbox.
- Klik baris → `MkSheet` rincian **baca-saja** (tanpa tulis):
  - **Proyek**: `GET /api/daily-reports?projectId=<id>&pageSize=1` (DailyReportsApi) → status (peta `labelStatusHarian` dari ui/laporan + MkStatus), progres bar token (trek fill-2, isian warna status, persen tabular), capaian hari ini, kendala, waktu kirim/teruskan. Bila belum melapor → EmptyNote "PIC belum mengirim laporan hari ini." (data inbox cukup, tanpa permintaan tambahan).
  - **Bukti proyek** dimuat SAAT sheet buka: `GET /api/evidence?targetType=DAILY_REPORT&targetId=<reportId>` → unggahan gambar (mime image/*) minta tautan bertanda 5 menit per item lewat `GET /api/evidence/{id}` (EvidenceApi.buka) lalu tampil grid 3 kolom `AsyncImage` (Coil); tautan gambar luar langsung grid; selain itu (pdf/docx/tautan non-gambar/gagal tautan) jadi baris berkas `MkLampiranRow` (label ukuran "Tautan"/format ID "1,2 MB").
  - **Divisi**: `GET /api/weekly-reports?search=<nama divisi>&isoYear&isoWeek` (WeeklyReportsApi; pekan dari inbox) cocokkan `divisionId`/id → status header (Draf/Menunggu persetujuan/Disetujui/Terkunci + "· diteruskan"), waktu serah/setuju/terus, dan ringkas butir (MkListRow: uraian, capaian·progres, StatusBadge Selesai/Dikerjakan/Terkendala/Belum mulai). Belum menyerahkan → status "Belum masuk" tanpa permintaan tambahan.
- Galat rincian → ErrorNote Coba lagi di dalam sheet (memanggil ulang buka baris). Race dijaga: hasil permintaan basi tidak menimpa baris lain (cek `_terpilih == baris` sebelum menempel).

## 3. Statistik → `StatistikAdminScreen`

Berkas: `ui/admin/StatistikAdminScreen.kt` — judul seksi "Statistik" + membungkus `KepatuhanScreen(vm)` + `KepatuhanViewModel` yang sudah ada (modul statistik T6-C8, GET /api/admin/compliance + pengingat). Meja akun/penerimaan lama TIDAK dipasang lagi.

## 4. Navigasi `MKShell.kt` (cabang ADMIN_PT saja)

- `ADMIN_PT && RINGKASAN → DashboardAdminScreen()` — dicabang SEBELUM cabang generik RINGKASAN agar tidak tertelan RingkasanScreen umum.
- `ADMIN_PT && MEJA_KERJA → MejaKerjaAdminScreen()` (cabang PIC MEJA_KERJA tetap).
- `ADMIN_PT && PEMBAGIAN_DIVISI → StatistikAdminScreen()` — **pemetaan sementara** menggantikan placeholder sampai NavTabId statistik ditambahkan ke TabId android (komentar di kode); label tab nav masih "Divisi".
- Pemetaan lama `ADMIN_PT && PENERIMAAN → MejaAdminScreen()` DIHAPUS — tab PENERIMAAN jatuh ke PlaceholderTabScreen.
- `ui/admin/MejaAdminScreen.kt` (lama, gabungan Penerimaan/Kepatuhan/Akun) DIBIARKAN sebagai berkas tanpa rujukan navigasi, masih terkompilasi; hapus di tugas pembersihan bila pemilik mengonfirmasi.

## 5. Catatan implementasi

- Semua ViewModel menyuntik `InboxApi`, `UndoApi`, `DailyReportsApi`, `EvidenceApi`, `WeeklyReportsApi` — semuanya SUDAH disediakan `di/AppModule.kt` (tidak ada module Hilt baru).
- Label kata kerja+tanpa seru, angka di depan, satu tombol primer per layar, margin layar 12dp (`MkSpacing.space3`) mengikuti keputusan 9 Okt; pemisah MkDivider 1px antar baris/seksi.
- Kualitas visual hanya token designsystem (LocalMkColors, MkSpacing, MkTypography, MkShapes, warnaStatus) — tidak ada hex/px liar; chevron/progres mengikuti pola KepatuhanScreen/ProjectRow.
- Pratinjau `@PreviewGanda` untuk kedua layar ber-VM (versi state murni terpisah agar bisa diuji tanpa ViewModel).

## 6. Verifikasi

- Gradle DILARANG untuk agen ini — build/ktlint/detekt menunggu parent (plus unduh coil).
- Manual: keseimbangan kurung kelima berkas baru OK (skrip), TOML valid (`tomllib`), tanda tangan API/DTO/komponen disusuri ke sumber (InboxApi, EvidenceApi.buka → EvidenceUrlResponse.url, DailyReportsApi.daftar param `ukuranHalaman`, WeeklyReportsApi.daftar param `pageSize`, MkSheet/MkListRow/StatTile/MkLampiranRow), impor tanpa yang tak terpakai.
- Yang perlu dicek parent saat build: resolsi alias `libs.coil.compose`, dan perilaku `weight` di Row untuk spacer grid gambar (baris tidak penuh diratakan).

## 7. Sisa/tindak lanjut

- TabId statistik android (RoleTabs.kt di core/domain) supaya label tab tidak lagi "Divisi" untuk ADMIN_PT.
- Menguji alur nyata (login Admin PT → tiga tab, penerusan + urungkan, bukti bertanda 5 menit) di runtime.
- Menentukan nasib `MejaAdminScreen.kt` (hapus bila disepakati).
