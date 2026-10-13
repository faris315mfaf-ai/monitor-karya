# E2E-3 — Peran pemantau, TI, dan Super Admin (Android)

Tanggal uji: 13 Oktober 2026, 13.25–14.17 WIB
Perangkat: emulator-5558 (1080x2400, 420 dpi; tablet 1600x2560 / 320 dpi), paket `id.co.monitorkarya.app.dev` (versi 0.1.0, terpasang 13.24)
Server: dev lokal 127.0.0.1:3100 lewat `adb reverse`, DB uji terisolasi (seed). Server dipakai bersama penguji lain, sehingga beberapa angka berubah selama sesi.
Akun: Manajemen, Auditor, TI, Super Admin (kata sandi dari `.env.e2e.lokal`, tidak dicantumkan di sini).
Tangkapan layar: `/private/tmp/claude-501/e2e-3/` (111 berkas; awalan m=Manajemen, a=Auditor, t=TI, s=Super Admin, d=gelap, tb=tablet, o=luring).

> Catatan: `s07-langkah3.png`, `s09-kembali-potret.png`, `s11-simpan.png`, dan `s33-akun-dibuat.png` memperlihatkan kata sandi serah terima akun uji. Isinya hanya data uji, tetapi berkas ini jangan dibagikan.

## Ringkasan

| Severity | Jumlah |
|---|---|
| KRITIS | 0 |
| TINGGI | 4 |
| SEDANG | 6 |
| RENDAH | 8 |

Tidak ada crash (logcat bersih dari `FATAL EXCEPTION` di semua alur, termasuk rotasi, tablet, mode gelap, dan luring).

---

## Bug

### B1 — TINGGI — Tema platform berbilah ActionBar menimpa bilah atas aplikasi; tombol Kotak masuk/Notifikasi/Keluar dan Muat ulang tidak bisa diketuk
**Langkah reproduksi**
1. Buka aplikasi, lalu masuk sebagai `manajemen@karya.co.id` (atau tutup paksa lalu buka ulang dengan sesi tersimpan: `am force-stop` → `am start`).
2. Perhatikan bagian atas layar.
3. Ketuk ikon Kotak masuk (754,84) atau ikon Keluar. Ketuk juga ikon Muat ulang di Ringkasan (985,273).

**Diharapkan:** ada satu bilah atas "Monitor Karya · Peran" dan semua ikonnya bisa diketuk.
**Nyata:** muncul bilah gelap kedua bertuliskan "Monitor Karya" (ActionBar bawaan platform). Posisinya berubah-ubah antar-peluncuran, dan ada tiga varian yang teramati:
- (a) Setelah login pertama: TopAppBar Compose tergambar di bawah status bar (y≈84), dan ActionBar menutupi kepala konten. Ketukan ikon jatuh ke status bar sehingga Kotak masuk tidak terbuka. Tombol Muat ulang tertutup ActionBar dan hanya sekitar 10 px tepi bawahnya yang bisa diketuk: ketukan di 985,273 tidak memicu `GET /api/ringkasan`, sedangkan ketukan di 985,285 memicunya.
- (b) Setelah mulai dingin dengan airplane mode menyala: TopAppBar (y≈212) tertutup penuh oleh ActionBar (`o04-mulai-dingin-luring.png`). Ketukan Keluar di 1007,160 tidak berpengaruh.
- (c) Peluncuran dari launcher: ActionBar ditambah TopAppBar dengan padding status ganda. Bisa dipakai, tetapi memakan sekitar 15% tinggi layar.

