# T10-AUD1 — Audit keamanan API routes Monitor Karya

Tanggal: 10 Oktober 2026 · Mode: BACA-SAJA (tidak ada kode diubah)
Zona: seluruh 74 route di `src/app/api/**` + lib pendukung yang dipakai pagarnya
(`auth.ts`, `rbac.ts`, `pic-access.ts`, `evidence-access.ts`, `account-desk.ts`,
`oversight.ts`, `kadiv.ts`, `storage.ts`, `undo.ts`, `unlock-requests.ts`,
`account-activation.ts`, `report-settings.ts`, `daily-rollup.ts`, `security.ts`,
`api-error.ts`, `cron-auth.ts`, `operational-health.ts`, `audit-scope.ts`).

## Ringkasan

| Severity | Jumlah |
|---|---|
| KRITIS | 0 |
| TINGGI | 2 |
| SEDANG | 6 |
| RENDAH | 7 |

Tidak ditemukan temuan KRITIS: tidak ada route sensitif tanpa autentikasi
(semua route non-auth — login, activate, logout, health, cron — memakai
secret/cookie/rate-limit yang benar), tidak ada `passwordHash`/token yang bocor
ke respons, dan mayoritas route meniru pola pagar yang sudah benar
(`requireApiUser` → `can(role,…)` → `scopeEntityIds/refuseUnscoped` →
`guardProjectAccess`/relasi objek). Sesi berbasis HMAC + tabel `AuthSession` +
sidik kata sandi, transaksi `FOR UPDATE` di jalur tulis laporan, dan
pembandingan rahasia waktu-konstan semuanya rapi.

Temuan terbesar ada di keluaskan baca (over-read) untuk peran berlingkup pada
endpoint pemantauan, dan pada penerapan aturan kunci per-entitas yang hanya
dibaca setelah baris laporannya ada.

---

## Temuan

### T-1 [TINGGI] Endpoint pemantauan tidak berpagar peran — PIC & kepala divisi bisa membaca seluruh PT

Berkas:baris (semua GET, hanya `requireApiUser` + `scopeEntityIds`/`refuseUnscoped`, tanpa cek peran dan tanpa relasi objek):

- `src/app/api/ringkasan/route.ts:118` — paling kaya: semua proyek PT (termasuk `lastNote` = isi capaian harian PIC lain, `escalations` per proyek), email+telepon semua kepala divisi (`divisions[].head`, baris 604), ringkasan mingguan + points setiap divisi, agregat kehadiran/cuti, aktivitas audit semua akun PT, dan `deadlineProposals` semua proyek.
- `src/app/api/daily-reports/route.ts:8` — isi penuh laporan harian (`achievementToday`, `obstacle`, `followUp`) semua proyek di PT + nama/email pengirim.
- `src/app/api/weekly-reports/route.ts:7` — seluruh item mingguan semua divisi.
- `src/app/api/entity-activity/route.ts:35` — semua task (judul, kendala, keputusan yang diminta), laporan harian & mingguan seluruh PT.
- `src/app/api/escalations/route.ts:9`, `src/app/api/late-incidents/route.ts:10`, `src/app/api/management-charts/route.ts:42`, `src/app/api/kpi-trends/route.ts:20`, `src/app/api/compliance-map/route.ts:9`, `src/app/api/dashboard/route.ts:7` — data lintas divisi/PT dalam cakupan entitas.

Skenario eksploitasi: akun PIC_PROYEK (atau kepala divisi yang ingin mengintip divisi lain — `ROLE_TABS` PIC/KADIV memang tidak punya tab-tab ini) memanggil langsung `GET /api/ringkasan` / `GET /api/daily-reports?pageSize=200` dan mendapat capaian, kendala, status terlambat, serta kontak (email/telepon) rekan satu PT di luar proyeknya. Basis kode sendiri sudah menganggap ini bukan hak PIC: `projectScopeWhere` (pic-access.ts:151) membatasi PIC ke proyeknya, `/api/search` mengecualikan PIC dari pencarian orang (search/route.ts:38-60), dan `/api/unlock-requests` GET khusus membatasi PIC/KADIV "hanya miliknya sendiri, bukan seluruh PT" (route.ts:39) — jadi ini inkonsistensi pagar, bukan keputusan desain yang sadar.
Usulan perbaikan: tambahkan gerbang peran (`group:read`/peran pemantau + ADMIN_PT/DIREKTUR_ENTITAS untuk PT-nya) atau iris cakupan dengan `projectScopeWhere`/divisi-yang-dipimpin pada endpoint pemantauan di atas.

