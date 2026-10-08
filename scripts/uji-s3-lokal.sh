#!/usr/bin/env bash
# Uji end-to-end alur bukti (unggah -> baca -> hapus) dengan driver S3 ke
# MinIO lokal (Docker sekali pakai). Tugas T2-B4, 8 Oktober 2026.
#
#   bash scripts/uji-s3-lokal.sh
#
# Yang dilakukan (bukti per langkah di docs/zcode/laporan-swarm/T2-B4-LAPORAN.md):
#   1. Pastikan port 54329/9002/9003/3231 bebas.
#   2. Kontainer postgres:17-bookworm sekali pakai di 127.0.0.1:54329
#      (mk_local / monitor_karya_local) + metadata storage.buckets
#      (sama seperti docker-compose.dev.yml), lalu `prisma migrate deploy`.
#   3. Kontainer MinIO sekali pakai di 127.0.0.1:9002 (API internal juga 9002
#      supaya URL tanda tangan bisa diambil dari host) + bucket `evidence` via mc.
#   4. Seed akun: SEED_PASSWORD acak, hanya di berkas 0600, tidak dicetak.
#   5. `docker build --target runner -t mk-s3-test .` (repo .next tak disentuh),
#      aplikasi produksi di 127.0.0.1:3231 pada jaringan Docker yang sama.
#   6. curl: login ti@karya.co.id, ganti sandi wajib, unggah bukti .txt kecil
#      (targetType PROJECT_CLOSING, targetId dari /api/projects), GET URL
#      tanda tangan (isi harus cocok), DELETE bukti; objek diverifikasi muncul
#      lalu hilang lewat `mc ls`.
#   7. Bersihkan kontainer, jaringan, image, dan berkas rahasia /tmp.
#
# Catatan: cookie sesi produksi bertanda Secure dengan awalan `__Host-`, jadi
# curl tidak bisa memakai jar biasa lewat http — token diekstrak dari header
# Set-Cookie lalu dikirim ulang sebagai header Cookie. Kontainer milik orang
# lain (monitor-karya-dev-postgres-1, simrs-*, ruangkerja-*) serta port
# 54339/3200/3100/3211/54349 tidak disentuh.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

NET=mk-s3-test-net
PG=mk-s3-test-pg
MINIO=mk-s3-test-minio
APP=mk-s3-test-app
IMAGE=mk-s3-test
BASE=http://127.0.0.1:3231
PG_PORT=54329
MINIO_API=9002
MINIO_CONSOLE=9003
APP_PORT=3231
# Semua rahasia heksadesimal: aman ditempel di URL/data tanpa enkoding.
rand() { openssl rand -hex "${1:-16}"; }

WORK=$(mktemp -d /tmp/mk-s3-test.XXXXXX)
chmod 700 "$WORK"
# Sisa artefak Docker dari percobaan sebelumnya (kalau ada), tanpa menyentuh $WORK.
docker_leftovers() {
  docker rm -f "$APP" "$MINIO" "$PG" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker rmi "$IMAGE" >/dev/null 2>&1 || true
}
cleanup() {
  docker_leftovers
  rm -rf "$WORK"
}
trap cleanup EXIT

pass=0
fail=0
log() { printf '\n== %s\n' "$*"; }
ok() { printf '   LULUS: %s\n' "$*"; pass=$((pass + 1)); }
no() { printf '   GAGAL: %s\n' "$*"; fail=$((fail + 1)); }
# code <nama> <kode-diterima> <kode-diharapkan>
code() {
  if [[ "$2" == "$3" ]]; then ok "$1 → HTTP $2"; else no "$1 → HTTP $2 (harap $3)"; fi
}

# ---------------------------------------------------------------- 1. port bebas
log "1. Port bebas"
for p in "$PG_PORT" "$MINIO_API" "$MINIO_CONSOLE" "$APP_PORT"; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    no "port $p terpakai — hentikan pemakainya dahulu"
    exit 1
  fi
  ok "port $p bebas"
done
command -v docker >/dev/null || { no "docker tidak tersedia"; exit 1; }
command -v jq >/dev/null || { no "jq tidak tersedia"; exit 1; }
command -v lsof >/dev/null || { no "lsof tidak tersedia"; exit 1; }
docker info >/dev/null 2>&1 || { no "daemon docker tidak berjalan"; exit 1; }
docker_leftovers

# ------------------------------------------------------- 2. postgres sekali pakai
log "2. Kontainer postgres:17-bookworm (127.0.0.1:$PG_PORT)"
PG_PASSWORD=$(rand 16)
cat >"$WORK/storage-metadata.sql" <<'SQL'
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
SQL
docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" \
  -e POSTGRES_USER=mk_local -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB=monitor_karya_local \
  -v "$WORK/storage-metadata.sql":/docker-entrypoint-initdb.d/00-storage-metadata.sql:ro \
  -p 127.0.0.1:"$PG_PORT":5432 postgres:17-bookworm >/dev/null