Akibatnya Ringkasan Manajemen menampilkan data basi (36/40, rata-rata 100%), sementara API sudah 35/40 dengan 5 terlambat dan rata-rata 98,7%, dan pengguna tidak bisa memuat ulang.
**Bukti:** `m01-ringkasan.png`, `m24-tap-kotakmasuk.png`, `o04-mulai-dingin-luring.png`, `t05-penerimaan.png`.
**Dugaan penyebab:** `android/app/src/main/AndroidManifest.xml:16-30`. `<application>`/`<activity>` tidak punya `android:theme`, sehingga platform memakai tema DeviceDefault yang ber-ActionBar. Ditambah `MainActivity.kt:27` (`enableEdgeToEdge()`), inset jadi tidak stabil. Perbaikan: tema `Theme.Material.Light.NoActionBar` (atau `Theme.MK` turunan NoActionBar) di manifest.

### B2 — TINGGI — "Urungkan" di antrean permintaan akses berubah menjadi "Setujui" milik baris berikutnya, sehingga akses yang salah ikut disetujui
**Langkah reproduksi** (TI → Lainnya → Sistem & akses → Permintaan akses)
1. Ketuk "Setujui" (770,755) pada baris pertama. Baris berubah menjadi "Disetujui · Urungkan" di posisi yang sama.
2. Sekitar 5–7 detik kemudian, ketuk "Urungkan" (847,755).

**Diharapkan:** keputusan dibatalkan, atau tombol Urungkan hilang tanpa menggeser baris lain ke bawah jari.
**Nyata:** setelah 5 detik PATCH terkirim, baris yang sudah diputus keluar dari daftar, dan "Setujui" milik baris berikutnya bergeser tepat ke posisi "Urungkan". Ketukan Urungkan justru menyetujui permintaan lain tanpa konfirmasi. Ini terjadi dua kali dalam sesi:
- Setujui "Modernisasi Pabrik" lalu Urungkan menghasilkan "Pengembangan R&D" ikut DISETUJUI (06:48:27Z).
- Tolak "Pengembangan Brand Premium" lalu Urungkan menghasilkan "Ekspansi Pasar Ekspor" DISETUJUI (06:49:45Z).

Urungkan yang diketuk sebelum 5 detik bekerja (tanpa request, `t20-akses-undo.png`).
**Bukti:** `t18-akses-setujui.png`, `t19-akses-urungkan.png`, `t21-tolak.png`, logcat `PATCH /api/access-requests` dua kali, serta `GET /api/access-requests?status=all`.
**Dugaan penyebab:** `feature/audit/.../sistem/SistemAksesViewModel.kt:152-172` (tahan 5 dtk lalu `kirim`) dan `:182-195` (item diganti status baru sehingga tersaring dari daftar "menunggu"). Daftar tidak menahan baris yang baru diputus (mis. tetap tampil "Disetujui" sampai pengguna menggulir atau keluar). Selain itu, setelah PATCH tidak ada jalur urung (`urungkan()` diam saja bila `tertahan` kosong, `:175-179`).

### B3 — TINGGI — Sheet di layar ≥840dp (ponsel lanskap dan tablet lanskap) tidak menampilkan isi formulir; kata sandi serah terima tidak terlihat
**Langkah reproduksi**
1. Super Admin → Perusahaan & akun → Tambah perusahaan, isi sampai Langkah 3 (atau Tambah akun).
2. Putar ke lanskap (`settings put system user_rotation 1`).

**Diharapkan:** panel samping selebar 440dp menempel di kanan, isinya bisa digulir.
**Nyata:** di ponsel lanskap (914dp) panel selebar layar hanya berisi judul dan tombol, tanpa field sama sekali (`s08-rotasi.png`, `s32-akun-landscape.png`). Layar "Tersimpan" juga tidak menampilkan kata sandi serah terima (`s12-tersimpan-landscape.png`), padahal teksnya menyatakan sandi tidak ditampilkan lagi setelah sheet ditutup. Di tablet lanskap panel juga selebar layar, bukan 440dp (`tb03-tablet-landscape-tambah.png`).
**Dugaan penyebab:** `designsystem/.../components/MkSheet.kt:82-91`. `tinggiMaks = maxHeight * 0.92f` diambil dari constraint induk tempat `MkSheet` dipanggil, bukan dari jendela Dialog, sehingga konten `weight(1f, fill=false)` (`:270-275`) mendapat tinggi 0. Lalu `:142-143`: `.fillMaxWidth().widthIn(max = 440.dp)` berurutan terbalik, sehingga batas lebar tidak berlaku (seharusnya `widthIn` dulu).

