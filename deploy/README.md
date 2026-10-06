# Deploy ke VPS (Hostinger)

Dua server:

| Server | Peran | Paket | Isi |
|---|---|---|---|
| **VPS aplikasi** | menjalankan aplikasi, banyak proyek | Hostinger **KVM 8** (8 vCPU, 32 GB, 400 GB NVMe) | Docker, Caddy (HTTPS otomatis), satu kontainer per proyek |
| **VPS database** | hanya PostgreSQL, banyak database | Hostinger **KVM 2** (2 vCPU, 8 GB, 100 GB NVMe) | PostgreSQL 17, WireGuard, cadangan terenkripsi |

```
Internet ──443──▶ Caddy ──▶ monitor-karya:3000      (VPS aplikasi, 10.10.0.2)
                              │
                              └── WireGuard (UDP 51820) ──▶ PostgreSQL :5432   (VPS database, 10.10.0.1)
                                                                  │
                                                                  └── cadangan harian terenkripsi ──▶ R2 / B2
Berkas bukti tetap di Supabase Storage.
```

**Wajib:** pilih **pusat data yang sama** untuk kedua VPS saat membeli. Setiap
permintaan halaman menjalankan beberapa kueri; jarak antar-negara menambah
puluhan milidetik per kueri.

## Aturan keamanan yang dipegang paket ini

- SSH hanya dengan kunci, tanpa root, tanpa kata sandi; fail2ban; pembaruan keamanan otomatis.
- Firewall tolak-semua. VPS aplikasi: 22, 80, 443. VPS database: 22 dan UDP 51820 khusus IP VPS aplikasi.
- PostgreSQL **tidak pernah** terbuka ke internet; hanya lewat WireGuard, scram-sha-256, TLS.
- Satu database + satu role per proyek; role proyek lain tidak bisa saling membaca.
- Hanya Caddy yang membuka port. Docker melewati ufw untuk port yang di-publish, jadi aplikasi **tidak boleh** punya `ports:`.
- Kontainer: user non-root, root filesystem read-only, `cap_drop: ALL`, batas memori & proses.
- Rahasia hanya di `.env.production` (chmod 600) di server; tidak pernah di git atau crontab.
- `/api/cron/*` ditolak dari internet; cron dipanggil dari dalam kontainer.
- Cadangan harian dienkripsi dengan kunci publik `age`; kunci rahasianya **tidak** disimpan di server.

---

## Langkah

Siapkan dulu di laptop: kunci SSH (`ssh-keygen -t ed25519`), domain (mis. `monitor.domainanda.id`), akun Cloudflare R2 atau Backblaze B2 untuk cadangan.

### 1. Beli dan pasang OS
Kedua VPS: **Ubuntu 24.04**, pusat data yang sama, tambahkan kunci SSH Anda di panel Hostinger.
Aktifkan juga firewall panel Hostinger (lapisan kedua) dengan aturan yang sama seperti di atas.

### 2. Pengerasan dasar (kedua VPS)
```bash
scp -r deploy root@<IP>:/root/
ssh root@<IP>
bash /root/deploy/common/harden.sh admin "$(cat ~/.ssh/authorized_keys | head -1)"
```
Jangan tutup sesi root sebelum `ssh admin@<IP>` berhasil dari terminal lain.

### 3. WireGuard (kedua VPS)
Ikuti `deploy/wireguard/README.md`. Uji: dari VPS aplikasi `ping 10.10.0.1`.

### 4. PostgreSQL (VPS database)
```bash
sudo bash deploy/db-vps/setup-postgres.sh
sudo bash deploy/db-vps/new-database.sh monitor_karya      # simpan DATABASE_URL yang dicetak
```
Pasang cadangan (petunjuk di kepala `deploy/db-vps/backup.sh`), lalu jalankan sekali manual dan
**uji pulihkan** dengan `restore.sh` ke database `monitor_karya_uji`.

