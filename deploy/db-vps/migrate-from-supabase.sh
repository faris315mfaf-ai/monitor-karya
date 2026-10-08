#!/usr/bin/env bash
# Pindahkan data Monitor Karya dari Supabase ke PostgreSQL di VPS database.
# Jalankan DI VPS database sebagai root, setelah new-database.sh monitor_karya.
#
#   SUPABASE_URL='postgresql://postgres.xxxx:PASS@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres' \
#     bash migrate-from-supabase.sh monitor_karya
#
# Pakai koneksi "session" (port 5432) atau direct, BUKAN pooler transaksi 6543.
# Selama proses, hentikan pengisian data (umumkan jam pemeliharaan) agar tidak
# ada laporan yang hilang di antara dump dan peralihan.
#
# Hanya skema public yang dipindahkan (tabel aplikasi + _prisma_migrations).
# Skema milik Supabase (auth, storage, realtime, ...) tidak dibawa; berkas bukti
# tetap tinggal di Supabase Storage.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Jalankan sebagai root."; exit 1; }
DB="${1:?nama database tujuan, mis. monitor_karya}"
[[ "$DB" =~ ^[a-z][a-z0-9_]{1,40}$ ]] || { echo "Nama database tidak sah."; exit 1; }
ROLE="${DB}_app"
umask 077
: "${SUPABASE_URL:?setel SUPABASE_URL}"
WORK="$(mktemp -d /var/tmp/supa.XXXX)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo ">> dump skema public dari Supabase"
PGDATABASE="$SUPABASE_URL" pg_dump --schema=public --no-owner --no-privileges --format=custom \
  --exclude-table-data='public."NotificationLog"' -f "$WORK/public.dump"
# NotificationLog hanya log kirim; buang datanya agar dump kecil. Hapus baris
# --exclude-table-data di atas bila Anda ingin membawanya.

echo ">> pulihkan ke $DB sebagai $ROLE"
sudo -u postgres pg_restore --no-owner --no-privileges --role="$ROLE" \
  --exit-on-error --single-transaction -d "$DB" < "$WORK/public.dump" || {
  echo "!! pg_restore gagal. Transaksi pemulihan dibatalkan; periksa diagnostik sebelum mencoba ulang."; exit 1; }

sudo -u postgres psql -d "$DB" -c "ANALYZE;"
echo ">> hitungan baris (bandingkan dengan Supabase):"
sudo -u postgres psql -d "$DB" -Atc "
SELECT relname || ': ' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" || true

echo
echo "Selesai. Langkah berikutnya (deploy/README.md langkah 7):"
echo "  - cek _prisma_migrations: SELECT migration_name FROM _prisma_migrations ORDER BY 1;"
echo "  - periksa migrasi tertunda pada commit rilis; jalankan lewat deploy.sh setelah persetujuan operator"
