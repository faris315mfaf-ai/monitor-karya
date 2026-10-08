# CX 8 — Bug kecil yang diketahui

Implementasi perbaikan tersedia dan tes terfokus lolos. Auditor hanya diberi
subjudul keputusan eskalasi; TI tidak melihat tombol Ajukan permintaan.
Pengiriman ringkasan atomik menghasilkan satu sukses dan satu 409 pada kiriman
bersamaan. Sasaran buka kunci yang hilang menghasilkan 404 pada semua tindakan.
Overview Admin memakai hitungan kepatuhan bersama.

Usulan tenggat sebelum hari ini WIB ditolak 422; tanggal hari ini boleh.
**Keputusan bawaan:** penolakan tenggat lewat ini bukan keputusan produk yang
sudah dikonfirmasi pemilik.

Berkas: `admin/access-requests-card.tsx`, `oversight/management-dashboard.tsx`,
route `unlock-requests`, `admin/overview`, `deadline-proposals`, dan
`kadiv/weekly-summary` di `src/app/api/`.

Confucius: **18 tes gagal sebelum perbaikan → 139 tes lolos**. Tes:
`tests/cx/cx8-regressions.test.ts`, `tests/api/admin-overview-reminders.test.ts`,
`tests/api/pic-project-routes.test.ts`. Seleksi atomik 75 tes/3 suite lolos;
seleksi terdahulu 79 berbeda cakupan. Race PostgreSQL/HTTP kirim ringkasan
200/409 lolos; log `/private/tmp/cx-phase1-race.log` dibaca DOCS.

Bukti integrasi bersama dan versi runtime: [hasil CX 8–15](CX8–15-HASIL.md).
Riwayat pemeriksaan: [lampiran lanjutan](LANJUTAN-POIN1-7-DAN-CX8-15.md).
