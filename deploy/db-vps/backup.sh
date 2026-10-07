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

umask 077
# Optional reporting is observed by /api/health/internal; absent reports remain missing/stale.
# Install report-backup.py beside this script. A reporting failure never skips the backup.
REPORT_ENABLED=0
REPORT_STARTED=0
REPORT_FAILED=0
REPORT_HOOK="$(dirname "$0")/report-backup.py"
BACKUP_RUN_ID=""
if [[ -n "${BACKUP_REPORT_URL:-}" || -n "${BACKUP_REPORT_SECRET_FILE:-}" ]]; then
  REPORT_ENABLED=1
fi
report_backup() {
  # timeout also bounds a slow/dribbling HTTP peer; Python's socket timeout alone does not.
  timeout 15s python3 "$REPORT_HOOK" "$1" "$BACKUP_RUN_ID"
}
finish_backup() {
  local original_status=$?
  trap - EXIT
  if [[ "$REPORT_ENABLED" == 1 ]]; then
    if [[ "$REPORT_STARTED" == 1 ]]; then
      local result=failure
      [[ "$original_status" == 0 ]] && result=success
      report_backup "$result" || REPORT_FAILED=1
    else
      REPORT_FAILED=1
    fi
    if [[ "$REPORT_FAILED" == 1 ]]; then
      echo "Backup: pelaporan gagal; periksa hook/status internal." >&2
      # Keep the original pg_dump/age/rclone exit status; 70 only if backup itself succeeded.
      [[ "$original_status" != 0 ]] || original_status=70
    fi
  fi
  exit "$original_status"
}
trap finish_backup EXIT
if [[ "$REPORT_ENABLED" == 1 ]]; then
  if BACKUP_RUN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')" && report_backup running; then
    REPORT_STARTED=1
  else
    REPORT_FAILED=1
  fi
fi
RECIPIENT_FILE="/etc/pg-backup/recipient.txt"
REMOTE="${REMOTE:-offsite:pg-backups/$(hostname -s)}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/postgres}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-14}"
KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-30}"
[[ "$KEEP_LOCAL_DAYS" =~ ^[1-9][0-9]*$ && "$KEEP_REMOTE_DAYS" =~ ^[1-9][0-9]*$ ]] || { echo "Retensi harus bilangan positif."; exit 1; }
[[ "$LOCAL_DIR" == /* ]] || { echo "Direktori cadangan harus absolut."; exit 1; }
LOCAL_DIR="$(realpath -m -- "$LOCAL_DIR")"
[[ "$LOCAL_DIR" == /* && "$LOCAL_DIR" != / ]] || { echo "Direktori cadangan harus absolut dan bukan /."; exit 1; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

[[ -s "$RECIPIENT_FILE" ]] || { echo "Kunci publik age belum ada di $RECIPIENT_FILE"; exit 1; }
install -d -m 700 "$LOCAL_DIR/$STAMP"

DBS=$(sudo -u postgres psql -v ON_ERROR_STOP=1 -Atc "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname <> 'postgres'")

if [[ "$REPORT_ENABLED" == 1 && -z "${BACKUP_REQUIRED_DATABASE:-}" ]]; then
  echo "BACKUP_REQUIRED_DATABASE wajib untuk laporan backup aplikasi." >&2; exit 1
fi
[[ -n "$DBS" ]] || { echo "Tidak ada database aplikasi untuk dicadangkan." >&2; exit 1; }
# When set, require this application database to appear in the dump inventory.
if [[ -n "${BACKUP_REQUIRED_DATABASE:-}" ]]; then
  [[ "$BACKUP_REQUIRED_DATABASE" =~ ^[a-z][a-z0-9_]{1,40}$ ]] || { echo "Nama database wajib tidak sah." >&2; exit 1; }
  FOUND_REQUIRED=0
  while IFS= read -r db; do [[ "$db" != "$BACKUP_REQUIRED_DATABASE" ]] || FOUND_REQUIRED=1; done <<< "$DBS"
  [[ "$FOUND_REQUIRED" == 1 ]] || { echo "Database aplikasi wajib tidak ditemukan." >&2; exit 1; }
fi

# Role & hak akses (tanpa kata sandi tersimpan dalam teks terbuka di luar enkripsi).
sudo -u postgres pg_dumpall --globals-only | age -R "$RECIPIENT_FILE" > "$LOCAL_DIR/$STAMP/globals.sql.age"

while IFS= read -r db; do
  [[ -n "$db" ]] || continue
  [[ "$db" =~ ^[a-z][a-z0-9_]{1,40}$ ]] || { echo "Nama database tidak aman untuk berkas: $db"; exit 1; }
  echo "[$(date -Is)] dump $db"
  sudo -u postgres pg_dump -Fc -Z 6 "$db" | age -R "$RECIPIENT_FILE" > "$LOCAL_DIR/$STAMP/$db.dump.age"
done <<< "$DBS"
(cd "$LOCAL_DIR/$STAMP" && sha256sum ./*.age > SHA256SUMS)

rclone copy "$LOCAL_DIR/$STAMP" "$REMOTE/$STAMP" --s3-no-check-bucket
rclone delete "$REMOTE" --min-age "${KEEP_REMOTE_DAYS}d" --rmdirs || true
find "$LOCAL_DIR" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -mtime +"$KEEP_LOCAL_DAYS" -exec rm -rf {} +

echo "[$(date -Is)] selesai: $STAMP ($(printf '%s\n' "$DBS" | sed '/^$/d' | wc -l) database)"
