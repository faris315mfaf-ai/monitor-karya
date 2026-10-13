# E2E-R2-2 — Regresi Admin PT, Direktur entitas, Direktur SDM/GA (emulator)

Tanggal uji: 13 Okt 2026, 14.43–15.05 WIB. Penguji: agen E2E-R2-2. Agen ini hanya membaca kode dan tidak mengubahnya.
Rujukan: [E2E-2-ADMIN-DIREKTUR.md](E2E-2-ADMIN-DIREKTUR.md), [E2E-1-PERBAIKAN.md](E2E-1-PERBAIKAN.md), [E2E-2-PERBAIKAN-FEATURE.md](E2E-2-PERBAIKAN-FEATURE.md), `docs/zcode/laporan-swarm/E2E-SERVER-DIREKTUR.md`.

## Lingkungan

| Hal | Nilai |
|---|---|
| Perangkat | `emulator-5556`, 1080x2400, 420dpi; potret + lanskap (`user_rotation` 1, lalu dikembalikan ke 0) |
| Aplikasi | `id.co.monitorkarya.app.dev` 0.1.0 (dipasang 14.43) → `127.0.0.1:3100` (adb reverse) |
| DB | DB uji hasil seed ulang. Data diubah hanya lewat aksi aplikasi dan beberapa panggilan API yang disebut di bawah |
| Akun | `admin.pt-001`, `direktur.sh-energi` (SUB_HOLDING induk PT-001), `direktur.sh-agro`, `sdmga`. Sandi dibaca dari `.env.e2e.lokal` dan tidak ditulis di sini |
| Bukti | `/private/tmp/claude-501/e2e-r2-2/r*.png` (52 tangkapan). Tangkapan lanskap hasil wizard dihapus karena berisiko memuat sandi. Sandi serah terima dibandingkan lewat hash sha256 (`pwhash.sh`), tidak pernah dicetak |
| Crash | `logcat -c` di awal. Penyaringan `FATAL EXCEPTION` / `E AndroidRuntime` / `ANR`: **0** sepanjang sesi |

### Jejak data uji (DB uji)

- Proyek `E2E R2 Usulan Admin` (PT-001-PRJ-05) diajukan Admin PT lalu disetujui Direktur sh-energi, sekarang **AKTIF**. Proyek `E2E R2 Usulan Dua` (PT-001-PRJ-06) dibuat lewat API Admin, disetujui, lalu diurungkan, sekarang **DIUSULKAN**.
- Akun `e2er2akunuji` (Manager proyek, PT-001) dibuat lewat wizard aplikasi.
- Baris `ReportSettings` PT-001 kini ada: 17.00, Sen–Jum, mingguan 17.00, terbuka. Isinya setara bawaan kode, tetapi sekarang tersimpan sebagai baris.
- Laporan mingguan K3 & Lingkungan PT-001 M41 ditandai dibaca oleh sh-energi. Tanda baca Produksi sudah diurungkan.
- Penerusan 8 laporan ke Direksi lalu Urungkan: laporan **tidak** beku. Tolak cuti lalu Urungkan dan Tandai ditinjau eskalasi lalu Urungkan: keduanya kembali ke keadaan semula.
- CSV `/sdcard/Download/log-aktivitas-2026-10-13 (1).csv` di emulator.

---

## Tabel regresi (temuan E2E-2)

