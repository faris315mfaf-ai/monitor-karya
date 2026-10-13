# E2E-R2 — Perbaikan Android (13 Okt 2026)

Masukan: [E2E-R2-1-PIC-KADIV.md](E2E-R2-1-PIC-KADIV.md) (N1–N8, #9 sebagian), [E2E-R2-2-ADMIN-DIREKTUR.md](E2E-R2-2-ADMIN-DIREKTUR.md) (BUG-12/13/14a/14d/14e, N-02..N-07), [E2E-R2-3-PEMANTAU-TI.md](E2E-R2-3-PEMANTAU-TI.md) (N1–N5).

Lingkup: hanya `android/**`. Server `src/`, gradle, dan migrasi tidak disentuh. Tidak ada commit, push, atau deploy.

Build lewat skrip mutex (`gradle-kunci.sh testDebugUnitTest :app:assembleDebug -Pmk.baseUrl=http://127.0.0.1:3100/`): **BUILD SUCCESSFUL**, semua `testDebugUnitTest` lulus di 14 modul, 0 gagal.

Verifikasi dilakukan di `emulator-5556` (Admin PT) dan `emulator-5554` (PIC, Kadiv). Server lokal 3100. Tangkapan layar ada di `/private/tmp/claude-501/-Users-godam-PROYEK-monitor-karya--claude-worktrees-zcode-memory-update-5805eb/29a79309-d79f-44fc-90fc-db202b16d574/scratchpad/shots/pNN-*.png`.

Aturan pelaporan PT-001 sudah dikembalikan ke 17.00 / Sen–Jum / mingguan 17.00 ("Mode saat ini: Batasi 17.00 WIB · Terbuka", "Saat ini: Senin–Jumat."). Uji Teruskan (8) sudah diurungkan, sehingga 0 laporan berstatus diteruskan.

## Ringkasan status

| # | Temuan | Status | Bukti |
|---|---|---|---|
| R2-1 N1 | SyncWorker berhenti di 403 pertama | **BERES** (JVM + emulator) | `TarikPerProyekTest` (6 tes). Logcat PIC: 8 proyek, 7 kali `GET /api/tasks` 403 dan 1 kali 200, semuanya ditarik sampai proyek terakhir. Sesudahnya `GET /api/projects` putaran berikut. |
| R2-1 N2 | Bukti terunggah tidak tampil bila muat ulang gagal | **BERES** (JVM) | `LembarE2eR2Test.bukti_unggahan_tetap_tampil…`. Belum diuji di emulator karena perlu galat 422 buatan saat muat ulang. |
| R2-1 N3 | Divisi/Ringkasan Kadiv tidak memuat ulang | **BERES** (emulator) | Divisi → Ringkasan → Divisi → tarik: `GET /api/kadiv/team` ×3 dan `GET /api/my-dashboard` + `weekly-input` (logcat 5554, `p19`) |
| R2-1 N4 | Galat 409 "Tarik untuk disunting" tak terlihat; tombol tetap tampil setelah 15 menit | **BERES** (kode) | Pesan dipindah ke slot `MkSheet(galat=)` tepat di atas footer dan tampil 8 dtk. Tombol diganti "Tutup" setelah `sentAt + undoMinutes`. Tidak diuji di emulator karena tidak ada ringkasan terkirim yang segar. |
| R2-1 N5 / #9 | Hitungan bukti kurang dan lencana tidak seragam | **BERES** (emulator + JVM) | Ringkasan Kadiv kini menghitung dari baris bukti nyata `weekly-input`, aturannya sama dengan Meja kerja. SDM: Ringkasan 0 = Meja kerja 0 (`p17`/`p18`). Lencana Meja "Capaian M42 · **Disetujui**" (`p18`, tes `e2er2_n5_…`) |
| R2-1 N6 | Tautan "Lampirkan bukti" tidak menggulir ke Bukti | **BERES** (emulator) | `kadv.teknik.pt-003` (DRAFT): "Lampirkan bukti · Optimasi…" langsung membuka Sheet di bagian Bukti, dengan Lampirkan foto/berkas terlihat (`p21`). |
| R2-1 N7 | Galat validasi basi | **BERES** (emulator + JVM) | Terkendala → Simpan memunculkan 2 galat (`p15`). Isi Kendala → tinggal 1 galat "Rencana besok…" (`p16`). Ada 4 tes `LembarE2eR2Test`. |
| R2-1 N8 | FAB menutupi persen progres | **BERES** (emulator) | FAB melayang diganti tombol sebaris "Tambah butir" di atas papan. "75%" pada kartu pertama tidak lagi tertutup (`p20`). |
| BUG-12 / N-03 | Meja akun tergencet di potret, tak terlihat di lanskap | **BERES** (emulator) | Kepala Pengaturan + Meja akun + saringan + daftar menjadi satu `LazyColumn`. Potret dan gulir: `p02`/`p03`. Lanskap: daftar terlihat dan dapat digulir, akun dapat dibuka (`p04`–`p06`). |
| N-02 | Gulir Statistik melompat setelah simpan | **BERES** (emulator) | Lihat rincian di bawah. Ketukan 09.00 → 17.00 pada gulir maksimum dan tengah: posisi chip **identik** sebelum dan sesudah simpan (`p09`/`p10`). |
| BUG-13 | Pesan Urungkan "capaian mingguan" | **BERES** (emulator) | Teruskan (8) → Urungkan → "Penerusan 8 laporan ke Direksi diurungkan." (`p14`) |
| BUG-14a | "PIC PIC …" Meja kerja Admin | **BERES** (emulator + JVM) | "PT-001-PRJ-01 · PIC Pembangunan Pembangkit Baru · …" (`p12`). Helper bersama `core/domain/teks/LabelPic.kt` + `LabelPicTest`. |
| BUG-14d | Avatar "-" proyek tanpa PIC | **BERES** (emulator) | "E2E R2 Usulan Dua" kini ber-avatar "ER" (`p13`) |
| BUG-14e | "Belum masuk · disetujui" | **BERES** (emulator) | Laporan dengan approvedAt/forwardedAt tanpa submittedAt dibaca MASUK. Hasil: "Masuk · disetujui", "4 dari 4 divisi sudah menyerahkan" (`p11`) |
| N-04 | Snackbar Urungkan persetujuan proyek cepat hilang | **BERES** (kode) | `ProyekLayar`: snackbar ber-Urungkan memakai Indefinite + batas waktu 12 dtk sendiri |
| N-05 | "PIC Belum ada PIC" | **BERES** (JVM) | `labelPic` mengenali placeholder server menjadi "PIC belum ditentukan". Hitungan "belum lapor" untuk proyek tanpa PIC tetap keputusan server. |
| N-06 / R2-3 N4 | Judul top bar terpotong | **BERES** (emulator) | Top bar dua baris: "Monitor Karya" kecil, lalu peran ("Admin PT", "Kepala divisi") (`p01`, `p17`) |
| N-07 | "Kode sumber vnazzh5w" | **BERES** | Baris dan string `eskalasi_kode_sumber` dihapus |
| N-01 | Simpan pertama Aturan pelaporan (server) | Diabaikan sesuai instruksi (sudah diperbaiki di server) | — |
| SDM/GA tanpa tab Persetujuan | — | Bukan bug (paritas `ROLE_TABS` web) | — |
| R2-3 N1 | Layar pemantau tidak memuat ulang setelah daring | **BERES** (kode) | Lihat rincian di bawah |
| R2-3 N2 | "PIC PIC …" di DetailProyekSheet dan Penerimaan | **BERES** | Kedua tempat memakai `labelPic` |
| R2-3 N3 | Donat "Sesuai jadwal" = "Selesai" | **BERES** (kode) | Pada donat komposisi, "Selesai" memakai token `statusInfo` (biru). Legenda tetap menulis kata status. |
| R2-3 N5 | Footer Sheet ikut tergulir di ponsel lanskap | **BERES** (emulator + JVM) | Footer menempel di panel samping lanskap. Kepala ikut tergulir bersama isi. Hanya bila tinggi < 240dp (keyboard lanskap) semuanya satu gulir. `p06` menunjukkan "Tutup" menempel. Tes `e2er2_n5_footer_menempel…` |

## Rincian perbaikan

### N1 — SyncWorker tahan 403 per sumber
- `core/data/.../sync/TarikPerProyek.kt` (baru) berisi fungsi murni `tarikPerProyek`. Aturannya:
  - 403/404 → lewati sumber itu saja (laporan dan tugas proyek yang sama tetap dicoba).
  - Luring atau 401 → hentikan putaran.
  - Galat lain → catat gagal, lalu lanjut ke proyek berikutnya.
  - `lancar` (yang mencatat `terakhirSinkron`) = tidak ada gagal dan tidak terhenti.
- `HasilBaca.Gagal` kini membawa `kodeHttp` dan `luring` (diisi oleh `bacaApi`). Parameter baru punya nilai bawaan, jadi pemanggil lama tidak berubah.
- Outbox tidak perlu diubah: 403 sudah dipetakan ke `GagalPermanen`. Pesan ditandai GAGAL dan putaran tetap lanjut (`OutboxProsesor`).

### N-02 — Statistik stabil setelah simpan
Tiga lapis perbaikan:
1. `KepatuhanViewModel.muat(diam = true)` setelah simpan aturan. Meja tidak lagi diganti kerangka Memuat, dan galat muat diam mempertahankan meja lama.
2. Slot status "Menyimpan…" di kartu aturan kini selalu ada (kosong saat diam), sehingga chip di bawahnya tidak terdorong.
3. Penyebab sisa: modul kepatuhan di atas berubah tinggi (banner "terkunci" muncul/hilang saat jam 09.00 ↔ 17.00, ±194px). `KepatuhanScreen` kini menjangkar gulir:
   - Posisi blok bawah dicatat lewat `onPlaced`.
   - Bila blok itu sedang terlihat, gulir di-`scrollTo(nilaiSebelum + selisih)`.
   - Nilai sebelum diambil dari `snapshotFlow`, karena nilai di `onPlaced` sudah dikekang ke maxValue baru.

Hasil di emulator: sebelum perbaikan lapis 3, chip bergeser 844 → 1038px. Sesudahnya tetap 844 (gulir maksimum) dan tetap 1392 (gulir tengah).

Ketuk ganda selama simpan sudah dicegah: `simpan` keluar bila `menyimpan`, dan chip dinonaktifkan.

### BUG-12 / N-03 — Meja akun satu gulir
- `AkunScreen(kepala = …)` sekarang berupa satu `PullToRefreshBox` + `LazyColumn` dengan urutan item: kepala pemanggil, kepala meja, cari, chip, garis, lalu baris akun. Kerangka dan galat juga menjadi item.
- `PengaturanScreen` mengoper judul dan pengantar sebagai `kepala`.
- Tarik-untuk-muat-ulang tetap ada.

### N2 / N7 — Sheet entri PIC
- `GerbangLaporanPic.unggahBukti` mengembalikan `Bukti` dari jawaban POST upload.
- `LembarEntri.buktiBaru` + `gabungBukti(...)` digabung dengan bukti hasil muat ulang (tanpa ganda), dan dicerminkan juga ke daftar entri lokal. Hapus bukti ikut membuang dari keduanya.
- `galatSetelahUbah` (LaporanLogika) dipanggil di `ubahIsian`:
  - Galat validasi yang sudah tidak berlaku dibuang.
  - Galat server dibiarkan.
  - Galat baru tidak ditambahkan sebelum Simpan.

### N3 — Tarik-untuk-muat-ulang dan muat saat tab tampil
- `TimViewModel` dan `RingkasanPelaksanaViewModel` mendapat `saatTampil()` (muat diam, data lama tetap tampil bila gagal) dan `segarkan()`.
- Layar memanggil `LaunchedEffect(vm) { vm.saatTampil() }` dan dibungkus `TarikSegarkan` (komponen baru `app/ui/luring/TarikSegarkan.kt`).

### N4 — Ringkasan untuk Direktur
`RingkasanDirekturSheet` berubah dua hal:
- Pesan aksi tampil di slot galat Sheet (8 dtk, live region).
- `masihBisaTarik(sentAt, undoMinutes, sekarang)` dihitung ulang tiap 15 dtk. Setelah jendela lewat, footer berisi "Tutup".

### N5 / #9 — Hitungan bukti seragam
- `DasborKadiv.denganBuktiNyata(papan)` mengganti `tanpaBukti` dan bukti per butir dengan baris nyata `weekly-input`, memakai `perluBukti` yang sama dengan Meja kerja.
- Bila `weekly-input` gagal, angka my-dashboard tetap dipakai.
- Lencana Meja kerja: Disetujui → Diserahkan → Belum diserahkan.
- Kalimat "Serahkan … paling lambat" untuk laporan yang sudah disetujui adalah paritas web (lihat laporan R2-1), jadi tidak diubah.

### N6 / N8 — Capaian mingguan
- `MingguanViewModel.bukaBukti(id)` mengisi `SheetButir(keBukti = true)`. Setelah 350 ms, ButirSheet memanggil `bringIntoView()` pada bagian Bukti.
- `CatatanTanpaBukti` memakai `onBukaBukti`.
- FAB "Tambah butir" dihapus dan diganti `MkButton` sekunder selebar layar di atas papan (hanya saat DRAFT). Footer Serahkan tetap menjadi aksi primer.

### R2-3 N1 — Pemantau muat ulang saat daring kembali
- `MKShell.IsiTab` (khusus layar ber-banner shell) mendeteksi transisi luring → daring.
- Saat transisi itu, `viewModelStore` entri NavHost tab dikosongkan dan isi disusun ulang dengan `key(versiDaring)`. ViewModel baru lalu memuat ulang tanpa perlu mengubah tiap modul fitur.
- Konsekuensi: Sheet atau gulir di layar pemantau ikut tereset saat daring kembali.

### R2-3 N5 — Footer Sheet lanskap
`MkSheet.IsiSheet` kini punya tiga ragam:
- Normal: kepala dan footer menempel, isi tergulir.
- Ringkas (< 420dp): kepala + isi tergulir, footer menempel.
- Sangat pendek (< 240dp): semuanya satu gulir.

## Catatan verifikasi

- **Batas masuk server:** akun DRAFT (`kadv.teknik.pt-003`, `kadv.operasional.pt-002`) dicari lewat GET `/api/weekly-input` baca-saja. Skrip pencarian itu memicu batas percobaan masuk server per IP ("Coba lagi dalam 12 menit", 15.33–15.45 WIB). Masuk ke 3100 dari emulator lain mungkin sempat tertahan selama jendela itu. Sekarang sudah pulih.
- **Data uji yang tersentuh:** aturan PT-001 sempat 09.00, lalu dikembalikan ke 17.00 (dua kali). Teruskan 8 laporan → Urungkan, sehingga kembali 0 diteruskan. Entri PIC "R2 uji galat" dibatalkan (tidak tersimpan).
- **Rotasi:** `emulator-5556` dikembalikan ke `user_rotation 0`.
