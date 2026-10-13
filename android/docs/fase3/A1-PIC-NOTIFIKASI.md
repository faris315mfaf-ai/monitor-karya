# A1 — Laporan harian PIC (multi-entri), Meja kerja PIC, lonceng notifikasi

Agen A1 (pembangun Android), 13 Okt 2026. Cabang `claude/perbaiki-bug-sisa`; tidak ada commit.
Acuan: `CLAUDE.md` (alur "Laporan harian PIC — entri multi-item, 10 Okt 2026", ReportSettings per PT/24/7),
`android/docs/FASE1.md` §1, `docs/zcode/laporan-swarm/T12-ANDROID.md`, `docs/design/`.

## 1. Ringkasan

| Bagian | Status | Padanan web |
|---|---|---|
| Laporan harian PIC multi-entri | Selesai, daring langsung | `views/daily-input-view.tsx` (DailyInputView, EntryDesk, EntryCard, EntrySheet, SendBar, LockNotice, UnlockRequestSheet) |
| Meja kerja PIC | Ditulis ulang, selaras web | `work-desk/pic-desk.tsx` (PicDeskView + AgendaCard) |
| Lonceng notifikasi | Baru di `:feature:notifikasi` | `shell.tsx` (NotificationButton/Popover) |

## 2. Berkas

Baru:
- `app/.../ui/laporan/LaporanLogika.kt` berisi model tampilan dan logika murni: gabungan narasi, keadaan/kunci, tenggat, pemetaan galat, dan label.
- `app/.../ui/laporan/GerbangLaporanPic.kt` adalah **satu-satunya titik baca/tulis** layar laporan (lihat §6).
- `app/.../ui/laporan/PenyiapBukti.kt` membaca Uri dan mengompres foto.
- `app/.../ui/laporan/LaporanLembar.kt` memuat Sheet "Tambah/Ubah entri" dan "Ajukan buka kunci".
- `feature/notifikasi/.../NotifikasiLogika.kt`, `NotifikasiViewModel.kt`, `LoncengNotifikasi.kt`.
- Tes: `app/src/test/.../laporan/LaporanLogikaTest.kt` (12), `app/src/test/.../mejakerja/MejaKerjaLogikaTest.kt` (4),
  `feature/notifikasi/src/test/.../NotifikasiTest.kt` (10), `core/network/src/test/.../api/EntriLaporanA1Test.kt` (9, MockWebServer).

Ditulis ulang: `ui/laporan/LaporanViewModel.kt`, `ui/laporan/LaporanHarianScreen.kt`, `ui/mejakerja/MejaKerjaViewModel.kt`, `ui/mejakerja/MejaKerjaScreen.kt`.

Hanya penambahan di `:core:network` (tanda tangan lama tidak diubah):
- `dto/DtosFase1.kt` mendapat `EntriLaporanDto`, `EntriHariResponse`, `EntriSimpanRequest`, `EntriSimpanResponse`, dan `DailyInputKirimResponse` (dengan `undoToken?`).
- `api/TasksApi.kt` mendapat antarmuka **baru** `EntriLaporanApi` (GET/POST/PUT `/api/tasks` yang dibaca sebagai entri).
- `api/DailyInputApi.kt` mendapat antarmuka **baru** `LaporanPicApi` (PUT `/api/daily-input` → `DailyInputKirimResponse`).
- Keduanya dibuat lewat `retrofit.create(...)` di `GerbangLaporanPic`, jadi AppModule tidak perlu disentuh. Antarmuka lama tidak ditambah metode, karena `TugasRepoTarikTest` memalsukan `TasksApi`.

Kontrak lama dipertahankan:
- `LaporanDeskApi` dan `SimpanLaporanRequest/Response` tetap ada di `LaporanViewModel.kt` karena AppModule masih menyediakannya. Kini tidak dipakai dan boleh dihapus bersama `@Provides laporanDeskApi`.
- `labelStatusHarian` dipakai `MejaKerjaAdminViewModel`.
- Tanda tangan `LaporanHarianScreen(vm, offline, onAjukanBukaKunci, modifier)` tetap.
- `MejaKerjaScreen(vm, onBukaLaporan, onBukaTugas, modifier, onBukaProyek = {})`. Parameter terakhir baru dan opsional.

## 3. Laporan harian PIC — alur yang dibangun

