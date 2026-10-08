# Laporan T2-B8 — Dry-run dan audit kesiapan skrip deploy (Tahap 4, LAPORAN-SAJA)

Tanggal: 8 Oktober 2026 · Cabang: `codex/kerja` (basis `6327963`) · Zona: `deploy/**` hanya-baca.
Tidak ada skrip deploy yang diubah; satu-satunya berkas yang ditulis agen ini adalah laporan ini.

## Ringkasan

- **Lint statis: 10/10 skrip lolos** `bash -n` dan `shellcheck -S warning` (ShellCheck 0.11.0). Dua catatan level-info tambahan (SC2015 di `harden.sh`, SC2024 di `migrate-from-supabase.sh`) keduanya bukan cacat fungsional di konteks skripnya.
- **Konsistensi dokumen: lolos semua.** Jadwal di kepala `cron.sh` persis CX20; `monitor.sh`/`monitor-check.mjs` cocok kontrak exit/health CX20; `deploy.sh` memenuhi checklist rilis (konfirmasi "ya", `migrate deploy` sebelum kontainer diganti, image lama tidak dipangkas); `env.production.example` lengkap untuk driver `supabase` dan cocok dengan inventaris env `docs/zcode/10-INVENTARIS-KODE.md`.
- **Gladi restore lokal: BERHASIL.** Kontainer `postgres:17-bookworm` sekali pakai di `127.0.0.1:54362` (image sudah lokal, tanpa pull), pola `backup.sh` (`pg_dump -Fc -Z 6`) → pola `restore.sh` (`createdb -O` + `pg_restore --no-owner --no-privileges --role --exit-on-error --single-transaction`) menghasilkan DB `monitor_karya_uji` dengan jumlah baris identik, isi eksak identik (EXCEPT dua arah = 0), dan kepemilikan objek jatuh ke role aplikasi. Kontainer dan berkas sementara sudah dihapus; port 54362 bebas kembali.
- **Tidak ada temuan TINGGI.** Satu temuan SEDANG (konflik `AllowTcpForwarding no` di `harden.sh` vs opsi tunnel loopback SSH untuk hook laporan backup CX20 — butuh keputusan operator, ada alternatif HTTPS privat) dan beberapa catatan RENDAH dengan usulan diff pada bagian akhir.
- Kesimpulan: dari sisi skrip, `deploy/**` siap untuk Tahap 4. Usulan diff bersifat opsional/peningkatan, bukan pemblokir.

## 1. Lint statis

Skrip diperiksa (semua di `deploy/`): `app-vps/deploy.sh`, `app-vps/cron.sh`, `app-vps/monitor.sh`, `app-vps/setup-app-host.sh`, `common/harden.sh`, `db-vps/setup-postgres.sh`, `db-vps/new-database.sh`, `db-vps/backup.sh`, `db-vps/restore.sh`, `db-vps/migrate-from-supabase.sh`.

| Skrip | `bash -n` | `shellcheck -S warning` |
|---|---|---|
| app-vps/deploy.sh | Lolos | Bersih |
| app-vps/cron.sh | Lolos | Bersih |
| app-vps/monitor.sh | Lolos | Bersih |
| app-vps/setup-app-host.sh | Lolos | Bersih |
| common/harden.sh | Lolos | Bersih |
| db-vps/setup-postgres.sh | Lolos | Bersih |
| db-vps/new-database.sh | Lolos | Bersih |
| db-vps/backup.sh | Lolos | Bersih |
| db-vps/restore.sh | Lolos | Bersih |
| db-vps/migrate-from-supabase.sh | Lolos | Bersih |

Tambahan `-S info` (bukan gerbang checklist, hanya bukti kerja):

- `common/harden.sh:25` — SC2015 pada `[[ regex ]] && (( rentang )) || { exit 1 }`. Idiom A&&B||C di sini benar: regex gagal → C; rentang gagal → C. Nilai kosong ditutup regex `^[0-9]{1,5}$`. Bukan bug; gaya saja.
- `db-vps/migrate-from-supabase.sh:34` — SC2024: `< "$WORK/public.dump"` dibuka pemanggil (root), bukan `sudo -u postgres`. Aman karena skrip memang wajib dijalankan sebagai root (`[[ $EUID -eq 0 ]]`) dan `$WORK` dibuat root 700. Bukan bug.

