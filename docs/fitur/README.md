# Dokumentasi fitur Monitor Karya

Dokumentasi kode dan penjelasan fitur untuk cabang `desain-baru` per 6 Oktober 2026. Isinya: cara kerja tiap modul, siapa yang memakainya, aturan bisnisnya, endpoint API, dan berkas kode utamanya.

Panduan visual (warna, komponen, pola layar) ada di [`DESIGN.md`](../../DESIGN.md) dan [`docs/design/`](../design/README.md). Spesifikasi layar per peran ada di [`docs/design/peran/`](../design/peran/). Daftar pekerjaan yang masih terbuka ada di [`docs/SISA-PEKERJAAN.md`](../SISA-PEKERJAAN.md).

![Arsitektur sistem](img/arsitektur.svg)

## Isi

**Dasar**

| Berkas | Isi |
| --- | --- |
| [arsitektur.md](arsitektur.md) | App Router, route API, Prisma, RBAC, kunci WIB, sistem desain `mk`, kerangka shell/Dock |
| [keamanan.md](keamanan.md) | Sesi, CSRF, CSP, pembatas laju, cakupan data, cron, unggahan |

**Modul (satu per tab navigasi)**

| Berkas | Tab | Peran utama |
| --- | --- | --- |
| [ringkasan.md](ringkasan.md) | Ringkasan / Hari ini | semua peran |
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
| [img/model-data.svg](img/model-data.svg) | Relasi model data, termasuk model baru 0013–0017 |
| [img/navigasi-peran.svg](img/navigasi-peran.svg) | Tab yang terlihat untuk tiap peran |
| [img/status-output.svg](img/status-output.svg) | Siklus status output |
| [img/pola-sheet.svg](img/pola-sheet.svg) | Pola detail Sheet di desktop, tablet, dan ponsel |
| `img/wf-*.svg` | Wireframe layar utama per peran, desktop dan ponsel |
| `img/layar/*.png` | Tangkapan layar `/pratinjau` dengan data contoh, 6 Oktober 2026 |

Semua SVG punya latar terang sendiri, jadi tetap terbaca di penampil bertema gelap.

SVG dibuat oleh skrip [`img/_sumber/buat-diagram.py`](img/_sumber/buat-diagram.py), tidak digambar tangan. Bila layar atau aturan berubah, ubah teksnya di skrip lalu jalankan ulang:

```bash
python3 docs/fitur/img/_sumber/buat-diagram.py docs/fitur/img
```

Tangkapan layar diambil dari `/pratinjau` dengan [`img/_sumber/tangkap-layar.mjs`](img/_sumber/tangkap-layar.mjs), yang memakai Chrome headless tanpa dependensi tambahan. Halaman pratinjau memakai data contoh di `src/components/preview/`, jadi angka dan nama di gambar itu bukan data sungguhan.

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
- Ringkasan semua peran, Meja kerja, Capaian mingguan, serta Perusahaan & akun punya data contoh.
- Penerimaan, Laporan harian, Proyek, Divisi, Eskalasi, Entitas, Log aktivitas, dan Sistem belum punya data contoh. Di pratinjau, tab itu menampilkan keadaan galat dengan tombol "Coba lagi". Ini perilaku yang diharapkan, bukan kerusakan.
- Data contoh tenggat mingguan mengikuti aturan kode: serah Kamis 17.00 dan kunci Jumat 17.00 WIB (lihat [capaian-mingguan.md](capaian-mingguan.md)).

## Tes otomatis

```bash
npm test                 # vitest run
npm run test:watch
npm run test:coverage
```

| Berkas | Yang diuji |
| --- | --- |
| [`tests/lib/lock.test.ts`](../../tests/lib/lock.test.ts) | Hari WIB, tenggat 17.00, kunci Kamis/Jumat, minggu ISO, tanggal mustahil |
| [`tests/lib/project-status.test.ts`](../../tests/lib/project-status.test.ts) | Semua cabang `deriveProjectStatus` |
| [`tests/lib/daily-intake.test.ts`](../../tests/lib/daily-intake.test.ts) | Hitungan "laporan masuk" yang dipakai Ringkasan dan Meja kerja Admin |
| [`tests/lib/security.test.ts`](../../tests/lib/security.test.ts) | Pembatas laju, teks aman, tanda tangan berkas |
| [`tests/api/work-desk.test.ts`](../../tests/api/work-desk.test.ts) | Cakupan per peran, pengingat ganda ditolak 409, kunci 17.00 |
| [`tests/api/weekly-input.test.ts`](../../tests/api/weekly-input.test.ts) | Validasi penyerahan mingguan (bukti wajib, minggu berjalan, kunci Jumat) |
| [`tests/api/login.test.ts`](../../tests/api/login.test.ts), [`tests/api/proxy.test.ts`](../../tests/api/proxy.test.ts) | Pembatas laju masuk, CSRF, batas badan |

