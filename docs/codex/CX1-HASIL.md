# CX1 — Buka kunci berlaku untuk bukti

Selesai di worktree `/Users/godam/PROYEK/monitor-karya-codex`, cabang `codex/kerja`, tanpa commit.

## Perubahan

- `src/lib/evidence-access.ts`: DAILY_REPORT dibekukan oleh `isLocked`, `forwardedAt`, atau tenggat harian, kecuali `activeUnlockFor('DAILY_REPORT', id)` masih berlaku.
- TASK mengambil laporan melalui pasangan `projectId_reportDate` berdasarkan proyek dan tanggal tugas. Kunci manual, penerusan, tenggat, dan buka kunci mengikuti laporan tersebut. Tanpa laporan, tenggat harian tetap berlaku.
- WEEKLY_ITEM mengikuti laporan mingguannya: `isLocked`, `forwardedAt`, status `TERKUNCI`, dan tenggat mingguan, dengan pengecualian buka kunci aktif untuk `WEEKLY_REPORT`.
- Pemeriksaan pemilik dan cakupan baca dipertahankan. Fungsi `activeUnlockFor` tidak diubah; status eksekusi, masa berlaku, dan `reLockedAt` diperiksa oleh fungsi bersama itu.
- `tests/cx/evidence-access.test.ts`: 40 tes dengan basis data di-mock dan fungsi `activeUnlockFor` asli, mencakup kunci manual/penerusan/tenggat, buka kunci aktif, kedaluwarsa dan tepat batas waktu, penguncian ulang lebih awal, persetujuan belum dieksekusi, target laporan lain, pemilik lain, peran pantau, cakupan baca, laporan tidak tersedia, serta pemetaan proyek/hari TASK.

## Pemeriksaan

- `npx vitest run tests/cx/evidence-access.test.ts`: 40/40 lulus.
- `npx tsc --noEmit --incremental false`: lulus.
- `npx eslint src`: lulus.
- `npx eslint tests/cx/evidence-access.test.ts`: lulus.
- `npx vitest run`: 38 berkas, 700/700 tes lulus.
- Panduan Next.js bawaan dibaca sebelum pengeditan: `01-app/02-guides/testing/vitest.md` dan bagian lapisan akses data pada `01-app/02-guides/data-security.md`.

## Batas pengujian

Pengujian berupa unit test dengan query basis data di-mock; unggah/hapus berkas lewat browser dan penyimpanan sungguhan tidak diuji. Tidak ada akses ke Supabase, perubahan basis data, migrasi baru, atau perubahan konfigurasi tes.

Eksplorasi memakai codebase-memory Tier 2, generasi `2026-10-06T07:13:10Z`, beserta pembacaan sumber tepat. Coverage untuk evidence-access, unlock-requests, daily-rollup, auth, skema, dan route tasks tidak melaporkan masalah; hasil coverage bersifat best effort. Jalur `src/lib/weekly-board.ts` tidak ada dan tidak dipakai sebagai dasar implementasi.

Berkas pekerjaan agen lain tidak diubah atau dikembalikan.