# TCP ke port yang terpublikasi di host — pg_isready lewat exec (socket unix)
# bisa berhasil terhubung ke server init sementara sebelum port 5432/terbit
# benar-benar mendengar, jadi keduanya ditunggu bersama.
host_port_open() {
  if command -v nc >/dev/null 2>&1; then nc -z 127.0.0.1 "$1" >/dev/null 2>&1
  else (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
  fi
}
pg_ready() { docker exec "$PG" pg_isready -h 127.0.0.1 -U mk_local -d monitor_karya_local >/dev/null 2>&1; }
for _ in $(seq 1 90); do
  pg_ready && host_port_open "$PG_PORT" && break
  sleep 1
done
if ! pg_ready || ! host_port_open "$PG_PORT"; then no "postgres tidak siap"; exit 1; fi
ok "postgres siap (server + port host)"

DB_LOCAL="postgresql://mk_local:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/monitor_karya_local"
MIG_OUT=$(
  DATABASE_URL="$DB_LOCAL" DIRECT_URL="$DB_LOCAL" npx prisma migrate deploy 2>&1
) || true
printf '%s\n' "$MIG_OUT" | tail -n 2
MIG_APPLIED=$(printf '%s\n' "$MIG_OUT" | grep -c 'Applying migration' || true)
if printf '%s\n' "$MIG_OUT" | grep -q 'have been successfully applied'; then
  ok "migrate deploy: $MIG_APPLIED migrasi diterapkan, semua sukses"
else
  no "migrate deploy gagal"
  printf '%s\n' "$MIG_OUT" | tail -n 20
  exit 1
fi

# ----------------------------------------------------------- 3. MinIO + bucket
log "3. Kontainer MinIO (127.0.0.1:$MINIO_API) + bucket evidence"
# minio/minio dan minio/mc dihapus MinIO dari Docker Hub (Sep 2026), jadi
# coba citra resmi dahulu, lalu jatuh ke cermin lokal pgsty (MinIO asli).
resolve_image() {
  local img
  for img in "$@"; do
    if docker image inspect "$img" >/dev/null 2>&1; then printf '%s' "$img"; return 0; fi
    if docker pull -q "$img" >/dev/null 2>&1; then printf '%s' "$img"; return 0; fi
  done
  return 1
}
MINIO_IMAGE=$(resolve_image minio/minio:latest pgsty/minio:latest) || {
  no "tidak ada image MinIO yang tersedia/tarik gagal"
  exit 1
}
MC_IMAGE=$(resolve_image minio/mc:latest pgsty/mc:latest) || {
  no "tidak ada image mc yang tersedia/tarik gagal"
  exit 1
}
printf '   image terpakai: server=%s mc=%s\n' "$MINIO_IMAGE" "$MC_IMAGE"
MINIO_USER="mk$(rand 4)"
MINIO_PASSWORD=$(rand 16)
# API internal juga :9002 agar URL bertanda tangan (host kontainer) dapat
# diambil dari host lewat port terpublikasi yang sama.
docker run -d --name "$MINIO" --network "$NET" \
  -e MINIO_ROOT_USER="$MINIO_USER" -e MINIO_ROOT_PASSWORD="$MINIO_PASSWORD" \
  -p 127.0.0.1:"$MINIO_API":9002 -p 127.0.0.1:"$MINIO_CONSOLE":9003 \
  "$MINIO_IMAGE" server /data --address ":9002" --console-address ":9003" >/dev/null
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://127.0.0.1:${MINIO_API}/minio/health/live" && break
  sleep 1
done
curl -sf -o /dev/null "http://127.0.0.1:${MINIO_API}/minio/health/live"
ok "MinIO hidup"
# Alias mc hidup hanya di dalam kontainer sekali pakai ini; kredensial lewat
# env, bukan argumen yang tercetak di ps. --entrypoint sh dipakai karena
# entrypoint bawaan kedua varian image adalah mc itu sendiri.
mc_run() {
  docker run --rm --network "$NET" --entrypoint sh \
    -e MCU="$MINIO_USER" -e MCP="$MINIO_PASSWORD" -e MA="http://${MINIO}:${MINIO_API}" \
    "$MC_IMAGE" -c 'mc alias set t "$MA" "$MCU" "$MCP" >/dev/null && exec mc "$@"' mc "$@"
}
mc_run mb --ignore-existing t/evidence
ok "bucket evidence dibuat"

# ------------------------------------------------------------------- 4. seed
log "4. Seed akun (kata sandi acak di berkas 0600, tidak dicetak)"
umask 177
SEED_PASSWORD=$(rand 16)
printf '%s' "$SEED_PASSWORD" >"$WORK/seed-password.txt"
if LOCAL_DB_PORT=$PG_PORT DATABASE_URL="$DB_LOCAL" SEED_PASSWORD="$SEED_PASSWORD" \
  npm run db:seed --silent >"$WORK/seed.log" 2>&1; then
  ok "seed sukses ($(grep -c 'Seed completed successfully' "$WORK/seed.log" || true) kali selesai)"
else
  no "seed gagal"
  tail -n 20 "$WORK/seed.log"
  exit 1
fi

# ------------------------------------------------- 5. image runner + aplikasi
log "5. Build image runner ($IMAGE) dan jalankan aplikasi di $BASE"
if docker build --target runner -t "$IMAGE" . >"$WORK/build.log" 2>&1; then
  ok "docker build --target runner sukses"
else
  no "docker build gagal"
  tail -n 40 "$WORK/build.log"
  exit 1
fi
cat >"$WORK/app.env" <<ENV
DATABASE_URL=postgresql://mk_local:${PG_PASSWORD}@${PG}:5432/monitor_karya_local
AUTH_SECRET=$(rand 32)
STORAGE_DRIVER=s3
S3_ENDPOINT=http://${MINIO}:${MINIO_API}
S3_ACCESS_KEY_ID=${MINIO_USER}
S3_SECRET_ACCESS_KEY=${MINIO_PASSWORD}
S3_BUCKET=evidence
S3_FORCE_PATH_STYLE=true
APP_ORIGINS=${BASE}
ENV
docker run -d --name "$APP" --network "$NET" --env-file "$WORK/app.env" \
  -p 127.0.0.1:"$APP_PORT":3000 "$IMAGE" >/dev/null
READY=
for _ in $(seq 1 90); do
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")" == 200 ]]; then READY=1; break; fi
  sleep 2
