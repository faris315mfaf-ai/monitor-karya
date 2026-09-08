# MonitorKarya × Supabase — Panduan Setup

Aplikasi ini adalah Next.js 16 + Prisma. Database-nya sekarang **PostgreSQL di Supabase**
(sebelumnya SQLite di sandbox). Skema tetap dikelola lewat Prisma, jadi seluruh API route
di `src/app/api/*` tidak perlu diubah.

## 0. Yang sudah disiapkan di repo ini

| File | Fungsi |
|---|---|
| `prisma/schema.prisma` | provider `postgresql` + `directUrl` |
| `prisma/migrations/0001_init/migration.sql` | DDL 22 tabel (dibuat dari skema Prisma) |
| `prisma/migrations/0002_enable_rls/migration.sql` | Aktifkan RLS di semua tabel + index untuk query API |
| `prisma/migrations/0003_fk_indexes/migration.sql` | Index penutup untuk semua foreign key (saran advisor Supabase) |
| `prisma/seed.sql` | Seed data contoh versi SQL (bisa dijalankan tanpa Node) |
| `scripts/seed.ts` | Seed data contoh versi Prisma (opsional, hasil setara) |
| `src/lib/auth.ts` + `src/lib/password.ts` | Sesi bertanda tangan HMAC & hashing scrypt |
| `prisma/migrations/0004_user_password/migration.sql` | Kolom `User.passwordHash` |
| `scripts/set-passwords.ts` | Memberi kata sandi ke akun seed |
| `scripts/demo-accounts.ts` | Tujuh akun demo, satu per peran |
| `src/lib/rbac.ts` | Tab & kewenangan per peran |
| `src/lib/lock.ts` | Tenggat, penguncian, dan validasi |
| `prisma/migrations/0007_task_and_subtask/` | Tabel Task & Subtask |
| `src/components/task-dialog.tsx` | Form tambah/ubah task |
| `src/components/demo-role-picker.tsx` | Masuk cepat sebagai peran |
| `src/components/views/management-charts.tsx` | Enam grafik Manajemen |
| `src/lib/daily-rollup.ts` | Task → laporan harian |
| `prisma/migrations/0008_weekly_item_tags_and_subtasks/` | Tag & checklist item mingguan |
| `src/lib/storage.ts` | Unggah/signed URL bucket privat `evidence` |
| `src/lib/evidence-access.ts` | Siapa boleh melampirkan & membaca bukti |
| `prisma/migrations/0006_evidence_storage_bucket/` | Bucket penyimpanan bukti |
| `.env.example` | Template variabel lingkungan |

## 1. Ambil kredensial dari Supabase Dashboard

Buka **Project Settings → Database → Connection string**, pilih tab **URI**.

- **Transaction pooler** (port `6543`) → dipakai `DATABASE_URL` (Prisma Client di runtime).
- **Session / Direct** (port `5432`) → dipakai `DIRECT_URL` (Prisma Migrate & seed).

Password database dibuat saat projek dibuat. Kalau lupa, reset di halaman yang sama
(**Reset database password**).

## 2. Isi `.env`

```bash
cp .env.example .env
```

Lalu ganti `[YOUR-PASSWORD]` di `.env` dengan password database projek `monitor-karya` (ref `kgqpwlehjnoebunzshga`):

```
DATABASE_URL="postgresql://postgres.kgqpwlehjnoebunzshga:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.kgqpwlehjnoebunzshga:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://kgqpwlehjnoebunzshga.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_2JCkAbQPHRoiBsnX4fsRTQ_m7oNBqrv"
AUTH_SECRET="...minimal 32 karakter, rahasia..."
SEED_PASSWORD="MonitorKarya#2026"
```

Catatan:
- Jika password mengandung karakter khusus (`@`, `#`, `/`, dll) lakukan URL-encode
  (misal `@` → `%40`).
- `.env` sudah di-ignore oleh git. Jangan pernah commit password.

## 3. Sinkronkan status migrasi Prisma (sekali saja)

Skema dan data sudah diterapkan langsung ke Supabase lewat MCP. Supaya Prisma tahu
migrasi `0001` sampai `0008` sudah berjalan (dan tidak mencoba membuat ulang tabel):