### B4 — TINGGI — Nama proyek hilang di drill-down "Laporan per perusahaan"
**Langkah reproduksi:** Manajemen → Ringkasan → ketuk kartu "PT Surya Panel Jatim".
**Diharapkan:** tiap baris memuat nama proyek, divisi, progres, PIC, dan lencana status.
**Nyata:** baris hanya berisi batang progres, "99%", avatar "LH", dan "Lapor hari ini · PIC …". Nama proyek dan lencana status tidak tampil. Avatar "LH" diambil dari kata "Lapor Hari", bukan dari nama PIC.
**Bukti:** `m05-pt.png`, `m13-energi.png`, `d02-gelap-sheet.png`.
**Dugaan penyebab:** `designsystem/.../components/ProjectRow.kt:87-104`. Row PIC tanpa `weight`/`widthIn` diukur lebih dulu dan menghabiskan lebar, sehingga `Column(Modifier.weight(1f))` berisi nama mendapat lebar 0. Ditambah `feature/ringkasangrup/.../SheetDrillDown.kt:108`, yang memasukkan teks status ke parameter `pic` (sumber inisial).

### B5 — SEDANG — Label tab bawah yang aktif tidak terbaca (terang di atas terang, gelap di atas gelap)
**Langkah reproduksi:** buka tab apa pun di peran mana pun dan lihat label di bawah ikon yang aktif.
**Nyata:** label tab aktif hampir tak terlihat (`m01-ringkasan.png`, `d01-gelap-ringkasan.png`). Bilah bawah juga berwarna lavender bawaan M3, bukan token surface.
**Dugaan penyebab:** `designsystem/.../theme/MKTheme.kt:94,135` (`secondary = c.fill1`) dipakai M3 untuk `selectedTextColor` NavigationBar. `surfaceContainer*` tidak dipetakan di `mkColorScheme` (`:86-150`). `NavigationBarItem` di `app/.../navigation/MKShell.kt:198-211` tidak memberi `colors`.

### B6 — SEDANG — Tab pemantau tidak menampilkan banner luring dan tidak punya data tersimpan
**Langkah reproduksi**
1. Super Admin di Ringkasan → `cmd connectivity airplane-mode enable`.
2. Untuk luring sungguhan: `adb reverse --remove tcp:3100`, lalu tutup paksa dan buka ulang.

**Diharapkan:** banner "Luring · data tersimpan …" tampil, dan data terakhir tetap terlihat.
**Nyata:**
- Ringkasan grup, Perusahaan & akun, Proyek, Eskalasi, Entitas, Log, dan Sistem tidak menampilkan banner apa pun walau `Active default network: none` (`o02-luring-atas.png`).
- Saat mulai dingin luring, sesi tetap masuk ke shell (bukan login) dan ini LULUS. Namun Ringkasan, Perusahaan, dan Eskalasi hanya berisi "… belum termuat. Anda sedang luring…" tanpa data tersimpan (`o05-dingin-luring-nyata.png`, `o07-luring-eskalasi.png`).
- Hanya Divisi (TimScreen) yang menampilkan "Luring · data tersimpan 14.07" (`o06-luring-divisi.png`).

**Dugaan penyebab:** modul `feature/ringkasangrup`, `entitas`, `eskalasi`, `proyek`, `audit`, `persetujuan` tidak memakai `BannerLuring`/`LuringViewModel` (bandingkan `app/.../ui/ringkasan/RingkasanScreen.kt:77`, `ui/tim/TimScreen.kt:156`) dan tidak punya cache Room.