1. Data dimuat dari `GET /api/daily-input?date=` (meja) dan `GET /api/tasks?projectId=&date=` (entri proyek terpilih, termasuk `evidence` per entri).
2. Bila PIC memegang lebih dari satu proyek, tampil daftar "Proyek Anda hari ini" yang bisa dipilih.
   - Pilihan bawaan adalah proyek pertama yang belum terkirim dan belum terkunci.
   - Meja entri proyek terpilih tampil di bawahnya. Ini menggantikan Sheet bersarang web, karena di ponsel tidak ada Sheet di dalam Sheet.
3. **Tambah entri** membuka Sheet berisi judul (wajib), deskripsi, pelaksana, hasil hari ini, status, progres, kendala, eskalasi, rencana besok, dan bukti.
   - Pelaksana terisi otomatis dari `GET /api/auth/me`.
   - Status berupa chip Berjalan/Selesai/Terkendala. Status lama tetap terwakili. Memilih Selesai mendorong progres ke 100.
   - Progres memakai slider dengan langkah 5.
   - Kendala wajib bila Terkendala.
   - Eskalasi berupa switch; isian "keputusan yang dibutuhkan" wajib bila eskalasi aktif atau status Menunggu keputusan.
   - Rencana besok wajib bila Terkendala.
   - Validasi klien memakai pesan yang sama dengan web.
   - POST mengirim `workDate` = kunci tanggal meja.
   - Setelah entri baru tersimpan, Sheet tetap terbuka ("Entri tersimpan") agar bukti bisa dilampirkan.
   - PUT membawa kolom meja kerja lama (`picUserId`, tag, urgensi, jam mulai/selesai, subtask) supaya tidak hilang.
4. Setiap entri tampil sebagai **kartu**: garis status, lencana status (warna + ikon + kata), "Butuh eskalasi", pelaksana (avatar), hasil, deskripsi, progres, kendala, rencana besok, thumbnail foto (Coil, URL bertanda dari `/api/evidence/{id}`), serta tautan/berkas lain. Tombol "Ubah entri" dan "Hapus entri" (dengan konfirmasi).
5. **Footer kirim** berisi ringkasan "n entri · x selesai · y terkendala", petunjuk, dan tombol:
   - "Kirim laporan ke Admin PT", menjadi "Kirim ulang laporan" bila sudah terkirim. Ada konfirmasi berisi jumlah entri.
   - "Simpan draf".
   - "Hapus laporan" bila ada laporan yang belum diteruskan.
   - PUT `daily-input` mengirim gabungan narasi entri dengan pemisah `" | "` (padanan `composeReportBody`). Status, progres, dan bukti dihitung roll-up server.
6. Laporan **beku setelah diteruskan**. `editable`/`lockReason` server, ditambah `locked` dari GET tasks, menyembunyikan tombol tulis.
   - Kotak kunci menampilkan alasan (Diteruskan · dibekukan / Terkunci / Terkunci setelah tenggat) dan status buka kunci (diajukan / disetujui / dibuka sampai …).
7. Tombol **Ajukan buka kunci** membuka Sheet alasan (minimal 10 karakter) lalu `POST /api/unlock-requests` (DAILY_REPORT).
   - Peran tanpa `unlock:request` melihat catatan "Minta Admin PT…".
   - Hari lain yang sedang dibuka (`openDays`) tampil sebagai banner dengan tombol "Ubah laporan <tgl>". Tanggal lampau punya tombol "Kembali ke hari ini".

**Mode 24/7 dan jam PT kustom.**
- `countdown: null` berarti mode 24/7: "Tersedia 24/7 · kirim kapan saja", label "Mode 24/7".
- Untuk jam PT kustom, sisa waktu **dihitung dari `lockAt`**, bukan dari `countdown` (temuan server di §8).
- Hari kerja PT (`workingDays`) ditegakkan server: GET/PUT di hari nonpelaporan dibalas 422 "bukan hari pelaporan…" dan tampil sebagai galat ramah, sama dengan web.

**Pemetaan galat.**
- 409 menjadi `GalatTulis.Beku`: pesan server tampil, meja dimuat ulang sehingga tampilan ikut terkunci.
- 422/400 menjadi daftar `errors` server, satu baris per pesan.
- Galat lain memakai `ApiError.pesanTampil()`.

**Bukti.**
- Unggah ke `targetType=TASK`. Foto dipilih lewat Photo Picker, berkas lain lewat OpenDocument (pdf/doc/xls/txt/csv/gambar).
- Foto selain GIF didekode lalu diperkecil sampai sisi terpanjang ≤ 2048 px, dikompres JPEG kualitas 85, dan diberi nama `*.jpg` (server mencocokkan ekstensi dengan mime).
  - API ≥ 28 memakai `ImageDecoder` (orientasi EXIF dan HEIC ditangani).
  - API 26–27 memakai `BitmapFactory` dengan `inSampleSize`, **tanpa koreksi EXIF**.