```bash
npx prisma migrate resolve --applied 0001_init
```

```bash
npx prisma migrate resolve --applied 0002_enable_rls
```

```bash
npx prisma migrate resolve --applied 0003_fk_indexes
```

```bash
npx prisma migrate resolve --applied 0004_user_password
```

```bash
npx prisma migrate resolve --applied 0005_role_workflow_links
```

```bash
npx prisma migrate resolve --applied 0006_evidence_storage_bucket
```

```bash
npx prisma migrate resolve --applied 0007_task_and_subtask
```

```bash
npx prisma migrate resolve --applied 0008_weekly_item_tags_and_subtasks
```

Setelah itu, perubahan skema berikutnya cukup:

```bash
npm run db:migrate:dev -- --name nama_perubahan
```

di lokal, dan `npm run db:migrate:deploy` saat deploy.

## 3b. Sistem login

Autentikasi memakai email + kata sandi terhadap tabel `User` yang sudah ada
(bukan Supabase Auth), sehingga peran dan `scopeEntityId` yang sudah dimodelkan
tetap menjadi sumber kebenaran.

Cara kerjanya:

- Kata sandi di-hash dengan **scrypt** (`node:crypto`, salt acak per akun),
  disimpan di kolom `User.passwordHash`.
- Sesi berupa cookie **httpOnly** `mk_session` bertanda tangan HMAC-SHA256,
  berlaku 8 jam. Tidak ada dependensi auth pihak ketiga.
- `AUTH_SECRET` di `.env` adalah kunci penandatangan. **Ganti nilainya di
  produksi** — mengganti kunci membuat semua sesi lama tidak berlaku.
- Halaman `/` adalah server component: tanpa sesi ia mengalihkan ke `/login`.
  Seluruh route API membalas `401` tanpa sesi.

### Memberi kata sandi ke akun

```bash
npm run db:passwords
```

Mengisi semua akun yang belum punya kata sandi, memakai `SEED_PASSWORD` dari
`.env`. Varian lain: `-- --all` untuk mereset semua, atau `-- email@nya` untuk
satu akun. **Setiap kali seed dijalankan ulang, jalankan perintah ini lagi** —
`TRUNCATE` di `prisma/seed.sql` menghapus tabel `User` beserta kata sandinya.

### Cakupan data per peran

Peran global (`MANAJEMEN`, `AUDITOR`, `TI`, `DIREKTUR_SDM_GA`) membaca seluruh
grup. Peran lain dikunci pada `scopeEntityId` miliknya beserta seluruh turunannya
— dipaksakan di sisi server, sehingga parameter query tidak bisa dipakai untuk
melebarkan akses. Contoh nyata pada data seed:

| Endpoint | Manajemen | Admin PT Sigma | Direktur PT Sigma |
|---|---|---|---|
| `/api/projects` | 40 | 4 | 28 |
| `/api/daily-reports` | 761 | 74 | 539 |
| `/api/audit-logs` | 29 | 8 | 19 |

Riwayat notifikasi bersifat personal: peran non-global hanya melihat miliknya.


## 3c. Peran, modul, dan alur proses

Tujuh akun demo, satu per peran. Kata sandi semuanya dari `SEED_PASSWORD` di `.env`.
Sejak seed 7 Sep 2026 ketujuh akun ini **ditanam langsung oleh `prisma/seed.sql`** pada PT Sigma — `npm run db:demo` tinggal alat perbaikan bila akunnya terhapus.

