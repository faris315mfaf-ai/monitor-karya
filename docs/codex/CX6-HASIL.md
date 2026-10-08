# CX6 — Audit paket deploy VPS

Status: perbaikan dan pemeriksaan statis selesai pada worktree
`/Users/godam/PROYEK/monitor-karya-codex`, cabang `codex/kerja`.
Build runner dan pemeriksaan runtime diserahkan kepada agen integrasi.
Tidak ada commit, migrasi baru, koneksi Supabase sungguhan, rilis eksternal,
atau eksekusi skrip infrastruktur pada host selama audit.

## Perubahan

- Deploy menolak pohon kerja kotor/ref opsi, memakai lock rilis, tag commit penuh,
  dan pencarian container lewat Compose. Status Prisma tidak lagi disaring dengan
  frasa rapuh atau diabaikan diam-diam. Operator selalu mengonfirmasi migrasi;
  keberhasilan `migrate deploy` wajib sebelum aplikasi diganti.
- Rollback memakai image lokal sebelumnya tanpa build/pull; pemangkasan image
  otomatis dihapus agar image pemulihan tetap tersedia. Rollback tidak membatalkan skema.
- Docker build menggunakan DATABASE_URL/DIRECT_URL ke `127.0.0.1:1` dan AUTH_SECRET
  tiruan; kredensial dan cadangan tambahan dikecualikan oleh `.dockerignore`.
- Compose mendukung APP_ENV_FILE untuk validasi dengan env sementara; deploy.sh
  memaksanya ke env produksi yang sama dengan interpolasi. App/migrate tetap tanpa ports.
- Cron membatasi tiga job yang dikenal, menolak secret kosong dan membatasi waktu fetch.
- Restore memvalidasi identifier, memakai parameter psql dan ON_ERROR_STOP,
  serta transaksi tunggal. Import database melalui stdin memperbaiki akses user
  postgres ke dump dalam direktori root 700. URL dump dan password role tidak
  lagi diberikan sebagai argumen proses klien PostgreSQL.
- Backup memakai umask privat, daftar database per baris, validasi nama/retensi,
  path lokal kanonis, checksum relatif dan penghapusan direktori berformat timestamp saja.
- Pengerasan SSH memakai konfigurasi awal (Ubuntu membaca nilai pertama), validasi
  admin/port/kunci satu baris dan penanganan socket activation. Setup PostgreSQL
  memvalidasi variabel serta alamat WireGuard secara tepat, bukan regex substring.
- Contoh env tetap STORAGE_DRIVER=supabase. README dan CHECKLIST-RILIS.md memuat
  langkah operator, cadangan, migrasi dan keterbatasan rollback.

## Pemeriksaan

- Panduan Next terbundel yang dibaca: `01-app/02-guides/self-hosting.md`
  dan `01-app/02-guides/environment-variables.md`; variabel publik tetap dibakukan saat build.
- Seluruh 9 skrip `deploy/**/*.sh`: `bash -n` lolos.
- ShellCheck 0.11.0: `shellcheck -S warning` seluruh 9 skrip lolos tanpa warning/error.
  ShellCheck dipasang melalui Homebrew untuk audit.
- Docker Compose v5.1.2: `config --format json` untuk app (profil migrate)
  dan proxy sah, memakai env sementara dengan URL `127.0.0.1:1`, bukan env nyata.
- Assertion hasil config: app/migrate tidak mempunyai published port;
  hanya Caddy menerbitkan TCP 80/443 dan UDP 443.
- `git diff --check` lolos untuk zona deploy, Dockerfile dan .dockerignore.
- Berkas deploy/config merupakan sumber di luar graph indeks; audit membaca
  berkas langsung. Tidak melakukan mutasi graph atau eksplorasi struktur aplikasi.

## Batas verifikasi

- Belum menjalankan build image, container runtime, Caddy validate, deploy.sh,
  migrasi, backup/restore, setup VPS, SSH/UFW/WireGuard atau cron nyata.
  Agen induk akan build runner setelah perubahan ini; operator menguji infrastruktur
  hanya pada host yang diotorisasi. Akses daemon Docker dalam sandbox ditolak
  saat inventaris read-only; validasi Compose tidak membutuhkan daemon.
- Healthcheck `/login` hanya membuktikan HTTP server hidup, bukan koneksi database
  atau penyimpanan. Rollback image masih perlu pemeriksaan kesehatan oleh operator.
- Setup SSH bergantung Ubuntu 24.04 dan perlu pemeriksaan `sshd -T` serta sesi kedua.
  Setup PostgreSQL memakai subnet paket `10.10.0.0/24`; subnet lain memerlukan penyesuaian.
- `new-database.sh` tetap merotasi password role yang sudah ada; operator harus
  memperbarui env aplikasi bila menjalankannya kembali. Retensi remote backup
  masih best effort; pantau kegagalan penghapusan dan lifecycle penyimpanan.
- Pemeriksaan aplikasi `tsc`, eslint, vitest dan build bukan bagian pemeriksaan
  statis CX6; dijalankan agen integrasi bersama hasil tugas CX lainnya.

## Verifikasi oleh agen induk

`docker build --target runner -t monitor-karya:cx-check .` berhasil. Container dijalankan sebagai node non-root dengan filesystem read-only, cap-drop ALL dan no-new-privileges serta tmpfs cache. Healthcheck healthy; GET /login 200 dan /pratinjau 404 di produksi. URL DB runtime sengaja menunjuk port mati 1; ini uji HTTP/runtime, bukan uji DB produksi.

Runner kedua memakai PostgreSQL lokal terisolasi: login admin, pembacaan sesi dan data entitas semuanya 200. Pengujian ini membuktikan koneksi aplikasi ke skema lokal; skrip VPS, backup/restore dan perubahan jaringan host tetap belum dieksekusi.
