# Laporan T13-JAM-SISA — sisa jam batas / hari kerja ke ReportSettings per PT

Agen T13, 12 Oktober 2026. Tanpa git, DB, `prisma generate/migrate`, tanpa migrasi. Gerbang: `tsc` bersih, `eslint` berkas ubahan bersih, `vitest run` 99 berkas / 1.663 tes lulus. Memakai ulang pembantu `lib/report-settings.ts` (`getReportSettings`, `isWorkingDayWith`, `dailyLockInstantWith`, `dailyCountdownWith`, `dailyCutoffLabelWith`); tidak ada pola baru.

## Sudah terkonversi sebelum T13 (terverifikasi, tidak diulang)

`work-desk` (lockAt/locked/countdown/cutoffLabel harian, tenggat mingguan, remind-pic/remind-all-pics), `inbox` (GET), `project-progress` (riwayat). `project-progress` tidak punya `isDue`.

## Dikerjakan T13

| # | Berkas | Perubahan |
| --- | --- | --- |
| 1 | `lib/reminder-rules.ts` `isDue(rule, now, workingDays?)` | Argumen ke-3 opsional (bawaan Sen–Jum, jadi pemanggil lama dan mock tes tidak berubah). Kosong = setiap hari. `weekday` eksplisit tetap tak terpengaruh. `runDueRules` meneruskan hari kerja PT. |
| 2 | `api/cron/reminder-rules` | Hitungan "seharusnya jalan" memakai `isDue` dengan hari kerja PT yang sama dengan `runDueRules`, jadi tidak ada lagi salah lapor gagal untuk PT berhari kerja kustom/24/7 (sisa T12 diselesaikan serempak). |
| 3 | `api/cron/remind-divisions` | Gerbang `isWorkingDay()` global diganti per PT: entitas diperluas (null = semua aktif), disaring `isWorkingDayWith(workingDays)`, hanya PT yang jatuh hari kerjanya diingatkan. Tak satu pun = `skipped: 'bukan hari kerja'`. PT 24/7 kini diingatkan di akhir pekan. |
| 4 | `lib/reminders.ts` + `lib/lock.ts` | Kalimat tenggat pengingat mingguan memakai jam/kunci PT divisi (bukan `WEEKLY_*_LABEL` env). `weeklyOpen=false` dan `weeklyCutoffHour=null` punya kalimat sendiri. Pembantu baru `weeklyLabelsWith(hour)` di lock.ts; `deadlineSentence` diekspor. |
| 5 | `api/system` (konsol TI) | Ringkasan kunci dari semua PT aktif: aturan seragam tampil apa adanya (24/7 = "24.00 WIB"); beragam = label "beragam per PT", `dailyLocked` benar hanya bila SEMUA PT terkunci, hitung mundur/lockAt ke kunci terdekat, tenggat mingguan terawal. Medan lama tetap ada; tambahan baru `locking.perEntity[]` (jam, kunci, hari kerja tiap PT) untuk UI nanti. |
| 6 | `api/daily-input` GET (di luar daftar, perubahan 1 baris) | `lockAt` kini `dailyLockInstantWith` (24/7 = akhir hari WIB, ditutup = awal hari), bukan `dailyLockAt` env. Klien web sudah membaca tengah malam sebagai "24.00" (`tests/ui/pic-deadline-text`). `countdown` tetap `null` pada 24/7 (kontrak yang dipakai UI). |

Semantik 24/7 konsisten dengan my-dashboard: tenggat = 24.00 WIB / akhir hari WIB, bukan null.

## Sengaja dibiarkan (dengan alasan)

- `api/tasks` (GET papan mingguan `lockAt`/`locked`, `lockCheck`, PATCH, pesan `WEEKLY_LOCK_LABEL`): kunci mingguan masih `isWeeklyLocked(start)` tanpa settings dan label env. Di luar kepemilikan (rute dan agen lain). Pasti salah untuk PT dengan `weeklyOpen=false`/jam mingguan kustom; konversi: ambil `gate.settings`/`getReportSettings(project.entityId)` lalu `isWeeklyLocked(start, now, settings)` dan `weeklyLabelsWith`. Prioritas tertinggi sisa.
- `api/kadiv/weekly-summary` + `lib/kadiv.ts` `buildWeeklySummary` (L690) dan `lib/oversight.ts` (L30–35): `weeklyDeadlines(...)` jam env. Penegakan ringkasan mingguan kadiv ("kunci Jumat"); harus diubah serempak rute + lib (satu entitas dari divisi). `oversight` lintas PT (jangkar minggu direktur) perlu keputusan produk.
- `api/system/grup` (`sdmPanel`): jangkar minggu lintas PT dengan `weeklyDeadlines(now)` env; sama, butuh keputusan lintas PT. `api/ringkasan` (jangkar minggu lintas PT) sama.
- `api/progress-reports` `progressLockAt`; `lib/kadiv.ts` `lastWorkingDays`/`remainingWorkdays` (kisi tampilan 10 hari), kisi hari di `admin-compliance-server`: tampilan/di luar daftar, tidak menegakkan.
- Konstanta `DAILY_CUTOFF_HOUR` sebagai cadangan `?? DAILY_CUTOFF_HOUR` di pesan kunci `daily-input`/`tasks`: jalur tak terjangkau (null = tidak pernah terkunci), tak diubah.
- `src/components/**` (tidak boleh disentuh): `system-view.tsx:170` teks statis "kunci 17.00 dihitung dari jam"; `oversight/weekly-reports.tsx` memakai `WEEKLY_*_LABEL` sebagai cadangan; `components/preview/mock-*` memakai env (data contoh). `locking.perEntity` siap dipakai UI.
- Komentar dokumentasi "17.00" di `daily-rollup`, `kadiv-math`, `pic-progress`, `admin-compliance`, `evidence-access`, `lock.ts`: hanya komentar, bukan penegakan.
- Aturan sekarang berlaku juga untuk hari lampau (belum ada riwayat perubahan settings), seperti catatan T12.
- Android: kontrak tidak berubah; `lockAt` kini konsisten dengan web (daily-input) di semua rute tersebut. Tidak menyentuh `android/`.

## Tes

- Baru `tests/api/t13-jam-sisa.test.ts` (18 kasus): `isDue` per hari kerja PT (default, kosong, kustom, `weekday`), kalimat tenggat mingguan (jam PT, sesudah serah/kunci, tanpa batas, ditutup), cron remind-divisions (Minggu hanya PT 24/7, semua Sen–Jum dilewati, hari kerja kustom), `/api/system` (seragam 24/7, beragam, semua terkunci, `perEntity`), `daily-input` lockAt (24/7, 15.00, ditutup).
- Diubah `tests/cx/operational-health.test.ts`: mock hari kerja berpindah dari `@/lib/lock` ke `@/lib/report-settings` (tes tidak lagi bergantung hari pelaksanaan).
