# Laporan T10-FIX2 — Otorisasi API + konsistensi IP audit

Agen perbaik T10-FIX2, 10 Oktober 2026. Memperbaiki 4 kelompok temuan dari
`docs/zcode/laporan-swarm/T10-AUD1-API.md` (T-1, T-2, S-4/S5-IP, S-1/S3-dailyGate).
Tanpa git (commit), tanpa basis data, tanpa gradle.

## Ringkasan perubahan

| Temuan | Berkas | Perbaikan |
| --- | --- | --- |
| T-1 TINGGI | `src/lib/pic-access.ts` + 8 route pemantauan | Irisan peran pelaksana (PIC/kepala divisi) pada endpoint pemantauan; redaksi kontak kepala divisi untuk PIC; gerbang 403 untuk dasbor agregat |
| T-2 TINGGI | `src/app/api/tasks/route.ts`, `src/app/api/progress-reports/route.ts` | GET memakai `guardProjectAccess(READ_RELATIONS)` — kepala divisi hanya proyek divisinya |
| S-4 (IP) SEDANG | 21 route + `src/lib/pic-access.ts` + `src/lib/undo.ts` | Semua pembacaan entri PERTAMA `x-forwarded-for` diganti `clientIp(req)` (entri terakhir/x-real-ip) |
| S-1 (dailyGate) SEDANG | `src/app/api/tasks/route.ts` (rute pemanggil) | Settings harian dibaca dari entityId PROYEK — lihat koordinasi di bawah |

## T-1 — Endpoint pemantauan kini beririsan peran

Tiga helper baru di `src/lib/pic-access.ts` (berdampingan dengan `projectScopeWhere`
dan `kadivProjectWhere` yang sudah ada):

- `performerProjectScope(user)` — saringan `Project` untuk baris berelasi proyek:
  PIC → `{ picUserId: user.id }`; kepala divisi → `kadivProjectWhere` (proyek divisi
  yang dipimpin, termasuk proyek tanpa divisi yang PIC-nya anggota divisinya);
  `null` untuk peran pemantau (cakupan entitas/grup tetap dari `scopeEntityIds`).
- `performerDivisionScope(user)` — saringan `Division` untuk baris berelasi divisi:
  kepala divisi → divisi aktif yang dipimpinnya; PIC → divisi keanggotaannya;
  `null` untuk peran pemantau.
- `refusePerformer(user, message?)` — 403 untuk PIC/kepala divisi pada endpoint
  pemantauan agregat yang tidak punya dimensi proyek/divisi untuk diiris.

Per route (urutan pengerjaan sesuai sensitivitas):

1. **`/api/daily-reports`** (paling sensitif — isi laporan rekan): where ditambah
   `AND: [{ project: performerProjectScope(user) }]` untuk PIC/KADIV; saringan
   `search`/`projectId`/`entityId` dan cakupan entitas lainnya tidak berubah.
2. **`/api/ringkasan`**:
   - `projects`, `proposals` (DIUSULKAN), `recentReports` (tren), `progressHistory`
     (otomatis lewat projectIds), `outputs`, `reviewRows`, `deadline` → irisan proyek.
   - `divisions` (count + baris), `weekly` (minggu berjalan), `reportWeekly`
     (minggu laporan), `commentRows`, `kadivSummaries` → irisan divisi.
   - Eskalasi difilter pasca-ambil lewat pemetaan sumber: DAILY_REPORT dan TASK →
     proyek dalam cakupan; WEEKLY_ITEM → divisi dalam cakupan. (Pemetaan sumber
     TASK ditambahkan — `sourceType` memang bernilai `TASK` untuk eskalasi dari
     task, lihat `/api/escalations/actions`.) `esc` dan `escByProject` ikut hasil
     yang sudah difilter.
   - `activity` (jejak audit) dan `attendance` → untuk peran pelaksana hanya
     tentang akunnya sendiri (`[user.id]`), bukan seluruh akun PT.
   - `divisions[].head`: `email`/`phone` menjadi `null` bila pemanggil
     `PIC_PROYEK` (baris ~604 lama). Tipe klien sudah `string | null`.
   - `approvalRequests` tetap aman: `decidableWhere` mengembalikan null untuk
     PIC/KADIV (bukan pemutus persetujuan).