## 2. Audit konsistensi per skrip

### 2.1 cron.sh vs CX20 — LOLOS

- Jadwal di kepala skrip vs CX20 "Rahasia dan jadwal":
  - `0 9 * * 1-5` remind-divisions = 09.00 Senin–Jumat — cocok CX20 "Hari kerja 09.00".
  - `*/30 * * * *` reminder-rules = tiap 30 menit sepanjang hari termasuk akhir pekan — cocok CX20 (judul lama 07–18/hari kerja sudah tidak dipakai; CX20 menyebut cron.sh sudah memuat jadwal baru).
  - `30 17 * * *` kpi-snapshot = 17.30 harian — cocok CX20 "Harian 17.30".
  - Waktu host dijamin WIB oleh `harden.sh` (`timedatectl set-timezone Asia/Jakarta`) — rantai konsisten.
- Kontrak respons: skrip menuntut `r.status === 200 && body.ok === true`. Implementasi `runOperationalJob` (src/lib/operational-health.ts:125-137) mengembalikan `privateJson(result, result.ok ? 200 : 503)`; route reminder-rules mengembalikan `ok: expected.size === 0` sehingga kegagalan parsial → `ok:false` → cron.sh exit 1. Timeout fetch 650 s ≥ maxRunMs 10 menit (600 s). `redirect: 'error'` sesuai kebijakan. CRON_SECRET dibaca dari env kontainer (env_file `.env.production`), tidak pernah di crontab — cocok README "Rahasia hanya di .env.production".
- Nama kontainer `monitor-karya-monitor-karya-1` cocok dengan `name: monitor-karya` + service `monitor-karya` pada `deploy/app-vps/docker-compose.yml` (nama dipatok berkas compose, tidak tergantung direktori).

Catatan RENDAH:

1. Nama kontainer dikeraskan literal di cron.sh dan monitor.sh; bila operator mengubah `name:` compose atau memakai `-p`, kedua skrip meleset diam-diam. CX20 sudah menyadarinya ("sesuaikan bila nama proyek diubah"). Usulan: variabel `COMPOSE_PROJECT_NAME` atau `docker compose exec` — opsional.
2. `cron.log`/`monitor.log` ditulis ke `/srv/apps/monitor-karya/` (dalam worktree git). Aman untuk cek pohon-bersih deploy.sh karena `.gitignore` memuat `*.log` (diverifikasi), tetapi berkas tumbuh tanpa rotasi karena tidak ada logrotate yang dipasang. Usulan diff opsional di bagian 4.

### 2.2 monitor.sh + monitor-check.mjs vs kontrak exit/health CX20 — LOLOS

- Kontrak CX20: "keluar 0 hanya bila DB, probe penyimpanan, semua cron, dan laporan backup sehat; kegagalan keluar 1". Skrip memeriksa: `checks.database === true`; `checks.storage === true && checks.storageStatus === 'ok'`; empat pekerjaan tetap (reminder-rules, remind-divisions, kpi-snapshot, backup) masing-masing tepat satu baris, `ok === true`, dan status ∈ {success, running}. Daftar status di monitor-check.mjs (`missing, invalid, failure, stalled, running, stale, success`) persis himpunan status yang dihasilkan `operationalStatus()` (src/lib/operational-health.ts:147-165). Semantik "running hanya sehat bila run terminal sukses masih segar" dihitung server dan tercermin di field `ok` yang dipercaya skrip — konsisten.
- `OPS_HEALTH_SECRET` minimal 32 karakter di monitor-check.mjs cocok `refuseOperational` (min 32; salah → 401; belum disetel → 503 generik). Timeout fetch 15 s, `redirect: 'error'`. Tanpa notifikasi eksternal — cocok CX20 "kode keluar gagal adalah sinyal integrasi pemantau".
- `docker exec -i ... node --input-type=module < monitor-check.mjs` mengalirkan skrip via stdin; rahasia tetap di env kontainer. Bila kontainer mati, `docker exec` gagal → exit nonzero (fail-closed, `set -euo pipefail`).
- Jadwal contoh `*/5 * * * *` di kepala skrip cocok README "tiap 5 menit" dan CX20.

### 2.3 deploy.sh vs CHECKLIST-RILIS.md — LOLOS

Pemetaan item checklist "Saat rilis":

