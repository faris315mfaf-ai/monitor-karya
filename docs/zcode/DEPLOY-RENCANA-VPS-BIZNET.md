# Rencana deploy — KVM 8 Hostinger + Biznet (database terkelola + S3 bukti)

Disusun Zcode, 8 Oktober 2026, atas keputusan pemilik: **aplikasi di satu VPS Hostinger KVM 8; basis data di layanan database Biznet; berkas bukti di object storage Biznet (S3-compatible)**. Dokumen ini menyiapkan deploy — tidak menjalankan apa pun ke VPS/Biznet/produksi. Semua langkah di bawah dijalankan operator; paket asli [`deploy/README.md`](../../deploy/README.md) tetap berlaku untuk bagian yang tidak berubah, dokumen ini menimpa bagian yang berbeda.

## Arsitektur

```
Internet ──443──▶ Caddy ──▶ monitor-karya:3000      (VPS aplikasi Hostinger KVM 8)
                              │
                              ├── TLS ──▶ PostgreSQL terkelola Biznet   (DATABASE_URL/DIRECT_URL)
                              └── TLS ──▶ Object storage Biznet (S3)    (bukti + probe readiness)
Cadangan: pg_dump dari VPS aplikasi (kontainer postgres:17) → enkripsi age → R2/B2 (rclone)
```

Perbandingan dengan rencana dua-VPS lama:

| Bagian lama | Status baru |
|---|---|
| VPS aplikasi KVM 8 + Caddy + harden | **Tetap** (`deploy/common/harden.sh`, `deploy/app-vps/setup-app-host.sh`) |
| VPS database KVM 2 + `setup-postgres.sh` + `new-database.sh` | **Tidak terpakai** — diganti database terkelola Biznet |
| WireGuard antar-VPS | **Tidak terpakai** — koneksi DB lewat TLS publik + allowlist IP |
| Supabase Storage untuk bukti | **Diganti** driver S3 ke object storage Biznet (`STORAGE_DRIVER=s3`) |
| backup.sh di host database | **Diganti** `deploy/db-vps/backup-terkelola.sh` dari VPS aplikasi |
| Cadangan terenkripsi age → R2/B2 | Tetap (kunci privat age tetap di luar VPS) |
| Cron tiga job + monitor.sh tiap 5 menit | **Tetap** (`deploy/app-vps/cron.sh`, `monitor.sh`) |

## Yang harus disiapkan pemilik (sebelum hari rilis)

1. **VPS KVM 8 Hostinger** — Ubuntu 24.04. Pusat data: pilih yang terdekat ke region Biznet Anda (Biznet Gio berada di Jakarta; Hostinger terdekat Singapura). **Peringatan latensi**: tiap halaman menjalankan beberapa kueri; RTT Jakarta↔Singapura ±10–15 ms per kueri menambah puluhan–ratusan ms per layar. Ukur dulu dengan `ping`/`pg_isready` dari calon VPS ke host DB sebelum membayar; bila terasa, opsi: paket Biznet dengan endpoint yang lebih dekat, atau `pgbouncer` (parameter `pgbouncer` sudah diizinkan di URL koneksi).
2. **Database Biznet** — PostgreSQL versi 16/17 (16 versi minimum yang didukung Prisma; 17 disarankan, setara uji lokal). Catat: host, port, nama database (`monitor_karya`), pengguna, kata sandi. Pastikan: TLS aktif (`sslmode=require`), **IP allowlist hanya IP publik VPS aplikasi**, dan pengguna boleh membuat/mengubah skema di database itu (migrasi 0002–0029 butuh DDL). Migrasi proyek tidak memakai ekstensi khusus (sudah diverifikasi) sehingga kompatibel layanan terkelola.
3. **Object storage Biznet (S3-compatible)** — buat bucket privat bernama `evidence`, buat pasangan access key/secret key. Catat endpoint (origin murni, tanpa path). Buat juga objek probe: `evidence/_health/readiness.txt` berisi **tepat** `monitor-karya-storage-v1` tanpa newline (readiness internal akan `degraded` tanpa ini).
4. **Domain + DNS** (A record ke IP VPS aplikasi), **akun R2/B2** untuk cadangan offsite, **pasangan kunci age** (publik di VPS, privat di laptop).
5. **Kode di VPS**: repo ini harus tersedia di VPS — jalur distribusi (push privat / git bundle) masih menunggu keputusan Anda.

## Langkah rilis (operator)