3. **`/api/weekly-reports`**: `AND: [{ division: performerDivisionScope(user) }]`
   untuk PIC/KADIV. Catatan perilaku yang disengaja: tab Divisi kepala divisi
   (DivisionsView) kini hanya menampilkan laporan mingguan divisinya sendiri,
   bukan semua divisi PT — sesuai maksud temuan ("kepala divisi yang ingin
   mengintip divisi lain"). Alur Admin PT (`?for=unlock`, meja kerja) tidak
   berubah.
4. **`/api/entity-activity`**: `projects`/`tasks`/`dailyReports`/`progressReports`
   → irisan proyek; `divisions`/`weeklyReports` → irisan divisi.
5. **`/api/escalations` GET**: irisan dikerjakan di tingkat kueri (paginasi dan
   `total` tetap benar) dengan mengumpulkan dulu id sumber dalam cakupan: id
   laporan harian proyek terlingkup, id butir mingguan divisi terlingkup, dan
   `Task.escalationId` proyek terlingkup.
6. **`/api/dashboard`**, **`/api/late-incidents`**, **`/api/management-charts`**:
   data agregat entitas tanpa relasi proyek/divisi → gerbang `refusePerformer`
   (403 untuk PIC/kepala divisi; Admin PT dan Direktur Entitas tetap lolos untuk
   PT-nya). Dipastikan lebih dulu bahwa ketiganya tidak dipanggil UI peran
   PIC/KADIV (dasbor peran memakai `/api/my-dashboard`; tidak ada pemanggil
   frontend untuk `/api/dashboard` dan `/api/late-incidents`).

## T-2 — Baca task & laporan kemajuan memakai relasi penuh

- `GET /api/tasks` dan `GET /api/progress-reports`: `guardProject(user, projectId,
  { write: false })` diganti `guardProjectAccess(user, projectId, READ_RELATIONS)`
  dari `src/lib/pic-access.ts` — kepala divisi kini hanya membaca task/laporan
  kemajuan proyek divisinya (cermin perilaku `/api/outputs`), PIC tetap proyeknya
  sendiri, pemantau berlingkup entitas tetap lolos lewat relasi `VIEWER`.
- Jalur tulis (POST/PUT/PATCH/DELETE) tidak diubah: tetap `guardProject(write)`
  + kapabilitas `daily:input`.
- Efek samping yang disengaja: proyek kosong `projectId` kini ditolak 400
  "Proyek wajib dipilih" (sebelumnya 404); respons `project` pada GET
  progress-reports memakai bentuk `AccessProject` (field `code` tidak terkirim —
  diperiksa: frontend hanya membaca `id` dan `name`).

## S-4/S5 — IP jejak audit memakai `clientIp()`

Semua pola `req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null`
(entri PERTAMA, bisa diisi klien) diganti `clientIp(req)` dari `src/lib/security`
(yang membaca `x-real-ip` lalu entri TERAKHIR — yang ditambahkan proxy tepercaya
terdekat). Menyangkut (pola sama di seluruh berkas ditemukan lewat grep):

`access-requests`, `admin/compliance/remind`, `admin/reminder-rules`,
`audit-logs/export`, `auth/logout`, `companies`, `companies/users`,
`daily-input`, `escalations`, `escalations/actions`, `evidence/[id]`, `inbox`,
`kadiv/weekly-summary`, `profile`, `progress-reports`, `projects`,
`projects/approve`, `ringkasan/laporan-dibaca`, `tasks`, `unlock-requests`,
`weekly-input`, `work-desk`, helper `auditPic` di `src/lib/pic-access.ts`, dan
`src/lib/undo.ts` (varian `req?.`).

Tes `tests/api/pic-outputs.test.ts` yang mengodekan perilaku lama (mengasersi
entri pertama `10.0.0.9` dari header `"10.0.0.9, 10.0.0.1"`) diperbarui mengikuti
semantik `clientIp` (entri terakhir `10.0.0.1` yang dicatat), dengan komentar.

## S-1/S3 — dailyGate menerima entityId dari PROJECT (koordinasi dengan FIX1)

`src/lib/daily-rollup.ts` SUDAH diubah FIX1 secara bersamaan (dailyGate membaca
entityId proyek saat baris laporan belum ada, mengembalikan `gate.settings`,
dan `rollupDailyReport` memakai `gate.settings`). Sesuai instruksi koordinasi,
lib tidak disentuh lagi; yang disesuaikan rute pemanggilnya:

- `src/app/api/tasks/route.ts` `lockCheck`: `getReportSettings(null)` (masih
  berkomentar TODO) diganti `gate.settings` — settings kini datang dari entityId
  proyek tanpa kueri tambahan.
- `src/app/api/tasks/route.ts` POST: `getReportSettings(null)` diganti
  `getReportSettings(guard.project.entityId)` — hari kerja kustom PT berlaku
  sejak task pertama; pesan galat disesuaikan ("hari pelaporan entitas ini").
- `src/app/api/daily-input/route.ts` baris ~453: melengkapi argumen `now` pada
  `isDailyLockedWith(...)` yang sedang setengah-jalan diedit FIX1 agar tsc
  bersama kembali hijau (satu argumen, di zona FIX1).

## Uji

- `DATABASE_URL=postgresql://x:y@127.0.0.1:1/db DIRECT_URL=same npx tsc
  --noEmit --incremental false` — bersih (termasuk perubahan FIX1/FIX3 yang
  bersamaan di worktree).
- `npx vitest run tests/api tests/security` — 34 berkas / 703 tes lulus.
- `npx eslint` pada seluruh berkas yang diubah — bersih.

Tes regresi baru:

- `tests/api/daily-reports.test.ts` — PIC hanya laporan proyeknya; kepala divisi
  hanya laporan proyek divisinya (fixture baru `prj-a3` di divisi tanpa kepala);
  peran pemantau entitas tetap melihat seluruh PT-nya.
- `tests/api/dashboard-ringkasan.test.ts` — ringkasan PIC (proyek sendiri,
  kontak kepala divisi dinolkan, eskalasi rekan tidak tampil, aktivitas hanya
  dirinya); ringkasan kepala divisi (proyek + divisi yang dipimpin, kontak
  miliknya tetap utuh); `/api/dashboard` 403 untuk PIC/kepala divisi dan 200
  untuk Admin PT.

## Koordinasi worktree

Agen lain aktif bersamaan di worktree yang sama: FIX1 (`daily-rollup.ts`,
`daily-input`, `weekly-input`, `tasks` pesan kunci, `lock.ts`) dan FIX3
(`sw.js`, `proxy.ts`, `skrip superadmin`). Tumpang tindih yang saya sentuh
hanya dua titik kecil di zona mereka (argumen `isDailyLockedWith` di
daily-input; tasks `lockCheck` memang instruksi koordinasi tugas ini). Sisa
perubahan pada `git status` adalah milik agen-agen itu.
