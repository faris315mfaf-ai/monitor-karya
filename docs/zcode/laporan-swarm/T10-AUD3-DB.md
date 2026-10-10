# T10-AUD3 — Audit Database/Prisma Monitor Karya

Agen: T10-AUD3 (pemburu bug database/Prisma). Mode: baca-saja.
Zona: `prisma/schema.prisma`, `prisma/migrations/**`, `src/lib/db.ts`, `src/lib/report-settings.ts`, `src/lib/daily-rollup.ts`, `src/lib/lock.ts`, `src/lib/undo.ts`, `src/lib/access-requests.ts`, plus rute konsumen langsung (daily-input, tasks, evidence, inbox, escalations, weekly-input, access-requests, admin/report-settings) untuk memverifikasi dampak runtime.
Tanggal: 10 Oktober 2026. Cabang: `codex/kerja` @ `c7052a3`.

## Ringkasan

| Tingkat | Jumlah |
|---|---|
| TINGGI | 4 |
| SEDANG | 8 |
| RENDAH | 9 |

Benang merah terbesar: **ReportSettings (migrasi 0030) baru terpasang setengah jalan.** Kolom disimpan dan diedit admin, tetapi (1) nilai jam kustom diabaikan (hanya `null` yang dihormati), (2) settings tidak terbaca saat baris laporan belum ada, (3) settings entity tidak pernah sampai ke PIC (pelapor utama), dan (4) `weeklyOpen`/`weeklyCutoffHour` tidak dibaca penegak kunci mana pun. Di luar itu, ada pola transaksi yang bocor di eskalasi dan penghapusan item mingguan, dua indeks penting yang hilang (Evidence, UnlockRequest), serta N+1 kecil di validasi serah mingguan.

---

## TINGGI

### [TINGGI-1] Nilai jam batas kustom diabaikan — hanya `null` vs non-null yang diperiksa
**Lokasi:** `src/lib/daily-rollup.ts:256-262` (`dailyGate`), `src/app/api/daily-input/route.ts:102-106` (GET), `src/app/api/daily-input/route.ts:448` (isLate), `src/app/api/daily-input/route.ts:167-169` (lockAt/countdown), `src/lib/kpi-snapshot.ts:44,76` (KPI tepat waktu).

```ts
const oldPastCutoff = isDailyLocked(day, now)          // selalu 17:00 (env DAILY_CUTOFF_HOUR)
const pastCutoff = settings.dailyCutoffHour === null
  ? false
  : !settings.dailyOpen ? true : oldPastCutoff          // nilai jam TIDAK PERNAH dipakai
```

`isDailyLocked` membaca `DAILY_CUTOFF_HOUR` env (bawaan 17). Bila admin mengatur "Batasi sampai 09.00 WIB" (`report-settings-card.tsx:117-121` menawarkan jam 07–20), kunci tetap jatuh pada 17.00. Helper yang benar sudah ada — `isDailyLockedWith()` di `src/lib/report-settings.ts:59` — tapi hanya dipakai `src/lib/evidence-access.ts:112`; `dailyLockAtWith` bahkan diimpor di `daily-rollup.ts:5` tanpa pernah dipanggil.

**Skenario kegagalan:** entitas set batas 09.00; PIC mengirim laporan pukul 15.00 → diterima (seharusnya 409 "sudah dikunci"); `isLate` juga salah kategori karena dihitung vs 17.00, sehingga KPI onTimeDailyPct salah untuk entitas itu.
**Usulan:** ganti semua cabang tersebut dengan `isDailyLockedWith(settings.dailyCutoffHour, settings.dailyOpen, day, now)`; tampilkan `lockAt`/`countdown` dari settings; samakan perhitungan `isLate` dan `kpi-snapshot` (baca settings per entitas).

### [TINGGI-2] Settings tidak terbaca bila baris laporan belum ada (entityId null → bawaan 17.00/Sen–Jum)
**Lokasi:** `src/lib/daily-rollup.ts:256` — `const settings = await getReportSettings(report?.entityId ?? null)`.

`dailyGate` hanya bisa `entityId` dari baris `DailyProjectReport`. Pada hari tanpa laporan (belum ada baris), dipakai DEFAULT = 17.00 + Senin–Jumat. Commit `c7052a3` memperbaiki tampilan GET saja; penegakan di PUT/task tetap berlubang.