### T-2 [SEDANG→TINGGI bila T-1 dianggap by-design] Baca lintas divisi pada objek proyek di route task & laporan kemajuan

Berkas:baris:

- `src/app/api/tasks/route.ts:58-89` — `guardProject` write=false: `KEPALA_DIVISI`/`DIREKTUR_ENTITAS` dengan `scopeEntityId` sama dianggap `owns` → bisa GET task (judul, `obstacle`, `decisionNeeded`, subtask) proyek divisi lain di PT-nya.
- `src/app/api/progress-reports/route.ts:52-76` — pola sama; `guardProject(write=false)` mengizinkan KADIV membaca laporan kemajuan mingguan/bulanan semua proyek di PT-nya.

Skenario: kepala divisi A memanggil `GET /api/tasks?projectId=<proyek divisi B>` dan membaca detail kendala kerja divisi B. (Bandingkan: `/api/outputs` memakai `guardProjectAccess(READ_RELATIONS)` yang benar membatasi KADIV ke `projectDivisionIds`.)
Usulan perbaikan: ganti guard baca task/progress ke `guardProjectAccess(user, projectId, READ_RELATIONS)` dari `pic-access.ts` sehingga KADIV hanya membaca proyek divisinya.

### S-1 [SEDANG] Kebijakan kunci harian per-entitas tidak berlaku untuk laporan/task pertama hari itu

Berkas:baris:

- `src/lib/daily-rollup.ts:249-263` — `dailyGate` memuat `getReportSettings(report?.entityId ?? null)`; saat baris laporan belum ada (pengiriman pertama hari itu) dipakai `DEFAULT_SETTINGS` (buka sampai 17.00), sehingga `dailyCutoffHour` kustom dinihilkan dan `dailyOpen=false` (PT menutup pelaporan) tetap menerima laporan BARU sebelum 17.00.
- `src/app/api/tasks/route.ts:104` dan `:363` — `getReportSettings(null)` (ada komentar TODO sendiri) untuk `isWorkingDayWith` task harian: hari libur kustom PT bisa diisi task; `dailyOpen=false` tidak dicek sama sekali untuk task baru.

Skenario: Admin PT menutup pelaporan harian (`dailyOpen=false`) di `/api/admin/report-settings`, tetapi PIC tetap bisa mengirim laporan harian baru (PUT `/api/daily-input`) atau menambah task (POST `/api/tasks`) sebelum pukul 17.00 karena settings hanya diterapkan setelah baris laporan ada.
Usulan perbaikan: teruskan `entityId` proyek ke `dailyGate`/`lockCheck` (muat settings via `project.entityId` sebelum memakai default) sehingga cutoff/hari-kerja/isian-terbuka per-entitas berlaku sejak tulisan pertama.

### S-2 [SEDANG] `summary`/`obstacle`/`followUp` laporan kemajuan tidak dibatasi panjangnya

Berkas:baris: `src/app/api/progress-reports/route.ts:170-172` — ketiga field diambil mentah dari body tanpa `cleanText`/`slice` (bandingkan `daily-input` 355-363 dan `tasks` readBody yang memotong 2000-4000); `validateProgressReport` (lock.ts:314) juga tidak mengecek panjang.
Skenario: klien mengirim `summary` sebesar 20 MB berkali-kali → menyimpan string raksasa ke DB + jejak audit; beban penyimpanan dan kueri (laporan ini ikut dibaca `/api/entity-activity`).
Usulan perbaikan: pangkas ketiga field dengan `cleanText` (mis. 4000/2000/2000) seperti route laporan lain.

### S-3 [SEDANG] Galat Prisma tidak tertangani di route tanpa try/catch → 500 mentah & foreign-key bisa ditembak

Berkas:baris:

- `src/app/api/progress-reports/route.ts:134-227, 229-278` — PUT/DELETE tanpa try/catch; galat tak terduga lempar ke handler Next (di pengembangan pesan/stack bisa terkirim ke klien).
- `src/app/api/weekly-input/route.ts:365-403` — `aspectCategoryId`/`priorityId` tidak diverifikasi ada (PUT), FK invalid → P2003 → 500 tanpa pesan berguna.

Skenario: klien mengirim `aspectCategoryId: "tes"` → 500 dari Prisma alih-alih 422; di mode dev isi galat membocorkan nama tabel/kolom.
Usulan perbaikan: validasi keberadaan `aspectCategoryId`/`priorityId` (seperti `divisionId` di `projects` readFields) dan bungkus handler dengan `serverError()`.

