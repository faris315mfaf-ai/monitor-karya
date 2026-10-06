#!/usr/bin/env bash
# Pulihkan satu database dari cadangan backup.sh.
# Jalankan di mesin yang memegang kunci RAHASIA age (bukan disimpan permanen di VPS).
#
#   bash restore.sh <berkas.dump.age> <nama_db_tujuan> <identitas-age.txt> [role_pemilik]
#
# Contoh uji pemulihan bulanan (WAJIB dilakukan; cadangan yang tak pernah
# diuji belum tentu bisa dipulihkan):
#   rclone copy offsite:pg-backups/db1/20261006T011500Z ./uji
#   bash restore.sh ./uji/monitor_karya.dump.age monitor_karya_uji ~/kunci-age.txt
set -euo pipefail
SRC="${1:?berkas .dump.age}"
TARGET="${2:?nama database tujuan}"
IDENTITY="${3:?berkas identitas age (kunci rahasia)}"
OWNER="${4:-postgres}"

if sudo -u postgres psql -Atc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | grep -q 1; then
  echo "Database $TARGET sudah ada. Pakai nama lain atau hapus manual dulu."; exit 1
fi
sudo -u postgres createdb -O "$OWNER" "$TARGET"
age -d -i "$IDENTITY" "$SRC" | sudo -u postgres pg_restore --no-owner --no-privileges --role="$OWNER" -d "$TARGET" --exit-on-error
echo "Dipulihkan ke $TARGET dengan pemilik $OWNER. Periksa isinya sebelum dipakai."