Pada pemeriksaan terakhir ada 8 berkas dan 114 tes, semuanya lolos. Tes memakai mock untuk `@/lib/db` dan `@/lib/auth`. [`vitest.config.mts`](../../vitest.config.mts) mengarahkan `DATABASE_URL` ke alamat mati (`127.0.0.1:1`), jadi tes tidak bisa menyentuh Supabase. Tes ini memeriksa logika route, bukan kueri Prisma sungguhan.

Pemeriksaan lain sebelum PR:

```bash
npx tsc --noEmit
npx eslint src
npm run build
```

Lalu jalankan daftar periksa [`docs/design/15-checklist-review.md`](../design/15-checklist-review.md).

## Migrasi manual 0013–0017

> **Wajib dijalankan oleh manusia.** Migrasi di bawah sudah ditulis tetapi **belum diterapkan** ke Supabase. Tidak ada agen yang boleh menjalankannya. Prisma Client yang sudah dibuat ulang mengharapkan kolom `User.divisionId` dan `Project.divisionId`. Selama 0015 belum diterapkan, kueri yang memilih semua kolom `User` atau `Project` akan gagal. Jangan menjalankan cabang ini terhadap Supabase sebelum migrasi diterapkan.

| Folder | Isi | Bergantung pada |
| --- | --- | --- |
| [`0013_outputs`](../../prisma/migrations/0013_outputs/migration.sql) | Tabel `Output` | `Project`, `User` |
| [`0014_pic_features`](../../prisma/migrations/0014_pic_features/migration.sql) | `ProjectNote`, `ProjectStage`, `DeadlineProposal` | 0013 |
| [`0015_kadiv_features`](../../prisma/migrations/0015_kadiv_features/migration.sql) | Kolom `User.divisionId` dan `Project.divisionId` (FK ke `Division`, `ON DELETE SET NULL`), tabel `Attendance` | `Division` |
| [`0016_admin_features`](../../prisma/migrations/0016_admin_features/migration.sql) | `AccessRequest`, `ReminderRule` | `User` |
| [`0017_oversight`](../../prisma/migrations/0017_oversight/migration.sql) | `WeeklyReportRead`, sengaja tanpa FK | — |

Setiap tabel baru memasang `ENABLE ROW LEVEL SECURITY` tanpa policy. Akses hanya lewat Prisma di server, sama dengan tabel lama. Integrasi sudah mencocokkan SQL ini dengan `schema.prisma` secara luring: 79 kolom, 21 indeks, dan 18 FK sama.

Langkah yang disarankan, dikerjakan oleh orang yang memegang akses basis data:

1. Cadangkan basis data dari Supabase Dashboard (Database → Backups), atau `pg_dump` dengan `DIRECT_URL`.
2. Periksa keadaan migrasi: `npx prisma migrate status`. Pastikan 0001–0012 tercatat sudah diterapkan dan hanya 0013–0017 yang tertunda. Bila riwayat `_prisma_migrations` tidak cocok (misalnya migrasi lama pernah dijalankan dengan `db execute`), jangan lanjut. Selesaikan dulu dengan `prisma migrate resolve`.
3. Terapkan berurutan: `npm run db:migrate:deploy` (`prisma migrate deploy`). Atau jalankan isi tiap `migration.sql` di SQL Editor Supabase dengan urutan 0013, 0014, 0015, 0016, 0017, lalu tandai dengan `npx prisma migrate resolve --applied <nama_folder>`.
4. Isi data lama: `User.divisionId` untuk anggota divisi dan `Project.divisionId` untuk divisi pelaksana, lewat "Atur anggota" (`PUT /api/kadiv/members`). Sampai diisi, proyek tanpa divisi mengikuti divisi PIC-nya.
5. Uji layar per peran dengan akun seed (lihat P0 di [`SISA-PEKERJAAN.md`](../SISA-PEKERJAAN.md)).
6. Jadwalkan cron `/api/cron/reminder-rules` di `vercel.json` bila pengingat otomatis ingin dipakai (lihat [pengingat.md](pengingat.md)).

Setelah rilis, semua orang perlu masuk ulang sekali. Token lama tidak membawa sidik kata sandi dan akan ditolak (lihat [keamanan.md](keamanan.md)).
