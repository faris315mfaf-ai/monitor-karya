#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
ACTION=${1:-}
export LOCAL_DB_PORT=${LOCAL_DB_PORT:-54329}
case "$LOCAL_DB_PORT" in 54329|54339) ;; *) echo 'LOCAL_DB_PORT hanya 54329 atau 54339.' >&2; exit 1 ;; esac
DEFAULT_DB="postgresql://mk_local:mk_local_dev_only@127.0.0.1:${LOCAL_DB_PORT}/monitor_karya_local?schema=public"
# Jangan source .env: berkas lingkungan bukan kode shell.
# Lingkungan eksplisit didahulukan; hanya baca dua URL dari .env.lokal.
if [[ -f .env.lokal ]]; then
  while IFS= read -r LINE || [[ -n "$LINE" ]]; do
    case "$LINE" in
      DATABASE_URL=*|DIRECT_URL=*|SEED_PASSWORD=*)
        KEY=${LINE%%=*}; VALUE=${LINE#*=}
        VALUE=${VALUE%$'\r'}; VALUE=${VALUE#\"}; VALUE=${VALUE%\"}; VALUE=${VALUE#\'}; VALUE=${VALUE%\'}
        if [[ -z "${!KEY+x}" ]]; then export "$KEY=$VALUE"; fi ;;
    esac
  done < .env.lokal
fi
export DATABASE_URL=${DATABASE_URL:-$DEFAULT_DB}
export DIRECT_URL=${DIRECT_URL:-$DATABASE_URL}
# Kedua URL harus menunjuk port dan basis data dev ini, sebelum Docker/Prisma.
node <<'JS'
for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
  let u;
  try { u = new URL(process.env[name]); } catch { console.error(`${name} tidak valid`); process.exit(1); }
  if (!['postgresql:', 'postgres:'].includes(u.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ||
      u.port !== process.env.LOCAL_DB_PORT || u.pathname !== '/monitor_karya_local' ||
      [...u.searchParams.keys()].some(k => k !== 'schema') ||
      (u.searchParams.has('schema') && u.searchParams.get('schema') !== 'public')) {
    console.error(`${name} ditolak: hanya PostgreSQL lokal port ${process.env.LOCAL_DB_PORT} /monitor_karya_local.`); process.exit(1);
  }
}
JS
COMPOSE=(docker compose -f docker-compose.dev.yml)
case "$ACTION" in
  naik) "${COMPOSE[@]}" up -d --wait postgres ;;
  turun) "${COMPOSE[@]}" down ;;
  ulang)
    [[ "${2:-}" == '--hapus-data-lokal' ]] || { echo 'Ulang menghapus data dev. Gunakan ulang --hapus-data-lokal.' >&2; exit 2; }
    "${COMPOSE[@]}" down --volumes
    "${COMPOSE[@]}" up -d --wait postgres ;;
  migrasi) npx prisma migrate deploy ;;
  seed-sql) npx tsx scripts/guard-db-lokal.ts seed-sql ;;
  seed) export SEED_PASSWORD=${SEED_PASSWORD:-kata-sandi-lokal-aman}; npx tsx scripts/seed.ts ;;
  *) echo 'Pemakaian: bash scripts/db-lokal.sh naik|turun|ulang --hapus-data-lokal|migrasi|seed|seed-sql' >&2; exit 2 ;;
esac