### B7 — SEDANG — "Urungkan" nonaktifkan PT/akun tidak terlihat dan hilang saat sheet ditutup
**Langkah reproduksi:** Super Admin → buka PT → tab Pengaturan (paling bawah) → matikan "Perusahaan aktif". Hal yang sama berlaku untuk akun ("Nonaktifkan akun").
**Nyata:** status langsung nonaktif (PATCH terkirim), tetapi catatan "Urungkan" dirender di bagian atas isi sheet, di luar layar, sementara snackbar layar utama tertutup sheet modal. Setelah sheet ditutup, Urungkan hilang (`s19-nonaktif.png`, `s20-tutup-setelah-nonaktif.png`, `s21-urung-atas.png`). Menggulir ke atas di sheet malah ikut menutup sheet (seret-tutup ModalBottomSheet).
**Dugaan penyebab:** `feature/entitas/.../perusahaan/SheetPerusahaan.kt:100` dan `SheetAkun.kt:141`: `CatatanUrung` diletakkan di puncak isi, bukan di dekat kontrol atau di footer sheet.

### B8 — SEDANG — Kode aksi audit mentah tampil di Log aktivitas
**Langkah reproduksi:** Manajemen menyetujui lalu mengurungkan satu Persetujuan → Lainnya → Log aktivitas.
**Nyata:** judul baris "UNDO_APPROVAL_DECISION", "APPROVE_APPROVAL_REQUEST", dan sasaran "APPROVAL_REQUEST" tampil mentah (`m22-log.png`, `m23-log-detail.png`).
**Dugaan penyebab:** `feature/audit/.../model/AuditLabel.kt` (peta `AKSI_AUDIT`, `labelAksi :140`, `LABEL_SASARAN :169`) belum memuat sedikitnya `APPROVE/REJECT/WITHDRAW/REOPEN/CREATE_APPROVAL_REQUEST`, `UNDO_APPROVAL_DECISION`, `ATTACH_APPROVAL_FILE`, `COMMENT_WEEKLY_REPORT`, `REVIEW_PROJECT`, `UNDO_REVIEW_PROJECT`, `UNDO_DEADLINE_DECISION`, `UNDO_WEEKLY_COMMENT`, serta sasaran `APPROVAL_REQUEST`. Celah yang sama ada di web `src/lib/audit-labels.ts`.

### B9 — SEDANG — Satu ketukan "Muat ulang ringkasan" mengirim 4x `GET /api/ringkasan`
**Langkah reproduksi:** Ringkasan (grup) → ketuk Muat ulang (985,285).
**Nyata:** logcat 13:32:31 mencatat empat GET berurutan dalam 250 ms. Peta kepatuhan tidak ikut dimuat ulang.
**Dugaan penyebab:** `feature/ringkasangrup/.../RingkasanGrupViewModel.kt:88` (muatUlang memicu beberapa bagian yang masing-masing memanggil endpoint yang sama).

### B10 — SEDANG — Laporan harian TI: pilihan proyek pernah berpindah sendiri (intermiten)
**Langkah reproduksi:** TI → Laporan harian → ketuk baris "Pembangunan Pembangkit Baru" → gulir cepat ke bawah beberapa kali.
**Nyata:** ketukan pada Pembangunan (y=1027) memilih "Optimasi Jaringan Distribusi". Saat menggulir, pilihan sempat berpindah ke "Pengembangan Brand Premium" (PT-010-PRJ-02); logcat `GET /api/tasks?projectId=…c4e` muncul pada 13:41:18 dan 13:41:55 tanpa ketukan. Panel "Entri hari ini" + Tambah/Ubah/Hapus entri lalu menunjuk proyek lain dari yang disorot (`t09-pilih-renovasi.png` vs detail PT-010-PRJ-02). Dua upaya reproduksi terjadwal berikutnya tidak memunculkannya lagi.
**Dugaan penyebab:** perlu ditelusuri di `app/.../ui/laporan/LaporanHarianScreen.kt` (baris daftar klik di dalam scroll, atau pemulihan pilihan setelah muat ulang di `LaporanViewModel.kt`).