| Peran | Email | Cakupan | Modul yang terbuka |
|---|---|---|---|
| PIC Proyek | `pic@karya.co.id` | PT Sigma (1 proyek) | Dashboard, Laporan Kemajuan (harian/mingguan/bulanan), Modul Proyek |
| Kepala Divisi | `kadiv@karya.co.id` | 1 divisi PT Sigma | Dashboard, Capaian Mingguan, Modul Divisi |
| Admin PT | `adminpt@karya.co.id` | PT Sigma | + Meja Kerja, Penerimaan, kedua modul input, Eskalasi, **Ajukan Proyek** |
| Direktur Anak Perusahaan | `direktur@karya.co.id` | Sub-holding | Dashboard, Proyek, Divisi, Eskalasi, Entitas |
| Direktur SDM & GA | `sdmga@karya.co.id` | Seluruh grup | + Audit Trail |
| Pengelola Sistem IT | `it@karya.co.id` | Seluruh grup | Semua modul + Sistem & Akses |
| Manajemen | `manajemen@karya.co.id` | Seluruh grup | Dashboard, Eskalasi, Proyek, Divisi, Entitas, Audit |

Daftar tab dan kewenangan tiap peran ada di `src/lib/rbac.ts`. Tabel itu dipakai dua
kali: untuk menyembunyikan tab di UI, dan untuk menolak permintaan di API. Menyembunyikan
tombol saja tidak pernah cukup.

### Alur proses

1. **PIC Proyek** mengisi laporan harian per proyek (`Lapor Harian`) dan mengirimnya ke
   Admin PT. **Kepala Divisi** mengisi capaian mingguan divisinya (`Capaian Mingguan`),
   menyerahkan ke Admin PT, lalu menyetujuinya.
2. **Admin PT** menerima kedua aliran di `Penerimaan`, lalu meneruskannya ke tingkat
   berikutnya. Admin PT juga dapat menginput sendiri bila PIC berhalangan.
3. **Validasi sistem** berjalan saat pengiriman: status wajib dipilih, capaian wajib
   diisi, dan minimal satu bukti wajib dilampirkan — kecuali status yang memang tidak
   memerlukannya (`TIDAK_ADA_PERUBAHAN`, `BELUM_MULAI`, `NA`). Aturannya ada di
   `src/lib/lock.ts`.
4. **Penguncian** dihitung dari jam, bukan dari cron, sehingga tidak ada celah bila
   penjadwal gagal jalan: laporan harian terkunci pukul 17.00 WIB pada harinya; capaian
   mingguan diserahkan paling lambat Kamis 17.00 dan terkunci Jumat 17.00. Jam potong
   dapat diubah lewat `DAILY_CUTOFF_HOUR` / `WEEKLY_CUTOFF_HOUR`.
5. Setiap simpan, kirim, setujui, teruskan, dan lampir bukti tercatat di **jejak audit**
   lengkap dengan pelakunya.
6. Data yang sudah masuk langsung terbaca di dashboard, dibatasi cakupan masing-masing
   peran (PT → grup).

### Dashboard per peran

Dashboard berbeda menurut apa yang menjadi tanggung jawab peran tersebut
(`src/app/api/my-dashboard/route.ts` + `src/components/views/role-dashboards.tsx`):

- **PIC Proyek** — proyek yang belum dilapor hari ini, hitung mundur 17.00, ketepatan
  waktu 7 hari terakhir.
- **Kepala Divisi** — item minggu ini per status, hitung mundur serah terima Kamis, dan
  peringatan item yang buktinya belum dilampirkan.
- **Admin PT** — apa yang sudah masuk dari PIC dan divisi, apa yang menunggu diteruskan
  (dengan pintasan ke modul Penerimaan), kepatuhan entitas, insiden terlambat.
- **Direktur, Dir SDM & GA, Manajemen, Auditor** — dashboard agregat ditambah panel
  keputusan/tindak lanjut yang tertahan, termasuk peringatan eskalasi lewat SLA.

### Modul task harian (PIC Proyek)

Di bawah tiap proyek pada modul `Lapor Harian`, PIC merinci pekerjaan hari itu
sebagai **task** (`src/app/api/tasks/route.ts`, `src/components/task-dialog.tsx`):

- judul, deskripsi, **subtask** berupa daftar centang, **PIC pelaksana**, **tag**;
- **periode pengerjaan** jam mulai–selesai WIB, durasi dihitung otomatis;
- **lampiran** dokumen/foto (setelah task disimpan, memakai penyimpanan yang sama);
- status termasuk **Terkendala** dan **Menunggu Keputusan**.