- Berkas > 20 MB ditolak di klien.
- Hapus bukti dengan konfirmasi.

**Urungkan.**
- Snackbar menampilkan "Urungkan" bila respons membawa `undoToken`, lalu memanggil `POST /api/undo` dan memuat ulang.
- Route PIC hari ini tidak menerbitkan tiket (sudah tercatat di FASE1), jadi tombolnya baru hidup bila server mulai mengirimnya.

**Penyimpangan kecil dari web.**
- `buktiKurang` = max(bukti laporan, total bukti entri) < 1. Web hanya membaca `report.evidenceCount`, sehingga tombol kirim tertahan sebelum draf pertama disimpan. Server tetap memvalidasi.
- DELETE laporan selalu mengirim `date`.
- Kamera langsung belum ada karena butuh FileProvider di manifest; yang tersedia Photo Picker.

## 4. Meja kerja PIC

- Data dari `GET /api/work-desk` (cabang PIC) ditambah agenda `GET /api/tasks?projectId=` untuk proyek terpilih.
- Susunan layar:
  - Eyebrow tanggal dan lencana "Laporan hari ini · Terkirim/Belum dikirim".
  - Kalimat jawaban dan kalimat dukungan: tenggat dari `cutoffLabel` + sisa `countdown.totalMs`, atau "Tersedia 24/7" bila `cutoffLabel` = "24.00 WIB"; jumlah task selesai; pengingat Admin PT.
  - Tombol "Isi/Ubah laporan harian" (`onBukaLaporan`) dan "Lihat proyek" (`onBukaProyek`).
  - Empat KPI: laporan terkirim, task selesai, tepat waktu 10 hari (target 85%), task terkendala.
  - Antrean laporan per proyek, bisa dipilih, dengan batang task dan catatan pengingat.
  - Agenda hari ini: centang langsung (PUT task optimistis dan dikembalikan bila gagal). Kolom narasi entri tidak dikirim sehingga server mempertahankannya. "Tambah entri" membuka tab Laporan.
  - Riwayat 10 hari kerja: sel berwarna, tiap sel punya `contentDescription` tanggal + keadaan, ditambah legenda.
- Kartu Output/Catatan/Permintaan akses web tidak ikut (zona fitur lain).

## 5. Lonceng notifikasi (`:feature:notifikasi`)

- Titik masuk: `@Composable fun LoncengNotifikasi(onBuka: (tujuan: String?) -> Unit, modifier: Modifier = Modifier)` di paket `id.co.monitorkarya.feature.notifikasi`.
- Tampilan:
  - Ikon lonceng (IconButton 48dp) dengan `Badge` aksen; lencana tampil "9+" bila belum dibaca lebih dari 9. Label aksesibilitas: "Notifikasi, n belum dibaca".
  - Ketuk lonceng membuka `MkSheet` "Notifikasi": hingga 30 pesan, titik + `stateDescription` belum/sudah dibaca, waktu relatif ("5 menit lalu").
  - Tombol "Tandai semua dibaca" mengirim `PATCH {all:true}`.
- Ketuk satu pesan:
  - Mengirim `PATCH {ids:[id]}` (optimistis; dimuat ulang bila server menolak).
  - Memanggil `onBuka(tujuan)`. Sheet ditutup hanya bila `tujuan != null`.
  - `tandaiBanyak` memotong id menjadi ≤ 200 per panggilan (batas server).
- Daftar ditarik ulang tiap 60 detik selama siklus hidup STARTED (`repeatOnLifecycle`) dan setiap kali Sheet dibuka.
- `tujuan` = **nama `TabId`** hasil `tujuanTab(tabWeb)`:

  | Tab web | `TabId` |
  |---|---|
  | `dashboard` | `RINGKASAN` |
  | `work-desk` | `MEJA_KERJA` |
  | `daily-input` | `LAPORAN_HARIAN` |
  | `projects` | `PROYEK` |
  | `divisions` | `PEMBAGIAN_DIVISI` |
  | `weekly-input` | `CAPAIAN_MINGGUAN` |
  | `inbox` | `PENERIMAAN` |
  | `escalations` | `ESKALASI` |
  | `approvals` | `PERSETUJUAN` |
  | `entities` | `ENTITAS` |
  | `companies` | `PERUSAHAAN` |
  | `audit` | `LOG_AUDIT` |
  | `system` | `SISTEM_AKSES` |

  Tab `pesan`, `statistik`, atau yang tak dikenal menghasilkan `null`. Payload server hari ini hanya memakai `work-desk`, `dashboard`, `weekly-input`, dan `approvals`.