| Item checklist | Bukti di deploy.sh |
|---|---|
| Konfirmasi `ya` sebelum migrate deploy | Baris 40-41: `read -r -p "Jalankan migrate deploy? [ketik ya] "`; selain "ya" → exit 1 |
| `migrate deploy` wajib berhasil sebelum container diganti | Baris 42 `run --rm migrate` (CMD image target `migrate` = `npx prisma migrate deploy`, Dockerfile baris 49) dijalankan sebelum baris 43 `up -d`; `set -e` menjaga urutan |
| Image sebelumnya dipertahankan untuk rollback | Tidak ada `docker image prune`; `PREV_TAG` dicatat dan dipakai rollback otomatis bila tak sehat dalam 30×4 s = 2 menit |
| Pohon kerja bersih; tidak ada rilis lain berjalan | Baris 16 `git status --porcelain` kosong; baris 18-19 `flock` pada git-path `deploy.lock` |
| `.env.production` biasa (bukan symlink), 600 | Baris 14-15 |
| Diagnostik status dibaca operator, status gagal ≠ keputusan | Baris 36-38: `migrate status` non-fatal dengan pesan penjelas (komentar baris 34-35: status nonzero bisa berarti koneksi gagal) |

Verifikasi silang tambahan yang saya lakukan:

- `.gitignore` memuat `.env*` dan `*.log` sehingga `.env.production`, `cron.log`, `monitor.log` tidak mengotori `git status --porcelain` — cek pohon bersih tidak akan salah menolak rilis kedua.
- `APP_ENV_FILE` diekspor absolut dan dipakai `env_file: ${APP_ENV_FILE:-...}` pada kedua service — env migrasi = env aplikasi (komentar baris 11 sengaja menutup override shell).
- `IMAGE_TAG` = commit SHA; rollback memakai prefix env per-perintah (`IMAGE_TAG="$PREV_TAG" "${COMPOSE[@]}" up ...`) — pola bash sah.
- Penolakan ref opsi (`[[ "$REF" != -* ]]`) mencegah injeksi opsi git.

Catatan:

- RENDAH (portabilitas): `stat -c %a` dan `flock` adalah GNU/util-linux — hanya berjalan di Linux; sesuai target Ubuntu VPS dan komentar skrip. Jangan dijalankan di laptop pengembang (memang dilarang oleh kepala skrip).
- RENDAH (dokumentasi): bila rilis gagal setelah `git checkout --detach`, repo tertinggal detached pada commit baru — operator perlu tahu (README sudah menjelaskan rollback hanya image, skema DB tetap baru).

### 2.4 env.production.example vs env yang dipakai kode — LOLOS (driver supabase)

Sumber pembanding: `docs/zcode/10-INVENTARIS-KODE.md` (inventaris statis `process.env`) + pembacaan langsung sumber.

| Env di contoh | Dipakai kode di | Cocok? |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | prisma.config.ts, prisma/schema.prisma | Ya |
| `AUTH_SECRET` (min 32) | src/lib/auth.ts (min 32, pesan galat menyebut 32) | Ya |
| `CRON_SECRET` (min 16) | src/lib/cron-auth.ts `MIN_CRON_SECRET_LENGTH = 16` | Ya |
| `APP_ORIGINS` | src/proxy.ts | Ya |
| `NEXT_PUBLIC_SUPABASE_URL` | src/lib/storage.ts, security-headers.ts, operational-health.ts; juga build-arg compose | Ya (checklist "benar saat build" tercatat) |
| `SUPABASE_SERVICE_ROLE_KEY` | src/lib/storage.ts, operational-health.ts | Ya |
| `STORAGE_DRIVER=supabase` | src/lib/storage.ts (default 'supabase') | Ya |
| `OPS_HEALTH_SECRET`, `BACKUP_REPORT_SECRET` (≥32, berbeda) | operational-health.ts refuseOperational; report-backup.py | Ya |