| Temuan | Status | Bukti / catatan |
|---|---|---|
| BUG-01 Direktur entitas tidak bisa menyetujui usulan | **TERBUKTI BERES** | Admin PT ajukan → "Menunggu Direktur entitas" (`r26`, `r27`). Di sh-energi, Proyek → Diusulkan menampilkan "1 pengajuan menunggu keputusan Anda" dengan Tolak/Setujui (`r31`). Setujui → POST approve 200, snackbar "...disetujui sebagai Direktur entitas." + Urungkan, dan API memastikan PRJ-05 `AKTIF` (`r32`). Usulan kedua: Setujui → Urungkan → POST `/api/undo` 200, "Persetujuan proyek diurungkan.", kembali DIUSULKAN dengan `approve=true` (`r33`). Di sh-agro, Diusulkan kosong (`r47`) dan POST approve langsung → 403 "...Direktur entitas yang membawahi PT pemilik proyek..." |
| BUG-02 Statistik tanpa Aturan pelaporan + peta panas | **TERBUKTI BERES** (ada bug baru N-01, N-02) | Peta panas 10 hari tampil: legenda, deskripsi pembaca layar per divisi, ketuk sel → "Divisi Keuangan · Rab 30 · 0% lapor" (`r06`, `r55`). Kartu Aturan pelaporan tampil (`r07`). Efeknya nyata: jam 09.00 → PIC PT-001 langsung `locked=true`, `lockReason=TIME`. "Tutup pengisian" → PIC terkunci, "Buka" → terbuka lagi. Tenggat mingguan "Tanpa batas" → teks Statistik "Tenggat serah terima hari Kamis, tanpa jam batas." (`r08`, `r11`) |
| BUG-03 Meja akun tanpa wizard Tambah akun | **TERBUKTI BERES** | Tombol "Tambah akun". Wizard berjalan Identitas → Posisi → Tinjau, dengan validasi kosong (`r15`), username otomatis dari nama, dan email otomatis `@karya.co.id`. POST `/api/companies/users` 200 → "Akun dibuat" + sandi awal tampil sekali. Hash sandi sama di potret → lanskap → potret. Daftar langsung menjadi 10 akun (`r14`–`r18`) |
| BUG-04 Snackbar Urungkan tandai dibaca Direktur | **TERBUKTI BERES** | Sheet tertutup, lalu snackbar "Laporan Divisi K3 & Lingkungan · PT Energi Migas Sumut ditandai sudah dibaca." + Urungkan bertahan ≥8 dtk (`r36`). Urungkan pada laporan Produksi → `DELETE /api/ringkasan/laporan-dibaca` 200, status kembali "Terkirim" (`r38`) |
| BUG-05 Sheet lanskap hanya judul | **TERBUKTI BERES** | Sheet laporan proyek di lanskap tampil sebagai panel samping ±440dp, isi lengkap, dan bisa digulir sampai "Bukti" (`r04`). Hasil wizard akun di lanskap bisa digulir ke sandi |
| BUG-06 ActionBar ganda / top bar menimpa status bar | **TERBUKTI BERES** | Tidak ada bilah hitam, dan top bar ada di bawah status bar di semua peran (`r01`, `r30`, `r50`) |
| BUG-07 Label tab aktif tak terbaca | **TERBUKTI BERES** | Label aktif tinta gelap, pil aksen-lembut, latar bilah putih bertoken (`r01`, `r10`) |
| BUG-08 Drill-down SDM/GA rusak | **TERBUKTI BERES** (ada N-05) | Tiap baris lengkap: nama, "divisi · PIC", "Lapor hari ini"/"Belum lapor hari ini", lencana, dan persen (`r51`) |
| BUG-09 Chip divisi ganda | **TERBUKTI BERES** | Chip berbentuk "Keuangan · PT Baterai Hijau Surabaya" dan dikelompokkan per PT. Memilih chip menyaring ke divisi itu dengan eyebrow lengkap (`r30`, `r39`). Kalimat belum masuk memakai label PT |
| BUG-10 Tanggal laporan ISO mentah | **TERBUKTI BERES** | "Selasa, 13 Oktober 2026" (`r03`) |
| BUG-11 Jam 17.00 ditulis keras | **TERBUKTI BERES** | Teks tenggat mingguan mengikuti aturan: "Kamis 17.00 WIB" ↔ "hari Kamis, tanpa jam batas." (`r12`) |
| BUG-12 Meja akun tidak memuat ulang / tergencet | **SEBAGIAN — MASIH ADA (tergencet)** | Muat ulang beres: `GET /api/companies` tiap kali Pengaturan dibuka, dan tarik-untuk-muat-ulang memicu GET baru. Daftar masih hanya ±40% bawah layar dengan kepala diam (`r20`). Di lanskap daftar **tidak terlihat sama sekali**, lihat N-03 |
| BUG-13 Pesan Urungkan penerusan "capaian mingguan" | **MASIH ADA** | 8 laporan diteruskan → Urungkan → "Penerusan capaian mingguan diurungkan." (`r23`). Pengurungan sendiri berhasil: angka kembali 0 dan tombol (8) muncul lagi. `DashboardAdminViewModel.kt:183` masih memakai `message` server tiket terakhir |
| BUG-14a "PIC PIC ..." Meja kerja | **MASIH ADA** | "PT-001-PRJ-01 · PIC PIC Pembangunan Pembangkit Baru · ..." (`r02`, `r03`). `MejaKerjaAdminViewModel.kt:436` `d.picName?.let { "PIC $it" }` tanpa cek awalan. Modul ringkasangrup sudah punya cek di `Pemetaan.kt:148` |
| BUG-14b "Ibu Mira · - —" | **TERBUKTI BERES** | "Bpk. Yudi — 1 dari 4 pekerjaan selesai." (`r34`) |
| BUG-14c StatTile Output terpotong | **TERBUKTI BERES** | Nilai "0" dengan "dari 1" di baris bawah (`r35`) |
| BUG-14d Avatar "-" untuk nama berawalan angka/E2E | **MASIH ADA** | Baris "E2E R2 Usulan Admin" di Proyek Admin ber-avatar "-" (`r26`). Di daftar persetujuan Direktur ber-avatar "BB" (pengaju) |
| BUG-14e "Belum masuk · disetujui" | **MASIH ADA** | Statistik → Mingguan: keempat divisi "Belum masuk · disetujui" dan "0 dari 4 divisi sudah menyerahkan" (`r12`). Kemungkinan data seed (approvedAt tanpa submittedAt) + `KepatuhanViewModel` |
| BUG-14f "Belum" vs "Belum masuk" | **TERBUKTI BERES** | Daftar laporan mingguan Direktur memakai "Belum masuk" secara konsisten (`r34`) |
| BUG-14g CSV tanpa konfirmasi | **TERBUKTI BERES** | Snackbar "122 baris log tersimpan. Unduhan tercatat di log..." tampil ±1–2 dtk sesudah SAF. Berkas 21,6 KB tersimpan (`r53`). Tampilnya singkat (Short); hitungan kepala tetap "121 aktivitas" sampai dimuat ulang |
| Catatan server: SDM/GA "40 persetujuan menunggu Anda" tanpa tab Persetujuan | **MASIH ADA** (paritas web) | `GET /api/approval-requests` untuk sdmga → `canDecide:true`, tetapi `ROLE_TABS.DIREKTUR_SDM_GA` (`src/lib/rbac.ts:144`) tidak memuat tab persetujuan dan Lainnya hanya berisi Entitas + Log aktivitas. Perlu keputusan pemilik |
| Catatan seed: M42 berperiode 7–13 Okt | **TERBUKTI BERES** | Arsip Direktur: "M42 2026 · 12 Okt–18 Okt" (`r44`) |

