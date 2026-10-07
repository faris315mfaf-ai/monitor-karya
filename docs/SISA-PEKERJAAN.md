# Sisa pekerjaan — backlog global dan hasil CX

Diperbarui 7 Oktober 2026: lima prioritas akses, sesi, aktivasi, dependensi,
dan kesiapan layanan telah diimplementasikan. [Hasil CX16–20](codex/CX16-20-HASIL.md).

Gerbang sebelumnya, 6 Oktober 2026 setelah CX 8–15: **63 berkas /
1.192 tes, Prisma validate, TypeScript, ESLint, diff check dan build/runtime
runner Docker lolos.** E2E HTTP/PostgreSQL lokal: 11 before + 3 after lolos.
[Hasil dan artefak CX](codex/CX8–15-HASIL.md).

Hasil CX tidak menyelesaikan seluruh backlog proyek. Bagian B (keputusan
pemilik) dan D (QA manual) dipulihkan verbatim dari baseline `89766df`; bagian C
mempertahankan pekerjaan yang belum dituntaskan. Butir CX yang selesai tidak
lagi menjadi pekerjaan aktif. Riwayat proses ada di
[lampiran](codex/LANJUTAN-POIN1-7-DAN-CX8-15.md).

## A. Pemegang akses basis data dan server (manusia)

Agen tidak boleh mengakses Supabase/server. Pengujian lokal terisolasi telah
dilakukan; DB persisten 54339 dan server/data pengguna 3200 dipertahankan.

### A1. Migrasi produksi dan backfill data lama

