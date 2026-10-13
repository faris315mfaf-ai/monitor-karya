# E2E-1 — Perbaikan temuan (plus tumpang tindih E2E-2)

Tanggal: 13 Okt 2026, 13.55–14.20 WIB. Cabang `claude/perbaiki-bug-sisa` (belum di-commit). Sumber temuan:
`E2E-1-PIC-KADIV.md` (#1–#10) dan, atas instruksi koordinator, `E2E-2-ADMIN-DIREKTUR.md` BUG-02, BUG-03, BUG-05,
BUG-06, BUG-07, BUG-10, BUG-11 (+ BUG-12 sebagian). Server `src/` dan `feature/**` tidak diubah.

Gerbang: `gradle-kunci.sh :designsystem:testDebugUnitTest :core:network:testDebugUnitTest :app:testDebugUnitTest
:core:data:testDebugUnitTest :app:assembleDebug -Pmk.baseUrl=http://127.0.0.1:3100/` → BUILD SUCCESSFUL,
**299 tes JVM, 0 gagal** (log `scratchpad/e1-b2.log`). APK terpasang di emulator-5554 (`install -r`).
Tangkapan layar verifikasi: `scratchpad/e1fix-5554/NN-*.png`.

## Ringkasan

| # | Temuan | Status | Verifikasi emulator |
|---|---|---|---|
| E2E-1 #1 | Tab Divisi tanpa Ingatkan / Tandai dibaca / Ringkasan Direktur / kehadiran | Diperbaiki | Ya (03–06) |
| E2E-1 #2 | Capaian mingguan tanpa unggah bukti | Diperbaiki (klien) | Sebagian — server menolak (lihat catatan seed) |
| E2E-1 #3 / E2E-2 BUG-05 | MkSheet kosong di lanskap / ≥840dp | Diperbaiki | Ya (11, 12, 13, 14) |
| E2E-1 #4 / E2E-2 BUG-06 | ActionBar ganda + inset status bar | Diperbaiki | Ya (01, 02, 15) |
| E2E-1 #5 | Geser-tutup "Ubah entri" membuang perubahan | Diperbaiki | Tidak (akun PIC tak bisa masuk, lihat bawah) — tes JVM |
| E2E-1 #6 / E2E-2 BUG-07 | Label tab aktif tak terbaca | Diperbaiki | Ya (01, 02, 07) |
| E2E-1 #7 | Butir N/A tampil "Belum mulai" | Diperbaiki | Ya (07: segmen "N/A 1") |
| E2E-1 #8 | "17.00 WIB WIB" | Diperbaiki | Ya (02) |
| E2E-1 #9 | Hitungan butir beda antarlayar | Diperbaiki | Ya (07: "3 dari 6 · 1 N/A tidak dihitung") |
| E2E-1 #10 | Galat validasi di luar layar | Diperbaiki | Ya untuk Sheet butir (10, 12, 14); Sheet entri PIC lewat tes JVM |
| E2E-2 BUG-02 | Statistik tanpa Aturan pelaporan + peta panas | Diperbaiki (subagen) | Tidak — tes JVM |
| E2E-2 BUG-03 | Meja akun tanpa wizard Tambah akun | Diperbaiki (subagen) | Tidak — tes JVM |
| E2E-2 BUG-10 | Tanggal laporan ISO mentah | Diperbaiki | Tidak — fungsi `tanggalPanjang` sudah diuji |
| E2E-2 BUG-11 | Jam 17.00 ditulis keras | Diperbaiki | Ya untuk tab Divisi (02) |
| E2E-2 BUG-12 | Meja akun tidak memuat ulang | Sebagian (muat ulang + tarik-untuk-muat-ulang) | Tidak |

---

## E2E-1 #1 — Tab Divisi: paritas member-sheet.tsx (TINGGI)

- `core/network/api/AttendanceApi.kt` + `dto/DtosKehadiran.kt` (baru): POST/DELETE `/api/attendance`. Disediakan di `di/AppModule.kt`.
- `ui/tim/TimViewModel.kt`:
  - `ingatkan()` (POST remind). Pesannya "Yudi sudah diingatkan." atau "…sebelumnya hari ini".
  - `tandaiDibaca()` (POST read), dengan Urungkan (POST unread).
  - `aturKehadiran()` (POST attendance), dengan Urungkan ke `previous`, atau DELETE bila sebelumnya tanpa catatan.
  - Pagar klik ganda; muat ulang diam usai aksi.
  - Logika murni: `aksiUtamaAnggota` (canRemind web), `namaDepan` (firstName web), `teksTenggatTim`.
- `ui/tim/TimScreen.kt` — isi Sheet anggota:
  - Status "Sudah Anda baca HH.mm / Belum Anda baca · dikirim ke Admin PT".
  - Chip kehadiran (Hadir/Terlambat/Cuti/Sakit/Izin).
  - Beban kerja (+ sisa jam), Dikerjakan hari ini (capaian + task berstatus), Kendala, Rencana besok.
  - Footer primer: Tandai sudah dibaca / Ingatkan {nama} / Diingatkan HH.mm / Tutup.
  - Pesan aksi + Urungkan tampil DI DALAM Sheet; snackbar layar tertutup jendela Sheet. Saat Sheet tertutup, pesan tampil sebagai snackbar Long.
- `RingkasanDirekturSheet`/`RingkasanDirekturViewModel` (sebelumnya kode mati) disambungkan:
  - Kartu "Laporan mingguan untuk Direktur" → tombol "Buka ringkasan untuk Direktur".
  - VM dibuat saat dibuka dan memuat ulang tiap kali dibuka. `muat(divisiId)` mengganti muat di `init`.
- Bukti emulator (kadv.sdm.pt-008):
  - `03-anggota.png`: Sheet lengkap.
  - `04-hadir.png`: POST attendance 200; lencana berubah dari Izin ke Terkirim; pesan + Urungkan.
  - `05-urungkan.png`: Izin lalu Urungkan → POST kembali ke Hadir (logcat OkHttp 200).
  - `06-ringkasan-direktur.png`: Sheet ringkasan tampil dengan status Terkirim + poin.
  - Keadaan kehadiran uji dikembalikan ke Izin.
  - Ingatkan dan Tandai dibaca tidak bisa dicoba nyata karena satu-satunya anggota sudah terkirim dan sudah dibaca. Keduanya diuji JVM.
- Tidak dibawa: catatan ke PIC (`/api/project-notes`), karena di luar daftar tugas.

## E2E-1 #2 — Bukti butir capaian mingguan (TINGGI)

- `MingguanViewModel`:
  - `unggahBukti(butirId, uri)` memakai `PenyiapBukti` yang sama dengan laporan PIC: foto sisi ≤2048 px, JPEG 85, ≤20 MB, mime/ekstensi dicocokkan. Lalu POST `/api/evidence/upload` (`targetType=WEEKLY_ITEM`, `Idempotency-Key`).
  - `hapusBukti()` (DELETE `/api/evidence/{id}`, dengan konfirmasi dialog karena ini hapus) dan `urlBukti()` (GET tautan bertanda).
  - Hanya daring; gagal jaringan memberi pesan jelas.
  - Muat ulang usai unggah/hapus tidak menaikkan `versiForm`, sehingga isian Sheet yang belum disimpan tidak hilang.
- Hitungan bukti kini dari baris `evidence[]` nyata, bukan cache `evidenceCount`. Aturan server (`validateWeeklyItem` + `weeklyRequiresEvidence`) menghitung baris nyata. Seed punya `evidenceCount` 1–2 tanpa baris; itulah sumber "Semua item berbukti" palsu di Meja kerja.
  - Diterapkan di `butirDari` (Capaian) dan `MejaKadivLogika.jumlahBuktiNyata/perluBukti` (Meja kerja).
- `MingguanScreen`:
  - Sheet butir mendapat bagian "Bukti":
    - Penanda "Wajib minimal 1" untuk Berjalan/Terkendala/Selesai.
    - Daftar lampiran: ketuk untuk membuka, ikon untuk hapus.
    - Tombol "Lampirkan foto" / "Lampirkan berkas".
  - Butir baru: setelah disimpan, Sheet dibuka lagi pada butir itu dengan pesan "Butir tersimpan. Lampirkan bukti pendukung." (pola entri PIC).
  - Catatan "N butir belum berbukti" sebelum Serahkan/Setujui, berisi tautan langsung ke butirnya (maks 3).
  - Papan baca-saja (MENUNGGU_PERSETUJUAN) kini bisa diketuk. Sheet baca-saja tetap bisa mengelola bukti, supaya "Setujui laporan" tidak buntu 422.
- Verifikasi emulator:
  - `07-capaian.png`: catatan 6 butir tanpa bukti.
  - `08-butir.png`: bagian Bukti.
  - `09-pemilih.png` → unggah. POST multipart terkirim (5 KB, foto terkompres).
  - Server menjawab **409 "Hanya minggu berjalan yang bisa diisi"**; pesan tampil di atas tombol Simpan (`10-terlampir.png`).
- **Akar 409 = data seed, bukan aplikasi.** `GET /api/weekly-reports`: laporan SDM M42 ber-`periodStart`
  `2026-10-06T17:00:00.000Z` (Rabu minggu ke-41).
  - `evidence-access.ts` memakai `weekPeriodOf(report.periodStart)` → PAST_WEEK.
  - PUT weekly-input mencari laporan lewat `isoYear/isoWeek`, jadi tetap 200.
  - Rekomendasi (zona server): perbaiki seed (`periodStart` = Senin 00.00 WIB minggu itu), atau samakan `evidence-access` dengan `isoYear/isoWeek`.
  - Unggah ke laporan buatan aplikasi (periodStart benar) memakai jalur kode yang sama dengan bukti PIC yang sudah lulus E2E-1.

## E2E-1 #3 + E2E-2 BUG-05 — MkSheet lanskap/≥840dp (TINGGI)

`designsystem/components/MkSheet.kt`:

- Ragam samping dipilih dari **lebar jendela** (`LocalConfiguration.screenWidthDp`, `sheetSamping()`), bukan area tab.
- Tinggi panel samping diambil dari `BoxWithConstraints` **di dalam Dialog** (jendela dialog), dengan cadangan `screenHeightDp`; maks 92%.
- Urutan `widthIn(max=440.dp).fillMaxWidth()` diperbaiki. Sebelumnya panel selebar layar.
- Bila tinggi tersedia < 420dp (`sheetRingkas()`, mis. lanskap ponsel + keyboard), kepala, isi, dan footer digulir bersama. Isi tidak pernah terjepit ke 0.
- Verifikasi:
  - `11-lanskap.png` / `12-lanskap-bawah.png`: ponsel lanskap 915dp. Panel 440dp; medan Aspek/Prioritas/Pekerjaan… terlihat; bisa digulir sampai tombol.
  - `13-tablet.png`: `wm size 1600x2560` + density 320 = 800dp, potret → bottom sheet.
  - `14-tablet-lanskap.png`: 1280×800dp → panel samping 440dp; kepala/footer menempel; isi digulir; galat menempel di atas footer.
  - Ukuran/kerapatan/rotasi emulator dikembalikan (`wm size/density reset`, `user_rotation 0`).

## E2E-1 #4 + E2E-2 BUG-06 — Tema & inset (SEDANG)

- `res/values{,-night}/themes.xml`: `Theme.MonitorKarya` (parent `android:Theme.Material[.Light].NoActionBar`), dipasang di `<application>` dan `<activity>`, plus `windowSoftInputMode=adjustResize`.
- `MkNavHost.kt`: latar token `colorScheme.background` di akar. Layar masuk/ganti sandi memakai `safeDrawingPadding()`. Shell beranda tetap diatur Scaffold/TopAppBar (insets statusBars).
- Verifikasi:
  - `01-buka.png`, `02-divisi.png`: tidak ada bilah hitam; TopAppBar di bawah status bar.
  - `15-login.png`: layar masuk berjarak dari status bar, dan keyboard tidak menutupi tombol.

## E2E-1 #5 — Geser-tutup Sheet "Ubah entri" (SEDANG)

Web tidak bertanya saat Sheet ditutup. Aturan desain juga melarang dialog konfirmasi selain hapus. Karena itu dipilih **cegah tutup geser saat ada perubahan**:

- `MkSheet(bolehTutupGeser)`: false berarti geser ke bawah, ketuk scrim, dan Kembali tidak menutup.
  - Bottom sheet memakai `confirmValueChange`; Dialog samping memakai `dismissOnBackPress/ClickOutside`.
  - Batal/Selesai/ikon tutup tetap menutup (keputusan eksplisit).
- `LembarEntri.isianAwal` + `berubah`. Pengisian otomatis pelaksana bukan perubahan; `isianAwal` diperbarui usai simpan. `LaporanLembar` memakai `bolehTutupGeser = !berubah && !sibuk`.
- Sheet butir mingguan: dialog "Buang perubahan?" yang melanggar aturan dihapus, diganti pola yang sama.
- Tes: `LembarBerubahE2e1Test`. Verifikasi emulator PIC tidak bisa dilakukan, lihat "Hambatan".

## E2E-1 #6 + E2E-2 BUG-07 — Label tab aktif (RENDAH/SEDANG)

- `designsystem/theme/MkWarnaNavigasi.kt`:
  - Label aktif = ink; ikon aktif = aksen di atas accent-soft; pasif = ink-2; latar = surface.
  - `MKShell` memberi `NavigationBarItemDefaults.colors` + `containerColor`.
- `MKTheme`: slot `surfaceContainer*`/`surfaceBright/Dim` dipetakan ke token, menghapus lavender bawaan M3 di bilah, menu, dan dialog.
- Tes `WarnaNavigasiTest`: kontras ≥4.5:1 untuk label dan ≥3:1 untuk ikon, di 6 aksen × terang/gelap.
- Bukti: `02-divisi.png`, `07-capaian.png`.

## E2E-1 #7 — Butir N/A (RENDAH)

- `MkKartuPapan.label` (kata status persis) dan `MkBoardColumn.onBuka` (ketuk kartu) di designsystem.
- `kolomStatus("NA") = "na"`: kolom/segmen "N/A" sendiri, tampil hanya bila ada. Tidak lagi masuk "Belum".
- Bukti: `07-capaian.png` (segmen "Belum 0 · Berjalan 3 · Selesai 3 · N/A 1").

## E2E-1 #8 — "WIB WIB" (RENDAH)

- `teksTenggatTim`: `cutoffLabel` server dipakai apa adanya; "WIB" tidak ditambah dua kali. Tanpa label dipakai `lockAt`; tanpa keduanya "—" (bukan jam tebakan).
- Bukti: `02-divisi.png` "tenggat 17.00 WIB".

## E2E-1 #9 — Hitungan butir (RENDAH)

Satu aturan untuk semua layar: N/A tidak dihitung (sama dengan `kadiv-desk.tsx` dan riwayat my-dashboard).

- Capaian: `teksHitungButir`, mis. "3 dari 6 butir selesai · 1 N/A tidak dihitung".
- Ringkasan: `butirDihitungKadiv` = `summary.items − byStatus.NA`.
- Status serah di Meja kerja kini juga membaca `statusHeader`. Laporan MENUNGGU_PERSETUJUAN tanpa `submittedAt` (seed) tampil "Diserahkan", sama dengan Capaian.

## E2E-1 #10 — Galat di luar layar (RENDAH)

- `MkSheet(galat = …)`: slot galat menempel tepat di atas footer, di luar area gulir. Dipakai di:
  - Sheet entri PIC (validasi + server)
  - Ajukan buka kunci
  - Sheet butir mingguan (PUT/unggah)
- Bukti: `10-terlampir.png`, `12-lanskap-bawah.png`, `14-tablet-lanskap.png`. Galat 409 terlihat tepat di atas "Simpan butir".

## E2E-2 BUG-02 — Statistik Admin PT (subagen, zona ui/admin)

- Kartu "Aturan pelaporan" (GET/PUT `/api/admin/report-settings`), dengan pengaturan:
  - Buka/tutup harian
  - 24/7 atau jam batas (+ jam lain)
  - Hari kerja
  - Aturan mingguan
- Snackbar + galat di kartu; luring = kontrol nonaktif.
- Peta panas kepatuhan 10 hari (ketuk sel untuk rincian, legenda, deskripsi pembaca layar).
- Berkas baru:
  - `ui/admin/AturanPelaporan{Logika,ViewModel,Kartu}.kt`
  - `ui/admin/PetaPanas{Logika,Kartu}.kt`
  - `core/network/api/ReportSettingsApi.kt` + `dto/DtosAturanPelaporan.kt`
- Tes: `AturanPelaporanTest`, `PetaPanasTest`.

## E2E-2 BUG-03 (+BUG-12 sebagian) — Meja akun (subagen, zona ui/akun)

- Wizard "Tambah akun" di MkSheet: Identitas → Posisi → Tinjau → Buat.
  - Validasi dan badan permintaan mengikuti `account-sheet.tsx` dan `/api/companies/users`.
  - Sandi serah terima dibuat sekali dan ditampilkan sekali dengan tombol salin sensitif. Disimpan hanya di memori VM, jadi stabil saat rotasi.
  - Galat 422 (username terpakai) tampil di atas tombol dan melompat ke langkah terkait.
- "Ubah data akun" mengirim PATCH berisi field yang berubah saja.
- Daftar dimuat ulang tiap Meja akun tampil, plus tarik-untuk-muat-ulang.
- Berkas: `ui/akun/FormAkun.kt`, `ui/akun/SheetWizardAkun.kt` (baru); `AkunViewModel.kt`, `AkunScreen.kt`.
- Tes: `FormAkunTest`, `AkunWizardViewModelTest`.
- Sisa:
  - Daftar yang "tergencet" ada di `PengaturanScreen` dan belum disentuh.
  - Ubah data belum mengubah anggota divisi.

## E2E-2 BUG-10 / BUG-11 — Tanggal & jam

- BUG-10: `MejaKerjaAdminViewModel` menampilkan "Selasa, 13 Oktober 2026" (`tanggalPanjang`, WIB), bukan `2026-10-12T17:00:00.000Z`.
- BUG-11 (subagen, `ui/kepatuhan/TenggatKepatuhan.kt`): tenggat mingguan dari `week.handoverBy`; banner harian dari jam aturan PT; 24/7 atau aturan belum termuat berarti tanpa jam.
- Sapuan `app/` lain:
  - `PenerimaanViewModel`: cadangan "(17.00 WIB)" dihapus; jam hanya dari `dailyLockAt`.
  - `MingguanViewModel.teksSerah`: tanpa `handoverBy` tidak lagi menebak "Kamis 17.00".
  - "17.00" yang tersisa di `app/` hanya komentar/pratinjau, atau label yang dihitung dari ISO server.

## Tes JVM baru/diubah

- `app/.../ui/tim/TimAksiE2e1Test.kt` (5)
- `ui/mingguan/MingguanE2e1Test.kt` (6)
- `ui/laporan/LembarBerubahE2e1Test.kt` (4)
- `ui/mejakadiv/MejaKadivTest.kt`: +1, dan pembangun JSON kini mengirim baris `evidence[]` nyata
- `ui/ringkasan/DasborPelaksanaTest.kt` (+1)
- `designsystem/.../SheetTataLetakTest.kt` (3)
- `WarnaNavigasiTest.kt` (2)
- Subagen: `AturanPelaporanTest`, `PetaPanasTest`, `TenggatKepatuhanTest`, `FormAkunTest`, `AkunWizardViewModelTest`

## Hambatan & catatan untuk pihak lain

1. **Kata sandi uji tidak berlaku lagi (14.16 WIB).** `POST /api/auth/login` dengan `SEED_PASSWORD` untuk `pic.pt-001.1` dan `kadv.sdm.pt-008`, serta `E2E_PIC2_NEW` untuk `pic.pt-001.2`, semuanya 401.
   - Kemungkinan DB uji di-seed ulang/diubah agen lain.
   - Verifikasi PIC (#5 geser-tutup, #10 Sheet entri) karena itu hanya lewat tes JVM. Sesi kadiv di emulator-5554 sudah keluar.
2. **Seed `periodStart` M42 bergeser satu minggu**, sehingga unggah bukti WEEKLY_ITEM ditolak 409 (lihat #2). Perlu perbaikan seed atau server.
3. Server menilai keterlambatan serah mingguan tetap terhadap 17.00 walau aturan mingguan 24/7 (catatan subagen BUG-11). Ini zona server.
4. Komentar "17.00" di `AdminComplianceApi`/DTO kepatuhan tidak diubah (DTO yang ada).