- Env inventaris yang TIDAK ada di contoh dan memang benar: `S3_*` (hanya untuk `STORAGE_DRIVER=s3` — README menyatakan S3/MinIO di luar paket ini; CX20 menandai opsional), `NODE_ENV` (diset `environment:` compose), serta env skrip dev/uji (`CX16_*`, `MK_E2E_NOW`, `SEED_PASSWORD`, `SUPERADMIN_PASSWORD`, `TEST_*`, `PATH`).
- Format URL contoh persis keluaran `new-database.sh` (query `sslmode=require&connection_limit=20&pool_timeout=20` untuk DATABASE_URL; `sslmode=require` untuk DIRECT_URL) — konsisten antar-skrip.
- Catatan RENDAH: CX20 menyarankan menyetel `connect_timeout` juga; contoh sudah memuat `pool_timeout=20` tetapi belum `connect_timeout`. Usulan diff di bagian 4.

### 2.5 setup-app-host.sh — LOLOS

- UFW 80/tcp, 443/tcp, 443/udp cocok README "VPS aplikasi: 22, 80, 443" (22 sudah dibatasi harden.sh, tidak di-reset di sini).
- Hanya proxy/Caddy yang publish port (proxy/docker-compose.yml: 80/443) — cocok README dan checklist "hanya Caddy menerbitkan TCP 80/443 dan UDP 443"; aplikasi hanya `expose`, jaringan `web` eksternal dibuat bila belum ada.
- `daemon.json` membatasi log (20m×5), `no-new-privileges`, `live-restore` — cocok README "log kontainer dibatasi".
- Catatan RENDAH: `id "$ADMIN_USER" >/dev/null` gagal dengan pesan sistem generik bila user belum dibuat harden.sh; pesan prasyarat ada di kepala skrip.

### 2.6 common/harden.sh — LOLOS, satu temuan SEDANG lintas-skrip

- SSH: kunci saja, tanpa root, `AuthenticationMethods publickey`, `AllowUsers`, ufw limit + fail2ban backend systemd (benar untuk Ubuntu 24.04 tanpa auth.log), penanganan socket activation ssh — semua cocok README dan checklist.
- Zona waktu Asia/Jakarta adalah prasyarat implisit jadwal cron (cron.sh 09.00/17.30 dan backup 01.15 WIB) — rantai ini konsisten.
- **SEDANG — konflik dengan CX20 (hook laporan backup):** `AllowTcpForwarding no` mematikan seluruh port forwarding SSH di VPS, padahal CX20 menawarkan "tunnel loopback SSH yang dikelola operator dari VPS DB ke aplikasi" sebagai jalur `BACKUP_REPORT_URL` utama. Sebagaimana dikonfigurasi, jalur itu tidak bisa dibangun tanpa melebarkan kebijakan (mis. blok `Match User` khusus user tunnel). Alternatif yang didukung CX20 (endpoint HTTPS privat) tetap mungkin. Ini keputusan operator, bukan bug skrip; lihat usulan diff D3.
- RENDAH: regex kunci publik menerima `ssh-ed25519|ssh-rsa|ecdsa-sha2-` tetapi menolak kunci hardware `sk-ssh-ed25519@openssh.com` — cukup catatan dokumentasi.

### 2.7 db-vps/setup-postgres.sh — LOLOS

- `listen_addresses` hanya 127.0.0.1 + wg0; pg_hba menolak postgres dari jaringan, `hostssl` scram-sha-256 hanya untuk 127.0.0.1/32 dan WG_NET, sisanya `reject` — cocok README "hanya lewat WireGuard, scram-sha-256, TLS".
- Validasi WG_ADDR/WG_NET dan cek antarmuka wg0 aktif sebelum lanjut; prasyarat WireGuard ditegaskan.
- UFW port 5432 hanya `in on wg0` — cocok wireguard/README "yang terbuka hanya UDP 51820".
- Penyetelan memori formula 8 GB benar (SB=RAM/4, ECS=RAM*3/4).
- Catatan RENDAH: `statement_timeout = '60s'` global berlaku juga untuk `prisma migrate deploy` role aplikasi; migrasi/seed data sangat besar (>60 s per statement) bisa dibatalkan. Data saat ini kecil; bila kelak perlu, operator dapat `ALTER ROLE ... SET statement_timeout`. Lihat usulan diff D5 (komentar saja).
- Catatan RENDAH: URL memakai `sslmode=require` (enkripsi tanpa verifikasi sertifikat server) — risiko rendah di dalam terowongan WireGuard; layak dicatat operator.

### 2.8 db-vps/new-database.sh — LOLOS

