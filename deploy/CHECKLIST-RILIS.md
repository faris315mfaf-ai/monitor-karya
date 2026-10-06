# Checklist rilis VPS

Checklist ini untuk operator ketika rilis VPS sudah diotorisasi. Audit CX6 hanya
menjalankan pemeriksaan statis; jangan menjalankan skrip infrastruktur pada laptop
pengembangan. Supabase Storage tetap driver bawaan. Pemindahan database sungguhan
atau berkas bukti memerlukan instruksi pengguna tersendiri.

## Sebelum rilis

- [ ] Commit rilis sudah disetujui; pohon kerja VPS bersih; tidak ada rilis lain berjalan.
- [ ] `bash -n` dan `shellcheck -S warning` lolos untuk semua `deploy/**/*.sh`.
- [ ] `tsc`, lint, tes, build Next dan build image runner lolos pada commit yang sama.
- [ ] Build memakai DATABASE_URL/DIRECT_URL tiruan di Dockerfile. Rahasia produksi tidak dimasukkan ke build arg atau konteks build.
- [ ] `.env.production` bukan symlink, izin 600; AUTH_SECRET dan CRON_SECRET acak; APP_ORIGINS berisi origin HTTPS yang tepat.
- [ ] NEXT_PUBLIC_SUPABASE_URL benar saat build; perubahan variabel publik membutuhkan build baru.
- [ ] STORAGE_DRIVER tetap `supabase`, service role hanya server; jangan memakai akun Supabase sungguhan untuk pengujian audit.
- [ ] `docker compose -f deploy/app-vps/docker-compose.yml --env-file .env.production config -q` lolos. Jangan menyimpan output config lengkap karena mengandung rahasia.
- [ ] Compose aplikasi/migrate tidak mempunyai `ports`; hanya Caddy menerbitkan TCP 80/443 dan UDP 443. Jaringan eksternal `web` sudah ada.
- [ ] Operator memeriksa konfigurasi Caddy dengan `caddy validate`, domain dan email sertifikat benar; `/api/cron/*` ditolak; header IP klien ditimpa.
- [ ] Uji SSH admin dari sesi kedua sebelum menutup sesi lama. Periksa `sshd -T`, port SSH, socket activation, sudo, UFW, firewall panel dan WireGuard.
- [ ] PostgreSQL hanya melalui WireGuard; periksa koneksi dari container dan penolakan port publik 5432. Verifikasi TLS sesuai kebijakan produksi.
- [ ] Cadangan terenkripsi terbaru berhasil disalin ke penyimpanan luar VPS; SHA256SUMS lolos; pemulihan ke database uji terpisah telah berhasil.
- [ ] Daftar migrasi tertunda sesuai commit rilis, tidak ada migrasi gagal. Skema baru tetap kompatibel dengan image sebelumnya atau operator menyediakan rencana pemulihan database.

## Saat rilis (operator VPS)

- [ ] Jalankan deploy.sh hanya di host rilis yang diotorisasi. Baca seluruh diagnostik Prisma sebelum konfirmasi `ya`; status gagal bisa berarti koneksi gagal, bukan sekadar migrasi tertunda.
- [ ] `migrate deploy` wajib berhasil sebelum container diganti. Tidak ada migrasi baru yang dibuat oleh CX6.
- [ ] Simpan image sebelumnya sampai rilis terverifikasi. Script tidak memangkas image agar rollback tersedia.
- [ ] Kesehatan `/login` lolos. Bila rollback image dilakukan, ingat skema database tetap versi baru; verifikasi kembali kesehatan image lama secara manual.

## Setelah rilis

- [ ] HTTPS, masuk akun, peran, buka kunci, papan mingguan dan unggah/hapus bukti lolos dengan akun uji yang diotorisasi.
- [ ] Cron tiga job berjalan dari container dengan secret; endpoint cron dari internet menghasilkan 404.
- [ ] Jejak audit IP, log aplikasi, ruang disk dan cadangan dipantau. `/login` hanya membuktikan server hidup; uji fungsi database dan penyimpanan tersendiri.
- [ ] Catat commit/image, waktu, migrasi dan hasil pemeriksaan tanpa menyalin rahasia.

## Pemeriksaan lokal tanpa layanan sungguhan

Gunakan env sementara dengan URL basis data `postgresql://x:y@127.0.0.1:1/db`.
Setel `APP_ENV_FILE` ke path absolut env sementara dan `--env-file` ke berkas yang
sama ketika menjalankan `docker compose ... config`. Ini hanya memvalidasi config;
tidak membuat jaringan, container, atau koneksi database. Build runner dan uji
runtime dilakukan oleh agen integrasi setelah perubahan CX6 tersedia.