### S-4 [SEDANG] IP jejak audit bisa dipalsukan (entri PERTAMA `x-forwarded-for`)

Berkas:baris: `src/lib/security.ts:36-51` sendiri menegaskan entri TERAKHIR `x-forwarded-for` yang dipercaya (tambalan T2-S2-S1) dan menyediakan `clientIp()`; namun ~15 route masih mencatat entri PERTAMA yang bisa diisi klien: `src/app/api/access-requests/route.ts:30`, `admin/compliance/remind:98`, `tasks:399,495,604,649`, `projects:379,438,499,565`, `companies:214,269,325`, `companies/users:102,262,307`, `inbox:164,227`, `escalations/actions:154,227`, `evidence/[id]:81`, `profile:119`, `daily-input:41,473`, `unlock-requests:23`, `weekly-input:466,546,612,747`, `work-desk:417`, `audit-logs/export:122`, dan helper `pic-access.ts:246` (`auditPic`).
Skenario: pengguna menambah header `X-Forwarded-For: 1.2.3.4` pada permintaan tulis; jejak audit & log kepatuhan mencatat IP orang lain — menyesatkan investigasi (audit trail adalah fitur kepatuhan inti produk ini).
Usulan perbaikan: ganti semua `req.headers.get('x-forwarded-for')?.split(',')[0]` menjadi `clientIp(req)` dari `src/lib/security.ts`.

### S-5 [SEDANG] Race kecil pada klaim "belum ada" (read-then-create tanpa constraint/kunci)

Berkas:baris:

- `src/app/api/escalations/actions/route.ts:122-141` — cek `findFirst` eskalasi berjalan lalu `create`; dua POST bersamaan → dua eskalasi untuk sumber yang sama (dan `Task.escalationId` menimpa).
- `src/app/api/unlock-requests/route.ts:104-113` — cek permintaan terbuka lalu create; dua POST bersamaan → dua permintaan DIAJUKAN untuk laporan yang sama (eksekusi keduanya membuka kunci dua jam ganda).
- `src/app/api/access-requests/route.ts:182-200` — cek bentrok username/duplikat di luar transaksi create; dua pengajuan `AKUN_BARU` bersamaan lolos cek duplikat (keputusan PATCH tetap aman karena `updateMany` klaim status).
- `src/app/api/projects/route.ts:340-344` — generator kode proyek count-then-check di luar transaksi; dua POST bersamaan → kode sama → P2002 → 500.

Skenario: dua tab/dua akun menekan "ajukan" bersamaan; hasil ganda masuk antrean keputusan.
Usulan perbaikan: bungkus cek+create dalam `$transaction` dengan `FOR UPDATE` pada baris sumber (atau constraint unik parsial `sourceType+sourceId status aktif` untuk eskalasi).

### R-1 [RENDAH] `/api/projects?options=1` membocorkan daftar seluruh PT ke semua pengaju

Berkas:baris: `src/app/api/projects/route.ts:156-160` — `entities` (id, kode, nama semua PT aktif) dikembalikan ke semua peran dengan `project:propose` (termasuk PIC & auditor); kandidat PIC+email hanya untuk entitas terpilih.
Skenario: PIC memetakan struktur grup lewat respons opsi formulir.
Usulan perbaikan: kirim `entities` hanya untuk peran dengan `group:read`/master; peran berlingkup cukup `entity` pinjannya.

### R-2 [RENDAH] `/api/admin/report-settings` GET tanpa gerbang peran & PUT tanpa jejak audit

Berkas:baris: `src/app/api/admin/report-settings/route.ts:9-20, 23-58` — GET dapat dipanggil peran apa pun untuk entitasnya (isi tidak sensitif, tapi tidak ada cek peran); PUT (dibatasi kapabilitas) tidak menulis AuditLog, padahal mengubah kebijakan kunci pelaporan.
Usulan perbaikan: batasi GET ke peran berterusan (`daily:input`/`audit:read`) dan catat `UPDATE_REPORT_SETTINGS` di AuditLog.

### R-3 [RENDAH] `notifications` PATCH menerima array `ids` tanpa batas jumlah

Berkas:baris: `src/app/api/notifications/route.ts:102-111` — `ids` difilter string tetapi tidak dibatasi (mis. `.slice(0,200)`); `id IN (…)` raksasa membebani kueri.
Skenario: skrip mengirim 100.000 id → kueri berat (meski hanya baris milik sendiri).
Usulan perbaikan: batasi `ids` maksimal 200 seperti pola di route lain.

