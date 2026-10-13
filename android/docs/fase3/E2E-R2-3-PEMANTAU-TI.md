# E2E-R2-3 — Regresi peran pemantau, TI, dan Super Admin (Android)

Tanggal uji: 13 Oktober 2026, 14.44–15.06 WIB
Perangkat: emulator-5558 (1080x2400 / 420 dpi; tablet 1600x2560 / 320 dpi), paket `id.co.monitorkarya.app.dev` 0.1.0 (terpasang 14.43)
Server: dev lokal 127.0.0.1:3100 lewat `adb reverse`, DB uji `mk-e2e-postgres-1` (seed ulang). Server dan DB dipakai bersama penguji lain, jadi angka di layar bisa berubah selama sesi.
Akun: Manajemen, Auditor, TI, Super Admin. Kata sandi diambil dari `.env.e2e.lokal` dan tidak dicantumkan di sini.
Rujukan: [E2E-3-PEMANTAU-TI.md](E2E-3-PEMANTAU-TI.md), [E2E-3-PERBAIKAN.md](E2E-3-PERBAIKAN.md), [E2E-1-PERBAIKAN.md](E2E-1-PERBAIKAN.md).
Bukti: `/private/tmp/claude-501/e2e-r2-3/` (75 tangkapan). Awalan berkas: m=Manajemen, a=Auditor, t=TI, s=Super Admin, d=gelap, tb=tablet, o=luring, r=peluncuran. Pada `s06`, `s07`, `s08`, dan `s11`, area kata sandi serah terima sudah ditutup blok abu-abu.

Logcat bersih: tidak ada `FATAL EXCEPTION` di semua alur, termasuk rotasi, tablet, mode gelap, mulai dingin luring, dan peluncuran dari launcher.

## Ringkasan

| Hasil | Jumlah |
|---|---|
| TERBUKTI BERES | 15 |
| MASIH ADA | 2 (B6 sebagian, B15 menunggu keputusan desain) |
| TIDAK DAPAT DIUJI | 1 (B10 intermiten, tidak muncul lagi) |
| Bug baru | 0 kritis, 0 tinggi, 1 sedang, 4 rendah |

## Tabel regresi

| # | Temuan E2E-3 | Status | Bukti uji ulang |
|---|---|---|---|
| B1 | ActionBar ganda, ikon top bar tidak bisa diketuk | **TERBUKTI BERES** | Hanya satu bilah "Monitor Karya · Peran" pada tiga kondisi: setelah login, mulai dingin luring, dan peluncuran dengan intent LAUNCHER. Kotak masuk (754,212), Notifikasi, dan Keluar berfungsi. Muat ulang (985,401) memicu GET. `m01`, `m02`, `m03`, `o04`, `r02` |
| B2 | Urungkan akses menyetujui baris lain | **TERBUKTI BERES** | Lihat rincian di bawah tabel |
| B3 | Sheet ≥840dp kosong, sandi serah terima tak terlihat | **TERBUKTI BERES** | Ponsel lanskap (914dp): panel kanan ±440dp, field Langkah 3 tampil dan bisa digulir, layar "Tersimpan" menampilkan sandi + Salin. Tablet lanskap 1600x2560@320: panel 440dp, footer menempel. Hash sandi sama sebelum dan sesudah rotasi (`3f3d…`). `s07`–`s11`, `tb03`, `tb04` |
| B4 | Nama proyek hilang di drill-down per perusahaan | **TERBUKTI BERES** | Baris memuat nama, "divisi · PIC", "Lapor hari ini", lencana, dan persen, baik terang maupun gelap. Tingkat proyek dan Back bertahap berfungsi. `m04`, `m05`, `d02` |
| B5 | Label tab aktif tak terbaca | **TERBUKTI BERES** | Terang dan gelap, label aktif kontras. `m01`, `d01`, `d03` |
| B6 | Tab pemantau tanpa banner luring / tanpa data tersimpan | **MASIH ADA (sebagian)** | Banner kini tampil di Ringkasan grup, Proyek, Persetujuan, Divisi, Perusahaan, Log, Sistem, dan Eskalasi (`o01`, `o02`, `o07`, `o08`). Saat mulai dingin luring, Ringkasan/Persetujuan/Divisi tetap "belum termuat" tanpa data tersimpan (`o04`–`o06`). Cache Room memang belum dibuat (diakui di E2E-3-PERBAIKAN) |
| B7 | Urungkan nonaktif PT tak terlihat | **TERBUKTI BERES** | Catatan "dinonaktifkan · Urungkan" tampil di atas footer sheet, lalu muncul sebagai snackbar setelah sheet ditutup. Urungkan dari snackbar → PATCH, dan DB `isActive=t`. `s15`, `s16` |
| B8 | Kode audit mentah | **TERBUKTI BERES** | Log memakai label "Urungkan keputusan persetujuan" dan sasaran "Permintaan persetujuan". Enam layar log digulir dan dropdown Aksi diperiksa: tidak ada kode `A_B` tersisa. `m14`–`m16`, `a07` |
| B9 | 4× `GET /api/ringkasan` per muat ulang | **TERBUKTI BERES** | Satu ketukan menghasilkan tepat 1× `ringkasan`, `compliance-map`, `late-incidents`, dan `management-charts` (log server) |
| B10 | Pilihan proyek TI berpindah sendiri | **TIDAK DAPAT DIUJI** (tidak muncul) | Setelah memilih Renovasi, 11 swipe cepat tidak memicu `GET /api/tasks` lain. Sorotan tetap, dan panel "Entri hari ini" menunjuk Renovasi. `t11`–`t13` |
| B11 | Tab Pengaturan PT tersembunyi | **TERBUKTI BERES** | "Pengaturan" turun ke baris kedua chip. `s12` |
| B12 | Item terakhir "Lainnya" di area gestur | **TERBUKTI BERES** | "Sistem & akses" berada jauh di atas handle. `s02`, `t02` |
| B13 | Subjudul "Tingkat grup" tetap | **TERBUKTI BERES** | Subjudul berubah menjadi "PT Surya Panel Jatim" setelah PT dipilih |
| B14 | Simpan identitas tanpa umpan balik | **TERBUKTI BERES** | Teks "Identitas perusahaan tersimpan." muncul dan PATCH 200. `s14` |
| B15 | Ambang warna peta vs grafik | **MASIH ADA** | Tidak diubah, menunggu keputusan desain lintas web dan Android |
| B16 | Hapus PT berriwayat ditawarkan | **TERBUKTI BERES** | Penjelasan "Sudah punya 85 laporan, jadi tidak bisa dihapus. Nonaktifkan saja…" tampil. `s17` |
| B17 | Label tab bawah terpotong | **TERBUKTI BERES** | Label pendek "Perusahaan", "Laporan", "Log", "Masuk" utuh. (Lihat N4 untuk judul top bar.) |
| B18 | Back/geser membuang isian | **TERBUKTI BERES** | "Akun baru" terisi: Back dan geser-bawah tidak menutup, Batal menutup. Layar "Tersimpan": Back dan ketuk scrim tidak menutup |

