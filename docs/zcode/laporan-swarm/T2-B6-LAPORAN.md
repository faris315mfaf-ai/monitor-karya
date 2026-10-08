# Laporan T2-B6 — Audit kueri N+1 / kueri berulang pada endpoint panas

Dikerjakan Zcode (agen T2-B6), 8 Oktober 2026 sekitar 11.35 WIB. Zona: route/lib dalam daftar cakupan di bawah, `tests/api/**`, dan laporan ini. Cabang `codex/kerja`, tanpa commit.

## Ringkasan tugas

Audit pola kueri N+1 / kueri berulang pada lima endpoint panas dan perbaiki yang jelas aman tanpa perubahan perilaku: `src/app/api/ringkasan/route.ts`, `src/app/api/admin/compliance/route.ts` (+ `src/lib/admin-compliance-server.ts`), `src/app/api/audit-logs/route.ts`, `src/app/api/dashboard/route.ts`, `src/app/api/kadiv/team/route.ts` (+ `src/lib/kadiv.ts` buildTeam). Metode: baca implementasi route dan lib terkait (`src/lib/oversight.ts`, `src/lib/audit-scope.ts`, `src/lib/auth.ts`, `src/lib/admin-compliance.ts`), cari await-di-dalam-loop atas Prisma, findMany per item, count terpisah yang bisa digabung, dan select tanpa batas pada tabel besar.

Hasil: 3 perbaikan terfokus diterapkan, 1 kueri mati dihapus, bentuk jawaban API terbukti identik byte demi byte; temuan lain dilaporkan dengan lokasi dan usulan.

## Temuan

Nomor baris merujuk keadaan berkas sebelum perubahan T2-B6.

### Diperbaiki (3 perbaikan terfokus)

1. **Count mati pada `/api/dashboard`** — `src/app/api/dashboard/route.ts` baris 34 dan 40–45: `db.dailyProjectReport.count` tanpa saringan `isLate` diambil sebagai `todayReports`, tetapi variabel itu tidak pernah dipakai; `summary.reportsToday` pada jawaban berasal dari agregat `kpiSnapshot` (baris 89). Satu COUNT sia-sia pada tabel laporan harian (tabel terbesar bersama AuditLog) setiap permintaan. Dihapus; count `lateToday` yang tersisa tidak bisa digabung karena saringannya berbeda dan keduanya sejajar di Promise.all.
2. **Select eksplisit eskalasi pada `/api/ringkasan`** — `src/app/api/ringkasan/route.ts` baris 144–148: `include` memuat seluruh skalar `Escalation` (`decisionText`, `decidedById`, `decidedAt`, `raisedById`, `entityId`, `createdAt`, `updatedAt` — schema.prisma baris 505–530), padahal hanya `id, sourceType, sourceId, summary, needed, status, raisedAt, slaDays` + `entity{name,code}` + `raisedBy{name}` yang dipakai (pemetaan baris 425–426 dan 441–456). Diganti `select` eksplisit; pemetaan jawaban tidak berubah.
3. **Select eksplisit pada `/api/dashboard`** (pola sama) — baris 53–61: eskalasi `include` → `select` (dipakai hanya `id, summary, status, needed, raisedAt, slaDays` + `entity{name,code,region}`, pemetaan baris 140–152), dan baris 19 `entity.findUnique` cakupan kini `select: { path: true }` (hanya `path` dipakai).

### Ditunda (dengan lokasi dan usulan)

4. **Tulisan per item pada `remindTeam`** — `src/lib/kadiv.ts` baris 578–605: `await db.notificationLog.create` + `await db.auditLog.create` di dalam loop per proyek target pada POST `/api/kadiv/team` (aksi `remind`) = 2N tulisan berurusan. Usulan: kumpulkan payload lalu `createMany` keduanya dalam `$transaction`. Ditunda karena mengubah semantik kegagalan sebagian (hari ini sebagian pengingat bisa terkirim sebelum galat) dan ini jalur tulis, bukan GET panas.
5. **Resolusi cakupan berulang** — `src/lib/auth.ts` baris 320–321: `scopeUserIds` memanggil `scopeEntityIds` lagi dari dalam. Pada `/api/ringkasan`, peran berlingkup (mis. DIREKTUR_ENTITAS) me-resolve subtree entitas 3 kali per permintaan (route baris 109; baris 159 lewat `scopeUserIds`; baris 278 lewat `decidableWhere` → `src/lib/oversight.ts` baris 93) — setiap resolve = `entity.findUnique` + `entity.findMany`, jadi sampai 6 kueri entitas sia-sia. Usulan: parameter opsional ids prahitung pada `scopeUserIds`/`decidableWhere`, atau memo per permintaan (AsyncLocalStorage). Menyentuh `auth.ts`/`oversight.ts` yang dipakai banyak route di luar cakupan — perlu koordinasi zona sebelum digarap.
6. **Minor (CPU/latensi, bukan jumlah kueri)** — `src/app/api/ringkasan/route.ts` baris 634: `projects.find(...)` per baris di dalam `rows.map` (O(n²) di memori; bisa Map). Baris 250–264: `user.count` dan `attendance.groupBy` sekuensial, bisa `Promise.all`. `src/lib/kadiv.ts` baris 278–282 (`buildTeam`): `divisionProjects` dan kueri anggota di `teamUserIds` sekuensial padahal saling bebas (bisa paralel); total `buildTeam` ~19 kueri per GET tetapi sudah terkelompok dalam tiga tahap Promise.all dan tanpa kueri per item.
7. **`/api/dashboard` lateIncident setelah Promise.all** — baris 78–84 berjalan sekuensial karena memakai `entities.map(...)` saat berlingkup; `LateIncident` tidak punya relasi `entity` sehingga tidak bisa difilter `path` langsung. Tanpa `pathPrefix` kueri ini sebenarnya bebas; pindahan hanya menghemat latensi kecil, ditunda.

