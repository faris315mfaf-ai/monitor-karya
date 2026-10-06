#!/usr/bin/env bash
# Hanya untuk operator VPS; jangan jalankan pada worktree pengembangan.
# bash deploy/app-vps/deploy.sh [git-ref] (bawaan origin/main)
# Migrasi selalu perlu konfirmasi; rollback hanya mengembalikan image aplikasi.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
REF="${1:-origin/main}"
[[ "$REF" != -* ]] || { echo "Ref git tidak sah."; exit 1; }
COMPOSE=(docker compose -f deploy/app-vps/docker-compose.yml --env-file .env.production)
# Env layanan harus sama dengan env interpolasi, bukan override dari shell.
APP_ENV_FILE="$(pwd)/.env.production"
export APP_ENV_FILE
[[ -f .env.production && ! -L .env.production ]] || { echo ".env.production biasa belum ada."; exit 1; }
[[ "$(stat -c %a .env.production)" == "600" ]] || { echo "chmod 600 .env.production dulu."; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Pohon kerja belum bersih; rilis dibatalkan."; exit 1; }
# Cegah dua rilis berjalan bersamaan (Ubuntu: util-linux).
exec 9>"$(git rev-parse --git-path deploy.lock)"
flock -n 9 || { echo "Rilis lain sedang berjalan."; exit 1; }
PREV_ID="$("${COMPOSE[@]}" ps -aq monitor-karya)"
PREV_IMAGE=""
if [[ -n "$PREV_ID" ]]; then
  PREV_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$PREV_ID")"
  [[ "$PREV_IMAGE" == monitor-karya:* ]] || { echo "Image sebelumnya tidak dikenali."; exit 1; }
fi
PREV_TAG="${PREV_IMAGE##*:}"
git fetch --prune origin
git rev-parse --verify "${REF}^{commit}" >/dev/null
git checkout --detach "$REF"
TAG="$(git rev-parse HEAD)"
export IMAGE_TAG="$TAG"
echo ">> rilis $TAG (sebelumnya: ${PREV_TAG:-tidak ada})"
"${COMPOSE[@]}" --profile migrate build --pull monitor-karya migrate
# Status bukan sumber keputusan: Prisma juga mengembalikan nonzero untuk
# koneksi gagal atau migrasi tertunda. migrate deploy sendiri wajib berhasil.
if ! "${COMPOSE[@]}" --profile migrate run --rm migrate npx prisma migrate status; then
  echo ">> Status belum bersih; periksa diagnostik di atas sebelum melanjutkan."
fi
echo ">> Pastikan backup terbaru dan uji pemulihan tersedia. Rollback image tidak membatalkan migrasi."
read -r -p "Jalankan migrate deploy? [ketik ya] " ok
[[ "$ok" == "ya" ]] || { echo "Dibatalkan."; exit 1; }
"${COMPOSE[@]}" --profile migrate run --rm migrate
"${COMPOSE[@]}" up -d --no-deps --no-build --pull never monitor-karya
echo ">> menunggu sehat"
for ((attempt=1; attempt<=30; attempt++)); do
  ID="$("${COMPOSE[@]}" ps -aq monitor-karya)"
  st="starting"
  if [[ -n "$ID" ]]; then
    st="$(docker inspect --format '{{.State.Health.Status}}' "$ID" 2>/dev/null || echo starting)"
  fi
  [[ "$st" == "healthy" ]] && { echo ">> sehat: $TAG"; exit 0; }
  sleep 4
done
echo "Tidak sehat dalam 2 menit."
if [[ -n "$PREV_TAG" ]]; then
  echo ">> kembali ke $PREV_TAG (skema DB tetap versi baru)"
  IMAGE_TAG="$PREV_TAG" "${COMPOSE[@]}" up -d --no-deps --no-build --pull never monitor-karya
fi
"${COMPOSE[@]}" logs --tail 80 monitor-karya
exit 1