### Rincian B2 (DB dibaca baca-saja)

TI → Sistem & akses → Permintaan akses:
1. Setujui "PIC Pengembangan R&D". Selama penahanan 5 detik, Tolak/Setujui baris lain abu-abu (`t05`).
2. Tujuh detik kemudian, posisi lama Urungkan diketuk. Ketukan hanya membuka rincian R&D sendiri (`t07`).
3. Hasil: hanya ada satu PATCH. DB: R&D `DISETUJUI`, sedangkan Brand Premium, Ekspansi, Penghematan, dan Green Factory tetap `DIAJUKAN`.
4. Uji kedua: Tolak "Ekspansi Pasar Ekspor", lalu Urungkan 2 detik kemudian. Tidak ada PATCH dan DB tetap `DIAJUKAN` (`t09`).

## Bug baru

### N1 — SEDANG — Layar pemantau tidak memuat ulang otomatis setelah koneksi kembali
**Reproduksi**
1. Manajemen, mulai dingin luring: `adb reverse --remove tcp:3100`, airplane on, lalu `am force-stop` dan `am start`.
2. Pulihkan reverse dan matikan airplane, lalu tunggu 10 detik.

**Diharapkan:** banner hilang, dan Ringkasan/Divisi/Persetujuan memuat sendiri, atau setidaknya pesannya berubah.
**Nyata:** banner hilang, tetapi layar tetap "Ringkasan belum termuat. Anda sedang luring atau server tak terjangkau." sampai pengguna mengetuk "Coba lagi". Pesan itu keliru karena perangkat sudah daring. Hal yang sama terjadi di Divisi.
**Bukti:** urutan `o04`–`o06`, lalu dump setelah daring (Ringkasan tetap berstatus galat).
**Dugaan:** `app/.../navigation/MKShell.kt:361-377`. `IsiTab` hanya menampilkan `BannerLuring` tanpa memicu muat ulang saat `luring` berubah dari true ke false. ViewModel modul fitur (mis. `feature/ringkasangrup/.../RingkasanGrupViewModel.kt:95` `muatUlang`) tidak mengamati konektivitas.

### N2 — RENDAH — "PIC PIC …" di rincian proyek dan Penerimaan
**Reproduksi**
- Manajemen → Proyek → Pembangunan Pembangkit Baru.
- TI → Masuk (Penerimaan).

**Diharapkan:** "PIC Pembangunan Pembangkit Baru" (nama PIC di seed sudah berawalan "PIC").
**Nyata:** di rincian proyek tertulis "PIC PIC Pembangunan Pembangkit Baru" (`m08`). Di Penerimaan tertulis "PT-001-PRJ-01 · PIC PIC Pembangunan…" (`t14`).
**Dugaan:** `feature/proyek/.../ui/DetailProyekSheet.kt:205`, `app/.../ui/penerimaan/PenerimaanViewModel.kt:402`, dan `app/.../ui/admin/MejaKerjaAdminViewModel.kt:436` masih memakai `"PIC $it"`. Mereka belum memakai pola `labelPic()` (`feature/ringkasangrup/.../logika/Pemetaan.kt:146`) yang sudah menghindari awalan ganda.