**Skenario kegagalan:** entitas 24/7 (`dailyCutoffHour: null`); hari itu belum ada task/laporan; PIC menambah task atau mengirim laporan pertama pukul 19.00 → `dailyGate` memakai DEFAULT → `timeLocked=true` → 409 "sudah dikunci pukul 17.00", padahal aturan entitasnya tanpa batas. Setelah baris terbuat (dengan entityId), tulis berikutnya lolos — perilaku inkonsisten dalam hari yang sama.
**Usulan:** `dailyGate` menerima/membaca `project.entityId` (satu `findUnique` kolom entityId) ketika `report` null; project biasanya sudah terkunci FOR UPDATE oleh pemanggil sehingga tambahan biaya minim.

### [TINGGI-3] workingDays entitas tidak pernah berlaku untuk PIC_PROYEK (pelapor utama)
**Lokasi:**
- `src/app/api/daily-input/route.ts:56,262,369` — `resolveDay(..., user.scopeEntityId)`: PIC tidak punya `scopeEntityId` → selalu DEFAULT Sen–Jum.
- `src/app/api/tasks/route.ts:103` dan `:363` — `getReportSettings(null) // TODO: entityId dari project`.
- `src/lib/daily-rollup.ts:133-134` — `const rollupSettings = await getReportSettings(null)` → rollup dilewati di hari di luar Sen–Jum default.

**Skenario kegagalan:** entitas mengatur `workingDays: [1,2,3,4,5,6]` atau kosong (setiap hari). PIC tetap ditolak 422 "Hari ini bukan hari pelaporan"/"Task harian hanya untuk hari kerja (Senin–Jumat)" (pesan hardcode, tasks:365) saat mengisi Sabtu; task yang entah bagaimana ada di Sabtu tidak di-roll-up ke laporan (rollup return awal). ADMIN_PT (punya scopeEntityId) tidak terkena — hanya PIC, justru peran yang paling banyak melapor.
**Usulan:** ambil entityId dari project (guardProject di tasks sudah memuat `entityId` — turunkan ke `lockCheck`; daily-input bisa memindahkan resolveDay setelah project diresolusi, atau muat entityId PIC dari salah satu proyeknya).

### [TINGGI-4] `weeklyOpen` / `weeklyCutoffHour` disimpan tapi tidak dibaca penegak kunci mana pun
**Lokasi:** `src/lib/lock.ts:136-208` (`weeklyDeadlines`, `isWeeklyLocked`, `weeklyWriteBlock` — semuanya env `WEEKLY_LOCK_DAY=Jumat`, `WEEKLY_CUTOFF_HOUR=17`); pemakaian `weeklyOpen`/`weeklyCutoffHour` hanya: `src/app/api/admin/report-settings/route.ts` (tulis), `src/lib/report-settings.ts` (definisi), `src/components/admin/report-settings-card.tsx` (tampil).

**Skenario kegagalan:** admin menyalakan "capaian mingguan ditutup sementara" (`weeklyOpen: false`) → tidak ada efek sama sekali; kepala divisi tetap bisa menyerahkan/menyetujui/mengedit mingguan. Panel memberi janji yang tidak ditepati sistem.
**Usulan:** baca settings di `weeklyWriteBlock` (atau pembungkusnya di `openReport`) — tambah alasan `CLOSED` saat `weeklyOpen=false`, dan `weeklyCutoffHour` menggantikan jam pada `weeklyDeadlines`; atau hapus sementara kendali mingguan dari UI sampai diimplementasikan agar tidak menyesatkan.

---

## SEDANG

### [SEDANG-1] Eskalasi: multi-tulis tanpa transaksi + update tak bersyarat + TOCTOU raise
**Lokasi:** `src/app/api/escalations/actions/route.ts:130-158` (raise: `escalation.create` → `task.update` → `auditLog`, tiga tulisan terpisah), `:181` (review), `:215` (decide), `:249` (close) — semua `db.escalation.update({ where: { id } })` tanpa syarat status, di luar `$transaction`.

