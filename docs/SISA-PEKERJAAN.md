# Sisa pekerjaan — cabang `desain-baru`

Pertama dipetakan 6 Oktober 2026 dari kode, `docs/design/`, dan status git. Diperbarui 6 Oktober 2026 sore setelah Fase 1 (fondasi), Fase 2 (fungsi peran), Fase 3 (data contoh dan tes), Fase 4 (daftar periksa desain), dan integrasi akhir.

Daftar ini hanya memuat yang **benar-benar belum**, dikelompokkan menurut siapa yang harus bergerak. Butir yang selesai sejak pemetaan pertama dicentang di bagian terakhir sebagai catatan. Setiap butir punya kriteria selesai; butir dianggap selesai bila kriterianya terpenuhi, bukan saat kodenya ditulis.

Status per fungsi dan per peran: [`docs/fitur/matriks-fungsi-peran.md`](fitur/matriks-fungsi-peran.md). Dokumentasi fitur, alur, dan endpoint: [`docs/fitur/`](fitur/README.md).

## Keadaan sekarang

| Pemeriksaan | Hasil (integrasi akhir, 6 Okt 2026) |
| --- | --- |
| `npx prisma generate` | lolos (Prisma Client 6.19.3; peringatan `package.json#prisma` usang) |
| `npx tsc --noEmit` | 0 galat di seluruh proyek |
| `npx eslint src` | bersih |
| `npx vitest run` | 39 berkas, 674 tes lolos. Semua memakai basis data tiruan; tidak ada yang menyentuh Supabase. |
| `next build` | lolos (Next 16.3.8) dengan `DATABASE_URL` tiruan; `/login/ganti-sandi` dan `/icon.svg` ada di daftar route |
| Docker (`--target runner`, `--read-only`, `--cap-drop ALL`) | kontainer sehat; `/login` 200, `/pratinjau` 404, `/api/cron/*` tanpa rahasia 401 |
| `/pratinjau` | 9 peran, 62 tab termuat tanpa galat konsol atau 503 |
| Migrasi 0013–0025 | ditulis dan dicocokkan luring dengan `schema.prisma`; **belum diterapkan** |

---

## A. Pemegang akses basis data dan server (manusia)

Agen dilarang menjalankan perintah yang menyentuh basis data. Semua butir di bawah wajib dikerjakan orang yang memegang akses.

### A1. Terapkan migrasi 0013–0025