Validasi ditegakkan di server: judul wajib, jam selesai harus setelah jam mulai,
status Terkendala wajib menyertakan uraian kendala, dan Menunggu Keputusan wajib
menyebut keputusan yang diminta. Task ikut terkunci bersama harinya pukul 17.00 WIB.

### Alur eskalasi

Dari task berstatus Terkendala atau Menunggu Keputusan, PIC menekan **Ajukan
eskalasi** (`src/app/api/escalations/actions/route.ts`). Satu task hanya dapat
dieskalasi sekali. Selanjutnya:

| Tahap | Pelaku | Hasil |
|---|---|---|
| Ajukan | PIC / Kepala Divisi / Admin PT | `DIAJUKAN` |
| Tandai ditinjau | Direktur Entitas, Dir SDM & GA | `DITINJAU` |
| Putuskan | **Manajemen saja** | `DIPUTUSKAN` + isi keputusan |
| Tutup | Direktur / Manajemen | `DITUTUP` |

Isi keputusan minimal 10 karakter, dan keputusannya tampil kembali di kartu task
milik PIC. Setiap transisi tercatat di jejak audit beserta pelakunya.

### Tampilan

- Ukuran teks dasar dinaikkan (17px) dan seluruh label mikro ikut dinaikkan satu
  tingkat; tombol dan kolom isian minimal 44px agar mudah dijangkau di layar sentuh.
- **Dark mode** aktif mengikuti preferensi sistem, dengan tombol pengalih di bilah
  atas (terang → gelap → ikut sistem). Latar gradien dan seluruh warna teks punya
  pasangan gelapnya.
- Glassmorphism dipertahankan, kecuali pada dialog: modal memakai `.glass-modal`
  yang nyaris pekat, karena panel tembus pandang membuat teks di belakangnya ikut
  terbaca saat mengisi formulir.

### Task mengalir ke laporan harian

Begitu sebuah proyek punya task pada suatu hari, laporan hariannya **tidak diisi
ulang** — status, progres, dan jumlah bukti dihitung dari task-nya
(`src/lib/daily-rollup.ts`):

- **status** diambil yang terburuk: satu task Terkendala membuat seluruh hari
  Terkendala; semua Selesai baru menghasilkan Selesai;
- **progres** adalah rata-rata progres seluruh task;
- **bukti** dijumlahkan dari lampiran laporan itu sendiri ditambah lampiran
  seluruh task-nya, sehingga bukti yang ditempel di task sudah memenuhi syarat
  pengiriman;
- **capaian** dan **kendala** disusun otomatis dari task, tetapi tidak menimpa
  kalimat yang sudah ditulis PIC sendiri.

Formulir menampilkan nilai turunan ini sebagai ringkasan baca-saja dengan
penjelasan singkat. Server juga menegakkannya: angka apa pun yang dikirim
formulir diabaikan selama hari itu punya task. Proyek yang belum memakai task
tetap memakai formulir manual seperti sebelumnya.

### Modul mingguan juga berstruktur

Item mingguan Kepala Divisi kini punya **tag** dan **langkah kerja** (checklist)
seperti task harian, memakai tabel `Subtask` yang sama (migrasi `0008`; satu
baris hanya boleh dimiliki salah satu — task harian atau item mingguan, dijaga
constraint di basis data). Item berstatus Terkendala punya tombol **Eskalasi**
yang masuk ke alur yang sama, dan tombolnya hilang setelah item itu dieskalasi.

### Jadwal yang dapat dikonfigurasi

Ritme pelaporan tidak dipaku di kode:

```
DAILY_CUTOFF_HOUR="17"     # jam kunci harian (WIB)
WEEKLY_CUTOFF_HOUR="17"    # jam kunci mingguan
WEEKLY_HANDOVER_DAY="4"    # 1=Senin .. 7=Minggu — serah terima (default Kamis)
WEEKLY_LOCK_DAY="5"        # kunci mingguan (default Jumat)
```

### Masuk cepat sebagai peran (mode demo)

Halaman login menampilkan tujuh kartu peran yang dapat diklik untuk masuk
**tanpa kata sandi**, berurut dari pelaksana lapangan sampai manajemen. Tiap
kartu menyebut cakupan datanya dan berapa modul yang terbuka.

