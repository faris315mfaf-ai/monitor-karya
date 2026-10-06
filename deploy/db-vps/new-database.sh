#!/usr/bin/env bash
# Satu database + satu role pemilik per proyek. Role proyek A tidak bisa
# membaca database proyek B.
#
#   sudo bash new-database.sh monitor_karya
#
# Mencetak DATABASE_URL untuk .env.production di VPS aplikasi. Kata sandi
# dibuat acak dan TIDAK disimpan di server ini; simpan di pengelola kata sandi.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Jalankan sebagai root."; exit 1; }

DB="${1:?Pakai: new-database.sh <nama_db>}"
[[ "$DB" =~ ^[a-z][a-z0-9_]{1,40}$ ]] || { echo "Nama hanya huruf kecil, angka, garis bawah."; exit 1; }
ROLE="${DB}_app"
WG_ADDR="${WG_ADDR:-10.10.0.1}"
PASS="$(openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-40)"

sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -v db="$DB" -v role="$ROLE" -v pass="$PASS" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L CONNECTION LIMIT 60', :'role', :'pass')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'role', :'pass') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT, TEMP ON DATABASE %I TO %I', :'db', :'role') \gexec
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -v role="$ROLE" <<'SQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'role') \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL

# Kata sandi hanya huruf & angka, jadi aman ditaruh di URL tanpa encoding.
ENC_PASS="$PASS"
echo
echo "Database $DB dengan role $ROLE siap."
echo "Tempel ke .env.production di VPS aplikasi (jangan commit):"
echo
echo "DATABASE_URL=\"postgresql://${ROLE}:${ENC_PASS}@${WG_ADDR}:5432/${DB}?sslmode=require&connection_limit=20&pool_timeout=20\""
echo "DIRECT_URL=\"postgresql://${ROLE}:${ENC_PASS}@${WG_ADDR}:5432/${DB}?sslmode=require\""