- `\getenv` psql meta-command (butuh psql ≥15; PG17 target — aman) menghindari kata sandi di argv/ps.
- Kata sandi alfanumerik (aman untuk URL tanpa encoding), CONNECTION LIMIT 60 > pool aplikasi 20.
- Idempoten (CREATE bila belum ada + ALTER ROLE memutar kata sandi), REVOKE PUBLIC dan kepemilikan schema public ke role aplikasi — cocok README "satu database + satu role per proyek".
- URL yang dicetak persis format env.production.example — konsisten.
- Catatan RENDAH: kata sandi tetap lewati environ proses sudo sesaat (hanya terbaca root) — dapat diterima.

### 2.9 db-vps/backup.sh — LOLOS

- Cron contoh `/etc/cron.d` `15 1 * * *` root — cocok CX20 "Harian 01.15" (host WIB via harden.sh).
- Kontrak laporan CX20 terpenuhi di skrip: `running` → `success`/`failure`; kegagalan laporan awal tidak menghentikan backup; exit asli pg_dump/age/rclone dipertahankan; exit 70 bila backup sukses tetapi pelaporan gagal; `BACKUP_REQUIRED_DATABASE` wajib bila laporan aktif dan inventaris harus memuatnya; `timeout 15s` mengikat hook; runId UUID v4 divalidasi di report-backup.py.
- `pg_dumpall --globals-only` + `pg_dump -Fc -Z 6` per DB + `SHA256SUMS` + rclone offsite + retensi 14 lokal / 30 remote — cocok README. `set -o pipefail` menangkap kegagalan sumber pipa.
- Pola direktori stempel `20??????T??????Z` cocok format `date -u +%Y%m%dT%H%M%SZ` (16 karakter).
- Catatan RENDAH: semua database non-template ikut tercadang — setelah uji restore per README, `monitor_karya_uji` akan tercadang setiap hari sampai dihapus operator. Lihat usulan diff D4 (dokumentasi).

### 2.10 db-vps/restore.sh — LOLOS, TERBUKTI LOKAL (bagian 3)

- Menolak target yang sudah ada; `createdb -O OWNER`; `age -d | pg_restore --no-owner --no-privileges --role=OWNER --exit-on-error --single-transaction`; pipefail menangkap kegagalan dekripsi.
- Nama target/role divalidasi regex sebelum dipakai.
- Catatan RENDAH: tidak menjalankan `ANALYZE` setelah restore (migrate-from-supabase.sh menjalankannya) — DB pulihan lambat sampai autovacuum menyusul. Usulan diff D1.

### 2.11 db-vps/migrate-from-supabase.sh — LOLOS

- `PGDATABASE="$SUPABASE_URL" pg_dump ...` sah: libpq memperluas nilai dbname yang berawalan `postgresql://` sebagai URI koneksi, dan begitu URL tidak muncul di argv proses (tidak bocor via `ps`).
- `--exclude-table-data` NotificationLog didokumentasikan beserta cara membawanya; skema non-public sengaja tidak dibawa (sesuai README langkah 7).
- `--single-transaction` + pesan galat eksplisit bila restore dibatalkan; `ANALYZE` dijalankan; langkah lanjutan (cek `_prisma_migrations`) dicetak — cocok README langkah 7.
- Catatan RENDAH: `pg_stat_user_tables.n_live_tup` tetap estimasi meski setelah ANALYZE; untuk perbandingan eksak dengan Supabase, sarankan `SELECT count(*)` per tabel. Lihat usulan diff D6.

## 3. Gladi restore lokal — BERHASIL

Tujuan: membuktikan pola `backup.sh`/`restore.sh` bekerja dengan alat lokal, tanpa menyentuh jaringan eksternal, DB pengguna (54339), maupun kontainer lain yang berjalan.

Lingkungan: Docker 29.4.0; image `postgres:17-bookworm` (PostgreSQL 17.11) sudah ada lokal — tanpa pull; port acak sekali pakai `127.0.0.1:54362` (diperiksa bebas sebelum dan sesudah). Klien pg lokal laptop adalah PostgreSQL 14.24 (Homebrew) sehingga **tidak bisa** dump dari server 17 — `pg_dump`/`pg_restore` dijalankan dari dalam kontainer (versi 17, sama dengan VPS). Ini juga catatan operasional: operator yang menguji restore di laptop perlu klien ≥17 atau menjalankan di host DB.