**Skenario kegagalan:** (a) `raise` gagal di `task.update` → eskalasi ada tanpa back-link task; (b) review dan decide bersamaan: review lolos cek `status === 'DIAJUKAN'`, decide meng-commit `DIPUTUSKAN`, lalu update review menimpa menjadi `DITINJAU` — keputusan hilang tanpa jejak tolakan; (c) dua `raise` bersamaan untuk sumber sama sama-mata lewat `findFirst` (line 122) → dua eskalasi terbuka (tidak ada unique constraint yang mencegah).
**Usulan:** bungkus tiap aksi dalam `$transaction` + `updateMany({ where: { id, status: <yang dibaca> } })` pola inbox (`src/app/api/inbox/route.ts:150-156`); audit di dalam tx; untuk (c) pertimbangkan unique index parsial `CREATE UNIQUE INDEX ... ON Escalation(sourceType, sourceId) WHERE status IN ('DIAJUKAN','DITINJAU','DIPUTUSKAN')`.

### [SEDANG-2] Tabel Evidence tanpa indeks apa pun
**Lokasi:** `prisma/schema.prisma:482-493` (model `Evidence`, nol `@@index`); tidak ada migrasi yang membuat indeks (0001 tidak membuat, migrasi lain tidak menyentuh).

Setiap perubahan task menjalankan `evidence.count({ targetType, targetId IN [...] })` (`daily-rollup.ts:69`), setiap tampilan memuat `findMany({ targetType, targetId })` (`tasks attachEvidence:248`, `evidence/route.ts:38`, `daily-input:121`, `weekly-input:195`) — semuanya full scan pada tabel yang tumbuh satu baris per unggahan/tautan tanpa batas dan tanpa retensi.
**Usulan:** `@@index([targetType, targetId])` + migrasi bernomor baru (≥0032, DB lokal saja).

### [SEDANG-3] UnlockRequest tanpa indeks (targetType, targetId)
**Lokasi:** schema `UnlockRequest` (index hanya requestedById/approvedById/executedById). Query per-target: `daily-rollup.ts:264` (dipanggil pada SETIAP tulisan harian melalui dailyGate), `daily-input:129,145`, `weekly-input:179`, `work-desk:246`.
**Usulan:** `@@index([targetType, targetId, status])` atau minimal `([targetType, targetId])`.

### [SEDANG-4] N+1 hitung bukti item saat serah/setujui mingguan
**Lokasi:** `src/app/api/weekly-input/route.ts:688-694` — `for (const item of items) { await db.evidence.count(...) }` berurutan per item (dipadu SEDANG-2: tiap count = full scan).
**Usulan:** satu `db.evidence.groupBy({ by: ['targetId'], where: { targetType: 'WEEKLY_ITEM', targetId: { in: ids } } })`.

### [SEDANG-5] Penghapusan item mingguan & task: berkas/baris tidak atomik, berkas yatim
**Lokasi:**
- `src/app/api/weekly-input/route.ts:589-603` (DELETE item): hapus objek storage → `evidence.deleteMany` → `item.delete` → `backToDraft` → audit, SEMUA di luar transaksi. Gagal di tengah → lampiran sudah terhapus dari storage tapi item masih ada (baris Evidence menunjuk objek hilang), atau status laporan tidak kembali DRAFT.
- `src/app/api/tasks/route.ts:639-640` (DELETE task): baris Evidence dihapus tetapi objek storage TIDAK dihapus (berkas yatim di bucket; bandingkan daily-input DELETE yang mengembalikan `files` dan menghapus objek setelah commit — pola yang benar).

**Usulan:** tiru pola daily-input DELETE: `$transaction` untuk semua baris DB + audit, kumpulkan storageKey, hapus objek setelah commit sukses.

### [SEDANG-6] Perubahan ReportSettings tidak dicatat di AuditLog
**Lokasi:** `src/app/api/admin/report-settings/route.ts:52-57` — upsert tanpa `auditLog.create`. Menutup pelaporan harian entitas (`dailyOpen=false`) atau menggeser tenggat adalah aksi administratif berdampak operasional; semua aksi lain (termasuk `REQUEST_ACCESS`, `UPDATE_ACCOUNT`) dicatat.
**Usulan:** tulis AuditLog `UPDATE_REPORT_SETTINGS` dengan before/after (bandingkan baris lama sebelum upsert).

### [SEDANG-7] Rollup tidak membersihkan angka turunan saat task terakhir dihapus
**Lokasi:** `src/lib/daily-rollup.ts:140-152` — cabang `!rollup` hanya me-reset `evidenceCount`; `status`, `progressPct`, `needsEscalation` tetap memuat nilai turunan task yang sudah tidak ada.
**Skenario kegagalan:** hari dengan 3 task SELESAI (laporan tertulis SELESAI, 100%), PIC menghapus ketiganya dan tidak pernah membuka form lagi → laporan terkirim tetap menampilkan SELESAI 100% padahal hari itu kini laporan manual kosong.
**Usulan:** setidaknya reset `progressPct=0`/`status` ke nilai manual tersimpan, atau tandai `derivedFromTasks` agar UI memaksa isi ulang.