1. **Siapkan VPS aplikasi**: ikuti `deploy/README.md` langkah 1–2 (beli OS, `harden.sh`; uji SSH sesi kedua sebelum menutup root) dan langkah 5 (`setup-app-host.sh`, ganti email di Caddyfile). **Lewati langkah 3–4** (WireGuard, PostgreSQL VPS).
2. **Ambil kode + env**: clone repo ke `/srv/apps/monitor-karya`; salin `deploy/app-vps/env.production.biznet.example` → `.env.production` (chmod 600); isi seluruh `GANTI` (DB Biznet, empat rahasia acak berbeda: AUTH_SECRET/CRON_SECRET/OPS_HEALTH_SECRET/BACKUP_REPORT_SECRET ≥32, kunci S3 Biznet, domain di APP_ORIGINS). Validasi: `docker compose -f deploy/app-vps/docker-compose.yml --env-file .env.production config -q`.
3. **Pindahkan data dari Supabase** (bila memakai data lama): umumkan jendela berhenti mengisi, lalu `SUPABASE_URL='postgresql://...' sudo -E bash deploy/db-vps/migrate-from-supabase.sh monitor_karya` dengan `TARGET` diarahkan ke database Biznet — baca kepala skripnya dulu; `_prisma_migrations` 0001–0012 ikut terbawa.
4. **Migrasi skema**: `bash deploy/app-vps/deploy.sh` — jalur `migrate` otomatis memakai `DATABASE_URL` dari `.env.production` (Biznet) dan menerapkan migrasi tertunda **berurutan** sesuai A1 (0013…0028, kini + 0029; 0020/0022/0024 memang kosong). Baca diagnostik Prisma sebelum jawab "ya". Kemudian backfill `User.divisionId`/`Project.divisionId` (A1) dan audit hibah PIC historis tanpa snapshot.
5. **Caddy + DNS**: salin `monitor-karya.caddy` ke `/srv/proxy/sites/`, isi domain, `caddy validate` lalu `caddy reload`; arahkan DNS. Verifikasi `/api/cron/*` dan health privat ditolak dari internet.
6. **Cadangan**: pasang `deploy/db-vps/backup-terkelola.sh` di VPS aplikasi (kepala skrip berisi cara pasang + crontab 01.15 WIB + env `/etc/mk-backup/env`). Lalu **uji pulihkan**: salin satu dump `.age` ke laptop, dekrip, `pg_restore` ke database uji terpisah — dengan klien pg ≥17. Skrip sudah diuji lokal 8 Okt (dump→checksum→retensi lulus; jalur age/rclone/laporan aktif bila alatnya terpasang).
7. **Cron + monitor**: tempel tiga baris `cron.sh` (reminder-rules **tiap 30 menit sepanjang hari**; remind-divisions 09.00 Sen–Jum; kpi-snapshot 17.30 WIB); `monitor.sh` tiap 5 menit; hapus `crons` dari `vercel.json` bila Vercel tak dipakai.
8. **Verifikasi pasca-rilis** mengikuti [`deploy/CHECKLIST-RILIS.md`](../../deploy/CHECKLIST-RILIS.md): login tiap peran tanpa 500, unggah/hapus bukti nyata ke bucket Biznet (pengganti A2-08 versi Supabase — jalur S3 sudah terbukti lokal 34/34 via MinIO di T2-B4), readiness internal 200 dengan storage `ok`, cron 404 dari luar, semua pengguna masuk ulang sekali.

## Catatan keamanan khusus arsitektur ini

- **Allowlist IP satu arah**: database Biznet hanya menerima koneksi dari IP VPS aplikasi. Jangan buka ke 0.0.0.0/0.
- **TLS wajib** di URL DB (`sslmode=require`); verifikasi `pg_hba`-nya Biznet tidak menurunkan ke md5 (scram-sha-256).
- Kredensial S3 Biznet hanya di `.env.production` (600); CSP otomatis mengizinkan origin `S3_ENDPOINT` untuk gambar/koneksi/media (tidak perlu `NEXT_PUBLIC_SUPABASE_URL` lagi).
- `AllowTcpForwarding no` dari `harden.sh` **tidak lagi menghalangi** hook laporan backup (temuan T2-B8): `backup-terkelola.sh` melapor lewat `docker exec` ke kontainer aplikasi, bukan tunnel SSH. Skrip `report-backup.py` lama tidak dipakai pada arsitektur ini.
- Cadangan tetap terenkripsi age sebelum meninggalkan VPS; kunci privat tidak pernah di server.

## Keputusan/verifikasi yang masih menunggu pemilik

1. Region pasti VPS Hostinger vs endpoint Biznet + hasil uji latensi.
2. Produk database Biznet persis yang dipakai (versi PG, batas koneksi, TLS) — isi contoh env dari panel.
3. Jalur distribusi kode ke VPS (push privat atau bundle).
4. Verifikasi eksternal pertama ke bucket Biznet nyata (unggah/hapus dari aplikasi) — menggantikan A2-08 Supabase.
5. Persetujuan jendela migrasi data + pengumuman masuk ulang sekali bagi pengguna.

## Batas persiapan ini

- Skrip dan contoh env belum diuji terhadap layanan Biznet sungguhan (nama host di contoh adalah placeholder); `backup-terkelola.sh` teruji terhadap PostgreSQL 17 lokal termasuk temuan keanehan `pg_dump --file=-`.
- Dokumen ini menyiapkan, bukan mengeksekusi: tidak ada akses VPS/Biznet/produksi yang dilakukan.
- Yang sudah terbukti dan menopang rencana ini: gladi rilis Docker dari nol ([HASIL-GLADI-RILIS](HASIL-GLADI-RILIS.md)), uji S3 end-to-end lokal ([T2-B4](laporan-swarm/T2-B4-LAPORAN.md)), audit skrip deploy 10/10 ([T2-B8](laporan-swarm/T2-B8-LAPORAN.md)).
