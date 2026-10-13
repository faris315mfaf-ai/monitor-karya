# E2E-1 — Alur PIC, PIC wajib ganti sandi, Kepala divisi (emulator-5554)

Tanggal uji: 13 Okt 2026, 13.25–13.55 WIB. Aplikasi `id.co.monitorkarya.app.dev` 0.1.0 (APK debug 13.10, terpasang 13.24),
server dev `127.0.0.1:3100` (adb reverse), DB uji `mk-e2e-postgres-1` (seed). Tangkapan layar: `/private/tmp/claude-501/e2e-1/NN-*.png`.
Kode tidak diubah. Akun: `pic.pt-001.1`, `pic.pt-001.2` (wajib ganti sandi), `kadv.keuangan.pt-001` (laporan M42 status
MENUNGGU_PERSETUJUAN), `kadv.sdm.pt-008` (laporan M42 DRAF, dipakai untuk uji tambah/ubah/serahkan).

Tidak ada crash (`FATAL EXCEPTION` kosong sepanjang uji). Tidak ada 5xx di log server.

## Ringkasan bug

| # | Judul | Severity |
|---|---|---|
| 1 | Tab Divisi Kepala divisi tanpa Ingatkan, Tandai dibaca + Urungkan, dan Ringkasan ke Direktur | TINGGI |
| 2 | Capaian mingguan Android tidak bisa melampirkan bukti — Serahkan selalu ditolak server | TINGGI |
| 3 | Sheet (entri, butir, proyek) kosong di lanskap/layar ≥840dp — isian tak terlihat | TINGGI |
| 4 | Activity memakai tema platform ber-ActionBar: bilah hitam ganda + bilah atas kadang menimpa status bar | SEDANG |
| 5 | Geser-tutup Sheet "Ubah entri" membuang isian tanpa konfirmasi | SEDANG |
| 6 | Label tab aktif di bilah navigasi bawah nyaris tak terbaca | RENDAH |
| 7 | Butir mingguan berstatus N/A tampil "Belum mulai" dan masuk kolom Belum | RENDAH |
| 8 | "tenggat 17.00 WIB WIB" di tab Divisi | RENDAH |
| 9 | Jumlah butir Kepala divisi beda antarlayar (Ringkasan 2/4 vs Meja kerja 2/3) | RENDAH |
| 10 | Galat validasi Sheet entri muncul di dasar gulir, tidak terlihat saat menekan Simpan | RENDAH |

---

### 1. Tab Divisi Kepala divisi tanpa aksi Ingatkan / Tandai dibaca + Urungkan / Ringkasan ke Direktur — TINGGI
- Langkah: masuk `kadv.sdm.pt-008` → tab **Divisi** → ketuk anggota.
- Diharapkan (web `src/components/kadiv/member-sheet.tsx:157-196`): tombol "Ingatkan {nama}", "Tandai sudah dibaca"
  (+ Urungkan), serta akses ringkasan mingguan ke Direktur. Meja kerja sendiri menjanjikan ini
  (`MejaKadivScreen.kt:283`: "ingatkan yang belum lapor, … ringkasan untuk Direktur ada di tab Divisi").
- Nyata: tab Divisi hanya kartu "Laporan harian tim" + daftar anggota; Sheet anggota hanya info + "Tutup"
  (`51-divisi.png`, `52-anggota.png`). Tidak ada jalur ke ringkasan Direktur.
- Dugaan penyebab: `ui/tim/TimScreen.kt` (Sheet anggota, baris ~200-240) tidak punya aksi; `TimViewModel.kt` hanya
  `muat/ulang/pilih`. `RingkasanDirekturSheet` (`ui/tim/RingkasanDirekturSheet.kt`) dan `RingkasanDirekturViewModel`
  tidak dipanggil dari mana pun (kode mati). `LaporanDibacaApi` dipasang di `di/AppModule.kt:128` tapi tak dipakai VM mana pun.

### 2. Capaian mingguan tanpa unggah bukti — Serahkan tidak bisa diselesaikan — TINGGI
- Langkah: `kadv.sdm.pt-008` → Capaian → Tambah butir (status Terkendala, isi semua) → Simpan (PUT 200) → ubah butir
  (PUT 200) → **Serahkan**.
