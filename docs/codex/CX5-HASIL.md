# CX5 — data seed model terbaru

Zona: `scripts/seed.ts` dan `tests/cx/seed-guard.test.ts` (perluasan kepemilikan oleh pengguna), cabang `codex/kerja`. Tidak ada commit atau migrasi baru.

## Perubahan

- Guard dijalankan sebelum membuat PrismaClient atau menghapus data. `LOCAL_DB_PORT` bersifat opsional, bawaan `54329`, hanya menerima `54329` atau `54339`. `DATABASE_URL` wajib berupa PostgreSQL ke `127.0.0.1` atau `localhost`, pada port yang dipilih, dengan nama database persis `monitor_karya_local`; `DIRECT_URL`, bila ada, wajib memenuhi aturan host, port, dan nama database yang sama. Parameter pengalihan koneksi dan parameter yang tidak dikenal ditolak. URL datasource Prisma dipasang eksplisit sehingga `.env` tidak dapat mengganti tujuan yang telah divalidasi.
- Semua 43 model pada skema terbaru dibersihkan dalam transaksi menurut dependensi, termasuk Task/Subtask, ProjectEntity/ProjectApproval/ProjectProgressReport, WeeklyDivisionSummary, DailyReportRead, UndoToken, dan tabel tanpa FK. Relasi melingkar User–Division diputus sebelum Division dihapus; pohon Entity diputus sebelum Entity dihapus.
- Setiap divisi memiliki kepala dan PIC berakun: `User.divisionId`, `Division.headUserId`, `Project.divisionId`, dan `Project.picUserId` terisi. Empat puluh proyek mempunyai empat puluh PIC; kepala laporan mingguan dicari berdasarkan divisi, bukan PT saja.
- Contoh Output mencakup empat status, bukti tautan berformat `link:OUTPUT:…`, dan riwayat revisi. Bukti hanya disimpan sebagai metadata tautan; tidak ada unggahan atau akses Supabase Storage.
- Ditambahkan ProjectNote/NoteRead, tiga ProjectStage per proyek, DeadlineProposal dengan tiga keputusan (persetujuan juga mengubah tenggat proyek), Attendance dengan lima status, AccessRequest, empat ReminderRule per PT, WeeklyReportRead/Comment, ProjectReview, ApprovalRequest materi/anggaran/cuti.
- Ditambahkan contoh Task/Subtask, ProjectApproval/ProjectEntity/ProjectProgressReport, DailyReportRead, dan WeeklyDivisionSummary. Ringkasan memakai jumlah output diterima/menunggu review yang dibaca dari data.
- Eskalasi, buka kunci, dan audit lama kini menunjuk rekaman nyata. Laporan minggu berjalan selalu dibuat untuk setiap divisi; laporan hari berjalan tidak lagi dilewati secara acak.

## Pemeriksaan

- `npx tsc --noEmit --incremental false`: lulus.
- `npx eslint scripts/seed.ts tests/cx/seed-guard.test.ts`: lulus.
- `git diff --check -- scripts/seed.ts`: lulus.
- `npx vitest run tests/cx/seed-guard.test.ts`: 24 tes subprocess lulus (6 URL lokal diterima lalu berhenti pada validasi sandi, 18 konfigurasi ditolak guard). Tidak ada koneksi database.
- Lima eksekusi guard dengan URL sintetis: host remote, port salah, parameter `host` pengalih, DIRECT_URL remote, dan DATABASE_URL kosong semuanya ditolak sebelum koneksi/mutasi.
- Pemeriksaan terhadap `prisma/schema.prisma`: cleanup mencakup 43/43 model.
- Panduan Next bundel `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` dibaca sebelum edit.
- Seed dan skema dibaca langsung; scripts/seed tidak termasuk cakupan indeks graph yang diberikan agen induk.

## Batasan dan verifikasi integrasi

Port host `54329` dipakai PostgreSQL native yang tidak terkait; layanan tersebut tidak disentuh. Agen induk menguji Compose final dalam namespace Docker tanpa jaringan eksternal dan tanpa published ports, dengan PostgreSQL port 54329 di dalam container. Tidak memakai port alternatif 54339. Dari database kosong seluruh 22 migrasi berhasil, seed dijalankan dua kali tanpa galat FK, admin uji dibuat, dan status migrasi mutakhir.

Pemeriksaan SQL sesudah seed kedua: Output 40, OutputRevision 20, ProjectNote 40, NoteRead 40, ProjectStage 120, serta DeadlineProposal, Attendance, AccessRequest, ReminderRule, WeeklyReportRead, WeeklyReportComment, ProjectReview, ApprovalRequest masing-masing 40. Seluruh 40 proyek mempunyai divisionId dan picUserId. Login admin serta pembacaan sesi dan data entitas melalui runner produksi lokal berhasil.

Seed mengosongkan seluruh data lokal lalu membuat ulang contoh; ID dan sebagian jumlah laporan historis berubah karena data lama masih memakai random. Jangan menjalankannya terhadap database lokal berisi data yang ingin dipertahankan. Supabase tidak disentuh.

## Dukungan port alternatif (pembaruan)

Untuk port alternatif yang disetujui, set `LOCAL_DB_PORT=54339` dan arahkan kedua URL ke `postgresql://<akun>:<sandi>@127.0.0.1:54339/monitor_karya_local`. Tanpa LOCAL_DB_PORT, hanya `54329` diterima. Port yang berbeda di salah satu URL, nama database lain, serta konfigurasi port selain dua pilihan ditolak.

Tes `tests/cx/seed-guard.test.ts` menjalankan subprocess seed dengan kata sandi sengaja lemah dalam setiap kasus; URL yang lolos guard berhenti pada validasi sandi, sebelum PrismaClient dibuat. Tes tidak membuka koneksi atau menjalankan seed.