### Diperiksa, tanpa tindakan

- **`/api/audit-logs`**: `findMany` + `count` sudah paralel (baris 83–94). `include: { actor }` memuat semua skalar AuditLog, tetapi pemetaan jawaban (baris 96–108) memakai seluruh 10 skalar model (schema.prisma baris 560–575) — select eksplisit tidak menghemat apa pun.
- **`/api/admin/compliance` + `admin-compliance-server.ts`**: `loadCompliance` menggabung semua bacaan dalam dua kelompok `Promise.all` (baris 88 dan 93–119); hitungan per divisi murni di memori lewat `tallyDay`. `resolveEntityScope` dua kueri kecil sekuensial (baris 240–245) — wajar, bukan N+1.
- **`buildTeam` (GET `/api/kadiv/team`)**: tidak ada kueri per anggota; semua filter keanggotaan, beban kerja, dan peta panas dilakukan di memori atas hasil batch.
- **`shapeApprovals`** (`src/lib/oversight.ts` baris 134–147): nama/entitas/divisi/proyek diambil satu kueri per tabel lewat `Promise.all`, bukan per item. Sudah benar.

## Bukti perilaku sama

Dua lapis, tanpa menyentuh basis data sungguhan:

1. **Perbandingan jawaban sebelum/sesudah**: dump JSON lengkap `GET /api/dashboard`, `GET /api/dashboard?scopeEntityId=pt-a`, dan `GET /api/ringkasan` di atas fixture `tests/api/admin-fake-db.ts` dengan waktu tetap (2026-10-06T03:00Z), dijalankan pada kode lama (dua berkas route di-stash sementara lewat git, lalu di-pop kembali; tanpa commit) dan kode baru. `diff` kedua dump: identik byte demi byte.
2. **Tes regresi** `tests/api/dashboard-ringkasan.test.ts` (5 tes, pola sesuai admin-*.test.ts: mock `@/lib/db` + sesi sungguhan):
   - `dailyProjectReport.count` dipanggil tepat satu kali dan hanya dengan `isLate: true` — bila count mati kembali diperkenalkan, tes gagal;
   - kunci `summary` dan kunci tingkat atas jawaban `/api/ringkasan` terkunci urut;
   - `escalation.findMany` menerima `select` (tanpa `include`) dengan kolom persis seperti pemetaan;
   - objek eskalasi pada jawaban diperiksa utuh terhadap fixture yang **mengisi kolom yang kini tidak diambil** (`decisionText`, `decidedById`, `decidedAt`) dengan nilai iseng — bila route ternyata membutuhkan salah satunya, pemetaan menghasilkan undefined dan tes gagal;
   - `?scopeEntityId=` memanggil `entity.findUnique` dengan `select: { path: true }` dan penyaringan subtree tetap bekerja.

Penyesuaian kecil fixture: `tests/api/admin-fake-db.ts` menambah `raisedBy: 'user'` pada `REL_MODEL` (relasi to-one `Escalation.raisedBy`, kunci asing `raisedById` sesuai konvensi) agar `select raisedBy` dapat ditiru. Tidak mengubah perilaku fixture lain.

## Berkas yang diubah/dibuat

- `src/app/api/dashboard/route.ts` — ubah (hapus count mati, select eskalasi, select path).
- `src/app/api/ringkasan/route.ts` — ubah (select eskplisit eskalasi).
- `tests/api/admin-fake-db.ts` — penyesuaian kecil (REL_MODEL `raisedBy`).
- `tests/api/dashboard-ringkasan.test.ts` — baru (5 tes regresi).
- `docs/zcode/laporan-swarm/T2-B6-LAPORAN.md` — laporan ini.

Tidak menyentuh `prisma/schema.prisma`, migrasi, port, kontainer, atau worktree lain. Perubahan T2-B1 (schema + migrasi 0029) yang belum ter-commit ada di pohon kerja yang sama dan tidak diganggu; tsc lulus dengan keadaan itu.

## Perintah uji yang dijalankan

- `npx vitest run tests/api` → `Test Files 27 passed (27)`, `Tests 618 passed (618)` (sebelum T2-B6: 26 berkas; 5 tes baru ikut terhitung).
- `DATABASE_URL='postgresql://x:y@127.0.0.1:1/db' DIRECT_URL='postgresql://x:y@127.0.0.1:1/db' npx tsc --noEmit --incremental false` → tanpa galat.

## Keterbatasan dan batas pembuktian

- Bukti "perilaku sama" berlaku untuk bentuk jawaban (fixture + penelusuran pemakaian field), bukan uji beban produksi; waktu kueri nyata tidak diukur (tanpa jaringan eksternal/Supabase sesuai batasan).
- Dampak nyata perbaikan: hilangnya satu COUNT per permintaan `/api/dashboard` pada tabel laporan harian, dan pengurangan kolom pada dua kueri eskalasi (tabel kecil-berjalan, dampak transfer data, bukan jumlah baris).
- Temuan 4–7 ditunda dengan alasan masing-masing; nomor 5 butuh koordinasi zona karena menyentuh `auth.ts`/`oversight.ts` bersama.

## Usulan integrasi untuk parent

- Terima tiga perbaikan + tes (tanpa risiko bentuk jawaban; terbukti identik).
- Backlog: memo resolusi cakupan per permintaan (temuan 5, berlaku untuk semua endpoint pemantau) dan keputusan semantik transaksi untuk `remindTeam` (temuan 4).