**Pemasangan oleh parent (MKShell, TopAppBar `actions`):**

```kotlin
LoncengNotifikasi(onBuka = { tujuan ->
    val tab = tujuan?.let { runCatching { TabId.valueOf(it) }.getOrNull() }
    if (tab != null && bolehLihatTab(peran, tab)) navigasiKeTab(tab)   // padanan canSeeTab web
})
```

## 6. Titik sambung outbox (untuk agen luring)

Semua tulisan layar lewat `GerbangLaporanPic`; metodenya bertanda `[TITIK-OUTBOX]`:
`simpanEntri`, `hapusEntri`, `kirimLaporan`, `hapusLaporan`, `unggahBukti`, `hapusBukti`.

- Hasilnya `HasilLaporan.Sukses | Antre | Gagal`. `LaporanViewModel` **sudah menangani `Antre`**: snackbar "Menunggu kirim…" dan Sheet ditutup.
- Untuk mengalihkan, cukup ubah badan metode itu: bila `Gagal(ApiError.Jaringan)`, panggil `AntreanOutbox.antre(...)` dengan kunci `KunciOutbox.laporanHarian(proyekId, tanggalKunci)` lalu kembalikan `Antre`. Tanggal sudah ada di payload: `reportDate` dan `workDate`.
- **Perhatian:** `SyncWorker` mendekode `TAMBAH_TUGAS`/`UBAH_TUGAS` sebagai `TaskSaveRequest`. Akibatnya `achievementToday`, `followUp`, dan `needsEscalation` milik entri **hilang** (ignoreUnknownKeys).
  - Untuk entri, perlu jenis baru (mis. `SIMPAN_ENTRI` yang mendekode `EntriSimpanRequest` lewat `EntriLaporanApi`), atau kolom itu ditambahkan ke `TaskSaveRequest` tanpa nilai bawaan.
  - Ingat aturan PUT: kunci yang absen berarti nilai lama dipertahankan.
- Bukti (multipart) dan `ajukanBukaKunci` tetap daring.
- `offline` layar masih dari parameter; ganti ke `BannerLuringOtomatis`/`DaftarAntreanOtomatis(KunciOutbox.AWALAN_LAPORAN)` saat outbox dipasang.

## 7. Uji dan build (skrip mutex)

- `:core:network:testDebugUnitTest`: 50 tes, 0 gagal (termasuk `EntriLaporanA1Test` 9).
- `:feature:notifikasi:compileDebugKotlin` dan `:feature:notifikasi:testDebugUnitTest`: hijau, 10 tes.
- `:app:compileDebugKotlin` **gagal karena `:feature:entitas`** (berkas agen lain: `PerusahaanLayar`/`R.string` tak dikenal, 300+ galat).
  - Dengan `-x :feature:entitas:compileDebugKotlin -x :feature:entitas:compileDebugJavaWithJavac -x :feature:entitas:kspDebugKotlin`, `:app:compileDebugKotlin` **hijau** dan berkas A1 tanpa peringatan.
  - `:app:testDebugUnitTest` (`LaporanLogikaTest` 12 + `MejaKerjaLogikaTest` 4) juga hijau dengan pengecualian yang sama.
- Belum diuji di perangkat/emulator (dilarang). Skenario manual yang disarankan:
  1. Tambah 2 entri, lampirkan foto, kirim.
  2. Admin PT meneruskan, lalu kartu terkunci.
  3. Ajukan buka kunci, lalu lihat lencana "diajukan".
  4. Mode 24/7 dan PT jam 15.00.

## 8. Temuan server (baca saja)

1. `GET /api/daily-input` mengirim `countdown: dailyCountdown(now)`, yang berbasis jam env 17.00, untuk PT berjam kustom. Padahal `lockAt` sudah mengikuti `dailyLockInstantWith`. Android menghitung dari `lockAt`; web masih menampilkan `countdown` yang salah. Usul: `dailyCountdownWith(rptSettings, now)`.
2. `/api/work-desk` tidak memberi tanda 24/7 eksplisit; klien menebak dari `cutoffLabel === "24.00 WIB"`. `countdown` di mode itu menghitung ke tengah malam.
3. Route PIC (daily-input, tasks, evidence) tidak menerbitkan `undoToken`, jadi "Urungkan" di laporan PIC belum pernah tampil.
