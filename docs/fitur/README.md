# Dokumentasi fitur Monitor Karya

Dokumentasi kode dan penjelasan fitur untuk cabang `desain-baru` per 6 Oktober 2026, setelah Fase 1 (fondasi), Fase 2 (fungsi peran), Fase 3 (data contoh dan tes), Fase 4 (daftar periksa desain), dan integrasi akhir. Isinya: cara kerja tiap modul, siapa yang memakainya, aturan bisnisnya, endpoint API, dan berkas kode utamanya.

**Mulai dari sini:** [matriks-fungsi-peran.md](matriks-fungsi-peran.md) memuat setiap fungsi per peran beserta layar, endpoint, status, dan fasenya.

> **Belum ada fungsi baru yang dicoba dengan basis data sungguhan.** Migrasi 0013–0025 belum diterapkan; sebelum 0015 dan 0018 diterapkan, cabang ini tidak bisa dipakai pada basis data sungguhan (lihat [Migrasi manual](#migrasi-manual-00130025)).

## Keputusan produk yang berlaku

| Keputusan | Akibat di kode |
| --- | --- |
| Laporan harian PIC dikirim langsung ke Admin PT; kepala divisi hanya melihat | Tombol "Kirim laporan"; kepala divisi punya "Tandai sudah dibaca" ([laporan-harian.md](laporan-harian.md)) |
| Laporan harian yang sudah diteruskan dibekukan | 409 "Laporan sudah diteruskan ke holding. Ajukan buka kunci untuk mengubahnya."; perubahan hanya lewat buka kunci ([permintaan-akses.md](permintaan-akses.md#buka-kunci-laporan)) |
| Tenggat mingguan: serah Kamis 17.00 WIB, kunci Jumat 17.00 WIB | `weeklyDeadlines` di `src/lib/lock.ts`; spesifikasi, data contoh, dan teks UI disamakan ([capaian-mingguan.md](capaian-mingguan.md)) |
| Berkas bukti tetap di Supabase Storage; deploy sasaran VPS | Cron dijadwalkan lewat [`deploy/app-vps/cron.sh`](../../deploy/app-vps/cron.sh) ([arsitektur.md](arsitektur.md#deploy-dan-pekerjaan-terjadwal)) |

Keputusan bawaan orkestrator yang belum dikonfirmasi pemilik produk tercatat di [matriks-fungsi-peran.md](matriks-fungsi-peran.md#keputusan-yang-berlaku-untuk-semua-peran) dan [`SISA-PEKERJAAN.md`](../SISA-PEKERJAAN.md#b-pemilik-produk-keputusan).

Panduan visual (warna, komponen, pola layar) ada di [`DESIGN.md`](../../DESIGN.md) dan [`docs/design/`](../design/README.md). Spesifikasi layar per peran ada di [`docs/design/peran/`](../design/peran/). Daftar pekerjaan yang masih terbuka ada di [`docs/SISA-PEKERJAAN.md`](../SISA-PEKERJAAN.md).

![Arsitektur sistem](img/arsitektur.svg)

## Isi

**Dasar**

| Berkas | Isi |
| --- | --- |
| [arsitektur.md](arsitektur.md) | App Router, route API, Prisma, RBAC, kunci WIB, sistem desain `mk`, kerangka shell/Dock |
| [keamanan.md](keamanan.md) | Sesi, CSRF, CSP, pembatas laju, cakupan data, cron, unggahan, kata sandi |
| [matriks-fungsi-peran.md](matriks-fungsi-peran.md) | Setiap fungsi per peran: layar, endpoint, status (selesai/sebagian/belum), fase 1–4, ketergantungan migrasi |

**Modul (satu per tab navigasi)**

| Berkas | Tab | Peran utama |
| --- | --- | --- |
| [ringkasan.md](ringkasan.md) | Ringkasan / Hari ini | semua peran |
| [peran-direktur-manajemen.md](peran-direktur-manajemen.md#endpoint) | Persetujuan | Direktur entitas, Manajemen |
| [meja-kerja.md](meja-kerja.md) | Meja kerja | PIC proyek, Kepala divisi, Admin PT |
| [laporan-harian.md](laporan-harian.md) | Laporan harian | PIC proyek, Admin PT |
| [capaian-mingguan.md](capaian-mingguan.md) | Capaian mingguan | Kepala divisi, Admin PT |
| [penerimaan.md](penerimaan.md) | Penerimaan | Admin PT |
| [proyek.md](proyek.md) | Proyek | semua peran |
| [divisi.md](divisi.md) | Divisi | Kepala divisi, Admin PT, pengawas |
| [eskalasi.md](eskalasi.md) | Eskalasi | Admin PT, Direktur, Manajemen |
| [entitas.md](entitas.md) | Entitas | Direktur, Manajemen, Auditor |
| [log.md](log.md) | Log aktivitas | pemegang `audit:read` |
| [sistem.md](sistem.md) | Sistem & akses | TI, Super Admin |
| [perusahaan-akun.md](perusahaan-akun.md) | Perusahaan & akun | Super Admin, Admin PT (terbatas) |

**Fitur lintas modul**

| Berkas | Isi |
| --- | --- |
| [output-review.md](output-review.md) | Output proyek PIC dan review kepala divisi, catatan, tahapan, usulan tenggat |
| [urungkan.md](urungkan.md) | Toast "Urungkan" untuk keputusan proyek, eskalasi, ajukan ulang, arsip, dan penerusan laporan |
| [permintaan-akses.md](permintaan-akses.md) | Permintaan akses dan buka kunci laporan |
| [peran-pic.md](peran-pic.md) | PIC proyek: status per butir spesifikasi 05, laporan di layar Hari ini, progres dibanding rencana, tenggat terdekat, riwayat laporan |
| [peran-grup.md](peran-grup.md) | Ringkasan khusus SDM & GA, TI, Super Admin, Auditor; Auditor hanya-baca; status butir spesifikasi 06–08 |
| [peran-admin.md](peran-admin.md) | Admin PT: status per butir spesifikasi, kepatuhan per orang & divisi, pengingat per orang, unduh log, permintaan akses dari Kepala divisi/PIC |
| [peran-direktur-manajemen.md](peran-direktur-manajemen.md) | Direktur & Manajemen: status per butir spesifikasi 01–02, tanggapan laporan mingguan, tinjauan proyek, persetujuan materi/anggaran/cuti, pencarian ⌘K, badge nav |
| [peran-kadiv.md](peran-kadiv.md) | Kepala divisi: status per butir spesifikasi, KPI tepat waktu 30 hari, ringkasan mingguan untuk Direktur |
| [pengingat.md](pengingat.md) | Pengingat manual, pengingat otomatis, cron, notifikasi |

**Gambar**

| Gambar | Isi |
| --- | --- |
| [img/arsitektur.svg](img/arsitektur.svg) | Arsitektur sistem |
| [img/alur-laporan-harian.svg](img/alur-laporan-harian.svg) | Alur antarperan laporan harian |
| [img/alur-laporan-mingguan.svg](img/alur-laporan-mingguan.svg) | Alur antarperan capaian mingguan |
| [img/model-data.svg](img/model-data.svg) | Relasi model data, termasuk model baru 0013–0025 |
| [img/navigasi-peran.svg](img/navigasi-peran.svg) | Tab yang terlihat untuk tiap peran, termasuk Persetujuan dan tab ringkas tablet/ponsel |
| [img/status-output.svg](img/status-output.svg) | Siklus status output |
| [img/pola-sheet.svg](img/pola-sheet.svg) | Pola detail Sheet di desktop, tablet, dan ponsel |
| `img/wf-*.svg` | Wireframe layar utama per peran, desktop dan ponsel |
| `img/layar/*-desktop.png`, `*-desktop-gelap.png` | Tangkapan layar `/pratinjau` 1440 px, tema terang dan gelap, untuk 25 tab dari 9 peran (6 Okt 2026, setelah Fase 3) |
| `img/layar/*-ponsel.png`, `*-tablet.png` | Tangkapan layar 390 px (8 layar) dan 900 px (Capaian mingguan), tema terang |

Semua SVG punya latar terang sendiri, jadi tetap terbaca di penampil bertema gelap.

SVG dibuat oleh skrip [`img/_sumber/buat-diagram.py`](img/_sumber/buat-diagram.py), tidak digambar tangan. Bila layar atau aturan berubah, ubah teksnya di skrip lalu jalankan ulang:

```bash
python3 docs/fitur/img/_sumber/buat-diagram.py docs/fitur/img
```

Tangkapan layar diambil dari `/pratinjau` dengan [`img/_sumber/tangkap-layar.mjs`](img/_sumber/tangkap-layar.mjs), yang memakai Chrome headless tanpa dependensi tambahan. Skrip memilih tab lewat localStorage, menjalankan setiap tangkapan di konteks peramban terpisah, mengemulasikan `prefers-color-scheme` untuk tema gelap, dan memeriksa `data-theme` serta tab aktif sebelum menyimpan:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --user-data-dir=/tmp/mk-shot --remote-debugging-port=9333 about:blank &
PRATINJAU_URL="http://localhost:3100/pratinjau?peran=" CDP_PORT=9333 \
  node docs/fitur/img/_sumber/tangkap-layar.mjs docs/fitur/img/layar
```

Halaman pratinjau memakai data contoh di `src/components/preview/`, jadi angka dan nama di gambar itu bukan data sungguhan, dan beberapa angka tidak sama antarperan (lihat [`SISA-PEKERJAAN.md`](../SISA-PEKERJAAN.md)).

## Galeri tangkapan layar

Semua tangkapan diambil dari `/pratinjau` pada 6 Oktober 2026 (1440 × 1000 px, `prefers-reduced-motion`, aksen merah). Tangkapan ponsel (390 px) dan tablet tampil di dokumen modulnya.

| Peran | Tab | Terang | Gelap | Dokumen |
| --- | --- | --- | --- | --- |
| PIC proyek | Hari ini | [terang](img/layar/pic-ringkasan-desktop.png) | [gelap](img/layar/pic-ringkasan-desktop-gelap.png) | [ringkasan.md](ringkasan.md) |
| PIC proyek | Meja kerja | [terang](img/layar/pic-meja-kerja-desktop.png) | [gelap](img/layar/pic-meja-kerja-desktop-gelap.png) | [meja-kerja.md](meja-kerja.md) |
| PIC proyek | Laporan harian | [terang](img/layar/pic-laporan-harian-desktop.png) | [gelap](img/layar/pic-laporan-harian-desktop-gelap.png) | [laporan-harian.md](laporan-harian.md) |
| Kepala divisi | Ringkasan | [terang](img/layar/kadiv-ringkasan-desktop.png) | [gelap](img/layar/kadiv-ringkasan-desktop-gelap.png) | [ringkasan.md](ringkasan.md) |
| Kepala divisi | Meja kerja | [terang](img/layar/kadiv-meja-kerja-desktop.png) | [gelap](img/layar/kadiv-meja-kerja-desktop-gelap.png) | [meja-kerja.md](meja-kerja.md) |
| Kepala divisi | Capaian mingguan | [terang](img/layar/kadiv-capaian-mingguan-desktop.png) | [gelap](img/layar/kadiv-capaian-mingguan-desktop-gelap.png) | [capaian-mingguan.md](capaian-mingguan.md) |
| Admin PT | Ringkasan | [terang](img/layar/admin-ringkasan-desktop.png) | [gelap](img/layar/admin-ringkasan-desktop-gelap.png) | [ringkasan.md](ringkasan.md) |
| Admin PT | Meja kerja | [terang](img/layar/admin-meja-kerja-desktop.png) | [gelap](img/layar/admin-meja-kerja-desktop-gelap.png) | [meja-kerja.md](meja-kerja.md) |
| Admin PT | Penerimaan | [terang](img/layar/admin-penerimaan-desktop.png) | [gelap](img/layar/admin-penerimaan-desktop-gelap.png) | [penerimaan.md](penerimaan.md) |
| Admin PT | Laporan harian | [terang](img/layar/admin-laporan-harian-desktop.png) | [gelap](img/layar/admin-laporan-harian-desktop-gelap.png) | [laporan-harian.md](laporan-harian.md) |
| Admin PT | Proyek | [terang](img/layar/admin-proyek-desktop.png) | [gelap](img/layar/admin-proyek-desktop-gelap.png) | [proyek.md](proyek.md) |
| Admin PT | Divisi | [terang](img/layar/admin-divisi-desktop.png) | [gelap](img/layar/admin-divisi-desktop-gelap.png) | [divisi.md](divisi.md) |
| Admin PT | Eskalasi | [terang](img/layar/admin-eskalasi-desktop.png) | [gelap](img/layar/admin-eskalasi-desktop-gelap.png) | [eskalasi.md](eskalasi.md) |
| Direktur entitas | Ringkasan | [terang](img/layar/direktur-ringkasan-desktop.png) | [gelap](img/layar/direktur-ringkasan-desktop-gelap.png) | [ringkasan.md](ringkasan.md) |
| Direktur entitas | Persetujuan | [terang](img/layar/direktur-persetujuan-desktop.png) | [gelap](img/layar/direktur-persetujuan-desktop-gelap.png) | [peran-direktur-manajemen.md](peran-direktur-manajemen.md) |
| Direktur entitas | Divisi | [terang](img/layar/direktur-divisi-desktop.png) | [gelap](img/layar/direktur-divisi-desktop-gelap.png) | [divisi.md](divisi.md) |
| Manajemen | Ringkasan | [terang](img/layar/manajemen-ringkasan-desktop.png) | [gelap](img/layar/manajemen-ringkasan-desktop-gelap.png) | [ringkasan.md](ringkasan.md) |
| Manajemen | Eskalasi | [terang](img/layar/manajemen-eskalasi-desktop.png) | [gelap](img/layar/manajemen-eskalasi-desktop-gelap.png) | [eskalasi.md](eskalasi.md) |
| Manajemen | Entitas | [terang](img/layar/manajemen-entitas-desktop.png) | [gelap](img/layar/manajemen-entitas-desktop-gelap.png) | [entitas.md](entitas.md) |
| Direksi SDM & GA | Ringkasan | [terang](img/layar/sdmga-ringkasan-desktop.png) | [gelap](img/layar/sdmga-ringkasan-desktop-gelap.png) | [peran-grup.md](peran-grup.md) |
| TI | Ringkasan | [terang](img/layar/ti-ringkasan-desktop.png) | [gelap](img/layar/ti-ringkasan-desktop-gelap.png) | [peran-grup.md](peran-grup.md) |
| TI | Sistem & akses | [terang](img/layar/ti-sistem-desktop.png) | [gelap](img/layar/ti-sistem-desktop-gelap.png) | [sistem.md](sistem.md) |
| Auditor | Ringkasan | [terang](img/layar/auditor-ringkasan-desktop.png) | [gelap](img/layar/auditor-ringkasan-desktop-gelap.png) | [peran-grup.md](peran-grup.md) |
| Auditor | Log aktivitas | [terang](img/layar/auditor-log-desktop.png) | [gelap](img/layar/auditor-log-desktop-gelap.png) | [log.md](log.md) |
| Super Admin | Perusahaan & akun | [terang](img/layar/superadmin-perusahaan-desktop.png) | [gelap](img/layar/superadmin-perusahaan-desktop-gelap.png) | [perusahaan-akun.md](perusahaan-akun.md) |

## Peran dalam satu tabel

| Peran (`User.role`) | Nama di layar | Cakupan | Tab pembuka |
| --- | --- | --- | --- |
| `PIC_PROYEK` | Manager / PIC proyek | proyek yang dipegang | Hari ini |
| `KEPALA_DIVISI` | Kepala divisi | divisi yang dipimpin | Ringkasan |
| `ADMIN_PT` | Admin PT | satu PT (`scopeEntityId`) | Ringkasan |
| `DIREKTUR_ENTITAS` | Direktur perusahaan | satu PT dan anak-anaknya | Ringkasan |
| `DIREKTUR_SDM_GA` | Direksi holding (SDM & GA) | seluruh grup | Ringkasan |
| `MANAJEMEN` | Manajemen holding | seluruh grup | Ringkasan |
| `AUDITOR` | Auditor | seluruh grup, hanya baca | Ringkasan |
| `TI` | Tim TI | seluruh grup, semua modul kecuali meja akun | Ringkasan |
| `SUPERADMIN` | Super Admin | seluruh grup, semua modul | Ringkasan |

![Peta navigasi per peran](img/navigasi-peran.svg)

## Menjalankan di mesin lokal

Prasyarat: Node.js 20 atau lebih baru dan git. Langkah lengkap ada di [`README.md`](../../README.md) dan [`SUPABASE_SETUP.md`](../../SUPABASE_SETUP.md).

```bash
npm install
cp .env.example .env      # isi DATABASE_URL, DIRECT_URL, AUTH_SECRET, CRON_SECRET, dst.
npx prisma generate
npm run dev               # http://localhost:3000
```

| Variabel | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Koneksi pooler Supabase (port 6543) untuk aplikasi |
| `DIRECT_URL` | Koneksi langsung (port 5432) untuk migrasi |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage bukti. Tanpa kunci ini unggah berkas menjawab 503, tautan bukti tetap bisa. |
| `AUTH_SECRET` | Kunci HMAC cookie sesi |
| `CRON_SECRET` | Wajib, minimal 16 karakter. Tanpa ini cron menjawab 503. |
| `APP_ORIGINS` | Opsional. Origin tambahan yang lolos pemeriksaan CSRF, dipisah koma. |
| `DAILY_CUTOFF_HOUR`, `WEEKLY_HANDOVER_DAY`, `WEEKLY_LOCK_DAY`, `WEEKLY_CUTOFF_HOUR` | Opsional. Menggeser tenggat (bawaan 17, 4 = Kamis, 5 = Jumat, 17). |

> **Peringatan.** Basis data di `.env` adalah Supabase yang dipakai sungguhan. Jangan menjalankan `prisma db push`, `prisma migrate dev`, `db:seed`, atau skrip lain yang menulis ke basis data tanpa sengaja.

## Pratinjau tanpa basis data

Mode pengembangan menyediakan `/pratinjau?peran=<PERAN>` yang merender aplikasi dengan data contoh. Permintaan `fetch` dicegat di [`src/components/preview/preview-app.tsx`](../../src/components/preview/preview-app.tsx).

```
http://localhost:3000/pratinjau?peran=PIC_PROYEK
                                     KEPALA_DIVISI | ADMIN_PT | DIREKTUR_ENTITAS
                                     MANAJEMEN | SUPERADMIN | DIREKTUR_SDM_GA | TI | AUDITOR
```

- Di produksi, `src/proxy.ts` menjawab 404 untuk `/pratinjau` sebelum halaman dirender. Modul pratinjau dimuat lewat impor dinamis di cabang non-produksi. Build produksi sudah dicek: data contoh tidak masuk chunk JavaScript.
- **Semua tab** untuk 9 peran punya data contoh (Fase 3): 62 tab termuat tanpa respons `/api` gagal, pengecualian, atau galat konsol. Data dibagi per area di `mock-pic.ts`, `mock-kadiv.ts`, `mock-admin.ts`, `mock-oversight.ts`, `mock-group.ts`, `mock-laporan.ts`, `mock-proyek.ts`, dan `mock-sistem.ts`, dengan urutan `AREA_MOCKS` di `preview-app.tsx`.
- Tiruan memakai pembantu murni dari `src/lib/lock.ts` dan `src/lib/rbac.ts`, jadi aturan kunci, beku, dan hak tetap sama dengan aplikasi: misalnya kirim tanpa bukti 422, teruskan lalu ubah 409, Urungkan membuka lagi.
- Endpoint tanpa data contoh menjawab 503 dan dicatat di `window.__pratinjauMiss` serta `console.warn('[pratinjau] belum ada data contoh')`.
- Data contoh tenggat mingguan mengikuti aturan kode: serah Kamis 17.00 dan kunci Jumat 17.00 WIB (lihat [capaian-mingguan.md](capaian-mingguan.md)).

## Tes otomatis

```bash
npm test                 # vitest run
npm run test:watch
npm run test:coverage
```

| Kelompok | Berkas | Yang diuji |
| --- | --- | --- |
| Aturan murni | `tests/lib/lock`, `project-status`, `daily-intake`, `security`, `password-policy`, `kpi-math`, `kadiv-math`, `pic-progress`, `admin-compliance`, `group-panel`, `evidence-access`, `access-revert`, `undo` | Tenggat dan kunci WIB, status proyek, hitungan masuk, kata sandi, rumus KPI dan kepatuhan, progres dibanding rencana, hak bukti saat buka kunci, pengembalian akses sementara, tiket Urungkan |
| Laporan | `tests/api/daily-input`, `weekly-input`, `work-desk`, `notifications-remind` | Beku setelah diteruskan, buka kunci, persetujuan hanya dari Menunggu persetujuan, pengingat |
| PIC dan Kepala divisi (F3-C) | `tests/api/pic-outputs`, `pic-project-routes`, `project-progress`, `kadiv-routes`, `kadiv-weekly-summary` (fixture `pic-world.ts`) | Output, catatan, tahapan, usulan tenggat, review, tim, ringkasan mingguan, anti-IDOR |
| Admin dan grup (F3-D) | `tests/api/admin-access-requests`, `admin-inbox`, `admin-overview-reminders`, `admin-pt`, `admin-unlock-requests`, `grup-peran` (fixture `admin-fake-db.ts`) | Permintaan akses, penerusan ganda, pengingat, buka kunci, panel grup, dengan sesi sungguhan |
| Pengawas | `tests/api/approval-requests`, `weekly-comments`, `project-reviews`, `search`, `undo` | Persetujuan, tanggapan, tinjauan, ⌘K, Urungkan |
| Keamanan | `tests/api/login`, `proxy`, `must-change-password`, `keamanan-akses`, `keamanan-galat-mentah`, `auditor-readonly` | Pembatas laju, CSRF, wajib ganti sandi, cakupan, tanpa `err.message` mentah, Auditor hanya-baca di semua route |

Pada pemeriksaan terakhir (integrasi akhir, 6 Okt 2026) ada 39 berkas dan 674 tes, semuanya lolos. Tes memakai basis data tiruan (mock atau imitasi Prisma dalam memori). [`vitest.config.mts`](../../vitest.config.mts) mengarahkan `DATABASE_URL` ke alamat mati (`127.0.0.1:1`), jadi tes tidak bisa menyentuh Supabase. Tes ini memeriksa logika route, bukan kueri Prisma sungguhan.

Pemeriksaan lain sebelum PR:

```bash
npx tsc --noEmit
npx eslint src
npm run build
```

Lalu jalankan daftar periksa [`docs/design/15-checklist-review.md`](../design/15-checklist-review.md).

## Migrasi manual 0013–0025

> **Wajib dijalankan oleh manusia.** Sepuluh migrasi di bawah sudah ditulis tetapi **belum diterapkan** ke basis data mana pun. Tidak ada agen yang boleh menjalankannya. Prisma Client yang sudah dibuat ulang mengharapkan kolom `User.divisionId`, `User.mustChangePassword`, dan `Project.divisionId`. Selama 0015 dan 0018 belum diterapkan, kueri yang memilih semua kolom `User` atau `Project` gagal. Jangan menjalankan cabang ini terhadap basis data produksi sebelum migrasi diterapkan.

Terapkan **persis dalam urutan ini**. Nomor 0020, 0022, dan 0024 memang tidak ada; Prisma mengurutkan menurut nama folder, jadi celah nomor tidak berpengaruh.

| Urutan | Folder | Isi | Bergantung pada |
| --- | --- | --- | --- |
| 1 | [`0013_outputs`](../../prisma/migrations/0013_outputs/migration.sql) | Tabel `Output` | `Project`, `User` |
| 2 | [`0014_pic_features`](../../prisma/migrations/0014_pic_features/migration.sql) | `ProjectNote`, `ProjectStage`, `DeadlineProposal` | 0013 |
| 3 | [`0015_kadiv_features`](../../prisma/migrations/0015_kadiv_features/migration.sql) | Kolom `User.divisionId` dan `Project.divisionId` (FK ke `Division`, `ON DELETE SET NULL`), tabel `Attendance` dengan CHECK status | `Division` |
| 4 | [`0016_admin_features`](../../prisma/migrations/0016_admin_features/migration.sql) | `AccessRequest`, `ReminderRule` | `User` |
| 5 | [`0017_oversight`](../../prisma/migrations/0017_oversight/migration.sql) | `WeeklyReportRead`, sengaja tanpa FK | — |
| 6 | [`0018_auth_password`](../../prisma/migrations/0018_auth_password/migration.sql) | Kolom `User.mustChangePassword` (wajib ganti kata sandi) | `User` |
| 7 | [`0019_note_reads`](../../prisma/migrations/0019_note_reads/migration.sql) | `NoteRead` (status baca catatan per akun), `OutputRevision` (riwayat catatan revisi) | 0013, 0014 |
| 8 | [`0021_kadiv_more`](../../prisma/migrations/0021_kadiv_more/migration.sql) | `WeeklyDivisionSummary` (ringkasan mingguan untuk Direktur), `DailyReportRead`; keduanya tanpa FK | — |
| 9 | [`0023_oversight_more`](../../prisma/migrations/0023_oversight_more/migration.sql) | `WeeklyReportComment`, `ProjectReview`, `ApprovalRequest`; memperluas CHECK `Attendance_status_check` dengan `TERLAMBAT` | 0015 |
| 10 | [`0025_undo`](../../prisma/migrations/0025_undo/migration.sql) | `UndoToken` (tiket Urungkan), tanpa FK | — |

Setiap tabel baru memasang `ENABLE ROW LEVEL SECURITY` tanpa policy. Akses hanya lewat Prisma di server, sama dengan tabel lama. Kolom baru di `User` dan `Project` ikut RLS tabelnya sejak 0002.

Pemeriksaan integrasi akhir (6 Okt 2026), luring dan tanpa menjalankan migrasi: SQL yang dihasilkan `prisma migrate diff` dari skema HEAD ke `schema.prisma` sekarang dicocokkan dengan gabungan 0013–0025. Hasilnya 16 tabel, 158 kolom (tipe, NOT NULL, default), 54 indeks, dan 19 FK sama persis, tanpa kolom atau indeks berlebih. Semua tabel di skema punya `ENABLE ROW LEVEL SECURITY`. Setiap FK hanya merujuk tabel yang sudah dibuat di migrasi yang sama atau sebelumnya. Yang **belum** dicek: menjalankan SQL ini pada Postgres sungguhan (urutan pernyataan, data lama yang melanggar CHECK/FK), dan kecocokan 0001–0012 dengan basis data (perlu shadow database).

Langkah yang disarankan, dikerjakan oleh orang yang memegang akses basis data:

1. Cadangkan basis data: Supabase Dashboard (Database → Backups), `pg_dump` dengan `DIRECT_URL`, atau `deploy/db-vps/backup.sh` bila basis data sudah di VPS.
2. Periksa keadaan migrasi: `npx prisma migrate status`. Pastikan 0001–0012 tercatat sudah diterapkan dan hanya 10 folder di atas yang tertunda. Bila riwayat `_prisma_migrations` tidak cocok (misalnya migrasi lama pernah dijalankan dengan `db execute`), jangan lanjut. Selesaikan dulu dengan `prisma migrate resolve`.
3. Pastikan data lama tidak melanggar CHECK baru: `SELECT DISTINCT status FROM "Attendance"` hanya boleh berisi HADIR, TERLAMBAT, CUTI, SAKIT, IZIN (tabel ini baru dibuat 0015, jadi biasanya kosong).
4. Terapkan berurutan: `npm run db:migrate:deploy` (`prisma migrate deploy`). Di VPS, `deploy/app-vps/deploy.sh` menjalankan layanan `migrate` setelah konfirmasi "ya". Atau jalankan isi tiap `migration.sql` di SQL Editor dengan urutan tabel di atas, lalu tandai masing-masing dengan `npx prisma migrate resolve --applied <nama_folder>`.
5. Isi data lama: `User.divisionId` untuk anggota divisi dan `Project.divisionId` untuk divisi pelaksana, lewat "Atur anggota" (`PUT /api/kadiv/members`). Sampai diisi, proyek tanpa divisi mengikuti divisi PIC-nya.
6. Uji layar per peran dengan akun seed (lihat P0 di [`SISA-PEKERJAAN.md`](../SISA-PEKERJAAN.md)).
7. Jadwalkan cron di VPS lewat [`deploy/app-vps/cron.sh`](../../deploy/app-vps/cron.sh): `remind-divisions`, `reminder-rules`, dan `kpi-snapshot` (contoh baris crontab ada di kepala berkas itu). Lihat [pengingat.md](pengingat.md).

Setelah rilis, semua orang perlu masuk ulang sekali. Token lama tidak membawa sidik kata sandi dan akan ditolak (lihat [keamanan.md](keamanan.md)).