Ringkasan: dari 14 bug utama, 11 beres, 1 sebagian, dan 2 masih ada. Dari 7 sub-butir BUG-14, 4 beres dan 3 masih ada.

---

## Bug baru

### N-01 — Simpan pertama Aturan pelaporan diam-diam mengubah hari kerja dan tenggat mingguan (server) — SEDANG

- **Langkah**: Admin PT dari PT yang belum punya baris `ReportSettings` ("PT ini belum pernah mengatur — berlaku aturan bawaan server", mode bawaan 17.00, Senin–Jumat, mingguan 17.00) → Statistik → Aturan pelaporan → ketuk satu chip saja, misalnya jam harian 09.00.
- **Diharapkan**: Hanya jam harian berubah. Hari kerja tetap Senin–Jumat dan tenggat mingguan tetap 17.00.
- **Nyata**: `PUT /api/admin/report-settings` 200 → baris baru `{"dailyCutoffHour":9,"workingDays":[],"weeklyCutoffHour":null}`. Hari kerja menjadi "Setiap hari" (Sabtu/Minggu ikut wajib lapor) dan mingguan menjadi "Tanpa batas" (`r08` → `r09`). Bila langkah pertama adalah "Tutup pengisian", jam harian ikut menjadi 24/7 (null).
- **Dugaan**: `src/app/api/admin/report-settings/route.ts:91-95` — `upsert.create: { entityId, ...data }` hanya berisi field yang dikirim. Kolom lain jatuh ke bawaan Prisma (`workingDays @default([])`, cutoff null), bukan `DEFAULT_SETTINGS` di `src/lib/report-settings.ts:25-29` (17 / Sen–Jum / 17). Perbaikan: `create: { entityId, ...DEFAULT_SETTINGS, ...data }`. Klien Android benar mengirim satu field (`AturanPelaporanLogika.kt:140-149`). Web kemungkinan terdampak sama. (Data uji PT-001 sudah dipulihkan manual ke 17/Sen–Jum/17.)

