#!/usr/bin/env bash
# VPS database: PostgreSQL 17 yang HANYA bisa dicapai lewat terowongan WireGuard.
#
# Prasyarat: deploy/common/harden.sh sudah dijalankan, dan WireGuard sudah aktif
# (deploy/wireguard/README.md) sehingga antarmuka wg0 punya alamat 10.10.0.1.
#
#   sudo bash setup-postgres.sh
#
# Hasil:
#   - PostgreSQL 17 (repo resmi PGDG), mendengar di 127.0.0.1 dan 10.10.0.1 saja
#   - autentikasi scram-sha-256, koneksi dari 10.10.0.0/24 saja
#   - superuser postgres tidak bisa masuk lewat jaringan
#   - UFW: port 5432 hanya dibuka di antarmuka wg0
#   - penyetelan memori untuk VPS 8 GB (ubah RAM_GB bila lain)
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Jalankan sebagai root."; exit 1; }

PG_MAJOR="${PG_MAJOR:-17}"
WG_ADDR="${WG_ADDR:-10.10.0.1}"
WG_NET="${WG_NET:-10.10.0.0/24}"
RAM_GB="${RAM_GB:-8}"

ip -4 addr show wg0 | grep -q "$WG_ADDR" || { echo "wg0 dengan $WG_ADDR belum aktif. Pasang WireGuard dulu."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
install -d /usr/share/postgresql-common/pgdg
curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y "postgresql-${PG_MAJOR}"

CONF_DIR="/etc/postgresql/${PG_MAJOR}/main"
install -d "$CONF_DIR/conf.d"

SB=$(( RAM_GB * 1024 / 4 ))
ECS=$(( RAM_GB * 1024 * 3 / 4 ))
cat > "$CONF_DIR/conf.d/10-monitor-karya.conf" <<EOF
# Dibuat oleh deploy/db-vps/setup-postgres.sh
listen_addresses = '127.0.0.1,${WG_ADDR}'
port = 5432
max_connections = 200
password_encryption = scram-sha-256
ssl = on

shared_buffers = ${SB}MB
effective_cache_size = ${ECS}MB
maintenance_work_mem = 512MB
work_mem = 16MB
wal_compression = on
wal_buffers = 16MB
checkpoint_completion_target = 0.9
max_wal_size = 4GB
random_page_cost = 1.1
effective_io_concurrency = 200

log_connections = on
log_disconnections = on
log_min_duration_statement = 500
log_line_prefix = '%m [%p] %u@%d %r '
log_lock_waits = on
idle_in_transaction_session_timeout = '5min'
statement_timeout = '60s'
timezone = 'UTC'
EOF

# Hanya socket lokal untuk postgres; jaringan hanya dari subnet WireGuard dengan scram.
cat > "$CONF_DIR/pg_hba.conf" <<EOF
# TYPE  DATABASE  USER      ADDRESS          METHOD
local   all       postgres                   peer
local   all       all                        scram-sha-256
host    all       postgres  0.0.0.0/0        reject
host    all       postgres  ::/0             reject
hostssl all       all       127.0.0.1/32     scram-sha-256
hostssl all       all       ${WG_NET}        scram-sha-256
host    all       all       0.0.0.0/0        reject
host    all       all       ::/0             reject
EOF

systemctl restart "postgresql@${PG_MAJOR}-main"
systemctl enable "postgresql@${PG_MAJOR}-main"

# Cabut hak bawaan PUBLIC di template supaya DB baru tidak terbuka untuk semua role.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d template1 <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE template1 FROM PUBLIC;
SQL

ufw allow in on wg0 to any port 5432 proto tcp comment 'postgres via wireguard'

echo
echo "PostgreSQL ${PG_MAJOR} siap, mendengar di 127.0.0.1 dan ${WG_ADDR}."
echo "Buat database per proyek dengan: sudo bash new-database.sh <nama_db>"