Perintah persis yang dijalankan (nilai `$PASS` acak, tidak dicatat):

```bash
TMP="$(mktemp -d /tmp/mk-t2b8-restore.XXXX)"
PASS="$(openssl rand -base64 24 | tr -d '/+=')"
docker run -d --name mk-t2b8-restore -e POSTGRES_PASSWORD="$PASS" \
  -p 127.0.0.1:54362:5432 postgres:17-bookworm
for i in $(seq 1 30); do docker exec mk-t2b8-restore pg_isready -U postgres -q && break || sleep 1; done

# Role aplikasi + DB sumber dengan tabel bernama terkutip PascalCase (persis gaya skema Prisma tanpa @@map)
docker exec mk-t2b8-restore psql -U postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE ROLE monitor_karya_app LOGIN;' -c 'CREATE DATABASE monitor_karya_sumber;'
docker exec -i mk-t2b8-restore psql -U postgres -d monitor_karya_sumber -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "_prisma_migrations" (id varchar(36) PRIMARY KEY, checksum text NOT NULL,
  migration_name text NOT NULL, finished_at timestamptz, applied_steps_count int NOT NULL DEFAULT 0);
CREATE TABLE "User" (id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE "DailyReport" (id uuid PRIMARY KEY, "userId" uuid NOT NULL REFERENCES "User"(id),
  report_date date NOT NULL, progress int NOT NULL, note text);
INSERT INTO "_prisma_migrations" VALUES ('...0001','sha256:aaa','0001_init',now(),0),('...0002','sha256:bbb','0029_ops',now(),0);
INSERT INTO "User" VALUES (4 baris: Andi/Budi/Citra/Dewi, peran berbeda);
INSERT INTO "DailyReport" VALUES (7 baris; mencakup NULL, teks dengan tanda kutip ganda dan '%', FK lintas pengguna);
SQL

# Pola backup.sh (lapisan age dilewati: age tidak terpasang di laptop; age hanya pipa tambahan yang tidak mengubah format)
docker exec mk-t2b8-restore pg_dump -U postgres -Fc -Z 6 monitor_karya_sumber > "$TMP/monitor_karya.dump"
# Hasil: arsip CUSTOM 1.16-0, kompresi gzip, 15 entri TOC, 4.960 byte.

# Pola restore.sh
docker exec mk-t2b8-restore createdb -U postgres -O monitor_karya_app monitor_karya_uji
docker exec -i mk-t2b8-restore pg_restore -U postgres --no-owner --no-privileges \
  --role=monitor_karya_app -d monitor_karya_uji --exit-on-error --single-transaction < "$TMP/monitor_karya.dump"
```

Verifikasi:

| Pemeriksaan | Hasil |
|---|---|
| Jumlah baris `User` | sumber 4 = target 4 |
| Jumlah baris `DailyReport` | sumber 7 = target 7 |
| Jumlah baris `_prisma_migrations` | sumber 2 = target 2 |
| Isi eksak (EXCEPT dua arah via dblink, semua kolom, 3 tabel) | 0 beda (termasuk baris berisi tanda kutip, `%`, NULL) |
| Kepemilikan objek di target | `User`, `DailyReport`, `_prisma_migrations` → `monitor_karya_app` (efek `createdb -O` + `--role`) — sesuai tata letak VPS |
| Checksum (menggemakan langkah SHA256SUMS backup.sh) | sha256 arsip dicatat saat gladi; arsip dihapus bersama berkas sementara |

Bersih-bersih (sudah dijalankan dan diverifikasi):

```bash
docker rm -f mk-t2b8-restore && rm -rf "$TMP"
# docker ps -a: tidak ada sisa mk-t2b8; port 54362 bebas kembali; kontainer lain tidak disentuh.
```

Batasan gladi: lapisan enkripsi `age` (dump.age) tidak dibuktikan karena `age` tidak terpasang di laptop — di VPS itu pipa simetris di sekitar arsip custom yang sama; uji dekripsi pertama tetap disarankan operator di mesin pemegang kunci rahasia (sudah jadi bagian checklist "pemulihan ke database uji terpisah telah berhasil"). `rclone`/offsite juga di luar gladi.

## 4. Usulan diff untuk operator (laporan saja; tidak diterapkan)

Semua usulan opsional — tidak ada pemblokir Tahap 4. Diurutkan dari manfaat terbesar.