### N3 — RENDAH — Donat "Komposisi status proyek": "Sesuai jadwal" dan "Selesai" berwarna sama
**Nyata:** kedua legenda memakai hijau yang sama, sehingga 1 proyek "Sesuai jadwal" tidak bisa dibedakan dari 36 "Selesai" di donat (`d01`, `m06`).
**Dugaan:** pemetaan warna status `on`/`done` di komponen donat ringkasan grup (`feature/ringkasangrup`), keduanya `MkStatus` hijau. Perlu warna atau tekstur berbeda, atau keputusan desain.

### N4 — RENDAH — Judul top bar Super Admin terpotong
**Nyata:** di ponsel potret, judul tampil "Monitor Karya · Super Adm…" (`s02`, `d03`), karena ruangnya habis dipakai tiga ikon.
**Dugaan:** `app/.../navigation/MKShell.kt:171-175` (`TopAppBar` `maxLines = 1`). Bisa dengan label peran pendek ("Super Admin" → "Superadmin"), atau baris peran sebagai subjudul.

### N5 — RENDAH — Di ponsel lanskap, judul dan footer sheet ikut tergulir
**Nyata:** pada panel samping di lanskap 914dp, judul, tombol Tutup, dan footer (Kembali/Lanjut, Selesai/Buka perusahaan) ikut tergulir bersama isi. Footer baru terlihat setelah menggulir ke bawah (`s07`, `s09`). Di tablet lanskap footer menempel dengan benar (`tb04`).
**Dugaan:** `designsystem/.../components/MkSheet.kt`. Saat tinggi jendela kecil, Sheet jatuh ke mode gulir penuh. Pertimbangkan agar footer tetap menempel dengan tinggi isi minimum.

### Catatan (bukan bug aplikasi)
- **Airplane mode tidak memutus `adb reverse`.** Dalam mode airplane, Persetujuan → Setujui tetap terkirim (PATCH 200, lalu diurungkan), sementara banner luring tampil. Ini artefak lingkungan emulator. Luring sungguhan diuji dengan `adb reverse --remove`.
- **Data seed:** "Terkirim 16.00" tampil pukul 14.56. Waktu kirim seed berada di masa depan.
- **Konsistensi angka:** "2 buka kunci menunggu dibuka" vs tile "Buka kunci menunggu 4" di Sistem & akses. Ini sama dengan logika web (`system-view.tsx:101,120`), bukan regresi Android.
- **Label aksesibilitas:** sheet M3 memakai content-desc bawaan "Close sheet" dan "Drag handle" (bahasa Inggris).

## Alur penuh yang LULUS

**Manajemen**
- Ringkasan: KPI, drill-down PT → proyek → laporan 14 hari, dan Back bertahap.
- Proyek: daftar dan rincian.
- Persetujuan: Setujui, lalu Urungkan kembali ke DIAJUKAN (PATCH dua kali, DB tidak berubah bersih).
- Tim/Divisi, Eskalasi, Entitas, Log (rincian), Kotak masuk, dan Notifikasi.
- Mode gelap dan tablet: 4 KPI sejajar, kartu PT dua kolom, panel drill-down 440dp.

**Auditor**
- Lima tab: Ringkasan, Proyek, Divisi, Entitas, Log.
- Rincian proyek dan laporan mingguan tanpa tombol tulis.
- "Ajukan proyek" tersedia.
- Saring log dan dropdown aksi berlabel.

**TI**
- 11 tab (4 tab bawah + 7 di Lainnya).
- Meja kerja tanpa PT.
- Penerimaan.
- Laporan harian lintas PT.
- Capaian mingguan.
- Sistem & akses: kesehatan dan antrean akses (B2).

**Super Admin**
- Wizard Tambah perusahaan 4 langkah, termasuk rotasi di tengah alur → POST 200.
- Ubah identitas, lalu nonaktif dan urungkan.
- Hapus nonaktif untuk PT berriwayat.
- Akun baru dengan subjudul PT, lalu dibatalkan.
- Banner luring di semua tab modul.
- Mode gelap.

## Efek samping pada DB uji
- PT baru "PT E2E Regresi Tiga" (PT-E2EREGRESITIGA, alamat "Jl. Regresi Tiga"), **aktif**, dengan akun Admin PT `adminregresitiga`.
- Permintaan akses: "PIC Pengembangan R&D" **DISETUJUI** (akses sementara s.d. 16 Okt), "PIC Pengembangan Brand Premium" **DITOLAK**.
- Persetujuan materi Pembangunan Pembangkit Baru disetujui lalu diurungkan dua kali, sehingga statusnya kembali DIAJUKAN.

## Lingkungan dikembalikan
- `wm size` 1080x2400 dan `wm density` 420 (reset).
- `user_rotation 0` dan `accelerometer_rotation 1`.
- Mode gelap `no` dan airplane `0`.
- `adb reverse tcp:3100` terpasang kembali.
- Sesi Super Admin tetap masuk.