- Diharapkan: ada bagian Bukti per butir (web `division-weekly-desk.tsx:760,1022` memakai `EvidencePanel WEEKLY_ITEM`),
  lalu serah berhasil.
- Nyata: `POST /api/weekly-input 422`, kotak galat "6 item belum lolos validasi … Bukti pendukung wajib dilampirkan
  minimal 1 untuk status ini" (`50-serahkan.png`). Form butir tidak punya tombol lampirkan, jadi kepala divisi tidak bisa
  menuntaskan serah dari Android. Hal sama pada "Setujui laporan" `kadv.keuangan.pt-001` (`44-setujui.png`, 422).
- Dugaan penyebab: `ui/mingguan/MingguanScreen.kt:982-986` hanya menampilkan jumlah bukti; tidak ada pemilih/unggah.
- Catatan data seed: `WeeklyReportItem.evidenceCount` berisi 1-2 tapi baris `Evidence` untuk butir itu 0 (DB), sehingga
  Meja kerja menulis "Semua item berbukti" sementara server menolak — bukan bug aplikasi, tapi memperparah kebingungan.

### 3. Sheet kosong di lanskap / layar lebar — TINGGI
- Langkah: PIC → Laporan harian → Ubah entri → ketik → `settings put system user_rotation 1` (accelerometer 0).
- Diharapkan: form tetap bisa diisi (bisa digulir).
- Nyata: Sheet samping hanya berisi judul + Batal/Simpan; seluruh medan hilang (`12-rotasi-form.png`). Isian
  bertahan setelah kembali ke potret (`13-rotasi-kembali.png`) — tidak ada kehilangan data.
- Dugaan penyebab: `designsystem/.../components/MkSheet.kt:91` `tinggiMaks = maxHeight * 0.92f` memakai tinggi area
  tab pemanggil (sudah dipotong ActionBar + TopAppBar + NavigationBar ≈ 160dp di lanskap), bukan tinggi jendela Dialog;
  konten `weight(1f, fill=false)` (`MkSheet.kt:270-273`) jadi tinggi 0. Berlaku ke semua Sheet saat lebar ≥840dp (tablet/lanskap).