### D1 — restore.sh: ANALYZE setelah restore (rendah)

```diff
--- a/deploy/db-vps/restore.sh
+++ b/deploy/db-vps/restore.sh
@@ -26,4 +26,6 @@ sudo -u postgres createdb -O "$OWNER" "$TARGET"
 age -d -i "$IDENTITY" "$SRC" | sudo -u postgres pg_restore --no-owner --no-privileges --role="$OWNER" -d "$TARGET" --exit-on-error --single-transaction
+sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$TARGET" -c 'ANALYZE;'
 echo "Dipulihkan ke $TARGET dengan pemilik $OWNER. Periksa isinya sebelum dipakai."
```

Alasan: DB pulihan tanpa statistik lambat sampai autovacuum menyusul; migrate-from-supabase.sh sudah melakukannya, restore.sh belum.

### D2 — env.production.example: connect_timeout + daftar S3 terkomentar (rendah)

```diff
--- a/deploy/app-vps/env.production.example
+++ b/deploy/app-vps/env.production.example
@@ -4,8 +4,9 @@
-DATABASE_URL="postgresql://monitor_karya_app:GANTI@10.10.0.1:5432/monitor_karya?sslmode=require&connection_limit=20&pool_timeout=20"
-DIRECT_URL="postgresql://monitor_karya_app:GANTI@10.10.0.1:5432/monitor_karya?sslmode=require"
+DATABASE_URL="postgresql://monitor_karya_app:GANTI@10.10.0.1:5432/monitor_karya?sslmode=require&connection_limit=20&connect_timeout=10&pool_timeout=20"
+DIRECT_URL="postgresql://monitor_karya_app:GANTI@10.10.0.1:5432/monitor_karya?sslmode=require&connect_timeout=10"
@@ -23,3 +24,9 @@ STORAGE_DRIVER=supabase
 # Driver bawaan tetap Supabase; S3/MinIO hanya setelah konfigurasi tersendiri.
+
+# Hanya bila STORAGE_DRIVER=s3 (butuh konfigurasi + uji tersendiri; lihat CX20):
+# S3_ENDPOINT=
+# S3_REGION=us-east-1
+# S3_BUCKET=
+# S3_ACCESS_KEY_ID=
+# S3_SECRET_ACCESS_KEY=
+# S3_FORCE_PATH_STYLE=false
```

Alasan: CX20 menyarankan `connect_timeout` ikut disetel; dan `S3_*` dipakai kode (storage-s3.ts, security-headers.ts) tetapi tidak tercantum di contoh — blok terkomentar memberi operator daftar lengkap tanpa mengubah bawaan. Sesuaikan juga keluaran `new-database.sh` bila D2 diterima agar URL yang dicetak tetap identik dengan contoh.

### D3 — harden.sh: jalur tunnel untuk hook laporan backup (sedang; butuh keputusan keamanan operator)

Opsi minimal (dokumentasi + contoh blok yang dikomentari, tanpa melonggarkan bawaan):

```diff
--- a/deploy/common/harden.sh
+++ b/deploy/common/harden.sh
@@ -66,4 +66,9 @@ ClientAliveInterval 300
 ClientAliveCountMax 2
+
+# Hook laporan backup CX20 dapat memakai tunnel loopback SSH dari VPS DB.
+# Bila memilih jalur itu, buat user khusus dan izinkan forwarding HANYA untuknya:
+# Match User backup-tunnel
+#     AllowTcpForwarding local
+#     X11Forwarding no
+#     AllowAgentForwarding no
 EOF
```

Alasan: `AllowTcpForwarding no` global memblokir jalur tunnel yang direkomendasikan CX20 untuk `BACKUP_REPORT_URL`. Alternatif tanpa perubahan: endpoint HTTPS privat yang diatur operator (CX20 membolehkan). Keputusan tetap milik operator; jangan melebarkan forwarding untuk user admin umum.

### D4 — README: hapus DB uji setelah uji restore (rendah)

```diff
--- a/deploy/README.md
+++ b/deploy/README.md
@@ -60,6 +60,7 @@ sudo bash deploy/db-vps/new-database.sh monitor_karya      # simpan DATABASE_URL
 Pasang cadangan (petunjuk di kepala `deploy/db-vps/backup.sh`), lalu jalankan sekali manual dan
 **uji pulihkan** dengan `restore.sh` ke database `monitor_karya_uji`.
+Setelah uji selesai, hapus database uji (`sudo -u postgres dropdb monitor_karya_uji`) agar
+backup harian berikutnya tidak ikut mencadangkannya selamanya.
```