Ini pintu belakang yang disengaja, jadi dikunci di balik saklar:

```
DEMO_LOGIN="1"     # aktif; kosongkan atau hapus untuk mematikan
```

Tanpa saklar itu, `/api/auth/demo` menjawab 404 dan halaman login kembali ke
formulir kata sandi biasa. **Jangan aktifkan di lingkungan berisi data
sungguhan.** Endpoint-nya juga hanya mengenali tujuh email demo yang di-hardcode,
bukan email sembarang.

### Grafik dashboard Manajemen

Peran Manajemen mendapat enam grafik, masing-masing menjawab satu pertanyaan:

| Grafik | Pertanyaan yang dijawab |
|---|---|
| Arah Kepatuhan 6 Bulan | Apakah grup membaik atau memburuk? |
| Kepatuhan per Sub-Holding | Bagian grup mana yang tertinggal? Pada struktur datar (holding → PT) tiap PT menjadi kelompoknya sendiri. |
| Status Laporan Hari Ini | Bagaimana kondisi pelaporan hari ini? |
| Eskalasi Menunggu Keputusan | Apa yang tertahan, dan sudah berapa lama? |
| Penyerahan Mingguan | Divisi mana yang belum menyerahkan capaian? |
| 10 PT dengan Kepatuhan Terendah | Di mana intervensi paling mendesak? |

Agar terbaca tanpa pelatihan: setiap grafik punya sub-judul berupa pertanyaannya,
satu kalimat penafsiran di bawahnya, tombol **Tabel** untuk membaca angkanya
langsung, dan panduan skala di atas (0–100, target 75).

Warna diambil dari token `.viz` di `globals.css`, divalidasi dengan skrip
pemeriksa palet terhadap permukaan kartu aplikasi ini (`#f9fcff` terang /
`#0b1820` gelap): lolos seluruh pemeriksaan di kedua mode, termasuk keterpisahan
untuk buta warna. Dua warna mode terang berada di bawah rasio kontras 3:1, jadi
grafik yang memakainya wajib membawa label nilai langsung — bukan warna saja.

### Penyimpanan bukti (Supabase Storage)

Bukti bisa berupa **berkas yang diunggah** atau **tautan berlabel**. Berkas disimpan di
bucket **privat** `evidence` (migrasi `0006`), batas 20 MB, terbatas pada gambar, PDF,
dokumen Office, dan teks.

Yang perlu Anda isi sekali:

```
SUPABASE_SERVICE_ROLE_KEY="..."
```

Ambil di **Project Settings → API Keys → service_role**. Kunci ini rahasia dan hanya
dipakai di server — jangan pernah masuk ke kode klien atau ter-commit.

Cara kerjanya:

- Bucket privat tanpa policy RLS. Storage hanya dijangkau dari server memakai service
  role, persis seperti Postgres hanya dijangkau lewat Prisma. Tidak ada kredensial
  Storage yang sampai ke browser.
- Membuka berkas memanggil `GET /api/evidence/[id]` yang memeriksa cakupan entitas
  pemanggil lebih dulu, lalu membuat **signed URL berumur 5 menit**. Tidak ada tautan
  publik permanen.
- Selama `SUPABASE_SERVICE_ROLE_KEY` kosong, unggahan dijawab `503` dengan pesan yang
  menjelaskan langkahnya; lampiran berbentuk tautan tetap berfungsi.
- **Bukti ikut membeku saat laporan dikunci.** Setelah 17.00 WIB (atau Jumat 17.00 untuk
  mingguan), melampirkan dan menghapus bukti dijawab `409` — kalau tidak, jumlah lampiran
  pada laporan yang sudah disegel masih bisa berubah. Membaca bukti lama tetap boleh.
- Batas yang ditegakkan: 20 MB per berkas (`413`), hanya gambar/PDF/Office/teks (`415`),
  berkas kosong ditolak (`422`), dan bukti di luar entitas pemanggil ditolak (`403`).

### Struktur perusahaan (seed 7 Sep 2026)

