# Laporan T10-FIX1 — Rantai ReportSettings + crash countdown null

Agen perbaik T10-FIX1, 10 Oktober 2026. Memperbaiki 1 HIGH dari `docs/zcode/laporan-swarm/T10-AUD2-UI.md` (H1) dan 4 TINGGI dari `docs/zcode/laporan-swarm/T10-AUD3-DB.md` (TINGGI-1..4). Tanpa git (commit), tanpa basis data, tanpa gradle.

## Ringkasan perubahan

| Bug | Sumber audit | Berkas | Perbaikan |
| --- | --- | --- | --- |
| [CRASH] countdown null saat 24/7 | AUD2 H1 | `src/components/views/daily-input-view.tsx` | Tipe `countdown` jadi nullable; kalimat hero/subtitle memakai `cutoffText()` — tidak lagi dereference `countdown.hours` |
| [T1] Jam batas kustom diabaikan | AUD3 TINGGI-1 | `src/lib/daily-rollup.ts`, `src/app/api/daily-input/route.ts`, `src/app/api/tasks/route.ts` | `dailyGate` dan GET/PUT/DELETE daily-input memakai `isDailyLockedWith(settings…)`; `isLate` dan pesan 409 mengikuti jam entitas (`hourLabel`), bukan `DAILY_CUTOFF_LABEL` env |
| [T2] Settings tak terbaca saat laporan belum ada | AUD3 TINGGI-2 | `src/lib/daily-rollup.ts`, `src/app/api/tasks/route.ts` | `dailyGate` mengambil entityId dari PROJECT (`project.findUnique`) saat baris laporan belum ada; rollup dan lockCheck task memakai `gate.settings` (bukan `getReportSettings(null)`) |
| [T3] workingDays tak sampai ke PIC | AUD3 TINGGI-3 | `src/app/api/daily-input/route.ts`, `src/app/api/tasks/route.ts` | GET memanggil `visibleProjects` dulu lalu `resolveDay(…, projects[0]?.entityId ?? user.scopeEntityId ?? null)`; PUT/DELETE memanggil `resolveDay(…, project.entityId)` setelah proyek dimuat; TODO di tasks POST diganti `guard.project.entityId` |
| [T4] weeklyOpen/weeklyCutoffHour mati | AUD3 TINGGI-4 | `src/lib/lock.ts`, `src/app/api/weekly-input/route.ts` | `isWeeklyLocked`/`weeklyWriteBlock`/`weeklyDeadlines` menerima settings opsional (backward-compatible env); rute weekly-input membaca settings entitas dan meneruskannya; alasan baru `CLOSED` saat `weeklyOpen=false` |

## [CRASH] Tab Laporan harian tidak lagi mati saat aturan 24/7

`src/components/views/daily-input-view.tsx`:

- `Data.countdown` kini `{ hours; minutes; passed } | null` (null = mode 24/7 dari `GET /api/daily-input`).
- Helper baru `cutoffText(data)`: `countdown === null` → "Mode 24/7", selain itu `Tenggat <jam>` — dipakai subtitle kartu (`DailyInputView` dan `DailyReportCard`) sehingga mode 24/7 tidak menampilkan "Tenggat 17.00" dari `lockAt` env.
- Kalimat `deadline` di Hero: cabang terbuka + countdown null → "Tersedia 24/7 · kirim kapan saja." (plus ajakan catat entri bila ada laporan tertunda); cabang terkunci + countdown null (kombinasi 24/7 + pengisian ditutup) → "Pengisian laporan … sedang ditutup." Cabang countdown non-null mempertahankan teks lama persis (tes `tests/qa/keyboard/alur-kirim-hapus.test.ts` tetap lulus).

## [T1] Jam batas kustom benar-benar dipakai penegak kunci

- `dailyGate` (`src/lib/daily-rollup.ts`): gantungan `dailyCutoffHour === null ? false : !dailyOpen ? true : isDailyLocked(day, now)` diganti satu panggilan `isDailyLockedWith(settings.dailyCutoffHour, settings.dailyOpen, day, now)` — nilai jam kustom (07–20) kini menentukan kunci. `DailyGate` juga mengembalikan `settings` sehingga pemanggil tidak membaca ulang.
- GET daily-input: `timeLocked = isDailyLockedWith(rptSettings…)`.
- PUT daily-input `isLate`: kini `isDailyLockedWith(gate.settings…)` — entitas 24/7 yang mengirim lewat buka kunci tidak lagi salah ditandai terlambat oleh jam 17.00 env.
- Pesan 409 "sudah dikunci pukul …" di PUT/DELETE daily-input dan tasks lockCheck memakai `hourLabel(gate.settings.dailyCutoffHour ?? DAILY_CUTOFF_HOUR)`.
- Bersih-bersih (AUD3 RENDAH-6): impor mati `isDailyLocked`, `isWorkingDay`, `dailyLockAtWith`, `wibIsoDay` di daily-rollup dan `DAILY_CUTOFF_LABEL` di rute dihapus.

## [T2] Settings entity berlaku sebelum baris laporan ada

- `dailyGate`: `entityId = report?.entityId ?? (await client.project.findUnique({ id: projectId })).entityId ?? null` — hari tanpa baris `DailyProjectReport` (laporan/task pertama hari itu) mengikuti aturan entitas, bukan bawaan 17.00/Sen–Jum. Proyek biasanya sudah dikunci FOR UPDATE oleh pemanggil, biaya kueri minim (satu `findUnique` kolom entityId, hanya saat laporan belum ada).
- `rollupDailyReport`: `getReportSettings(null)` dihapus; cek working-days memakai `isWorkingDayWith(gate.settings.workingDays, workDate)` — rollup task kini terjadi di hari kerja entitas (mis. Sabtu untuk entitas 6 hari).
- `lockCheck` tasks: `getReportSettings(null) // TODO` diganti `gate.settings` (dailyGate sudah menyelesaikan entityId dari proyek).