Alasan: backup.sh mencadangkan semua database non-template; `monitor_karya_uji` yang tertinggal akan masuk dump harian terus-menerus.

### D5 — setup-postgres.sh: catatan statement_timeout untuk migrasi besar (rendah)

```diff
--- a/deploy/db-vps/setup-postgres.sh
+++ b/deploy/db-vps/setup-postgres.sh
@@ -64,4 +64,7 @@ statement_timeout = '60s'
 timezone = 'UTC'
+
+# statement_timeout global ikut berlaku untuk role aplikasi saat `prisma migrate deploy`.
+# Untuk migrasi/seed yang statement tunggalnya > 60 detik, setel pengecualian per role:
+#   ALTER ROLE monitor_karya_app SET statement_timeout = 0;  -- lalu kembalikan setelah selesai
 EOF
```

### D6 — migrate-from-supabase.sh: hitungan eksak opsional (rendah)

```diff
--- a/deploy/db-vps/migrate-from-supabase.sh
+++ b/deploy/db-vps/migrate-from-supabase.sh
@@ -39,3 +39,5 @@ echo ">> hitungan baris (bandingkan dengan Supabase):"
 sudo -u postgres psql -d "$DB" -Atc "
 SELECT relname || ': ' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" || true
+echo ">> untuk perbandingan eksak, jalankan per tabel:"
+echo "  SELECT count(*) FROM \"NamaTabel\";"
```

Alasan: `n_live_tup` estimasi; uji penerimaan sebaiknya memakai hitungan eksak.

### D7 — cron.sh/monitor.sh: log di luar worktree + rotasi (rendah, opsional)

```diff
--- a/deploy/app-vps/cron.sh
+++ b/deploy/app-vps/cron.sh
@@ -12,5 +12,6 @@
 #   crontab -e
-#   0 9 * * 1-5      bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh remind-divisions >> /srv/apps/monitor-karya/cron.log 2>&1
-#   */30 * * * * bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh reminder-rules  >> /srv/apps/monitor-karya/cron.log 2>&1
-#   30 17 * * *      bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh kpi-snapshot    >> /srv/apps/monitor-karya/cron.log 2>&1
+#   0 9 * * 1-5      bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh remind-divisions >> /var/log/monitor-karya/cron.log 2>&1
+#   */30 * * * * bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh reminder-rules  >> /var/log/monitor-karya/cron.log 2>&1
+#   30 17 * * *      bash /srv/apps/monitor-karya/deploy/app-vps/cron.sh kpi-snapshot    >> /var/log/monitor-karya/cron.log 2>&1
```

(dan pola sama untuk `monitor.sh` baris 3.) Tidak wajib: `.gitignore` sudah memuat `*.log` sehingga cek pohon-bersih deploy.sh tidak terganggu; masalahnya hanya log tumbuh tanpa rotasi di dalam worktree. Bila dipindah ke `/var/log`, sertakan `install -d -o admin /var/log/monitor-karya` dan aturan logrotate.

## 5. Batasan dan kebersihan

- Audit murni lokal: tidak ada akses SSH/VPS/produksi/Supabase, tidak ada git commit/add/push, tidak menyentuh port 54339/3200/3100/3211/54349/54329/54361 maupun kontainer yang sedang berjalan, `vendor/` utuh, dan tidak menjalankan `npx next build`.
- Kontainer gladi `mk-t2b8-restore`, jaringan/port 54362, dan semua berkas sementara `/tmp/mk-t2b8-*` sudah dihapus (diverifikasi `docker ps -a` dan `lsof`).
- Bagian yang memang di luar jangkauan gladi ini dan tetap tanggung jawab operator sesuai checklist: dekripsi `age` pertama kali, salin `rclone` offsite, tunnel/HTTPS privat hook backup, Caddy/WireGuard nyata, dan uji cakupan cron end-to-end.
- Perubahan worktree oleh agen lain selama sesi ini tidak diganggu; berkas yang diubah agen ini hanya `docs/zcode/laporan-swarm/T2-B8-LAPORAN.md`.