### 4. Tema ber-ActionBar: bilah hitam "Monitor Karya" ganda + inset tidak konsisten — SEDANG
- Langkah: buka aplikasi / masuk akun mana pun.
- Nyata: di atas TopAppBar Compose ada bilah hitam bawaan platform berjudul "Monitor Karya" (±150 px) di setiap layar.
  Tepat setelah masuk (PIC1, PIC2 setelah ganti sandi) TopAppBar Compose tergambar di area status bar (y 21–147) dan
  bilah hitam menutupi baris judul konten "Pembangunan Pembangkit Baru" (`01-pic-hariini.png`, `36-setelah-ganti.png`);
  ketukan ikon Keluar di y≈85 saat itu tidak bereaksi. Setelah keyboard/relaunch posisi pindah ke bawah bilah hitam
  (`11-daftar-entri.png`). Lanskap ikut kehilangan ruang (memperparah #3).
- Dugaan penyebab: `app/src/main/AndroidManifest.xml:16-26` — `<application>`/`<activity>` tanpa `android:theme`,
  sehingga dipakai `Theme.DeviceDefault` (ber-ActionBar) bersama `enableEdgeToEdge()` (`MainActivity.kt:27`).
  APK terbangun juga tanpa atribut tema (aapt2 dump). Perlu tema `NoActionBar`.

### 5. Geser-tutup Sheet "Ubah entri" membuang perubahan tanpa konfirmasi — SEDANG
- Langkah: Ubah entri → ubah judul/pelaksana → geser Sheet ke bawah saat konten di posisi atas (gerak gulir biasa).
- Nyata: Sheet tertutup, perubahan hilang, entri tetap versi lama (`14-cek.png`).
- Dugaan penyebab: `LaporanHarianScreen.kt:206` `onTutup = vm::tutupLembar` → `LaporanViewModel.kt:324-325`
  mengosongkan lembar; `MkSheet.kt:182-184` ModalBottomSheet tanpa `confirmValueChange`. (Pemulihan
  `LembarTersimpan.kt` hanya untuk proses mati, bukan dismiss.)

### 6. Label tab aktif bilah navigasi bawah nyaris tak terbaca — RENDAH
- Nyata: label tab terpilih ("Hari ini", "Laporan harian", "Capaian", "Divisi") abu sangat terang di atas latar terang
  (`01b-navbar.png`, `43-mingguan.png`).
- Dugaan penyebab: `designsystem/.../theme/MKTheme.kt:126` (dan :94) `secondary = c.fill1`; warna label aktif
  `NavigationBarItem` bawaan M3 diambil dari `secondary`. `MKShell.kt:191-199` tidak memberi `NavigationBarItemDefaults.colors`.

### 7. Butir N/A tampil "Belum mulai" — RENDAH
- Langkah: `kadv.keuangan.pt-001` → Capaian. API `/api/weekly-input` mengembalikan "Optimasi throughput produksi harian"
  `status=NA`.
- Nyata: kartu menampilkan chip "Belum mulai" dan masuk kolom/hitungan "Belum 2" (`43-mingguan.png`).
- Dugaan penyebab: `MingguanScreen.kt:581` `MkKartuPapan(status = mkStatusButir(...))` tanpa label →
  `MkBoardColumn.kt:168` memakai `kartu.status.label` (NEUTRAL = "Belum mulai", `StatusBadge.kt:49`);
  `MingguanViewModel.kt:910` memetakan NA ke kolom "belum". Label benar `labelStatusButir("NA")="N/A"` tidak dipakai.

### 8. "tenggat 17.00 WIB WIB" — RENDAH
- Nyata: subjudul kartu "Laporan harian tim" (`51-divisi.png`). API `/api/kadiv/team` sudah mengirim
  `cutoffLabel: "17.00 WIB"`.
- Penyebab: `ui/tim/TimScreen.kt:163` `"${masuk}tenggat ${tim.tenggatLabel ?: "17.00"} WIB"`.

### 9. Hitungan butir beda antarlayar — RENDAH
- Nyata (`kadv.keuangan.pt-001`, M42 berisi 4 butir, 1 NA): Ringkasan "2 dari 4 item / 50%" & Capaian "2 dari 4 butir"
  (`40-kadiv-home.png`, `43-mingguan.png`) vs Meja kerja "Item selesai 2 dari 3 / 67%" (`41-kadiv-meja.png`).
  Meja kerja juga "Capaian M42 · Belum diserahkan" sementara Capaian "Menunggu persetujuan" (seed: statusHeader
  MENUNGGU_PERSETUJUAN tanpa submittedAt).
- Penyebab: `MejaKadivLogika.kt:115` mengecualikan NA; Ringkasan memakai `summary.items` server
  (`DasborPelaksana.kt:208`) yang menghitung NA. Status serah Meja kerja dari `submittedAt`, Capaian dari `statusHeader`.

### 10. Galat validasi Sheet entri di luar layar — RENDAH
- Langkah: Tambah entri → status Terkendala, kosongkan Kendala/Rencana → Simpan entri.
- Nyata: tidak ada umpan balik terlihat; tiga pesan galat baru tampak setelah menggulir ke dasar (`06-validasi.png`,
  `07-validasi-galat.png`). Validasi sendiri benar (spasi saja ditolak).
- Penyebab: `LaporanLembar.kt:339` menaruh `KotakGalat` di akhir konten gulir, tanpa scroll-to/penanda per medan.

---

## Alur LULUS

PIC (`pic.pt-001.1`)
- Masuk; tab Hari ini, Meja kerja, Laporan harian, Proyek tampil dengan data benar (`01`–`03`, `27`).
- Tambah entri semua medan (judul, deskripsi, pelaksana, hasil, status Terkendala, progres 60%, kendala, eskalasi +
  keputusan, rencana besok) → `POST /api/tasks 200`; validasi wajib Terkendala/eskalasi benar (`07`, `11`).
- Ubah entri (judul, pelaksana, status) → `PUT /api/tasks 200`, DB sesuai.
- Hapus entri dengan konfirmasi → `DELETE 200`, baris Task + Evidence ikut terhapus.
- Tambah lagi + unggah bukti lewat pemilih foto dan pemilih berkas → `POST /api/evidence/upload 200`, thumbnail tampil (`10`, `11`).
- Kirim laporan (dialog konfirmasi) → `PUT /api/daily-input 200`, DB `submittedAt` 13.35 WIB, status "Terkirim 13.35" (`19`).
- Luring sejati (airplane + reverse 3100 dicabut sementara): entri + bukti tersimpan "Menunggu kirim · dikirim
  otomatis saat daring" (`23`, `25`); daring kembali → `POST /api/tasks` + `POST /api/evidence/upload` otomatis, DB
  memuat entri dan bukti. (Catatan: airplane saja tidak memutus `adb reverse`, entri pertama langsung terkirim.)
- Keluar dengan antrean berisi → dialog "2 perubahan belum terkirim…" + "Tetap masuk" (`26`).
- Keluar biasa → Room (`proyek`, `tugas`, `outbox`, `cache_layar`, dll.) kosong; akun berikutnya hanya melihat datanya sendiri (`36`).
- Proyek: daftar, filter, detail Sheet (`28`), Ajukan proyek → `POST /api/projects 200`, "2 pengajuan menunggu" (`30`).
- Lonceng notifikasi: daftar, ketuk → `PATCH /api/notifications` + pindah ke Meja kerja (`31`, `32`).
- Pesan (Kotak masuk) terbuka dan memuat pesan (`33`).
- Putar layar: isian Sheet bertahan setelah kembali potret (lihat #3 untuk tampilan lanskap).

PIC wajib ganti sandi (`pic.pt-001.2`)
- Masuk → dipaksa ke "Ganti kata sandi", tombol "Keluar dari akun" ada (`35`); ganti → `POST /api/profile/password 200`
  → langsung masuk shell (`36`). Sandi baru disimpan sebagai `E2E_PIC2_NEW` di `.env.e2e.lokal`.

Kepala divisi
- Ringkasan, Meja kerja (daftar periksa 6 syarat, "Perlu tindakan"), Capaian: tambah butir dengan validasi wajib
  (PIC, capaian, kendala saat Terkendala) → `PUT 200`; ubah butir → `PUT 200`; galat 422 server ditampilkan jelas.
- Proyek → Ajukan proyek (`kadv.sdm.pt-008`) → `POST /api/projects 200` (`53`). Notifikasi kosong tampil benar (`54`).

## Catatan lingkungan / insiden

- **Skrip bersama tertimpa:** berkas `scratchpad/login.sh` dipakai juga oleh agen lain dan ditimpa menjadi versi
  `emulator-5558` sekitar 13.41. Dua pemanggilan saya (13.41–13.42) karena itu mengetik username `pic.pt-001.2` + sandi
  seed + Enter ke **emulator-5558**, bukan 5554. Setelah itu semua skrip dipindah ke folder privat
  `scratchpad/e2e1-pic-5554/`. Penguji 5558 sebaiknya memeriksa apakah sesinya terganggu.
- `adb reverse tcp:3100` sempat dicabut di 5554 untuk uji luring lalu dipasang lagi; airplane mode dimatikan; rotasi
  dikembalikan ke potret (`user_rotation 0`, `accelerometer_rotation 0`).
- Data uji tertulis di DB uji: Task "E2E entri dua", "E2E entri luring", "E2E antrean luring" (proyek PT-001-PRJ-01),
  laporan harian PT-001-PRJ-01 terkirim ulang (progres kini 38%), proyek usulan "E2E Proyek Uji PIC" dan
  "E2E Proyek Kadiv", butir mingguan "E2E butir kadiv diubah" (SDM PT-008 M42), sandi `pic.pt-001.2` diganti.
- Membuka bukti meluncurkan Chrome (URL presigned `127.0.0.1:59000`); Chrome di emulator berhenti di layar
  sambutan, tidak diteruskan (perlu persetujuan syarat).