## [T3] workingDays entity sampai ke PIC_PROYEK

- GET daily-input: `visibleProjects(user)` dipanggil lebih dulu, lalu `resolveDay(…, projects[0]?.entityId ?? user.scopeEntityId ?? null)` — PIC (yang `scopeEntityId`-nya null karena terpaku ke proyek) kini divalidasi terhadap workingDays entitas proyeknya; nilai yang sama dipakai untuk `rptSettings` (menggantikan duplikasi lama).
- PUT/DELETE daily-input: proyek dimuat dulu (urutan lock tetap `Project` → `DailyProjectReport`), lalu `resolveDay(…, project.entityId)`. Efek samping kecil yang disengaja: 404/403 proyek kini didahulukan sebelum galat tanggal (400/422) — konsisten dengan pengecekan kepemilikan sebelum validasi.
- tasks POST: cek `workDate` memakai `getReportSettings(guard.project.entityId)`. (Bagian ini dan `gate.settings` di lockCheck beririsan dengan suntingan agen T10-FIX2 yang berjalan bersamaan di worktree yang sama; hasil akhirnya saling melengkapi dan lolos tsc/tes bersama.)

## [T4] weeklyOpen/weeklyCutoffHour ditegakkan

`src/lib/lock.ts` (semuanya opsional, default env — pemanggil lama tak berubah):

- Tipe `WeeklyLockSettings = { weeklyCutoffHour: number | null; weeklyOpen: boolean }` (subset struktural `ReportSettingsData`, jadi objek settings penuh bisa langsung diteruskan).
- `weeklyDeadlines(date, cutoffHour = WEEKLY_CUTOFF_HOUR)` — jam kunci mingguan entitas ikut menghitung handoverBy/lockAt.
- `isWeeklyLocked(periodStart, now?, settings?)` — `weeklyOpen=false` → selalu terkunci; `weeklyCutoffHour=null` ("Tanpa batas") → tidak pernah terkunci waktu; selain itu jam entitas menggantikan 17.00 env.
- `weeklyWriteBlock({ …, settings? })` — alasan baru `CLOSED` (setelah jalur buka-kunci-aktif, sebelum FUTURE_WEEK): `weeklyOpen=false` menolak semua tulis mingguan, pesan menjelaskan bahwa buka kunci yang disetujui tetap bisa dipakai untuk koreksi (paritas dengan daily: unlock menembus tutup). Pesan TIME_LOCKED memakai label jam entitas.

`src/app/api/weekly-input/route.ts`:

- `openReport` (dipakai PUT/PATCH/POST): `getReportSettings(division.entityId)` diteruskan ke `weeklyWriteBlock`.
- GET: `rptSettings = getReportSettings(entity?.id ?? null)` diteruskan ke `isWeeklyLocked` (field `locked`) dan `weeklyWriteBlock` per divisi; `weeklyDeadlines` untuk tampilan `handoverBy`/`lockAt` ikut jam entitas (`?? WEEKLY_CUTOFF_HOUR` bila null, agar bentuk payload tetap).
- DELETE item: `getReportSettings(guard.division.entityId)` diteruskan ke `weeklyWriteBlock`.

## Penyesuaian tes (mock DB)

`dailyGate` kini membaca `project.findUnique` saat baris laporan belum ada/tanpa entityId:

- `tests/cx/evidence-access.test.ts`: mock `@/lib/db` ditambah model `project`; mock `isDailyLockedWith` diarahkan ke jahitan `mocks.dailyLocked` yang sudah ada (dailyGate pindah dari `isDailyLocked` env ke `isDailyLockedWith` settings) sehingga tes kunci-cutoff lama tetap mengendalikan hasilnya.
- `tests/lib/evidence-access.test.ts`: mock `@/lib/db` ditambah `project.findUnique` (baris task tanpa `entityId` di laporan ada di tes ini).

## Uji

- `DATABASE_URL=postgresql://x:y@127.0.0.1:1/db DIRECT_URL=…sama npx tsc --noEmit --incremental false` — lulus tanpa galat.
- `npx vitest run tests/api tests/cx` — 56 berkas, 1189 tes lulus. `npx vitest run tests/lib` (ikut diubah) — 13 berkas, 151 tes lulus.
- `npx eslint` pada 8 berkas yang diubah — bersih.

## Sisa yang belum (di luar 5 bug ini, catatan lanjutan)

- AUD3 TINGGI-1 ekor: `src/lib/kpi-snapshot.ts` (KPI tepat waktu) dan `src/lib/evidence-access.ts:57` (jalur DAILY_REPORT masih 17.00 env — AUD3 SEDANG-8) belum memakai settings per entitas.
- AUD3 RENDAH-8: `isWorkingDay` Sen–Jum hardcode di jalur non-enforcement (nav-badges, reminders, approval-requests, dsb.).
- AUD3 RENDAH-9: GET daily-input untuk peran induk lintas entitas tetap memakai settings entitas proyek pertama (lockReason per proyek menyusul).
- AUD2 M1/M3/L1/L7 (label tenggat dari API di role-dashboards/compliance/team-cards/weekly-reports) dan meta "Tenggat …" pada `reportFlow` di daily-input-view — tampilan, belum tersentuh.
- Kunci mingguan di rute tasks (papan mingguan task) masih env; bila ingin konsisten per entitas, teruskan settings entity di `lockCheck`/PATCH seperti weekly-input.
