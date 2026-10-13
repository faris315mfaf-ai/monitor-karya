# Laporan T12-JAM-BUKTI — sisa temuan jam batas, hari kerja, bukti

Agen T12, 12 Oktober 2026. Tanpa git, DB, `prisma generate/migrate`; tanpa migrasi baru. Gerbang: `tsc` bersih, `eslint` berkas ubahan bersih, `vitest run tests` 97 berkas / 1.617 tes lulus.

## Diperbaiki

| # | Temuan | Perbaikan |
| --- | --- | --- |
| 1 | `my-dashboard`, `kadiv/team` memakai jam env | Pembantu baru di `lib/report-settings.ts`: `dailyDeadlineWith`, `dailyLockInstantWith`, `dailyCountdownWith`, `dailyCutoffLabelWith`. my-dashboard (PIC/Kadiv/Admin) memakai settings PT (countdown, lockAt, jam serah mingguan, hari kerja grafik Admin). `lib/kadiv.ts` `buildTeam` (lockAt/locked/cutoffLabel, tepat waktu 30 hari) dan `remindTeam`; `kadiv/team` POST: gerbang kunci dibaca dari PT divisi (setelah cek divisi). Mode 24/7 ditampilkan sebagai tenggat 24.00 WIB / akhir hari (UI role-dashboards butuh `countdown` objek, bukan null). |
| 2 | `kpi-snapshot.ts` jam env | Per entitas: tenggat = jam PT (24/7 = akhir hari WIB), hari kerja = `workingDays`, jam serah mingguan = settings. `workdaysBetween` dan `lockedWorkdays` menerima `workingDays` opsional (bawaan Sen–Jum tidak berubah). Catatan: aturan saat ini berlaku juga untuk hari lampau (belum ada riwayat perubahan settings). |
| 3 | `isWorkingDay` Sen–Jum | `nav-badges` (hari kerja + kunci), `approval-requests` (hari cuti yang dicatat), `admin/compliance/remind` (gerbang kunci), `loadCompliance` (`locked`, jam serah mingguan; `settingsEntityId`), `reminders-pic` (label tenggat), `reminder-rules` (`runDaily` kunci, `previousWorkingDays`, ringkasan manajemen). |
| 4 | URL bukti mentah di GET | `safeEvidenceUrl` di `lib/security.ts`; dipakai di GET tasks, daily-input, weekly-input, `GET /api/evidence`, dan `GET /api/evidence/[id]` (tautan tak valid dijawab 422). |
| 5 | RENDAH-2 evidence di luar transaksi | `syncEvidenceCount(..., tx)` menerima klien transaksi (kunci baris induk FOR UPDATE untuk WEEKLY_ITEM/PROGRESS_REPORT, kunci Project untuk DAILY/TASK). `evidence` POST, `evidence/[id]` DELETE, `evidence/upload`: buat/hapus + recount + audit satu transaksi; upload yang gagal membuang objek storage; DELETE ganda dijawab 404. |
| 6 | GET `admin/report-settings` | Gerbang peran sama dengan PUT (`daily:forward` atau `companies:manage`). Satu-satunya pemanggil adalah kartu di tab Statistik (hanya Admin PT/TI/Super Admin), UI tak terdampak. |

## Dilewati / sisa (dengan alasan)

- `isDue` di `reminder-rules` tetap Sen–Jum: `/api/cron/reminder-rules` (di luar kepemilikan) memanggil `isDue` sendiri untuk menghitung "seharusnya jalan"; mengubahnya sepihak membuat cron salah melapor gagal untuk PT berhari kerja kustom. Perlu perubahan serempak rute cron.
- Rute di luar kepemilikan masih memakai jam/hari env: `work-desk`, `inbox`, `system`, `project-progress`, `cron/remind-divisions`, `lib/kadiv.ts` `lastWorkingDays`/`remainingWorkdays` (kisi tampilan 10 hari kerja), kisi hari di `admin-compliance-server`.
- `daily-input` GET masih menampilkan `lockAt` dari env sebagai cadangan (countdown sudah null di 24/7; UI memakai itu).
- `progress-reports` masih punya salinan lokal `safeEvidenceUrl` (di luar kepemilikan); boleh diganti impor dari `lib/security`.

## Tes

Baru: `tests/api/t12-jam-bukti.test.ts` (pembantu jam, nav-badges, kadiv/team, my-dashboard, KPI 7 hari vs Sen–Jum, report-settings GET 403, filter URL bukti, transaksi bukti). Diperluas: `tests/api/approval-requests.test.ts` (cuti PT 7 hari).