### B11 — RENDAH — Tab "Pengaturan" PT tersembunyi di luar layar
Detail PT: chip Ringkasan/Akun/Divisi/Proyek memenuhi lebar layar, dan "Pengaturan" baru terlihat setelah digeser horizontal, tanpa petunjuk visual (`s13-buka-pt.png`, `s15-tab-pengaturan.png`). Lokasi: `SheetPerusahaan.kt:101-114`.

### B12 — RENDAH — Item terakhir menu "Lainnya" Super Admin menempel di area gestur
"Sistem & akses" berada di y≈2343, menimpa handle navigasi (`s02-lainnya.png`). Masih bisa diketuk di y=2325. Daftar sheet Lainnya (MKShell) perlu `navigationBarsPadding`/gulir.

### B13 — RENDAH — Subjudul "Akun baru" tetap "Tingkat grup" setelah memilih PT
Tambah akun → pilih "PT Surya Panel Jatim": subjudul sheet tetap "Tingkat grup" (`s31-peran.png`, `s32-akun-landscape.png`). Akun tetap tersimpan benar di PT tersebut (diverifikasi lewat API).

### B14 — RENDAH — Simpan identitas PT tanpa umpan balik
Tab Pengaturan → ubah Alamat → "Simpan identitas": PATCH 200, tetapi tidak ada snackbar atau teks "Tersimpan" (`s17-simpan-identitas.png`).

### B15 — RENDAH — Ambang warna Peta kepatuhan vs grafik "10 PT terendah" tidak selaras
PT-001 80,8 berwarna hijau "Sesuai jadwal" di peta, tetapi berwarna oranye "Perlu perhatian · 81%" di grafik (`m02-peta.png`, `m04-grafik.png`, `tb02-tablet-bawah.png`). Legenda peta juga menyebut "≥ 90 selesai" untuk skor kepatuhan. Logika sama dengan web (`Pemetaan.kt:249-263` = `management-charts.tsx:60`), jadi ini perlu keputusan desain, bukan sekadar perbaikan Android.

### B16 — RENDAH — Tombol hapus PT ditawarkan untuk PT yang punya riwayat
"Hapus perusahaan" aktif untuk PT Surya Panel Jatim (96 data). Server menolak dengan benar (409, pesan tampil, `s26-hapus-409.png`). Tombol bisa dinonaktifkan sejak awal bila `laporan > 0`.

### B17 — RENDAH — Label tab bawah terpotong
"Perusahaan & akun" menjadi "Perusahaan &" (Super Admin, `d01-gelap-ringkasan.png`). "Laporan harian" pada TI terpotong menjadi "Laporan" tanpa elipsis.

### B18 — RENDAH — Dismiss sheet formulir oleh Back/ESC membuang isian tanpa konfirmasi
Formulir "Akun baru" yang sudah terisi tertutup oleh Back atau seret-bawah, dan semua isian hilang.

---

## Alur yang LULUS

**Manajemen**
- Ringkasan: KPI 4 tile bernilai tertulis, kalimat jawaban, Laporan per perusahaan → proyek → laporan 14 hari + eskalasi proyek.
- Tombol kembali sistem di tingkat proyek kembali ke daftar perusahaan, dan Back berikutnya menutup sheet.
- Grafik "10 PT kepatuhan terendah" dan "Kinerja divisi" menampilkan nilai dan target tertulis.
- Eskalasi: daftar + filter, detail, "Tandai ditinjau" (POST 200) + snackbar Urungkan.
- Proyek: daftar + filter tahap.
- Persetujuan: Setujui → "Disetujui" + Urungkan (antrean 54→53→54).
- Tim & divisi: daftar + detail mingguan.
- Entitas: pohon, rincian PT, divisi, dan proyek.
- Log aktivitas: daftar dan rincian (sebelum/sesudah, perangkat).
- Kotak masuk dan Notifikasi terbuka (di varian tata letak c).