### R-4 [RENDAH] `daily-reports`/`weekly-reports`/`escalations`: parameter `search`/`status` tak dipangkas panjang

Berkas:baris: `src/app/api/daily-reports/route.ts:19,48`, `weekly-reports:16`, `escalations:16-18` — string kueri masuk filter `contains`/equality tanpa `slice`; bukan celah akses, hanya beban kueri tak perlu.
Usulan perbaikan: pangkas ke 64-128 karakter dan validasi enum status.

### R-5 [RENDAH] `project-stages` POST: batas 20 tahap bisa terlampaui race

Berkas:baris: `src/app/api/project-stages/route.ts:98-105` — `count >= MAX_STAGES` dicek di luar transaksi; dua POST bersamaan menghasilkan 21+ tahap.
Usulan perbaikan: pindahkan cek ke dalam transaksi dengan kunci proyek (`SELECT … FOR UPDATE` pola `lockDailyProject`).

### R-6 [RENDAH] `progress-reports` PUT: dua kiriman periode sama bersamaan → 500 P2002

Berkas:baris: `src/app/api/progress-reports/route.ts:158-211` — read-then-create tanpa penanganan P2002 (bandingkan `daily-input/route.ts:329` yang mengubahnya jadi 409 ramah).
Usulan perbaikan: tangkap `P2002` dan balas 409 "simpan bersamaan, muat ulang".

### R-7 [RENDAH] `companies/users` PATCH: `name/username/email/title/phone` dipangkas 500 karakter, `title/phone` tanpa format

Berkas:baris: `src/app/api/companies/users/route.ts:142-169` — hanya gaya; tidak ada celah akses. `phone` bebas bentuk (bandingkan validasi `profile` PATCH).
Usulan perbaikan: pakai validator `phone` yang sama dengan `/api/profile`.

---

## Yang sudah benar (patut dipertahankan)

- **Autentikasi & sesi** (auth.ts): token HMAC + tabel sesi dicabut, sidik kata sandi mematikan sesi lama saat ganti sandi, baris akun dibaca ulang tiap permintaan (deaktivasi/peran baru langsung berlaku), cookie `__Host-` + httpOnly + SameSite=Lax, `mustChangePassword` memblokir semua route kecuali `/api/profile/password`.
- **Kebocoran data**: `passwordHash` selalu ditanggalkan (`companies` GET, `system` GET → `hasPassword`); notifikasi hanya milik sendiri; `/api/roles` hanya peran global; bukti berkas hanya lewat URL bertanda tangan 5 menit setelah cek cakupan (`evidence-access.ts`).
- **IDOR**: pola guard relasi (`guardProjectAccess`, `canWriteEvidence`, `canRecordFor`, `canManageDivision`, `deskReachError`, `weeklyRelation`, `applyUndo` actor-bind) konsisten menolak luar cakupan dengan 404/403.
- **Race tulis laporan**: transaksi ReadCommitted + `SELECT … FOR UPDATE` (`lockDailyProject/lockDailyReport`, `projects/approve`, `inbox` POST, `kadiv/weekly-summary`), klaim bersyarat `updateMany` untuk penerusan/persetujuan/urungkan, dan P2002 → 409.
- **Validasi input**: umumnya ketat — panjang per kolom, enum status, tanggal WIB, ID ≤64, rate limit (login, pengingat, ekspor audit, cari, tanggapan), magic-byte MIME + ekstensi + nama aman untuk unggahan, body JSON dibatasi ukuran pada laporan operasional.
- **Error handling**: `serverError/clientErrorMessage` (api-error.ts) menahan pesan Prisma/ internal; login menyeragamkan pesan akun-salah dan timing.
- **Cron & health**: `refuseCron`/`refuseOperational` (secret ≥16/32, perbandingan waktu-konstan, secret terpisah), heartbeat audit-log gagal-tertutup, laporan backup hanya menerima payload tetap.

## Prioritas tindak lanjut

1. T-1 + T-2: satu patch gerbang peran/relasi pada ~12 endpoint GET pemantauan.
2. S-1: oper `dailyGate`/`lockCheck` menerima `entityId` proyek.
3. S-4: migrasi semua `x-forwarded-for[0]` → `clientIp()`.
4. S-2 + S-3: pangkas panjang + try/catch + validasi FK di progress-reports/weekly-input.
5. S-5: transaksi pada cek-duplikat eskalasi/buka-kunci/pengajuan akun/kode proyek.