### 5. Host aplikasi (VPS aplikasi)
```bash
sudo bash deploy/app-vps/setup-app-host.sh admin
# keluar & masuk lagi
```
Ganti `email` di `/srv/proxy/Caddyfile`.

### 6. Kode & rahasia (VPS aplikasi)
Buat *deploy key* read-only di GitHub untuk repo ini, lalu:
```bash
cd /srv/apps && git clone git@github.com:<akun>/monitor-karya.git
cd monitor-karya
cp deploy/app-vps/env.production.example .env.production && chmod 600 .env.production
nano .env.production       # isi DATABASE_URL/DIRECT_URL, AUTH_SECRET, CRON_SECRET, APP_ORIGINS, Supabase Storage
cp deploy/app-vps/monitor-karya.caddy /srv/proxy/sites/ && nano /srv/proxy/sites/monitor-karya.caddy   # domain
```
Arahkan DNS domain (A record) ke IP VPS aplikasi.

### 7. Pindahkan data dari Supabase (VPS database)
Umumkan jam pemeliharaan (hentikan pengisian laporan), lalu:
```bash
SUPABASE_URL='postgresql://...:5432/postgres' sudo -E bash deploy/db-vps/migrate-from-supabase.sh monitor_karya
```
Tabel `_prisma_migrations` ikut terbawa (0001–0012 sudah tercatat), sehingga langkah 8 hanya
menjalankan migrasi baru 0013–0025 (urutan di docs/fitur/README.md). Tetap bandingkan riwayat
`_prisma_migrations` dengan folder migrasi pada commit rilis sebelum menjalankannya.

### 8. Rilis pertama (VPS aplikasi)
```bash
bash deploy/app-vps/deploy.sh origin/main
docker exec proxy-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```
`deploy.sh` mensyaratkan pohon kerja bersih dan meminta konfirmasi "ya" sebelum
menjalankan `migrate deploy` (termasuk ketika status tidak bersih). Periksa
diagnostik status, koneksi, dan cadangan langkah 4 sebelum menjawab.
Rollback hanya memulihkan image aplikasi, bukan skema database.
Gunakan [checklist rilis](CHECKLIST-RILIS.md) sebelum rilis.

### 9. Cron
Tempel tiga baris dari kepala `deploy/app-vps/cron.sh` (pengingat divisi, aturan pengingat, KPI harian) ke `crontab -e` user admin.
Jadwal cron harian lama di `vercel.json` tidak berlaku lagi di VPS.

### 10. Periksa
- `https://<domain>/login` terbuka, gembok HTTPS valid.
- `curl -I https://<domain>/api/cron/remind-divisions` → 404 dari luar.
- Dari laptop: `nc -zv <IP-VPS-database> 5432` → **harus gagal**.
- Semua pengguna masuk ulang sekali (token lama ditolak setelah penguatan keamanan).

---

## Proyek lain di VPS yang sama

1. Database: `sudo bash new-database.sh nama_proyek` di VPS database.
2. Aplikasi: `/srv/apps/<proyek>` dengan compose sendiri yang bergabung ke jaringan `web` tanpa `ports:`.
3. Domain: `/srv/proxy/sites/<proyek>.caddy`, lalu `caddy reload`.

Cadangan otomatis mencakup semua database baru tanpa perubahan apa pun.

## Hal yang belum ditangani paket ini
- **Berkas bukti** memakai Supabase Storage sebagai bawaan (`STORAGE_DRIVER=supabase`).
  Driver S3/MinIO memerlukan konfigurasi terpisah dan uji penyimpanan sebelum diaktifkan.
- **Point-in-time recovery**: cadangan harian berarti paling banyak 24 jam data bisa hilang. Bila perlu lebih rapat, tambahkan pgBackRest/WAL-G dengan arsip WAL ke R2.
- **Pemantauan**: pasang Uptime Kuma atau pemantau eksternal untuk `/login` dan ruang disk kedua VPS.
- Pembatas laju login disimpan di memori kontainer: cukup untuk satu kontainer; bila aplikasi diskalakan ke beberapa replika, pindahkan ke Redis.