Prisma Client yang sudah dibuat ulang mengharapkan `User.divisionId`, `User.mustChangePassword`, dan `Project.divisionId`. Selama 0015 dan 0018 belum diterapkan, kueri yang memilih semua kolom `User` atau `Project` gagal: **cabang ini tidak bisa dipakai pada basis data sungguhan sebelum migrasi diterapkan.** Langkah lengkap ada di [`docs/fitur/README.md`](fitur/README.md#migrasi-manual-00130025).

- [ ] Cadangkan basis data, lalu jalankan `npx prisma migrate status`. Pastikan 0001–0012 tercatat dan hanya 10 folder baru yang tertunda.
- [ ] Terapkan berurutan: 0013, 0014, 0015, 0016, 0017, 0018, 0019, 0021, 0023, 0025.
- [ ] Isi `User.divisionId` (Sheet akun "Anggota divisi" atau "Atur anggota") dan `Project.divisionId` (formulir proyek "Divisi pelaksana") untuk data lama. Sampai diisi, proyek tanpa divisi mengikuti divisi PIC-nya, dan hitungan kepatuhan per orang bisa meleset.

Kriteria selesai: `migrate status` bersih dan semua tab terbuka tanpa 500 untuk tiap akun seed.

### A2. Uji dengan basis data sungguhan

Semua fungsi baru hanya diuji dengan basis data tiruan dan `/pratinjau`. Masuk dengan akun seed tiap peran dan coba lintasan antarperan (`docs/design/peran/00-alur-antarperan.md`):

- [ ] PIC mengirim laporan → baris di Meja kerja dan Ringkasan Admin PT berubah ke "Masuk"; angka hero, KPI, dan kepatuhan per orang sama.
- [ ] Admin PT meneruskan → PIC melihat "Diteruskan ke holding"; ubah/kirim ulang ditolak 409; buka kunci (ajukan PIC → setujui SDM GA → jalankan TI) membuka laporan dan bukti; Urungkan penerusan berfungsi dalam 15 menit.
- [ ] Kepala divisi menyerahkan (Kamis 17.00), menyetujui, Admin PT meneruskan → status di Meja kerja Admin dan lencana Direktur berubah; laporan beku.
- [ ] Kepala divisi mengirim ringkasan ke Direktur → poinnya tampil di Sheet laporan Direktur; Direktur memberi tanggapan → kepala divisi membalas di Meja kerja.
- [ ] Kepala divisi menerima output → hero dan cincin Output PIC serta Ringkasan Direktur ikut berubah.
- [ ] Direktur menyetujui usulan tenggat → `Project.targetEndDate` dan blok tenggat PIC berubah.
- [ ] Persetujuan cuti → baris `Attendance` CUTI dibuat; Urungkan menghapusnya.
- [ ] Unggah bukti dan berkas persetujuan ke Supabase Storage (butuh `SUPABASE_SERVICE_ROLE_KEY`).
- [ ] Akun yang dibuat atau disetel ulang admin dipaksa ke `/login/ganti-sandi`; persetujuan `AKUN_BARU` memberi kata sandi acak yang harus disetel ulang admin.
- [ ] Setelah 17.00 WIB: tombol ingatkan dan centang terkunci, cincin menulis "Terkunci · lewat n menit".
- [ ] Akun tanpa proyek / tanpa divisi / tanpa PT melihat keadaan kosong yang benar.

Kriteria selesai: semua butir dicoba tanpa galat konsol atau 500.

### A3. Rilis ke VPS

Deploy sasaran adalah VPS ([`deploy/README.md`](../deploy/README.md)); berkas bukti tetap di Supabase Storage.

- [ ] Isi `.env.production` di server: `AUTH_SECRET` ≥ 32 karakter acak, `CRON_SECRET` ≥ 16 karakter, `NEXT_PUBLIC_SUPABASE_URL` (saat build, supaya CSP mengizinkan gambar bukti), `SUPABASE_SERVICE_ROLE_KEY`, dan `APP_ORIGINS` bila aplikasi di balik proxy yang mengubah Host.
- [ ] Pasang crontab host dari kepala [`deploy/app-vps/cron.sh`](../deploy/app-vps/cron.sh): `remind-divisions` (09.00 Sen–Jum), `reminder-rules` (tiap 30 menit 07–18 WIB), `kpi-snapshot` (17.30 WIB). Tanpa `reminder-rules`, sakelar pengingat harian tersimpan tetapi tidak bertindak.
- [ ] Hapus atau kosongkan `crons` di `vercel.json` bila Vercel tidak dipakai lagi, supaya tidak ada dua penjadwal.
- [ ] Buka aplikasi produksi di peramban dan pastikan konsol bebas "Refused to execute … Content Security Policy"; periksa tema dan aksen (skrip boot butuh nonce).
- [ ] Beri tahu pengguna bahwa semua orang perlu masuk ulang sekali setelah rilis (token lama tidak membawa sidik kata sandi).

### A4. Git dan PR

- [ ] Putuskan nasib perubahan `AGENTS.md` (ditambahkan ulang oleh `next dev`; panduan proyek menyarankan ikut di-commit).
- [ ] Commit bertahap per area: sistem desain & token; kerangka & navigasi; Ringkasan per peran; Perusahaan & akun; Meja kerja; layar P1; fitur peran + migrasi; tes; keamanan; data contoh; dokumentasi.
- [ ] Isi deskripsi PR dengan daftar periksa `docs/design/15-checklist-review.md` yang sudah dicentang (hasil F4-A/F4-B).
- [ ] Hapus komponen `src/components/ui/*` yang tidak dipakai lagi (penghapusan oleh agen ditolak sistem izin). Yang **harus tetap ada**: `alert-dialog` (dipakai `useConfirm`), `input`, `label`, `sonner`, `switch`, `textarea`, `toast`, `toaster`, dan `src/hooks/use-toast.ts`. Juga calon hapus: `src/hooks/use-mobile.ts`, `src/components/index.ts`, `src/components/stat-card.tsx`, `src/components/loading-states.tsx`. Setelahnya jalankan ulang `tsc` dan build, lalu cabut paket Radix dan paket lain yang tidak terpakai dari `package.json`.

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

## C. Pengembang (kode)

### Bug kecil yang diketahui

- [ ] `weekly-task-board.tsx` belum memakai `frozenDays` dari `GET /api/tasks?week=`. API sudah menolak hari yang beku (409), tetapi papan tidak menandai kolomnya lebih dulu.
- [ ] Kartu "Keputusan terbuka" Auditor (`oversight/management-dashboard.tsx` sekitar baris 479): subjudul masih menyebut materi, anggaran, cuti, pengajuan proyek, dan usulan tenggat, padahal Auditor hanya melihat eskalasi.
- [ ] `AccessRequestsCard` menampilkan "Ajukan permintaan" untuk TI, padahal formulirnya memuat `/api/companies` yang menolak TI (403). Sembunyikan untuk TI atau ganti sumber daftar akun ke `/api/access-requests/options`.
- [ ] Kirim ringkasan mingguan (`/api/kadiv/weekly-summary` `send`) memakai `upsert` tanpa syarat: dua kiriman bersamaan sama-sama berhasil dan memberi tahu Direktur dua kali. Kirim ulang ringkasan yang sudah terkirim saat review masih tersisa dijawab 409 `PENDING_REVIEW`, bukan 409 "sudah terkirim".
- [ ] Usulan tenggat masih bisa disetujui setelah tanggal yang diusulkan lewat, sehingga tenggat proyek bisa mundur ke masa lalu (perlu dipastikan: bug atau boleh).
- [ ] `PATCH /api/unlock-requests` melewati pemeriksaan cakupan bila laporan sasaran sudah tidak ada. Aman selama hanya peran grup yang memegang `unlock:approve`/`unlock:execute`.
- [ ] Persetujuan `AKUN_BARU` membuat akun dengan kata sandi acak yang tidak ditampilkan; layar persetujuan belum memberi jalan menyerahkan kata sandi awal (kini lewat "Setel ulang kata sandi").
- [ ] Palet ⌘K → membuka Sheet proyek → Sheet ditutup: fokus jatuh ke `body`, karena pemicu (kolom cari palet) sudah hilang. Butuh cadangan fokus di `src/components/mk/sheet.tsx`.
- [ ] `/api/admin/overview` masih menghitung kepatuhan per anggota dengan aturan lama; tidak dipakai Ringkasan Admin lagi. Hapus bagian itu atau samakan dengan `/api/admin/compliance`.
- [ ] KPI "Tepat waktu 30 hari" memakai proyek AKTIF hari ini, sehingga proyek yang ditutup dalam 30 hari terakhir hilang dari penyebut.
- [ ] Baris dukungan hero Proyek dan Divisi hanya menghitung halaman yang dimuat, karena API berhalaman.

### Desain dan aksesibilitas (sisa F4)

- [ ] Tab bar mengambang tablet (`.mk-tab` di `mk-tabbar--floating`, `design-system/components/bundle.css`) setinggi 40 px, di bawah target sentuh 44 px. Tombol Dock dan tab bar ponsel 38×38; batang AreaChart di ponsel 38 px.
- [ ] Nilai batang `BarChart` (`.mk-bars__val`) transparan sampai disorot/dipilih. Daftar periksa meminta angka tertulis di layar.
- [ ] Pilihan `mk-choice` di Sheet progres (`task-dialog`) adalah tab stop terpisah tanpa navigasi panah seperti radiogroup.
- [ ] Grafik: tiap batang/titik satu tab stop, tanpa navigasi panah di dalam grafik.
- [ ] Peta panas Admin di ponsel: label 3 huruf belum ada (nama lengkap digeser ke samping). Tablet Admin: kartu divisi 2 kolom belum.
- [ ] Log aktivitas Auditor di ponsel memakai baris kartu log, belum `ActivityItem` (spesifikasi 08).
- [ ] Sheet akun di `AccountManager` dipasang/dilepas tanpa animasi keluar.
- [ ] Ganti `alert-dialog`, `input`, `textarea`, dan `switch` yang tersisa dengan versi `mk`, lalu hapus alias palet Tailwind lama di `globals.css`.
- [ ] Putuskan `views/management-charts.tsx` (`/api/management-charts`), `dashboard/compliance-treemap.tsx` (`/api/compliance-map`), dan `dashboard/kpi-trend-chart.tsx` (`/api/kpi-trends`): pasang di layar, atau hapus beserta API-nya.

### Fitur yang belum dibangun

- [ ] Delta "Rata-rata progres +n poin" di Ringkasan Manajemen: butuh riwayat progres mingguan yang disimpan.
- [ ] Jenis bukti per output di kartu review ("Laporan uji", "Tautan desain"); kini ditulis sebagai jumlah berkas.
- [ ] Kolom cari di header Admin PT (palet ⌘K sudah bisa dibuka dengan pintasan).
- [ ] Tab Log aktivitas untuk Direktur entitas (kapabilitas `audit:read` sudah ada, tab belum di `ROLE_TABS`).

### Data contoh `/pratinjau`

- [ ] Angka dan nama tidak sama antarperan: Direktur melihat divisi berbeda di Ringkasan, tab Divisi, dan Sheet entitas; nama proyek berbeda antara Ringkasan dan Proyek; skor kepatuhan PT Ratu Karya 91% di pohon dan 88% di Sheet; ⌘K tidak menemukan "rina". Butir daftar periksa "angka sama lintas peran" tidak bisa lolos di pratinjau.
- [ ] Tiruan `/api/search` (`mock-oversight.ts`) mengembalikan hasil seluruh grup untuk setiap peran; route sungguhan membatasi PIC, Kepala divisi, dan Admin PT.
- [ ] `mock-pic.ts` mengisi `reportDateKey`/`todayKey` dari `desk.today.slice(0, 10)` (tanggal UTC dari tengah malam WIB), jadi satu hari lebih awal. Pengajuan buka kunci PIC di pratinjau tidak mengubah status di layar PIC (`unlock: null`).
- [ ] Buka kunci di pratinjau tidak pernah dijalankan (`mock-admin`/`mock-group` tidak punya `execute`), jadi jalur "laporan dibuka" belum terlihat di pratinjau.
- [ ] `mock-pic.ts` dan `mock-kadiv.ts` masih memodelkan `readAt` tunggal dan mengosongkan catatan saat Urungkan revisi; server kini memakai `NoteRead` dan `OutputRevision`.

### Infrastruktur dan keamanan

- [ ] Pembatas laju global: kini di memori per instans. Butuh penyimpanan bersama (mis. Redis) bila aplikasi berjalan lebih dari satu instans.
- [ ] Pencabutan token saat keluar butuh tabel sesi.
- [ ] Sisa temuan `npm audit` butuh naik versi mayor: `deepmerge-ts` via CLI `prisma` (perbaikannya menurunkan CLI ke 6.12 yang tidak cocok dengan `@prisma/client` 6.19.3), `sharp`, `js-yaml`, `prismjs`, `braces`.
- [ ] `npm install` melaporkan skrip instal yang tidak tercakup `allowScripts` (prisma, esbuild, sharp, @swc/core). Periksa `prisma generate` di mesin baru; mungkin perlu `npm install-scripts approve`.
- [ ] Pindahkan pengaturan `package.json#prisma` (usang) ke `prisma.config.ts`.
- [ ] Migrasi lama 0001–0012 berbeda tipis dengan `schema.prisma` (indeks tangan yang tidak dideklarasikan skema; `Project.approvalChain` NOT NULL). `prisma migrate dev` berikutnya bisa mengusulkan menghapus indeks itu. Beberapa FK baru tanpa indeks: `Output.reviewerId`, `DeadlineProposal.decidedById`, `AccessRequest.decidedById`.

---

## D. Pemeriksaan manual (QA)

Audit otomatis F4-A/F4-B memeriksa semua layar di 1440, 834, 390 px, 720 px (pengganti zoom 200%), terang/gelap, aksen merah/biru/grafit, `prefers-reduced-motion`, keyboard, kontras, dan target sentuh. Yang tidak bisa diotomatisasi:

- [ ] Pembaca layar sungguhan (VoiceOver, TalkBack).
- [ ] Safari/iOS dan perangkat sentuh sungguhan.
- [ ] Zoom peramban 200% sungguhan (yang diuji emulasi 720 px).
- [ ] Simulasi buta warna untuk StatusBadge, Heatmap, dan AreaChart.
- [ ] Sheet di balik tombol yang mengubah data (Kirim, Setujui, Hapus) dilewati uji keyboard otomatis.

---

## Sudah selesai sejak pemetaan pertama

Dicatat agar riwayatnya tidak hilang. Rinciannya di [`docs/fitur/`](fitur/README.md).

**Desain (P1, P3, F4)**

- [x] Semua layar memakai komponen `src/components/mk` dan token; kriteria `grep` palet lama hanya menemukan pemakaian yang diizinkan.
- [x] Daftar periksa desain otomatis untuk semua layar peran (F4-A: PIC, Kepala divisi, Admin PT; F4-B: Direktur, Manajemen, SDM GA, TI, Auditor, Super Admin, login, ⌘K): luapan, kontras, target sentuh, cincin fokus, Sheet (fokus masuk/terkunci/Esc/kembali), satu tombol primer per kartu, maksimal 4 KPI.
- [x] Cincin fokus primitif `ui` (outline Tailwind v4) diperbaiki di sumber; juga di `projects-view.tsx` dan `escalations-view.tsx`.
- [x] `ApprovalItem` punya `approveVariant`; antrean keputusan (review output kepala divisi, Persetujuan, keputusan Manajemen, proyek, permintaan akses) memakai tombol per baris sekunder.
- [x] Log aktivitas tidak lagi bergulir ke samping; teks informasi `ink-3` diganti `ink-2`; periode entitas ditulis "Oktober 2026".
- [x] Tombol dev Next.js dimatikan (`devIndicators: false`); lonceng header disembunyikan di mode Dock; toast di atas tab bar (`--z-toast`); `Chip` 44 px; `DivisionBar` menampilkan beban > 100%.
- [x] Teks Bahasa Indonesia, sentence case, tanpa tanda seru.

**Alur laporan (F1-A, F1-B, integrasi)**

- [x] Laporan harian dikirim langsung ke Admin PT; tombol "Kirim laporan"; spesifikasi disesuaikan.
- [x] Laporan harian beku setelah diteruskan (409 dengan pesan jelas); penerusan juga mengisi `isLocked`.
- [x] Kolom Kendala & Rencana besok selalu tampil; tombol "Lampirkan foto".
- [x] PIC bisa mengajukan buka kunci laporan harian proyeknya; `GET /api/unlock-requests` untuk PIC dan Kepala divisi hanya mengembalikan pengajuan sendiri.
- [x] Buka kunci berefek di `/api/daily-input`, `/api/tasks`, `/api/weekly-input`, dan bukti (`evidence-access.ts`).
- [x] Persetujuan mingguan hanya dari `MENUNGGU_PERSETUJUAN`; serah hanya dari `DRAFT`; perubahan status bersyarat.
- [x] Tenggat mingguan serah Kamis 17.00 / kunci Jumat 17.00 di kode, spesifikasi, data contoh, dan teks UI.
- [x] "Ingatkan" Direktur mengingatkan satu divisi untuk minggu yang tampil; toast membedakan "sudah diingatkan hari ini" dan "tanpa kepala divisi".
- [x] Penerusan mingguan bersyarat (klik ganda → 409).

**Keamanan akun (F1-C, F3-D)**

- [x] Kata sandi minimal 8 di semua jalur; `mustChangePassword` + `/login/ganti-sandi`; seed tanpa "1234".
- [x] `GET /api/notifications` hanya milik sendiri; `recipient` notifikasi seragam email.
- [x] Akses sementara yang berakhir mengembalikan `Division.headUserId`.
- [x] Tidak ada route yang mengembalikan `err.message` mentah pada 500 (`serverError`, dijaga `tests/api/keamanan-galat-mentah.test.ts`).
- [x] `next` 16.3.8; blok `@transform_port_query` dihapus dari `Caddyfile`.
- [x] Auditor benar-benar hanya-baca di semua route (`tests/api/auditor-readonly.test.ts`); `POST /api/access-requests` menolak peran hanya-baca.

**Utang teknis (F1-D)**

- [x] Urungkan "Minta revisi" memulihkan catatan sebelumnya (`OutputRevision`); status baca catatan per akun (`NoteRead`); relasi kepala divisi per divisi.
- [x] Pengingat PIC manual dan otomatis satu fungsi (`remindPicDaily`); aturan otomatis untuk PT, UNIT, dan SUB_HOLDING; eskalasi otomatis memakai divisi proyek dulu.
- [x] `KpiSnapshot` diperbarui cron `kpi-snapshot`; `timelineFrame` memakai WIB; label audit lengkap; `/api/roles` sentence case; `useMedia` selaras dengan CSS.

**Fungsi peran (F2)**

- [x] PIC: laporan di layar Hari ini, progres dibanding rencana, tenggat terdekat, riwayat 6 hari, "Tanya kepala divisi" dari Sheet, seret berkas ke output.
- [x] Kepala divisi: ringkasan mingguan untuk Direktur, KPI tepat waktu 30 hari, proyek divisi, Tandai sudah dibaca laporan anggota.
- [x] Admin PT: kepatuhan per orang dan divisi, Ingatkan per orang/divisi, Hubungi kepala divisi, peta panas, Unduh log, log aktivitas PT, permintaan akses dari Kepala divisi/PIC, divisi pelaksana di formulir proyek, anggota divisi di Sheet akun.
- [x] Direktur & Manajemen: tab Persetujuan, persetujuan materi/anggaran/cuti dengan berkas, Beri tanggapan, Hubungi kepala divisi, tinjauan proyek dan catatan ke PIC, ⌘K, badge nav, tab ringkas tablet/ponsel, kehadiran Terlambat; ringkasan kepala divisi tampil di `/api/ringkasan`.
- [x] Peran grup: panel SDM GA, ringkas teknis TI/Super Admin, panel Auditor, konsol Sistem & akses diperluas, saringan log peran/tanggal.
- [x] Urungkan untuk keputusan proyek, eskalasi, ajukan ulang, arsip, dan penerusan (`UndoToken`, `POST /api/undo`).

**Data contoh dan tes (F3)**

- [x] Data contoh `/pratinjau` untuk semua endpoint yang dipakai layar (termasuk `/api/daily-input`, `/api/inbox`, `/api/projects`, `/api/escalations`, `/api/weekly-reports`, `/api/entities`, `/api/audit-logs`, `/api/system`, `/api/profile`); endpoint tanpa data dicatat di `window.__pratinjauMiss`.
- [x] Tes route PIC, Kepala divisi, Admin PT, dan peran grup (F3-C, F3-D); `vitest.config.mts` tanpa peringatan ESM.
- [x] Build produksi: `/pratinjau` 404 (dicoba di kontainer Docker), data contoh tidak masuk chunk JavaScript.