Prisma Client mengharapkan `User.divisionId`, `User.mustChangePassword`, dan
`Project.divisionId`. **Jangan memakai cabang ini pada produksi yang belum
mempunyai migrasi tersebut serta AuthSession dan AccountActivation.** Seluruh 25 migrasi termasuk 0028 telah lolos pada
DB lokal terisolasi; hal ini tidak membuktikan data/riwayat produksi sudah siap.
Panduan [migrasi manual](fitur/README.md#migrasi-manual-00130025),
[deploy](../deploy/README.md) dan [checklist rilis](../deploy/CHECKLIST-RILIS.md).

- [ ] Cadangkan basis data produksi, lalu operator memeriksa
  `npx prisma migrate status`; cocokan riwayat 0001–0012 dan folder tertunda
  yang sebenarnya, bukan mengasumsikan status lokal berlaku di produksi.
- [ ] Terapkan migrasi tertunda berurutan: 0013, 0014, 0015, 0016, 0017, 0018,
  0019, 0021, 0023, 0025, 0026, 0027, lalu 0028. Nomor sengaja kosong tidak perlu diisi.
- [ ] Audit hibah PIC sementara historis yang sudah dipulihkan versi lama: PIC asal tidak boleh ditebak tanpa jejak. Hibah belum dipulihkan yang tidak memiliki snapshot lengkap ditolak saat autentikasi sampai admin merekonsiliasi tautan proyek.
- [ ] Isi `User.divisionId` (Sheet akun "Anggota divisi" atau "Atur anggota") dan `Project.divisionId` (formulir proyek "Divisi pelaksana") untuk data lama. Sampai diisi, proyek tanpa divisi mengikuti divisi PIC-nya, dan hitungan kepatuhan per orang bisa meleset.

Kriteria selesai: `migrate status` bersih dan semua tab terbuka tanpa 500 untuk
tiap peran; backfill data lama diverifikasi pada lingkungan produksi oleh operator.

### A2. Hasil alur lokal dan verifikasi eksternal

[CX 14](codex/CX14-HASIL.md) menyimpan JSON/teks 11 before dan 3 after lolos
melalui HTTP/PostgreSQL nyata lokal. Before/after merujuk sebelum/sesudah 17.00
WIB pada jam server uji. Ini memperbarui anggapan lama bahwa semua alur hanya mock.

| Alur | Status bukti lokal |
|---|---|
| PIC kirim → Admin, angka laporan/kepatuhan konsisten | Lolos |
| Teruskan → beku 409 → Urungkan/buka kunci PIC → SDM → TI | Lolos |
| Mingguan serah/setujui/teruskan → beku | Lolos |
| Ringkasan kepala divisi → Direktur dan balasan | Lolos |
| Terima output → angka PIC/Direktur | Lolos |
| Usulan tenggat → tanggal proyek/blok PIC | Lolos |
| Cuti → Attendance CUTI → Urungkan | Lolos |
| Akun buat/reset/AKUN_BARU wajib ganti sandi | Lolos; CX18 menambahkan aktivasi sekali pakai untuk akun hasil persetujuan |
| Setelah 17.00: mutasi/pengingat ditolak 409 | Lolos HTTP; pembuktian label cincin/perangkat nyata mengikuti QA |
| Peran tanpa proyek/divisi/PT dan penolakan lintas cakupan | Lolos |
| Unggah berkas bukti/persetujuan ke Supabase Storage nyata | **EXTERNAL_PENDING**, belum diotorisasi/dijalankan |

Tautan bukti lokal bukan unggah berkas. A2-08 tetap satu verifikasi eksternal
tertunda; after tidak memuat A2-08 sehingga externalPending 0 pada after tidak
menutupnya. Data lama dan lingkungan produksi tetap memerlukan verifikasi operator.

### A3. Rilis ke VPS

Deploy sasaran adalah VPS ([`deploy/README.md`](../deploy/README.md)); berkas bukti tetap di Supabase Storage.

- [ ] Isi `.env.production` di server: `AUTH_SECRET` ≥ 32 karakter acak, `CRON_SECRET` ≥ 16 karakter, `NEXT_PUBLIC_SUPABASE_URL` (saat build, supaya CSP mengizinkan gambar bukti), `SUPABASE_SERVICE_ROLE_KEY`, dan `APP_ORIGINS` bila aplikasi di balik proxy yang mengubah Host.
- [ ] Pasang crontab host dari kepala [`deploy/app-vps/cron.sh`](../deploy/app-vps/cron.sh): `remind-divisions` (09.00 Sen–Jum), `reminder-rules` (tiap 30 menit sepanjang hari), `kpi-snapshot` (17.30 WIB). Pasang monitor/hook backup, OPS_HEALTH_SECRET, BACKUP_REPORT_SECRET, dan objek probe privat sesuai [CX20](codex/CX20-OPERASIONAL.md).
- [ ] Hapus atau kosongkan `crons` di `vercel.json` bila Vercel tidak dipakai lagi, supaya tidak ada dua penjadwal.
- [ ] Buka aplikasi produksi di peramban dan pastikan konsol bebas "Refused to execute … Content Security Policy"; periksa tema dan aksen (skrip boot butuh nonce).
- [ ] Beri tahu pengguna bahwa semua orang perlu masuk ulang sekali setelah rilis (token lama belum memiliki id sesi server).

---

## B. Pemilik produk (keputusan)

Keputusan yang sudah diambil pemilik (laporan harian langsung ke Admin PT, beku setelah diteruskan, serah Kamis/kunci Jumat 17.00, Supabase Storage, deploy VPS) sudah diterapkan di kode dan dokumen. Yang di bawah ini diambil orkestrator atau agen sebagai bawaan dan perlu dikonfirmasi atau diubah:

- [ ] **Keputusan bawaan orkestrator:** kepala divisi hanya menyetujui dari `MENUNGGU_PERSETUJUAN`; Kendala & Rencana besok selalu tampil; kata sandi minimal 8 dan wajib ganti pada akun buatan admin; notifikasi hanya milik sendiri; di antrean keputusan hanya "Terima semua"/tombol hero yang primer; `data-1..6` hanya untuk divisi; lonceng header disembunyikan di mode Dock.
- [ ] **Aturan kepatuhan per orang** (Admin PT): siapa wajib lapor, kapan dihitung sudah lapor, Cuti/Sakit/Izin keluar dari penyebut, "Terlambat" mingguan = diserahkan setelah Kamis 17.00. Rincian di [`peran-admin.md`](fitur/peran-admin.md#aturan-hitung-kepatuhan-per-orang-keputusan-f2-admin).
- [ ] **Rumus KPI** (`src/lib/kpi-math.ts`): bobot skor kepatuhan 40/30/20/10, hanya cuplikan BULANAN, cron 17.30 WIB. **Tepat waktu 30 hari** kepala divisi, target 85%.
- [ ] **Ambang peran grup:** kepatuhan PT (Terlambat < 70% atau separuh divisi belum menyerahkan; Perlu perhatian < 85%) dan beban kerja PIC (Berlebih ≥ 6 proyek atau ≥ 15 tugas; Tinggi ≥ 4 atau ≥ 10).
- [ ] **Navigasi per spesifikasi.** Spesifikasi PIC, Kepala divisi, Admin PT, Direktur, dan Manajemen meminta item nav khusus (Output saya, Tahapan, Review, Tim, Kepatuhan, Akses, Laporan mingguan, Milestone, Kehadiran, …). Kini isinya kartu di Ringkasan dan tab di dalam layar; `ROLE_TABS` tidak diubah. Pilih: pertahankan, atau ubah `ROLE_TABS` dan kerangka.
- [ ] **Perubahan peran oleh Admin PT** masih bisa langsung lewat meja akun (tercatat `UPDATE_ACCOUNT`), padahal spesifikasi meminta selalu lewat permintaan yang disetujui.
- [ ] **Buka kunci capaian mingguan oleh kepala divisi.** Kepala divisi tidak punya `unlock:request`; pengajuan lewat Admin PT. Tambahkan kapabilitas atau pertahankan.
- [ ] **Persetujuan untuk Direksi SDM & GA** hanya dari kartu di Ringkasan; peran ini tidak punya tab Persetujuan.
- [ ] **Kontrak** diajukan sebagai jenis Materi (tidak ada jenis tersendiri).
- [ ] **Kata domain yang dipertahankan:** "progress" di tugas harian, status harian "Berjalan"/"Terkendala" yang dipetakan ke StatusBadge on/risk, tombol baris "Hapus"/"Kelola".
- [ ] **Ubin "Template"** di Data induk menghitung jenis divisi, karena belum ada model template.
- [ ] **Cincin fokus pada judul Sheet** sudah dimatikan untuk judul yang difokus skrip (F4-B). Konfirmasi tidak bertentangan dengan panduan aksesibilitas.

---

## C. Pengembang — backlog yang belum selesai

### Akses dan pengalaman akun

- [x] Persetujuan `AKUN_BARU` memberikan tautan aktivasi sekali pakai selama 24 jam; admin dapat menerbitkan ulang. Token tidak disimpan mentah atau masuk audit. [CX18](codex/CX18-AKTIVASI.md).

### Desain dan fitur di luar perbaikan CX

- [ ] Peta panas Admin di ponsel: label 3 huruf belum ada (nama lengkap digeser ke samping). Tablet Admin: kartu divisi 2 kolom belum.
- [ ] Log aktivitas Auditor di ponsel memakai baris kartu log, belum `ActivityItem` (spesifikasi 08).
- [ ] Putuskan `views/management-charts.tsx` (`/api/management-charts`), `dashboard/compliance-treemap.tsx` (`/api/compliance-map`), dan `dashboard/kpi-trend-chart.tsx` (`/api/kpi-trends`): pasang di layar, atau hapus beserta API-nya.
- [ ] Tab Log aktivitas untuk Direktur entitas (kapabilitas `audit:read` sudah ada, tab belum di `ROLE_TABS`); menunggu keputusan pemilik.

Perbaikan Heatmap/footer responsif CX 10 tidak menutup permintaan label 3 huruf
atau kartu Admin dua kolom. Ketiga grafik/API sengaja dipertahankan; cleanup
komponen/dependensi tidak memutuskan nasibnya.

### Infrastruktur dan keamanan

- [ ] Pembatas laju global: kini di memori per instans. Butuh penyimpanan bersama (mis. Redis) bila aplikasi berjalan lebih dari satu instans.
- [x] Pencabutan token saat keluar memakai AuthSession; sandi dan sesi pengganti atomik. [CX16–17](codex/CX16-17-AKSES-SESI.md).
- [x] Dependensi terdampak ditangani: sharp 0.35.5, override deepmerge-ts 8.0.2 khusus Prisma, dan patch lokal braces dengan sumber/lisensi/regresi. Audit npm 0, tetapi patch lokal bukan rilis upstream resmi; pemelihara tetap perlu memantau advisory. [CX19 dan batas pembuktiannya](codex/CX19-DEPENDENSI.md).
- [ ] Migrasi lama 0001–0012 berbeda tipis dengan `schema.prisma` (indeks tangan yang tidak dideklarasikan skema; `Project.approvalChain` NOT NULL). `prisma migrate dev` berikutnya bisa mengusulkan menghapus indeks itu. Uji 23 migrasi lokal tidak membuktikan drift lama sudah diselesaikan.

### Infrastruktur yang selesai dalam CX, bukan backlog aktif

- [x] Peringatan skrip instal yang tidak tercakup `allowScripts`: konfigurasi
  eksplisit tersedia, memakai npm **11.19.1** untuk setup/build yang diperiksa.
  Mesin baru tetap mengikuti versi npm dan prosedur setup terdokumentasi.
- [x] `package.json#prisma` dipindahkan ke `prisma.config.ts`; peringatan usang
  tidak muncul pada build final.
- [x] Indeks FK `Output.reviewerId`, `DeadlineProposal.decidedById`, dan
  `AccessRequest.decidedById`: SQL 0026 dan tiga @@index schema, lolos lokal.
  Ini tidak menutup drift migrasi 0001–0012 di atas.

---

## D. Pemeriksaan manual (QA)

Audit otomatis F4-A/F4-B memeriksa semua layar di 1440, 834, 390 px, 720 px (pengganti zoom 200%), terang/gelap, aksen merah/biru/grafit, `prefers-reduced-motion`, keyboard, kontras, dan target sentuh. Yang tidak bisa diotomatisasi:

- [ ] Pembaca layar sungguhan (VoiceOver, TalkBack).
- [ ] Safari/iOS dan perangkat sentuh sungguhan.
- [ ] Zoom peramban 200% sungguhan (yang diuji emulasi 720 px).
- [ ] Simulasi buta warna untuk StatusBadge, Heatmap, dan AreaChart.
- [ ] Sheet di balik tombol yang mengubah data (Kirim, Setujui, Hapus) dilewati uji keyboard otomatis.

---

## Selesai dalam lingkup CX 8–15

Bug Auditor/TI, atomisitas ringkasan, target buka kunci, kepatuhan Admin, tenggat
WIB, metrik historis/total berhalaman, fokus/keyboard/target sentuh/Sheet akun,
data contoh, primitif MK/alias palet/cleanup 47 dependencies, Prisma/indeks FK,
alur lokal, cari Admin/PIC, jenis bukti dan delta dengan riwayat nyata sudah
memiliki hasil dalam [laporan CX](codex/CX8–15-HASIL.md). FrozenDays CX 2 juga
bukan pekerjaan aktif. Ini bukan pernyataan semua bagian B/C/D selesai.

Commit implementasi parent: `28f969f`, `0792ca1`, `b36fe91`, `8fee994`.
Dokumentasi disimpan dalam commit lokal terpisah; push/PR tetap memerlukan
otorisasi tersendiri. Daftar periksa PR: [review desain](design/15-checklist-review.md).
