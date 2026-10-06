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
ROLE="${DB}_app"
: "${SUPABASE_URL:?setel SUPABASE_URL}"
WORK="$(mktemp -d /var/tmp/supa.XXXX)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo ">> dump skema public dari Supabase"
pg_dump "$SUPABASE_URL" --schema=public --no-owner --no-privileges --format=custom \
  --exclude-table-data='public."NotificationLog"' -f "$WORK/public.dump"
# NotificationLog hanya log kirim; buang datanya agar dump kecil. Hapus baris
# --exclude-table-data di atas bila Anda ingin membawanya.

echo ">> pulihkan ke $DB sebagai $ROLE"
sudo -u postgres pg_restore --no-owner --no-privileges --role="$ROLE" \
  --exit-on-error -d "$DB" "$WORK/public.dump" || {
  echo "!! pg_restore gagal. Database $DB mungkin terisi sebagian: DROP DATABASE lalu ulangi."; exit 1; }

sudo -u postgres psql -d "$DB" -c "ANALYZE;"
echo ">> hitungan baris (bandingkan dengan Supabase):"
sudo -u postgres psql -d "$DB" -Atc "
SELECT relname || ': ' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" || true

echo
echo "Selesai. Langkah berikutnya (deploy/README.md langkah 7):"
echo "  - cek _prisma_migrations: SELECT migration_name FROM _prisma_migrations ORDER BY 1;"
echo "  - jalankan migrasi 0013-0017 lewat deploy.sh (migrate deploy) dari VPS aplikasi"