**Auditor**
- Lima tab sesuai `ROLE_TABS` web (Ringkasan, Proyek, Divisi, Entitas, Log aktivitas).
- Detail proyek dan laporan mingguan tanpa tombol tulis.
- "Ajukan proyek" ada, sesuai kapabilitas `project:propose`.
- Unduh CSV membuka pemilih berkas sistem (dibatalkan, tidak disimpan).

**TI**
- 11 tab sesuai web.
- Meja kerja tanpa PT menampilkan pesan dan "Buka Ringkasan".
- Penerimaan harian/mingguan + Teruskan (tidak dieksekusi agar data penguji lain aman).
- Laporan harian lintas PT.
- Capaian mingguan dengan pemilih PT (10 PT, ganti ke PT Karet Jambi memuat data PT tsb).
- Sistem & akses: kesehatan, penguncian per entitas + rincian, antrean akses Setujui/Tolak, dan Urungkan dalam 5 detik (tanpa request).
- Proyek, Divisi, Eskalasi, Entitas, dan Log termuat tanpa galat.

**Super Admin**
- Menu bawah 4 tab + "Lainnya" 8 tab = 12 tab.
- Wizard Tambah perusahaan 4 langkah → POST 200 → "Tersimpan".
- Sandi serah terima stabil saat diputar (hash sama sebelum dan sesudah rotasi, di langkah 3 dan di layar Tersimpan; di Tambah akun juga stabil).
- Ubah identitas (PATCH 200). Nonaktif/aktifkan PT (PATCH 200).
- Hapus PT berriwayat → 409 ditangani dengan pesan server.
- Kelola akun lintas PT: buat akun di PT Surya Panel, pindahkan ke PT Karet Jambi (PATCH 200), dan nonaktifkan.
- Semua tab lain termuat tanpa galat.

**Tambahan**
- Tablet 1600x2560 @320: Ringkasan dua kolom (KPI 4 sejajar, kartu perusahaan 2 kolom).
- Mode gelap: token gelap diterapkan pada kartu, sheet, chip, dan field. Kontras baik kecuali B5.
- Tombol nonaktif tampak nonaktif ("Kembalikan" / "Simpan identitas" abu-abu sebelum ada perubahan).
- Luring: tidak crash di semua tab, pesan galat + "Coba lagi".
- Mulai dingin luring dengan sesi tersimpan masuk ke shell, bukan dilempar ke login.
- Pulih setelah koneksi kembali ("Coba lagi" memuat data).

## Efek samping pada DB uji (port 54329)
- PT baru "PT E2E Tiga Uji" (kode PT-E2ETIGAUJI), alamat "Jl. Uji Tiga", saat ini **nonaktif**; akun Admin PT `admin.e2etiga`.
- Akun `ujie2etigapic` (Manager proyek), dipindah ke PT Karet Jambi Makmur, **nonaktif**.
- Eskalasi PT Surya Panel Jatim "Keterlambatan signifikan…" berstatus **Ditinjau**.
- Permintaan akses: Modernisasi Pabrik (Ibu Mira) DISETUJUI; Pengembangan R&D (Bpk. Yudi) dan Ekspansi Pasar Ekspor (Bpk. Tono) DISETUJUI **tidak sengaja akibat B2**; Pengembangan Brand Premium (Ibu Vera) DITOLAK.
- Persetujuan materi Pembangunan Pembangkit Baru disetujui lalu diurungkan (kembali DIAJUKAN).

## Lingkungan dikembalikan
`wm size`/`wm density` reset (1080x2400 / 420), `user_rotation 0` + `accelerometer_rotation 1`, mode gelap `no`, airplane mode `0`, `adb reverse tcp:3100` dipasang kembali.