Seed sekarang membuat **Holding PT Bike** dengan delapan anak perusahaan langsung di
bawahnya — tanpa sub-holding, sektor, atau wilayah:

| Kode | Nama |
|---|---|
| `HOLDING-BIKE` | Holding PT Bike |
| `PT-SIGMA` | PT Sigma (rumah akun demo) |
| `PT-CIPTA` | PT Cipta |
| `PT-FAHREZA` | PT Fahreza |
| `PT-KBI` | PT kBI |
| `PT-SMI` | PT SMI |
| `PT-PRAMBANAN` | PT Prambanan |
| `PT-RATUKARYA` | PT Ratu Karya |
| `PT-SPKD` | PT SPKD |

Tiap PT punya 3 divisi (masing-masing dengan kepala divisi), 2 proyek aktif yang
masing-masing dipegang **satu** PIC, satu Admin PT, dan satu Direktur Entitas.
Alurnya: holding → anak perusahaan → proyek → laporan harian, mingguan, bulanan.

### Laporan kemajuan tiga kadens (7 Sep 2026)

Modul "Laporan Kemajuan" (tab `daily-input`) bertab **Harian / Mingguan / Bulanan**.

- **Harian**: tombol besar **Tambah Progress** membuka dialog layar penuh — judul,
  proyek (dropdown proyek yang dipegang; terkunci bila hanya satu), periode
  pengerjaan (tanggal + jam), PIC pelaksana, subtask, status, **urgensi** (Rendah /
  Sedang / Tinggi / Kritis), kendala, lampiran. Laporan hari yang belum dikunci
  dan belum diteruskan bisa dihapus (`DELETE /api/daily-input?projectId=`).
- **Mingguan & Bulanan**: tabel `ProjectProgressReport` (satu baris per proyek per
  periode). Endpoint `/api/progress-reports` (GET/PUT/DELETE). Mingguan mengunci
  Jumat 17.00 WIB seperti bundel divisi; bulanan mengunci tanggal 3 bulan
  berikutnya pukul 17.00 WIB. Sebelum terkunci, laporan bisa diubah/dihapus.
- Semua laporan menerima lampiran dokumen/foto; **foto tampil sebagai galeri**
  (signed URL 5 menit) saat laporan dibuka.

### Pengajuan proyek (7 Sep 2026)

Admin PT mengajukan lewat pop-up **Ajukan Proyek** (`POST /api/projects`). Proyek
lahir sebagai `DIUSULKAN` dan menjadi `AKTIF` setelah tiga persetujuan lewat
`POST /api/projects/approve`: **Direktur Entitas** (PT yang sama), **Direktur
SDM & GA**, dan **Manajemen**. Satu penolakan → `DITOLAK`. Kartu proyek
menampilkan tiga slot tanda tangan itu. Seed menyertakan satu pengajuan yang
masih menunggu di PT Sigma.

### Pengaturan

Roda gigi di samping tombol tema membuka **Pengaturan**: profil (nama & telepon
bisa diubah sendiri), penempatan (PT / proyek / divisi — diatur TI), dan tema.
Endpoint `GET/PATCH /api/profile`.

## 4. Jalankan aplikasi

```bash
npm install
```

```bash
npm run dev
```

Buka <http://localhost:3000>. Dashboard akan langsung terisi karena data contoh sudah ada
di Supabase.

## 5. Seed ulang (opsional)

Dua cara, hasilnya setara:

```bash
npm run db:seed:sql
```

atau

```bash
npm run db:seed
```

Keduanya **mengosongkan semua tabel** lalu mengisi ulang. Jangan dijalankan di
database produksi yang sudah berisi data asli.

## 6. Keamanan

- Semua tabel sudah **RLS ON tanpa policy**. Artinya Data API Supabase (anon key /
  PostgREST) tidak bisa membaca atau menulis tabel ini. Aplikasi mengakses database
  hanya lewat Prisma di server (role `postgres`, bypass RLS). Ini aman selama
  `DATABASE_URL` hanya ada di server, tidak pernah di client.