### N-02 — Statistik melompat posisi gulir setelah simpan Aturan pelaporan, sehingga ketukan berikutnya salah sasaran — SEDANG

- **Langkah**: Statistik → gulir ke kartu Aturan pelaporan → ketuk chip (09.00 / 17.00 / Tutup pengisian) → segera ketuk chip lain.
- **Nyata**: Pada 3 dari ±8 simpanan, isi bergeser ±490–700 px ke bawah (judul "Mode saat ini" berpindah dari y≈355 ke y≈1019). Ketukan kedua saya ("Senin") mengenai "24/7 (tanpa batas)", sehingga aturan PT berubah tanpa disengaja (`r10`: snackbar "Laporan harian kini 24/7 tanpa jam batas.").
- **Diharapkan**: Posisi gulir stabil saat kepatuhan dimuat ulang.
- **Dugaan**: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/admin/StatistikAdminScreen.kt:53-55` — `LaunchedEffect(versiTersimpan) { vm.muat() }` membuat `KepatuhanScreen` sesaat menampilkan keadaan memuat (isi/daftar diganti). Akibatnya tinggi konten dan posisi gulir di-reset. Muat ulang senyap tanpa mengganti konten (atau `ulang` diam), atau pertahankan `rememberScrollState` di luar cabang keadaan.

### N-03 — Meja akun di lanskap: daftar akun tidak terlihat sama sekali — SEDANG

- **Langkah**: Admin PT → Pengaturan → putar ke lanskap.
- **Nyata**: Kepala (judul, teks pengantar, "Meja akun", Tambah akun, kolom Cari) memenuhi tinggi layar. Baris chip peran terpotong dan daftar akun mendapat tinggi ≈0. Seluruh layar tidak bisa digulir, jadi akun tidak bisa dibuka (`r21`). Di potret daftar hanya ±40% bawah (sisa BUG-12).
- **Dugaan**: `android/app/src/main/kotlin/id/co/monitorkarya/app/ui/pengaturan/PengaturanScreen.kt:35-69` — `Column(fillMaxSize)` berisi kepala tetap + `Box(Modifier.weight(1f)) { AkunScreen() }`, dan `AkunScreen` punya kepala sendiri sebelum `LazyColumn` (`ui/akun/AkunScreen.kt:245,411`). Kepala perlu dijadikan item `LazyColumn` (satu gulir).

### N-04 — Snackbar Urungkan persetujuan proyek Direktur cepat hilang — RENDAH

- **Langkah**: Direktur → Proyek → Diusulkan → Setujui → amati snackbar.
- **Nyata**: Pada percobaan pertama snackbar "...disetujui sebagai Direktur entitas." + Urungkan sudah hilang dalam ±5 dtk (pemeriksaan API + dump), jadi Urungkan terlewat. Percobaan kedua (ketuk dalam 1,2 dtk) berhasil. Bandingkan tanda baca yang bertahan ≥8 dtk.
- **Dugaan**: durasi `Short` pada snackbar keputusan proyek (`feature/proyek`). Aksi dengan Urungkan sebaiknya `Long`, sejalan dengan Ringkasan Direktur.

### N-05 — Drill-down SDM/GA: "PIC Belum ada PIC" — RENDAH

- **Langkah**: `sdmga` → Ringkasan → Laporan per perusahaan → PT Energi Migas Sumut.
- **Nyata**: Baris proyek tanpa PIC tertulis "PT-001 · PIC Belum ada PIC" (`r51`). Proyek baru tanpa PIC (baru disetujui hari ini) juga dihitung "1 belum lapor" pada kartu perusahaan.
- **Dugaan**: `android/feature/ringkasangrup/src/main/kotlin/id/co/monitorkarya/feature/ringkasangrup/logika/Pemetaan.kt:148` menambah "PIC " pada placeholder server `'Belum ada PIC'` (`src/app/api/ringkasan/route.ts:391`). Cara memperbaikinya: kenali placeholder, atau minta server mengirim `pic: null`. Hitungan "belum lapor" untuk proyek tanpa PIC perlu keputusan (server).

### N-06 — Judul top bar terpotong di potret — RENDAH

- **Nyata**: "Monitor Karya · Admi…" (Admin PT punya 4 ikon). SDM/GA: "Monitor Karya · Direksi holding (SDM & GA)" terpotong. Peran tidak terbaca di ponsel (`r01`, `r50`).
- **Dugaan**: `navigation/MKShell.kt` TopAppBar memakai satu baris. Sebaiknya peran ditaruh di baris kedua atau memakai label pendek.

### N-07 — Rincian eskalasi menampilkan "Kode sumber vnazzh5w" — RENDAH

- **Langkah**: Direktur → Eskalasi → buka eskalasi PT Surya Panel Jatim.
- **Nyata**: Baris "Kode sumber vnazzh5w", potongan ID internal yang tidak bermakna bagi pengguna (`r43` area sheet).
- **Dugaan**: `feature/eskalasi` sheet rincian. Sembunyikan, atau ganti dengan tautan ke laporan sumber.

---

## Alur penuh yang LULUS (putaran 2)

**Admin PT**
- Masuk (keyboard Enter berfungsi), header benar, tab Ringkasan/Kerja/Statistik/Laporan/Lainnya, ikon Kotak masuk/Notifikasi/Pengaturan/Keluar.
- Ringkasan: 8 diterima → Teruskan (dialog konfirmasi) → "8 laporan diteruskan ke Direksi." + Urungkan → kembali 0 dan tombol (8) muncul lagi.
- Meja kerja: akordeon Laporan proyek (4) / divisi (4), sheet laporan dengan tanggal WIB, rotasi sheet.
- Statistik: Harian/Mingguan, peta panas + ketuk sel, Aturan pelaporan (jam, buka/tutup, hari kerja per chip, mingguan terbuka/jam). Semua tersimpan (PUT 200), snackbar spesifik muncul, dan efeknya terlihat di API PIC.
- Proyek: Ajukan proyek (tombol nonaktif sampai valid) → Diusulkan "Menunggu Direktur entitas", sheet rantai "Giliran sekarang".
- Pengaturan: Tambah akun (wizard lengkap, sandi stabil saat diputar), muat ulang, tarik-untuk-muat-ulang.

**Direktur entitas (sh-energi)**
- Ringkasan: chip divisi unik + saring, Baca laporan mingguan → Tandai sudah dibaca → snackbar + Urungkan (DELETE 200).
- Proyek: setujui usulan PT-001 → AKTIF, Urungkan → DIUSULKAN.
- Persetujuan (Lainnya): Tolak dengan alasan (tombol nonaktif sampai valid) → snackbar + Urungkan → "Keputusan diurungkan. Permintaan kembali menunggu."
- Eskalasi: Tandai ditinjau → Urungkan ("Tanda ditinjau diurungkan.").
- Divisi (104 laporan, periode M42 benar), Entitas (7 PT, kepatuhan), lanskap Ringkasan.

**Direktur entitas (sh-agro)**: tidak melihat usulan PT-001, API approve → 403. Ringkasan 12 divisi/12 proyek tanpa PT-001.

**Direktur SDM/GA**: Ringkasan grup + drill-down perusahaan, Proyek (41 aktif), Divisi (147), Eskalasi (12), Log aktivitas + Unduh CSV (SAF) dengan konfirmasi.

**Lintas peran**: keluar/masuk Admin → sh-energi → sh-agro → SDM/GA → Admin bersih. Tidak ada galat 403 di layar. 0 crash.
