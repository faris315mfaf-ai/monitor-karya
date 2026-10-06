#!/usr/bin/env bash
# Rilis Monitor Karya di VPS aplikasi. Jalankan sebagai user admin dari
# /srv/apps/monitor-karya:
#   bash deploy/app-vps/deploy.sh [git-ref]      # bawaan: origin/main
#
# Urutan: ambil kode → bangun image bertag commit → migrasi DB → ganti kontainer
# → cek kesehatan. Bila cek gagal, kontainer dikembalikan ke image sebelumnya.
# Catatan: migrasi tidak bisa dibatalkan otomatis; karena itu backup DB
# diambil tepat sebelum migrasi bila ada migrasi baru.
set -euo pipefail
cd "$(dirname "$0")/../.."
REF="${1:-origin/main}"
COMPOSE=(docker compose -f deploy/app-vps/docker-compose.yml --env-file .env.production)

[[ -f .env.production ]] || { echo ".env.production belum ada."; exit 1; }
[[ "$(stat -c %a .env.production)" == "600" ]] || { echo "chmod 600 .env.production dulu."; exit 1; }

PREV_IMAGE="$(docker inspect --format '{{.Config.Image}}' monitor-karya-monitor-karya-1 2>/dev/null || true)"
PREV_TAG="${PREV_IMAGE##*:}"

git fetch --prune origin
git checkout --detach "$REF"
TAG="$(git rev-parse --short HEAD)"
export IMAGE_TAG="$TAG"
echo ">> rilis $TAG (sebelumnya: ${PREV_TAG:-tidak ada})"

"${COMPOSE[@]}" --profile migrate build --pull monitor-karya migrate

echo ">> status migrasi"
# `migrate status` keluar dengan kode bukan-nol bila ada migrasi tertunda, jadi tangkap teksnya dulu.
STATUS="$("${COMPOSE[@]}" --profile migrate run --rm migrate npx prisma migrate status 2>&1 || true)"
echo "$STATUS" | tail -5
if echo "$STATUS" | grep -qE "not yet been applied|failed"; then
  echo ">> ada migrasi baru: pastikan backup DB terbaru sudah ada (pg-backup di VPS database)."
  read -r -p "Lanjutkan migrasi? [ketik ya] " ok
  [[ "$ok" == "ya" ]] || { echo "Dibatalkan."; exit 1; }
  "${COMPOSE[@]}" --profile migrate run --rm migrate
fi

"${COMPOSE[@]}" up -d --no-deps monitor-karya

echo ">> menunggu sehat"
for i in $(seq 1 30); do
  st="$(docker inspect --format '{{.State.Health.Status}}' monitor-karya-monitor-karya-1 2>/dev/null || echo starting)"
  [[ "$st" == "healthy" ]] && { echo ">> sehat: $TAG"; docker image prune -f --filter "until=168h" >/dev/null; exit 0; }
  sleep 4
done

echo "!! tidak sehat dalam 2 menit."
if [[ -n "$PREV_TAG" ]]; then
  echo ">> kembali ke $PREV_TAG"
  IMAGE_TAG="$PREV_TAG" "${COMPOSE[@]}" up -d --no-deps monitor-karya
fi
"${COMPOSE[@]}" logs --tail 80 monitor-karya
exit 1
