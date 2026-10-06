#!/usr/bin/env bash
# Cadangan harian semua database proyek: pg_dump format custom, dienkripsi
# dengan age (kunci PUBLIK saja di server), disalin ke penyimpanan objek
# di luar VPS (Cloudflare R2 / Backblaze B2 lewat rclone).
#
# Pasang (sekali, sebagai root):
#   apt-get install -y age rclone
#   install -d -m 700 /etc/pg-backup
#   echo "age1....(kunci publik Anda)" > /etc/pg-backup/recipient.txt
#   rclone config            # buat remote bernama "offsite" (R2/B2), simpan ke /root/.config/rclone
#   install -m 700 backup.sh /usr/local/sbin/pg-backup
#   echo '15 1 * * * root /usr/local/sbin/pg-backup >> /var/log/pg-backup.log 2>&1' > /etc/cron.d/pg-backup
#
# Kunci RAHASIA age (age-keygen) disimpan di laptop / pengelola kata sandi,
# BUKAN di VPS. Jadi pencuri VPS tidak bisa membuka cadangan.
#
# Retensi: 14 harian lokal; di remote 30 harian (atur lifecycle rule di bucket
# untuk retensi lebih panjang, mis. 12 bulanan).
set -euo pipefail

RECIPIENT_FILE="/etc/pg-backup/recipient.txt"
REMOTE="${REMOTE:-offsite:pg-backups/$(hostname -s)}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/postgres}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-14}"
KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

[[ -s "$RECIPIENT_FILE" ]] || { echo "Kunci publik age belum ada di $RECIPIENT_FILE"; exit 1; }
install -d -m 700 "$LOCAL_DIR/$STAMP"

DBS=$(sudo -u postgres psql -Atc "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname <> 'postgres'")

# Role & hak akses (tanpa kata sandi tersimpan dalam teks terbuka di luar enkripsi).
sudo -u postgres pg_dumpall --globals-only | age -R "$RECIPIENT_FILE" > "$LOCAL_DIR/$STAMP/globals.sql.age"

for db in $DBS; do
  echo "[$(date -Is)] dump $db"
  sudo -u postgres pg_dump -Fc -Z 6 "$db" | age -R "$RECIPIENT_FILE" > "$LOCAL_DIR/$STAMP/$db.dump.age"
done
sha256sum "$LOCAL_DIR/$STAMP"/* > "$LOCAL_DIR/$STAMP/SHA256SUMS"

rclone copy "$LOCAL_DIR/$STAMP" "$REMOTE/$STAMP" --s3-no-check-bucket
rclone delete "$REMOTE" --min-age "${KEEP_REMOTE_DAYS}d" --rmdirs || true
find "$LOCAL_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_LOCAL_DAYS" -exec rm -rf {} +

echo "[$(date -Is)] selesai: $STAMP ($(echo $DBS | wc -w) database)"
