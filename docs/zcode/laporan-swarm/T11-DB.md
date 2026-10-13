# Laporan T11-DB — sisa temuan T10 zona DB/lib

Agen T11-DB, 12 Oktober 2026. Tanpa git, DB, `prisma generate`/`migrate`. Gerbang: `tsc` bersih, `eslint` berkas ubahan bersih, `vitest run` 94 berkas / 1.588 tes lulus.

## Diperbaiki

| Temuan | Perbaikan |
| --- | --- |
| AUD3 SEDANG-1 (+AUD1 S-5 eskalasi) | `escalations/actions`: raise = satu transaksi (kunci baris sumber FOR UPDATE, cek duplikat, create, back-link task, audit); review/decide/close = `update where {id,status}` + audit dalam transaksi; P2025 jadi 409 (keputusan tak tertimpa). |
| SEDANG-2, 3, RENDAH-5 | Migrasi `0032_indeks_bukti_buka_kunci`: indeks `Evidence(targetType,targetId)`, `UnlockRequest(targetType,targetId)`, hapus `ReportSettings_entityId_idx`; `schema.prisma` disesuaikan. |
| SEDANG-4 | weekly-input serah/setujui: satu `evidence.groupBy` menggantikan N `count`. |
| SEDANG-5 | tasks DELETE: objek storage ikut dihapus setelah commit; weekly-input DELETE item: bukti+item+draft+audit satu transaksi, storage dihapus setelah commit. |
| SEDANG-6 + AUD1 R-2 (audit) | report-settings PUT mencatat `UPDATE_REPORT_SETTINGS` (sebelum/sesudah) dalam transaksi; label di `audit-labels.ts`. |
| SEDANG-7 | `rollupDailyReport(..., { resetBilaKosong })`: dari rute tasks, bila task terakhir hari itu hilang, status/progres/needsEscalation direset. Sengaja tidak dari jalur bukti laporan manual (akan menimpa isian manual). |
| SEDANG-8 | `evidence-access` jalur DAILY_REPORT memakai settings entitas (`isDailyLockedWith`); jalur WEEKLY_ITEM meneruskan settings ke `weeklyWriteBlock`. |
| AUD1 S-3 (weekly-input FK) | PUT memverifikasi `aspectCategoryId`/`priorityId` ada, 422 bukan P2003/500. |
| RENDAH-1 | evidence/upload: gagal `create` membuang objek storage, balas 500 bersih. |
| RENDAH-3 | `getReportSettings` hanya melempar ulang galat koneksi/inisialisasi (P1001/2/8/17); selebihnya tetap bawaan. |
| RENDAH-7 | Komentar enum `Evidence.targetType` diperbarui. |
| RENDAH-9 | GET daily-input: kunci waktu tiap proyek mengikuti entitasnya. |
| AUD4 storage.ts | `Math.random` diganti `randomBytes(6).toString('hex')`; tes disesuaikan. |
| AUD4 scrypt | Verifikasi kini membaca N dari string hash (batas 2^10..2^18, selain itu jatuh ke 16384); hash baru N=2^16 (maxmem diatur). Hash lama tetap valid (tes). |

Tes baru: `tests/api/eskalasi-atomik.test.ts`, `tests/api/report-settings-audit.test.ts`, `tests/lib/password-scrypt.test.ts`; diperluas `weekly-input.test.ts`, `cx/storage.test.ts`.

## Dilewati (alasan)

- AUD1 R-2 gerbang GET: semua sembilan peran punya minimal satu kapabilitas (`daily:input`/`weekly:input`/`audit:read`), gerbang tak menyaring siapa pun; isi tak sensitif dan sudah dibatasi cakupan entitas.
- RENDAH-2: idempoten dan pulih sendiri pada recount berikutnya; bukan bug nyata.
- RENDAH-4: constraint non-Prisma/nomor migrasi kosong adalah catatan proses, bukan kode.
- RENDAH-8: `isWorkingDay` di nav-badges, remind, work-desk, dll. berada di rute di luar kepemilikan saya (tampilan/pengingat).
- `kpi-snapshot.ts` (ekor TINGGI-1): memakai `workdaysBetween`/`dailyLockAt` Sen-Jum di kpi-math; perlu desain ulang rumus KPI historis, bukan perbaikan kecil.
- AUD1 S-5 unlock-requests/access-requests/projects dan S-3 progress-reports: rute di luar kepemilikan.
- Unique index parsial eskalasi: tidak dibuat (data produksi bisa memuat duplikat sehingga migrasi berisiko); race ditutup lewat FOR UPDATE baris sumber.

## Catatan deploy

- Migrasi 0032 hanya `CREATE/DROP INDEX IF (NOT) EXISTS`; tidak diterapkan di sini.
- Deploy bergulir: hash baru N=2^16 tidak terbaca benar oleh kontainer lama (mengabaikan N). Hash baru hanya tertulis saat sandi diatur/direset, jadi risikonya terbatas pada jendela rollback.