- Kalau nanti ingin memakai Supabase Auth + akses langsung dari browser, buat policy
  per tabel terlebih dahulu.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` aman dipublikasikan; `service_role` key tidak.

## 7. Deploy (Vercel)

1. Push repo ke GitHub, import di Vercel.
2. Tambahkan variabel lingkungan yang sama seperti `.env` (termasuk `AUTH_SECRET`
   — buat nilai baru khusus produksi, jangan pakai yang dipakai di lokal).
3. Build command sudah `prisma generate && next build`.
4. Region Vercel terdekat dengan Supabase `ap-southeast-1` adalah `sin1` (Singapore).

## 8. Struktur data singkat

```
Entity (HOLDING → PT; struktur berjenjang SUB_HOLDING/SECTOR/REGION tetap didukung kode tapi tidak dipakai seed)
 ├─ Division ──┐
 ├─ Project ───┤
 ├─ DailyProjectReport (harian, kunci 17:00 WIB)
 ├─ WeeklyDivisionReport → WeeklyReportItem (mingguan, ISO week)
 ├─ Escalation / UnlockRequest / LateIncident / SpotCheck
 └─ KpiSnapshot (BULANAN, periodKey YYYY-MM)
User (peran: ADMIN_PT, KEPALA_DIVISI, DIREKTUR_*, MANAJEMEN, TI, AUDITOR)
Referensi: DivisionType, AspectCategory, Priority, WorkCalendar, Holiday
Log: AuditLog, NotificationLog, Evidence, Note
```

Semua kolom tanggal disimpan UTC; konversi ke WIB ada di `src/lib/wib.ts`.

## 9. Perubahan kode di luar wiring Supabase

Selain memindahkan database, beberapa hal dirapikan agar projek siap dipakai serius:

- **`.env` dikeluarkan dari git.** Sebelumnya file ini ikut terlacak, jadi password
  database yang Anda isi nanti berisiko ter-commit. Sekarang untracked (file tetap ada di
  disk) dan `.gitignore` menahannya; `.env.example` tetap terlacak sebagai template.
- **`next.config.ts`: `typescript.ignoreBuildErrors` dihapus.** Warisan sandbox yang
  membuat build tetap lolos walau ada error tipe. Sekarang error tipe menggagalkan build,
  dan `npx tsc --noEmit` sudah bersih.
- **`tsconfig.json`: folder `examples/` dikecualikan.** Isinya contoh socket.io bawaan
  template yang paketnya tidak terpasang di projek ini, jadi selalu memunculkan error palsu.
- **`src/hooks/use-mobile.ts` ditulis ulang dengan `useSyncExternalStore`**, dan satu
  sinkronisasi awal di `src/components/ui/carousel.tsx` diberi pengecualian lint
  beralasan. Keduanya menghilangkan 2 error `react-hooks/set-state-in-effect` yang sudah
  ada sejak awal, sehingga `npm run lint` bersih.
- **Skrip npm dirapikan** (`dev`/`build`/`start` tidak lagi bergantung pada `bun` dan
  `tee`), ditambah `db:migrate:deploy`, `db:seed`, `db:seed:sql`, `db:studio`.

Sisa dari sandbox yang bisa Anda hapus kapan saja kalau tidak dipakai: `db/custom.db`
(database SQLite lama), `.zscripts/`, `Caddyfile`, `mini-services/`, `examples/`.

## 10. Status verifikasi

Sudah dijalankan dan lolos di mesin ini:

- `npx tsc --noEmit` — bersih.
- `npm run lint` — bersih (0 error).
- `npm run build` — sukses; 1 halaman statis + 17 route API dinamis.
- Skema + seed sudah masuk ke Supabase, terverifikasi lewat query hitung baris
  (24 entitas, 56 pengguna, 40 divisi, 40 proyek, 761 laporan harian, 145 laporan
  mingguan + 719 itemnya, 12 eskalasi, 60 snapshot KPI).

**Belum diverifikasi:** koneksi aplikasi → Supabase secara end-to-end, karena itu butuh
password database yang hanya Anda yang punya. Setelah `.env` diisi, jalankan
`npm run dev` dan buka dashboard untuk memastikan datanya muncul.
