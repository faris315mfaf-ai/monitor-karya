# CX 4 — PostgreSQL lokal

Compose PostgreSQL 17 mengikat loopback 54329 secara bawaan; port alternatif 54339 harus dipilih eksplisit. Skrip db-lokal.sh mendukung naik, turun, ulang (wajib --hapus-data-lokal), migrasi, dan seed. Kedua URL wajib localhost, port lokal yang dipilih, dan basis data monitor_karya_local; parameter selain schema=public ditolak. Delapan tes guard lulus, termasuk URL remote dan pengalihan host yang ditolak sebelum operasi.

Initializer Compose menyediakan metadata storage.buckets minimal yang dibutuhkan migrasi lama 0006. Ini bukan API Storage dan tidak mengubah migrasi proyek.

## Verifikasi integrasi

Port host 54329 dipakai PostgreSQL native yang tidak terkait. Layanan tersebut tidak dihentikan atau dimutasi. Pengujian memakai override Compose sementara tanpa published ports/volume persisten dan network_mode: none; PostgreSQL memakai port 54329 di namespace container, dan container Node berbagi namespace tersebut. Tidak menggunakan port alternatif atau koneksi Supabase.

Dari basis data kosong dengan initializer Compose final: seluruh 22 migrasi berhasil, seed berhasil dua kali, skrip buat-superadmin membuat admin uji, dan migrate status menyatakan skema mutakhir. Runner produksi pada database lokal terisolasi berhasil POST /api/auth/login (200, SUPERADMIN), GET /api/auth/me (200), dan GET /api/entities (200). GET /api/work-desk untuk SUPERADMIN menghasilkan 400 karena peran itu tidak memiliki meja kerja; bukan kegagalan koneksi.

Panduan penggunaan di [db-lokal.md](db-lokal.md). Resource pengujian bersifat sementara; tidak ada database nyata yang diakses.