### [SEDANG-8] Kunci bukti laporan harian masih 17.00 hardcode (inkonsisten dalam satu file)
**Lokasi:** `src/lib/evidence-access.ts:57` — jalur DAILY_REPORT memakai `isDailyLocked(r.reportDate)`; jalur TASK MINGGUAN di file yang sama (line 111-112) sudah benar memakai `isDailyLockedWith(taskSettings...)`.
**Skenario kegagalan:** entitas 24/7 — PIC tidak bisa melampirkan bukti ke laporan harian setelah 17.00 (409), tetapi bisa melampirkan ke task mingguan hari yang sama. Selain itu jalur DAILY_REPORT juga tidak memeriksa `dailyOpen`.
**Usulan:** pakai `getReportSettings(r.entityId)` + `isDailyLockedWith` seperti jalur task.

---

## RENDAH

### [RENDAH-1] Unggah bukti: objek storage ditulis sebelum baris DB
`src/app/api/evidence/upload/route.ts:129-145` — `uploadEvidence` sukses lalu `evidence.create` gagal → berkas yatim di bucket. **Usulan:** try/catch di sekitar create yang menghapus objek saat gagal.

### [RENDAH-2] Buat/hapus Evidence + recount + audit di luar transaksi
`src/app/api/evidence/route.ts:75-100`, `evidence/[id]/route.ts:71-83`. Dua unggahan bersamaan → cache `evidenceCount` bisa basi (1, padahal 2) sampai recount berikutnya. Idempoten, mandiri pulih. **Usulan:** cukup diketahui; bila ingin rapat, bungkus create+sync dalam tx.

### [RENDAH-3] `getReportSettings` menelan semua galat
`src/lib/report-settings.ts:46-49` — `catch {}` mengubah galat koneksi apa pun menjadi "bawaan 17.00/Sen–Jum" (gagal-terbuka ke arah perilaku lama, bukan gagal-tertutup). **Usulan:** tangkap hanya `P2021/P2022` (tabel/kolom belum termigrasi), biarkan galat lain naik.

### [RENDAH-4] Drift yang tidak terwakili schema Prisma
- `Subtask_one_owner` CHECK (0008), `Attendance_status_check` (0015, diperluas 0023), dan RLS semua tabel (0002) tidak bisa dideklarasikan di schema — `prisma db push`/baseline baru akan menjatuhkannya tanpa suara. Schema sudah punya pola mitigasi untuk indeks (komentar `Entity`, line 52-56); constraint DB perlu dijaga lewat reviu migrasi manual.
- Nomor migrasi 0020/0022/0024 tidak ada di repo ini (dipesan worktree Claude sesuai `docs/KOORDINASI-AGEN.md` §5). Tidak merusak (`migrate deploy` toleran celah nomor), tapi Supabase produksi memang belum menerima 0013–0025 — jangan menjalankan `migrate deploy` dari repo ini tanpa koordinasi manusia.

### [RENDAH-5] Indeks ganda `ReportSettings.entityId`
Migrasi 0030 membuat `ReportSettings_entityId_key` (UNIQUE) **dan** `ReportSettings_entityId_idx` (biasa); schema mendeklarasikan keduanya (`@unique` + `@@index`, line 1145/1160). Indeks kedua redundan (unik sudah melayani lookup) — biaya tulis dobel. **Usulan:** hapus `@@index([entityId])` dari schema + index DB di migrasi berikutnya.

### [RENDAH-6] Impor mati di daily-rollup
`src/lib/daily-rollup.ts:5` — `isWorkingDay` dan `dailyLockAtWith` diimpor tanpa dipakai (sisa refactor settings; penanda TINGGI-1 yang belum tuntas). **Usulan:** bersihkan saat memperbaiki TINGGI-1.

### [RENDAH-7] Komentar enum Evidence basing
`prisma/schema.prisma:484` menyebut `DAILY_REPORT | WEEKLY_ITEM | PROJECT_CLOSING`; kode juga memakai `TASK`, `OUTPUT`, `PROGRESS_REPORT` (`evidence-access.ts:27`, `daily-rollup.ts:70`). Tidak ada CHECK yang menjaga nilai sah — typo targetType akan menciptakan bukti yatim senyap. **Usulan:** perbarui komentar + (opsional) CHECK constraint pada migrasi berikutnya.

