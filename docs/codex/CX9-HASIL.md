# CX 9 — Angka historis dan ringkasan berhalaman

Perhitungan tepat waktu memakai riwayat proyek pada hari yang dihitung.
Riwayat tidak lengkap menghasilkan `pct: null` beserta flag cakupan, alih-alih
persentase optimistis. Snapshot yang gagal dihitung tidak mengganti snapshot
lama. Hero Proyek/Divisi memakai total/ringkasan API sehingga tidak dibatasi
halaman yang sedang dimuat.

Berkas utama: `src/lib/kadiv.ts`, `kpi-math.ts`, `kpi-snapshot.ts`; route
`projects`, `weekly-reports`, `ringkasan`; komponen `kadiv/types.ts`,
`views/projects-view.tsx`, `views/divisions-view.tsx`.

Poincaré, cakupan gabungan CX 9/15: **249 tes/9 berkas lolos, 30 tes baru**;
TypeScript, lint, diff check lolos. Regresi riwayat hilang: **1 gagal sebelum
perbaikan**, log `/tmp/cx9-missing-history-red.log`; green:
`/tmp/cx9-cx15-final-tests.log`. DOCS membaca kedua log. Suite utama
`tests/cx/cx9-metrics.test.ts`.

Tidak diperlukan migrasi 0027. Tidak mengubah `ROLE_TABS`.

Bukti integrasi bersama dan versi runtime: [hasil CX 8–15](CX8–15-HASIL.md).
Riwayat pemeriksaan: [lampiran lanjutan](LANJUTAN-POIN1-7-DAN-CX8-15.md).