done
if [[ -z "$READY" ]]; then
  no "aplikasi tidak merespons /api/health"
  docker logs "$APP" 2>&1 | tail -n 30
  exit 1
fi
ok "aplikasi hidup"
R=$(curl -s -o "$WORK/ready.json" -w '%{http_code}' "$BASE/api/health/ready")
code "GET /api/health/ready" "$R" 200

# ------------------------------------------------------------------ 6. uji HTTP
log "6. Alur login → ganti sandi → unggah → baca → hapus"
# Cookie produksi bertanda Secure (awalan __Host-): token diekstrak manual
# dari Set-Cookie lalu dikirim ulang sebagai header Cookie.
hdr() { sed -n 's/^[Ss]et-[Cc]ookie: *__Host-mk_session=\([^;]*\).*/\1/p' "$1" | head -n 1; }
post_json() { # post_json <path> <berkas-json> <token|->
  local args=(-s -o "$WORK/body.json" -D "$WORK/headers.txt" -w '%{http_code}'
    -X POST "$BASE$1" -H 'Content-Type: application/json' --data-binary "@$2")
  if [[ "$3" != - ]]; then args+=(-H "Cookie: __Host-mk_session=$3"); fi
  curl "${args[@]}"
}

jq -n --arg p "$SEED_PASSWORD" '{identifier:"ti@karya.co.id",password:$p}' >"$WORK/login.json"
R=$(post_json /api/auth/login "$WORK/login.json" -)
code "POST /api/auth/login (ti@karya.co.id)" "$R" 200
TOKEN=$(hdr "$WORK/headers.txt")
if [[ -n "$TOKEN" ]]; then ok "cookie sesi diterima"; else no "cookie sesi tidak ditemukan"; exit 1; fi
jq -e '.mustChangePassword == true' "$WORK/body.json" >/dev/null \
  && ok "server menandai wajib ganti sandi" || no "penanda wajib ganti sandi tidak ada"

NEW_PASSWORD=$(rand 16)
printf '%s' "$NEW_PASSWORD" >"$WORK/new-password.txt"
jq -n --arg c "$SEED_PASSWORD" --arg n "$NEW_PASSWORD" \
  '{currentPassword:$c,newPassword:$n}' >"$WORK/change.json"
R=$(post_json /api/profile/password "$WORK/change.json" "$TOKEN")
code "POST /api/profile/password" "$R" 200
TOKEN=$(hdr "$WORK/headers.txt")
if [[ -n "$TOKEN" ]]; then ok "sesi diputar setelah ganti sandi"; else no "sesi baru tidak diterima"; exit 1; fi