### [RENDAH-8] `isWorkingDay` hardcode Sen–Jum masih dipakai di jalur non-enforcement
`nav-badges:27` (badge "belum lapor" hanya muncul Sen–Jum — PIC entitas 7 hari tidak diingatkan di akhir pekan), `approval-requests:216` (rentang cuti), `cron/remind-divisions:23`, `kadiv/team:47`, `work-desk:411`, `admin/compliance/remind:56`, `inbox:69`, `system:118`, `project-progress:93`. Tampilan/pengingat menyimpang dari aturan entitas. **Usulan:** migrasi bertahap ke `isWorkingDayWith(settings.workingDays, ...)`.

### [RENDAH-9] GET daily-input untuk peran induk memakai settings entitas proyek pertama
`src/app/api/daily-input/route.ts:100` — `settingsEntityId = projects[0]?.entityId`; untuk TI/Super Admin lintas entitas, tampilan kunci semua proyek mengikuti satu entitas. Hanya tampilan (penegakan per laporan via dailyGate). **Usulan:** hitung lockReason per proyek dari entityId masing-masing.

---

## Hal yang diperiksa dan bersih

- **Nullable-vs-non-null (fokus 1):** tidak ditemukan crash potensial di file zona. `User.username` nullable namun selalu dibuat terisi (`companies.ts:226`, login menangani null); `readPosition` selalu mengisi email default sehingga `p.email!` (`companies.ts:218,227`) aman; rollup/undo/access-requests konsisten memakai optional chaining pada kolom nullable.
- **Drift kolom schema vs migrasi (fokus 2):** semua kolom/model di schema.prisma tercakup migrasi 0001–0031 (Task.entry fields → 0031, ReportSettings → 0030, AuthSession → 0027, AccountActivation → 0028); indeks yang dideklarasikan dengan `map:` cocok dengan nama di SQL (0002–0003, 0007, 0026, 0029). FK onDelete konsisten (diperiksa per relasi wajib/opsional). Pengecualian dilaporkan di RENDAH-4 (constraint non-Prisma) dan SEDANG-2/3 (indeks yang seharusnya ada tapi tidak).
- **Lintas entitas (fokus 7):** guard konsisten — `ownsProject`/`guardProject` (daily-input, tasks), `canRead/WriteEvidence` + `scopeEntityIds`, eskalasi & inbox cek `entityId !== scopeEntityId`, access-requests `readWhere`/`mayDecideFor`, undo `actorId` + `scopeEntityIds` (anti-IDOR). Tidak ditemukan kebocoran query lintas entitas.
- **Pola penguncian baik:** serialisasi per proyek (`lockDailyProject` FOR UPDATE dalam `$transaction` ReadCommitted) menutup race pembuatan laporan dari jalur task; daily-input PUT menangkap P2002 → 409; `createReport` mingguan menangani race unik dengan re-read; inbox forward memakai `updateMany` bersyarat; approve project membandingkan observed-vs-locked; undo memakai klaim atomik + stamp updatedAt.
- **computeRollup (fokus 5):** `progressPct` = rata-rata nilai yang dijepit 0–100 di input (tasks:172, daily-input:363) → selalu 0–100; `evidenceCount` = bukti level laporan + bukti task HARIAN hari itu, tidak ada jalur yang menghitung ganda (task pindah hari memicu rollup ulang hari asal dan tujuan, tasks:499-500, 595); pembagi `tasks.length` aman karena early-return saat 0.

## Prioritas perbaikan yang disarankan

1. TINGGI-1 + TINGGI-2 + SEDANG-8 (satu PR: `dailyGate`/`resolveDay`/evidence-access memakai `isDailyLockedWith` + entityId dari project).
2. TINGGI-3 (entityId dari project di tasks/rollup/resolveDay — hapus dua TODO).
3. TINGGI-4 (putuskan: implementasi weekly settings atau sembunyikan kendali mingguan di panel).
4. SEDANG-1 (transaksi + update bersyarat di eskalasi) dan SEDANG-5 (pola hapus atomik).
5. SEDANG-2/3/4 (satu migrasi indeks + groupBy bukti mingguan).
6. SEDANG-6/7 dan butuh RENDAH menyusul.
