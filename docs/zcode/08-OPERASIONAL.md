# Operasional dan diagnosis

Panduan lengkap: [deploy](../../deploy/README.md), [checklist rilis](../../deploy/CHECKLIST-RILIS.md), [CX20](../codex/CX20-OPERASIONAL.md). Target adalah VPS aplikasi + PostgreSQL terpisah; bukti tetap Supabase Storage. Ini dokumentasi, bukan instruksi mengeksekusi produksi saat onboarding.

| Pemeriksaan | Arti |
|---|---|
| GET /api/health | Proses HTTP hidup; tidak menyatakan DB sehat |
| GET /api/health/ready | DB SELECT 1 wajib; DB gagal 503; storage gagal dengan DB sehat200 degraded |
| GET /api/health/internal | OPS_HEALTH_SECRET; 200 hanya bila DB/storage/seluruh heartbeat sehat |
| POST /api/health/backup | BACKUP_REPORT_SECRET; hanya laporan status, **tidak menjalankan backup** |

Caddy memblokir cron/health privat dari internet. Jangan membuka port publik hanya untuk meloloskan monitor. Hook backup memakai tunnel/jalur privat yang dikelola operator. Secret auth/cron/ops/backup dipisahkan. Tidak perlu kredensial pengguna untuk health internal.

Objek probe privat: bucket evidence, key `_health/readiness.txt`, isi persis `monitor-karya-storage-v1` tanpa newline. Probe baca bounded/timeout menolak redirect dan isi salah. File lokal saja tidak berarti objek telah ada di Storage.

| Jadwal WIB | Job |
|---|---|
| Tiap 30 menit sepanjang hari, termasuk akhir pekan | reminder-rules |
|09.00 Senin–Jumat|remind-divisions|
|17.30 harian|kpi-snapshot|
|01.15 harian|backup operator|
|Tiap 5 menit|monitor.sh operator|

Heartbeat AuditLog merekam running/success/failure; missing/stale/stalled/invalid adalah kegagalan. Memulai pekerjaan tidak langsung menghapus kondisi gagal sebelumnya. Exit monitor perlu dihubungkan operator ke sistem notifikasi; belum ada pengiriman email/chat otomatis. Heartbeat backup sukses tidak membuktikan hasil dump bisa direstore. Belum ada lease terdistribusi untuk mencegah cron ganda.

## Diagnosis umum

| Gejala | Periksa dahulu |
|---|---|
| Halaman berbeda dari pekerjaan terakhir | Folder/cabang/port; folder utama desain-baru tertinggal |
| Login ulang diperlukan | AUTH_SECRET berubah, sesi lama tanpa sid, akun/sandi berubah; jangan melemahkan auth |
| Akun ditolak setelah akses sementara berakhir | Snapshot lama/penugasan yang perlu rekonsiliasi; jangan tandai reverted tanpa memulihkan data |
| Prisma gagal membaca tabel | DB tujuan dan status migrasi; jangan arahkan ke Supabase sebagai jalan pintas |
| prisma CLI meminta env walau ada .env | prisma.config.ts menuntut env eksplisit |
| Health ready 200 tetapi internal 503 | Storage/heartbeat belum siap; baca status privat dengan secret yang sah |
| Unggah 503 | Konfigurasi Storage server; tautan bukti bukan pengganti uji unggah |
| Script inline diblokir produksi | CSP nonce, headers, NEXT_PUBLIC_SUPABASE_URL saat build |
| Perubahan di preview tidak berlaku pada login | Preview memakai fetch tiruan; perbaiki backend dan fixture secara konsisten |
| Laporan 409 | Tenggat WIB/beku/targetunlock; jangan menghapus guard |
| Angka lint tidak sesuai laporan lulus | Laporan memakai eslint src; lint seluruh repo lebih luas |
| Uji lokal menolak port/env | Fixture salah; jangan menonaktifkan guard |
| npm ci gagal menemukan braces | Vendor/tarball/lockfile tidak ikut dipindah |

Jangan jalankan `docker compose down -v`, seed, reset, atau skrip migrasi sebagai diagnosis umum. Jangan membunuh proses berdasarkan port tanpa memastikan pemilik layanan.