R=$(curl -s -o "$WORK/projects.json" -w '%{http_code}' -H "Cookie: __Host-mk_session=$TOKEN" \
  "$BASE/api/projects?page=1&pageSize=1")
code "GET /api/projects" "$R" 200
PROJECT_ID=$(jq -r '.items[0].id // empty' "$WORK/projects.json")
if [[ -n "$PROJECT_ID" ]]; then ok "projectId diambil: $PROJECT_ID"; else no "projectId tidak ditemukan"; exit 1; fi

printf 'bukti uji s3 lokal monitor karya %s\n' "$(date -u +%FT%TZ)" >"$WORK/bukti.txt"
R=$(curl -s -o "$WORK/upload.json" -w '%{http_code}' \
  -H "Cookie: __Host-mk_session=$TOKEN" -X POST "$BASE/api/evidence/upload" \
  -F "file=@$WORK/bukti.txt;type=text/plain" \
  -F 'targetType=PROJECT_CLOSING' -F "targetId=$PROJECT_ID" -F 'label=Bukti uji S3 lokal')
code "POST /api/evidence/upload" "$R" 200
EVIDENCE_ID=$(jq -r '.evidence.id // empty' "$WORK/upload.json")
STORAGE_KEY=$(jq -r '.evidence.storageKey // empty' "$WORK/upload.json")
if [[ -n "$EVIDENCE_ID" && -n "$STORAGE_KEY" ]]; then
  ok "bukti tercatat (id=$EVIDENCE_ID, kunci=$STORAGE_KEY)"
else
  no "respons unggah tanpa id/kunci: $(head -c 300 "$WORK/upload.json")"
  exit 1
fi

OBJ=$(mc_run ls --recursive t/evidence)
printf '   objek MinIO: %s\n' "${OBJ:-<kosong>}"
if [[ "$OBJ" == *"$STORAGE_KEY"* ]]; then ok "objek muncul di MinIO"; else no "objek tidak terlihat di MinIO"; fi

R=$(curl -s -o "$WORK/get.json" -w '%{http_code}' -H "Cookie: __Host-mk_session=$TOKEN" \
  "$BASE/api/evidence/$EVIDENCE_ID")
code "GET /api/evidence/[id]" "$R" 200
SIGNED=$(jq -r '.url // empty' "$WORK/get.json")
KIND=$(jq -r '.kind // empty' "$WORK/get.json")
if [[ "$KIND" == file && -n "$SIGNED" ]]; then
  ok "URL tanda tangan (kind=file) diterbitkan"
else
  no "respons bukti tidak berisi URL bertanda tangan"
  exit 1
fi
# Host URL adalah nama kontainer MinIO; --resolve mengarahkannya ke loopback
# tanpa mengubah header Host yang ikut ditandatangani.
SIGNED_HOST=$(printf '%s' "$SIGNED" | sed -nE 's#^https?://([^/]+)/.*$#\1#p')
R=$(curl -s -o "$WORK/dl.txt" -w '%{http_code}' --resolve "$SIGNED_HOST:127.0.0.1" "$SIGNED")
code "GET URL tanda tangan (MinIO)" "$R" 200
if cmp -s "$WORK/bukti.txt" "$WORK/dl.txt"; then
  ok "isi unduhan identik dengan berkas asli"
else
  no "isi unduhan berbeda dari berkas asli"
fi

R=$(curl -s -o "$WORK/del.json" -w '%{http_code}' -H "Cookie: __Host-mk_session=$TOKEN" \
  -X DELETE "$BASE/api/evidence/$EVIDENCE_ID")
code "DELETE /api/evidence/[id]" "$R" 200
OBJ2=$(mc_run ls --recursive t/evidence)
if [[ -z "$OBJ2" ]]; then
  ok "objek hilang dari MinIO (bucket kosong)"
else
  no "objek masih ada: $OBJ2"
fi
R=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: __Host-mk_session=$TOKEN" \
  "$BASE/api/evidence/$EVIDENCE_ID")
code "GET ulang bukti terhapus" "$R" 404

# ------------------------------------------------------------------- 7. bersih
log "7. Bersihkan semua"
docker rm -f "$APP" "$MINIO" "$PG" >/dev/null
docker network rm "$NET" >/dev/null
docker rmi "$IMAGE" >/dev/null
for p in "$PG_PORT" "$MINIO_API" "$MINIO_CONSOLE" "$APP_PORT"; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then no "port $p masih terpakai"; else ok "port $p bebas kembali"; fi
done
ok "kontainer, jaringan, image, dan berkas rahasia $WORK dihapus (trap EXIT)"

printf '\n== RINGKASAN: %d lulus, %d gagal ==\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
